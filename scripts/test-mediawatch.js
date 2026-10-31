// Offline tests for the media upgrade watch (scripts/media-watch.js). Mocked X + mocked vision, no network.
//   node scripts/test-mediawatch.js        exit 1 if any check fails
const fs = require("fs"), path = require("path");
const mw = require("./media-watch.js");
const ROOT = path.join(__dirname, "..");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const NOW = Date.parse("2026-10-24T15:30:00Z");

// fixture: the Blobifie B22 Pad-2 card and Colleen's lift post (real numbers from 24 Oct)
const blob = { id: "2113991846187934011", author_id: "b", created_at: "2026-10-24T13:51:46.000Z", text: "Booster 22 is being lifted onto Pad-2", attachments: { media_keys: ["mb1"] },
  public_metrics: { like_count: 52, repost_count: 2, impression_count: 835 } };
const colleen = { id: "2114005088653963704", author_id: "c", created_at: "2026-10-24T14:44:24.000Z", text: "Lift! B22 has been lifted onto the Pad 2 OLM in preparation for testing.",
  attachments: { media_keys: ["mc1", "mc2"] }, public_metrics: { like_count: 191, retweet_count: 26, impression_count: 6691 } };
const media = [{ media_key: "mb1", type: "photo", url: "https://pbs.twimg.com/media/HVZoSvdakAAst89.jpg" },
  { media_key: "mc1", type: "photo", url: "https://pbs.twimg.com/media/HVZzspJWEAA6PjD.jpg" }, { media_key: "mc2", type: "photo", url: "https://pbs.twimg.com/media/HVZzuQbXQAAUzqy.jpg" }];
const users = [{ id: "b", username: "Blobifie" }, { id: "c", username: "colleenadastra" }, { id: "z", username: "randomfan" }];
const card = () => ({ id: "x-1", date: "24 Oct", at: "2026-10-24T13:51:46.000Z", text: "Booster 22 is being lifted onto Pad-2.", x_text: "Booster 22 is being lifted onto Pad-2.",
  x_post: { post_id: blob.id, url: "https://x.com/Blobifie/status/" + blob.id }, media_override: { post_url: "https://x.com/Blobifie/status/" + blob.id, post_id: blob.id, author: "Blobifie", type: "photo", image: media[0].url } });
const road = (h, cat = "pad", extra = []) => ({ flight: 15, categories: [{ id: cat, name: cat, history: [h, ...extra] }, { id: "date", history: [] }] });
function fakeX(searchPosts) {
  const calls = [];
  const fetchFn = async (url) => { calls.push(url); const isSearch = /search\/recent/.test(url);
    return { ok: true, json: async () => ({ data: isSearch ? searchPosts : [blob], includes: { media, users } }) }; };
  return { fetchFn, calls };
}
const VQ = { [media[0].url]: { shows: true, confidence: 0.9, quality: 2, collage: true, seen: "livestream collage" },
  [media[1].url]: { shows: true, confidence: 0.85, quality: 4, collage: false, seen: "B22 engine section" },
  [media[2].url]: { shows: true, confidence: 0.95, quality: 5, collage: false, seen: "B22 on Pad 2 OLM, wide" } };
const ask = (over = {}) => ({ vision: async (_p, url) => ({ ...VQ[url], ...(over[url] || {}) }), same: async () => ({ same: true }) });
const run = async (r, posts, opts = {}) => { const x = fakeX(posts); const st = opts.state || {}; const res = await mw.runMediaWatch(r, st, { token: "t", fetchFn: x.fetchFn, ask: opts.ask || ask(), picks: opts.picks || [], now: opts.now || NOW, log: () => {} }); return { res, calls: x.calls, st }; };

