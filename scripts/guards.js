/* Guards: run on every checker update, just before road.json is written (check-road.js). Each one blocks or auto-fixes a
   class of bug we have seen live, and logs "GUARD <name>: …". No pushes are sent from here.
     flight-map     one hardware → flight map from the data (road.vehicles = tracked flight; tagged cards for later flights)
     mapping        an entry whose hardware maps to another flight gets that flight's tag (B23 card tagged 15 → 16)
     cross-flight   Earlier updates / box-filed feed items of another vehicle or flight (scope.js)
     headline       a box headline from another flight's card → the tracked flight's newest line
     event          the same event, different time/text across views → its event record (events.js)
     date-slip      the estimated NET changed but no estimate feed item/push exists → add it ("· unofficial")
     day-pattern    date patterns must read two-digit days ("NET 12 Nov" = 12, not 1)
     recap          a new card that repeats an existing post (same post id / edit of it) → dropped
     rollover       a new Road with no vehicles → vehicles from the flight map
     cap            more than CAP new cards for one flight in one update → the extra ones wait (dropped from this write)
     later-flight   a booster/ship number higher than the newest mapped one (B24 when B23 = Flight 16) → later flight
                    (newest + offset), never the tracked flight: no box, no card on this Road, no push
     untagged       a new vehicle-stage card with no hardware and no flight → review queue, no card
     hedged         hedged completion wording ("appears to have completed") never marks a card complete */
const scope = require("./scope.js"), events = require("./events.js");
const CAP = 5, VEH_STAGES = ["cryo", "raptor", "static"];
const hwKey = (s) => String(s || "").toUpperCase().replace(/^SHIP\s*/, "S").replace(/^BOOSTER\s*/, "B").replace(/\s+/g, "");
const isVeh = (k) => /^[BS]\d{2,3}$/.test(k);
const HEDGED_DONE = /\b(?:appears?|appeared|seems?|seemed|looks? like|looked like|likely|probably|possibly|presumably|apparently|may|might)\b(?:\s+(?:to\s+)?(?:have\s+|has\s+|be\s+|been\s+|now\s+)*)?(?:\w+\s+){0,2}?(?:completed?|finished|done|wrapped(?:\s+up)?|concluded)\b/i;
const NET_DAY = /\bNET\s+(\d{1,2})\s+([A-Z][a-z]{2})\b/;

function flightMap(road) {
  const m = {};
  for (const v of road.vehicles || []) if (isVeh(hwKey(v))) m[hwKey(v)] = road.flight;
  const fixed = new Set(Object.keys(m));
  for (const c of road.categories || []) for (const h of c.history || []) {
    const k = hwKey(h && h.hardware);
    if (isVeh(k) && !fixed.has(k) && Number.isInteger(h.flight) && h.flight >= road.flight) m[k] = Math.max(m[k] || 0, h.flight);
  }
  return m;
}
const ids = (road) => new Set((road.categories || []).flatMap((c) => (c.history || []).map((h) => h && h.id).filter(Boolean)));
const postIds = (h) => [h.x_post && h.x_post.post_id, ...(h.x_posts || []), ...((h.x_post && h.x_post.edit_history_post_ids) || []), ...((h.updates || []).map((u) => (String(u.url || "").match(/status\/(\d+)/) || [])[1]))].filter(Boolean).map(String);

