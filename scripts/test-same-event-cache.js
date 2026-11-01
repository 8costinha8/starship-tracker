/* same_event verdict cache (data/same-event-cache.json) + per-run cap. Offline, mocked X and Grok, no pushes.
   node scripts/test-same-event-cache.js */
const fs = require("fs"), os = require("os"), path = require("path"), mw = require("./media-watch.js"), SEC = require("./same-event-cache.js");
let pass = 0, fail = 0; const check = (ok, m) => { if (ok) { pass++; console.log("✅ " + m); } else { fail++; console.log("❌ " + m); } };
const NOW = Date.parse("2026-10-24T15:30:00Z");
const blob = { id: "2113991846187934011", author_id: "b", created_at: "2026-10-24T13:51:46.000Z", text: "Booster 22 is being lifted onto Pad 2", attachments: { media_keys: ["mb1"] }, public_metrics: { like_count: 52, repost_count: 2, impression_count: 835 } };
const media = [{ media_key: "mb1", type: "photo", url: "https://pbs.twimg.com/media/A.jpg" }, { media_key: "mc1", type: "photo", url: "https://pbs.twimg.com/media/B.jpg" }];
const users = [{ id: "b", username: "Blobifie" }, { id: "c", username: "colleenadastra" }, { id: "sx", username: "SpaceX" }, { id: "lp", username: "LabPadre" }];
const card = (id, text) => ({ id, date: "24 Oct", at: "2026-10-24T13:51:46.000Z", text, x_text: text, x_post: { post_id: blob.id, url: "https://x.com/Blobifie/status/" + blob.id },
  media_override: { post_url: "https://x.com/Blobifie/status/" + blob.id, post_id: blob.id, author: "Blobifie", type: "photo", image: media[0].url } });
