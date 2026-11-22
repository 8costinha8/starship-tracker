// Regression for the 22 Nov audit of the last 10 pushes (Scripto: 7 correct, 3 wrong: #4 "plans to catch", #5 "chopsticks first Starship", #8 "Super Heavy safe abort").
// Replays all 10 through: tagging (scope.feedFlight / missionTarget), vehicleOf, push-gate recap/stale (official accounts included), push-guards, news dedupe memory,
// mission-update routing in check-road, prompt wording, relative dates. Offline, fake send, saved/fixture data only.
process.env.PUSH_SHADOW = "0"; process.env.PUSH_GUARDS = "on";
const fs = require("fs"), os = require("os"), path = require("path");
const scope = require("./scope.js"), pp = require("./push-policy.js"), gate = require("./push-gate.js"), G = require("./push-guards.js"), news = require("./news.js");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log("  ✅ " + m); } else { fail++; console.log("  ❌ " + m); } };
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "push-audit-22nov.json"), "utf8"));
const road = { flight: 16, vehicles: ["B23", "S43"], categories: [], mission_alerts: { flight: 16, liftoff_actual: null } };
const C = (n) => fx.cases.find((c) => c.n === n);
const WRONG = [4, 5, 8], RIGHT = [1, 2, 3, 6, 7, 9, 10];

console.log("(a) feedFlight honours an explicit Flight N, 'last week', and past tense:");
const tag = (n) => scope.feedFlight(road, C(n).push.body, C(n).source_text);
ok(tag(5).flight === 15 && tag(8).flight === 15 && tag(9).flight === 15, `#5 chopsticks → Flight ${tag(5).flight}, #8 Super Heavy abort → Flight ${tag(8).flight}, #9 "on Flight 15" → Flight ${tag(9).flight} (all were 16)`);
ok(tag(3).flight === 15, `#3 Elon's heat-shield review (source names Ship 42) → Flight ${tag(3).flight} (was 16)`);
ok(scope.feedFlight(road, "Booster 23 static fire complete.").flight === 16 && scope.feedFlight(road, "SpaceX may fly Flight 16 with Booster 23 and Ship 43.").flight === 16, "a real Flight 16 line still tags 16");
ok(scope.feedFlight(road, "Flight 16 hardware is ready, a year after Flight 15.").flight === 16, "a line naming BOTH flights stays with the current one");
ok(scope.feedFlight(road, "Super Heavy booster caught by the tower.").flight === 15, "past-tense catch before the current flight lifts off → previous flight");
ok(scope.feedFlight({ ...road, mission_alerts: { flight: 16, liftoff_actual: "2026-12-01T01:00:00Z" } }, "Super Heavy booster caught by the tower.").flight === 16, "…but after Flight 16's liftoff the same words are Flight 16");
ok(scope.feedFlight(road, "SpaceX plans to catch a Starship from space.").flight === 16, "a plan is not a recap");

console.log("\n(b) vehicleOf: a bare Super Heavy / ship is not the current vehicle unless the text is about the current flight:");
const ctx = { flight: 16, live: false };
ok(pp.vehicleOf(C(8).push.body, road.vehicles, ctx) === "booster", `#8 "Super Heavy booster performed safe abort…" → "${pp.vehicleOf(C(8).push.body, road.vehicles, ctx)}" (was B23)`);
ok(pp.vehicleOf(C(9).push.body, road.vehicles, ctx) === "F15-booster", `#9 "Super Heavy and Starship on Flight 15" → "${pp.vehicleOf(C(9).push.body, road.vehicles, ctx)}" (was B23)`);
ok(pp.vehicleOf("The booster is on the pad for static fire.", road.vehicles, ctx) === "B23", "an ordinary bare 'booster' line still means the current booster");
ok(pp.vehicleOf("Super Heavy splashed down.", road.vehicles, { flight: 16, live: true }) === "B23", "during Flight 16 itself a bare 'Super Heavy' is B23");
ok(pp.vehicleOf("the booster was lost", road.vehicles) === "B23", "no ctx → old behaviour (existing callers unchanged)");
ok(pp.classify({ title: "🚀 Starship", body: C(8).push.body, at: C(8).push.at }, { vehicles: road.vehicles, flight: 16, live: false }).key.startsWith("booster|"), "so the push key is no longer B23|flight_results");

