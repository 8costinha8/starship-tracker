// B3: Launch Library outage fallback. Checker side (snapshot content / write policy / run() hook) + app reader (flightFromCheckerFile).
const fs = require("fs"), path = require("path");
const NF = require("./next-flight.js"), SN = require("./next-launch-snapshot.js"), flights = require("./check-flights.js"), HS = require("./hero-story.js");
const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", n), "utf8"));
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "✅" : "❌"} ${m}`); };
const NOW = Date.parse("2026-12-14T21:40:00Z");
const road = { flight: 16, vehicles: ["B23", "S43"], pad: "Pad 2" };
// checker: snapshot
const real = NF.pickNext(fx("ll2-upcoming-2026-11-21-hls-on-top.json").results);
ok(SN.snapshotOf(real, road, NOW) === null, "today's real response (HLS demo on top, no numbered flight) → no snapshot, nothing invented");
const f16 = NF.pickNext(fx("ll2-upcoming-fake-flight16-exact.json").results);
const snap = SN.snapshotOf(f16, road, NOW);
ok(snap && snap.n === 16 && snap.net === "2026-12-14T22:30:00Z" && snap.precision === "MIN" && snap.status === "Go" && snap.pad === "Pad 2" && snap.vehicles.join() === "B23,S43" && snap.updatedAt === new Date(NOW).toISOString(), `snapshot: ${JSON.stringify(snap)}`);
ok(!SN.snapshotOf(f16, { flight: 15, vehicles: ["B22"], pad: "Pad 2" }, NOW).vehicles.length, "vehicles / pad only from the Road of the SAME flight");
ok(!SN.needsWrite(snap, { ...snap, updatedAt: new Date(NOW + 20 * 60000).toISOString() }, NOW + 20 * 60000), "unchanged for 20 min → file not rewritten (no commit every 15 min)");
ok(SN.needsWrite(snap, { ...snap, net: "2026-12-15T22:30:00Z" }, NOW + 20 * 60000), "date moved → rewritten");
ok(SN.needsWrite(snap, { ...snap, status: "Hold" }, NOW + 20 * 60000), "status changed → rewritten");
ok(SN.needsWrite(snap, { ...snap }, NOW + 3.1 * 3600000), "unchanged but older than 3 h → heartbeat rewrite (always younger than the app's 6 h limit)");
// run() hook
(async () => {
  let wrote = null, state = null;
  const deps = { fetchJson: async (u) => (u.includes("/upcoming/") ? fx("ll2-upcoming-fake-flight16-exact.json") : {}), loadState: async () => state, saveState: async (s) => { state = s; }, push: async () => {}, readRoad: () => road,
    writeNextLaunch: (s) => { wrote = s; }, readAppJs: () => "", writeAppJs() {}, commitAndPush() {}, writeStory: async () => ({}), flagReview() {}, now: () => NOW };
  await flights.run(deps);
  ok(wrote && wrote.n === 16 && wrote.net === "2026-12-14T22:30:00Z", "run() hands the snapshot to the writer on every run");
  wrote = null; deps.fetchJson = async () => fx("ll2-upcoming-2026-11-21-hls-on-top.json"); await flights.run(deps);
  ok(wrote === null, "no numbered flight → nothing written (the app keeps the honest TBC)");
  // app reader
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  // pulls flightFromCheckerFile out of app.js (and whatever top-level names it turns out to need) — the real app code, not a copy
  const want = ["NEXT_LAUNCH_MAX_MS", "flightFromCheckerFile"]; let F = HS.heroFns(app, want);
  const f = (j, now) => { for (let i = 0; i < 40; i++) { try { return F.flightFromCheckerFile(j, now); } catch (e) { const m = /^(\w+) is not defined/.exec(e.message); if (!m || want.includes(m[1])) throw e; want.unshift(m[1]); F = HS.heroFns(app, want); } } };
  const j = { ...snap, pad: "Orbital Launch Pad 2" };
  const d = f(j, NOW + 25 * 60000);
  ok(d && d.n === 16 && d.date === j.net && d.status === "confirmed" && d.netPrecision === "MIN" && d.fromChecker === true && d.asOf === NOW && d.booster === "B23" && d.ship === "S43", `app reads it at T-?: ${d && JSON.stringify({ n: d.n, status: d.status, date: d.date, p: d.netPrecision, asOf: new Date(d.asOf).toISOString() })}`);
  ok(f(j, NOW + 5.9 * 3600000) !== null, "5.9 h old → still used");
  ok(f(j, NOW + 6.1 * 3600000) === null, "older than 6 h → null → the honest 'Date to be confirmed' as today");
  ok(f({ ...j, n: 15 }, NOW + 60000) === null, "a flight already in the log is never shown as next");
  ok(f({ ...j, net: "not a date" }, NOW + 60000) === null && f({ ...j, updatedAt: "x" }, NOW + 60000) === null && f(null, NOW) === null && f({}, NOW) === null, "bad / missing fields → null, never invented");
  ok(f({ ...j, updatedAt: new Date(NOW + 3600000).toISOString() }, NOW) === null, "an updatedAt in the future → ignored");
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
