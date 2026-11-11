/* Offline test of catch / deorbit mission alerts (scripts/mission-alert.js).
   FCM, fetch and git are stubbed; every send uses dry_run. Zero real pushes.
   Never loads firebase-admin. node scripts/test-catch-alerts.js
*/
"use strict";
process.env.PUSH_SHADOW = "0";
process.env.DRY_RUN = "true";
for (const k of Object.keys(process.env)) {
  if (/XAI|ANTHROPIC|X_BEARER|FIREBASE|GITHUB_TOKEN|GH_TOKEN|API_KEY|SECRET/i.test(k)) delete process.env[k];
}

const Module = require("module");
const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const blocked = (globalThis.__BLOCKED = []);
const fcm = (globalThis.__FCM = []);
const origFetch = globalThis.fetch;
globalThis.fetch = async (u) => { blocked.push(String(u && u.url || u)); throw new Error("NETWORK BLOCKED (catch-alerts test): " + String(u).slice(0, 120)); };
const origLoad = Module._load;
Module._load = function (req, ...a) {
  if (req === "firebase-admin") {
    fcm.push("initializeApp");
    throw new Error("firebase-admin must not load in test-catch-alerts.js");
  }
  return origLoad.call(this, req, ...a);
};
const ex = cp.execSync;
cp.execSync = function (cmd, ...r) {
  if (/\bgit\s+(push|pull|commit|add|config|fetch|remote|checkout)\b/.test(String(cmd))) {
    (globalThis.__GITBLOCK = globalThis.__GITBLOCK || []).push(String(cmd));
    throw new Error("git write blocked (catch-alerts test): " + cmd);
  }
  return ex.call(this, cmd, ...r);
};

const MA = require("./mission-alert.js");
const ps = require("./push-sync.js");
const policy = require("./push-policy.js");

let failed = 0;
const check = (ok, m) => { console.log(`${ok ? "✅" : "❌"} ${m}`); if (!ok) failed++; };

const LIFTOFF = "2026-11-13T22:45:00.000Z"; // 22:45 UK, Flight 15 NET
const T0 = Date.parse(LIFTOFF);
const nowFn = (ms) => () => ms;
const noSleep = async () => {};
const fcmSend = async () => { fcm.push("send"); throw new Error("FCM send must not be called"); };

function baseRoad(flight = 15, extra = {}) {
  const alerts = extra.mission_alerts || {
    flight,
    liftoff_actual: LIFTOFF,
    liftoff_source: "manual",
    events: [
      { key: "booster_soon", t_plus: "00:01:35", title: "🎯 Booster catch in 5 min", body: "Watch live" },
      { key: "booster_result" },
      { key: "deorbit_soon", t_plus: "21:30:57", title: "⏱️ Deorbit in 5 min", body: "Watch live" },
      { key: "ship_result" },
    ],
    abort: {},
    overrides: {},
    dispatched: {},
    template: MA.DEFAULT_TEMPLATE.map((e) => ({ ...e })),
  };
  return {
    flight,
    vehicles: flight === 15 ? ["B22", "S42"] : ["B23", "S43"],
    categories: [],
    feed_items: [],
    mission_updates: {},
    mission_alerts: alerts,
  };
}

async function send(road, opts) {
  const rows = opts.logRows || [];
  const history = opts.history || [];
  const row = await MA.sendMissionAlert({
    dry_run: true,
    save: false,
    send: fcmSend,
    sleep: opts.sleep || noSleep,
    now: opts.now || nowFn(T0 + 95000),
    log: () => {},
    road,
    key: opts.key,
    outcome: opts.outcome,
    send_at: opts.send_at,
    refreshRoad: opts.refreshRoad,
    history,
    logRows: rows,
  });
  return { row, rows };
}

const liftoffHist = (at = LIFTOFF) => [{
  title: "🚀 Liftoff!", body: "Flight 15 is in the air · Watch now",
  at, sent_at: at, verdict: "sent", key: "flight|launch|13 Nov",
}];

