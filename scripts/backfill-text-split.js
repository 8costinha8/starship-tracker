/* One-off backfill (no API calls): card_text for the existing S42 and B22 rows, by rule (text-split.js toCard).
   Only rows whose card wording differs from `text` get card_text (the rest already read right via the fallback);
   likely rows also get push_text = their current live line. Prints every changed row. Usage: node scripts/backfill-text-split.js [--dry] */
const fs = require("fs"), path = require("path"), TS = require("./text-split.js");
const file = path.join(__dirname, "..", "road.json");
const VEH = /\b(?:Ship 42|S42|Booster 22|B22)\b/;
function backfill(road) {
  const changed = [];
  for (const c of road.categories || []) for (const h of c.history || []) {
    const rows = [{ r: h, where: `${c.id} ${h.id || h.date}` }, ...(h.updates || []).map((u, i) => ({ r: u, where: `${c.id} ${h.id || h.date} › update ${i} (${u.at || u.date})`, parent: h }))];
    for (const { r, where, parent } of rows) {
      if (!r.text || r.card_text || !VEH.test(r.text)) continue;
      const confirmed = TS.isConfirmed(r) && (!parent || parent.trust !== "unconfirmed");
      const card = TS.toCard(r.text, { confirmed });
      if (!card || card === r.text) continue;
      r.card_text = card; if (r.likely && !r.push_text) r.push_text = r.text;
      changed.push({ where, before: r.text, after: card, confirmed });
    }
  }
  return changed;
}
if (require.main === module) {
  const road = JSON.parse(fs.readFileSync(file, "utf8")), ch = backfill(road);
  for (const x of ch) console.log(`${x.where}${x.confirmed ? "" : " [unconfirmed]"}\n  ${x.before}\n→ ${x.after}`);
  console.log(`${ch.length} rows changed`);
  if (!process.argv.includes("--dry")) fs.writeFileSync(file, JSON.stringify(road, null, 2) + "\n");
}
module.exports = { backfill };
