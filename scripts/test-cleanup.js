// Offline tests: Road section cleanup (scripts/cleanup.js). No network, nothing pushed.
const c = require("./cleanup.js");
const fs = require("fs"), path = require("path");
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const clone = (o) => JSON.parse(JSON.stringify(o));
const comp = (id, at, line, extra = {}) => ({ id, date: "25 Oct", at, text: line, log_text: line, src: "@NASASpaceflight", trust: "trusted", hardware: "B22", flight: 15,
  milestone: { key: "static_fire|15|B22", type: "static_fire", flight: 15, hardware: "B22", phase: "completed" }, complete: true, ...extra });
// the live 25 Oct shape: 3 loose cards + the completion at the bottom with repeat completions and 3 predictions
const fixture = () => ({ flight: 15, vehicles: ["B22", "S42"], categories: [
  { id: "cryo", status: "done", latest: "Ship 42 completed its cryo tests at Massey's.", history: [
    { date: "9 Oct", text: "Ship 42 completed further cryo tests.", src: "@LabPadre", trust: "trusted", flight: 15, milestone: { key: "cryo_test|15|S42", type: "cryo_test", flight: 15, hardware: "S42", phase: "completed" },
      updates: [{ date: "3–4 Sep", text: "Ship 42 completes its first cryo test.", log_text: "Ship 42 completes its first cryo tests.", phase: "progress", handle: "LabPadre" }] }] },
  { id: "static", status: "progress", latest: "Booster 22 transport ring relocated ahead of static fire test.", history: [
    { id: "ring", date: "25 Oct", at: "2026-10-25T12:37:01.000Z", text: "Booster 22 transport ring relocated ahead of static fire test.", log_text: "Booster 22 transport ring relocated at launch site ahead of static fire.", src: "@LabPadre", trust: "trusted", hardware: "B22", flight: 15 },
    { id: "road", date: "25 Oct", at: "2026-10-25T11:27:16.000Z", text: "Road closed ahead of static fire test.", log_text: "Road closed ahead of static fire test.", src: "@Blobifie", trust: "trusted", hardware: null, x_post: { url: "https://x.com/Blobifie/status/2", author: { username: "Blobifie" } } },
    { id: "roll", date: "24 Oct", at: "2026-10-24T11:28:25.000Z", text: "Booster 22 arrives at the launch site ahead of static fire campaign.", log_text: "Booster 22 rolls to the launch site for static fire campaign.", src: "@Blobifie", trust: "trusted", hardware: "B22", flight: 15,
      milestone: { key: "rollout|15|B22", type: "rollout", flight: 15, hardware: "B22", phase: "progress" } },
    comp("done", "2026-10-25T13:25:48.000Z", "Booster 22 completed a static fire at Pad 2.", { push: { url: "https://x.com/NASASpaceflight/status/9" }, updates: [
      { date: "25 Oct", at: "2026-10-25T12:11:58.000Z", text: "Booster 22 conducts a static fire test at Pad 2.", log_text: "Booster 22 completes its static fire at Pad 2.", url: "https://x.com/NASASpaceflight/status/8", phase: "completed" },
      { date: "25 Oct", at: "2026-10-25T11:38:18.000Z", text: "Booster 22 conducted a static fire test.", log_text: "Booster 22 completed its static fire at the launch site.", url: "https://x.com/NASASpaceflight/status/9", phase: "completed" },
      { date: "17 Oct", at: "2026-10-17T05:24:57.000Z", text: "Booster 22 waiting to roll out for pre-flight static fire testing.", log_text: "Booster 22 is waiting to roll out for its static fire test.", phase: "expected" },
      { date: "9 Oct", at: "2026-10-09T14:36:44.000Z", text: "Booster 22 could be ready for a static fire as early as next week.", log_text: "Booster 22 could be ready for a static fire as early as next week.", src: "NSF", phase: "expected" },
      { date: "30 Sep", text: "B22 ready for static fire within ~2 weeks.", log_text: "Booster 22 could be ready for a static fire within two weeks.", src: "NSF", phase: "expected" }] }),
    { id: "s42", date: "30 Sep", text: "Ship 42 could be ready for a static fire within two to three weeks.", src: "NSF", trust: "trusted", hardware: "S42", flight: 15,
      milestone: { key: "static_fire|15|S42", type: "static_fire", flight: 15, hardware: "S42", phase: "expected" } }] }] });

