// Offline tests for Road stage images (no network).
const r = require("./check-road.js");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const mk = () => ({ flight: 15, vehicles: ["B22", "S42"], categories: [
  { id: "cryo", history: [
    { date: "1 Oct", text: "Ship 42 completes a cryo test.", src: "SpaceX", url: "https://x.com/SpaceX/status/111" },
    { date: "2 Oct", text: "Booster 22 cryo test at Massey's.", src: "NSF", url: "https://x.com/NSF/status/222" },
    { date: "3 Oct", text: "Ship 42 back at Massey's.", src: "NSF", url: "https://example.com/roundup" },
    { date: "4 Oct", text: "No link entry.", src: "NSF" } ] } ] });
(async () => {
  let calls = 0;
  const fetchFn = async (url) => { calls++; check(/\/2\/tweets\?ids=111%2C222&/.test(url) && /attachments.media_keys/.test(decodeURIComponent(url)), "one batched X lookup with the media expansion");
    return { status: 200, json: async () => ({ data: [
      { id: "111", text: "Ship 42 cryo test complete", attachments: { media_keys: ["m1"] } },
      { id: "222", text: "Ship 40 rolls back to Starbase", attachments: { media_keys: ["m2"] } } ],
      includes: { media: [{ media_key: "m1", type: "video", preview_image_url: "https://pbs.twimg.com/p1.jpg", variants: [{ content_type: "video/mp4", url: "https://video.twimg.com/v.mp4", bit_rate: 832000 }] }, { media_key: "m2", type: "photo", url: "https://pbs.twimg.com/p2.jpg" }] } }) }; };
  const road = mk();
  const res = await r.backfillImages(road, { token: "t", fetchFn, mediaForFn: async () => null, log: () => {} });
  const h = road.categories[0].history;
  check(calls === 1, "exactly one X call for all X entries");
  check(h[0].image_url === "https://pbs.twimg.com/p1.jpg" && h[0].credit === "SpaceX" && h[0].link === h[0].url && h[0].media.type === "video", "video → preview image, credit + link stored");
  check(!h[1].image_url && res.rejected.some((x) => /Booster 22/.test(x)), "post naming another vehicle → rejected, no image");
  check(!h[2].image_url, "news with no clearly matching og:image → no image");
  check(!h[3].imageChecked && !h[3].image_url, "entries without a link are left alone");
  check(res.added === 1 && res.checked === 3, "counts reported");
  const again = await r.backfillImages(road, { token: "t", fetchFn, log: () => {} });
  check(again.checked === 0 && calls === 1, "backfill runs once (imageChecked)");
  const r2 = mk();
  const res2 = await r.backfillImages(r2, { log: () => {}, mediaForFn: async () => ({ type: "image", url: "https://example.com/og.jpg" }) });
  check(r2.categories[0].history[2].image_url === "https://example.com/og.jpg" && !r2.categories[0].history[0].imageChecked, "news og:image used; X entries wait when no token");
  // full X post cards: one search, strict match, triggering post wins, news fallback
  const now = Date.now(), iso = (d) => new Date(now - d * 86400000).toISOString();
  const pr = { flight: 15, vehicles: ["B22", "S42"], categories: [
    { id: "cryo", history: [{ date: "x", text: "Ship 42 back for cryo testing.", src: "NSF", at: iso(1), url: "https://example.com/a" }] },
    { id: "static", history: [{ date: "x", text: "Booster 22 static fire next week.", src: "NSF", at: iso(2), url: "https://example.com/b" }] },
    { id: "pad", history: [{ date: "x", text: "Chopsticks maintenance.", src: "NSF", at: iso(1) }] } ] };
  let urls = [];
  const xf = async (url) => { urls.push(decodeURIComponent(url)); return { ok: true, status: 200, json: async () => ({
    data: [{ id: "9", author_id: "u", created_at: iso(1.2), text: "Ship 42 rolls to Massey's for another cryo test https://t.co/abc", attachments: { media_keys: ["v"] } },
           { id: "8", author_id: "u", created_at: iso(2), text: "Ship 40 and Booster 22 static fire prep" }],
    includes: { users: [{ id: "u", name: "NSF", username: "NASASpaceflight", profile_image_url: "https://pbs.twimg.com/a.jpg" }],
      media: [{ media_key: "v", type: "video", preview_image_url: "https://pbs.twimg.com/p.jpg", variants: [{ content_type: "video/mp4", url: "https://v/lo.mp4", bit_rate: 1 }, { content_type: "video/mp4", url: "https://v/hi.mp4", bit_rate: 9 }] }] } }) }; };
  const bp = await r.backfillPosts(pr, { token: "t", fetchFn: xf, log: () => {}, newsFn: async (u) => ({ title: "News " + u, summary: "", link: u }) });
  const [c1, s1, p1] = pr.categories.map((c) => c.history[0]);
  check(bp.calls === 1 && bp.read === 2 && /start_time/.test(urls[0]) && /user\.fields=name,username,profile_image_url/.test(urls[0]), "one 7-day search with author fields");
  check(c1.x_post && c1.x_post.author.username === "NASASpaceflight" && c1.x_post.media[0].video_url === "https://v/hi.mp4" && c1.x_post.media[0].poster && !/t\.co/.test(c1.x_post.text), "matching post attached: author, highest-bitrate mp4 + poster, text");
  check(!s1.x_post && s1.news_card && s1.news_card.link === "https://example.com/b", "post naming another vehicle rejected → news fallback");
  check(!p1.x_post && !p1.news_card && bp.empty.length === 1, "no match, no link → left empty");
  const bp2 = await r.backfillPosts(pr, { token: "t", fetchFn: xf, log: () => {} });
  check(bp2.calls === 0, "backfill runs once");
  console.log(fails ? `\n${fails} FAILED` : "\n✅ All image checks passed."); process.exit(fails ? 1 : 0);
})();
