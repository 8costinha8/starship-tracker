/* Offline test of tonight's ship alerts (scripts/mission-alert.js: watch / now / claim / source / dry_run).
   FCM, firebase-admin, fetch and git writes are blocked; sends go to an in-memory stub. Zero real pushes.
   node scripts/test-shipalerts.js
*/
"use strict";
process.env.PUSH_SHADOW = "0";
for (const k of Object.keys(process.env)) {
  if (/XAI|ANTHROPIC|X_BEARER|FIREBASE|GITHUB_TOKEN|GH_TOKEN|API_KEY|SECRET/i.test(k)) delete process.env[k];
}
delete process.env.CI;
const Module = require("module");
const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const blocked = [];
globalThis.fetch = async (u) => { blocked.push(String(u)); throw new Error("NETWORK BLOCKED (shipalerts test)"); };
const origLoad = Module._load;
Module._load = function (req, ...a) {
  if (req === "firebase-admin") { blocked.push("firebase-admin"); throw new Error("firebase-admin must not load in test-shipalerts.js"); }
  return origLoad.call(this, req, ...a);
};
const ex = cp.execSync;
cp.execSync = function (cmd, ...r) {
  if (/\bgit\s+(push|pull|commit|add|config|fetch|remote|checkout|ls-remote)\b/.test(String(cmd))) { blocked.push(String(cmd)); throw new Error("git blocked (shipalerts test): " + cmd); }
  return ex.call(this, cmd, ...r);
};

const MA = require("./mission-alert.js");

let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) { pass++; console.log("✅ " + msg); } else { fail++; console.log("❌ " + msg); } };

const LIFTOFF = "2026-11-13T22:47:36.000Z";
const TARGET = Date.parse("2026-11-14T20:18:33.000Z"); // liftoff + T+21:30:57
const MIN = 60000;

function road({ t_plus = "21:30:57", overrides = {}, abort = {} } = {}) {
  return {
    flight: 15, vehicles: ["B22", "S42"], categories: [], feed_items: [], mission_updates: {},
    mission_alerts: {
      flight: 15, liftoff_actual: LIFTOFF, liftoff_source: "ll2",
      events: [
        { key: "booster_soon", t_plus: "00:01:35", title: "🎯 Booster catch in 5 min", body: "Watch live" },
        { key: "booster_result" },
        { key: "deorbit_soon", t_plus, title: "⏱️ Deorbit in 5 min", body: "Watch live" },
        { key: "ship_result" },
      ],
      abort, overrides, dispatched: {}, template: MA.DEFAULT_TEMPLATE.map((e) => ({ ...e })),
    },
  };
}
// Virtual clock: sleep() advances it, so the watch loop runs in ms.
function clock(startMs) {
  const c = { t: startMs, sleeps: [] };
  c.now = () => c.t;
  c.sleep = async (ms) => { c.sleeps.push(ms); c.t += ms; };
  return c;
}
function claimStore() {
  const taken = new Set();
  return {
    taken,
    exists: async (f, k) => taken.has(MA.claimTag(f, k)),
    claim: async (f, k) => { const tag = MA.claimTag(f, k); if (taken.has(tag)) return { ok: false, tag }; taken.add(tag); return { ok: true, tag }; },
  };
}
function sender(c) {
  const sent = [];
  return { sent, send: async (n) => { sent.push({ title: n.title, body: n.body, at: c ? c.t : null }); } };
}
async function run(opts) {
  const c = opts.clock;
  const s = opts.sender;
  const st = opts.claims;
  const logs = [];
  const row = await MA.sendMissionAlert({
    dry_run: opts.dry_run === true, save: true, send: s.send,
    now: c.now, sleep: c.sleep, log: (m) => logs.push(String(m)),
    road: opts.road, refreshRoad: opts.refreshRoad, key: opts.key, outcome: opts.outcome,
    send_at: opts.send_at, mode: opts.mode, source_url: opts.source_url, requireSource: opts.requireSource,
    claim: st && st.claim, claimExists: st && st.exists,
    history: opts.history || [], logRows: opts.logRows || [],
  });
  return { row, logs };
}

