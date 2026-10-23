/* One-time migration (run by hand, never by the workflow): gives the road.json entries written before
   the lifecycle model a milestone (type + flight + vehicle + phase) and a source tier, using the same
   rules as x-first.js placePost (milestoneKey, source-tiers tierOf/hedged), and folds entries of the
   same milestone into ONE lifecycle entry with the older lines as its Build-up list.
   Sends no pushes: it never loads push-sync / firebase, only rewrites road.json. Idempotent.
   Usage: node scripts/migrate-lifecycle.js [path/to/road.json] [--dry] */
const fs = require("fs"), path = require("path");
const xf = require("./x-first.js"), tiers = require("./source-tiers.js");
const { hwKey, milestoneKey } = xf;

// event type from the line (same set as MILESTONE_TYPES; the box decides when the words don't)
const TYPE_RULES = [
  [/static[\s-]?fire/i, "static_fire"], [/\bwdr\b|wet dress/i, "wdr"], [/cryo|proof test/i, "cryo_test"],
  [/raptor|engines?\b/i, "engines_installed"], [/\bstack(ed|ing)?\b/i, "stacked"], [/roll(ed|s)? ?out/i, "rollout"],
  [/licen[cs]e/i, "licence"], [/\bNET\b|target(s|ing)?\b|launch date/i, "launch_date"],
];
const BOX_TYPE = { cryo: "cryo_test", raptor: "engines_installed", static: "static_fire", pad: "pad_work", faa: "licence", date: "launch_date" };
function typeOf(box, text) {
  if (box === "pad") return /static[\s-]?fire/i.test(text) && /\bheads?\b|roll/i.test(text) ? "rollout" : "pad_work";
  if (box === "static") return "static_fire";
  for (const [re, t] of TYPE_RULES) if (re.test(text) && Object.values(BOX_TYPE).includes(t) && BOX_TYPE[box] === t) return t;
  return BOX_TYPE[box] || null;
}
function phaseFor(type, text, tier, hedge) {
  if (tier === 3 || hedge || /\b(ahead of|waiting|ready for|could|estimate|suggests|targeting|NET|expected|planned)\b/i.test(text)) return "expected";
  if (/\bneeds?\b|only\b/i.test(text)) return "expected"; // "issued for Flight 14 only, F15 needs…": not done for this flight
  if (/\b(complete[sd]?|finished|issued|passed|rolled back|removed)\b/i.test(text)) return "completed";
  return "progress";
}
const handleOf = (h) => (h.x_post && h.x_post.author && h.x_post.author.username) || (/^@(\w+)/.exec(h.src || "") || [])[1] || "";
function tierFor(h) {
  const u = handleOf(h);
  if (u) return tiers.tierOf({ author: { username: u } }, { text: h.x_text || h.text });
  if (/^(SpaceX|FAA)\b/i.test(h.src || "")) return 1; // official statements relayed by a site
  const host = String(h.url || "").replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  if (tiers.TIER1_SITES.includes(host) || /^NSF\b(?!.*(estimate|unofficial|secondary))/i.test(h.src || "")) return tiers.hedged({ text: h.text }) ? 1 : 1;
  return tiers.hedged({ text: h.text }) ? 3 : 2;
}
const vehicleOf = (h, text) => hwKey(h.hardware) || ((String(text).match(/\b(?:Ship|S)\s?(\d{2,3})\b|\b(?:Booster|B)\s?(\d{2,3})\b/) || []).slice(1).map((d, i) => d && (i ? "B" : "S") + d).find(Boolean)) || null;

const LT = require("./log-text.js");
function migrate(road) {
  let touched = 0, folded = 0;
  for (const c of road.categories || []) {
    const hist = c.history || [], out = [], open = new Map();
    for (const h of hist) { // newest first
      if (!h || h.kind === "check" || h.demo) { out.push(h); continue; }
      const text = h.x_text || h.text || "";
      if (!h.tier) { h.tier = tierFor(h); touched++; }
      const hedge = h.tier === 1 && tiers.hedged({ text });
      if (hedge) h.hedged = true;
      if (!h.milestone) {
        const type = typeOf(c.id, text);
        if (type) {
          const flight = Number.isInteger(h.flight) ? h.flight : road.flight, hw = vehicleOf(h, text);
          const mkHw = c.id === "pad" || c.id === "faa" || c.id === "date" ? null : hw; // site/flight-level milestones group by flight
          h.milestone = { key: milestoneKey(type, flight, mkHw), type, flight, hardware: hw, phase: phaseFor(type, text, h.tier, hedge), migrated: true };
          touched++;
        }
      }
      if (h.milestone && h.milestone.phase === "completed") h.complete = true; else delete h.complete;
      const k = h.milestone && h.milestone.key, head = k && open.get(k);
      if (head && h.milestone.migrated && !h.manual && !head.manual && (LT.isRejected(road, c.id, h) || LT.isMonthMixup(head, h))) { folded++; continue; } // a rejected line or a month mix-up of the entry's own story is dropped, never folded in
      if (head && h.milestone.migrated && !h.manual && !head.manual) { // hand-made cards stay their own entry // older line of the same milestone: under the newest entry as build-up
        head.updates = [...(head.updates || []), { date: h.date, at: h.at, text, url: h.url, src: h.src, phase: h.milestone.phase, tier: h.tier }].slice(0, 20);
        if (h.x_posts) head.x_posts = [...new Set([...(head.x_posts || []), ...h.x_posts])];
        folded++; continue;
      }
      if (k) open.set(k, h);
      out.push(h);
    }
    c.history = out;
  }
  return { touched, folded };
}
module.exports = { migrate, typeOf, phaseFor, tierFor };
if (require.main === module) {
  const p = process.argv.slice(2).find((a) => !a.startsWith("--")) || path.join(__dirname, "..", "road.json");
  const road = JSON.parse(fs.readFileSync(p, "utf8")), r = migrate(road);
  console.log(`migrated: ${r.touched} field set(s), ${r.folded} entr(ies) folded into build-up lists — no pushes sent`);
  if (!process.argv.includes("--dry")) fs.writeFileSync(p, JSON.stringify(road, null, 2) + "\n");
}
