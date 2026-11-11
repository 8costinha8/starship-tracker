/* Mission catch / deorbit alerts (generic for every flight; Flight 15 is the first target).
   Data lives in road.json mission_alerts. This script sends one alert (workflow_dispatch)
   and also exports the flight-checker dispatch hook (syncFromChecker).
   Does not change push-policy classify(), existing push types, or monitor cadence.
     node scripts/mission-alert.js          (CI: env ALERT_KEY, ALERT_OUTCOME, SEND_AT, DRY_RUN)
   Offline tests: node scripts/test-catch-alerts.js
*/
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const ps = require("./push-sync.js");

const ROOT = path.join(__dirname, "..");
const KEYS = ["booster_soon", "booster_result", "deorbit_soon", "ship_result"];
const SCHEDULED = new Set(["booster_soon", "deorbit_soon"]);
const RESULT_KEYS = new Set(["booster_result", "ship_result"]);
const DISPATCH_WINDOW_MS = 30 * 60 * 1000;
const BOOSTER_SOON_LATE_MS = 5 * 60 * 1000;
const MAX_SLEEP_MS = 6 * 60 * 60 * 1000;
const SCHEDULED_TEXT = {
  booster_soon: { title: "🎯 Booster catch in 5 min", body: "Watch live" },
  deorbit_soon: { title: "⏱️ Deorbit in 5 min", body: "Watch live" },
};
const RESULT_TEXT = {
  booster_result: {
    caught: { title: "✅ Booster caught!" },
    lost: { title: "❌ Booster lost" },
    splashed: { title: "🌊 Booster splashed down" },
  },
  ship_result: {
    caught: { title: "✅ Ship caught!" },
    lost: { title: "❌ Ship lost in reentry" },
    splashed: { title: "🌊 Ship splashed down" },
  },
};
const DEFAULT_TEMPLATE = [
  { key: "booster_soon", title: SCHEDULED_TEXT.booster_soon.title, body: SCHEDULED_TEXT.booster_soon.body },
  { key: "booster_result" },
  { key: "deorbit_soon", title: SCHEDULED_TEXT.deorbit_soon.title, body: SCHEDULED_TEXT.deorbit_soon.body },
  { key: "ship_result" },
];