let road = fixture(); const cryoBefore = JSON.stringify(road.categories[0]);
const r = c.cleanupRoad(road); const st = road.categories[1]; const b22 = st.history[0];
check(r.changed && r.folded === 3, "the 3 loose B22/road cards fold into the Booster 22 card");
check(st.history.length === 2 && c.hwOf(st.history[0]) === "B22" && c.hwOf(st.history[1]) === "S42", "one card per vehicle: Booster 22 (newest) then Ship 42");
check(b22.log_text === "Booster 22 completed its static fire at the launch site.", "main line = the notification's own wording (the completion the push linked)");
check(b22.x_text === b22.log_text, "Road page and Flight Log read the same line");
check(st.latest === b22.log_text && st.log_latest === b22.log_text, "section summary = the current outcome in the notification wording");
const lines = (b22.updates || []).map((u) => `${u.log_date || u.date} ${u.log_text}`);
check(JSON.stringify(lines) === JSON.stringify(["25 Oct Road closed ahead of the static fire.", "24 Oct Booster 22 rolls to the launch site for its static fire campaign.", "30 Sep Booster 22 could be ready for a static fire within two weeks."]), "Earlier updates: key steps only, newest on top: " + lines.join(" / "));
check(!lines.some((l) => /transport ring/.test(l)), "minor step (transport ring) dropped");
check(!lines.some((l) => /completed?s? its static fire|completes/.test(l)), "repeat completions dropped (no duplicate '25 Oct completed' line)");
check(lines.filter((l) => /could be ready/.test(l)).length === 1 && /30 Sep/.test(lines[lines.length - 1]), "only ONE prediction kept: the first (30 Sep)");
check(!lines.some((l) => /waiting to roll out/.test(l)), "'waiting to roll out' is not a key milestone");
check(b22.updates.every((u) => !/\d{1,2}:\d{2}/.test(`${u.date} ${u.log_date || ""}`)), "single dates, no clock times");
check(b22.updates.every((u) => /^[A-Z][^.]*\.$/.test(u.log_text) && u.log_text.length <= 90), "one short plain sentence per line");
check(b22.updates.find((u) => /Road closed/.test(u.log_text)).handle === "Blobifie", "folded X card keeps its credit as a handle");
check(!st.history[1].updates && st.history[1].text.startsWith("Ship 42 could be ready"), "Ship 42 card untouched (not fired yet, one prediction)");
check(JSON.stringify(road.categories[0]) === cryoBefore, "already-clean Cryo section is left exactly as it was");
check(JSON.stringify(c.cleanupRoad(road)) === JSON.stringify({ changed: false, folded: 0 }), "idempotent: a second run changes nothing");
check(JSON.stringify(c.vehicleProgress(st, road)) === JSON.stringify({ done: 1, total: 2 }), "progress 1 of 2 until Ship 42 fires");

// a late arrival after the completion (another repeat completion + another same-day prediction) is folded and deduped too
road.categories[1].history.unshift(comp("late", "2026-10-25T15:00:00.000Z", "Booster 22 completed its static fire.", { milestone: undefined, complete: undefined }),
  { id: "late-road", date: "25 Oct", at: "2026-10-25T10:00:00.000Z", text: "The road is closed ahead of the static fire.", src: "@X", trust: "trusted", hardware: "B22", flight: 15 });
c.cleanupRoad(road); const b22b = road.categories[1].history.find((h) => c.hwOf(h) === "B22");
check(road.categories[1].history.filter((h) => c.hwOf(h) === "B22").length === 1, "late repeat completion folds into the one Booster 22 card");
check(b22b.updates.filter((u) => /road/i.test(u.log_text)).length === 1, "same-day same-meaning line (road closed twice) deduped");
check(b22b.log_text === "Booster 22 completed its static fire at the launch site.", "main line stays the notification wording");

// Ship 42 fires later: its own card, section counts 2 of 2
road.categories[1].history.unshift(
  { id: "s42-roll", date: "2 Nov", at: "2026-11-02T10:00:00.000Z", text: "Ship 42 rolls to Massey's for its static fire.", src: "@Blobifie", trust: "trusted", hardware: "S42", flight: 15 },
  { id: "s42-done", date: "3 Nov", at: "2026-11-03T10:00:00.000Z", text: "Ship 42 completed its static fire at Massey's.", src: "@NASASpaceflight", trust: "trusted", hardware: "S42", flight: 15, milestone: { key: "static_fire|15|S42", type: "static_fire", flight: 15, hardware: "S42", phase: "completed" }, complete: true });
c.cleanupRoad(road); const hs = road.categories[1].history;
check(hs.length === 2 && c.hwOf(hs[0]) === "S42" && c.hwOf(hs[1]) === "B22", "after Ship 42 fires: still one card per vehicle, newest first");
check(JSON.stringify(hs[0].updates.map((u) => u.log_text)) === JSON.stringify(["Ship 42 rolls to Massey's for its static fire.", "Ship 42 could be ready for a static fire within two to three weeks."]), "Ship 42 toggle: rollout + its one prediction");
check(JSON.stringify(c.vehicleProgress(road.categories[1], road)) === JSON.stringify({ done: 2, total: 2 }), "progress 2 of 2 → section can complete");
check(road.categories[1].latest === "Ship 42 completed its static fire at Massey's.", "section summary follows the newest completion");

// no completion yet → nothing folded (loose cards stay until a test completes)
road = fixture(); road.categories[1].history = road.categories[1].history.filter((h) => h.id !== "done");
const before = JSON.stringify(road); check(!c.cleanupRoad(road).changed && JSON.stringify(road) === before, "no completion yet → section left as is");
// later flight cards are never folded into this flight
road = fixture(); road.categories[1].history.push({ id: "b23", date: "26 Oct", text: "Booster 23 rolls to the launch site.", src: "@X", trust: "trusted", hardware: "B23", flight: 16 });
c.cleanupRoad(road); check(road.categories[1].history.some((h) => h.id === "b23"), "a later flight's card is left alone");
// unconfirmed completion does not trigger
road = fixture(); road.categories[1].history.find((h) => h.id === "done").trust = "unconfirmed";
check(c.cleanupRoad(road).folded === 0, "an unconfirmed completion folds nothing");

// the committed road.json is already clean and renders as the target
const live = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8"));
check(!c.cleanupRoad(clone(live)).changed, "committed road.json is already clean (pipeline would not change it)");
const ls = live.categories.find((x) => x.id === "static");
check(ls.history.length === 2 && ls.latest === "Booster 22 completed its static fire at the launch site." && ls.status === "progress", "road.json Static fires: 2 vehicle cards, summary + In progress");
// the app and the pipeline load the same file
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8"), html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8"), cr = fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8");
check(/scripts\/cleanup\.js/.test(html) && /RoadCleanup\.cleanupRoad/.test(app) && /require\("\.\/cleanup\.js"\)/.test(cr), "app (index.html) and check-road.js share scripts/cleanup.js");

console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