console.log("\n(c) recap check: broader, official accounts included:");
const asPost = (n) => ({ ...C(n).push, source_text: C(n).source_text, author: (String(C(n).push.url).match(/x\.com\/([^/]+)\//) || [])[1] });
for (const n of [5, 8]) {
  const st = gate.staleCheck(asPost(n), fx.history, { vehicles: road.vehicles, flight: 16 });
  ok(st.stale && gate.isOfficial(asPost(n)), `#${n} (${asPost(n).author}, official) → stale: ${st.reason}`);
}
(async () => {
  for (const n of [5, 8]) { const g = await gate.evaluate(asPost(n), { history: fx.history, vehicles: road.vehicles, flight: 16, now: Date.parse(C(n).push.sent_at) }); ok(g.action === "drop", `#${n} gate.evaluate → ${g.action} (${g.reason}); the official-source bypass no longer applies`); }
  for (const n of [3, 9]) { const g = await gate.evaluate(asPost(n), { history: fx.history, vehicles: road.vehicles, flight: 16, now: Date.parse(C(n).push.sent_at) }); ok(g.action === "send", `#${n} (official, not a recap) still → ${g.action}`); }
  ok(gate.isRecap({ body: "Highlights from Flight 15.", source_text: "" }) && gate.isRecap({ body: "x", source_text: "Relive the catch" }) && !gate.isRecap({ body: "Booster 25's LOX tank was moved to Megabay 1.", source_text: "…moved to Megabay 1 yesterday" }), "recap words: highlights / relive / last week yes; 'yesterday' alone no (a day-old report is still news)");

  console.log("\nall 10 through the whole path (gate + guards), fake send:");
  const sentNow = [];
  for (const c of fx.cases) {
    const n = asPost(c.n); const now = Date.parse(c.push.sent_at);
    const gstate = {}; let g = await gate.evaluate(n, { history: fx.history, vehicles: road.vehicles, flight: 16, now, state: gstate });
    if (g.action === "hold") g = await gate.evaluate(n, { history: fx.history, vehicles: road.vehicles, flight: 16, now: now + 16 * 60000, state: gstate }); // the hold passes after one 15-min run, as it did live ("hold passed (1 run)")
    const v = g.action === "send" ? G.evaluate(n, { history: fx.history, now, road, sourceText: c.source_text }) : { action: "silent", rule: "gate" };
    const sends = g.action === "send" && v.action !== "silent";
    if (sends) sentNow.push(c.n);
    ok(WRONG.includes(c.n) ? !sends : sends, `#${c.n} ${WRONG.includes(c.n) ? "WRONG one" : "correct one"} → ${sends ? "sends" : "silent (" + (g.action !== "send" ? "gate: " + g.reason : "guard " + v.rule + ": " + v.reason) + ")"}`);
  }
  ok(JSON.stringify(sentNow) === JSON.stringify(RIGHT), `exactly the 7 correct pushes send: ${sentNow.join(",")}`);

  console.log("\n(d) news dedupe memory ≥ 14 days, keyed by flight + event (not vehicle):");
  ok(news.NEWS_MEMORY_H >= 14 * 24, `NEWS_MEMORY_H = ${news.NEWS_MEMORY_H} h (was 48)`);
  const NOW = Date.parse("2026-11-19T20:50:00Z"), iso = (d) => new Date(NOW - d * 86400000).toISOString();
  const item = { key: "x:8", title: "Super Heavy booster performed safe abort", text: "Super Heavy booster performed a safe abort and splashed down.", url: "https://x.com/SpaceX/status/2123516375805379040", publishedAt: new Date(NOW - 1800000).toISOString(), src: "X @SpaceX", tier: "official" };
  const reply = [{ item: 1, push: true, dup: null, story: "f15-booster-splashdown-recap", headline: "Super Heavy booster performed safe abort and splashed down off Starbase.", reason: "x" }];
  const prior = (d, extra = {}) => ({ sent: [{ key: "x:old", story: "b22-splash", headline: "Booster 22 splashed down in the Gulf.", src: "X @SpaceX", at: iso(d), fkey: "F15|flight_results", ...extra }], seen: [], day: news.londonDay(NOW), count: 0, pending: [] });
  const r1 = news.decideNews([item], reply, prior(5), NOW, () => {}, { road });
  ok(r1.length === 0, "same flight + event (Flight 15 results) pushed 5 days ago → skipped, although the vehicle differs (booster vs ship)");
  const r2 = news.decideNews([item], reply, prior(15), NOW, () => {}, { road });
  ok(r2.length === 1 || r2.length === 0, `15 days later it is outside the memory (${r2.length ? "allowed to proceed" : "still held back by the recap-wording check"})`);
  const kept = news.trimNews(prior(13), NOW).sent.length, dropped = news.trimNews(prior(15), NOW).sent.length;
  ok(kept === 1 && dropped === 0, "trimNews keeps 13-day-old memory, drops 15-day-old");
  ok(/last 14 days/.test(news.buildNewsPrompt([item], [{ src: "X @SpaceX", headline: "h", at: iso(10) }])) && /recap/.test(news.buildNewsPrompt([item], [])), "the news prompt says 14 days, dates each recent push, and forbids recaps");
  const r3 = news.decideNews([{ ...item, key: "x:9", text: "Ship 44 rolled out. Moved to Megabay 1 yesterday.", title: "Ship 44 rolled out", publishedAt: new Date(NOW - 1800000).toISOString() }], [{ item: 1, push: true, story: "s44", headline: "Ship 44 rolled out to Megabay 1.", reason: "x" }], prior(5), NOW, () => {}, { road });
  ok(r3.length === 1 && /yesterday\.$/.test(r3[0].body) && !!r3[0].event_at, `(g) the source's "yesterday" is kept ("${r3[0] && r3[0].body}") and the item is dated by it (event_at ${r3[0] && r3[0].event_at && r3[0].event_at.slice(0, 10)})`);
  const feedRoad = JSON.parse(JSON.stringify(road)); feedRoad.feed_items = [];
  const ps = require("./push-sync.js").addFeedItem(feedRoad, { ...r3[0], kind: "news" });
  ok(feedRoad.feed_items[0].date === "18 Nov" && feedRoad.feed_items[0].at === r3[0].at, `feed item date = "${feedRoad.feed_items[0].date}" (the day "yesterday" points to), at = the post time`);

  console.log("\n(e) prompt + mission-update routing:");
  const xfSrc = fs.readFileSync(path.join(__dirname, "x-first.js"), "utf8");
  ok(!/SpaceX plans to try catching/.test(xfSrc) && !/attempting a double catch on Flight \d/.test(xfSrc) && /UPCOMING Flight/.test(xfSrc) && /ONLY when the post itself says so/.test(xfSrc), "x-first prompt: the 'SpaceX plans to try catching…' example is gone; mission-updates are upcoming-flight, plan wording only if the post says it");
  const roadMod = require("./check-road.js");
  const NOWR = Date.parse("2026-11-22T12:00:00Z"), ago = (h) => new Date(NOWR - h * 3600000).toISOString();
  const users = [{ id: "1", username: "elonmusk", name: "Elon" }, { id: "2", username: "SpaceX", name: "SpaceX" }, { id: "3", username: "NASASpaceflight", name: "NSF" }];
  const P = (id, uid, h, text) => ({ id, author_id: uid, created_at: ago(h), text });
  const page = (posts) => ({ ok: true, status: 200, json: async () => ({ data: posts, meta: { newest_id: posts[0] && posts[0].id }, includes: { users } }) });
  const V = {
    p4: { kind: "mission-update", topic: "catch", text: "SpaceX plans to catch a Starship from space", attribution: "Elon Musk" },
    p5: { kind: "mission-update", topic: "catch", text: "The chopsticks caught their first Starship", attribution: "SpaceX" },
    p6: { kind: "mission-update", topic: "catch", text: "Flight 16 targets a catch of both stages", attribution: "SpaceX" },
  };
  const ask = async (prompt) => ({ entries: [...prompt.matchAll(/^(\d+)\. @\S+ \S+ \[[^\]]*\]: .*?#(\w+)/gm)].map((m) => ({ item: +m[1], kind: "skip", stage: null, hardware: null, text: null, status: null, event: null, topic: null, attribution: null, reason: "x", ...V[m[2]] })) });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "audit-"));
  const live = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8")); delete live.mission_updates; live.flight = 16; live.vehicles = ["B23", "S43"]; live.mission_alerts = { flight: 16, liftoff_actual: null };
  const roadPath = path.join(tmp, "road.json"); fs.writeFileSync(roadPath, JSON.stringify(live)); fs.copyFileSync(path.join(__dirname, "..", "app.js"), path.join(tmp, "app.js"));
  let stored = { seen: [], news: { seen: [], pending: [], sent: [], count: 0, day: "2026-11-22" }, xFirst: { sinceId: "100", seen: [] }, lastRun: ago(0.25) };
  let xPage; const sent = [];
  const base = { xFirst: true, mode: "dry-run", roadPath, appJsPath: path.join(tmp, "app.js"), sources: [], next: null, xToken: "fake", now: () => NOWR, askXFirst: ask, askNews: async () => [], askDates: async () => [], xFetch: async () => xPage, linkFetch: null,
    deps: { loadState: async () => JSON.parse(JSON.stringify(stored)), saveState: async (s) => { stored = JSON.parse(JSON.stringify(s)); }, push: async (n) => sent.push(n) }, commit: () => {} };
  const lines = () => (JSON.parse(fs.readFileSync(roadPath, "utf8")).mission_updates || {})[16] || [];
  xPage = page([P("401", "1", 1, "Catching a Starship from space #p4")]); await roadMod.run(base);
  ok(lines().length === 0, "#4 caption 'Catching a Starship from space' read as a plan → NO line on Flight 16's card, no 'Flight 16 update' push");
  xPage = page([P("402", "2", 0.8, "The Starbase tower chopsticks catching their first Starship. #p5")]); const rr = await roadMod.run(base);
  ok(lines().length === 0 && !(rr.notifications || []).some((n) => n.title === "Flight 16 update"), "#5-style recap classified as mission-update → re-routed (no line on Flight 16's card)");
  xPage = page([P("403", "2", 0.5, "Flight 16 will attempt to catch both stages. #p6")]); const r6 = await roadMod.run(base);
  ok(lines().length === 1 && /Flight 16 targets a catch/.test(lines()[0].line) && (r6.notifications || []).some((n) => n.title === "Flight 16 update"), "a genuine Flight 16 plan (post says 'will attempt') still becomes a line + one push");
  console.log(`\n${fail ? "❌" : "✅"} ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
