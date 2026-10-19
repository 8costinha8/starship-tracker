/* Mission updates for the upcoming flight (road.json "mission_updates": { "<flight>": [ ... ] }).
   Written from X-first "mission-update" verdicts, shown as small text lines on the Next flight
   card (Flight Log page). One line per topic: the newest post on a topic replaces the older line.
   NET / launch-date posts never become a line: the date display is owned by LL2 + the predicted-date
   code, so those posts are handed to that code instead (no duplicate, no push from here). */
const MAX_LINES = 5;
const SITE = "https://8costinha8.github.io/starship-tracker/";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ukDay = (iso) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", timeZone: "Europe/London" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${Number(p.day)} ${MON[p.month - 1]}`; };
function lineFor({ text, attribution, at }) {
  const t = String(text || "").trim().replace(/[.\s]+$/, "");
  return `${t} (${[attribution && String(attribution).trim(), ukDay(at)].filter(Boolean).join(", ")}).`;
}
// Returns { changed, line, net } — net: true when it's a launch-date item (handled elsewhere).
function applyMissionUpdate(road, flight, { topic, text, attribution, post }) {
  if (topic === "net") return { changed: false, net: true };
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
const missionPush = (flight, line) => ({ title: `Flight ${flight} update`, body: line, link: `${SITE}?flight=${flight}` });
function validateMission(road) {
  for (const [k, list] of Object.entries(road.mission_updates || {})) {
    if (!/^\d+$/.test(k) || !Array.isArray(list) || list.length > MAX_LINES || list.some((u) => !u || !u.topic || u.topic === "net" || !u.line || u.line.length > 200 || !u.at))
      throw new Error(`bad mission_updates for flight ${k}`);
    if (new Set(list.map((u) => u.topic)).size !== list.length) throw new Error(`mission_updates for flight ${k}: one line per topic`);
  }
}
module.exports = { applyMissionUpdate, missionPush, validateMission, lineFor, MAX_LINES };
