/* Best frame / best photo for a Road card (self-contained; used by check-road.js after the pushes
   are built, and callable later by the media-watch job).
   Video post → ffmpeg frames (~2 fps) → heuristic score (event-specific: plume brightness/size under
   the vehicle for static fire / launch, frost for cryo, plus sharpness = Laplacian variance) →
   Grok picks among [current thumbnail + top frames] → a frame is swapped in ONLY when Grok picks a
   frame (not the thumbnail) with confidence >= 0.7. Photo posts: same, among the post's photos.
   Never changes text, never adds a push. ffmpeg: preinstalled on ubuntu-latest (no workflow change). */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const MIN_CONF = 0.7;
const W = 160, H = 90; // scoring size
const TARGETS = {
  static: "the booster's engines clearly lit: a bright flame/plume under the vehicle on the pad",
  launch: "liftoff: the vehicle rising on a bright exhaust plume",
  rollout: "the vehicle on the road on its transporter",
  lift: "the vehicle held by the tower's chopsticks being lifted",
  cryo: "frost on the vehicle's tanks during the cryo test",
  catch: "the vehicle caught in the tower's chopsticks",
};
function eventOf(boxId, text = "") {
  const t = String(text).toLowerCase();
  if (/static fire|static-fire/.test(t) || boxId === "static" && !/roll|lift|transport/.test(t)) return "static";
  if (/\bcatch|caught/.test(t)) return "catch";
  if (/lift(ed)? (on|onto)|chopstick|stack/.test(t)) return "lift";
  if (/roll(s|ed|ing)? ?out|rollout|transport(ed)? to/.test(t)) return "rollout";
  if (/cryo/.test(t) || boxId === "cryo") return "cryo";
  if (/launch|liftoff|lift-off/.test(t) || boxId === "launch") return "launch";
  return null;
}
const hasFfmpeg = () => { try { return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0; } catch { return false; } };
function rgbOf(file) { // small RGB raster via ffmpeg
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-frames:v", "1", "-"], { maxBuffer: 1 << 24 });
  if (r.status !== 0 || r.stdout.length < W * H * 3) throw new Error("ffmpeg decode failed");
  return r.stdout;
}
function scorePixels(buf, event) {
  const g = new Float32Array(W * H); let fire = 0, fireLow = 0, frost = 0, mean = 0;
  for (let i = 0; i < W * H; i++) {
    const r = buf[i * 3], gg = buf[i * 3 + 1], b = buf[i * 3 + 2], y = (i / W) | 0;
    g[i] = 0.299 * r + 0.587 * gg + 0.114 * b; mean += g[i];
    const flame = r > 215 && gg > 120 && r - b > 70; // orange-to-yellow-white flame light
    if (flame) { fire++; if (y > H * 0.45) fireLow++; }
    if (r > 190 && gg > 190 && b > 190 && Math.max(r, gg, b) - Math.min(r, gg, b) < 25) frost++;
  }
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W]; s += l; s2 += l * l; n++; }
  const lap = s2 / n - (s / n) ** 2, N = W * H;
  const sharp = Math.min(1, lap / 1500);
  const plume = (fire + fireLow) / N; // size, weighted to below the vehicle
  const expo = 1 - Math.abs(mean / N - 120) / 120;
  const score = event === "static" || event === "launch" ? plume * 4 + sharp * 0.5
    : event === "cryo" ? (frost / N) * 2 + sharp * 0.6 + expo * 0.2 : sharp * 0.7 + expo * 0.3;
  return { score, plume, sharp, lap: Math.round(lap) };
}
const scoreFile = (file, event) => scorePixels(rgbOf(file), event);
function extractFrames(video, dir, fps = 2, max = 120) {
  fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", video, "-t", "180", "-vf", `fps=${fps}`, "-frames:v", String(max), "-q:v", "2", path.join(dir, "f%03d.jpg")], { stdio: "pipe" });
  if (r.status !== 0) throw new Error(`ffmpeg: ${String(r.stderr).slice(0, 200)}`);
  return fs.readdirSync(dir).filter((f) => /^f\d+\.jpg$/.test(f)).sort().map((f) => path.join(dir, f));
}
// Rank frames; keeps distinct picks (at least 1 s apart).
function rankFrames(files, event, fps = 2, top = 3) {
  const sc = files.map((f, i) => ({ file: f, t: i / fps, ...scoreFile(f, event) })).sort((a, b) => b.score - a.score);
  const out = []; for (const s of sc) { if (out.length >= top) break; if (out.every((o) => Math.abs(o.t - s.t) >= 1)) out.push(s); }
  return { ranked: out, all: sc };
}
const dataUrl = (file) => `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;
const PICK_SCHEMA = { type: "object", additionalProperties: false, required: ["best", "confidence", "seen"], properties: { best: { type: "integer" }, confidence: { type: "number" }, seen: { type: "string" } } };
async function askGrok(prompt, images) {
  const writer = require("./writer.js");
  return writer.askJson(prompt, { images, schema: PICK_SCHEMA, schemaName: "best_frame", maxTokens: 3000, claudeMaxTokens: 300, attempts: 1, log: () => {},
    extract: (t) => { const o = JSON.parse(t.replace(/```json|```/g, "").trim()); if (!Number.isInteger(o.best)) throw new Error("no pick"); return o; } });
}
const pickPrompt = (event, text, n) => `These ${n} images are candidates for a Starship tracker card: "${text}".
The picture must SHOW: ${TARGETS[event]}. Image 1 is the current picture; the others are frames/photos from the same post.
Reply JSON: "best" = number (1-${n}) of the image that most clearly shows it (vehicle visible and sharp), "confidence" 0-1, "seen" a few words.`;
async function download(url, file, fetchFn = fetch) {
  const r = await fetchFn(url); if (!r.ok) throw new Error(`download ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return file;
}
/* Upgrade one entry's picture. Returns { swapped, why } and changes only h.media_override.image
   (+ frame metadata). Never touches text or notifications. */
