// Three-state Road status (○ none / ◐ progress / ● done) + per-category labels.  node scripts/test-status3.js
const fs = require("fs"), path = require("path"), fl = require("./flightlog.js");
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const live = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8"));
const clone = () => JSON.parse(JSON.stringify(live));
const b = fl.boxes(live);
check(b.cryo.status === "done" && b.cryo.statusText === "Complete", "Cryo: both vehicles done → ● Complete");
check(b.raptor.status === "done" && b.raptor.statusText === "Installed", "Raptors: ● Installed");
check(b.static.status === "done" && b.static.statusText === "Complete", "Static fires: ● Complete");
check(b.pad.status === "none" && b.pad.statusText === "Not yet", "Pad: prep/moves only → ○ Not yet (prep never moves the circle)");
check(b.faa.status === "none" && b.faa.statusText === "Not yet", "FAA: no licence → ○ Not yet");
check(b.date.status === "progress" && b.date.statusText === "Estimated" && /NET/.test(b.date.latest), "Launch date: unofficial NET → ◐ Estimated");
{ const r = clone(); delete r.predicted; const d = fl.boxes(r).date; check(d.status === "none" && d.statusText === "Not confirmed", "Launch date: no NET → ○ Not confirmed"); }
{ const r = clone(); r.official_date = { day: "8 Nov", text: "Flight 15 is set for 8 Nov." }; const d = fl.boxes(r).date; check(d.status === "done" && d.statusText === "Confirmed", "Launch date: SpaceX date → ● Confirmed"); }
{ const r = clone(); r.vehicles = [...r.vehicles, "S99"]; const c = fl.boxes(r).cryo; check(c.status === "progress" && c.statusText === "In progress", "Cryo: not every vehicle done → ◐ In progress"); }
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
check(/\.dot-progress \{ background: linear-gradient\(90deg, var\(--c\) 50%, transparent 50%\)/.test(app), "header dot: ◐ half fill for In progress / Estimated");
check(/m\.status === "done" \|\| m\.status === "complete"\)\.length; \/\/ shown boxes only; counts ● full only/.test(app), "'N of 6 done' counts full only");
console.log(`\n${n - fails}/${n} checks passed`); process.exit(fails ? 1 : 0);
