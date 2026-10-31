/* One-off backfill (31 Oct 2026) of old entries under today's rules. No API calls, NO pushes, NO milestones, no picture changes.
     1. past-tense card_text for every card + Earlier-update row (text-split.js toCard; text / x_text / push wording untouched)
     2. journey memory: replay every tracked vehicle through journey.js (journey-replay.js); any reroute or count change is
        REPORTED for review only (never applied: a wrong reroute would put booster news on a ship card)
     3. routing guards (guards.js run, no prev → no date-slip push; addFeedItem/slipPush not passed)
     4. the daily self-check rules (self-check.js audit, deterministic: no judge)
   Usage: node scripts/backfill-2026-10-31.js [--dry]   (the snapshot is data/snapshots/2026-10-31/, committed separately) */
const fs = require("fs"), path = require("path");
const TS = require("./text-split.js"), G = require("./guards.js"), SC = require("./self-check.js");
const ROOT = path.join(__dirname, "..");
async function backfill(road, { log = console.log, root = ROOT, dryRun = false } = {}) {
  const before = JSON.parse(JSON.stringify(road)), out = { text: [], journey: [], guards: [], selfCheck: null };
  // 1. past tense
  for (const c of road.categories || []) for (const h of c.history || []) for (const [r, up] of [[h, false], ...(h.updates || []).map((u) => [u, true])]) {
    if (!r.text || r.text_locked || TS.isMissionLine(r.text)) continue;
    const confirmed = TS.isConfirmed(r) && (!up || h.trust !== "unconfirmed");
    const card = TS.toCard(r.card_text || r.text, { confirmed }); if (!card || card === (r.card_text || r.text) || card === r.card_text) continue;
    out.text.push({ where: `${c.id} ${h.id || h.date}${up ? ` › ${r.at || r.date}` : ""}`, before: r.card_text || r.text, after: card }); r.card_text = card;
  }
  // 2. journey replay (report only)
  try {
    const JR = require("./journey-replay.js");
    if (JR.replay) for (const v of road.vehicles || []) { const res = JR.replay(road, v), cur = (road.journeys || {})[v] || {};
      for (const l of res.rows) if (l.to && l.from && l.to !== l.from) out.journey.push(`${v}: "${l.text}" would move ${l.from} → ${l.to} (not applied)`);
      for (const k of ["cryo", "static"]) if (((res.state.done || {})[k] || 0) !== ((cur.done || {})[k] || 0)) out.journey.push(`${v}: journey ${k} count ${(cur.done || {})[k] || 0} stored vs ${(res.state.done || {})[k]} replayed (kept stored; needs review)`); }
  } catch (e) { out.journey.push(`replay skipped: ${e.message}`); }
  // 3. guards (no prev → no media/recap/date-slip pass; pushes impossible)
  const g = G.run(road, { log: (m) => out.guards.push(m) });
  if (g.pushes.length) throw new Error("backfill: guards produced a push");
  // 4. self-check rules
  out.selfCheck = await SC.audit(road, { log, root, dryRun, judge: null });
  // invariants
  const prevById = new Map((before.categories || []).flatMap((c) => (c.history || []).filter((h) => h.id).map((h) => [h.id, h])));
  const down = G.mediaDowngrades(JSON.parse(JSON.stringify(road)), prevById); if (down.length) throw new Error(`backfill: media changed: ${down.join("; ")}`);
  if (JSON.stringify(before.milestones) !== JSON.stringify(road.milestones)) throw new Error("backfill: milestones changed");
  if ((before.feed_items || []).length !== (road.feed_items || []).length) throw new Error("backfill: feed items added/removed");
  const urls = (r) => new Set(JSON.stringify(r).match(/https:\/\/(?:x\.com|www\.nasaspaceflight\.com)[^"]+/g) || []);
  const after = urls(road), lost = [...urls(before)].filter((u) => !after.has(u)); if (lost.length) throw new Error(`backfill: source links dropped: ${lost.join(", ")}`);
  return out;
}
module.exports = { backfill };
if (require.main === module) (async () => {
  const dry = process.argv.includes("--dry"), file = path.join(ROOT, "road.json"), road = JSON.parse(fs.readFileSync(file, "utf8"));
  const r = await backfill(road, { dryRun: dry });
  for (const x of r.text) console.log(`past-tense ${x.where}\n  ${x.before}\n→ ${x.after}`);
  for (const x of r.journey) console.log(`journey: ${x}`);
  for (const x of r.guards) console.log(x);
  console.log(`\n${r.text.length} past-tense, ${r.journey.length} journey notes, ${r.guards.length} guard lines, self-check ${r.selfCheck.fixes.length} fixes / ${r.selfCheck.flags.length} flags`);
  if (!dry) { fs.writeFileSync(file, JSON.stringify(road, null, 2) + "\n"); SC.writeReview([...r.selfCheck.flags, ...r.journey.map((j) => ({ type: "journey", msg: j, reason: "journey replay differs from the stored memory; stored value kept" }))], path.join(ROOT, "data", "needs-review.json")); }
})();
