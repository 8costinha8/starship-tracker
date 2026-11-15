// Held checker rules (branch checker-handover-rules). No network, no pushes, nothing written: node tests/test-checker-handover.js
// G  a logged flight's story = the final Style A hero paragraph, verbatim; missing / not final → empty + review; manual entry kept
// C  the rollover's "Road to Flight N+1" feed card is stamped with the real handover time; only the push waits for 09:00
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const HS = require(path.join(ROOT, "scripts/hero-story.js"));
const F15 = [{ stage: "booster", kind: "result", clause: "skipped the tower catch and splashed down in the Gulf", line: "Booster 22 skipped the tower catch and splashed down in the Gulf." },
  { stage: "ship", kind: "orbit", clause: "pressed on to orbit" }, { stage: "ship", kind: "deploy", clause: "deployed 26 Starlink V3 satellites" },
  { stage: "ship", kind: "record", clause: "flying the longest Starship mission ever", clause_past: "flew the longest Starship mission ever" },
  { stage: "ship", kind: "result", clause: "was caught by the tower", line: "Ship 42 was caught by the tower." }];
const APPROVED = "Booster 22 skipped the tower catch and splashed down in the Gulf, while Ship 42 pressed on to orbit, deployed 26 Starlink V3 satellites, flew the longest Starship mission ever and was caught by the tower.";
const V = { vehicles: ["B22", "S42"] };
// G — before the rollover (log step runs first in the job)
const pre = { flight: 15, vehicles: ["B22", "S42"], hero_lines: { 15: F15 }, mission_alerts: { flight: 15, liftoff_actual: "2026-11-13T22:47:36.000Z" }, feed_items: [], archive: { 14: { entries: [] } }, categories: [] };
check(HS.loggedStory(pre, 15, V).story === APPROVED, "G: F15 story is the approved hero paragraph, verbatim");
// G — after the rollover: the archive keeps the hero data
const kept = HS.heroArchive(pre, 15);
check(kept && kept.hero_lines.length === 5 && kept.mission_alerts.flight === 15, "G: heroArchive keeps hero_lines + mission_alerts of the flight that flew");
const post = { flight: 16, vehicles: ["B23", "S43"], archive: { 15: { entries: [], hero: kept } }, feed_items: [] };
check(HS.loggedStory(post, 15, V).story === APPROVED, "G: after rollover the story still composes from road.archive[15].hero (vehicles from the logged flight, not B23/S43)");
// G — missing / not final → nothing invented
const none = HS.loggedStory({ flight: 16, vehicles: ["B23", "S43"], archive: {} }, 15, V);
check(none.story === "" && /no hero data/.test(none.reason), "G: no hero data → empty story + reason: " + none.reason);
const half = HS.loggedStory({ ...pre, hero_lines: { 15: F15.filter((x) => !(x.stage === "ship" && x.kind === "result")) } }, 15, V);
check(half.story === "" && /ship result missing/.test(half.reason), "G: ship result not confirmed → not final, left for review: " + half.reason);
check(!/Both stages completed their returns/.test(HS.loggedStory(pre, 15, V).story), "G: never the generic 'both stages returned' summary");
// G — the log step: manual FLIGHTS entry is never overwritten or doubled; generic writer story never used
const CF = require(path.join(ROOT, "scripts/check-flights.js"));
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
check(CF.flightInAppJs(app, 15) && !CF.flightInAppJs(app, 99), "G: flightInAppJs finds an existing FLIGHTS entry");
(async () => {
  const run = async (appJs, road, pushes = []) => {
    let state = { n: 15, status: "inflight", outcome: null, date: "2026-11-13T22:47:36Z" }; const sent = [], commits = [], reviews = []; let out = appJs;
    const l = { name: "Starship | Flight 15", url: "https://ll2.test/15", net: "2026-11-13T22:47:36Z", net_precision: { abbrev: "SEC" }, status: { abbrev: "Success" } };
    await CF.run({ fetchJson: async (u) => (u.includes("/upcoming/") ? { results: [l] } : { ...l, pad: { name: "Orbital Launch Pad 2" }, rocket: { configuration: { variant: "V3" }, launcher_stage: [{ launcher: { serial_number: "B22" } }], spacecraft_stage: [{ spacecraft: { serial_number: "S42" } }] } }),
      loadState: async () => JSON.parse(JSON.stringify(state)), saveState: async (s) => { state = s; }, push: async (n) => sent.push(n), readAppJs: () => out, writeAppJs: (t) => { out = t; },
      commitAndPush: (n) => commits.push(n), writeStory: async () => ({ headline: "Flight 15 succeeds from Pad 2", story: "Flight 15 launched. Both stages completed their returns to the launch site." }),
      readRoad: () => road, readPushes: () => pushes, flagReview: (n, r) => reviews.push(r), now: () => Date.parse("2026-11-14T21:30:00Z") });
    return { out, sent, commits, reviews };
  };
  const tiny = 'const FLIGHTS = [\n  { n: 14, date: "2026-09-28T12:48:59Z", outcome: "success",\n    story: "Example." },\n];\nconst DATA_CHECKED = "1 Oct 2026";\n';
  let r = await run(tiny, pre);
  check(r.out.includes(`story: "${APPROVED}"`) && !/Both stages/.test(r.out), "G: log step writes the hero paragraph verbatim (writer's story ignored)");
  const line = r.sent[0] ? `${r.sent[0].title} ${r.sent[0].body}` : "";
  check(r.sent.length === 1 && r.sent[0].title === "🏁 Flight 15 — Success" && r.sent[0].body === "Ship 42 was caught by the tower." && line.length < 80,
    "D: no result pushes yet → ONE short line (title + shortest confirmed result, " + line.length + " chars): " + line);
  check(!r.sent.some((n) => n.body === APPROVED || /story's up/i.test(n.body)), "D: never the whole paragraph, never 'The story's up in the app.'");
  const sentLog = [{ title: "✅ Ship caught!", body: "Flight 15", verdict: "sent", alert_key: "15|ship_result" }];
  r = await run(tiny, pre, sentLog);
  check(r.sent.length === 0 && r.out.includes(`story: "${APPROVED}"`), "D: result pushes already in notifications.json → NO log-time push (story still logged verbatim)");
  r = await run(tiny, pre, [{ title: "x", verdict: "sent", alert_key: "14|ship_result" }, { title: "y", verdict: "blocked", alert_key: "15|booster_result" }]);
  check(r.sent.length === 1, "D: another flight's result push, or a blocked one, does not count");
  check(CF.logPush(16, "Success", ["Booster 23 was caught by the tower.", "Ship 43 splashed down in the Indian Ocean."]).body === "Booster 23 was caught by the tower.", "D: logPush picks the shortest whole result sentence");
  r = await run(tiny, { flight: 16, vehicles: ["B23", "S43"], archive: {} });
  check(/story: ""/.test(r.out) && r.reviews.length === 1 && r.sent.length === 0, "G/D: no hero data → empty story, one review item, no vague push");
  const manual = tiny.replace("\n];", '\n  { n: 15, date: "2026-11-13T22:47:36Z", outcome: "success",\n    story: "Manual story." },\n];');
  r = await run(manual, pre);
  check(r.out === manual && r.commits.length === 0, "G: an existing (manual) FLIGHTS entry is never overwritten or doubled");

  // C — rollover feed card time
  const CR = require(path.join(ROOT, "scripts/check-road.js"));
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
  const old = JSON.parse(JSON.stringify(base)); old.flight = 15; old.vehicles = ["B22", "S42"]; old.hero_lines = { 15: F15 }; old.mission_alerts = pre.mission_alerts;
  old.archive = { 14: base.archive["14"] }; old.hardware_flights = { B23: 16, S43: 16 };
  const now = Date.parse("2026-11-14T21:31:40Z");
  const ro = CR.rolloverRoad(old, 15, "2026-11-13T22:47:36Z", () => {}, now);
  const fi = (ro.road.feed_items || []).find((f) => /Road to Flight 16/.test(f.title));
  check(fi && fi.at === "2026-11-14T21:31:40.000Z", "C: 'Road to Flight 16' feed card at the real handover time: " + (fi && fi.at));
  check(ro.sendAfter && new Date(ro.sendAfter).toISOString() === "2026-11-14T09:00:00.000Z", "C: the push still waits for 09:00 London the morning after the launch day: " + ro.sendAfter);
  check(ro.road.archive["15"] && ro.road.archive["15"].hero && ro.road.archive["15"].hero.hero_lines.length === 5, "G: the rollover keeps Flight 15's hero data in road.archive[15].hero");
  check(HS.loggedStory(ro.road, 15, V).story === APPROVED, "G: the rolled-over Road still yields the approved paragraph");
  const src = fs.readFileSync(path.join(ROOT, "scripts/check-road.js"), "utf8");
  check(/state\.pendingPush = JSON\.parse\(JSON\.stringify\(\{ sendAfter,/.test(src), "C: pendingPush still carries sendAfter (09:00) for the push");
  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
