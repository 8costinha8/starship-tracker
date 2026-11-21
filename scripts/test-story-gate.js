// Replays the 14 Nov dac2d2b case offline (fake LL2, fake state, fake git, fake push) and the result-story gate.
const fs = require("fs"), path = require("path"), os = require("os");
const flights = require("./check-flights.js"), SG = require("./story-gate.js"), gate = require("./gate.js");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "✅" : "❌"} ${m}`); };
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "road-f15-hero-at-dac2d2b.json"), "utf8"));
const FALSE_STORY = "Flight 15 launched from Pad 2 using Starship V3 with Booster B22 and Ship S42. The vehicle deployed all 26 Starlink V3 satellites. Both stages completed their returns to the launch site."; // the writer text committed in dac2d2b
const clone = (x) => JSON.parse(JSON.stringify(x));
async function logRun({ road, label }) {
  let appJs = 'const FLIGHTS = [\n  { n: 14, date: "2026-09-28T12:15:00Z", outcome: "success",\n    story: "Example story." },\n];\nconst DATA_CHECKED = "1 Oct 2026";\n';
  let state = { n: 15, status: "inflight", date: "2026-11-13T22:45:00Z", precision: "SEC", outcome: null };
  const sent = [], commits = [], reviews = [];
  const deps = {
    fetchJson: async (url) => { const l = { name: "Starship | Flight 15", url: "https://ll2.test/15", net: "2026-11-13T22:47:00Z", net_precision: { abbrev: "SEC" }, status: { abbrev: "Success" } }; return url.includes("/upcoming/") ? { results: [l] } : { ...l, pad: { name: "Orbital Launch Pad 2" }, rocket: { configuration: { variant: "V3" } } }; },
    loadState: async () => clone(state), saveState: async (s) => { state = clone(s); },
    push: async (n) => { sent.push(n); }, readAppJs: () => appJs, writeAppJs: (t) => { appJs = t; },
    commitAndPush: (n, l) => commits.push(`log Flight ${n} (${l})`),
    writeStory: async () => ({ headline: "Starship completes first full mission", story: FALSE_STORY }), // what the old writer produced
    readRoad: () => road, flagReview: (n, reason) => reviews.push({ n, reason }),
    now: () => Date.parse("2026-11-14T21:30:00Z"),
  };
  console.log(`\n── ${label}`); await flights.run(deps);
  return { appJs, state, sent, commits, reviews, rerun: async (r2) => { road = r2; await flights.run(deps); return { appJs, sent, commits, reviews, state }; } };
}
(async () => {
  // A. unit: the false claim is blocked, the true paragraph passes
  const R = FX.hero_lines["15"].filter((o) => o.line).map((o) => o.line);
  const v = SG.verifyStory(FALSE_STORY, R);
  ok(!v.ok && /both stages/i.test(v.problems[0]), `gate blocks the dac2d2b writer story: ${v.problems[0].slice(0, 120)}…`);
  ok(SG.verifyStory("Booster 22 skipped the tower catch and splashed down in the Gulf, while Ship 42 pressed on to orbit and was caught by the tower.", R).ok, "the true paragraph passes");
  ok(!SG.verifyStory("Ship 42 was caught by the tower and Booster 22 was caught too.", R).ok, "'booster was caught' blocked when it splashed down");
  ok(!SG.verifyStory("Both stages returned.", ["Ship 42 was caught by the tower."]).ok, "no confirmed booster outcome → nothing may claim a return");
  ok(!SG.isTrustedResult("Elon Musk", "Both will be caught"), "Elon plan is not a confirmed result");
  ok(!SG.isTrustedResult("@NASASpaceflight", "SpaceX attempts to catch Ship 42 on Flight 15 at Pad 2 (NASASpaceflight, 14 Nov)."), "'attempts to catch' is not a result");

  // B. replay: the real hero data at dac2d2b^ + the old writer's false story → what is logged and pushed now
  const a = await logRun({ road: clone(FX), label: "dac2d2b replay: LL2 Success, writer returns the false story, hero data final" });
  ok(a.commits.length === 1 && !/Both stages completed/.test(a.appJs), "false 'both stages returned' story is NOT written to app.js");
  ok(/story: "Booster 22 skipped the tower catch and splashed down in the Gulf/.test(a.appJs), "the logged story is the confirmed-outcome paragraph (booster splashed down, ship caught)");
  ok(a.sent.length === 1 && /Success/.test(a.sent[0].title) && !/both/i.test(a.sent[0].body), `result push body is a confirmed outcome: "${a.sent[0] && a.sent[0].body}"`);

  // C. same moment, but the booster result is not in the hero data yet → blocked, left for review, no push; fixed next run
  const half = clone(FX); half.hero_lines["15"] = half.hero_lines["15"].filter((o) => !(o.stage === "booster" && o.kind === "result")); half.mission_updates = { 15: (half.mission_updates["15"] || []).filter((u) => !/booster|super heavy/i.test(u.line) || !/splash|catch|caught/i.test(u.line)) };
  const b = await logRun({ road: half, label: "booster result missing: LL2 says Success but only the ship has a confirmed outcome" });
  ok(b.commits.length === 1 && /story: ""/.test(b.appJs), "flight logged with an EMPTY story (never invented)");
  ok(b.reviews.length === 1 && /booster/.test(b.reviews[0].reason), `left for review: "${b.reviews[0] && b.reviews[0].reason}"`);
  ok(b.sent.length === 0, "no result push without a confirmed story");

  // D. no hero data at all
  const c = await logRun({ road: {}, label: "no hero data at all" });
  ok(/story: ""/.test(c.appJs) && c.reviews.length === 1 && c.sent.length === 0, "no hero data → empty story, review, no push");

  // E. tracker/Elon-only result lines are not confirmed
  const rumour = clone(FX); delete rumour.hero_lines; rumour.mission_updates = { 15: [
    { topic: "landing", line: "Both Booster 22 and Ship 42 will return to the launch site (Elon Musk, 14 Nov).", at: "2026-11-14T21:20:00.000Z", src: "@elonmusk" },
    { topic: "landing", line: "Ship 42 catch anticipated at Pad 2 (SpaceflightNow, 14 Nov).", at: "2026-11-14T21:05:00.000Z", src: "@SpaceflightNow" }] };
  const e = await logRun({ road: rumour, label: "only an Elon plan + an 'anticipated' line" });
  ok(/story: ""/.test(e.appJs) && e.sent.length === 0, "plan / rumour lines never become a result story");

  // F. deploy gate: the same false story in FLIGHTS of the CURRENT tree is a NEW validator error → commit blocked
  const mk = (story) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "sg-")); for (const f of ["app.js", "road.json", "road-media.json", "notifications.json", "index.html"]) fs.copyFileSync(path.join(__dirname, "..", f), path.join(d, f));
    fs.mkdirSync(path.join(d, "data")); for (const f of ["health.json", "needs-review.json"]) fs.copyFileSync(path.join(__dirname, "..", "data", f), path.join(d, "data", f)); fs.cpSync(__dirname, path.join(d, "scripts"), { recursive: true });
    const rj = JSON.parse(fs.readFileSync(path.join(d, "road.json"), "utf8")); rj.archive["15"].hero = { hero_lines: FX.hero_lines["15"], mission_updates: FX.mission_updates["15"] }; // what rollover (heroArchive) keeps for a flight
    fs.writeFileSync(path.join(d, "road.json"), JSON.stringify(rj)); let app = fs.readFileSync(path.join(d, "app.js"), "utf8"); const re = /(\{\s*n:\s*15,[^]*?story:\s*")((?:[^"\\]|\\.)*)(")/; if (!re.test(app)) throw new Error("F15 not in FLIGHTS"); app = app.replace(re, (_, a, _s, c) => a + story.replace(/"/g, '\\"') + c); fs.writeFileSync(path.join(d, "app.js"), app); return d; };
  const goodDir = mk("Booster 22 skipped the tower catch and splashed down in the Gulf, while Ship 42 pressed on to orbit, deployed 26 Starlink V3 satellites, flew the longest Starship mission ever and was caught by the tower.");
  const badDir = mk(FALSE_STORY);
  const g = gate.check({ root: badDir, files: ["app.js"], baseline: goodDir, now: "2026-11-21T18:30:00Z" });
  ok(!g.ok && g.newErrors.some((x) => x.id === "H7-story-claims"), `deploy gate blocks a commit that logs the false story: ${g.newErrors.map((x) => x.id).join(", ")}`);
  const g2 = gate.check({ root: goodDir, files: ["app.js"], baseline: goodDir, now: "2026-11-21T18:30:00Z" });
  ok(g2.ok, "…and passes the true story");
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
