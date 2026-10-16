// Offline tests for X media on the Road to Flight N page (no network).
const r = require("./check-road.js");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const now = Date.now(), iso = (d) => new Date(now - d * 86400000).toISOString();
const NSF = "21292523";
const mk = () => ({ flight: 15, vehicles: ["B22", "S42"], categories: [
  { id: "cryo", name: "Cryo tests", history: [
    { date: "a", text: "Ship 42 completes a cryo test.", src: "NSF", at: iso(10), url: "https://x.com/NASASpaceflight/status/111" },
    { date: "b", text: "Ship 42 back at Massey's for cryo.", src: "NSF", at: iso(20), url: "https://example.com/a" },
    { date: "c", text: "Ship 42 cryo test again.", src: "NSF", at: iso(20.5) } ] },
  { id: "static", name: "Static fires", history: [{ date: "d", text: "Booster 22 static fire next week.", src: "NSF", at: iso(30) }] } ] });
const user = { id: NSF, name: "NSF", username: "NASASpaceflight", profile_image_url: "https://pbs.twimg.com/a.jpg" };
const vid = { media_key: "v", type: "video", preview_image_url: "https://pbs.twimg.com/p.jpg", variants: [{ content_type: "video/mp4", url: "https://v/lo.mp4", bit_rate: 1 }, { content_type: "video/mp4", url: "https://v/hi.mp4", bit_rate: 9 }] };
(async () => {
  const urls = [];
  const fetchFn = (archiveStatus) => async (url) => { urls.push(decodeURIComponent(url));
    if (/\/2\/tweets\?/.test(url)) return { ok: true, status: 200, json: async () => ({ data: [{ id: "111", author_id: NSF, created_at: iso(10), text: "Ship 42 cryo test done", attachments: { media_keys: ["v"] } }], includes: { users: [user], media: [vid] } }) };
    if (archiveStatus !== 200) return { ok: false, status: archiveStatus, json: async () => ({ title: "Forbidden" }) };
    return { ok: true, status: 200, json: async () => ({ data: [
      { id: "222", author_id: NSF, created_at: iso(20.1), text: "Ship 42 rolls to Massey's for cryo", attachments: { media_keys: ["p1", "p2"] } },
      { id: "333", author_id: NSF, created_at: iso(30), text: "Ship 40 and Booster 22 static fire prep", attachments: { media_keys: ["p3"] } },
      { id: "444", author_id: "999", created_at: iso(30), text: "Booster 22 static fire", attachments: { media_keys: ["p3"] } } ],
      includes: { users: [user], media: [{ media_key: "p1", type: "photo", url: "https://pbs.twimg.com/1.jpg" }, { media_key: "p2", type: "photo", url: "https://pbs.twimg.com/2.jpg" }, { media_key: "p3", type: "photo", url: "https://pbs.twimg.com/3.jpg" }] } }) }; };
  const road = mk(); const rw = [];
  const res = await r.backfillX(road, { token: "t", fetchFn: fetchFn(200), log: () => {}, rewrite: async (h, ps) => { rw.push(ps[0].post_id); return "Ship 42 is back at Massey's for cryo testing."; } });
  const [a, b, c] = road.categories[0].history, d = road.categories[1].history[0];
  check(res.calls === 2 && /ids=111&/.test(urls[0]) && /search\/all/.test(urls[1]) && /max_results=25/.test(urls[1]), "one batched ids lookup + one full-archive search");
  check(res.read <= 29, `posts read under 30 (${res.read})`);
  check(a.x_post && a.x_post.post_id === "111" && a.x_post.media[0].video_url === "https://v/hi.mp4" && a.x_post.media[0].poster, "stored X URL → its own post, highest-bitrate mp4 + poster");
  check(b.x_post && b.x_post.post_id === "222" && b.x_post.media.length === 2 && b.text === "Ship 42 is back at Massey's for cryo testing.", "clear match within 2 days → photos attached, text rewritten by the writer");
  check(b.src === "@NASASpaceflight" && b.url === "https://x.com/NASASpaceflight/status/222" && b.url_original === "https://example.com/a", "credit + link follow the X post (original kept as url_original)");
  check(!c.x_post, "same post never reused for another entry");
  check(!d.x_post, "post naming another vehicle (and untrusted author) → nothing");
  check([a, b, c, d].every((h) => h.xChecked), "every entry marked checked (runs once)");
  const again = await r.backfillX(road, { token: "t", fetchFn: fetchFn(200), log: () => {} });
  check(again.calls === 0, "second run → no X calls");
  const r2 = mk(); urls.length = 0;
  const res2 = await r.backfillX(r2, { token: "t", fetchFn: fetchFn(403), log: () => {} });
  check(/not available: HTTP 403/.test(res2.archive) && res2.calls === 2 && r2.categories[0].history[0].x_post && !r2.categories[0].history[1].x_post, "full-archive 403 → stops, lookup results still used");
  const r3 = mk();
  const res3 = await r.backfillX(r3, { log: () => {} });
  check(res3.calls === 0 && !r3.categories[0].history[0].xChecked, "no token → nothing, retried later");
  console.log(fails ? `\n${fails} FAILED` : "\n✅ All X media checks passed."); process.exit(fails ? 1 : 0);
})();
