/* 31 Oct polish (data only): verbless fragments and 'being X' / 'has returned' wording on cards, drawers, the Flight Log
   and the feed → full past-tense sentences. Only the RENDERED field changes: card_text on Road entries / rows, the pinned
   Flight Log line text, the body of news feed items (original push wording kept in push_text; launch_date feed items are
   never touched, so guards.js cannot re-add a push). Idempotent. Usage: node scripts/backfill-2026-10-31-polish.js [--dry] */
const fs = require("fs"), path = require("path");
const MAP = {
  "Ship 42's Raptors were reportedly being reinstalled; all 6 Raptors were installed by 26 Oct.": "Ship 42's Raptors were reinstalled; all 6 were in by 26 Oct.",
  "Ship 42 ready with all 6 Raptors.": "Ship 42 was ready with all 6 Raptors.",
  "Booster 22 ready with all 33 Raptors.": "Booster 22 was ready with all 33 Raptors.",
  "Booster 22 back at the production site.": "Booster 22 returned to the production site.",
  "Two back-to-back cryo proof tests.": "Ship 42 completed two back-to-back cryo proof tests.",
  "More catch tests at the tower top, plus launch and landing deluge tests.": "SpaceX ran more catch tests at the tower top, plus launch and landing deluge tests.",
  "Catch testing with the Pad 2 chopsticks at the top of the tower.": "SpaceX ran catch testing with the Pad 2 chopsticks at the top of the tower.",
  "Pad 2 chopsticks under maintenance.": "Pad 2's chopsticks were under maintenance.",
  "Lifting jig raised for Booster 22 engine testing in Megabay 1.": "The lifting jig was raised for Booster 22 engine testing in Megabay 1.",
  "Full duration static fire completed for booster preparing for flight 15": "Booster 22 completed a full-duration static fire for Flight 15",
  "Booster 22 transport ring relocated ahead of static fire test.": "Booster 22's transport ring was relocated ahead of its static fire test.",
  "Road closed ahead of static fire test.": "The road was closed ahead of the static fire test.",
  "Ship 43 is being transported by road to the production site": "Ship 43 was transported by road to the production site",
  "Booster 23 has returned to Megabay 1 from the Massey outpost": "Booster 23 returned to Megabay 1 from the Massey outpost",
  "Ship 43 has returned to the production site from chopstick tests": "Ship 43 returned to the production site from chopstick tests",
  "Booster 24 methane tank lifted inside Megabay 1 this evening": "Booster 24's methane tank was lifted inside Megabay 1 that evening",
};
function apply(road, { log = console.log } = {}) {
  const changes = []; const ch = (where, a, b) => { changes.push({ where, before: a, after: b }); log(`FIX ${where} | "${a}" → "${b}"`); };
  for (const c of road.categories || []) for (const h of c.history || []) {
    const shown = h.card_text || h.x_text || h.text; if (MAP[shown]) { ch(`${c.id} ${h.id} card_text`, shown, MAP[shown]); h.card_text = MAP[shown]; }
    for (const u of h.updates || []) { const s = u.card_text || u.text; if (MAP[s]) { ch(`${c.id} ${h.id} › ${u.date || u.at} card_text`, s, MAP[s]); u.card_text = MAP[s]; } }
  }
  for (const [id, b] of Object.entries(((road.flightlog_pins || {}).boxes) || {})) for (const k of b.cards || []) for (const l of k.lines || [])
    if (MAP[l.text]) { ch(`Flight Log pin ${id} ${k.vehicle} ${l.day}`, l.text, MAP[l.text]); l.text = MAP[l.text]; }
  for (const f of road.feed_items || []) if (f && f.kind === "news" && MAP[f.body]) { if (!f.push_text) f.push_text = f.body; ch(`feed ${f.id} body (push_text kept)`, f.body, MAP[f.body]); f.body = MAP[f.body]; }
  return { changes };
}
module.exports = { apply, MAP };
if (require.main === module) {
  const file = path.join(__dirname, "..", "road.json"), road = JSON.parse(fs.readFileSync(file, "utf8"));
  const r = apply(road); if (!process.argv.includes("--dry")) fs.writeFileSync(file, JSON.stringify(road, null, 2) + "\n");
  console.log(`\n${r.changes.length} changes${process.argv.includes("--dry") ? " (dry run)" : ""}`);
}
