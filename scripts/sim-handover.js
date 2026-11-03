/* Flight 15 -> 16 handover simulation (local only, never pushes, never commits).
   Builds the four stages the app shows with ?sim=<stage> from the current road.json:
     A  before launch (3 Nov)          B  in flight (12 Nov 23:55)
     C  Flight 15 logged, Road not yet rolled over by check-road (13 Nov 01:05 / 02:00)
     D  after check-road's rollover (13 Nov 09:30)
   Usage: node scripts/sim-handover.js <outDir>   (writes <outDir>/<stage>/{road,ll2}.json)
   Also used in-memory by scripts/test-handover.js (stages()). */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const T0 = "2026-11-12T23:30:00.000Z";
const NOW = { A: "2026-11-03T18:45:00Z", B: "2026-11-12T23:55:00Z", C: "2026-11-13T01:05:00Z", C2: "2026-11-13T02:00:00Z", D: "2026-11-13T09:30:00Z" };
function stages(base = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"))) {
  const C = require("./check-road.js"), ps = require("./push-sync.js");
  const L = (n, st, prec, x = {}) => ({ name: `Starship | Flight ${n}`, url: `mock://f${n}`, net: x.net, status: { abbrev: st }, net_precision: { abbrev: prec }, pad: { name: "Orbital Launch Pad 2" },
    window_start: x.ws, window_end: x.we, rocket: { configuration: { variant: "V3" }, launcher_stage: x.b ? [{ launcher: { serial_number: x.b } }] : [], spacecraft_stage: x.s ? [{ spacecraft: { serial_number: x.s } }] : [] },
    mission: { type: "Test Flight", description: x.d || `${n}th test flight of the two-stage Starship launch vehicle.` } });
  const f16 = L(16, "TBD", "M", { net: "2026-12-01T00:00:00Z", d: "SIMULATED: 16th test flight of the two-stage Starship launch vehicle." });
  const ll2 = {
    A: [L(15, "TBC", "M", { net: "2026-11-30T00:00:00Z", b: "Booster 22", s: "S42" })],
    B: [L(15, "In Flight", "SEC", { net: T0, ws: "2026-11-12T23:00:00Z", we: "2026-11-13T01:00:00Z", b: "Booster 22", s: "S42" }), f16],
    C: [L(15, "Success", "SEC", { net: T0, b: "Booster 22", s: "S42" }), f16],
  };
  ll2.D = ll2.C;
  const cp = (o) => JSON.parse(JSON.stringify(o));
  const add = (r, t, b, at) => ps.addFeedItem(r, { title: t, body: b, at, kind: "flight", flight: 15 });
  const A = cp(base);
  const B = cp(base);
  add(B, "✅ Launch time confirmed", "Thu 12 Nov, 23:30 UK", "2026-11-11T18:00:00.000Z");
  add(B, "📡 Livestream ready", "Liftoff in 60 min - tap to watch", "2026-11-12T22:30:00.000Z");
  add(B, "🚀 Liftoff!", "Flight 15 is in the air · Watch now", "2026-11-12T23:30:30.000Z");
  const Cr = cp(B);
  add(Cr, "🏁 Flight 15 — Success", "The story's up in the app.", "2026-11-13T00:45:00.000Z");
  // D: exactly check-road.js run() step 1 (+ the re-file passes that follow it)
  const { road } = C.rolloverRoad(cp(Cr), 15, T0);
  road.updated = "13 Nov"; road.updatedAt = "2026-11-13T09:00:00.000Z";
  require("./scope.js").enforce(road); require("./purpose.js").refile(road);
  return { roads: { A, B, C: Cr, D: road }, ll2, now: NOW, T0 };
}
module.exports = { stages, NOW, T0 };
if (require.main === module) {
  const out = process.argv[2]; if (!out) { console.log("usage: node scripts/sim-handover.js <outDir>"); process.exit(1); }
  const s = stages();
  for (const k of ["A", "B", "C", "D"]) { fs.mkdirSync(path.join(out, k), { recursive: true });
    fs.writeFileSync(path.join(out, k, "road.json"), JSON.stringify(s.roads[k], null, 1));
    fs.writeFileSync(path.join(out, k, "ll2.json"), JSON.stringify({ results: s.ll2[k] })); }
  console.log(`sim stages written to ${out}`);
}
