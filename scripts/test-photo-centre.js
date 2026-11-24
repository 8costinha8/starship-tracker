// Card photos: the named vehicle sits in the horizontal centre of the frame (24 Nov, Bernardo via Tusk).
// Every road-media.json pick that stores a vehicle_box (fractions of the saved image) is cover-fitted into the 16:9 card
// photo slot at 390 px (scripts/photo-centre.js offCentre, object-position centre) and the vehicle's centre must be
// within 10% of the frame width of the centre. Bernardo's recorded picks (picked_by: "Bernardo") must store a box.
// Also: scripts/photo-centre.js centreCrop centres a crop on the vehicle and keeps it clear of a watermark.
//   node scripts/test-photo-centre.js
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const C = require("./photo-centre.js");
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
function jpegSize(file) { // width / height from the SOF marker
  const b = fs.readFileSync(file); let i = 2;
  while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) }; i += 2 + len; }
  return null;
}
const picks = JSON.parse(fs.readFileSync(path.join(ROOT, "road-media.json"), "utf8")).picks || [];
const SLOT = { w: 342, h: 192 }; // the Road card photo at 390 px: 366 px card − 2 × 12 px padding, 16:9
for (const p of picks) {
  const local = p.image && !/^https?:/.test(p.image) && fs.existsSync(path.join(ROOT, p.image));
  if (String(p.picked_by || "") === "Bernardo" && local) check(Array.isArray(p.vehicle_box) && p.vehicle_box.length === 4, `${p.image}: Bernardo's pick stores the vehicle's box`);
  if (!local || !Array.isArray(p.vehicle_box)) continue;
  const sz = jpegSize(path.join(ROOT, p.image)); if (!sz) { check(false, `${p.image}: readable JPEG`); continue; }
  const box = [p.vehicle_box[0] * sz.w, p.vehicle_box[1] * sz.h, p.vehicle_box[2] * sz.w, p.vehicle_box[3] * sz.h];
  const off = C.offCentre(box, sz, SLOT);
  check(Math.abs(off) <= 0.10, `${p.image} (${sz.w}x${sz.h}): vehicle centre ${(off * 100).toFixed(1)}% of the frame width from centre at 390 px (≤ 10%)`);
}
// the crop helper: centred on the vehicle, whole vehicle width, clear of the watermark, approved zoom kept
const r = C.centreCrop({ w: 2048, h: 1365 }, [962, 445, 1100, 1125], { avoid: [[1570, 1130, 2048, 1365]], top: 315, maxW: 1440 });
check(r && Math.abs(r.x + r.w / 2 - 1031) <= 1 && r.w === 1440 && r.y + r.h <= 1130 && r.x <= 962 && r.x + r.w >= 1100, "centreCrop: centred on the vehicle, keeps its width and the zoom, stays clear of the watermark");
const r2 = C.centreCrop({ w: 2172, h: 3257 }, [780, 55, 1325, 3230], { avoid: [[0, 0, 345, 340]], top: 30 });
check(r2 && r2.x >= 345 && Math.abs(r2.x + r2.w / 2 - 1052.5) <= 1 && r2.y <= 55, "centreCrop: a watermark in the corner narrows the crop instead of cutting the vehicle's top");
check(Math.abs(C.offCentre([300, 0, 500, 900], { w: 1600, h: 900 })) > 0.10, "offCentre flags a vehicle a quarter of the frame off centre");
console.log(`\n${n - fails}/${n} checks passed`); process.exit(fails ? 1 : 0);
