/* Result-story gate: a logged flight story may only say what confirmed stage outcomes say.
   verifyStory(story, results) — results = the confirmed one-line outcomes of the flight ("Booster 22 skipped the tower
   catch and splashed down in the Gulf.", "Ship 42 was caught by the tower."). Returns { ok, problems[] }.
   Catches the 14 Nov dac2d2b case: "Both stages completed their returns to the launch site" when the booster splashed down.
   isTrustedResult(src, line) — a stage result only counts when its source line is not a rumour / opinion / plan. */
const kind = (s) => {
  const t = String(s || "");
  if (/\b(lost|exploded|broke up|destroyed|did not survive|RUD)\b/i.test(t)) return "lost";
  if (/\b(skipped|did not|didn'?t|missed|instead)\b[^.]*\b(catch|return|land)/i.test(t) || /\b(splash(?:ed)? ?down|ocean|gulf|diverted|offshore|water)\b/i.test(t)) return "splashdown";
  if (/\bcaught\b|\bcatch (?:was )?successful/i.test(t)) return "caught";
  if (/\b(landed|touched down|returned to the launch site|soft landing)\b/i.test(t)) return "landed";
  return "unknown";
};
const RETURNED = new Set(["caught", "landed"]);
function stageFacts(results) {
  const f = { booster: "unknown", ship: "unknown" };
  for (const r of results || []) { const st = /\b(booster|super heavy|B\d{2,3})\b/i.test(r) ? "booster" : /\b(ship|starship|S\d{2,3})\b/i.test(r) ? "ship" : null; if (st) f[st] = kind(r); }
  return f;
}
function verifyStory(story, results) {
  const s = String(story || ""), f = stageFacts(results), problems = [];
  const sentences = s.split(/(?<=[.!?])\s+/);
  const clauses = (x) => x.split(/,\s*|;\s*|\s+(?:while|whereas|but|and then)\s+|\s+and\s+(?=(?:the\s+)?(?:booster|ship|super heavy|starship)\b)/i); // "Booster … splashed down, while Ship … was caught": one claim per clause
  const bothClaim = /\bboth (?:stages|vehicles|the booster and (?:the )?ship|booster and ship)\b[^.]*\b(returned?|returns|caught|landed|recovered|came back)\b/i;
  for (const x of sentences) {
    if (bothClaim.test(x) && !(RETURNED.has(f.booster) && RETURNED.has(f.ship))) problems.push(`claims both stages returned/were caught, but confirmed outcomes are booster=${f.booster}, ship=${f.ship}: "${x.slice(0, 90)}"`);
    for (const c of clauses(x)) {
      if (/\b(?:booster|super heavy)\b[^.]*\b(?:was )?caught\b/i.test(c) && !/\bship\b|\bstarship\b/i.test(c) && !/\bskipp|\bnot\b|\bwithout\b|\binstead\b/i.test(c) && f.booster !== "caught") problems.push(`says the booster was caught; confirmed booster outcome is ${f.booster}: "${c.slice(0, 90)}"`);
      if (/\b(?:ship|starship)\b[^.]*\b(?:was )?caught\b/i.test(c) && !/\bbooster\b|\bsuper heavy\b/i.test(c) && !/\bskipp|\bnot\b|\bwithout\b|\binstead\b/i.test(c) && f.ship !== "caught") problems.push(`says the ship was caught; confirmed ship outcome is ${f.ship}: "${c.slice(0, 90)}"`);
    }
    if (/\breturned to the launch site\b/i.test(x) && !bothClaim.test(x) && !(RETURNED.has(f.booster) || RETURNED.has(f.ship))) problems.push(`says a stage returned to the launch site; no confirmed outcome says so: "${x.slice(0, 90)}"`);
  }
  if (f.booster === "unknown" || f.ship === "unknown") problems.push(`no confirmed outcome for ${["booster", "ship"].filter((k) => f[k] === "unknown").join(" + ")}`);
  return { ok: problems.length === 0, problems, facts: f };
}
const RUMOUR_SRC = /elon|musk/i, HEDGED = /\b(plans?|aims?|hopes?|could|may|might|expected|anticipated|attempts?|will|planned|potential)\b/i;
function isTrustedResult(src, line) { return !RUMOUR_SRC.test(String(src || "")) && !HEDGED.test(String(line || "").replace(/\(.*?\)\s*\.?$/, "")); }
module.exports = { verifyStory, stageFacts, isTrustedResult, kind };
