/* Offline: watchdog + derived search terms (B22/S42/S43) + static fallback. */
process.env.PUSH_SHADOW = process.env.PUSH_SHADOW || "0"; // live push-shadow.json must not turn this suite into shadow mode
const wd = require("./watchdog.js"), cr = require("./check-road.js"), fs = require("fs"), path = require("path");
let fail = 0; const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };
const live = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8"));
const terms = cr.searchVehicleWords(live);
for (const t of ["B22", "S42", "S43", "Booster 22", "Ship 42", "Ship 43"]) ok(terms.includes(t), `derived terms include ${t}`);
cr.setLastTerms(terms);
const fb = cr.searchVehicleWords({ flight: 15, vehicles: [], categories: [], archive: {} });
ok(fb.length && ["B22", "S42", "S43"].every((t) => fb.includes(t)), `empty data → last good list from state (${fb.slice(0, 6).join(", ")})`);
const fd = cr.searchVehicleWords({ flight: 16, vehicles: [], categories: [], archive: {}, milestones: { B23: {}, S43: {} }, feed_items: [{ title: "Booster 24 rolls out" }] });
ok(["B23", "S43", "B24", "Booster 24"].every((t) => fd.includes(t)) && !fd.includes("B22"), `empty derivation → vehicles read from the data, not a hard-coded list (${fd.join(", ")})`);
ok(!/STATIC_VEHICLES = \[/.test(fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8")), "no hard-coded vehicle list in check-road.js");
cr.setLastTerms([]);
ok(!cr.searchVehicleWords({ flight: 15, vehicles: [], categories: [], archive: {} }).length, "no data and no saved list → empty (watchdog alarms)");
cr.setLastTerms(terms);
const fb2 = cr.searchVehicleWords({ flight: 15, vehicles: null, categories: [{ history: [{ get text() { throw new Error("boom"); } }] }] });
ok(fb2.includes("S42"), "derivation throws → fallback still has S42");
const s = {}; let a;
ok(wd.check(s, { terms: [], candidates: 5 }).some((x) => /search terms are empty/.test(x)), "empty search terms → alarm immediately");
for (let i = 1; i < wd.WATCHDOG_RUNS; i++) { a = wd.check(s, { terms, candidates: 0 }); }
ok(!a.length, `${wd.WATCHDOG_RUNS - 1} zero-candidate runs → no alarm yet`);
a = wd.check(s, { terms, candidates: 0 }); ok(a.some((x) => /zero candidate/.test(x)), `${wd.WATCHDOG_RUNS} consecutive zero-candidate runs → alarm`);
a = wd.check(s, { terms, candidates: 3 }); ok(!a.length && s.watchdog.zeroRuns === 0, "a run with candidates resets the counter");
for (let i = 0; i < wd.WATCHDOG_RUNS; i++) a = wd.check(s, { terms, candidates: 40, writerFailed: true });
ok(a.some((x) => /writer failed/.test(x)), "writer (Grok+Claude) failing every run → alarm (the 26–28 Oct outage)");
console.log(fail ? `\n❌ ${fail} check(s) failed` : "\nAll watchdog checks passed."); process.exit(fail ? 1 : 0);
