/* Offline tests for "🚀 Starship" news pushes (scripts/news.js via check-road.js run()).
     node scripts/test-news.js        exit 1 if any check fails */
const fs = require("fs");
const os = require("os");
const path = require("path");
const roadMod = require("./check-road.js");
const N = require("./news.js");

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "✅" : "❌"} ${msg}`); if (!ok) failed++; };
const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "news-test-"));
const roadPath = path.join(tmp, "road.json"), appJsPath = path.join(tmp, "app.js");
fs.copyFileSync(path.join(ROOT, "road.json"), roadPath);
fs.copyFileSync(path.join(ROOT, "app.js"), appJsPath);

let stored = { seen: [] }, pushes = [], newsPrompts = [];
const deps = { loadState: async () => JSON.parse(JSON.stringify(stored)), saveState: async (s) => { stored = JSON.parse(JSON.stringify(s)); }, push: async (n) => pushes.push(n) };
const ago = (h, base = Date.now()) => new Date(base - h * 3600000).toISOString();
const it = (key, src, tier, text, h = 1, extra = {}) => ({ key, title: `${src} post`, text, url: `https://example.com/${key}`, publishedAt: ago(h), src, source: src.toLowerCase(), tier, ...extra });
async function runWith(items, answer, now) {
  pushes = []; newsPrompts = [];
  const res = await roadMod.run({ mode: "dry-run", roadPath, appJsPath, deps, next: null, commit: () => {}, mediaFor: async () => null,
    sources: [{ name: "fake", fetch: async () => items }], askClaude: async () => [],
    askNews: async (prompt) => { newsPrompts.push(prompt); return typeof answer === "function" ? answer(prompt) : answer; },
    ...(now ? { now: () => now } : {}) });
  return res;
}
const listed = (prompt) => (prompt.split("New items:")[1] || "").trim().split("\n").filter((l) => /^\d+\./.test(l));

