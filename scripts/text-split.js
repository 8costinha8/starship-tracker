/* Two wordings per update:
     push_text — live, present tense, for push notifications ("Frost on both tanks: Ship 42 likely in another cryo test.")
     card_text — past tense, for Road cards and Earlier updates.
                 confirmed:   "Ship 42 completed another cryo test."
                 unconfirmed: "Ship 42 likely ran another cryo test."
   The old `text` field stays as the fallback, so old data still renders and pushes still read the same line.
   Rules for every wording: satellites/payloads are "deployed", never "released"; no "Test flight mission" line;
   nothing unconfirmed says "completed"; unconfirmed card_text uses "likely ran" / "likely had". Pure functions. */
const pushText = (o, fb) => (o && (o.push_text || fb || o.text)) || "";
const cardText = (o) => (o && (o.card_text || o.text)) || "";
const isConfirmed = (o) => !!o && !o.likely && o.trust !== "unconfirmed" && !o.unverified && !o.hedged && !o.journey_likely;
const fix = (s) => String(s || "").replace(/\breleas(e|es|ed|ing)\b/gi, (m, e) => (/^R/.test(m) ? "Deploy" : "deploy") + ({ e: "", es: "s", ed: "ed", ing: "ing" })[e.toLowerCase()]).replace(/\s+/g, " ").trim();
const isMissionLine = (s) => /^\s*test flight mission\b/i.test(String(s || ""));
// Present-tense / likely wording → past tense card wording.
function toCard(line, { confirmed = true } = {}) {
  let t = fix(line); if (!t || isMissionLine(t)) return null;
  t = t.replace(/^frost on [^:]+:\s*/i, "");                                        // the observation belongs to the push only
  const V = "((?:Ship|Booster) \\d+|[BS]\\d+)";
  const R = [
    [new RegExp(`^${V} (?:is )?likely in (another|a|its \\w+) cryo test`, "i"), (m, v, a) => confirmed ? `${v} completed ${a} cryo test` : `${v} likely ran ${a} cryo test`],
    [new RegExp(`^${V} (?:is )?likely preparing for (a|its|another) static fire`, "i"), (m, v, a) => `${v} likely prepared for ${a} static fire`],
    [new RegExp(`^${V} (?:is )?likely in (a|another) launch rehearsal`, "i"), (m, v, a) => confirmed ? `${v} completed ${a} launch rehearsal` : `${v} likely had ${a} launch rehearsal`],
    [new RegExp(`^${V} (?:is )?likely in propellant loading`, "i"), (m, v) => `${v} likely had propellant loading`],
    [new RegExp(`^${V} (?:is )?in (another|a) cryo test`, "i"), (m, v, a) => confirmed ? `${v} completed ${a} cryo test` : `${v} likely ran ${a} cryo test`],
  ];
  for (const [re, f] of R) if (re.test(t)) { t = t.replace(re, f); break; }
  t = t.replace(/\b(is|are) being (\w+ed)\b/g, (m, a, v) => `${a === "is" ? "was" : "were"} ${v}`)        // present → past for card rows
    .replace(/\bhas been (\w+ed)\b/g, "was $1").replace(/\bhas (left|arrived|rolled|returned|moved|completed)\b/g, "$1")
    .replace(/\b(rolls|arrives|heads|leaves|returns|moves|lifts) (?=out|at|to|back|for|on|onto|from|the|Mega|Pad|Massey)/g, (m) => ({ "rolls ": "rolled ", "arrives ": "arrived ", "heads ": "headed ", "leaves ": "left ", "returns ": "returned ", "moves ": "moved ", "lifts ": "lifted " })[m])
    .replace(/^((?:Ship|Booster) \d+) is back at\b/, "$1 was back at");
  if (!confirmed) t = t.replace(/\b(?:has |have )?completed\b/gi, "likely ran").replace(/\blikely (?:likely )+/gi, "likely ");
  t = t.replace(/^\w/, (c) => c.toUpperCase());
  return /[.!?]$/.test(t) ? t : t + ".";
}
// Rule check for a pair (writer output or backfill): returns a list of problems.
function lint({ push_text, card_text }, { confirmed = true } = {}) {
  const p = [];
  for (const [k, s] of [["push_text", push_text], ["card_text", card_text]]) {
    if (!s) continue;
    if (/\breleas(e|es|ed|ing)\b/i.test(s)) p.push(`${k}: says "released" (use "deployed")`);
    if (isMissionLine(s)) p.push(`${k}: "Test flight mission" line`);
    if (!confirmed && /\bcompleted?\b/i.test(s)) p.push(`${k}: unconfirmed but says "completed"`);
  }
  if (card_text && !confirmed && !/\blikely (ran|had|prepared)\b/i.test(card_text) && /\blikely\b/i.test(card_text)) p.push(`card_text: unconfirmed card must use "likely ran" / "likely had"`);
  if (card_text && /^frost on\b/i.test(card_text)) p.push("card_text: observation wording belongs to push_text");
  return p;
}
// Writer output → the pair stored on an entry/update. Falls back to rule-derived wordings.
function pairFrom(cls, { confirmed = true } = {}) {
  const base = fix(cls && cls.text);
  let push = fix((cls && cls.push_text) || base) || null, card = fix(cls && cls.card_text) || null;
  if (push && isMissionLine(push)) push = null;
  if (!card || lint({ card_text: card }, { confirmed }).length) card = toCard(card || push || base, { confirmed });
  if (push && !confirmed && /\bcompleted?\b/i.test(push)) push = push.replace(/\b(?:has )?completed\b/gi, "likely finished");
  return { ...(push ? { push_text: push } : {}), ...(card ? { card_text: card } : {}) };
}
const PROMPT_RULES = `push_text: the live push notification line, PRESENT tense, as it is happening ("Frost on both tanks: Ship 42 likely in another cryo test.").
card_text: the card / Earlier updates line, PAST tense. Confirmed: "Ship 42 completed another cryo test." Not confirmed (inferred, hedged, frost only, rumour): "Ship 42 likely ran another cryo test." / "Booster 22 likely had a launch rehearsal.".
Both: satellites/payloads are "deployed", never "released"; never a "Test flight mission" line; nothing unconfirmed says "completed"; unconfirmed card_text uses "likely ran" or "likely had".`;
module.exports = { pushText, cardText, isConfirmed, toCard, lint, pairFrom, fix, isMissionLine, PROMPT_RULES };