const road = (cards) => ({ flight: 15, categories: [{ id: "pad", name: "pad", history: cards }, { id: "date", history: [] }] });
const post = (id, user, at, text) => ({ id, author_id: user, created_at: at, text, attachments: { media_keys: ["mc1"] }, public_metrics: { like_count: 500, retweet_count: 50, impression_count: 50000 } });
let sameN = 0, visN = 0, verdict = false;
const ask = { same: async () => { sameN++; return { same: verdict }; }, vision: async () => { visN++; return { shows: true, confidence: 0.95, quality: 5, collage: false }; } };
const go = (r, st, posts, now, cache, maxSame) => mw.runMediaWatch(r, st, { token: "t", now, ask, picks: [], log: () => {}, sameCache: cache, ...(maxSame ? { maxSame } : {}),
  fetchFn: async (url) => ({ ok: true, json: async () => ({ data: /search\/recent/.test(url) ? posts : [blob], includes: { media, users } }) }) });
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sec-")), file = path.join(dir, "same-event-cache.json");
  const r = road([card("k1", "Booster 22 was lifted onto Pad 2."), card("k2", "Booster 22 lift 2.")]), p1 = post("9001", "c", "2026-10-24T14:44:00.000Z", "Lift! B22 has been lifted onto Pad 2.");
  // run 1: 2 new pairs → 2 calls, saved to the repo file
  let cache = SEC.load(file); await go(r, {}, [p1], NOW, cache); SEC.save(cache, file);
  check(sameN === 2 && Object.keys(JSON.parse(fs.readFileSync(file, "utf8")).entries).length === 2, "new post: 2 same_event calls, 2 verdicts stored in the cache file");
  // repeat runs (fresh process state, cache from the file): 0 calls
  sameN = 0; for (let i = 1; i <= 3; i++) { cache = SEC.load(file); const res = await go(r, {}, [p1], NOW + i * 3600e3, cache); if (i === 3) check(res.sameCalls === 0 && res.sameCached === 2, "cached run reports 0 calls, 2 cached verdicts"); }
  check(sameN === 0, "3 repeat runs (state wiped, cache from the repo file): 0 same_event calls");
  // edited post: only that post's pairs re-judged (1 card → 1 call)
  const r1 = road([card("k1", "Booster 22 was lifted onto Pad 2.")]); cache = SEC.load(file);
  sameN = 0; await go(r1, {}, [{ ...p1, text: "Lift! B22 has been lifted onto the Pad 2 launch mount (edited)." }], NOW + 5 * 3600e3, cache);
  check(sameN === 1 && cache.dirty, "edited post: exactly 1 same_event call (re-judged), cache updated");
  sameN = 0; await go(r1, {}, [{ ...p1, text: "Lift! B22 has been lifted onto the Pad 2 launch mount (edited)." }], NOW + 6 * 3600e3, cache);
  check(sameN === 0, "after re-judging, the edited post is cached too (0 calls)");
  // cached verdict = same outcome as fresh: a 'same' verdict leads to the same swap either way
  verdict = true; const rA = road([card("s1", "Booster 22 was lifted onto Pad 2.")]), rB = road([card("s1", "Booster 22 was lifted onto Pad 2.")]); const pS = post("9100", "c", "2026-10-24T14:50:00.000Z", "B22 lifted onto Pad 2.");
  const cA = SEC.load(path.join(dir, "none.json")); const fresh = await go(rA, {}, [pS], NOW, cA); sameN = 0;
  const cached = await go(rB, {}, [pS], NOW, cA);
  check(sameN === 0 && fresh.swapped.length === 1 && cached.swapped.length === 1 && rA.categories[0].history[0].media_override.image === rB.categories[0].history[0].media_override.image, "cached 'same' verdict gives the identical swap as a fresh one");
  verdict = false; const cN = SEC.load(path.join(dir, "none2.json")), rN = road([card("n1", "Booster 22 was lifted onto Pad 2.")]); await go(rN, {}, [pS], NOW, cN); const rN2 = road([card("n1", "Booster 22 was lifted onto Pad 2.")]); sameN = 0;
  const cn2 = await go(rN2, {}, [pS], NOW, cN); check(sameN === 0 && cn2.swapped.length === 0 && rN2.categories[0].history[0].media_override.image === media[0].url, "cached 'not same' verdict: no swap, same as fresh");
  // cap: 30 pairs, cap 20 → 20 calls, rest queued; newest Tier 1 first, then Tier 2; the next run asks only the 10 left
  const cards = Array.from({ length: 10 }, (_, i) => card("c" + i, "Booster 22 lift " + i)), rc = road(cards), st = {}, cc = SEC.load(path.join(dir, "cap.json"));
  const order = []; const ask2 = { same: async (pr) => { order.push(pr); return { same: false }; }, vision: ask.vision };
  const run2 = (posts, now) => mw.runMediaWatch(rc, st, { token: "t", now, ask: ask2, picks: [], log: () => {}, sameCache: cc,
    fetchFn: async (url) => ({ ok: true, json: async () => ({ data: /search\/recent/.test(url) ? posts : [blob], includes: { media, users } }) }) });
  const sx = post("9201", "sx", "2026-10-24T14:00:00.000Z", "Booster 22 lifted 9201"), lp = post("9202", "lp", "2026-10-24T14:10:00.000Z", "Booster 22 lifted 9202"), old = post("9203", "c", "2026-10-24T14:20:00.000Z", "Booster 22 lifted 9203");
  const a = await run2([old, lp, sx], NOW);
  check(order.length === SEC.MAX_SAME && a.sameCalls === SEC.MAX_SAME, `cap holds: ${SEC.MAX_SAME} same_event calls for 30 pairs`);
  check(order.slice(0, 10).every((o) => /9201/.test(o)) && order.slice(10, 20).every((o) => /9202/.test(o)), "priority: Tier 1 (SpaceX) first, then Tier 2 (LabPadre); the tracker post waits");
  check(st.mediaWatch.pending.some((p) => p.post_id === "9203"), "leftovers queued for the next run");
  order.length = 0; const b = await run2([], NOW + 15 * 60000);
  check(order.length === 10 && order.every((o) => /9203/.test(o)) && b.sameCalls === 10, "next run: only the 10 queued pairs are asked");
  // per-purpose GROK_CALLS lines
  const w = require("./writer.js"); check(typeof w.grokPurposeLines === "function" && Array.isArray(w.grokPurposeLines()) && /purpose=\$\{k\}/.test(fs.readFileSync(path.join(__dirname, "writer.js"), "utf8")), "GROK_CALLS per-purpose lines available (purpose=same_event …)");
  check(/same-event cache/.test(fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8")) && /data\/same-event-cache\.json/.test(SEC.FILE.replace(/\\/g, "/")), "checker commits data/same-event-cache.json");
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