function run(road, { prev = null, log = console.log, review = null, now = Date.now(), slipPush = null, addFeedItem = null } = {}) {
  const pushes = [], dropped = new Set(), fixes = [], fix = (name, msg) => { fixes.push({ name, msg }); log(`GUARD ${name}: ${msg}`); };
  // day-pattern (self-check: a regression here would make every slip invisible)
  const t = "Flight 15 now NET 12 Nov (was 8 Nov)".match(NET_DAY);
  if (!t || t[1] !== "12") throw new Error("GUARD day-pattern: NET date pattern does not read two-digit days");
  // flight-map + mapping
  const map = flightMap(road);
  road.hardware_flights = map;
  for (const c of road.categories || []) for (const h of c.history || []) {
    const k = hwKey(h && h.hardware);
    if (isVeh(k) && map[k] && map[k] !== road.flight && h.flight !== map[k]) { fix("mapping", `${h.id} ${k} tagged Flight ${h.flight ?? "none"} → ${map[k]}`); h.flight = map[k]; }
    if (isVeh(k) && map[k] === road.flight && Number.isInteger(h.flight) && h.flight > road.flight) { fix("mapping", `${h.id} ${k} is Flight ${road.flight} hardware, tagged ${h.flight} → ${road.flight}`); h.flight = road.flight; }
  }
  // later-flight: unmapped higher-numbered hardware never lands on the tracked flight
  const laterIds = new Set();
  for (const f of road.feed_items || []) {
    if (!f || f.kind === "launch_date") continue;
    const inf = scope.vehOf(`${f.title || ""} ${f.body || ""}`).map((v) => [v, scope.inferFlight(road, v)]).find(([, x]) => x && x.inferred);
    if (!inf) continue;
    const [v, { flight }] = inf;
    if (f.flight !== flight || f.box || !f.later_flight) { fix("later-flight", `${f.id} ${v} is newer than any mapped vehicle → Flight ${flight} (was Flight ${f.flight ?? "none"}${f.box ? `, box ${f.box}` : ""}), no box, no push`); f.flight = flight; delete f.box; f.later_flight = true; laterIds.add(f.id); }
  }
  for (const c of road.categories || []) {
    const keep = [];
    for (const h of c.history || []) {
      const vs = isVeh(hwKey(h && h.hardware)) ? [hwKey(h.hardware)] : scope.vehOf(h && (h.x_text || h.text));
      const inf = vs.map((v) => [v, scope.inferFlight(road, v)]).find(([, x]) => x && x.inferred);
      if (inf && h.kind !== "check" && (!Number.isInteger(h.flight) || h.flight <= road.flight)) {
        fix("later-flight", `${h.id} ${inf[0]} card on Flight ${road.flight} ${c.id} → review queue (likely Flight ${inf[1].flight}), no card, no push`);
        if (review) review.push({ post_id: (h.x_post && h.x_post.post_id) || h.id, url: h.url || "", author: String(h.src || "").replace(/^@/, ""), at: h.at || "", text: h.text, stage: c.id, suggested: `Flight ${inf[1].flight}`, reason: `GUARD later-flight: ${inf[0]} is newer than any mapped vehicle` });
        laterIds.add(h.id); continue;
      }
      keep.push(h);
    }
    c.history = keep;
  }
  // cross-flight, headline, event
  for (const x of scope.enforce(road)) fix("cross-flight", `${x.why}: "${x.text}" (${x.id})`);
  for (const x of scope.headlines(road)) fix("headline", `[${x.box}] "${x.from}" → "${x.to}"`);
  for (const x of events.sync(road)) fix("event", `${x.id}: ${x.fields.join(", ")} re-synced to its event record`);
  // rollover
  if ((!road.vehicles || !road.vehicles.length)) { const vs = Object.keys(map).filter((k) => map[k] === road.flight); if (vs.length) { road.vehicles = vs.sort(); fix("rollover", `no vehicles on Road to Flight ${road.flight} → ${vs.join(", ")}`); } }
  if (prev) {
    const old = ids(prev), oldPosts = new Set((prev.categories || []).flatMap((c) => (c.history || []).flatMap(postIds)));
    const fresh = [];
    for (const c of road.categories || []) for (const h of c.history || []) if (h && h.id && !old.has(h.id) && h.kind !== "check") fresh.push({ c, h });
    const drop = new Set(), perFlight = {};
    for (const { c, h } of fresh) {
      const pid = h.x_post && h.x_post.post_id, edits = (h.x_post && h.x_post.edit_history_post_ids) || [];
      if (pid && [pid, ...edits].some((p) => oldPosts.has(String(p)))) { fix("recap", `${h.id}: post ${pid} is already on a card (recap/edit) → no new card`); drop.add(h); continue; }
      if (VEH_STAGES.includes(c.id) && !isVeh(hwKey(h.hardware)) && !Number.isInteger(h.flight) && !scope.vehOf(h.text).length) {
        fix("untagged", `${h.id} → review queue`); drop.add(h);
        if (review) review.push({ post_id: pid || h.id, url: h.url || "", author: String(h.src || "").replace(/^@/, ""), at: h.at || "", text: h.text, stage: c.id, reason: "GUARD untagged: no vehicle or flight" });
        continue;
      }
      const f = Number.isInteger(h.flight) ? h.flight : road.flight;
      perFlight[f] = (perFlight[f] || 0) + 1;
      if (perFlight[f] > CAP) { fix("cap", `${h.id}: more than ${CAP} new Flight ${f} cards in one update → waits`); drop.add(h); continue; }
      if ((h.complete || (h.milestone && h.milestone.phase === "completed")) && HEDGED_DONE.test(`${h.text || ""} ${(h.x_post && h.x_post.text) || ""}`)) {
        fix("hedged", `${h.id}: "${h.text}" is hedged → not complete`); delete h.complete; if (h.milestone) h.milestone.phase = "progress"; h.inferred = true;
      }
    }
    if (drop.size) for (const c of road.categories || []) c.history = (c.history || []).filter((h) => !drop.has(h));
    // date-slip: the estimate moved to another day (or first appeared) without its feed item + push
    const a = prev.predicted, b = road.predicted;
    if (b && b.net && slipPush && addFeedItem) {
      const same = a && Number(a.flight) === Number(b.flight);
      const raw = slipPush({ flight: Number(b.flight), from: same ? a.net : null, to: b.net }, now);
      const m = raw.body.match(/NET (\d{1,2} \w+) \(was (\d{1,2} \w+)\)/), moved = !same || (m && m[1] !== m[2]);
      if (moved && !(road.feed_items || []).some((f) => f.kind === "launch_date" && f.body === raw.body)) {
        pushes.push(addFeedItem(road, { title: raw.title, body: raw.body, at: raw.at, kind: "launch_date", flight: Number(b.flight) }));
        fix("date-slip", `"${raw.body}" was missing → added to the Updates feed and pushed`);
      }
    }
    for (const h of drop) dropped.add(h.id);
  }
  for (const id of laterIds) dropped.add(id);
  return { fixes, dropped, pushes };
}
module.exports = { run, flightMap, HEDGED_DONE, NET_DAY, CAP };
