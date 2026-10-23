/* ─────────────────────────────────────────────────────────────
   One shared send path for every push (Road, mission-update, news,
   status merges, Launch date, scheduled "Road to Flight N", flight-checker).
   Invariant: a push is sent ONLY if the exact same item (title, body,
   source link, timestamp) is already written somewhere the app shows it:
     where "road"    → road.categories[box].history entry (Road card + Updates feed)
     where "mission" → road.mission_updates[flight] line (Next flight card)
     where "feed"    → road.feed_items (Updates feed, tap-to-jump via ?feed=1&item=<id>)
   Every attempt (sent / blocked / not-sent-test) is logged to notifications.json.
   ───────────────────────────────────────────────────────────── */
const fs = require("fs");
const path = require("path");
const SITE = "https://8costinha8.github.io/starship-tracker/";
const LOG_KEEP = 500;
const FEED_KEEP = 40;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// UK (Europe/London) calendar day of an ISO time: "22 Oct"
const ukDay = (iso) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", timeZone: "Europe/London" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${Number(p.day)} ${MON[p.month - 1]}`; };

// The visible copy of a push: what the app renders for it.
function visibleFor(road, n) {
  const v = n.visible || {};
  if (v.where === "road") {
    const c = (road.categories || []).find((x) => x.id === v.box);
    const h = c && (c.history || []).find((e) => e.id === v.id);
    return h && { title: h.push && h.push.title, body: h.log_text || h.x_text || h.text, url: h.push && h.push.url, at: h.push && h.push.at };
  }
  if (v.where === "mission") {
    const u = ((road.mission_updates || {})[v.flight] || []).find((x) => x.line === n.body);
    return u && { title: `Flight ${v.flight} update`, body: u.line, url: u.url, at: u.at };
  }
  if (v.where === "feed") {
    const f = (road.feed_items || []).find((x) => x.id === v.id);
    return f && { title: f.title, body: f.body, url: f.url, at: f.at };
  }
  return null;
}
// Why a push may not be sent ("" = it may).
function checkVisible(road, n) {
  for (const k of ["title", "body", "at"]) if (!n[k]) return `push has no ${k}`;
  if (!Number.isFinite(Date.parse(n.at))) return "push timestamp is not a real time";
  const vis = visibleFor(road, n);
  if (!vis) return `no visible entry (${JSON.stringify(n.visible || null)})`;
  for (const k of ["title", "body", "url", "at"]) if ((vis[k] || "") !== (n[k] || "")) return `visible ${k} differs: "${vis[k] || ""}" vs push "${n[k] || ""}"`;
  return "";
}

// Adds a push to the Updates feed (news, scheduled notices, flight-checker pushes). Returns the push with its visible pointer.
// App text never names public data sources (credit stays in the @handle label). Idempotent.
const SOURCE_NAMES = /\s*(?:[·•|—–-]\s*|,?\s*(?:per|via|according to)\s+)?\b(?:NSF|NASA ?Spaceflight(?:\.com)?|Spaceflight Now|SpaceNews|Teslarati|Launch Library(?: 2)?|LL2|Spaceflight News API)\b(?:\s*(?:reports?|says|said)\b)?/gi;
const cleanText = (s) => typeof s === "string" ? s.replace(/\((?:per |via )?(?:NSF|NASA ?Spaceflight)(?:, )?/gi, "(").replace(/\(\s*\)/g, "").replace(SOURCE_NAMES, "").replace(/\(\s*,\s*/g, "(").replace(/\s{2,}/g, " ").replace(/\s+([.,;:)])/g, "$1").trim() : s;
function addFeedItem(road, { title, body, url, at, kind, flight }) {
  title = cleanText(title); body = cleanText(body);
  const id = `${kind || "news"}-${Date.parse(at).toString(36)}-${require("crypto").createHash("sha1").update(title + body).digest("hex").slice(0, 6)}`;
  const list = (road.feed_items = road.feed_items || []);
  if (!list.some((x) => x.id === id)) list.unshift({ id, kind: kind || "news", title, body, ...(url ? { url } : {}), at, date: ukDay(at), flight: flight || road.flight });
  list.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)); list.splice(FEED_KEEP);
  return { title, body, url, at, link: `${SITE}?feed=1&item=${encodeURIComponent(id)}`, kind: kind || "news", visible: { where: "feed", id } };
}
// Stamps a Road entry with its push (title/link/source/time), so the entry and push are one item.
function stampRoadEntry(box, entry, n) {
  entry.push = { title: n.title, ...(n.url ? { url: n.url } : {}), at: n.at };
  return { ...n, visible: { where: "road", box: box.id, id: entry.id } };
}

function readLog(p) { try { const j = JSON.parse(fs.readFileSync(p, "utf8")); return Array.isArray(j.pushes) ? j : { pushes: [] }; } catch { return { pushes: [] }; } }
function writeLog(p, rows) {
  const j = readLog(p); j.pushes.push(...rows); j.pushes = j.pushes.slice(-LOG_KEEP);
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}

/* sendPush: the only function allowed to call the real sender.
   road = the road.json that is ALREADY saved/committed (read it back from disk in live runs). */
async function sendPush(n, { road, send, save = true, logRows, log = console.log, now = Date.now }) {
  const why = checkVisible(road, n);
  const row = { title: n.title, body: n.body, link: n.link || "", url: n.url || "", at: n.at || "", sent_at: new Date(now()).toISOString(), where: (n.visible || {}).where || "", verdict: "" };
  if (why) { row.verdict = `blocked: ${why}`; log(`PUSH BLOCKED "${n.title}" — ${why}`); }
  else if (!save) { row.verdict = "not sent (test mode)"; log(`(not sent) push: ${n.title} — ${n.body}`); }
  else {
    try { await send(n); row.verdict = "sent"; } catch (e) { row.verdict = `failed: ${e.message}`; log(`push failed "${n.title}": ${e.message}`); }
  }
  if (logRows) logRows.push(row);
  return row;
}

// Pushes handed over by check-flights.js (same job): runner temp file, read once by check-road.js.
const QUEUE = () => path.join(process.env.RUNNER_TEMP || require("os").tmpdir(), "starship-push-queue.json");
function queuePush(n, file = QUEUE()) { let q = []; try { q = JSON.parse(fs.readFileSync(file, "utf8")); } catch {} q.push(n); fs.writeFileSync(file, JSON.stringify(q)); }
function takeQueue(file = QUEUE()) { try { const q = JSON.parse(fs.readFileSync(file, "utf8")); fs.unlinkSync(file); return Array.isArray(q) ? q : []; } catch { return []; } }

module.exports = { cleanText, queuePush, takeQueue, sendPush, checkVisible, visibleFor, addFeedItem, stampRoadEntry, writeLog, readLog, ukDay, SITE, FEED_KEEP };
