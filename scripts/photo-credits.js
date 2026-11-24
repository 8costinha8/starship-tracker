/* data/photo-credits.json upkeep (24 Nov, road-footer v6). The app's photo badge credits the photo's original source from
   the post's own text (scripts/photo-marks.js creditOf), so every X post whose photo the Road or the fleet registry uses
   needs its text stored: { posts: { "<post id>": { poster: "<handle>", text: "<post text as X returns it>" } } }.
   storeFrom() adds the posts fetched this run whose id is a photo source in the data; existing entries are never changed.
   update() is the checker's call: it never throws (a missing or broken file, a post with no text → skipped, logged). */
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "..", "data", "photo-credits.json");
const idOf = (u) => (String(u || "").match(/status\/(\d{15,})/) || [])[1] || null;
// every post id the data shows a picture from: x_post with media, media_override, image_src, photo candidates
function photoPostIds(...trees) {
  const ids = new Set();
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    if (o.x_post && Array.isArray(o.x_post.media) && o.x_post.media.length) { const id = o.x_post.post_id || idOf(o.x_post.url); if (id) ids.add(String(id)); }
    if (o.media_override && o.media_override.image && !o.media_override.credit_only) { const id = o.media_override.post_id || idOf(o.media_override.post_url); if (id) ids.add(String(id)); }
    if (typeof o.image_src === "string") { const id = idOf(o.image_src); if (id) ids.add(id); }
    if (Array.isArray(o.candidates)) for (const c of o.candidates) { const id = c && (c.post_id || idOf(c.post_url)); if (id) ids.add(String(id)); }
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
  };
  trees.forEach(walk);
  return ids;
}
// pure: returns the number of entries added to credits.posts
function storeFrom(credits, posts, ids) {
  if (!credits || typeof credits !== "object") return 0;
  credits.posts = credits.posts && typeof credits.posts === "object" ? credits.posts : {};
  let n = 0;
  for (const p of posts || []) {
    const id = p && String(p.post_id || idOf(p.url) || ""); const handle = p && ((p.author && p.author.username) || p.author || "");
    if (!id || !/^\d{15,}$/.test(id) || credits.posts[id]) continue;
    if (ids && !ids.has(id)) continue;
    if (typeof p.text !== "string" || !p.text.trim() || typeof handle !== "string" || !handle) continue; // no text → nothing to credit from; skipped
    credits.posts[id] = { poster: handle.replace(/^@/, ""), text: p.text }; n++;
  }
  return n;
}
// checker call: read, add, write. Never throws; returns the number added (0 on any problem).
function update({ file = FILE, posts = [], trees = [], log = () => {} } = {}) {
  try {
    let credits = { _about: "Post text of every X post whose photo is on a Road card. The app reads it for the photo source badge credit (scripts/photo-marks.js creditOf). Keyed by post id; text as X returns it. Kept by scripts/photo-credits.js (checker).", posts: {} };
    if (fs.existsSync(file)) credits = JSON.parse(fs.readFileSync(file, "utf8"));
    const n = storeFrom(credits, posts, photoPostIds(...trees));
    if (!n) return 0;
    const ordered = Object.fromEntries(Object.keys(credits.posts).sort().map((k) => [k, credits.posts[k]]));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...credits, posts: ordered }, null, 2) + "\n");
    log(`photo credits: ${n} new photo post text(s) stored (data/photo-credits.json)`);
    return n;
  } catch (e) { log(`photo credits skipped: ${e.message}`); return 0; }
}
module.exports = { FILE, photoPostIds, storeFrom, update };
