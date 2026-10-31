/* End-to-end (offline) for precise images: a new trusted X post → Road entry in road.json with
   only a vision-verified picture → app shows it → push carries the text, link and picture.
     node scripts/test-precise.js   (no network: fake sources, writer and vision) */
process.env.PUSH_SHADOW = process.env.PUSH_SHADOW || "0"; // live push-shadow.json must not turn this suite into shadow mode

// Legacy send-path checks predate the milestone-only push policy (tested in test-push-policy.js): policy off here.
{ const pp = require("./push-policy.js"); pp.decide = (n) => ({ push: true, reason: "policy off (legacy test)", cls: pp.classify(n) }); pp.orderBatch = (l) => l; }
const fs = require("fs"), os = require("os"), path = require("path");
const road = require("./check-road.js");
let failed = 0; const check = (ok, m) => { console.log(`${ok ? "✅" : "❌"} ${m}`); if (!ok) failed++; };
const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "precise-"));
const roadPath = path.join(tmp, "road.json"), appJsPath = path.join(tmp, "app.js");
fs.copyFileSync(path.join(ROOT, "road.json"), roadPath); fs.copyFileSync(path.join(ROOT, "app.js"), appJsPath);
let stored = { seen: [], news: { seen: [], sent: [], day: "", count: 0, pending: [] } }; let pushes = [], commits = [], visionCalls = [];
const deps = { loadState: async () => JSON.parse(JSON.stringify(stored)), saveState: async (s) => { stored = JSON.parse(JSON.stringify(s)); }, push: async (n) => pushes.push(n) };
const now = new Date().toISOString();
const xpost = (id, text, media) => ({ post_id: id, url: `https://x.com/LabPadre/status/${id}`, created_at: now, text, author: { name: "LabPadre", username: "LabPadre" }, media });
const xitem = (id, text, media) => ({ key: `x:${id}`, title: "@LabPadre on X", text, url: `https://x.com/LabPadre/status/${id}`, publishedAt: now, src: "LabPadre", source: "x:LabPadre", tier: "trusted", xpost: xpost(id, text, media) });
const vision = (rule) => async (prompt, url) => { visionCalls.push(url); return rule(url); };
async function runWith(items, answer, vis) {
  pushes = []; commits = [];
  return road.run({ mode: "live", roadPath, appJsPath, deps, next: null, commit: (f, m) => { if (f === "road.json") commits.push(m); }, sources: [{ name: "fake", fetch: async () => items }],
    askClaude: async () => answer, askNews: async () => [], vision: vis });
}
(async () => {
  // 1. post with a dark frame and a clear photo → only the clear photo kept, push carries it
  const media = [{ type: "video", poster: "https://pbs.twimg.com/dark.jpg", video_url: "https://video.twimg.com/v.mp4" }, { type: "photo", url: "https://pbs.twimg.com/b22-static.jpg", alt: "Booster 22 firing on the pad" }];
  await runWith([xitem("901", "Booster 22 static fire at Massey's! #Starship", media)],
    [{ item: 1, box: "static", line: "Booster 22 completed a static fire at Massey's.", short: "B22 static fire", status: "progress" }],
    vision((u) => (u.includes("b22-static") ? { shows: true, confidence: 0.93, seen: "Booster 22 firing, plume", reason: "clear static fire", writer: "grok" } : { shows: false, confidence: 0.2, seen: "dark frame", reason: "nothing visible" })));
  const r1 = JSON.parse(fs.readFileSync(roadPath, "utf8"));
  const e1 = r1.categories.find((c) => c.id === "static").history[0];
  check(e1.key === "x:901" && e1.x_post && e1.x_text === "Booster 22 completed a static fire at Massey's.", "new X post → entry written to road.json with x_post + text");
  check(e1.x_post.media.length === 1 && e1.x_post.media[0].url.includes("b22-static") && e1.image_check.verdict === "shows it" && visionCalls.length === 2, "vision checks every picture; only the clear one kept");
  check(commits.length === 1, "one commit (the 15-min checker writes it automatically)");
  const p1 = pushes.find((p) => /Static/.test(p.title));
  check(p1 && p1.body === "Booster 22 completed a static fire at Massey's." && p1.image === "https://pbs.twimg.com/b22-static.jpg" && /\?feed=1(&entry=[^&]+)?$/.test(p1.link), "push sent: same text, the verified picture, opens the Road page");
  const msg = road.fcmMessage(["t1"], p1);
  check(msg.notification.imageUrl === p1.image && msg.webpush.notification.image === p1.image && msg.webpush.fcmOptions.link === p1.link, "FCM message carries the picture (apps + web) and the link");
  console.log(`   sample push → title: "${p1.title}" | body: "${p1.body}" | image: ${p1.image} | link: ${p1.link}`);
  // 2. low-confidence picture → text only, push without picture
  visionCalls = [];
  await runWith([xitem("902", "Ship 42 back at Massey's for cryo", [{ type: "photo", url: "https://pbs.twimg.com/far.jpg" }])],
    [{ item: 1, box: "cryo", line: "Ship 42 is back at Massey's for cryo testing.", short: "S42 cryo again", status: "progress" }],
    vision(() => ({ shows: true, confidence: 0.55, seen: "distant stand, ship unclear", reason: "too far" })));
  const e2 = JSON.parse(fs.readFileSync(roadPath, "utf8")).categories.find((c) => c.id === "cryo").history[0];
  const p2 = pushes.find((p) => /Cryo/.test(p.title));
  check(e2.key === "x:902" && e2.x_post && e2.x_post.media.length === 0 && /no image/.test(e2.image_check.verdict), "confidence < 0.8 → no picture (still links to the post)");
  check(p2 && !p2.image && p2.body === "Ship 42 is back at Massey's for cryo testing.", "push still sent, without a picture");
  // 3. vision failure → text only, never an unverified picture
  const h = { text: "x", x_post: xpost("903", "t", [{ type: "photo", url: "https://pbs.twimg.com/a.jpg" }]) };
  await road.applyImageCheck(h, "Pad", { ask: async () => { throw new Error("down"); } });
  check(h.x_post.media.length === 0, "vision call fails → no picture");
  // 4. app: Road card and Road page both show the rewritten text; picture only on the Road page
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  check(/<p>\{scrub\(logLine\(h\)\)\}<\/p>/.test(app) && /const logLine = \(h\) => \(h && \(h\.log_text \|\| h\.text\)\)/.test(app) && /post-text">\{scrub\((?:h\.card_text \|\| )?h\.x_text \|\| h\.text\)\}/.test(app), "Flight Log card uses the clean log line (log_text, then text); the Road page keeps the post's rewritten text");
  check(/h\.x_post && <XMedia/.test(app) && !/mini[^\n]*XMedia/.test(app), "pictures only on the Road page (Road card stays text only)");
  // 4b. hand-picked pictures win over the automatic check and over a mismatched rewrite
  {
    const rd = { categories: [{ id: "cryo", history: [
      { date: "9 Oct", text: "Orig A.", x_text: "Rewrite from post 1.", x_post: { post_id: "1", media: [{ type: "photo", url: "u1" }] } },
      { date: "8 Oct", text: "Orig B.", x_text: "Rewrite from post 5.", x_post: { post_id: "5", media: [] } },
      { date: "7 Oct", text: "No pick." } ] }] };
    const picks = [{ category: "cryo", date: "9 Oct", post_url: "https://x.com/LabPadre/status/2", post_id: "2", author: "LabPadre", media_type: "video", image: "https://pbs.twimg.com/pick.jpg" },
      { category: "cryo", date: "8 Oct", post_url: "https://x.com/NSF/status/5", author: "NSF", media_type: "photo", image: "https://pbs.twimg.com/p5.jpg" }];
    road.applyMediaPicks(rd, picks);
    const [a, b, c] = rd.categories[0].history;
    check(a.media_override.image === "https://pbs.twimg.com/pick.jpg" && a.media_override.type === "video" && a.imageChecked2 && !a.x_text, "pick wins: picture + post + author; rewrite from another post dropped");
    check(b.media_override.post_id === "5" && b.x_text === "Rewrite from post 5.", "pick from the same post keeps the Grok text");
    check(!c.media_override, "no pick → automatic check stays");
    const n = road.notificationFor({ flight: 15 }, { box: { icon: "❄️", name: "Cryo" }, entry: a, from: "progress", to: "progress" });
    check(n.image === "https://pbs.twimg.com/pick.jpg", "push uses the picked picture");
    check(road.loadMediaPicks().length === 19 && road.loadMediaPicks().filter((p) => p.context_only).length === 1, "repo road-media.json has the 19 picks (2 best-frame picks of 24 Oct + the 2 SpaceX static fire frames (B22, S42) + 10 + the manual Flight 16 B23 card + the 2 backfill cards of 19 Oct + 1 context-only Pad 2 shot + the credited 14 Oct Raptor photo)");
    const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    check(/\{mo \? <PickMedia mo=\{mo\} \/>/.test(appSrc) && /: h\.media_override\);/.test(appSrc) && /media_override && !h\.media_override\.credit_only && h\.media_override\.post_url/.test(appSrc), "app: picked picture shown, card links to the picked post (a credit-only picture keeps the fact source link)");
  }
  // 5. writer sends the picture to Grok (input_image); Anthropic is never called
  {
    const writer = require("./writer.js"); const realFetch = global.fetch; const bodies = [];
    const env = { ...process.env }; process.env.XAI_API_KEY = "test"; process.env.WRITER = "grok";
    global.fetch = async (url, o) => { const b = JSON.parse(o.body); bodies.push([url, b]);
      if (!/x\.ai/.test(url)) throw new Error("unexpected provider");
      const raw = JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"shows":true,"confidence":0.9,"seen":"S42","reason":"r"}' }] }], usage: {} });
      return { ok: true, status: 200, text: async () => raw }; };
    const v = await writer.askJson("p", { images: ["https://pbs.twimg.com/x.jpg"], attempts: 1, log: () => {} });
    global.fetch = realFetch; Object.assign(process.env, env); if (!env.XAI_API_KEY) delete process.env.XAI_API_KEY;
    const g = bodies[0][1].input[0].content;
    check(bodies.length === 1 && g[0].type === "input_image" && g[0].image_url === "https://pbs.twimg.com/x.jpg" && v.shows === true, "vision: picture sent to Grok only");
  }
  console.log(failed ? `\n❌ ${failed} failed` : "\n✅ All precise-image checks passed."); process.exit(failed ? 1 : 0);
})();
