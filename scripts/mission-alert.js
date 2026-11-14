/* Mission catch / deorbit alerts (generic for every flight; Flight 15 is the first target).
   Data lives in road.json mission_alerts. This script sends one alert (workflow_dispatch)
   and also exports the flight-checker dispatch hook (syncFromChecker).
   Does not change push-policy classify(), existing push types, or monitor cadence.
     node scripts/mission-alert.js          (CI: env ALERT_KEY, ALERT_OUTCOME, SEND_AT, DRY_RUN)
   Offline tests: node scripts/test-catch-alerts.js, node scripts/test-shipalerts.js
   Ship alerts (2026-11-14): modes auto / watch / now, a one-send claim tag, a confirming
   source for result keys, and a dry-run payload preview. See runFromEnv().
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
const TICK_MS = 30 * 1000;              // watch: re-read road.json from main at least every 30 s
const WATCH_AHEAD_MS = 100 * 60 * 1000; // watch without send_at: only stay up if the target is within 100 min
const WATCH_MAX_MS = 85 * 60 * 1000;    // watch: give up after 85 min (job timeout is 90)
const DEORBIT_STALE_MS = 5 * 60 * 1000;
const OUTCOME_ALIAS = { splashdown: "splashed", splash: "splashed", catch: "caught" };
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
// Send time from the live timeline (liftoff + t_plus, overrides win). null if unknown.
function timelineAt(alerts, key) {
  const liftoff = resolveLiftoff(alerts);
  if (!liftoff) return null;
  const at = alertAt(liftoff, resolvedEvent(alerts, key).t_plus);
  return at ? at.getTime() : null;
}
function normOutcome(o) {
  const v = String(o || "").trim().toLowerCase();
  return OUTCOME_ALIAS[v] || v;
}
// A result push needs a Tier 1 source (sources.js): a Tier 1 X account (not predictOnly) or a Tier 1 site.
function confirmSource(url) {
  const u = String(url || "").trim();
  if (!u) return { ok: false, reason: "no source_url" };
  let p;
  try { p = new URL(u); } catch { return { ok: false, reason: "source_url is not a URL" }; }
  if (p.protocol !== "https:") return { ok: false, reason: "source_url must be https" };
  const host = p.hostname.toLowerCase().replace(/^www\./, "");
  const SRC = require("./sources.js");
  if (host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com") {
    const m = p.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)/);
    if (!m) return { ok: false, reason: "X link is not a post" };
    const a = SRC.byHandle(m[1]);
    if (!a || a.tier !== 1 || a.predictOnly) return { ok: false, reason: `@${m[1]} is not a Tier 1 source` };
    return { ok: true, who: `@${a.handle}` };
  }
  const site = (SRC.TIER1_SITES || []).find((d) => host === d || host.endsWith("." + d));
  if (site) return { ok: true, who: site };
  return { ok: false, reason: `${host} is not a Tier 1 source` };
}
function normMode(mode, send_at) {
  const m = String(mode || "auto").trim().toLowerCase();
  if (m === "now" || m === "watch") return m;
  return send_at ? "watch" : "now"; // auto: legacy behaviour (send_at ⇒ wait for it, else send now)
}

// Wait until a scheduled alert is due. Follows the live timeline (re-read every tick), so an
// earlier (or later) t_plus / liftoff override moves the send; send_at is the fallback when the
// timeline is unknown. Stops early when another run has already sent it.
async function waitUntilDue({ key, send_at, road, refresh, now, sleep, sentElsewhere, tickMs = TICK_MS, maxMs = WATCH_MAX_MS, aheadMs = WATCH_AHEAD_MS, log = () => {} }) {
  const fixed = send_at ? Date.parse(send_at) : null;
  if (send_at && !Number.isFinite(fixed)) return { skip: "send_at is not a real time" };
  let t = now();
  const start = t;
  if (fixed != null && fixed - t > MAX_SLEEP_MS) return { skip: "send_at is more than 6h away" };
  let fresh = false;
  if (!road && refresh) { road = await refresh(); fresh = true; }
  let lastTarget = null;
  let kept = null, keptNote = false; // this flight's alerts, kept if road.json rolls over mid-watch
  for (;;) {
    let alerts = road && road.mission_alerts;
    if (alerts && Number.isInteger(alerts.flight) && resolveLiftoff(alerts) && (!kept || alerts.flight === kept.flight)) kept = alerts;
    else if (kept && road && (!alerts || alerts.flight !== kept.flight)) {
      if (!keptNote) { log(`mission-alert watch ${key}: road.json rolled over mid-watch — keeping Flight ${kept.flight}'s timeline`); keptNote = true; }
      road = { ...road, mission_alerts: kept };
      alerts = kept;
    }
    if (alerts && isAborted(alerts, key)) return { road };
    if (sentElsewhere && road && await sentElsewhere(road)) return { road, done: true };
    const tl = alerts ? timelineAt(alerts, key) : null;
    const target = tl != null ? tl : fixed;
    if (target == null) return { skip: "not due: no liftoff_actual / t_plus for " + key, notDue: true };
    if (target !== lastTarget) { log(`mission-alert watch ${key}: target ${new Date(target).toISOString()}${tl != null ? " (timeline)" : " (send_at)"}`); lastTarget = target; }
    if (fixed == null && target - t > aheadMs) return { skip: `not due yet (${new Date(target).toISOString()})`, notDue: true };
    if (key === "deorbit_soon" && t > target + DEORBIT_STALE_MS) return { skip: "deorbit_soon warning stale (>5 min after its time)" };
    if (t >= target) {
      if (!fresh && refresh) { road = await refresh(); fresh = true; continue; } // re-check on fresh data before firing
      return { road, target };
    }
    if (t - start > maxMs) return { skip: "watch window ended before the alert was due" };
    const ms = Math.max(1, Math.min(tickMs, target - t));
    await sleep(ms);
    t = Math.max(now(), t + ms); // trust the sleep length if the clock is stubbed
    if (refresh) { road = await refresh(); fresh = true; }
  }
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
  const outcome = opts.outcome ? normOutcome(opts.outcome) : "";
  const send_at = opts.send_at || "";
  const mode = normMode(opts.mode, send_at);
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

    let source = null;
    if (RESULT_KEYS.has(key) && opts.requireSource) {
      source = confirmSource(opts.source_url);
      if (!source.ok) return skip(`result needs a confirming source (${source.reason})`);
    }

    let watched = false;
    if (mode === "watch") {
      const refresh = opts.refreshRoad ? () => opts.refreshRoad() : (readRoad ? async () => readRoad() : null);
      const sentElsewhere = async (rd) => {
        const fl = flightOf(rd.mission_alerts, rd);
        if (!Number.isInteger(fl)) return false;
        if (opts.claimExists && await opts.claimExists(fl, key)) return true;
        if (opts.logPath && priorOwn(ps.readLog(opts.logPath).pushes, fl, key)) return true;
        return false;
      };
      const w = await waitUntilDue({ key, send_at, road, refresh, now, sleep, sentElsewhere, log, tickMs: opts.tick_ms, maxMs: opts.watch_max_ms, aheadMs: opts.watch_ahead_ms });
      if (w.skip) { const r = skip(w.skip); if (w.notDue) r.not_due = true; return r; }
      road = w.road;
      watched = true;
      if (w.done) {
        const fl = flightOf(road.mission_alerts, road);
        const row = { title: "", body: "", verdict: `silent: duplicate ${ownKey(fl, key)} (sent by another run)`, alert_key: ownKey(fl, key), at: new Date(now()).toISOString() };
        logRows.push(row);
        log(`(silent) mission-alert ${key} — already sent by another run`);
        return row;
      }
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
      if (!watched) {
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

    // One send across every run (checker dispatch, watcher, manual override): claim first.
    if (!dry_run && opts.claim) {
      const c = await opts.claim(flight, key);
      if (c && c.ok === false) {
        const row = { title: copy.title, body: copy.body, verdict: `silent: duplicate ${ownKey(flight, key)} (claimed by another run)`, key: ownKey(flight, key), alert_key: ownKey(flight, key), at };
        logRows.push(row);
        log(`(silent) mission-alert ${key} — claim ${c.tag || ""} already taken`);
        return row;
      }
    } else if (dry_run && opts.claimExists) {
      try { log(`dry_run: claim for ${ownKey(flight, key)} ${await opts.claimExists(flight, key) ? "ALREADY TAKEN (a real run would be silent)" : "is free (would be taken)"}`); } catch (e) { log(`dry_run: claim check failed: ${e.message}`); }
    }

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
      if (opts.preview) { try { await opts.preview(n); } catch (e) { log(`dry_run preview failed: ${e.message}`); } }
    }
    if (source && source.ok) { row.source_url = String(opts.source_url); row.source = source.who; }
    if (opts.logPath && opts.saveLog) ps.writeLog(opts.logPath, logRows.filter((r) => !r._written));
    return row;
  } catch (e) {
    const row = { title: "", body: "", verdict: `skipped: error ${e.message}`, at: new Date(now()).toISOString() };
    logRows.push(row);
    log(`mission-alert: ${e.message}`);
    return row;
  }
}

const ROLLOVER_HOLD_MS = 30 * 60 * 60 * 1000; // a Starship mission is over well within 30 h of liftoff
function holdRollover(alerts, nowMs) {
  const liftoff = resolveLiftoff(alerts);
  if (!liftoff) return null;
  if (nowMs < Date.parse(liftoff) + ROLLOVER_HOLD_MS) return `Flight ${alerts.flight} lifted off under 30 h ago`;
  return null;
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
    // LL2 can drop a flight from "upcoming" (Success) while its ship is still flying. Keep this
    // flight's timeline until its alerts are done, so deorbit / result alerts still fire for it.
    const hold = holdRollover(alerts, nowMs);
    if (hold) console.log(`mission-alert: rollover to Flight ${current.n} held — ${hold}`);
    else {
      road.mission_alerts = alerts = rollover(alerts, current.n);
      changed = true;
    }
  }
  if (!alerts) return { dispatched: [], changed: false };

  if (current.status === "inflight" && current.date && !isManualLiftoff(alerts) && (!Number.isInteger(current.n) || !Number.isInteger(alerts.flight) || current.n === alerts.flight)) {
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

// One-send claim: an annotated git tag per flight|key on origin. Each run makes its own tag object
// (unique message), so a second push of the same tag name is rejected ("already exists") by the
// server even when both runs are on the same commit. Only one run (checker dispatch, watcher or
// manual override) can take it; after pushing we confirm origin holds OUR object.
function claimTag(flight, key) { return `alert-claim-${flight}-${key}`; }
function gitClaims(root = ROOT, run = (c) => execSync(c, { cwd: root, stdio: "pipe" }).toString()) {
  const remoteSha = (tag) => (run(`git ls-remote --tags origin refs/tags/${tag}`).trim().split(/\s+/)[0] || "");
  const exists = async (flight, key) => remoteSha(claimTag(flight, key)).length > 0;
  const claim = async (flight, key) => {
    const tag = claimTag(flight, key);
    const msg = `claim ${flight}|${key} run ${process.env.GITHUB_RUN_ID || "local"} ${new Date().toISOString()} ${Math.random().toString(36).slice(2)}`;
    for (let i = 0; i < 3; i++) {
      try {
        run(`git -c user.name="Starship Tracker Bot" -c user.email="actions@github.com" tag -f -a -m ${JSON.stringify(msg)} ${tag} HEAD`);
        run(`git push origin refs/tags/${tag}`);
        const mine = run(`git rev-parse refs/tags/${tag}`).trim();
        if (remoteSha(tag) === mine) return { ok: true, tag };
        return { ok: false, tag };
      } catch (e) {
        try { if (remoteSha(tag)) return { ok: false, tag }; } catch {}
      }
    }
    console.log(`mission-alert: could not create claim ${tag} (sending anyway; push log dedupe still applies)`);
    return { ok: true, tag, unclaimed: true };
  };
  return { exists, claim };
}

// Dry run: the exact FCM message that would go out, with the token list replaced by a count.
function previewFor({ countTokens, log = console.log } = {}) {
  return async (n) => {
    const { fcmMessage } = require("./check-road.js");
    let count = null;
    if (countTokens) { try { count = await countTokens(); } catch (e) { log(`dry_run: token count unavailable (${e.message})`); } }
    const msg = fcmMessage([], n);
    msg.tokens = `[${count == null ? "?" : count} token(s), not printed]`;
    log(`dry_run: would send ${JSON.stringify(msg)}`);
    log(`dry_run: token count ${count == null ? "unknown" : count} — 0 FCM sends made`);
  };
}
// Read-only subscriber count (never calls messaging()).
async function firestoreTokenCount() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new Error("no FIREBASE_SERVICE_ACCOUNT");
  const admin = require("firebase-admin");
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const subs = await admin.firestore().collection("subscribers").get();
  return subs.size != null ? subs.size : subs.docs.length;
}

// CI entry (env from mission-alert.yml). deps are injectable for offline tests.
async function runFromEnv(env = process.env, deps = {}) {
  const key = String(env.ALERT_KEY || "").trim();
  const outcome = String(env.ALERT_OUTCOME || "").trim();
  const send_at = String(env.SEND_AT || "").trim();
  const mode = String(env.ALERT_MODE || "auto").trim();
  const source_url = String(env.SOURCE_URL || "").trim();
  const dry_run = env.DRY_RUN === "true" || env.DRY_RUN === "1";
  const root = deps.root || ROOT;
  const log = deps.log || console.log;
  const roadPath = path.join(root, "road.json");
  const logPath = path.join(root, "notifications.json");
  const watching = normMode(mode, send_at) === "watch";
  const claims = deps.claims || (env.CI ? gitClaims(root) : null);
  let send = deps.send;
  if (!dry_run && !send) send = require("./check-road.js").firebaseDeps().push;
  log(`mission-alert ${key} mode=${normMode(mode, send_at)}${send_at ? " send_at=" + send_at : ""}${outcome ? " outcome=" + normOutcome(outcome) : ""}${dry_run ? " DRY RUN" : ""}`);
  if (SCHEDULED.has(key)) { // always log the computed due time (from this checkout's road.json)
    try {
      const al = JSON.parse(fs.readFileSync(roadPath, "utf8")).mission_alerts;
      const due = al ? timelineAt(al, key) : null;
      const uk = (ms) => new Date(ms).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
      log(due ? `mission-alert ${key}: Flight ${al.flight} due ${new Date(due).toISOString()} (${uk(due)} UK) = liftoff ${resolveLiftoff(al)} + T+${resolvedEvent(al, key).t_plus}` : `mission-alert ${key}: no timeline in road.json`);
    } catch (e) { log(`mission-alert ${key}: due time unavailable (${e.message})`); }
  }
  const row = await sendMissionAlert({
    key, outcome, send_at, mode, source_url, dry_run, requireSource: true,
    roadPath, logPath, save: !dry_run, saveLog: !dry_run,
    send, log, now: deps.now, sleep: deps.sleep, tick_ms: deps.tick_ms,
    refreshRoad: deps.refreshRoad || (watching && env.CI ? () => refreshRoadFromMain(root) : undefined),
    claim: claims && claims.claim, claimExists: claims && claims.exists,
    preview: dry_run ? (deps.preview || previewFor({ countTokens: deps.countTokens || (env.FIREBASE_SERVICE_ACCOUNT ? firestoreTokenCount : null), log })) : undefined,
    history: ps.readLog(logPath).pushes,
  });
  if (!dry_run && (row.verdict === "sent") && env.CI) {
    const run = deps.git || ((c) => execSync(c, { cwd: root, stdio: "pipe" }));
    run('git config user.name "Starship Tracker Bot"');
    run('git config user.email "actions@github.com"');
    // watch mode re-read road.json / notifications.json from origin/main: commit on top of origin/main
    // (index only; working files kept) so the commit holds just this alert, not a revert of newer main.
    if (watching) { try { run("git reset -q origin/main"); } catch (e) { log("mission-alert reset:", e.message); } }
    run("git add road.json notifications.json");
    try { run(`git commit -m "Auto: mission alert — ${key} (${row.verdict})"`); } catch {}
    if (watching) { try { run("git checkout -q -- ."); } catch {} } // drop the stale pre-reset copies of other files
    try { run("git pull --rebase --quiet"); run("git push"); } catch (e) { log("mission-alert commit/push:", e.message); }
  }
  log(`mission-alert ${key}: ${row.verdict}`);
  const ok = row.verdict === "sent" || row.verdict === "dry_run" || /^silent:/.test(row.verdict) || row.not_due === true;
  return { row, exitCode: ok ? 0 : 1 };
}

async function main() {
  const env = { ...process.env };
  if (!env.ALERT_KEY && process.argv[2]) env.ALERT_KEY = process.argv[2];
  if (!env.ALERT_OUTCOME && process.argv[3]) env.ALERT_OUTCOME = process.argv[3];
  const { exitCode } = await runFromEnv(env);
  if (exitCode) process.exit(exitCode);
}

module.exports = {
  KEYS, SCHEDULED, DEFAULT_TEMPLATE, SCHEDULED_TEXT, RESULT_TEXT,
  parseTPlus, alertAt, resolveLiftoff, isManualLiftoff, resolvedEvent, isAborted,
  resultText, copyFor, rollover, dueScheduled, emptyAlerts, ownKey,
  sendMissionAlert, syncFromChecker, dispatchMissionAlert, refreshRoadFromMain,
  timelineAt, normOutcome, confirmSource, normMode, waitUntilDue, claimTag, gitClaims, previewFor, runFromEnv,
};

if (require.main === module) {
  main().catch((e) => { console.error("mission-alert failed:", e.message); process.exit(1); });
}
