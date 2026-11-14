// Mission complete → live UI back to normal (missionComplete in app.js). Every flight, not an F15 patch:
// both stages with a confirmed result (the hero's booster + ship "result" outcomes) hide the hero's Watch live badge and
// turn the Road card's red "Flight N is in the air · Watch now" pill into a plain "Flight N lifted off" line + date/time.
// One stage still open keeps the live UI. road.box_overrides[n].missionComplete wins both ways.
// No network, no pushes: node tests/test-live-complete.js
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
// Fixture: the Flight 15 Road as it was at 9fd9b12 (before the checker's rollover to 16), trimmed to what the hero reads.
// Self-contained so the test does not drift when road.json rolls over to the next flight.
const live = { flight: 15, vehicles: ["B22", "S42"], mission_updates: {}, feed_items: [], rejected_lines: [],
  mission_alerts: { flight: 15, liftoff_actual: "2026-11-13T22:47:36.000Z" },
  hero_lines: { 15: [
    { stage: "booster", kind: "result", clause: "skipped the tower catch and splashed down in the Gulf", line: "Booster 22 skipped the tower catch and splashed down in the Gulf." },
    { stage: "ship", kind: "orbit", clause: "pressed on to orbit" },
    { stage: "ship", kind: "deploy", clause: "deployed 26 Starlink V3 satellites" },
    { stage: "ship", kind: "record", clause: "flying the longest Starship mission ever", clause_past: "flew the longest Starship mission ever" },
    { stage: "ship", kind: "result", clause: "was caught by the tower", line: "Ship 42 was caught by the tower." } ] } };
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const clone = (x) => JSON.parse(JSON.stringify(x));

const a = app.indexOf("// --- hero-lines helpers"), b = app.indexOf("// --- end live-complete helpers ---");
const bo = app.slice(app.indexOf("function boxOverrides("), app.indexOf("function roadLiftedOff("));
check(a > 0 && b > a && bo.length > 0, "app.js has the hero-lines + live-complete helper blocks");
const H = eval(`(() => {\nconst scrub = (s) => s; const noCreditRepeat = (s) => s;\n${bo}\n${app.slice(a, b)}\nreturn { missionComplete, stageResults, heroMissionLines, doneLineOf }; })()`);

const base = clone(live);
const ship = (kind) => kind === "result" ? { stage: "ship", kind: "result", clause: "was caught by the tower", line: "Ship 42 was caught by the tower." } : { stage: "ship", kind: "pending", clause: "with a tower catch still ahead" };
const boo = { stage: "booster", kind: "result", clause: "skipped the tower catch and splashed down in the Gulf", line: "Booster 22 skipped the tower catch and splashed down in the Gulf." };
const orbit = { stage: "ship", kind: "orbit", clause: "pressed on to orbit" };
const withLines = (lines) => { const r = clone(base); r.hero_lines = { 15: lines }; r.mission_updates = {}; r.feed_items = []; return r; };

// 1. in flight: nothing resolved yet → live
check(H.missionComplete(withLines([orbit, ship("pending")]), 15) === false, "in flight (ship pending, no booster result) → still live");
check(H.missionComplete(withLines([]), 15) === false, "in flight, no outcomes at all → still live");
// 2. both stages resolved → complete (live hidden, date shown)
check(H.missionComplete(base, 15) === true, "F15 (road.json at 9fd9b12): Booster 22 splashed down + Ship 42 caught → mission complete");
check(H.missionComplete(withLines([boo, orbit, ship("result")]), 15) === true, "booster result + ship result → complete");
check(H.missionComplete(withLines([boo, { stage: "ship", kind: "result", clause: "was lost during reentry" }]), 15) === true, "a lost ship is a final result too → complete");
// auto path (no manual hero_lines): results from mission_updates count the same way
{ const r = clone(base); delete r.hero_lines; r.feed_items = [];
  r.mission_updates = { 15: [{ line: "Booster 22 splashed down in the Gulf.", at: "2026-11-13T22:55:00Z", post_id: "1" }, { line: "Ship 42 was caught by the tower.", at: "2026-11-14T21:20:00Z", post_id: "2" }] };
  check(H.missionComplete(r, 15) === true, "auto mission_updates: both stage results → complete");
  r.mission_updates[15] = r.mission_updates[15].slice(0, 1);
  check(H.missionComplete(r, 15) === false, "auto mission_updates: booster only → still live"); }
