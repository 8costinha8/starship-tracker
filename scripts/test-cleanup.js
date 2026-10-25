// Offline tests: Flight Log view transform (scripts/cleanup.js). Pure view: road.json and the Road to Flight page keep every post.
const c = require("./cleanup.js");
const fs = require("fs"), path = require("path");
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const clone = (o) => JSON.parse(JSON.stringify(o));
const ms = (hw, phase, type = "static_fire") => ({ key: `${type}|15|${hw}`, type, flight: 15, hardware: hw, phase });
const fixture = () => ({ flight: 15, vehicles: ["B22", "S42"], categories: [{ id: "static", status: "progress", latest: "x", history: [
  { id: "ring", date: "25 Oct", at: "2026-10-25T12:37:01.000Z", text: "Booster 22 transport ring relocated ahead of static fire test.", log_text: "Booster 22 transport ring relocated at launch site ahead of static fire.", src: "@LabPadre", trust: "trusted", hardware: "B22", flight: 15, url: "https://x.com/LabPadre/status/1" },
  { id: "road", date: "25 Oct", at: "2026-10-25T11:27:16.000Z", text: "Road closed ahead of static fire test.", src: "@Blobifie", trust: "trusted", hardware: null, url: "https://x.com/Blobifie/status/2" },
  { id: "roll", date: "24 Oct", at: "2026-10-24T11:28:25.000Z", text: "Booster 22 arrives at the launch site.", log_text: "Booster 22 rolls to the launch site for static fire campaign.", src: "@Blobifie", trust: "trusted", hardware: "B22", flight: 15, milestone: ms("B22", "progress", "rollout") },
  { id: "done", date: "25 Oct", at: "2026-10-25T13:25:48.000Z", text: "Booster 22 completed a static fire test.", log_text: "Booster 22 completed a static fire at Pad 2.", src: "@Blobifie", trust: "trusted", hardware: "B22", flight: 15, milestone: ms("B22", "completed"), complete: true,
    push: { url: "https://x.com/NASASpaceflight/status/9" }, updates: [
      { date: "25 Oct", at: "2026-10-25T12:11:58.000Z", text: "Booster 22 conducts a static fire test at Pad 2.", log_text: "Booster 22 completes its static fire at Pad 2.", url: "https://x.com/NASASpaceflight/status/8", phase: "completed" },
      { date: "25 Oct", at: "2026-10-25T11:38:18.000Z", text: "Booster 22 conducted a static fire test.", log_text: "Booster 22 completed its static fire at the launch site.", url: "https://x.com/NASASpaceflight/status/9", phase: "completed" },
      { date: "17 Oct", text: "Booster 22 waiting to roll out.", log_text: "Booster 22 is waiting to roll out for its static fire test.", phase: "expected" },
      { date: "9 Oct", text: "x", log_text: "Booster 22 could be ready for a static fire as early as next week.", src: "NSF", phase: "expected" },
      { date: "30 Sep", text: "y", log_text: "Booster 22 could be ready for a static fire within two weeks.", src: "NSF", phase: "expected" }] },
  { id: "s42p2", date: "10 Oct", text: "Ship 42 could be ready for a static fire next week.", src: "NSF", trust: "trusted", hardware: "S42", flight: 15, milestone: ms("S42", "expected") },
  { id: "s42p1", date: "30 Sep", text: "Ship 42 could be ready for a static fire within two to three weeks.", src: "NSF", trust: "trusted", hardware: "S42", flight: 15, log_only: true, milestone: ms("S42", "expected") }] }] });
const lines = (card) => (card.updates || []).map((u) => `${u.log_date || u.date} ${u.log_text}`);

let road = fixture(); const raw = JSON.stringify(road); const cat = road.categories[0];
const v = c.flightLogView(cat, road);
check(JSON.stringify(road) === raw, "pure view: road.json data is never changed (every post stays)");
check(cat.history.length === 6, "the Road to Flight list still has all 6 entries (ring, road closure, repeats, predictions)");
const cards = v.history.filter((h) => !(h.flight > 15));
check(cards.length === 2 && c.hwOf(cards[0]) === "B22" && c.hwOf(cards[1]) === "S42", "Flight Log: one card per vehicle (Booster 22 newest, then Ship 42)");
const b = cards[0], s = cards[1];
check(b.log_text === "Booster 22 completed its static fire at the launch site." && b.complete === true && b.milestone.phase === "completed", "completed: the push's own wording, marked completed (glows)");
check(JSON.stringify(lines(b)) === JSON.stringify(["25 Oct Road closed ahead of the static fire.", "24 Oct Booster 22 rolls to the launch site for its static fire campaign.", "30 Sep Booster 22 could be ready for a static fire within two weeks."]), "completed: key steps + only the earliest prediction, newest first: " + lines(b).join(" / "));
check(!lines(b).some((l) => /transport ring|waiting|completes|completed/.test(l)), "minor steps and repeat completions are not in the Flight Log toggle");
check(v.log_latest === b.log_text, "section summary = the completion line");
check(s.log_text === "Ship 42 could be ready for a static fire within two to three weeks." && !s.updates && !s.complete, "unfired vehicle: its EARLIEST prediction only, no Earlier updates, no glow");
check(b._hi === 3 && b.updates.find((u) => /Road closed/.test(u.log_text))._hi === 1, "cards and lines keep their source entry index (tap opens that post on the Road page)");
check(JSON.stringify(c.flightLogView(cat, road)) === JSON.stringify(v), "idempotent: same input → same view");
check(JSON.stringify(c.flightLogView(v, road).history.map((h) => [h.log_text, lines(h)])) === JSON.stringify(v.history.map((h) => [h.log_text, lines(h)])), "idempotent: the view of the view is the same");

