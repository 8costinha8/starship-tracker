/* 9 Nov (Tusk): on a fresh load the Launch date box never flashes "No official Flight N date yet" while the hero's Launch Library
   lookup is pending — it shows the last NET in road.json's own date line, else nothing, until the lookup answers. Display only.
   No network: node scripts/test-netpending.js */
const fs = require("fs"), path = require("path"), F = require("./flightlog.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, ".."), clone = (x) => JSON.parse(JSON.stringify(x));
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8")), APP = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const fx = clone(live); delete fx.predicted; delete fx.official_date; const dc = fx.categories.find((c) => c.id === "date");
dc.latest = dc.log_latest = "Flight 15 NET 13 Nov.";
const D = (r, o) => F.boxes(r, undefined, o).date;

check(D(fx, { pending: true }).latest === "NET 13 Nov", "pending + road.json date line 'Flight 15 NET 13 Nov.' → 'NET 13 Nov'");
check(!/No official/.test(D(fx, { pending: true }).latest), "pending: never 'No official Flight 15 date yet'");
{ const r = clone(fx), d = r.categories.find((c) => c.id === "date"); d.latest = d.log_latest = "No Flight 15 date yet.";
  check(D(r, { pending: true }).latest === "", "pending + no NET in road.json → nothing"); }
{ const r = clone(fx), d = r.categories.find((c) => c.id === "date"); d.latest = ""; d.log_latest = "Flight 14 NET 2 Oct.";
  check(D(r, { pending: true }).latest === "", "pending + a NET for another flight → nothing"); }
check(D(fx, { pending: true, net: { n: 15, date: "2026-11-14T10:00:00Z" } }).latest === "NET 14 Nov", "lookup answered with a NET → the hero's NET wins");
check(D(fx, { pending: false }).latest === "No official Flight 15 date yet." && D(fx).latest === "No official Flight 15 date yet.", "lookup answered without a NET (or checkers, no opts) → the old line");
{ const r = clone(fx); r.predicted = { flight: 15, net: "2026-11-13", sources: [{ name: "a" }, { name: "b" }] };
  check(D(r, { pending: true }).latest === "Estimated NET 13 Nov." && D(r, { pending: true }).statusText === "Estimated", "an estimated date keeps its Estimated line"); }
{ const r = clone(fx); r.official_date = { at: "2026-11-13T22:45:00Z", text: "Flight 15 is set for 13 Nov." };
  check(D(r, { pending: true }).latest === "Flight 15 is set for 13 Nov.", "an official date is never replaced"); }
const a = D(fx, { pending: true }), b = D(fx);
check(a.status === b.status && a.statusText === b.statusText && JSON.stringify(a.cards) === JSON.stringify(b.cards), "pending changes only the headline (pill and lines unchanged)");
const before = JSON.stringify(fx); D(fx, { pending: true }); check(JSON.stringify(fx) === before, "boxes() does not change road.json data");

// app wiring: pending = no Launch Library flight yet and the first lookup hasn't answered (success, failure, cache or budget skip)
check(/const \[settled, setSettled\] = React\.useState\(false\)/.test(APP) && /setLive\(c\.data\); setCheckedAt\(c\.fetchedAt\); setSettled\(true\);/.test(APP)
  && /\.finally\(\(\) => \{ busy = false; setSettled\(true\); \}\)/.test(APP) && /if \(!ll2Spend\(detailOnly \? 1 : 2\)\) \{ setSettled\(true\); return; \}/.test(APP)
  && /return \{ flight: applyMockOverride\(live\), checkedAt, settled \};/.test(APP), "useNextFlight: settled after cache, answer, failure or budget skip");
check(/netPending=\{!liveNext && !nextSettled\}/.test(APP) && /boxes\(road, undefined, \{ net: heroNet \|\| null, pending: !!netPending \}\)/.test(APP), "app: RoadCard passes pending to the Launch date box");
const others = fs.readdirSync(__dirname).filter((f) => /\.js$/.test(f) && !/^test-/.test(f)).filter((f) => /boxes\([^)]*pending/.test(fs.readFileSync(path.join(__dirname, f), "utf8")));
check(!others.length, `no checker or script passes pending to boxes() (${others.join(", ") || "none"})`);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
