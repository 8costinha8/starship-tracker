/* Flight story backfill / replay through the SAME code the checker runs (scripts/flight-story.js):
     node scripts/flight-story-backfill.js --posts <X API v2 page(s).json> [--curated fixtures/story/<f>.json] [--dry]
   --curated: a hand-curated set (e.g. Tusk's Flight 15 story) is used as (a) the image cache for those exact sources
   (its files are reused, nothing downloaded) and (b) the stand-in for Grok's within-post photo choice. The slot /
   post / order decisions are still the pipeline's own. Writes data/story.json and road.json archive[n].story_photos. */
const fs = require("fs"), path = require("path");
const S = require("./flight-story.js");
const ROOT = path.join(__dirname, "..");
function cardsFrom(page) { // X API v2 page → the checker's post shape (scripts/check-road.js xPostCard + w/h)
  const pages = Array.isArray(page) ? page : [page], out = [];
  for (const pg of pages) {
    const mk = Object.fromEntries((((pg.includes || {}).media) || []).map((m) => [m.media_key, m])), us = Object.fromEntries((((pg.includes || {}).users) || []).map((u) => [u.id, u]));
    for (const p of pg.data || []) {
      const u = us[p.author_id] || {};
      const media = (((p.attachments || {}).media_keys) || []).map((k) => mk[k]).filter(Boolean).map((m) => {
        if (m.type === "photo") return { type: "photo", url: m.url, w: m.width, h: m.height };
        const mp4 = (m.variants || []).filter((v) => v.content_type === "video/mp4" && v.url).sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0));
        return { type: "video", poster: m.preview_image_url, ...(mp4.length ? { video_url: mp4[0].url } : {}), w: m.width, h: m.height };
      });
      out.push({ post_id: p.id, url: `https://x.com/${u.username || "i"}/status/${p.id}`, created_at: p.created_at, text: (p.note_tweet && p.note_tweet.text) || p.text, author: { username: u.username || "" }, media });
    }
  }
  return out;
}
function seedCache(cur, st) { // the curated files ARE the cached copies of those exact sources
  for (const s of cur.slots) {
    const id = (String(s.source_post).match(/status\/(\d+)/) || [])[1];
    st.cache[s.image_url ? `photo:${S.origUrl(s.image_url)}` : `frame:${id}`] = { file: s.file, w: s.w, h: s.h, curated: true };
  }
}
async function backfill({ posts, road, appJsText, fleet = null, curated = null, st = S.load(path.join(ROOT, "data", "story.json")), now = Date.now(), log = console.log, root = ROOT }) {
  const ctx = S.ctxFrom({ road, appJsText, fleet });
  S.ingest(st, posts, ctx, { log });
  let ask = null;
  if (curated) {
    seedCache(curated, st);
    // Grok stand-in: inside one post, the curated photo for that slot
    ask = async (prompt, images) => {
      const slot = S.SLOTS.find((s) => prompt.includes(`slot:${s}`));
      const want = curated.slots.filter((s) => s.image_url && (!slot || s.slot === slot)).map((s) => S.origUrl(s.image_url));
      const i = images.findIndex((u) => want.includes(u));
      return { best: i >= 0 ? i + 1 : 1, confidence: i >= 0 ? 1 : 0.3, seen: i >= 0 ? "curated" : "no curated match" };
    };
  }
  const res = await S.build(st, road, { appJsText, ask, now, root, log, maxAsk: 20 });
  return { st, res };
}
if (require.main === module) {
  (async () => {
    const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
    const dry = process.argv.includes("--dry");
    const posts = cardsFrom(JSON.parse(fs.readFileSync(arg("--posts"), "utf8")));
    const roadPath = path.join(ROOT, "road.json"), road = JSON.parse(fs.readFileSync(roadPath, "utf8"));
    const appJsText = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    let fleet = null; try { fleet = require("./fleet.js").load(); } catch {}
    const curated = arg("--curated") ? JSON.parse(fs.readFileSync(arg("--curated"), "utf8")) : null;
    const { st, res } = await backfill({ posts, road, appJsText, fleet, curated });
    for (const [n, list] of Object.entries(res.flights)) console.log(`Flight ${n}: ${list.length} photo(s)\n` + list.map((p, i) => `  ${i + 1}. ${p.slot.padEnd(11)} ${p.kind.padEnd(5)} ${p.w}x${p.h}${p.small ? " (small)" : ""}  ${p.src}  ← ${p.source_post}`).join("\n"));
    if (dry) return console.log("(dry run: nothing written)");
    S.save(st); fs.writeFileSync(roadPath, JSON.stringify(road, null, 2) + "\n");
    console.log("wrote data/story.json and road.json");
  })().catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { cardsFrom, backfill, seedCache };
