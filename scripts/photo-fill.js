/* Card photos never ship flat bars (24 Nov, Bernardo via Tusk: "use the grok fill and keep this in mind for future cases").
   A Road / fleet card photo is cover-fitted into a 16:9 slot. When a Bernardo-picked or locked photo cannot fill 16:9
   without cutting the vehicle, do NOT pad it with flat-colour bars: flag it "needs-fill" in data/needs-review.json
   ({ type: "needs-fill", image, card_id, post_url, reason }) so Tusk sees it and makes a Grok fill for Bernardo to approve.
   Nothing is swapped automatically.
   - fits169(srcW, srcH, box): can a 16:9 crop of the source hold the whole vehicle box (pixels [x0, y0, x1, y1])?
   - flatBars(rgb, W, H): flat-colour bands on the left / right / top / bottom edges: every pixel of the band within a few
     levels of the band's colour (vs a textured image centre) and a clear step into the picture next to it. A dark night
     sky that fades into the picture has no step, so it is not a bar.
   - barsOfFile(file): flatBars on a 320 px wide ffmpeg decode (null when ffmpeg or the file is missing).
   - needsFillItem / flagNeedsFill(file, item): the needs-review entry (idempotent).
   CLI: node scripts/photo-fill.js check <srcW> <srcH> <x0,y0,x1,y1>   |   node scripts/photo-fill.js bars <image> */
const fs = require("fs"), path = require("path");
const NR = path.join(__dirname, "..", "data", "needs-review.json");
function fits169(srcW, srcH, box) {
  const [x0, y0, x1, y1] = box, bw = x1 - x0, bh = y1 - y0;
  if (!(srcW > 0 && srcH > 0 && bw > 0 && bh > 0)) return false;
  const w = Math.min(srcW, srcH * 16 / 9), h = w * 9 / 16; // the largest 16:9 crop
  return bw <= w + 0.5 && bh <= h + 0.5;
}
const TOL = 4, MIN_FRAC = 0.012, STEP = 8; // levels (0-255); band ≥ 1.2% of the side; step into the picture
function flatBars(rgb, W, H) {
  const px = (x, y) => { const i = 3 * (y * W + x); return [rgb[i], rgb[i + 1], rgb[i + 2]]; };
  const line = (side, k) => { const out = []; // k-th column / row from that edge
    if (side === "left" || side === "right") { const x = side === "left" ? k : W - 1 - k; for (let y = 0; y < H; y++) out.push(px(x, y)); }
    else { const y = side === "top" ? k : H - 1 - k; for (let x = 0; x < W; x++) out.push(px(x, y)); }
    return out; };
  const mean = (ps) => [0, 1, 2].map((c) => ps.reduce((a, p) => a + p[c], 0) / ps.length);
  const flatTo = (ps, m) => ps.every((p) => Math.abs(p[0] - m[0]) <= TOL && Math.abs(p[1] - m[1]) <= TOL && Math.abs(p[2] - m[2]) <= TOL);
  // the centre's texture: mean abs deviation of the middle 50% (a flat bar must be far flatter than the picture)
  const cps = []; for (let y = Math.floor(H / 4); y < Math.ceil(3 * H / 4); y += 2) for (let x = Math.floor(W / 4); x < Math.ceil(3 * W / 4); x += 2) cps.push(px(x, y));
  const cm = mean(cps), centreDev = cps.reduce((a, p) => a + Math.abs(p[0] - cm[0]) + Math.abs(p[1] - cm[1]) + Math.abs(p[2] - cm[2]), 0) / (3 * cps.length);
  const bars = [];
  for (const side of ["left", "right", "top", "bottom"]) {
    const len = side === "left" || side === "right" ? W : H; const first = line(side, 0), m = mean(first);
    if (!flatTo(first, m)) continue;
    let k = 1; while (k < len / 2 && flatTo(line(side, k), m)) k++;
    if (k < Math.max(2, Math.round(len * MIN_FRAC))) continue;
    const next = line(side, k), step = next.reduce((a, p) => a + Math.abs(p[0] - m[0]) + Math.abs(p[1] - m[1]) + Math.abs(p[2] - m[2]), 0) / (3 * next.length);
    if (step < STEP || centreDev < 2 * TOL) continue; // fades into the picture (sky), or the whole picture is flat
    bars.push({ side, px: k, frac: +(k / len).toFixed(3), colour: "#" + m.map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""), step: +step.toFixed(1) });
  }
  return bars;
}
function barsOfFile(file, W = 320) {
  try {
    if (!fs.existsSync(file)) return null;
    const { spawnSync } = require("child_process");
    const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" });
    const [w0, h0] = String(pr.stdout || "").trim().split(",").map(Number); if (!(w0 > 0 && h0 > 0)) return null;
    const H = Math.max(2, Math.round(W * h0 / w0));
    const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `scale=${W}:${H}:flags=area,format=rgb24`, "-frames:v", "1", "-f", "rawvideo", "-"], { maxBuffer: 1 << 24 });
    if (r.status !== 0 || !r.stdout || r.stdout.length < W * H * 3) return null;
    return { w: w0, h: h0, bars: flatBars(r.stdout, W, H) };
  } catch { return null; }
}
const needsFillItem = ({ image, card_id = null, post_url = null, reason }) => ({ date: new Date().toISOString(), type: "needs-fill", image, card_id, post_url,
  reason: reason || "the picked photo cannot fill the 16:9 card without cutting the vehicle; no flat bars: Tusk makes a Grok fill for Bernardo to approve (no auto-swap)",
  item: card_id || image, values: [image], sources: post_url ? [post_url] : [], msg: `needs-fill ${card_id || image}: ${image}` });
function flagNeedsFill(item, file = NR) {
  const d = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { items: [] }; d.items = d.items || [];
  if (d.items.some((i) => i.type === "needs-fill" && i.image === item.image)) return false;
  d.items.push(needsFillItem(item)); fs.writeFileSync(file, JSON.stringify(d, null, 2) + "\n"); return true;
}
// images flagged needs-fill: a needs-review item, or the pick itself ({ needs_fill: true })
function flaggedImages(needsReview, picks) {
  const s = new Set(); for (const i of (needsReview && needsReview.items) || []) if (i && i.type === "needs-fill" && i.image) s.add(i.image);
  for (const p of picks || []) if (p && p.needs_fill && p.image) s.add(p.image);
  return s;
}
module.exports = { fits169, flatBars, barsOfFile, needsFillItem, flagNeedsFill, flaggedImages, TOL, MIN_FRAC, STEP };
if (require.main === module) {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === "check") { const ok = fits169(+a[0], +a[1], a[2].split(",").map(Number)); console.log(ok ? "fits 16:9: crop it, no fill needed" : "does NOT fit 16:9 without cutting the vehicle: flag needs-fill (flagNeedsFill), no bars"); process.exit(ok ? 0 : 2); }
  else if (cmd === "bars") { console.log(JSON.stringify(barsOfFile(a[0]))); }
  else console.log("usage: photo-fill.js check <srcW> <srcH> <x0,y0,x1,y1> | bars <image>");
}