(async () => {
  // ── 1. each scheduled + result alert dry_runs once; reruns send 0 ──
  {
    const counts = {};
    for (const [key, outcome, t] of [
      ["booster_soon", "", T0 + 95000],
      ["deorbit_soon", "", T0 + parseT("21:30:57")],
      ["booster_result", "caught", T0 + 7 * 60000],
      ["ship_result", "caught", T0 + 23 * 3600000],
    ]) {
      const road = baseRoad();
      const history = key.endsWith("_result") ? liftoffHist() : [];
      const a = await send(road, { key, outcome, now: nowFn(t), history });
      const b = await send(road, { key, outcome, now: nowFn(t), history: [...history, ...a.rows] });
      counts[key] = { first: a.row.verdict, second: b.row.verdict, fcm: fcm.length };
      check(a.row.verdict === "dry_run", `${key}: first call dry_run (${a.row.verdict})`);
      check(a.row.title && a.row.body, `${key}: has title/body "${a.row.title}" / "${a.row.body}"`);
      check(b.row.verdict !== "dry_run" && b.row.verdict !== "sent" && !fcm.includes("send"), `${key}: rerun sends 0 (${b.row.verdict})`);
    }
  }

  // ── 2. each outcome text ──
  {
    const want = {
      booster_result: {
        caught: "✅ Booster caught!",
        lost: "❌ Booster lost",
        splashed: "🌊 Booster splashed down",
      },
      ship_result: {
        caught: "✅ Ship caught!",
        lost: "❌ Ship lost in reentry",
        splashed: "🌊 Ship splashed down",
      },
    };
    for (const key of Object.keys(want)) {
      for (const outcome of Object.keys(want[key])) {
        const road = baseRoad();
        const { row } = await send(road, { key, outcome, now: nowFn(T0 + 10 * 60000), history: liftoffHist() });
        const text = want[key][outcome];
        check(row.verdict === "dry_run" && row.title === text && row.body === text, `${key}/${outcome} text is "${text}" (got "${row.title}" / ${row.verdict})`);
      }
    }
  }

  // ── 3. abort flag cancels a scheduled send (required) ──
  {
    const road = baseRoad();
    road.mission_alerts.abort = { booster_soon: true };
    const { row } = await send(road, { key: "booster_soon", now: nowFn(T0 + 95000) });
    check(/^skipped: abort flag/.test(row.verdict), `abort flag cancels booster_soon (${row.verdict})`);
    check(!fcm.includes("send"), "abort path did not call FCM");
  }
  {
    // abort set while waiting for send_at: re-read after sleep, then skip
    const road = baseRoad();
    let slept = 0;
    const later = JSON.parse(JSON.stringify(road));
    later.mission_alerts.abort = { deorbit_soon: true };
    const { row } = await send(road, {
      key: "deorbit_soon",
      send_at: new Date(T0 + parseT("21:30:57")).toISOString(),
      now: nowFn(T0 + parseT("21:30:57") - 60000),
      sleep: async (ms) => { slept = ms; },
      refreshRoad: async () => later,
    });
    check(slept > 0 && slept <= 60 * 1000 + 5, `abort-after-wait slept until send_at (${slept}ms)`);
    check(/^skipped: abort flag/.test(row.verdict), `abort during wait cancels deorbit_soon (${row.verdict})`);
  }

  // ── 4. liftoff 40 min late shifts both scheduled alerts ──
  {
    const planned = LIFTOFF;
    const actual = new Date(T0 + 40 * 60000).toISOString();
    const a = baseRoad();
    a.mission_alerts.liftoff_actual = planned;
    const b = baseRoad();
    b.mission_alerts.liftoff_actual = actual;
    const boostA = MA.alertAt(planned, "00:01:35");
    const boostB = MA.alertAt(actual, "00:01:35");
    const deorA = MA.alertAt(planned, "21:30:57");
    const deorB = MA.alertAt(actual, "21:30:57");
    check(boostB - boostA === 40 * 60000 && deorB - deorA === 40 * 60000, `late liftoff shifts booster_soon and deorbit_soon by 40 min (${(boostB - boostA) / 60000} / ${(deorB - deorA) / 60000})`);
    const dueEarly = MA.dueScheduled(b.mission_alerts, T0 + 95000, {}); // original send time, now late
    check(!dueEarly.some((e) => e.key === "booster_soon"), "at the original T+1:35, late liftoff means booster_soon is not yet due");
    const dueShifted = MA.dueScheduled(b.mission_alerts, T0 + 40 * 60000 + 95000, {});
    check(dueShifted.some((e) => e.key === "booster_soon") && dueShifted.find((e) => e.key === "booster_soon").send_at === boostB.toISOString(), "at shifted T+1:35, booster_soon is due at the new time");
  }

  // ── 5. duplicate dispatch ⇒ 1 push ──
  {
    const road = baseRoad();
    const dispatches = [];
    const current = { n: 15, status: "inflight", date: LIFTOFF };
    const r1 = await MA.syncFromChecker({ road, current, now: T0 + 95000, dispatch: async (p) => dispatches.push(p), writeRoad: () => {} });
    const r2 = await MA.syncFromChecker({ road, current, prev: current, now: T0 + 95000, dispatch: async (p) => dispatches.push(p), writeRoad: () => {} });
    check(r1.dispatched.includes("booster_soon") && dispatches.length === 1, `first sync dispatches booster_soon once (${r1.dispatched.join(",")} / ${dispatches.length})`);
    check(r2.dispatched.length === 0 && dispatches.length === 1, `duplicate dispatch is idempotent (${r2.dispatched.join(",") || "none"} / ${dispatches.length})`);
    // two send attempts still 1 dry_run
    const history = [];
    const a = await send(road, { key: "booster_soon", now: nowFn(T0 + 95000), history });
    const b = await send(road, { key: "booster_soon", now: nowFn(T0 + 95000), history: [...history, ...a.rows] });
    check(a.row.verdict === "dry_run" && /^silent: duplicate/.test(b.row.verdict), "duplicate send of the same key → 1 dry_run");
  }

  // ── 6. manual result + classifier catch line ⇒ 1 push ──
  {
    const road = baseRoad();
    const history = liftoffHist();
    const { row, rows } = await send(road, { key: "booster_result", outcome: "caught", now: nowFn(T0 + 7 * 60000), history });
    check(row.verdict === "dry_run", `manual booster caught dry_run (${row.verdict})`);
    const catchPush = ps.addFeedItem(road, { title: "Booster caught", body: "Booster 22 was caught at the tower.", at: new Date(T0 + 8 * 60000).toISOString(), kind: "flight", flight: 15 });
    const logRows = [];
    const cls = await ps.sendPush(catchPush, {
      road, send: fcmSend, save: false, shadow: false, policy: true,
      history: [...history, ...rows], logRows, log: () => {}, now: nowFn(T0 + 8 * 60000),
    });
    check(cls.verdict !== "sent" && cls.verdict !== "dry_run" && cls.verdict !== "not sent (test mode)", `classifier catch line suppressed after manual result (${cls.verdict})`);
    check(/catch/.test(cls.key || row.key || ""), `shared catch dedupe key (manual ${row.key}, classifier ${cls.key})`);
  }
  {
    // reverse: classifier catch already sent, manual result skipped
    const road = baseRoad();
    const at = new Date(T0 + 7 * 60000).toISOString();
    const catchRow = { title: "Booster caught", body: "Booster 22 was caught at the tower.", at, sent_at: at, verdict: "sent" };
    catchRow.key = policy.classify(catchRow, { vehicles: road.vehicles, now: T0 + 7 * 60000 }).key;
    const { row } = await send(road, { key: "booster_result", outcome: "caught", now: nowFn(T0 + 8 * 60000), history: [...liftoffHist(), catchRow] });
    check(row.verdict !== "dry_run" && row.verdict !== "sent", `manual result skipped after classifier catch (${row.verdict})`);
  }

  // ── 7. rollover to F16 clears F15 state, keeps template ──
  {
    const src = baseRoad(15).mission_alerts;
    src.abort = { booster_soon: true };
    src.dispatched = { booster_soon: LIFTOFF };
    src.overrides = { booster_soon: { title: "custom" } };
    const next = MA.rollover(src, 16);
    check(next.flight === 16 && next.liftoff_actual == null && Object.keys(next.abort).length === 0 && Object.keys(next.dispatched).length === 0 && Object.keys(next.overrides).length === 0, "rollover clears F15 liftoff, abort, dispatched, overrides");
    check(next.events.every((e) => !e.t_plus) && next.events.map((e) => e.key).join(",") === "booster_soon,booster_result,deorbit_soon,ship_result", "rollover clears timeline, keeps event keys");
    const soon = next.events.find((e) => e.key === "booster_soon");
    check(soon.title === "🎯 Booster catch in 5 min" && soon.body === "Watch live", "rollover keeps default scheduled titles/bodies");
    check(MA.dueScheduled(next, T0, {}).length === 0, "rolled-over F16 with no timeline ⇒ no scheduled alerts");
  }
  {
    const road = baseRoad(15);
    const current = { n: 16, status: "tbc", date: "2026-12-01T00:00:00.000Z" };
    const res = await MA.syncFromChecker({ road, current, now: T0 + 3 * 3600000, dispatch: async () => { throw new Error("must not dispatch on rollover"); }, writeRoad: () => {} });
    check(road.mission_alerts.flight === 16 && res.dispatched.length === 0 && !road.mission_alerts.events.some((e) => e.t_plus), "checker hook rolls F15 → F16 and does not dispatch without a timeline");
  }

  // ── 8. missing timeline ⇒ no scheduled alerts ──
  {
    const alerts = MA.emptyAlerts(15);
    alerts.liftoff_actual = LIFTOFF;
    check(MA.dueScheduled(alerts, T0 + 95000, {}).length === 0, "liftoff known but no t_plus ⇒ no scheduled alerts (never guess)");
    const road = baseRoad();
    delete road.mission_alerts.events.find((e) => e.key === "booster_soon").t_plus;
    const { row } = await send(road, { key: "booster_soon", now: nowFn(T0 + 95000) });
    check(/^skipped: missing timeline/.test(row.verdict), `send without t_plus is skipped (${row.verdict})`);
  }

  // ── 9. dry_run sends nothing (FCM never called) ──
  check(!fcm.includes("send") && !fcm.includes("initializeApp"), `dry_run / stub: FCM send count ${fcm.filter((x) => x === "send").length}, firebase-admin loads ${fcm.filter((x) => x === "initializeApp").length}`);

  // ── 10. generic for another flight number ──
  {
    const road = baseRoad(16);
    road.mission_alerts.flight = 16;
    road.mission_alerts.liftoff_actual = LIFTOFF;
    const { row } = await send(road, { key: "booster_soon", now: nowFn(T0 + 95000) });
    check(row.verdict === "dry_run" && row.title === "🎯 Booster catch in 5 min" && row.alert_key === "16|booster_soon", `Flight 16 booster_soon works (${row.verdict}, ${row.alert_key})`);
    const { row: r2 } = await send(road, { key: "ship_result", outcome: "splashed", now: nowFn(T0 + 23 * 3600000), history: liftoffHist() });
    check(r2.verdict === "dry_run" && r2.title === "🌊 Ship splashed down", `Flight 16 ship splashdown works (${r2.verdict})`);
  }

  // ── 11. unknown / missing data: send nothing, don't crash ──
  {
    const cases = [];
    cases.push((await send(baseRoad(), { key: "not_a_real_key", now: nowFn(T0) })).row);
    const noAlerts = baseRoad(); delete noAlerts.mission_alerts;
    cases.push((await send(noAlerts, { key: "booster_soon", now: nowFn(T0 + 95000) })).row);
    const noLift = baseRoad(); noLift.mission_alerts.liftoff_actual = null; noLift.mission_alerts.liftoff_source = null;
    cases.push((await send(noLift, { key: "booster_soon", now: nowFn(T0 + 95000) })).row);
    cases.push((await send(baseRoad(), { key: "booster_result", now: nowFn(T0 + 7 * 60000), history: liftoffHist() })).row); // missing outcome
    cases.push((await send(baseRoad(), { key: "booster_result", outcome: "exploded", now: nowFn(T0 + 7 * 60000), history: liftoffHist() })).row);
    cases.push((await send(null, { key: "booster_soon", now: nowFn(T0) })).row);
    for (const row of cases) {
      check(row && /^skipped:/.test(row.verdict) && row.verdict !== "sent" && row.verdict !== "dry_run", `missing/unknown does not crash, sends nothing (${row && row.verdict})`);
    }
  }

  // ── 12. booster_soon too late (>T+5) is skipped; hook also skips ──
  {
    const road = baseRoad();
    const { row } = await send(road, { key: "booster_soon", now: nowFn(T0 + 6 * 60000) });
    check(/^skipped: booster_soon too late/.test(row.verdict), `booster_soon after T+5 skipped (${row.verdict})`);
    const dispatches = [];
    const res = await MA.syncFromChecker({ road: baseRoad(), current: { n: 15, status: "inflight", date: LIFTOFF, mission_alerts_dispatched: {} }, now: T0 + 6 * 60000, dispatch: async (p) => dispatches.push(p), writeRoad: () => {} });
    check(!res.dispatched.includes("booster_soon") && dispatches.length === 0, "hook does not dispatch booster_soon after T+5");
  }

  // ── 13. manual override wins; LL2 does not overwrite a manual liftoff ──
  {
    const road = baseRoad();
    road.mission_alerts.overrides.booster_soon = { title: "🎯 Catch upcoming", body: "Tune in" };
    const { row } = await send(road, { key: "booster_soon", now: nowFn(T0 + 95000) });
    check(row.verdict === "dry_run" && row.title === "🎯 Catch upcoming" && row.body === "Tune in", `manual title/body override wins (${row.title})`);
    const manual = baseRoad();
    manual.mission_alerts.liftoff_actual = LIFTOFF;
    manual.mission_alerts.liftoff_source = "manual";
    await MA.syncFromChecker({
      road: manual,
      current: { n: 15, status: "inflight", date: new Date(T0 + 40 * 60000).toISOString() },
      now: T0 + 40 * 60000 + 95000,
      dispatch: async () => {},
      writeRoad: () => {},
    });
    check(manual.mission_alerts.liftoff_actual === LIFTOFF && manual.mission_alerts.liftoff_source === "manual", "manual liftoff is not overwritten by a later LL2 time");
  }

  check(!fcm.includes("send") && blocked.length === 0 && !(globalThis.__GITBLOCK || []).length, `zero real side effects (FCM ${fcm.length}, fetch ${blocked.length}, git ${(globalThis.__GITBLOCK || []).length})`);

  console.log(failed ? `\n❌ ${failed} check(s) failed` : "\n✅ All checks passed. (Offline — dry_run on, FCM stubbed, nothing real was sent.)");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

function parseT(s) {
  const m = s.match(/^(\d+):(\d+):(\d+)$/);
  return ((Number(m[1]) * 3600) + (Number(m[2]) * 60) + Number(m[3])) * 1000;
}