(async () => {
  // 1. first run after deploy: seed, never push the backlog
  stored = { seen: [] };
  await runWith([it("x:1", "SpaceX", "official", "Starship Flight 15 vehicles stacked at Pad 2"), it("x:2", "NSF", "trusted", "Booster 22 rolls to Massey's for static fire")], [{ item: 1, push: true, story: "a", headline: "Starship Flight 15 vehicles stacked at Pad 2" }]);
  check(pushes.length === 0 && newsPrompts.length === 0, "first run: nothing pushed, Claude not called");
  check(stored.news && stored.news.seen.includes("x:1") && stored.news.seen.includes("x:2"), "first run: current items seeded as seen");
  // already-seen items stay quiet next run
  await runWith([it("x:1", "SpaceX", "official", "Starship Flight 15 vehicles stacked at Pad 2")], []);
  check(pushes.length === 0 && newsPrompts.length === 0, "seeded item seen again → not a candidate, no Claude call");

  // 2. dedup across sources: NSF + SpaceX on the same story → one push (SpaceX, official, wins)
  await runWith([
    it("x:10", "NSF", "trusted", "Booster 22 completed a static fire at Massey's this evening", 0.5),
    it("x:11", "SpaceX", "official", "Super Heavy Booster 22 completed a static fire at Massey's ahead of Starship Flight 15", 0.4),
  ], [
    { item: 1, push: true, dup: null, story: "b22-static", headline: "Booster 22 completed a static fire at Massey's" },
    { item: 2, push: true, dup: null, story: "b22-static", headline: "Booster 22 completed a static fire at Massey's" },
  ]);
  check(newsPrompts.length === 1, "one Claude call for the run's new items");
  check(pushes.length === 1 && pushes[0].body === "Booster 22 completed a static fire at Massey's · SpaceX", `same story from 2 sources → 1 push: "${pushes[0] && pushes[0].body}"`);
  check(pushes[0] && pushes[0].title === "🚀 Starship" && pushes[0].link === N.NEWS_LINK && /\?feed=1$/.test(pushes[0].link), "push format: 🚀 Starship, opens the Updates feed");
  // same story later from another outlet → Claude flags it dup of a recent push
  await runWith([it("rss:sn1", "SpaceNews", "trusted", "SpaceX fires Booster 22 at Massey's in a static fire test for Starship", 0.2)],
    (p) => { check(/R1\. \[SpaceX\] Booster 22 completed a static fire/.test(p), "recent pushes (48h) are sent to Claude for semantic dedup"); return [{ item: 1, push: true, dup: "R1", story: "b22-static", headline: "SpaceX fired Booster 22 at Massey's" }]; });
  check(pushes.length === 0, "same story again (new outlet) → dup of recent push → not sent");
  // same URL as a sent story under a new key → never pushed twice, not even shown to Claude
  await runWith([it("ll2:9", "NSF", "trusted", "Booster 22 static fire at Massey's", 0.2, { url: "https://example.com/x:11" })], [{ item: 1, push: true, story: "zzz", headline: "Booster 22 static fire at Massey's" }]);
  check(pushes.length === 0 && newsPrompts.length === 0, "same URL as a pushed story → skipped before Claude");

  // 3. non-Starship / trivia / untrusted filtering
  await runWith([
    it("x:20", "Elon Musk", "trusted", "Tesla Q3 deliveries were strong, thanks to the team", 0.3, { predictOnly: true }),
    it("x:21", "@randomfan", "unconfirmed", "Starship Flight 15 static fire tomorrow!!", 0.3),
    it("x:22", "Elon Musk", "trusted", "Starship is the coolest thing ever lol", 0.3, { predictOnly: true }),
  ], (p) => { const l = listed(p); check(l.length === 1 && /coolest/.test(l[0]), `only the trusted Starship item reaches Claude (${l.length})`); return [{ item: 1, push: false, reason: "meme" }]; });
  check(pushes.length === 0, "non-Starship (Tesla) and untrusted posts filtered before Claude; meme rejected by Claude");
  // ungrounded headline (number not in the item) → skipped
  await runWith([it("x:30", "NSF", "trusted", "Ship 42 moved to the launch site overnight", 0.2)], [{ item: 1, push: true, story: "s42-move", headline: "Ship 42 moved to Pad 2 for a 3 November launch" }]);
  check(pushes.length === 0, "headline with facts not in the item → not sent");

  // 4. cap: at most 6 per London day, persisted; resets the next day
  const day1 = Date.parse("2026-10-20T09:00:00Z");
  stored.news.day = N.londonDay(day1); stored.news.count = 0; stored.news.sent = [];
  const many = Array.from({ length: 8 }, (_, i) => ({ key: `cap:${i}`, title: "NSF post", text: `Starship update number ${i + 1}: Raptor engine test stand firing`, url: `https://example.com/cap${i}`, publishedAt: new Date(day1 - 600000).toISOString(), src: `Outlet${i}`, source: `o${i}`, tier: "trusted" }));
  await runWith(many, many.map((m, i) => ({ item: i + 1, push: true, story: `s${i}`, headline: `Starship update number ${i + 1}: Raptor engine test stand firing` })), day1);
  check(pushes.length === 6 && stored.news.count === 6, `8 stories in one day → 6 sent (cap persisted: ${stored.news.count})`);
  await runWith([{ ...many[0], key: "cap:x", url: "https://example.com/capx", text: "Starship Raptor engine test stand firing again today", publishedAt: new Date(day1 + 3600000 - 600000).toISOString() }], [{ item: 1, push: true, story: "later", headline: "Starship Raptor engine test stand firing again today" }], day1 + 3600000);
  check(pushes.length === 0, "same day, cap already reached → not sent");
  const day2 = Date.parse("2026-10-21T08:00:00Z");
  await runWith([{ ...many[0], key: "cap:y", url: "https://example.com/capy", text: "Starship Raptor test stand firing on a new day", publishedAt: new Date(day2 - 600000).toISOString() }], [{ item: 1, push: true, story: "nextday", headline: "Starship Raptor test stand firing on a new day" }], day2);
  check(pushes.length === 1 && stored.news.count === 1, "next London day → counter resets, push sent");

  // 5. Claude down → items retried next run, never lost or double-sent
  await runWith([it("x:40", "NSF", "trusted", "Ship 42 completed its third cryo test", 0.1)], () => { throw new Error("overloaded"); });
  check(pushes.length === 0 && stored.news.pending.some((p) => p.key === "x:40"), "Claude failure → item kept as pending");
  await runWith([], [{ item: 1, push: true, story: "s42-cryo3", headline: "Ship 42 completed its third cryo test" }]);
  check(pushes.length === 1 && stored.news.pending.length === 0, "pending item handled on the next run (1 push)");
  await runWith([it("x:40", "NSF", "trusted", "Ship 42 completed its third cryo test", 0.1)], [{ item: 1, push: true, story: "s42-cryo3", headline: "Ship 42 completed its third cryo test" }]);
  check(pushes.length === 0, "same item fetched again → never pushed twice");

  // grounding unit checks
  check(N.grounded("Flight 15 now targets 8 November", "Flight 15 is now targeting NET 8 November"), "grounded: restated item passes");
  check(!N.grounded("Flight 15 targets 9 November", "Flight 15 is now targeting NET 8 November"), "grounded: wrong number fails");
  console.log(failed ? `\n❌ ${failed} check(s) failed.` : "\n✅ All checks passed. (Offline — nothing real was fetched, saved, committed or sent.)");
  process.exit(failed ? 1 : 0);
})();