function parseTPlus(s) {
  const m = String(s || "").trim().match(/^(\d+):([0-5]\d):([0-5]\d)$/);
  if (!m) return null;
  return ((Number(m[1]) * 3600) + (Number(m[2]) * 60) + Number(m[3])) * 1000;
}
function alertAt(liftoffIso, tPlus) {
  const lo = Date.parse(liftoffIso), ms = parseTPlus(tPlus);
  if (!Number.isFinite(lo) || ms == null) return null;
  return new Date(lo + ms);
}
function isManualLiftoff(alerts) {
  if (!alerts) return false;
  if (alerts.liftoff_source === "manual") return true;
  const ov = alerts.overrides || {};
  return !!(ov.liftoff_actual || ov.liftoff_source === "manual");
}
function resolveLiftoff(alerts) {
  if (!alerts) return null;
  const ov = alerts.overrides || {};
  const iso = ov.liftoff_actual || alerts.liftoff_actual;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
function templateOf(alerts) {
  const t = alerts && Array.isArray(alerts.template) && alerts.template.length ? alerts.template : DEFAULT_TEMPLATE;
  return t.map((e) => ({ ...e }));
}
function resolvedEvent(alerts, key) {
  const tmpl = templateOf(alerts).find((e) => e.key === key) || {};
  const ev = ((alerts && alerts.events) || []).find((e) => e.key === key) || {};
  const ov = (alerts && alerts.overrides && alerts.overrides[key]) || {};
  return { ...tmpl, ...ev, ...ov, key };
}
function isAborted(alerts, key) {
  if (!alerts || !key) return false;
  if (alerts.abort && alerts.abort[key] === true) return true;
  const ov = (alerts.overrides && alerts.overrides[key]) || {};
  return ov.skip === true || ov.abort === true;
}
function resultText(key, outcome, flight) {
  const table = RESULT_TEXT[key];
  if (!table || !outcome) return null;
  const hit = table[String(outcome).toLowerCase()];
  if (!hit || !hit.title) return null;
  const body = Number.isInteger(flight) ? `Flight ${flight}` : null;
  if (!body) return null;
  return { title: hit.title, body };
}
function copyFor(alerts, key, outcome, flight) {
  if (RESULT_KEYS.has(key)) return resultText(key, outcome, flight ?? flightOf(alerts));
  const ev = resolvedEvent(alerts, key);
  const fallback = SCHEDULED_TEXT[key] || {};
  const title = ev.title || fallback.title;
  const body = ev.body || fallback.body;
  return title && body ? { title, body } : null;
}
function flightOf(alerts, road) {
  const n = alerts && alerts.flight;
  if (Number.isInteger(n)) return n;
  if (road && Number.isInteger(road.flight)) return road.flight;
  return null;
}
function ownKey(flight, key) { return `${flight}|${key}`; }
function isTooLateBoosterSoon(liftoffIso, nowMs) {
  const lo = Date.parse(liftoffIso);
  return Number.isFinite(lo) && nowMs > lo + BOOSTER_SOON_LATE_MS;
}

// Clear flight-specific state; keep the event template (keys + default titles/bodies). Never guess a timeline.
function rollover(alerts, nextFlight) {
  const template = templateOf(alerts);
  return {
    flight: nextFlight,
    liftoff_actual: null,
    liftoff_source: null,
    events: template.map((e) => {
      const { key, title, body } = e;
      const out = { key };
      if (title) out.title = title;
      if (body) out.body = body;
      return out; // t_plus cleared
    }),
    abort: {},
    overrides: {},
    dispatched: {},
    template,
  };
}

function dueScheduled(alerts, nowMs, already = {}) {
  const liftoff = resolveLiftoff(alerts);
  if (!alerts || !liftoff) return [];
  const out = [];
  for (const key of KEYS) {
    if (!SCHEDULED.has(key)) continue;
    if (isAborted(alerts, key)) continue;
    if (already[key] || (alerts.dispatched && alerts.dispatched[key])) continue;
    const ev = resolvedEvent(alerts, key);
    if (!ev.t_plus) continue; // missing timeline ⇒ manual-only, never guess
    const at = alertAt(liftoff, ev.t_plus);
    if (!at) continue;
    const sendAt = at.getTime();
    if (sendAt - nowMs > DISPATCH_WINDOW_MS) continue; // not yet inside the 30 min window
    if (key === "booster_soon" && isTooLateBoosterSoon(liftoff, nowMs)) continue;
    if (key === "deorbit_soon" && nowMs > sendAt + 5 * 60 * 1000) continue; // warning already stale
    out.push({ key, t_plus: ev.t_plus, send_at: at.toISOString(), title: ev.title, body: ev.body });
  }
  return out;
}

function emptyAlerts(flight) {
  return rollover({ template: DEFAULT_TEMPLATE }, flight);
}

function priorOwn(history, flight, key) {
  const k = ownKey(flight, key);
  return (history || []).find((r) => r && !r.retracted && (r.alert_key === k || r.key === k) && (r.verdict === "sent" || r.verdict === "dry_run" || r.dedupe_only === true));
}

async function sendMissionAlert(opts = {}) {
  const dry_run = opts.dry_run !== false; // default ON: never a real send unless explicitly requested
  const now = opts.now || Date.now;
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = opts.log || console.log;
  const key = String(opts.key || "").trim();
  const outcome = opts.outcome ? String(opts.outcome).trim() : "";
  const send_at = opts.send_at || "";
  const logRows = opts.logRows || [];
  let road = opts.road;
  const readRoad = opts.readRoad || (opts.roadPath ? () => JSON.parse(fs.readFileSync(opts.roadPath, "utf8")) : null);

  const skip = (reason) => {
    const row = { title: "", body: "", verdict: `skipped: ${reason}`, at: new Date(now()).toISOString() };
    logRows.push(row);
    log(`mission-alert skipped: ${reason}`);
    return row;
  };

  try {
    if (!KEYS.includes(key)) return skip(`unknown key ${key || "(missing)"}`);

    if (send_at) {
      const t = Date.parse(send_at);
      if (!Number.isFinite(t)) return skip("send_at is not a real time");
      const wait = t - now();
      if (wait > MAX_SLEEP_MS) return skip("send_at is more than 6h away");
      if (wait > 0) await sleep(wait);
      if (opts.refreshRoad) road = await opts.refreshRoad();
      else if (readRoad) road = readRoad();
    }
    if (!road && readRoad) road = readRoad();
    if (!road) return skip("missing road data");

    const alerts = road.mission_alerts;
    if (!alerts) return skip("missing mission_alerts");
    const flight = flightOf(alerts, road);
    if (!Number.isInteger(flight)) return skip("missing flight number");
    if (isAborted(alerts, key)) return skip(`abort flag for ${key}`);

    if (SCHEDULED.has(key)) {
      const liftoff = resolveLiftoff(alerts);
      // Hand-send (no send_at): send immediately, even without liftoff_actual.
      // The >T+5 skip applies only when liftoff is known.
      if (!send_at) {
        if (liftoff && key === "booster_soon" && isTooLateBoosterSoon(liftoff, now())) return skip("booster_soon too late (>T+5)");
      } else {
        if (!liftoff) return skip("missing liftoff_actual");
        if (key === "booster_soon" && isTooLateBoosterSoon(liftoff, now())) return skip("booster_soon too late (>T+5)");
      }
    }
    const copy = copyFor(alerts, key, outcome, flight);
    if (!copy) return skip(RESULT_KEYS.has(key) ? "missing or unknown outcome" : "missing alert text");

    // Prefer the on-disk push log after any send_at refresh so dedupe sees what is on main.
    let prior = opts.history;
    if (opts.logPath) prior = ps.readLog(opts.logPath).pushes;
    const history = [...(prior || []), ...logRows];
    if (priorOwn(history, flight, key)) {
      const row = { title: copy.title, body: copy.body, verdict: `silent: duplicate ${ownKey(flight, key)}`, key: ownKey(flight, key), alert_key: ownKey(flight, key), at: new Date(now()).toISOString() };
      logRows.push(row);
      log(`(silent) mission-alert ${key} — already sent for flight ${flight}`);
      return row;
    }

    const at = new Date(now()).toISOString();
    // Visible body is "Flight N", which classify() would treat as a minor update. Decide on the
    // title (where the outcome words are) so result alerts still share vehicle|catch / vehicle_lost
    // with the classifier, without changing classify() itself.
    const pp = require("./push-policy.js");
    let resultCls = null;
    if (RESULT_KEYS.has(key)) {
      resultCls = pp.decide({ title: copy.title, body: copy.title, at }, history, { now: now(), vehicles: road.vehicles || [] });
      // Silence result keys only for a true duplicate / "already on the card".
      // Quiet-window or "minor" verdicts still push (a ship loss at T+22h is past the 3h
      // vehicle_lost window, so classify() would otherwise mute it).
      const reason = String(resultCls.reason || "");
      const resultDupe = /duplicate/.test(reason) || /already on the card/.test(reason);
      if (!resultCls.push && resultDupe) {
        const row = { title: copy.title, body: copy.body, verdict: `silent: ${resultCls.reason}`, key: resultCls.cls && resultCls.cls.key, alert_key: ownKey(flight, key), at };
        logRows.push(row);
        log(`(silent) mission-alert ${key} — ${resultCls.reason}`);
        return row;
      }
    }

    const n = ps.addFeedItem(road, { title: copy.title, body: copy.body, at, kind: "mission_alert", flight });
    n.kind = "mission_alert";

    const send = dry_run
      ? async () => { throw new Error("FCM blocked (dry_run)"); }
      : (opts.send || (async () => { throw new Error("no send function"); }));

    const row = await ps.sendPush(n, {
      road,
      send,
      save: dry_run ? false : (opts.save !== false),
      logRows,
      history,
      shadow: false,
      policy: false, // scheduled + results: own flight|key / pre-checked result key; body is not classifier text
      log,
      now,
    });
    row.alert_key = ownKey(flight, key);
    row.key = (resultCls && resultCls.cls && resultCls.cls.key) || row.key || ownKey(flight, key);
    if (dry_run && row.verdict === "not sent (test mode)") {
      row.verdict = "dry_run";
      row.dedupe_only = true; // blocks a later classifier catch / rerun; is not a real push
    }
    if (opts.logPath && opts.saveLog) ps.writeLog(opts.logPath, logRows.filter((r) => !r._written));
    return row;
  } catch (e) {
    const row = { title: "", body: "", verdict: `skipped: error ${e.message}`, at: new Date(now()).toISOString() };
    logRows.push(row);
    log(`mission-alert: ${e.message}`);
    return row;
  }
}

// Flight-checker hook: set LL2 liftoff (manual wins), rollover when the flight advances,
// and dispatch mission-alert.yml once for each scheduled event due within 30 min.
async function syncFromChecker(opts = {}) {
  const nowMs = typeof opts.now === "function" ? opts.now() : (opts.now || Date.now());
  const current = opts.current || {};
  const prev = opts.prev || {};
  let road = opts.road;
  if (!road && opts.roadPath) {
    try { road = JSON.parse(fs.readFileSync(opts.roadPath, "utf8")); } catch { return { dispatched: [], changed: false, reason: "no road.json" }; }
  }
  if (!road) return { dispatched: [], changed: false, reason: "no road" };

  let changed = false;
  let alerts = road.mission_alerts;
  if (!alerts && Number.isInteger(current.n)) {
    // no data yet: start a blank (manual-only) record for the current flight — no guessed timeline
    road.mission_alerts = alerts = emptyAlerts(current.n);
    changed = true;
  }
  if (alerts && Number.isInteger(current.n) && Number.isInteger(alerts.flight) && current.n > alerts.flight) {
    road.mission_alerts = alerts = rollover(alerts, current.n);
    changed = true;
  }
  if (!alerts) return { dispatched: [], changed: false };

  if (current.status === "inflight" && current.date && !isManualLiftoff(alerts)) {
    const iso = new Date(Date.parse(current.date)).toISOString();
    if (Number.isFinite(Date.parse(current.date)) && alerts.liftoff_actual !== iso) {
      alerts.liftoff_actual = iso;
      alerts.liftoff_source = "ll2";
      changed = true;
    }
  }

  const already = { ...(prev.mission_alerts_dispatched || {}), ...(current.mission_alerts_dispatched || {}), ...(alerts.dispatched || {}) };
  const due = dueScheduled(alerts, nowMs, already);
  const dispatched = [];
  for (const ev of due) {
    if (typeof opts.dispatch === "function") {
      await opts.dispatch({ key: ev.key, send_at: ev.send_at });
    }
    alerts.dispatched = alerts.dispatched || {};
    alerts.dispatched[ev.key] = ev.send_at;
    already[ev.key] = ev.send_at;
    dispatched.push(ev.key);
    changed = true;
  }
  if (current) current.mission_alerts_dispatched = already;
  if (changed) {
    if (typeof opts.writeRoad === "function") opts.writeRoad(road);
    else if (opts.roadPath && opts.writeRoad !== false) fs.writeFileSync(opts.roadPath, JSON.stringify(road, null, 2) + "\n");
  }
  return { dispatched, changed, alerts, due };
}

async function dispatchMissionAlert({ key, send_at, outcome, dry_run }, { repo, token, fetchFn } = {}) {
  const r = repo || process.env.GITHUB_REPOSITORY || "8costinha8/starship-tracker";
  const tok = token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  if (!tok) { console.log("mission-alert dispatch skipped: no GITHUB_TOKEN"); return { ok: false, reason: "no token" }; }
  const f = fetchFn || globalThis.fetch;
  const body = { ref: "main", inputs: { key: String(key), ...(send_at ? { send_at: String(send_at) } : {}), ...(outcome ? { outcome: String(outcome) } : {}), dry_run: dry_run ? "true" : "false" } };
  const res = await f(`https://api.github.com/repos/${r}/actions/workflows/mission-alert.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ok = res && (res.status === 204 || res.status === 200);
  console.log(`mission-alert dispatch ${key}${send_at ? " @" + send_at : ""} → HTTP ${res && res.status}`);
  return { ok, status: res && res.status };
}

function refreshRoadFromMain(root = ROOT) {
  execSync("git fetch origin main", { cwd: root, stdio: "pipe" });
  execSync("git checkout origin/main -- road.json notifications.json", { cwd: root, stdio: "pipe" });
  return JSON.parse(fs.readFileSync(path.join(root, "road.json"), "utf8"));
}

async function main() {
  const key = String(process.env.ALERT_KEY || process.argv[2] || "").trim();
  const outcome = String(process.env.ALERT_OUTCOME || process.argv[3] || "").trim();
  const send_at = String(process.env.SEND_AT || "").trim();
  const dry_run = process.env.DRY_RUN === "true" || process.env.DRY_RUN === "1";
  const roadPath = path.join(ROOT, "road.json");
  const logPath = path.join(ROOT, "notifications.json");
  let send;
  if (!dry_run) send = require("./check-road.js").firebaseDeps().push;
  const row = await sendMissionAlert({
    key, outcome, send_at, dry_run,
    roadPath, logPath, save: !dry_run, saveLog: !dry_run,
    send, log: console.log,
    refreshRoad: send_at ? () => refreshRoadFromMain(ROOT) : undefined,
    history: ps.readLog(logPath).pushes,
  });
  if (!dry_run && (row.verdict === "sent") && process.env.CI) {
    const run = (c) => execSync(c, { cwd: ROOT, stdio: "pipe" });
    run('git config user.name "Starship Tracker Bot"');
    run('git config user.email "actions@github.com"');
    run("git add road.json notifications.json");
    try { run(`git commit -m "Auto: mission alert — ${key} (${row.verdict})"`); } catch {}
    try { run("git pull --rebase --quiet"); run("git push"); } catch (e) { console.log("mission-alert commit/push:", e.message); }
  }
  console.log(`mission-alert ${key}: ${row.verdict}`);
  if (!dry_run && row.verdict !== "sent" && !/^silent:/.test(row.verdict)) process.exit(1);
}

module.exports = {
  KEYS, SCHEDULED, DEFAULT_TEMPLATE, SCHEDULED_TEXT, RESULT_TEXT,
  parseTPlus, alertAt, resolveLiftoff, isManualLiftoff, resolvedEvent, isAborted,
  resultText, copyFor, rollover, dueScheduled, emptyAlerts, ownKey,
  sendMissionAlert, syncFromChecker, dispatchMissionAlert, refreshRoadFromMain,
};

if (require.main === module) {
  main().catch((e) => { console.error("mission-alert failed:", e.message); process.exit(1); });
}