(async () => {
  // Colleen fixture → swap to photo 2
  { const h = card(), r = road(h); const { res, calls } = await run(r, [colleen]);
    check(res.swapped.length === 1 && h.media_override.image === media[2].url && h.media_override.post_url === "https://x.com/colleenadastra/status/2114005088653963704" && h.media_override.author === "colleenadastra" && h.media_override.auto === true, "Colleen's lift post replaces the Blobifie collage with her photo 2 (wide B22 on Pad 2)");
    check(h.text === "Booster 22 is being lifted onto Pad-2." && h.x_text === h.text, "card text unchanged");
    check(calls.length === 2 && /\/2\/tweets\?/.test(calls[0]) && /search\/recent/.test(calls[1]) && calls.every((u) => /api\.x\.com\/2\//.test(u)), "at most 2 X calls per watch (metrics refresh + one search)");
    const q = new URL(calls[1]).searchParams.get("query");
    check(/from:colleenadastra/.test(q) && /from:SpaceX/.test(q) && /from:Blobifie/.test(q) && /has:media/.test(q) && /"Booster 22"/.test(q) && q.length <= 512, "search covers trackers + tiers, media only, the card's vehicle");
    check(typeof h.media_override.image === "string" && !Array.isArray(h.media_override.image) && !/[?&](brightness|filter)/.test(h.media_override.image), "one original X image per card (natural brightness)"); }
  // weaker / equal candidate ignored; never downgrade
  { const h = card(); h.media_override = { ...h.media_override, author: "colleenadastra", quality: 5, media_score: 99999, auto: true, post_id: "999" }; const r = road(h);
    const { res } = await run(r, [colleen]); check(!res.swapped.length && h.media_override.post_id === "999", "a weaker candidate never replaces a better picture (no downgrade)"); }
  { const h = card(), r = road(h); const { res } = await run(r, [colleen], { ask: ask({ [media[2].url]: { quality: 1 }, [media[1].url]: { quality: 1 } }) });
    check(!res.swapped.length && h.media_override.author === "Blobifie", "lower quality than the current picture: no swap even with more engagement"); }
  check(mw.isBetter({ score: 150, quality: 3 }, { score: 100, quality: 3 }) && !mw.isBetter({ score: 149, quality: 5 }, { score: 100, quality: 3 }) && !mw.isBetter({ score: 300, quality: 2 }, { score: 100, quality: 3 }), "needs ≥ 1.5× score AND quality not lower");
  // locks
  { const h = card(), r = road(h); const { res } = await run(r, [colleen], { picks: [{ post_id: blob.id, post_url: "https://x.com/Blobifie/status/" + blob.id }] });
    check(!res.swapped.length && h.media_override.author === "Blobifie", "a manual road-media.json pick is never replaced"); }
  { const h = card(); h.media_override.keep_image = true; const r = road(h); const { res } = await run(r, [colleen]);
    check(!res.swapped.length && h.media_override.author === "Blobifie", "keep_image is never replaced"); }
  { const h = { ...card(), text: "Ship 42 completed further cryo tests.", x_text: "Ship 42 completed further cryo tests." }; const r = road(h, "cryo");
    const post = { ...colleen, text: "Ship 42 cryo test at Massey's tonight" }; const before = JSON.stringify(h.media_override); const { res, st } = await run(r, [post]);
    check(!res.swapped.length && res.proposals.length === 1 && JSON.stringify(h.media_override) === before && st.mediaWatch.proposals.length === 1, "ship cryo card: logged proposal only, no swap"); }
  // Grok savers: (post, card) verdicts cached across watches; per-watch cap on Grok calls
  { let n = 0; const counting = { vision: async (_p, url) => { n++; return { ...VQ[url] }; }, same: async () => { n++; return { same: false }; } };
    const h = card(), r = road(h), state = {}; await run(r, [colleen], { ask: counting, state });
    const first = n; await run(r, [colleen], { ask: counting, state, now: NOW + mw.EVERY_MS + 1 });
    check(first === 1 && n === 1, "a 'not the same event' verdict is cached: the next hourly watch asks Grok nothing"); }
  { let n = 0; const counting = { vision: async (_p, url) => { n++; return { ...VQ[url] }; }, same: async () => { n++; return { same: true }; } };
    const many = Array.from({ length: 30 }, (_, i) => ({ ...card(), id: "c" + i, text: "Booster 22 lift " + i }));
    const r = road(many[0], "pad", many.slice(1)); const { res } = await run(r, [colleen], { ask: counting });
    check(n <= mw.MAX_ASKS && res.deferred > 0, `Grok calls per watch capped at ${mw.MAX_ASKS} (rest deferred)`); }
  // 31 Oct: cache skips only judged pairs; new Tier 1/2 posts first within the cap; capped items carried over, never dropped
  { let order = []; const counting = { vision: async (_p, url) => ({ ...VQ[url] }), same: async (prompt) => { order.push(prompt); return { same: false }; } };
    const mkPost = (id, user, at) => ({ id, author_id: user, created_at: at, text: "Booster 22 lifted onto Pad 2 " + id, attachments: { media_keys: ["mc1"] }, public_metrics: { like_count: 500, retweet_count: 50, impression_count: 50000 } });
    const us = [...users, { id: "sx", username: "SpaceX" }, { id: "lp", username: "LabPadre" }];
    const runU = async (r, posts, st, now) => { const fetchFn = async (url) => ({ ok: true, json: async () => ({ data: /search\/recent/.test(url) ? posts : [blob], includes: { media, users: us } }) });
      return mw.runMediaWatch(r, st, { token: "t", fetchFn, ask: counting, picks: [], now, log: () => {} }); };
    const cards = Array.from({ length: 10 }, (_, i) => ({ ...card(), id: "k" + i, text: "Booster 22 lift " + i }));
    const r = road(cards[0], "pad", cards.slice(1)), st = {};
    // run 1: an old tracker post (colleen, judged with nothing yet) + a SpaceX post + a LabPadre post; 10 cards each → 30 pairs > 16
    const cPost = { ...colleen }, sx = mkPost("9001", "sx", "2026-10-24T14:00:00.000Z"), lp = mkPost("9002", "lp", "2026-10-24T14:10:00.000Z");
    const res1 = await runU(r, [cPost, sx, lp], st, NOW);
    const firstTen = order.slice(0, 20).join("\n");
    check(order.length === mw.MAX_ASKS && order.slice(0, 10).every((o) => /9001/.test(o)) && order.slice(10).every((o) => /9002/.test(o)) && !/Lift! B22/.test(firstTen), "brand-new Tier 1 (SpaceX) then Tier 2 (LabPadre) posts are judged first within the cap; the older tracker post waits");
    check(res1.deferred > 0 && st.mediaWatch.pending.some((p) => p.post_id === cPost.id) && st.mediaWatch.pending.some((p) => p.post_id === "9002") && !st.mediaWatch.pending.some((p) => p.post_id === "9001"), "posts stopped by the cap are carried over (mw.pending), not dropped");
    // run 2: 15 min later, the search no longer returns them: the carried items still run, judged pairs are not re-asked
    order = []; const res2 = await runU(r, [], st, NOW + 15 * 60000);
    check(res2.ran && order.length === 30 - mw.MAX_ASKS && order.every((pr) => !/9001/.test(pr)), `next run: only the ${30 - mw.MAX_ASKS} unjudged pairs are asked (judged pairs skipped by the cache)`);
    check(!st.mediaWatch.pending.length && Object.keys(st.mediaWatch.judged).length === 30, "after the carry-over every (post, card) pair is judged once; nothing dropped");
    // a failed vision verdict is not cached as judged
    const st3 = {}, h3 = card(), r3 = road(h3); let fail = true;
    const flaky = { same: async () => ({ same: true }), vision: async (_p, url) => (fail ? null : { ...VQ[url] }) };
    const go = (now) => mw.runMediaWatch(r3, st3, { token: "t", fetchFn: fakeX([colleen]).fetchFn, ask: flaky, picks: [], now, log: () => {} });
    await go(NOW); const keep = h3.media_override.author; fail = false; await go(NOW + 15 * 60000);
    check(keep === "Blobifie" && h3.media_override.author === "colleenadastra", "a failed vision verdict is not cached: the post is carried over and judged next run"); }
  // sources, gates, window
  { const h = card(), r = road(h); const { res } = await run(r, [{ ...colleen, author_id: "z" }]); check(!res.swapped.length && res.skipped.some((s) => /not a watched source/.test(s)), "untrusted author rejected"); }
  { const h = card(), r = road(h); const { res } = await run(r, [{ ...colleen, public_metrics: { like_count: 29, impression_count: 1499 } }]); check(!res.swapped.length && res.skipped.some((s) => /engagement/.test(s)), "tracker below 30 likes / 1.5k views rejected"); }
  check(mw.passesGate(1, { likes: 50, views: 0 }) && mw.passesGate(1, { likes: 0, views: 3000 }) && !mw.passesGate(1, { likes: 49, views: 2999 }) && mw.passesGate(2, { likes: 30, views: 0 }) && !mw.passesGate(2, { likes: 29, views: 1499 }) && !mw.passesGate(null, { likes: 1e6, views: 1e9 }), "engagement minimums by tier (T1 50/3k, T2 + trackers 30/1.5k)");
  check(mw.sourceTier("SpaceX") === 1 && mw.sourceTier("blobifie") === 2 && mw.sourceTier("ColleenAdAstra") === "tracker" && mw.sourceTier("BocaChicaGal") === "tracker" && mw.sourceTier("StarbaseWatcher") === "tracker" && mw.sourceTier("randomfan") === null, "Tier 1/2 + MEDIA_TRACKERS (colleenadastra, StarbaseWatcher, BocaChicaGal)");
  { const h = card(), r = road(h); const { res } = await run(r, [{ ...colleen, created_at: "2026-10-26T15:00:00.000Z" }], { now: Date.parse("2026-10-26T16:00:00Z") }); check(!res.swapped.length && res.skipped.some((s) => /outside 48h/.test(s)), "post outside 48h of the event rejected"); }
  { const h = card(), r = road(h); const { res } = await run(r, [colleen], { ask: { ...ask(), same: async () => ({ same: false }) } }); check(!res.swapped.length, "a different event (same vehicle) is never used"); }
  // throttle
  { const h = card(), r = road(h); const st = { mediaWatch: { lastAt: new Date(NOW - 30 * 60000).toISOString() } }; const { res, calls } = await run(r, [colleen], { state: st });
    check(!res.ran && calls.length === 0, "hourly: a second run within the hour makes no X calls");
    const again = await run(r, [colleen], { state: { mediaWatch: { lastAt: new Date(NOW - 61 * 60000).toISOString() } } }); check(again.res.ran && again.calls.length === 2, "after an hour it runs again"); }
  // no push / flight log / credit / wiring
  const cr = fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8"), src = fs.readFileSync(path.join(__dirname, "media-watch.js"), "utf8");
  const blk = cr.slice(cr.indexOf("// 4a-mw."), cr.indexOf("// 4a-img."));
  check(blk.length > 0 && !/notifications\.|changes\.push|stampRoadEntry|deps\.push/.test(blk) && !/notification|stampRoadEntry|fcm|firebase/i.test(src.replace(/never a push|no push|touched|`changes`\/notifications/gi, "")), "a swap never sends a push (no changes/notifications touched)");
  check(/\(!opts\.sources && mode === "live"\) \|\| opts\.mediaWatch/.test(blk), "runs inside the existing 15-min check-road run (no workflow change)");
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  check(/const urlOf = \(h\) => \(h\.media_override && !h\.media_override\.credit_only && h\.media_override\.post_url\)/.test(app) && /const srcOf = \(h\) => \(h\.media_override && !h\.media_override\.credit_only \? `@\$\{h\.media_override\.author\}`/.test(app) && /aria-label=\{`\$\{isX \? "View on X" : "View source"\}\$\{who \? ": " \+ who : ""\}`\}/.test(app), "credit: View on X links to the creator's post, handle in the aria label only");
  const xf = fs.readFileSync(path.join(__dirname, "x-first.js"), "utf8");
  check((xf.match(/!lockedMedia\(h\)/g) || []).length === 2, "a later X-first merge never replaces an upgraded/keep_image picture");
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
  const b22 = live.categories.flatMap((c) => c.history || []).find((h) => h.id === "x-2113907865060819060");
  check(b22 && b22.media_override.image === "https://pbs.twimg.com/media/HVZzuQbXQAAUzqy.jpg" && b22.media_override.post_url === "https://x.com/colleenadastra/status/2114005088653963704" && b22.media_override.auto && b22.x_text === "Booster 22 is being lifted onto Pad-2.", "live road.json: B22 24 Oct Pad-2 card uses Colleen's photo 2, text unchanged");
  const RoadCard = app.slice(app.indexOf("function RoadCard("), app.indexOf("\n}\n", app.indexOf("function RoadCard(")));
  check(!/PickMedia|XMedia|<img/.test(RoadCard), "Flight Log stays text only");
  console.log(fails ? `❌ ${fails} failed` : "✅ All media watch checks passed.");
  process.exit(fails ? 1 : 0);
})();
