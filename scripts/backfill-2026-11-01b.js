/* 1 Nov follow-up (data only). Idempotent. Usage: node scripts/backfill-2026-11-01b.js [--dry]
   a) Flight 16 feed items (S43/B23) off Flight 15's sections: scope.enforce (box removed, later_flight, flight 16);
      ids, links, push_text and push records unchanged → nothing re-fires.
   b) Cryo · S42: the LabPadre post's own media (video still), saved as images/s42-cryo-labpadre.jpg, credited @LabPadre.
      images/ship-cryo.jpg stays in the repo. No keep_image.
   c) Cryo · B22: the LabPadre 10 Sep row describes the SAME overnight test as Blobifie's (both: "last night", 9–10 Sep),
      so its drawer wording says so; count stays 1. */
const fs = require("fs"), path = require("path"), SC = require("./scope.js");
function apply(road, { log = console.log } = {}) {
  const out = []; const ch = (w, a, b) => { out.push(w); log(`FIX ${w} | ${JSON.stringify(a)} → ${JSON.stringify(b)}`); };
  for (const m of SC.enforce(road)) ch(`${m.id} ${m.from}`, m.text, m.why);
  const cryo = road.categories.find((c) => c.id === "cryo");
  const s42 = cryo.history.find((h) => h.url === "https://x.com/LabPadre/status/2108486994401825101");
  const IMG = "images/s42-cryo-labpadre.jpg";
  if (s42 && s42.media_override && s42.media_override.image !== IMG) {
    const was = s42.media_override.image;
    s42.media_override = { ...s42.media_override, image: IMG, source_image: was, author: "LabPadre", post_url: "https://x.com/LabPadre/status/2108486994401825101", fixed: "2026-11-01 own post media saved locally (replaces the unknown-source standing photo)" };
    delete s42.frameChecked; ch("cryo S42 media_override.image", was, IMG);
  }
  const b22 = cryo.history.find((h) => h.milestone && h.milestone.key === "cryo_test|15|B22");
  const SAME = "Same overnight test: Booster 22 was filled, held at pressure, then detanked.";
  for (const u of (b22 && b22.updates) || []) if (u.url === "https://x.com/LabPadre/status/2098045579234259249" && u.card_text !== SAME) { ch("cryo B22 › 10 Sep LabPadre row card_text", u.card_text || u.text, SAME); u.card_text = SAME; u.same_event = "cryo_test|15|B22"; }
  return out;
}
module.exports = { apply };
if (require.main === module) {
  const f = path.join(__dirname, "..", "road.json"), road = JSON.parse(fs.readFileSync(f, "utf8"));
  const r = apply(road); if (!process.argv.includes("--dry")) fs.writeFileSync(f, JSON.stringify(road, null, 2) + "\n");
  console.log(`\n${r.length} changes${process.argv.includes("--dry") ? " (dry run)" : ""}`);
}
