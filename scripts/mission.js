/* Mission updates for the upcoming flight (road.json "mission_updates": { "<flight>": [ ... ] }).
   Written from X-first "mission-update" verdicts, shown as small text lines on the Next flight
   card (Flight Log page). One line per topic: the newest post on a topic replaces the older line.
   NET / launch-date posts never become a line: the date display is owned by LL2 + the predicted-date
   code, so those posts are handed to that code instead (no duplicate, no push from here). */
const MAX_LINES = 5;
const SITE = "https://8costinha8.github.io/starship-tracker/";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ukDay = (iso) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", timeZone: "Europe/London" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${Number(p.day)} ${MON[p.month - 1]}`; };
// The text never repeats the person/org named in the credit: "Elon Musk says X" credited to Elon Musk → "X".
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function dropCreditedSpeaker(text, attribution) {
  const t = String(text || "").trim(), a = String(attribution || "").replace(/\b(confirm\w*|reports?|says|said|announced)\b/gi, "").trim();
  if (!a) return t;
  const names = [a, ...(a.split(/\s+/).length > 1 ? [a.split(/\s+/).pop()] : [])].map(esc).join("|"); // "Elon Musk" or "Musk"
  const m = t.match(new RegExp(`^(?:${names})(?:'s)?\\s+(?:says|said|confirms|confirmed|announces|announced|reports|reported|tweeted|posted|writes|wrote|stated|states)(?:\\s+that)?[:,]?\\s+(.+)$`, "i"));
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : t;
}
// Starship only: Falcon 9 / Starlink / Dragon posts (and context-free posts like "Payload deployment sequence
// is complete") can never become a Starship mission line.
const NOT_STARSHIP = /\bfalcon\b|\bstarlink\s*(?:\d+-\d+|mission)|\bstarlink\b.*\b(?:deploy|satellites)\b|\bdragon\b|\bcrew-\d+|\bcrs-\d+|\btransporter-\d+|\bbandwagon-\d+|\bvandenberg\b|\bslc-\d+|\blc-39a\b|\bcape canaveral\b|\bdroneship\b|\bocisly\b|\basog\b|\bjrti\b|\bfirst stage\b/i;
const STARSHIP = /\bstarship\b|\bsuper heavy\b|\bflight \d+\b|\b(?:ship|booster) \d+\b|\b[SB]\d{2}\b|\bstarbase\b|\bchopsticks\b|\bmechazilla\b|\braptors?\b|\bpad (?:1|2|a|b)\b|\bboca chica\b|\bmassey'?s\b|\bmegabay\b|\bdouble catch\b|\bcatch\b/i;
function isStarshipPost(post, text) {
  const own = `${(post && post.text) || ""} ${(post && post.quoted_text) || ""}`;
  if (NOT_STARSHIP.test(own) || NOT_STARSHIP.test(String(text || ""))) return false;
  return STARSHIP.test(own);
}
function lineFor({ text, attribution, at }) {
  const t = dropCreditedSpeaker(text, attribution).replace(/[.\s]+$/, "");
  return `${t} (${[attribution && String(attribution).trim(), ukDay(at)].filter(Boolean).join(", ")}).`;
}
// Returns { changed, line, net } — net: true when it's a launch-date item (handled elsewhere).
function applyMissionUpdate(road, flight, { topic, text, attribution, post }) {
  if (topic === "net") return { changed: false, net: true };
  if (!isStarshipPost(post, text)) return { changed: false, rejected: "not a Starship post" };
  if (((road.rejected_lines || []).some((r) => r.box === "mission" && (r.post_id === post.post_id || (r.text && String(r.text).toLowerCase() === String(text || "").toLowerCase()))))) return { changed: false, rejected: "rejected line" };
  const at = post.created_at, line = lineFor({ text, attribution, at });
  const all = (road.mission_updates = road.mission_updates || {});
  const list = (all[flight] = all[flight] || []);
  const i = list.findIndex((u) => u.topic === topic);
  if (i >= 0 && (list[i].line === line || Date.parse(list[i].at) >= Date.parse(at))) return { changed: false, line }; // same line, or an older post
  const u = { topic, line, at, src: `@${post.author.username}`, url: post.url, post_id: post.post_id };
  if (i >= 0) list.splice(i, 1);
  list.unshift(u); list.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)); list.splice(MAX_LINES);
  return { changed: true, line, entry: u };
}
// Same item as the Next flight card line: text, source post link and the post's own time.
const missionPush = (flight, line, u = {}) => ({ title: `Flight ${flight} update`, body: line, link: `${SITE}?flight=${flight}`, url: u.url || "", at: u.at, kind: "mission", visible: { where: "mission", flight } });
function validateMission(road) {
  for (const [k, list] of Object.entries(road.mission_updates || {})) {
    if (!/^\d+$/.test(k) || !Array.isArray(list) || list.length > MAX_LINES || list.some((u) => !u || !u.topic || u.topic === "net" || !u.line || u.line.length > 200 || !u.at))
      throw new Error(`bad mission_updates for flight ${k}`);
    if (new Set(list.map((u) => u.topic)).size !== list.length) throw new Error(`mission_updates for flight ${k}: one line per topic`);
  }
}
module.exports = { isStarshipPost, dropCreditedSpeaker, applyMissionUpdate, missionPush, validateMission, lineFor, MAX_LINES };