async function upgradeEntry(h, box, { root = path.join(__dirname, ".."), ask = askGrok, fetchFn = fetch, tmp = require("os").tmpdir(), video = null, log = () => {} } = {}) {
  const mo = h.media_override;
  if (!mo || mo.keep_image || h.frameChecked) return { swapped: false, why: "skip" };
  const event = eventOf(box.id, h.x_text || h.text);
  if (!event) { h.frameChecked = true; return { swapped: false, why: "no event target" }; }
  const post = h.x_post && h.x_post.post_id === mo.post_id ? h.x_post : null;
  const media = (post && (post.media_all || post.media)) || [];
  const vurl = video || mo.video_url || (media.find((m) => m.type === "video" && m.video_url) || {}).video_url;
  const work = fs.mkdtempSync(path.join(tmp, "bf-"));
  try {
    let cands = [], kind;
    if (mo.type === "video" && vurl) {
      if (!hasFfmpeg()) return { swapped: false, why: "no ffmpeg" };
      const vf = /^https?:/.test(vurl) ? await download(vurl, path.join(work, "v.mp4"), fetchFn) : vurl;
      const { ranked } = rankFrames(extractFrames(vf, path.join(work, "fr")), event);
      cands = ranked.map((r) => ({ file: r.file, t: r.t, score: r.score })); kind = "frame";
    } else {
      const photos = media.filter((m) => m.type === "photo" && m.url && m.url !== mo.image);
      if (!photos.length) { h.frameChecked = true; return { swapped: false, why: "single picture" }; }
      for (const [i, p] of photos.slice(0, 3).entries()) { const f = await download(p.url, path.join(work, `p${i}.jpg`), fetchFn); cands.push({ file: f, url: p.url, score: scoreFile(f, event).score }); }
      cands.sort((a, b) => b.score - a.score); kind = "photo";
    }
    if (!cands.length) { h.frameChecked = true; return { swapped: false, why: "no candidates" }; }
    let cur = null; try { cur = /^https?:/.test(mo.image) ? await download(mo.image, path.join(work, "cur.jpg"), fetchFn) : path.join(root, mo.image); } catch {}
    const imgs = [cur, ...cands.map((c) => c.file)].filter(Boolean);
    const off = cur ? 1 : 0;
    let v; try { v = await ask(pickPrompt(event, h.x_text || h.text, imgs.length), imgs.map(dataUrl)); } catch (e) { return { swapped: false, why: `grok failed (${e.message}) — thumbnail kept, retried next run` }; }
    h.frameChecked = true;
    const idx = v.best - 1 - off;
    if (!(v.confidence >= MIN_CONF) || idx < 0 || idx >= cands.length) return { swapped: false, why: `kept thumbnail (best ${v.best}, conf ${v.confidence})` };
    const c = cands[idx];
    if (kind === "photo") { mo.image = c.url; }
    else {
      const rel = `images/${mo.post_id || h.id}-frame.jpg`;
      fs.mkdirSync(path.join(root, "images"), { recursive: true });
      const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", c.file, "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", path.join(root, rel)]);
      if (r.status !== 0) return { swapped: false, why: "frame save failed" };
      if (!mo.thumb) mo.thumb = mo.image; // original thumbnail kept (push images use it)
      mo.image = rel; mo.frame = { t: c.t, by: "grok", confidence: v.confidence };
    }
    log(`best frame [${box.id}] ${h.id}: ${kind} swapped in (${v.seen}, ${v.confidence})`);
    return { swapped: true, why: v.seen, image: mo.image };
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}
// Run over entries (new cards first); capped Grok calls per run. Returns the files written (to commit). No pushes.
async function upgradeCards(road, entries, opts = {}) {
  const max = opts.max ?? 3, files = [], log = opts.log || (() => {}); let calls = 0;
  for (const { box, entry } of entries) {
    if (calls >= max) break;
    if (!entry.media_override || entry.media_override.keep_image || entry.frameChecked) continue;
    calls++;
    try { const r = await upgradeEntry(entry, box, opts); if (r.swapped && /^images\//.test(r.image)) files.push(r.image); if (!r.swapped) log(`best frame [${box.id}] ${entry.id}: ${r.why}`); }
    catch (e) { log(`best frame failed (${e.message}) — thumbnail kept`); }
  }
  return files;
}
module.exports = { eventOf, scoreFile, scorePixels, extractFrames, rankFrames, upgradeEntry, upgradeCards, hasFfmpeg, TARGETS, MIN_CONF };
