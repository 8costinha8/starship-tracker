/* Road display + data rules shared by the app (window.RoadRules) and the checker (require). Pure. 24 Nov 2026,
   tracker-2026-11-24-road-list-consistency (Tusk sweep #1–#6, Bernardo's STICKY COMPLETE rule). Every rule is general (all flights).
   1. headlineEligible: an unverified / single-source update, or an arrival / move, never becomes a card's headline or a
      completion; category rows read the category summary (app.js boxLine).
   1b. STICKY COMPLETE: once a test box (cryo, raptor, static) is Complete it stays Complete; a later extra run or a later
      unverified post only lands in Updates (mergeStatus for display, stickyRoad for the checker's write).
   2. photoFits: a picture attached to an event comes from a post within PHOTO_WIN of the event and before the vehicle's next
      milestone; rowUrl: a history row links to the post that states its text; photoIso: a photo is dated by its own post.
   3. direction / directionFlip: moves read direction ("left …", "… exit", "from …" = away; "to / headed / arrived" = towards);
      a rewrite that flips the source's direction is held for needs-review.
   5. statusText / mergeStatus: ONE status → label mapping (hero, Page 2 headers, cards).
   6. mergeRows: the same vehicle + the same action within MERGE_MS (2 h) is one row (earliest time, its post); the same move to
      the same destination within MOVE_MERGE_MS (3 days) is one row too. Rows stay in strict time order (newest first).
   PENDING: entries Bernardo is still deciding on are never moved, merged or dropped by these rules. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.RoadRules = factory(); })(typeof self !== "undefined" ? self : this, function () {
  // S43 Pad card (26–28 Oct): the merge (headline = chopstick lift at Pad 2) is on the preview pending Bernardo's yes (24 Nov 13:11);
  // until then no rule, guard or lock audit moves, merges, drops or edits these entries.
  const PENDING = new Set(["f16-s43-2115315741709001123", "f16-s43-2115205843880992791", "f16-s43-2114880263264346277", "f16-s43-2114798577293635905"]);
  const H = 3600e3, MERGE_MS = 2 * H, MOVE_MERGE_MS = 3 * 864e5, PHOTO_WIN = 36 * H, PHOTO_LEAD = 12 * H;
  const TEST_BOXES = ["cryo", "raptor", "static"]; // STICKY applies to test categories (cryo, engines, static fire); Pad activity is ongoing work, not a test
  const RANK = { none: 0, pending: 0, progress: 1, done: 2, complete: 2 };
  const STATUS_TEXT = { none: "Not yet", pending: "Not yet", progress: "In progress", done: "Complete", complete: "Complete" };
  const DONE_LABEL = { cryo: "Complete", raptor: "Installed", static: "Complete", pad: "Complete", faa: "Confirmed", date: "Confirmed" };
  function statusText(status, id) { return status === "done" || status === "complete" ? (DONE_LABEL[id] || "Complete") : (STATUS_TEXT[status] || status || "Not yet"); }
  // display: the box's own data status and the Flight Log's status, the stronger wins for a test box (sticky, never downgraded)
  function mergeStatus(dataStatus, flogStatus, id) {
    if (!TEST_BOXES.includes(id) && id !== "pad") return flogStatus || dataStatus; // pad: one mapping too (data "progress" = In progress), see #5
    const a = RANK[dataStatus] ?? -1, b = RANK[flogStatus] ?? -1;
    return a >= b ? (dataStatus || flogStatus) : flogStatus;
  }
  // checker: next road.json never downgrades a test box that was Complete in the previous one
  function stickyRoad(prev, next) {
    const kept = [];
    if (!prev || !next || prev.flight !== next.flight) return kept;
    for (const c of next.categories || []) {
      if (!TEST_BOXES.includes(c.id)) continue;
      const p = (prev.categories || []).find((x) => x.id === c.id);
      if (p && (p.status === "done" || p.status === "complete") && !(c.status === "done" || c.status === "complete")) { kept.push({ cat: c.id, from: c.status, to: p.status }); c.status = p.status; if (p.latest && /nothing reported/i.test(String(c.latest || ""))) c.latest = p.latest; }
    }
    return kept;
  }
  const MOVE_RE = /\b(arriv\w*|headed|heading|heads|moved?|moving|rolled|rolls?|left|leav\w*|return\w*|entered|transport\w*|is (?:now )?at|back (?:at|to|in))\b/i;
  const isMoveText = (t) => MOVE_RE.test(String(t || "")) && !/\b(cryo|static fire|stacked|installed|fired)\b.*\b(complet|done|finish)/i.test(String(t || ""));
  const unverified = (u) => !!(u && (u.unverified === true || /single[- ]source/i.test(String(u.note || "")) || u.trust === "unconfirmed"));
  function headlineEligible(u) { return !!u && !unverified(u); }
  // an arrival / move is never a completion
  function fixMovePhase(u) { if (u && u.phase === "completed" && /\b(arriv\w*|headed|moved|rolled|left|is at|returned)\b/i.test(String(u.text || "")) && !/\b(complet\w*|finish\w*|done)\b/i.test(String(u.text || ""))) { u.phase = "progress"; return true; } return false; }
  const PLACE = /massey'?s?|mega ?bay ?\d?|pad ?\d|launch (?:site|pad|mount)|production(?: site)?|build site|cryo (?:stand|station)|highway ?4|rocket garden|sanchez|starfactory/i;
  // { dir: "to" | "from" | null, place }
  function direction(text) {
    const t = String(text || "");
    let m = t.match(new RegExp(`\\b(?:to|towards?)\\s+(?:the\\s+)?(${PLACE.source})(?:'s)?\\s+(?:exit|gate)\\b`, "i")) || t.match(new RegExp(`\\b(?:left|leaving|leaves|departed|exited|out of|from|away from)\\s+(?:the\\s+)?(${PLACE.source})`, "i"));
    if (m) return { dir: "from", place: norm(m[1]) };
    const all = [...t.matchAll(new RegExp(`\\b(?:to|towards?|for|at|into|onto|entered|arrived (?:at|in)|reached)\\s+(?:the\\s+)?(${PLACE.source})`, "ig"))];
    m = all.length ? all[all.length - 1] : null; // the final destination ("entered Highway 4 for Massey's" → Massey's)
    if (m && MOVE_RE.test(t)) return { dir: "to", place: norm(m[1]) };
    return { dir: null, place: null };
  }
  const norm = (p) => String(p || "").toLowerCase().replace(/'s?$/, "").replace(/\s+/g, " ").replace(/^mega ?bay/, "mega bay").replace(/^massey'?s?/, "massey");
  // a rewrite whose direction contradicts its source (same place): true
  function directionFlip(source, rewrite) {
    const a = direction(source), b = direction(rewrite);
    if (!a.dir || !b.dir || a.dir === b.dir) return false;
    return !a.place || !b.place || a.place.split(" ")[0] === b.place.split(" ")[0];
  }
  // X status id → ms (snowflake); null if not an X status URL
  function snowMs(url) { const m = String(url || "").match(/status\/(\d{15,20})/); if (!m) return null; try { return Number((BigInt(m[1]) >> 22n) + 1288834974657n); } catch { return null; } }
  function photoIso(postUrl) { const t = snowMs(postUrl); return t ? new Date(t).toISOString() : null; }
  // the picture's post is close to the event and before this vehicle's next milestone
  function photoFits(e, events, photoUrl) {
    const t = snowMs(photoUrl || (e && e.x_post && e.x_post.url) || (e && e.image_src)), at = Date.parse((e && e.at) || "");
    if (!t || !Number.isFinite(at)) return true;
    if (t < at - PHOTO_LEAD || t > at + PHOTO_WIN) return false;
    const nextMs = (events || []).filter((x) => x && x.milestone && x.id !== e.id && Date.parse(x.at) > at).map((x) => Date.parse(x.at)).sort((a, b) => a - b)[0];
    return !(nextMs && t > nextMs);
  }
  // history row link: the post that states the text
  function rowUrl(h, photoUrl) { return (h && h.url) || photoUrl || ""; }
  // action key for one vehicle's history rows
  function actionKey(text) {
    const t = String(text || "").toLowerCase();
    if (/\bcryo\b/.test(t) && /\b(began|begun|begin|started|start|under ?way|in progress|underway|kicked off)\b/.test(t)) return "cryo_start";
    if (/\b(placed|lifted|set|installed|moved)\b.*\b(on|onto)\b.*\b(cryo )?stand\b/.test(t)) return "on_stand";
    if (/\b(completed|finished|wrapped up|done with)\b.*\bcryo\b/.test(t)) return "cryo_done";
    const d = direction(text);
    if (d.dir === "to" && /\b(arriv\w*|reached|is (?:now )?at)\b/.test(t)) return "at:" + d.place;
    if (d.dir) return d.dir + ":" + d.place;
    if (/\b(rolled out|entered highway ?4|headed|moved|heading)\b/.test(t) && /massey/.test(t)) return "to:massey";
    return null;
  }
  const rowMs = (u) => Date.parse((u && (u.at || u.iso)) || "") || 0;
  // rows: one card's history rows (one vehicle, one box). Returns { rows (newest first), merged: [[keptId|url, droppedUrl]] }
  function mergeRows(rows) {
    const asc = (rows || []).slice().sort((a, b) => rowMs(a) - rowMs(b)), out = [], merged = [];
    for (const u of asc) {
      const k = PENDING.has(u && u.id) ? null : actionKey(u && (u.card_text || u.text));
      const win = k && /^(to|from):/.test(k) ? MOVE_MERGE_MS : MERGE_MS;
      const isMove = (x) => /^(to|from|at):/.test(x || "");
      // a move merges only with the latest move row (no other move in between: a real second trip stays)
      const cand = k && isMove(k) ? out.slice().reverse().find((x) => isMove(x._k)) : k ? out.slice().reverse().find((x) => x._k === k) : null;
      const prev = cand && cand._k === k && rowMs(u) - rowMs(cand) <= win && !cand.done_row && !u.done_row && !u.event_row && !PENDING.has(cand.id) ? cand : null;
      if (prev) { merged.push([prev.url || prev.text, u.url || u.text]); if (!prev.url && u.url) prev.url = u.url; continue; }
      out.push({ ...u, _k: k });
    }
    return { rows: out.map(({ _k, ...u }) => u).sort((a, b) => rowMs(b) - rowMs(a)), merged };
  }
  return { PENDING, MERGE_MS, MOVE_MERGE_MS, PHOTO_WIN, PHOTO_LEAD, TEST_BOXES, statusText, mergeStatus, stickyRoad, headlineEligible, unverified, fixMovePhase, isMoveText,
    direction, directionFlip, snowMs, photoIso, photoFits, rowUrl, actionKey, mergeRows };
});