(async () => {
  // ── 0. tonight's real road.json gives the right deorbit_soon time ──
  {
    const live = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8"));
    const at = MA.timelineAt(live.mission_alerts, "deorbit_soon");
    check(at === TARGET, `road.json: deorbit_soon due ${new Date(at).toISOString()} (20:18:33 UK, T-5 before the ~20:24 burn)`);
    check(Object.keys(live.mission_alerts.dispatched || {}).length === 0, "road.json: nothing dispatched yet");
  }

  // ── 1. watcher started at 19:35 fires on time (T-5) ──
  {
    const c = clock(Date.parse("2026-11-14T19:35:00Z")), s = sender(c), st = claimStore();
    const { row } = await run({ clock: c, sender: s, claims: st, road: road(), refreshRoad: async () => road(), key: "deorbit_soon", mode: "watch" });
    check(row.verdict === "sent" && s.sent.length === 1, `watch: deorbit_soon sent once (${row.verdict})`);
    check(s.sent[0] && s.sent[0].at === TARGET, `watch: fired at ${s.sent[0] && new Date(s.sent[0].at).toISOString()} (target 20:18:33Z, 0 s late)`);
    check(Math.max(...c.sleeps) <= 30000, `watch: re-reads road.json at least every 30 s (max sleep ${Math.max(...c.sleeps)} ms)`);
    check(st.taken.has("alert-claim-15-deorbit_soon"), "watch: one-send claim taken before the send");
  }

  // ── 2. early deorbit: t_plus override moves the send earlier mid-watch ──
  {
    const c = clock(Date.parse("2026-11-14T19:35:00Z")), s = sender(c);
    const early = Date.parse("2026-11-14T20:07:36Z"); // T+21:20:00
    const refreshRoad = async () => (c.t >= Date.parse("2026-11-14T19:55:00Z") ? road({ overrides: { deorbit_soon: { t_plus: "21:20:00" } } }) : road());
    const { row } = await run({ clock: c, sender: s, claims: claimStore(), road: road(), refreshRoad, key: "deorbit_soon", mode: "watch" });
    check(row.verdict === "sent" && s.sent.length === 1 && s.sent[0].at === early, `early deorbit: moved to ${s.sent[0] && new Date(s.sent[0].at).toISOString()} (override T+21:20:00)`);
    // override arrives after the new time has already passed → fires on the next tick (≤30 s)
    const c2 = clock(Date.parse("2026-11-14T20:00:00Z")), s2 = sender(c2);
    const r2 = async () => (c2.t >= Date.parse("2026-11-14T20:09:00Z") ? road({ overrides: { deorbit_soon: { t_plus: "21:20:00" } } }) : road());
    await run({ clock: c2, sender: s2, claims: claimStore(), road: road(), refreshRoad: r2, key: "deorbit_soon", mode: "watch" });
    const lag = s2.sent[0] ? (s2.sent[0].at - early) / 1000 : null;
    check(s2.sent.length === 1 && lag <= 120, `early deorbit override only lands at 20:09:00: sent on that tick (${lag}s after the new time, ≤2 min)`);
    // checker-style run (send_at fixed at dispatch) also follows the timeline
    const c3 = clock(Date.parse("2026-11-14T20:00:00Z")), s3 = sender(c3);
    const r3 = async () => (c3.t >= Date.parse("2026-11-14T20:03:00Z") ? road({ overrides: { deorbit_soon: { t_plus: "21:20:00" } } }) : road());
    await run({ clock: c3, sender: s3, claims: claimStore(), road: road(), refreshRoad: r3, key: "deorbit_soon", send_at: new Date(TARGET).toISOString() });
    check(s3.sent.length === 1 && s3.sent[0].at === early, "checker dispatch (send_at 20:18:33) also moves to the earlier timeline time");
  }

  // ── 3. no double send: watcher + checker dispatch + manual now share one claim ──
  {
    const st = claimStore();
    const cw = clock(Date.parse("2026-11-14T19:35:00Z")), cc = clock(Date.parse("2026-11-14T20:00:30Z")), s = sender(cw);
    const sendAll = { send: async (n) => s.sent.push({ title: n.title }) , sent: s.sent };
    const [a, b] = await Promise.all([
      run({ clock: cw, sender: sendAll, claims: st, road: road(), refreshRoad: async () => road(), key: "deorbit_soon", mode: "watch" }),
      run({ clock: cc, sender: sendAll, claims: st, road: road(), refreshRoad: async () => road(), key: "deorbit_soon", send_at: new Date(TARGET).toISOString() }),
    ]);
    const cn = clock(TARGET + 20000);
    const n = await run({ clock: cn, sender: sendAll, claims: st, road: road(), key: "deorbit_soon", mode: "now" });
    const verdicts = [a.row.verdict, b.row.verdict, n.row.verdict];
    check(s.sent.length === 1, `3 runs (watch, checker send_at, manual now) → ${s.sent.length} send`);
    check(verdicts.filter((v) => v === "sent").length === 1 && verdicts.filter((v) => /^silent: duplicate/.test(v)).length === 2, `the other two are silent duplicates (${verdicts.join(" | ")})`);
    // manual now first (early deorbit), watcher started earlier stops at its next tick without sending
    const st2 = claimStore(), c4 = clock(Date.parse("2026-11-14T19:35:00Z")), s4 = sender(c4);
    const watchP = run({ clock: c4, sender: s4, claims: st2, road: road(), refreshRoad: async () => road(), key: "deorbit_soon", mode: "watch" });
    await st2.claim(15, "deorbit_soon"); // manual run took it
    const w = await watchP;
    check(s4.sent.length === 0 && /sent by another run/.test(w.row.verdict), `watcher stops once another run has sent (${w.row.verdict})`);
    // push-log dedupe still applies without the claim
    const hist = [{ title: "⏱️ Deorbit in 5 min", body: "Watch live", verdict: "sent", key: "15|deorbit_soon", alert_key: "15|deorbit_soon" }];
    const s5 = sender(null);
    const r5 = await run({ clock: clock(TARGET), sender: s5, road: road(), key: "deorbit_soon", mode: "now", history: hist });
    check(s5.sent.length === 0 && /^silent: duplicate/.test(r5.row.verdict), `already in notifications.json → silent (${r5.row.verdict})`);
  }

  // ── 4. guards: abort, stale, not-due ──
  {
    const c = clock(Date.parse("2026-11-14T19:35:00Z")), s = sender(c);
    const rr = async () => (c.t >= Date.parse("2026-11-14T20:00:00Z") ? road({ abort: { deorbit_soon: true } }) : road());
    const a = await run({ clock: c, sender: s, claims: claimStore(), road: road(), refreshRoad: rr, key: "deorbit_soon", mode: "watch" });
    check(s.sent.length === 0 && /abort/.test(a.row.verdict), `abort flag during watch → no send (${a.row.verdict})`);
    const s2 = sender(null);
    const b = await run({ clock: clock(TARGET + 6 * MIN), sender: s2, claims: claimStore(), road: road(), refreshRoad: async () => road(), key: "deorbit_soon", mode: "watch" });
    check(s2.sent.length === 0 && /stale/.test(b.row.verdict), `watcher started >5 min late → no stale warning (${b.row.verdict})`);
    const s3 = sender(null);
    const d = await run({ clock: clock(TARGET - 3 * 3600000), sender: s3, claims: claimStore(), road: road(), refreshRoad: async () => road(), key: "deorbit_soon", mode: "watch" });
    check(s3.sent.length === 0 && d.row.not_due === true, `watcher 3 h early exits at once as not due (${d.row.verdict})`);
  }

  // ── 5. result overrides (runFromEnv, the CI entry) ──
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shipalerts-"));
  const writeRoot = (rd = road()) => {
    fs.writeFileSync(path.join(tmp, "road.json"), JSON.stringify(rd, null, 2));
    fs.writeFileSync(path.join(tmp, "notifications.json"), JSON.stringify({ pushes: [] }));
  };
  const SRC = "https://x.com/SpaceX/status/2121999999999999999";
  for (const [outcome, title] of [["caught", "✅ Ship caught!"], ["splashdown", "🌊 Ship splashed down"], ["lost", "❌ Ship lost in reentry"]]) {
    writeRoot();
    const s = sender(null), logs = [];
    const { row, exitCode } = await MA.runFromEnv({ ALERT_KEY: "ship_result", ALERT_OUTCOME: outcome, ALERT_MODE: "now", SOURCE_URL: SRC, DRY_RUN: "false" },
      { root: tmp, send: s.send, claims: claimStore(), log: (...m) => logs.push(m.join(" ")), now: () => TARGET + 62 * MIN });
    check(exitCode === 0 && row.verdict === "sent" && s.sent.length === 1 && s.sent[0].title === title && s.sent[0].body === "Flight 15", `override ship_result ${outcome} → "${s.sent[0] && s.sent[0].title} · ${s.sent[0] && s.sent[0].body}"`);
    check(row.source === "@SpaceX" && row.source_url === SRC, `override ${outcome}: source kept on the log row (${row.source})`);
  }
  {
    writeRoot();
    const s = sender(null);
    const { row } = await MA.runFromEnv({ ALERT_KEY: "deorbit_soon", ALERT_MODE: "now", DRY_RUN: "false" }, { root: tmp, send: s.send, claims: claimStore(), log: () => {}, now: () => TARGET - 4 * MIN });
    check(row.verdict === "sent" && s.sent.length === 1 && s.sent[0].title === "⏱️ Deorbit in 5 min", `override deorbit_soon mode=now → sent at once (${row.verdict})`);
  }

  // ── 6. a result is blocked without a confirming Tier 1 source ──
  for (const [label, url] of [["no source", ""], ["Tier 2 account", "https://x.com/Blobifie/status/123"], ["space.com (not Tier 1)", "https://www.space.com/starship-flight-15"], ["predictOnly account", "https://x.com/elonmusk/status/1"], ["not a post", "https://x.com/SpaceX"], ["http", "http://spaceflightnow.com/x"]]) {
    writeRoot();
    const s = sender(null);
    const { row, exitCode } = await MA.runFromEnv({ ALERT_KEY: "ship_result", ALERT_OUTCOME: "caught", ALERT_MODE: "now", SOURCE_URL: url, DRY_RUN: "false" }, { root: tmp, send: s.send, claims: claimStore(), log: () => {}, now: () => TARGET + 62 * MIN });
    check(s.sent.length === 0 && /needs a confirming source/.test(row.verdict) && exitCode === 1, `result blocked: ${label} (${row.verdict})`);
  }
  for (const url of ["https://spaceflightnow.com/2026/11/14/live-coverage-starship-flight-15/", "https://www.nasaspaceflight.com/2026/11/flight-15/", "https://x.com/NASASpaceflight/status/2121317448477728883", "https://www.spacex.com/launches/starship-flight-15"]) {
    check(MA.confirmSource(url).ok, `Tier 1 source accepted: ${url}`);
  }

  // ── 7. dry_run: full path, zero sends, payload + token count only ──
  {
    writeRoot();
    const before = fs.readFileSync(path.join(tmp, "notifications.json"), "utf8") + fs.readFileSync(path.join(tmp, "road.json"), "utf8");
    let sends = 0; const logs = []; const st = claimStore();
    const { row, exitCode } = await MA.runFromEnv({ ALERT_KEY: "deorbit_soon", ALERT_MODE: "now", DRY_RUN: "true" },
      { root: tmp, send: async () => { sends++; }, claims: st, countTokens: async () => 1234, log: (...m) => logs.push(m.join(" ")), now: () => TARGET });
    const all = logs.join("\n");
    check(exitCode === 0 && row.verdict === "dry_run" && sends === 0, `dry_run deorbit_soon: verdict ${row.verdict}, ${sends} FCM sends`);
    check(/dry_run: would send \{"tokens":"\[1234 token\(s\), not printed\]","notification":\{"title":"⏱️ Deorbit in 5 min","body":"Watch live"\}/.test(all), "dry_run logs the exact FCM payload with only a token count");
    check(/token count 1234 — 0 FCM sends made/.test(all), "dry_run logs the token count");
    check(st.taken.size === 0 && /claim .* is free/.test(all), "dry_run does not take the claim (only reports it)");
    const after = fs.readFileSync(path.join(tmp, "notifications.json"), "utf8") + fs.readFileSync(path.join(tmp, "road.json"), "utf8");
    check(before === after, "dry_run writes nothing (road.json / notifications.json unchanged)");
    writeRoot();
    let sends2 = 0; const logs2 = [];
    const r2 = await MA.runFromEnv({ ALERT_KEY: "ship_result", ALERT_OUTCOME: "splashdown", ALERT_MODE: "now", SOURCE_URL: SRC, DRY_RUN: "true" },
      { root: tmp, send: async () => { sends2++; }, claims: claimStore(), countTokens: async () => 7, log: (...m) => logs2.push(m.join(" ")), now: () => TARGET + 62 * MIN });
    check(r2.row.verdict === "dry_run" && sends2 === 0 && /"title":"🌊 Ship splashed down","body":"Flight 15"/.test(logs2.join("\n")), "dry_run ship_result: payload logged, 0 sends");
    const r3 = await MA.runFromEnv({ ALERT_KEY: "ship_result", ALERT_OUTCOME: "caught", ALERT_MODE: "now", DRY_RUN: "true" },
      { root: tmp, send: async () => { sends2++; }, claims: claimStore(), log: () => {}, now: () => TARGET + 62 * MIN });
    check(/needs a confirming source/.test(r3.row.verdict) && sends2 === 0, "dry_run still enforces the source rule");
  }

  // ── 8. short text ──
  {
    const texts = [MA.SCHEDULED_TEXT.deorbit_soon, MA.SCHEDULED_TEXT.booster_soon];
    for (const k of ["booster_result", "ship_result"]) for (const o of ["caught", "splashed", "lost"]) texts.push(MA.resultText(k, o, 15));
    const long = texts.filter((t) => [...t.title].length > 24 || [...t.body].length > 12);
    check(long.length === 0, `all ${texts.length} alert texts short (title ≤24 chars, body ≤12): ${texts.map((t) => t.title).join(" / ")}`);
    check(MA.normOutcome("Splashdown") === "splashed" && MA.normOutcome("caught") === "caught", "outcome alias: splashdown → splashed");
  }

  // ── 8b. zero-human automatic path: checker hook → mission-alert.yml inputs → on-time send ──
  {
    const r = road(); r.mission_alerts.liftoff_actual = null; // checker fills liftoff from LL2
    const disp = [];
    const cur = (n = 15) => ({ n, status: n === 15 ? "inflight" : "tbc", date: n === 15 ? LIFTOFF : "2026-12-20T00:00:00Z" });
    const sync = (ms, n) => MA.syncFromChecker({ road: r, current: cur(n), prev: {}, now: ms, writeRoad: () => {}, dispatch: async (p) => { disp.push(p); } });
    await sync(Date.parse("2026-11-14T19:45:20Z"));
    check(r.mission_alerts.liftoff_actual === LIFTOFF && disp.length === 0, "checker 19:45: liftoff from LL2, deorbit not yet inside the 30 min window");
    await sync(Date.parse("2026-11-14T20:00:40Z"));
    check(disp.length === 1 && disp[0].key === "deorbit_soon" && disp[0].send_at === new Date(TARGET).toISOString() && disp[0].mode === undefined, `checker 20:00: dispatches deorbit_soon send_at ${disp[0] && disp[0].send_at} (no manual input needed)`);
    await sync(Date.parse("2026-11-14T20:15:40Z"));
    check(disp.length === 1, "checker 20:15: no second dispatch (dispatched{} bookkeeping)");
    // the dispatched run gets the workflow defaults: mode=auto (+ send_at) ⇒ watch, dry_run=false
    const body = await (async () => { let b; await MA.dispatchMissionAlert(disp[0], { token: "x", fetchFn: async (u, o) => { b = JSON.parse(o.body); return { status: 204 }; } }); return b; })();
    check(disp[0].flight === 15, "checker hook passes flight 15 to the dispatch");
    check(body.ref === "main" && body.inputs.key === "deorbit_soon" && body.inputs.send_at && body.inputs.flight === "15" && body.inputs.mode === undefined && body.inputs.dry_run === "false", "dispatch body: ref main, key + send_at + flight 15, mode left to the workflow default (auto)");
    writeRoot();
    const c = clock(Date.parse("2026-11-14T20:01:10Z")), s = sender(c);
    const { row } = await MA.runFromEnv({ ALERT_KEY: "deorbit_soon", ALERT_MODE: "auto", SEND_AT: body.inputs.send_at, ALERT_FLIGHT: body.inputs.flight, SOURCE_URL: "", ALERT_OUTCOME: "", DRY_RUN: "false" },
      { root: tmp, send: s.send, claims: claimStore(), log: () => {}, now: c.now, sleep: c.sleep, refreshRoad: async () => road() });
    check(row.verdict === "sent" && s.sent.length === 1 && s.sent[0].at === TARGET, `dispatched run (workflow defaults) sends at ${s.sent[0] && new Date(s.sent[0].at).toISOString()} with zero human steps`);
    const dup = await MA.runFromEnv({ ALERT_KEY: "deorbit_soon", ALERT_MODE: "watch", DRY_RUN: "" }, { root: tmp, send: s.send, claims: claimStore(), log: () => {}, now: () => TARGET + 30000, sleep: async () => {}, refreshRoad: async () => road() });
    check(/^silent: duplicate/.test(dup.row.verdict) && s.sent.length === 1, `a later watcher sees the send in notifications.json and stays silent (${dup.row.verdict})`);
    // the tonight-only cron run: ALERT_KEY=deorbit_soon, ALERT_MODE=watch, no other inputs
    writeRoot();
    const c2 = clock(Date.parse("2026-11-14T19:41:00Z")), s2 = sender(c2);
    const r2 = await MA.runFromEnv({ ALERT_KEY: "deorbit_soon", ALERT_MODE: "watch", ALERT_FLIGHT: "15", SEND_AT: "", SOURCE_URL: "", ALERT_OUTCOME: "", DRY_RUN: "" },
      { root: tmp, send: s2.send, claims: claimStore(), log: () => {}, now: c2.now, sleep: c2.sleep, refreshRoad: async () => road() });
    check(r2.row.verdict === "sent" && s2.sent[0].at === TARGET, "cron watcher run (schedule env) sends at 20:18:33 with zero human steps");
    // LL2 moves on to Flight 16 before the deorbit: rollover held, deorbit still dispatched for Flight 15
    const r3 = road(); const d3 = [];
    await MA.syncFromChecker({ road: r3, current: cur(16), prev: {}, now: Date.parse("2026-11-14T20:00:40Z"), writeRoad: () => {}, dispatch: async (p) => { d3.push(p); } });
    check(r3.mission_alerts.flight === 15 && d3.length === 1 && d3[0].key === "deorbit_soon", "LL2 already on Flight 16: rollover held, Flight 15 deorbit_soon still dispatched");
    // road.json rolls over mid-watch: the watcher keeps Flight 15's timeline
    const c4 = clock(Date.parse("2026-11-14T19:41:00Z")), s4 = sender(c4);
    const fresh16 = { flight: 16, vehicles: [], categories: [], feed_items: [], mission_updates: {} };
    await run({ clock: c4, sender: s4, claims: claimStore(), road: road(), refreshRoad: async () => (c4.t >= Date.parse("2026-11-14T19:50:00Z") ? fresh16 : road()), key: "deorbit_soon", mode: "watch" });
    check(s4.sent.length === 1 && s4.sent[0].at === TARGET && s4.sent[0].body === "Watch live", "road.json rolled over mid-watch: still sends Flight 15 deorbit_soon on time");
  }

  // ── 8c. no send without a claim ──
  {
    const throwing = MA.gitClaims("/nonexistent", () => { throw new Error("network down"); });
    const c = await throwing.claim(15, "deorbit_soon");
    check(c.ok === false && c.error === true, `gitClaims: push and ls-remote both throw → ${JSON.stringify(c)}`);
    const s = sender(null);
    const r = await run({ clock: clock(TARGET), sender: s, claims: throwing, road: road(), key: "deorbit_soon", mode: "now" });
    check(s.sent.length === 0 && /claim failed/.test(r.row.verdict), `claim error → 0 sends (${r.row.verdict})`);
    for (const [label, claim] of [["claim throws", async () => { throw new Error("x"); }], ["claim returns nothing", async () => undefined], ["claim ok:false error:true", async () => ({ ok: false, error: true })], ["claim ok:false (taken)", async () => ({ ok: false })]]) {
      const s2 = sender(null);
      await run({ clock: clock(TARGET), sender: s2, claims: { claim, exists: async () => false }, road: road(), key: "deorbit_soon", mode: "now" });
      check(s2.sent.length === 0, `${label} → 0 sends`);
    }
    writeRoot();
    const s3 = sender(null);
    const e = await MA.runFromEnv({ ALERT_KEY: "deorbit_soon", ALERT_MODE: "now", ALERT_FLIGHT: "15", DRY_RUN: "false" }, { root: tmp, send: s3.send, claims: throwing, log: () => {}, now: () => TARGET });
    check(s3.sent.length === 0 && e.exitCode === 1, `CI entry: claim error → 0 sends, run fails red (${e.row.verdict})`);
    const s4 = sender(null);
    const f = await MA.runFromEnv({ ALERT_KEY: "deorbit_soon", ALERT_MODE: "now", ALERT_FLIGHT: "15", DRY_RUN: "false" }, { root: tmp, send: s4.send, log: () => {}, now: () => TARGET });
    check(s4.sent.length === 0 && f.exitCode === 1, `CI entry: no claim mechanism at all → 0 sends (${f.row.verdict})`);
  }

  // ── 8d. never label or claim the wrong flight ──
  {
    const env = (o) => ({ ALERT_MODE: "now", DRY_RUN: "false", ...o });
    const go = async (rd, o, now = TARGET) => { writeRoot(rd); const s = sender(null), st = claimStore(); const res = await MA.runFromEnv(env(o), { root: tmp, send: s.send, claims: st, log: () => {}, now: () => now }); return { ...res, s, st }; };
    const noAlerts = { flight: 16, vehicles: [], categories: [], feed_items: [], mission_updates: {} };
    const empty16 = { ...noAlerts, mission_alerts: MA.emptyAlerts(16) };
    let r = await go(noAlerts, { ALERT_KEY: "deorbit_soon" });
    check(r.s.sent.length === 0 && r.st.taken.size === 0 && /mission_alerts missing/.test(r.row.verdict), `road.json rebuilt without mission_alerts, no flight → skip, no claim (${r.row.verdict})`);
    r = await go(noAlerts, { ALERT_KEY: "ship_result", ALERT_OUTCOME: "caught", SOURCE_URL: SRC });
    check(r.s.sent.length === 0 && r.st.taken.size === 0, "…same for a result without flight → skip, no claim");
    r = await go(empty16, { ALERT_KEY: "deorbit_soon" });
    check(r.s.sent.length === 0 && r.st.taken.size === 0 && /Flight 16 has no liftoff_actual/.test(r.row.verdict), `empty F16 record, no flight → skip (${r.row.verdict})`);
    r = await go(empty16, { ALERT_KEY: "ship_result", ALERT_OUTCOME: "caught", SOURCE_URL: SRC }, TARGET + 62 * MIN);
    check(r.s.sent.length === 0 && r.st.taken.size === 0, "empty F16 record, result without flight → skip, no claim");
    // flight=15 with road.json rolled to F16
    r = await go(empty16, { ALERT_KEY: "ship_result", ALERT_OUTCOME: "caught", SOURCE_URL: SRC, ALERT_FLIGHT: "15" }, TARGET + 62 * MIN);
    check(r.s.sent.length === 1 && r.s.sent[0].body === "Flight 15" && r.st.taken.has("alert-claim-15-ship_result") && r.row.alert_key === "15|ship_result", `flight=15 + source, road on F16 → result sent as "${r.s.sent[0] && r.s.sent[0].body}", claim alert-claim-15-ship_result, log key ${r.row.alert_key}`);
    r = await go(noAlerts, { ALERT_KEY: "ship_result", ALERT_OUTCOME: "splashdown", SOURCE_URL: SRC, ALERT_FLIGHT: "15" }, TARGET + 62 * MIN);
    check(r.s.sent.length === 1 && r.s.sent[0].body === "Flight 15" && r.st.taken.has("alert-claim-15-ship_result"), "flight=15 + source, no mission_alerts at all → result still sent as Flight 15");
    r = await go(empty16, { ALERT_KEY: "ship_result", ALERT_OUTCOME: "caught", ALERT_FLIGHT: "15" }, TARGET + 62 * MIN);
    check(r.s.sent.length === 0 && r.st.taken.size === 0, "flight=15 without source → still blocked, no claim");
    r = await go(empty16, { ALERT_KEY: "deorbit_soon", ALERT_MODE: "watch", ALERT_FLIGHT: "15" });
    check(r.s.sent.length === 0 && r.st.taken.size === 0 && /no Flight 15 liftoff_actual/.test(r.row.verdict), `flight=15 watch, road on F16 (no F15 timeline) → skip, no claim (${r.row.verdict})`);
    r = await go(road(), { ALERT_KEY: "deorbit_soon", ALERT_MODE: "watch", ALERT_FLIGHT: "16" });
    check(r.s.sent.length === 0 && r.st.taken.size === 0, "flight=16 watch on a F15 record → skip (never times F16 from F15's record)");
    r = await go(empty16, { ALERT_KEY: "deorbit_soon", ALERT_MODE: "now", ALERT_FLIGHT: "15" });
    check(r.s.sent.length === 1 && r.st.taken.has("alert-claim-15-deorbit_soon") && r.row.alert_key === "15|deorbit_soon", "manual deorbit_soon now + flight=15, road on F16 → sent, claims 15 (fixed text, no timeline needed)");
    // watcher with flight=15 keeps F15's timeline when road.json rolls to F16 mid-watch
    writeRoot();
    const c = clock(Date.parse("2026-11-14T19:41:00Z")), s = sender(c), st = claimStore();
    const w = await MA.runFromEnv(env({ ALERT_KEY: "deorbit_soon", ALERT_MODE: "watch", ALERT_FLIGHT: "15" }), { root: tmp, send: s.send, claims: st, log: () => {}, now: c.now, sleep: c.sleep, refreshRoad: async () => (c.t >= Date.parse("2026-11-14T19:50:00Z") ? empty16 : road()) });
    check(s.sent.length === 1 && s.sent[0].at === TARGET && st.taken.has("alert-claim-15-deorbit_soon") && w.row.alert_key === "15|deorbit_soon", "flight=15 watcher, road.json rolls to F16 mid-watch → sent 20:18:33, claim + log key for 15");
    const bad = await go(road(), { ALERT_KEY: "deorbit_soon", ALERT_FLIGHT: "15x" });
    check(bad.s.sent.length === 0 && bad.exitCode === 1, "non-numeric flight input → skip");
  }

  // ── 8e. claimtest guard (CI claim test path) ──
  {
    let sends = 0, counts = 0;
    const st = claimStore();
    const deps = { root: tmp, send: async () => { sends++; }, countTokens: async () => { counts++; return 1; }, claims: st, log: () => {} };
    const a = await MA.runFromEnv({ ALERT_KEY: "claimtest", ALERT_FLIGHT: "0", DRY_RUN: "true" }, deps);
    check(a.exitCode === 0 && a.row.verdict === "claimtest: pass" && st.taken.has("alert-claim-0-claimtest") && sends === 0 && counts === 0, `claimtest dry_run flight 0: real claim path, first taken / second refused, 0 sends, firebase untouched (${a.row.verdict})`);
    const b = await MA.runFromEnv({ ALERT_KEY: "claimtest", ALERT_FLIGHT: "0", DRY_RUN: "false" }, { ...deps, claims: claimStore() });
    const c2 = await MA.runFromEnv({ ALERT_KEY: "claimtest", ALERT_FLIGHT: "15", DRY_RUN: "true" }, { ...deps, claims: claimStore() });
    check(b.exitCode === 1 && c2.exitCode === 1 && sends === 0, "claimtest refused without dry_run or with a real flight number");
  }

  // ── 9. the real claim (gitClaims) against a LOCAL bare repo: two runs on the same commit ──
  {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "shipalerts-git-"));
    const sh = (c, cwd = d) => ex.call(cp, c, { cwd, stdio: "pipe" }).toString();
    sh("git init -q --bare o.git"); sh("git init -q a"); fs.writeFileSync(path.join(d, "a", "f"), "1");
    sh("git add f && git -c user.email=t@t -c user.name=t commit -qm i && git remote add origin ../o.git && git push -q origin HEAD:refs/heads/main", path.join(d, "a"));
    sh("git clone -q -b main o.git b");
    const A = MA.gitClaims(path.join(d, "a"), (c) => sh(c, path.join(d, "a")));
    const B = MA.gitClaims(path.join(d, "b"), (c) => sh(c, path.join(d, "b")));
    const free = await A.exists(15, "deorbit_soon");
    const ca = await A.claim(15, "deorbit_soon"), cb = await B.claim(15, "deorbit_soon"), ca2 = await A.claim(15, "deorbit_soon");
    check(!free && ca.ok === true && cb.ok === false && ca2.ok === false && await B.exists(15, "deorbit_soon"), `git claim tag: first run takes it, same-commit second run and a rerun are refused (${ca.ok}/${cb.ok}/${ca2.ok})`);
  }

  check(blocked.length === 0, `zero real side effects (fetch/firebase-admin/git blocked attempts: ${blocked.length})`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
