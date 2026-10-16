// Offline tests for the automatic picture picker (no network).
const fs = require("fs"), os = require("os"), path = require("path");
const r = require("./check-road.js");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const NOW = Date.parse("2026-10-16T12:00:00Z"), iso = (d) => new Date(NOW - d * 86400000).toISOString();
const user = { id: "u", name: "LabPadre", username: "LabPadre" };
const page = (posts) => ({ ok: true, status: 200, json: async () => ({ data: posts.map((p) => ({ id: p.id, author_id: "u", created_at: p.at, text: p.text, attachments: { media_keys: [p.id + "m"] } })),
  includes: { users: [user], media: posts.map((p) => ({ media_key: p.id + "m", type: p.video ? "video" : "photo", url: p.video ? undefined : `https://pbs.twimg.com/${p.id}.jpg`, preview_image_url: p.video ? `https://pbs.twimg.com/${p.id}-poster.jpg` : undefined, variants: [] })) } }) });
(async () => {
  const box = { id: "cryo", name: "Cryo tests" };
  // query
  const h = { date: "9 Oct", text: "Ship 42 heads back to Massey's for cryo testing.", at: iso(7) };
  const q = r.pickQuery(h);
  check(/S42/.test(q) && /"Ship 42"/.test(q) && /cryo/.test(q) && /Massey/.test(q) && /has:media -is:retweet -is:reply/.test(q) && /from:LabPadre OR from:RGVaerialphotos/.test(q) && /from:ZackGolden_/.test(q), "topic query: hardware + subject words, has:media, trusted photo accounts");
  // scoring
  const sc = (text, d) => r.scorePost({ text, created_at: iso(d), media: [{ type: "photo", url: "x" }] }, h, Date.parse(h.at));
  check(sc("Ship 42 on the cryo stand at Massey's", 7) === 6 && sc("Ship 42 in the Mega Bay", 30) === 3 && sc("Ship 40 cryo test", 7) <= 0 && r.scorePost({ text: "Ship 42", created_at: iso(7), media: [] }, h, Date.parse(h.at)) === -1, "score: hardware +3, subject +2, ≤7 days +1, other vehicle penalised, media required");
  // step 0
  const own = { date: "9 Oct", text: "Booster 22 static fire.", url: "https://x.com/LabPadre/status/77", x_post: { post_id: "77", url: "https://x.com/LabPadre/status/77", author: { username: "LabPadre" }, text: "B22 static fire!", media: [{ type: "video", poster: "https://pbs.twimg.com/77p.jpg", video_url: "v" }] } };
  let calls = 0;
  const s0 = await r.autoPick(own, { id: "static", name: "Static" }, { token: "t", fetchFn: async () => { calls++; return page([]); }, judge: async () => { throw new Error("no"); }, now: NOW });
  check(s0.step === "source" && s0.pick.post_id === "77" && s0.pick.media_url === "https://pbs.twimg.com/77p.jpg" && s0.pick.media_type === "video" && s0.pick.mode === "auto-source" && calls === 0, "step 0: source X post with media → its own picture (video preview), no search, no judging");
  const noMedia = { ...own, x_post: { ...own.x_post, media: [] } };
  calls = 0;
  const s0b = await r.autoPick(noMedia, { id: "static", name: "Static" }, { token: "t", fetchFn: async () => { calls++; return page([]); }, now: NOW });
  check(s0b.step === "search" && calls === 2, "source X post without media → topic search (14 days, then 45)");
  // search: strong candidate in 14 days → no widening; judge picks; vision gate passes
  const urls = []; let judged = null;
  const res = await r.autoPick(h, box, { token: "t", now: NOW,
    fetchFn: async (u) => { urls.push(new URL(u)); return page([{ id: "1", at: iso(7.2), text: "Ship 42 back on the cryo stand at Massey's" }, { id: "2", at: iso(8), text: "Ship 42 in the Mega Bay", video: true }, { id: "3", at: iso(7), text: "Ship 40 at Massey's" }]); },
    judge: async (prompt, imgs) => { judged = { prompt, imgs }; return { post_id: "1", reason: "Ship 42 on the cryo stand" }; },
    vision: async () => ({ shows: true, confidence: 0.92, seen: "Ship 42 on the stand", reason: "r" }) });
  const span = (Date.parse(urls[0].searchParams.get("end_time")) - Date.parse(urls[0].searchParams.get("start_time"))) / 86400000;
  check(res.calls === 1 && Math.round(span) === 14 && /search\/all/.test(urls[0].pathname), "strong candidate in the 14-day window → one X call, no widening");
  check(judged && judged.imgs.length === 2 && /SAME event/.test(judged.prompt) && /different ship or booster/.test(judged.prompt) && !/post_id 3/.test(judged.prompt), "one judge call with the top candidates' pictures; wrong vehicle never sent");
  check(res.pick && res.pick.post_id === "1" && res.pick.mode === "auto" && res.pick.entry_id && res.pick.media_url === "https://pbs.twimg.com/1.jpg", "winner saved as an auto pick (entry_id, post, author, media)");
  // vision gate rejects → none
  const rej = await r.autoPick(h, box, { token: "t", now: NOW, fetchFn: async () => page([{ id: "1", at: iso(7), text: "Ship 42 cryo at Massey's" }]),
    judge: async () => ({ post_id: "1", reason: "x" }), vision: async () => ({ shows: false, confidence: 0.3, seen: "dark", reason: "dark" }) });
  check(!rej.pick && /vision gate/.test(rej.why), "vision gate is the final say → text only");
  const none = await r.autoPick(h, box, { token: "t", now: NOW, fetchFn: async () => page([{ id: "1", at: iso(7), text: "Ship 42 cryo at Massey's" }]), judge: async () => ({ post_id: "none", reason: "nothing clear" }) });
  check(!none.pick && /none/.test(none.why), "judge says none → text only");
  // save: manual wins, auto replaces auto
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rm-")), "road-media.json");
  fs.writeFileSync(f, JSON.stringify({ picks: [{ category: "cryo", date: "9 Oct", post_url: "https://x.com/a/status/9", author: "a", image: "i" }] }));
  check(r.saveMediaPick({ ...res.pick, category: "cryo", date: "9 Oct", entry_id: "zz" }, f) === false || JSON.parse(fs.readFileSync(f)).picks.length === 1, "manual pick for the entry is never replaced");
  check(r.saveMediaPick({ ...res.pick, category: "pad", date: "1 Oct", entry_id: "e-1" }, f) && r.saveMediaPick({ ...res.pick, category: "pad", date: "1 Oct", entry_id: "e-1", post_id: "5" }, f) && JSON.parse(fs.readFileSync(f)).picks.filter((p) => p.entry_id === "e-1").length === 1, "auto pick saved; a newer auto pick replaces it");
  // deep link
  const n = r.notificationFor({ flight: 15 }, { box: { icon: "❄️", name: "Cryo" }, entry: { id: "e-abc", text: "t" }, from: "progress", to: "progress" });
  check(/\?feed=1&entry=e-abc$/.test(n.link), "push deep link ?feed=1&entry=<id>");
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  check(/get\("entry"\)/.test(app) && /data-entry=\{h\.id/.test(app) && /classList\.add\("hl"\)/.test(app), "app opens the Road page at that card and highlights it");
  console.log(fails ? `\n${fails} FAILED` : "\n✅ All auto-picker checks passed."); process.exit(fails ? 1 : 0);
})();