// in progress: newest step is the main line, earlier key steps underneath, no glow
road = fixture(); road.categories[0].history = road.categories[0].history.filter((h) => h.id !== "done");
let w = c.flightLogView(road.categories[0], road).history; let bb = w.find((h) => c.hwOf(h) === "B22");
check(bb.log_text === "Booster 22 transport ring relocated at launch site ahead of the static fire." && !bb.complete, "in progress: newest step is the main line, no glow");
check(JSON.stringify(lines(bb)) === JSON.stringify(["25 Oct Road closed ahead of the static fire.", "24 Oct Booster 22 rolls to the launch site for its static fire campaign."]), "in progress: earlier key steps under Earlier updates: " + lines(bb).join(" / "));

// ship first: Ship 42 fires, the booster has only predictions → earliest prediction only
road = { flight: 16, vehicles: ["B23", "S43"], categories: [{ id: "static", status: "progress", history: [
  { id: "s-done", date: "5 Dec", text: "Ship 43 completed its static fire at Massey's.", src: "@NASASpaceflight", trust: "trusted", hardware: "S43", flight: 16, milestone: { type: "static_fire", hardware: "S43", flight: 16, phase: "completed" }, complete: true },
  { id: "s-roll", date: "3 Dec", text: "Ship 43 rolls to Massey's for its static fire.", src: "@Blobifie", trust: "trusted", hardware: "S43", flight: 16 },
  { id: "b-p2", date: "1 Dec", text: "Booster 23 could be ready for a static fire next week.", src: "NSF", trust: "trusted", hardware: "B23", flight: 16 },
  { id: "b-p1", date: "20 Nov", text: "Booster 23 could be ready for a static fire within a month.", src: "NSF", trust: "trusted", hardware: "B23", flight: 16 }] }] };
w = c.flightLogView(road.categories[0], road).history;
const s43 = w.find((h) => c.hwOf(h) === "S43"), b23 = w.find((h) => c.hwOf(h) === "B23");
check(w.length === 2 && s43.complete && s43.log_text === "Ship 43 completed its static fire at Massey's." && lines(s43).join() === "3 Dec Ship 43 rolls to Massey's for its static fire.", "ship first: the ship card completes (generic, not B22/S42)");
check(b23.log_text === "Booster 23 could be ready for a static fire within a month." && !b23.updates && !b23.complete, "ship first: the booster shows its earliest prediction only");
check(JSON.stringify(c.vehicleProgress(road.categories[0], road)) === JSON.stringify({ done: 1, total: 2 }), "progress 1 of 2 until the other vehicle fires");

// non-vehicle sections and later flights untouched
road = fixture(); const pad = { id: "pad", history: [{ date: "1 Oct", text: "x", src: "y", trust: "trusted" }] };
check(c.flightLogView(pad, road) === pad, "non-vehicle sections (pad, FAA, date) are not transformed");

// live data: road.json keeps every Static fires post (restored after 09c03ba) and the Flight Log view is clean
const live = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8"));
const ls = live.categories.find((x) => x.id === "static");
const ids = ls.history.map((h) => h.id);
check(["x-2114335419785679308", "x-2114317866409595106", "x-2113955770337550391", "x-2111327584122437857"].every((id) => ids.includes(id)), "road.json: transport ring, road closure, rollout and completion posts all restored");
check(ls.history.find((h) => h.id === "x-2111327584122437857").updates.length === 5, "road.json: the completion keeps all 5 earlier updates (both repeats, all 3 predictions)");
check(!live.categories.find((x) => x.id === "cryo").history.some((h) => /B22|Booster 22/.test(h.text) && h.date === "25 Oct"), "the wrong 25 Oct B22 cryo card stays removed");
const lv = c.flightLogView(ls, live).history.filter((h) => !(h.flight > live.flight));
check(lv.length === 2 && lv[0].log_text === "Booster 22 completed its static fire at the launch site." && lines(lv[0]).length === 3 && /two to three weeks/.test(lv[1].log_text), "live Flight Log view: Booster 22 completed + 3 lines, Ship 42 earliest prediction");
// wiring: the app's Flight Log uses it, the Road page and pipeline do not
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8"), cr = fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8");
const fn = (name) => { const i = app.indexOf(`function ${name}(`); return app.slice(i, app.indexOf("\n}\n", i) + 2); };
check(/logView\(m, road\)/.test(fn("RoadCard")) && !/logView|RoadCleanup/.test(fn("buildFeed")) && !/RoadCleanup/.test(fn("useRoad")), "only the Flight Log Road box uses the view; the shared list and Road page get raw data");
check(!/cleanup/.test(cr), "check-road.js never folds or rewrites entries before saving");
check(/!h\.log_only/.test(fn("buildFeed")), "log_only entries (sourced estimates with no post) feed the Flight Log only");
console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
