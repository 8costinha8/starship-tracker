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
  // feed verification: date clusters, small date-bounded full-archive searches, ≤60 read, stop on 403
  {
    const fr = { flight: 15, vehicles: ["B22", "S42"], categories: [
      { id: "cryo", name: "Cryo", history: [{ date: "3–4 Sep", text: "Ship 42 completes two cryo proof tests at Massey's." }, { date: "9 Sep", text: "Ship 42 heads back to Massey's for further cryo testing." }] },
      { id: "pad", name: "Pad", history: [{ date: "1 Oct", text: "Pad 2 chopsticks maintenance." }] },
      { id: "static", name: "Static", history: [{ date: "2 Oct", text: "Booster 22 static fire soon." }] } ] };
    const q = [];
    const ff = async (url) => { const u = new URL(url); q.push(u); const st = u.searchParams.get("start_time");
      return { ok: true, status: 200, json: async () => ({ data: st < "2026-09-06" ? [{ id: "1", author_id: NSF, created_at: "2026-09-04T10:00:00Z", text: "Ship 42 completes another cryo proof test", attachments: { media_keys: ["p1"] } }]
        : st > "2026-09-20" ? [{ id: "2", author_id: NSF, created_at: "2026-10-01T10:00:00Z", text: "Pad 2 chopsticks being serviced" }] : [], includes: { users: [user], media: [{ media_key: "p1", type: "photo", url: "https://pbs.twimg.com/1.jpg" }] } }) }; };
    const vr = await r.verifyFeed(fr, { token: "t", fetchFn: ff, log: () => {}, rewrite: async () => "Ship 42 finished another cryo proof test." });
    const [h1, h2] = fr.categories[0].history, hp = fr.categories[1].history[0], hs = fr.categories[2].history[0];
    check(vr.calls === 3 && q.every((u) => /search\/all/.test(u.pathname) && u.searchParams.get("max_results") === "10" && u.searchParams.get("end_time")), "3 date clusters → 3 small, date-bounded full-archive searches");
    check(h1.x_post && h1.x_text === "Ship 42 finished another cryo proof test." && h1.text === "Ship 42 completes two cryo proof tests at Massey's.", "match → x_post + writer text in x_text; Road card text unchanged");
    check(h2.feed_hide && hp.x_post && !hp.feed_hide && hs.feed_hide, "no match → hidden from the feed; topic match without vehicle (Pad 2 chopsticks) → kept");
    check(fr.feedVerified && (await r.verifyFeed(fr, { token: "t", fetchFn: ff, log: () => {} })).calls === 0, "runs once");
    const f2 = JSON.parse(JSON.stringify({ ...fr, feedVerified: undefined })); f2.categories.forEach((c) => c.history.forEach((h) => { delete h.x_post; delete h.feed_hide; }));
    const v2 = await r.verifyFeed(f2, { token: "t", fetchFn: async () => ({ ok: false, status: 403, json: async () => ({}) }), log: () => {} });
    check(v2.calls === 1 && v2.stopped === "HTTP 403" && !f2.feedVerified, "403 → stops after one call, retried later");
  }
  {
    const jr = { feedVerified: "x", categories: [{ id: "static", name: "Static", history: [
      { date: "a", text: "B22 static fire within two weeks.", src: "@LabPadre", src_original: "NSF", url: "https://x.com/LabPadre/status/1", url_original: "https://n", x_text: "x", x_post: { post_id: "1", author: { username: "LabPadre" }, text: "3 more Raptors removed from Ship 42", media: [] } },
      { date: "b", text: "B22 static fire done.", x_text: "y", x_post: { post_id: "2", author: { username: "NASASpaceflight" }, text: "Booster 22 static fire!", media: [] } } ] }] };
    const jres = await r.judgeFeed(jr, { log: () => {}, rewrite: async (h) => (/static fire/i.test(h.x_post.text) ? "Booster 22 completed a static fire." : null) });
    const [j1, j2] = jr.categories[0].history;
    check(jres.checked === 2 && j1.feed_hide && !j1.x_post && j1.src === "NSF" && j1.url === "https://n" && j2.x_text === "Booster 22 completed a static fire." && jr.feedJudged, "writer judge: unrelated post removed (source restored), related kept + rewritten");
  }
  console.log(fails ? `\n${fails} FAILED` : "\n✅ All X media checks passed."); process.exit(fails ? 1 : 0);
})();
