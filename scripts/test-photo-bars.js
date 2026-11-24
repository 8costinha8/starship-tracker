// No flat bars on card photos (24 Nov, Bernardo: "use the grok fill and keep this in mind for future cases").
// Every local Road / fleet card image (road.json, road-media.json, data/vehicles.json, app.js) must have no flat-colour
// side or top/bottom bars unless it is flagged needs-fill (data/needs-review.json { type: "needs-fill", image } or the
// pick's needs_fill). A pick that cannot fill 16:9 without cutting the vehicle gets flagged; nothing is swapped automatically.
//   node scripts/test-photo-bars.js
const fs = require("fs"), os = require("os"), path = require("path"), { spawnSync } = require("child_process");
const F = require("./photo-fill.js"); const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0; const check = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "✅" : "❌"} ${m}`); };
// ── synthetic pictures (320x180 RGB)
const W = 320, H = 180;
const img = (fn) => { const b = Buffer.alloc(W * H * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const i = 3 * (y * W + x); b[i] = r; b[i + 1] = g; b[i + 2] = bl; } return b; };
const tex = (x, y) => { const v = 90 + ((x * 37 + y * 91) % 60) + (((x >> 3) + (y >> 3)) % 2) * 30; return [v, v - 10, v + 5]; };
const pillar = img((x, y) => (x < 22 || x >= W - 22 ? [18, 26, 43] : tex(x, y)));
const letter = img((x, y) => (y < 12 ? [0, 0, 0] : tex(x, y)));
const night = img((x, y) => (y < 40 ? [4, 4, 6] : y < 80 ? [Math.round(4 + (y - 40) * 0.12), 5, 7] : tex(x, y))); // dark sky fading into the picture
const plain = img(tex);
const bp = F.flatBars(pillar, W, H);
check(bp.length === 2 && bp.every((b) => b.px === 22 && b.colour === "#121a2b") && bp.map((b) => b.side).join() === "left,right", "flatBars finds #121A2B side bars (22 px left + right)");
check(F.flatBars(letter, W, H).map((b) => b.side).join() === "top", "flatBars finds a black top bar");
check(F.flatBars(night, W, H).length === 0, "a dark night sky that fades into the picture is not a bar");
check(F.flatBars(plain, W, H).length === 0, "a full picture has no bars");
// the same through a JPEG file (ffmpeg decode, the path the live check uses)
const haveFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
check(haveFfmpeg, "ffmpeg available (the image check decodes with it)");
if (haveFfmpeg) {
  // a photo-like picture (smooth sky + a darker vehicle shape) with #121A2B side bars, as the 16:43 S44 version had
  const photo = img((x, y) => (x < 24 || x >= W - 24 ? [18, 26, 43] : x > 140 && x < 170 && y > 20 ? [30 + (y % 7), 32, 36] : [96 - y / 6, 104 - y / 6, 118 - y / 8 + ((x * 7 + y * 3) % 5)]));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bars-")), raw = path.join(dir, "p.rgb"), jpg = path.join(dir, "p.jpg"); fs.writeFileSync(raw, photo);
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-i", raw, "-q:v", "4", jpg]);
  const r = F.barsOfFile(jpg);
  check(r && r.bars.length === 2, `barsOfFile: a JPEG with side bars is caught (${JSON.stringify(r && r.bars.map((b) => b.side))})`);
}
check(F.barsOfFile("/nonexistent.jpg") === null, "barsOfFile: missing file → null, no throw");
// ── the needs-fill rule
check(F.fits169(1989, 1119, [900, 62, 1088, 1070]) === true, "fits169: a vehicle that fits a 16:9 crop → crop it (B24 cryo)");
check(F.fits169(1136, 744, [470, 31, 598, 723]) === false, "fits169: S44 cryo main camera (1136x744, ship 692 px tall) cannot fill 16:9 without cutting the ship → needs-fill");
const nrDir = fs.mkdtempSync(path.join(os.tmpdir(), "nf-")), nrFile = path.join(nrDir, "needs-review.json"); fs.writeFileSync(nrFile, JSON.stringify({ items: [{ type: "photo_candidate", image_url: "x" }] }));
const it = { image: "images/x.jpg", card_id: "fv-x", post_url: "https://x.com/a/status/2100000000000000001" };
check(F.flagNeedsFill(it, nrFile) === true && F.flagNeedsFill(it, nrFile) === false, "flagNeedsFill adds one needs-fill item (idempotent)");
const nr = JSON.parse(fs.readFileSync(nrFile, "utf8")), item = nr.items.find((i) => i.type === "needs-fill");
check(nr.items.length === 2 && item.image === "images/x.jpg" && item.card_id === "fv-x" && /Grok fill/.test(item.reason) && /no auto-swap/.test(item.reason) && item.msg, "the needs-fill item names the image, card and post, and says Tusk makes a Grok fill for Bernardo (no auto-swap)");
check(F.flaggedImages(nr, [{ image: "images/y.jpg", needs_fill: true }]).has("images/x.jpg") && F.flaggedImages(nr, [{ image: "images/y.jpg", needs_fill: true }]).has("images/y.jpg"), "flaggedImages: needs-review items and picks with needs_fill");
// ── every current card image: no flat bars unless flagged needs-fill
const picks = JSON.parse(fs.readFileSync(path.join(ROOT, "road-media.json"), "utf8")).picks || [];
const needs = fs.existsSync(path.join(ROOT, "data/needs-review.json")) ? JSON.parse(fs.readFileSync(path.join(ROOT, "data/needs-review.json"), "utf8")) : { items: [] };
const flagged = F.flaggedImages(needs, picks);
const refs = new Set(), re = /"(images\/[^"]+\.(?:jpe?g|png|webp))"/g;
for (const f of ["road.json", "road-media.json", "data/vehicles.json", "app.js"]) { const t = fs.readFileSync(path.join(ROOT, f), "utf8"); let m; while ((m = re.exec(t))) refs.add(m[1]); }
let scanned = 0; const barred = [], unread = [];
if (haveFfmpeg) for (const r of [...refs].sort()) { const p = path.join(ROOT, r); if (!fs.existsSync(p)) continue; const o = F.barsOfFile(p); if (!o) { unread.push(r); continue; } scanned++; if (o.bars.length && !flagged.has(r)) barred.push(`${r} ${o.bars.map((b) => `${b.side} ${b.px}px ${b.colour}`).join(", ")}`); }
check(haveFfmpeg && scanned >= 40 && !unread.length, `card images decoded: ${scanned} of ${refs.size} referenced${unread.length ? " (unreadable: " + unread.join(", ") + ")" : ""}`);
check(haveFfmpeg && !barred.length, `no card image has flat-colour bars unless flagged needs-fill${barred.length ? ": " + barred.join(" | ") : ""}`);
// ── S44 cryo: Bernardo's Grok fill replaces the barred version
const s44 = picks.find((p) => p.fleet_event === "fv-d82809339b") || {};
check(s44.image === "images/s44-cryo-nsf-grok-fill.jpg" && /grok/i.test(s44.fill || "") && /Bernardo/.test(s44.fill) && s44.keep_image && s44.picked_by === "Bernardo", "S44 cryo pick = the Grok fill Bernardo approved (locked, picked_by Bernardo)");
check(!fs.existsSync(path.join(ROOT, "images/s44-cryo-blobifie-nsf-clean.jpg")) && !/121A2B|side bars/i.test(JSON.stringify(s44)), "the barred S44 image and its bar handling are gone");
if (haveFfmpeg) { const o = F.barsOfFile(path.join(ROOT, s44.image || "x")); check(o && o.w === 1280 && o.h === 720 && !o.bars.length && fs.statSync(path.join(ROOT, s44.image)).size < 150e3, "S44 Grok fill: 1280x720, no bars, web-sized"); }
console.log(`\n${pass}/${pass + fail} checks passed`); if (fail) process.exit(1);
