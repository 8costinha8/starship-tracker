// 24 Nov v5: a photo with its source's logo burned in shows no round badge on top (one logo, not two).   node scripts/test-photo-marks.js
const fs = require("fs"), path = require("path");
const M = require("./photo-marks.js");
let pass = 0, fail = 0; const check = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "✅" : "❌"} ${m}`); };
const RGV = "https://pbs.twimg.com/amplify_video_thumb/2124764895292133376/img/OZnACetsr9Q5nFho.jpg";
check(M.hideBadge(RGV, 16 / 9, "top"), "B24 RGV livestream thumb in the 16:9 card: RGV logo on screen → no round badge");
check(M.hideBadge(RGV, 16 / 9, "bottom"), "same photo, bottom crop (16:9 photo in a 16:9 slot shows it all) → no badge");
check(!M.hideBadge(RGV, 0.6, "top"), "same photo in a narrow 0.6 slot (logo cropped off the right) → the badge stays");
check(!M.hideBadge("https://pbs.twimg.com/media/unmarked.jpg"), "a photo with no recorded mark keeps its badge");
check(!M.hideBadge("images/b23-cryo-starshipgazer-clean.jpg") && !M.hideBadge("images/s43-cryo-wai-clean.jpg") && !M.hideBadge("images/s43-pad-mymatrixplug-clean.jpg"), "watermark-cropped picks keep their badge (no mark in the crop)");
// a mark half off the top edge of a tall-slot crop: window maths
const w = M.windowOf(1600, 900, 1, "top"); check(Math.abs(w[0] - 0.21875) < 1e-6 && Math.abs(w[2] - 0.78125) < 1e-6 && w[1] === 0 && w[3] === 1, "cover window: 16:9 photo in a square slot keeps the middle 56%");
// every recorded mark: box inside the image, real image size, and the box really is the logo spot of a photo the app uses
const live = ["data/vehicles.json", "road.json"].map((f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8")).join("\n");
for (const m of M.MARKS) {
  check(m.box.every((v) => v >= 0 && v <= 1) && m.box[0] < m.box[2] && m.box[1] < m.box[3] && m.w > 0 && m.h > 0 && m.handle, `mark ${m.handle}: box and size are valid`);
  check(live.includes(m.match), `mark ${m.handle}: its photo is in the live data (${m.match.slice(0, 40)}…)`);
}
// the app asks PhotoMarks before drawing the badge, with the slot's crop
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8"), idx = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
check(/PhotoMarks\)/.test(app) && /P\.hideBadge\(image, aspect, crop\)/.test(app) && /markHidesBadge\(image, aspect, crop\)\) return null/.test(app) && /<script defer src="scripts\/photo-marks\.js"><\/script>/.test(idx), "SrcBadge checks PhotoMarks.hideBadge; index.html loads scripts/photo-marks.js");
// the B24 photo is not locked (Tusk is sourcing candidates for Bernardo)
const media = fs.readFileSync(path.join(__dirname, "..", "road-media.json"), "utf8");
check(!media.includes("OZnACetsr9Q5nFho"), "B24 RGV photo is not a recorded pick (not locked)");
console.log(`\n${pass}/${pass + fail} checks passed`); if (fail) process.exit(1);
