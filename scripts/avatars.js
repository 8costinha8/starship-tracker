/* Source avatars for the photo badge (app.js SrcBadge). One small file per X handle under icons/avatars/<handle>.jpg,
   listed in icons/avatars/index.json. The checker calls ensureAll() after writing road.json: any photo source
   without a saved avatar gets one from its public profile picture (the avatar URL already in road.json, else
   unavatar.io/x/<handle>). No logins or tokens. Never throws: a miss leaves the app's neutral initial circle. */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "icons", "avatars");
const INDEX = path.join(DIR, "index.json");
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const MAX_BYTES = 200 * 1024;
const lc = (s) => String(s || "").replace(/^@/, "").toLowerCase();

// handle -> avatar URL seen in the data (or null) for every photo source in road.json + road-media.json
function sourcesOf(road, picks) {
  const out = new Map();
  const add = (h, av) => { h = String(h || "").replace(/^@/, ""); if (!HANDLE.test(h)) return; if (!out.has(lc(h)) || (av && !out.get(lc(h)).av)) out.set(lc(h), { handle: h, av: av || (out.get(lc(h)) || {}).av || null }); };
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    if (o.media_override && o.media_override.author) add(o.media_override.author);
    const a = o.x_post && o.x_post.author; if (a && a.username) add(a.username, a.avatar);
    for (const k of ["post_url", "url"]) { const m = typeof o[k] === "string" && o[k].match(/x\.com\/([A-Za-z0-9_]{1,15})\/status\//); if (m) add(m[1]); }
    Object.values(o).forEach(walk);
  })(road);
  for (const p of (picks && picks.picks) || []) if (p.author) add(p.author);
  return [...out.values()];
}
function readIndex(file = INDEX) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { avatars: {} }; } }
async function fetchImage(url, fetchFn) {
  const r = await fetchFn(url, { headers: { "User-Agent": "starship-tracker" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok || !/^image\//.test(r.headers.get("content-type") || "")) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.length > 300 && buf.length <= MAX_BYTES ? buf : null;
}
// Returns the repo-relative files written (for the checker's commit).
async function ensureAll(road, picks, { fetchFn = globalThis.fetch, log = () => {}, dir = DIR, index = INDEX, now = new Date() } = {}) {
  const written = [];
  try {
    const idx = readIndex(index); idx.avatars = idx.avatars || {};
    for (const { handle, av } of sourcesOf(road, picks)) {
      const key = lc(handle);
      if (idx.avatars[key] && fs.existsSync(path.join(ROOT, idx.avatars[key].file))) continue;
      const urls = [av && av.replace(/_normal\.(jpe?g|png)$/i, "_200x200.$1"), `https://unavatar.io/x/${handle}?fallback=false`].filter(Boolean);
      for (const u of urls) {
        let buf = null; try { buf = await fetchImage(u, fetchFn); } catch {}
        if (!buf) continue;
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${key}.jpg`), buf);
        idx.avatars[key] = { handle, file: `icons/avatars/${key}.jpg`, from: u.replace("?fallback=false", ""), saved: now.toISOString().slice(0, 10) };
        written.push(`icons/avatars/${key}.jpg`); log(`avatar saved for @${handle}`); break;
      }
      if (!idx.avatars[key]) log(`no avatar found for @${handle} (app shows the initial)`);
    }
    if (written.length) { fs.writeFileSync(index, JSON.stringify(idx, null, 1) + "\n"); written.push("icons/avatars/index.json"); }
  } catch (e) { log(`avatars skipped: ${e.message}`); }
  return written;
}
module.exports = { sourcesOf, ensureAll, readIndex };