// 3. only one stage resolved → still live
check(H.missionComplete(withLines([boo, orbit, ship("pending")]), 15) === false, "booster resolved, ship catch still ahead → still live");
check(H.missionComplete(withLines([orbit, ship("result")]), 15) === false, "ship resolved, booster unknown → still live");
// pending ship upgraded by a later auto result (the hero's own rule) → complete
{ const r = withLines([boo, orbit, ship("pending")]); r.mission_updates = { 15: [{ line: "Ship 42 was caught by the tower.", at: "2026-11-14T21:20:00Z", post_id: "9" }] };
  check(H.missionComplete(r, 15) === true, "pending ship override + auto catch result → complete (same upgrade as the hero paragraph)"); }
// 4. manual override wins both ways
{ const r = clone(base); r.box_overrides = { 15: { missionComplete: false } };
  check(H.missionComplete(r, 15) === false, "override missionComplete:false keeps the live UI even with both results"); }
{ const r = withLines([orbit, ship("pending")]); r.box_overrides = { "15": { missionComplete: true } };
  check(H.missionComplete(r, 15) === true, "override missionComplete:true ends the live UI with no results"); }
{ const r = clone(base); r.box_overrides = { 15: { liftedOff: true } };
  check(H.missionComplete(r, 15) === true, "an unrelated box override (liftedOff) does not change the rule"); }
// 5. past flight: unchanged
check(H.missionComplete(base, 14) === false && H.missionComplete(null, 15) === false, "no hero_lines for another flight / no road → no change (false)");
{ const sec = app.slice(app.indexOf("{pastGroups.map((g) => ("), app.indexOf("{Number.isInteger(road && road.flight) && ("));
  check(sec.length > 0 && !/live=|liveDone=/.test(sec), "past flight groups (F14) never get a live row, done or not — unchanged"); }
check(/Booster 22 skipped the tower catch and splashed down in the Gulf, while Ship 42 .*was caught by the tower\./.test(H.heroMissionLines(base, 15, null, Date.parse("2026-11-14T21:30:00Z"))[0] || ""),
  "hero paragraph unchanged by the refactor: " + (H.heroMissionLines(base, 15, null, Date.parse("2026-11-14T21:30:00Z"))[0] || ""));

// wiring (display only)
const badge = app.slice(app.indexOf("function WatchLiveBadge("), app.indexOf("// \"Opens 22:30"));
check(/if \(done\) return null;/.test(badge), "WatchLiveBadge: done → no Watch live button");
check(/<WatchLiveBadge flight=\{f\} now=\{now\} done=\{missionComplete\(road, f\.n\)\} \/>/.test(app), "hero passes missionComplete(road, f.n) to the badge");
const row = app.slice(app.indexOf("function RoadLiveRow("), app.indexOf("// Deep links"));
check(/useFitTier\(rowRef, LIVE_TIERS, liveFits/.test(row), "done row keeps the fix2 measured tiers (LIVE_TIERS / liveFits)");
const doneBranch = (row.match(/\{done \? ([\s\S]*?)\n\s*: <a/) || [])[1] || "";
check(doneBranch && /rfs-done/.test(doneBranch) && !/Watch now|rfs-watch|rfs-sep|href/.test(doneBranch), "done row: plain line, no Watch now, no red dot, not a link");
check(/\{liftIso && <span className="rfs-date">/.test(row), "done row still shows the launch date · time (liftIso)");
check(/liveDone=\{livePost \? missionComplete\(road, road\.flight\) : false\}/.test(app), "Road card passes missionComplete(road, road.flight)");
const css = (app.match(/\.rfs-live\.rfs-done \{[^}]*\}/) || [""])[0];
check(css && /box-shadow: none/.test(css) && !/#ff|255,\s*(?:70|92)/i.test(css) && !/ellipsis|overflow/.test(css), "rfs-done CSS: no red glow, no clip: " + css);
check(H.doneLineOf(15) === "Flight 15 lifted off", "done line text: " + H.doneLineOf(15));
// scope: display only
check(!/missionComplete/.test(fs.readFileSync(path.join(ROOT, "scripts/check-road.js"), "utf8")), "checker untouched (scripts/ has no missionComplete)");
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
