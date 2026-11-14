
/* ─────────────────────────────────────────────────────────────
   DATA — the only part you edit when a new flight happens.
   Everything else (order, days between, countdown) is computed.
   outcome: "success" | "partial" | "failure"
   status (next flight): "confirmed" | "net" | "tbc" | "inflight" | "done"

   PHOTOS — optional. Add real SpaceX photos to any flight by adding
   a "photo" field to that flight's object, e.g. for flight 10:
     photo: {
       thumb: "images/f10-thumb.jpg",       // small card image
       gallery: ["images/f10-a.jpg", "images/f10-b.jpg"],  // expanded view, up to 2
     }
   Drop the actual image files into an "images" folder in this repo
   (same one this file lives in). Flights with no "photo" field use
   images/f<N>-thumb.jpg, -a.jpg, -b.jpg automatically; missing files
   just show the placeholder — nothing breaks either way.

   HIGHLIGHTS — every flight card shows a highlights box at the bottom.
   Put a YouTube URL in that flight's "highlights" field to turn it into a
   "Watch the flight highlights" link, e.g.
   highlights: "https://www.youtube.com/watch?v=XXXXXXXXXXX".
   Use SpaceX's own recap video (titled "Starship's Nth Flight Test" on
   their channel), not a livestream replay. While the field is empty ("")
   or missing, the box shows "Highlights coming soon" and can't be tapped.
   ───────────────────────────────────────────────────────────── */

const FLIGHTS = [
  { n: 1, date: "2023-04-20T13:33:09Z", pad: "Pad 1", block: "V1", booster: "B7", ship: "S24", outcome: "failure",
    headline: "The first time the full stack flew",
    photo: { thumb: "images/f1-thumb.jpg", gallery: ["images/f1-a.jpg", "images/f1-b.jpg"] },
    highlights: "https://www.youtube.com/watch?v=_krgcofiM6M",
    story: "Booster 7 and Ship 24 lifted off together for the first time, but several engines were already out. The rocket began to tumble before the stages could separate, and the flight termination system ended it about four minutes in. The blast also dug a crater under the pad, forcing a rebuild with a water-cooled steel plate." },
  { n: 2, date: "2023-11-18T13:02:50Z", pad: "Pad 1", block: "V1", booster: "B9", ship: "S25", outcome: "failure",
    headline: "Hot staging works",
    photo: { thumb: "images/f2-thumb.jpg", gallery: ["images/f2-a.jpg", "images/f2-b.jpg"] },
    highlights: "https://www.youtube.com/watch?v=C3iHAgwIYtI",
    story: "All 33 booster engines ran the full ascent, and the new hot-staging separation, where the ship lights its engines while still attached, worked first time. The booster broke apart during its boostback burn soon after. The ship climbed to the edge of space before it was lost late in its engine burn." },
  { n: 3, date: "2024-03-14T13:25:00Z", pad: "Pad 1", block: "V1", booster: "B10", ship: "S28", outcome: "partial",
    headline: "First trip to space",
    photo: { thumb: "images/f3-thumb.jpg", gallery: ["images/f3-a.jpg", "images/f3-b.jpg"] },
    highlights: "https://www.youtube.com/watch?v=ApMrILhTulI",
    story: "Ship 28 completed its full engine burn and coasted through space for the first time, testing a propellant transfer and opening its payload door. The planned engine relight was skipped after the ship began to roll. It was lost during re-entry, but not before streaming live views of the glowing plasma around it." },
  { n: 4, date: "2024-06-06T12:50:00Z", pad: "Pad 1", block: "V1", booster: "B11", ship: "S29", outcome: "success",
    headline: "Both stages come home",
    photo: { thumb: "images/f4-thumb.jpg", gallery: ["images/f4-a.jpg", "images/f4-b.jpg"] },
    highlights: "https://www.youtube.com/watch?v=j2BdNDTlWbo",
    story: "For the first time both stages made a controlled splashdown: the booster in the Gulf of Mexico, the ship in the Indian Ocean. On the way down one of the ship's flaps visibly burned through on camera, yet it kept steering and landed near its target. It was the dress rehearsal for catching the booster." },
  { n: 5, date: "2024-10-13T12:25:00Z", pad: "Pad 1", block: "V1", booster: "B12", ship: "S30", outcome: "success",
    headline: "The chopsticks catch",
    photo: { thumb: "images/f5-thumb.jpg", gallery: ["images/f5-a.jpg", "images/f5-b.jpg"] },
    highlights: "https://www.youtube.com/watch?v=hI9HQfCAw64",
    story: "Booster 12 flew back to Starbase and was caught mid-air by the launch tower's arms, a world first. Ship 30 then flew a clean re-entry and splashed down on target in the Indian Ocean. It was also the first flight with no engine failures." },
  { n: 6, date: "2024-11-19T22:00:00Z", pad: "Pad 1", block: "V1", booster: "B13", ship: "S31", outcome: "success",
    headline: "A banana goes to space",
    photo: { thumb: "images/f6-thumb.jpg", gallery: ["images/f6-a.jpg", "images/f6-b.jpg"] },
    highlights: "https://www.youtube.com/watch?v=CMGiNKcVSek",
    story: "The catch was called off after tower sensors were damaged at liftoff, so the booster splashed down in the Gulf instead. The ship relit a Raptor engine in space for the first time and made Starship's first daylight splashdown, carrying a plush banana as its zero-g indicator. The last V1 ship." },
  { n: 7, date: "2025-01-16T22:37:00Z", pad: "Pad 1", block: "V2", booster: "B14", ship: "S33", outcome: "failure",
    headline: "New ship, second catch",
    photo: { thumb: "images/f7-thumb.jpg", gallery: ["images/f7-a.jpg", "images/f7-b.jpg"] },
    highlights: "https://www.youtube.com/watch?v=Pn6e1O5bEyA",
    story: "The first V2 ship debuted with upgraded structure and avionics. Booster 14 came back and was caught by the tower for the second time. Ship 33 was lost minutes into flight when a propellant leak caused engine shutdowns and a fire, with debris seen over the Caribbean." },
  { n: 8, date: "2025-03-06T23:31:02Z", pad: "Pad 1", block: "V2", booster: "B15", ship: "S34", outcome: "failure",
    headline: "A repeat of Flight 7",
    photo: { thumb: "images/f8-thumb.jpg", gallery: ["images/f8-a.jpg", "images/f8-b.jpg"] },
    highlights: "https://www.youtube.com/watch?v=iJiFIvmoRmI",
    story: "Booster 15 was caught again, even after two engines failed to relight for its return. Ship 34 lost several engines late in its ascent, began to spin and was lost, again scattering debris over the Caribbean." },
  { n: 9, date: "2025-05-27T23:36:28Z", pad: "Pad 1", block: "V2", booster: "B14-2", ship: "S35", outcome: "partial",
    headline: "The first reflown booster",
    photo: { thumb: "images/f9-thumb.jpg", gallery: ["images/f9-a.jpg", "images/f9-b.jpg"] },
    highlights: "https://www.youtube.com/watch?v=-_COxLq1kX4",
    story: "Booster 14 became the first Super Heavy to fly twice, testing a steep descent before being lost over the Gulf. Ship 35 reached its planned trajectory, but its payload door stayed shut and a leak sent it spinning. It broke up during re-entry over the Indian Ocean." },
  { n: 10, date: "2025-08-26T23:30:00Z", pad: "Pad 1", block: "V2", booster: "B16", ship: "S37", outcome: "success",
    headline: "Back on track",
    photo: { thumb: "images/f10-thumb.jpg", gallery: ["images/f10-a.jpg", "images/f10-b.jpg"] },
    highlights: "https://www.youtube.com/watch?v=rcd_SQZDlnk",
    story: "Delayed after the ship first assigned to it was lost in ground testing, Flight 10 ticked off almost every goal. The ship deployed eight Starlink simulators, relit an engine in space and splashed down within metres of its target, despite visible damage around its engine bay." },
  { n: 11, date: "2025-10-13T23:23:00Z", pad: "Pad 1", block: "V2", booster: "B15-2", ship: "S38", outcome: "success",
    headline: "V2 signs off",
    photo: { thumb: "images/f11-thumb.jpg", gallery: ["images/f11-a.jpg", "images/f11-b.jpg"] },
    highlights: "https://www.youtube.com/watch?v=tLBZlQls3y4",
    story: "The last V2 flight and the last from Pad 1 before its rebuild. A reused booster flew almost cleanly, and the ship deployed its simulators, relit in space and handled re-entry with several heat shield tiles removed on purpose, landing on target." },
  { n: 12, date: "2026-05-22T22:30:22Z", pad: "Pad 2", block: "V3", booster: "B19", ship: "S39", outcome: "success",
    headline: "Version 3 arrives",
    photo: { thumb: "images/f12-thumb.jpg", gallery: ["images/f12-a.jpg", "images/f12-b.jpg"] },
    highlights: "https://www.youtube.com/watch?v=SGMlNjnmvYc",
    story: "The first V3 Starship and the first launch from Starbase's second pad. The booster lost most of its engines on the boostback relight and hit the Gulf at speed. The ship reached its planned trajectory, deployed 20 simulators plus two working Starlink satellites that filmed it in space, then made a controlled splashdown." },
  { n: 13, date: "2026-07-24T22:51:00Z", pad: "Pad 2", block: "V3", booster: "B20", ship: "S40", outcome: "success",
    headline: "Real satellites, and a ship that floated",
    photo: { thumb: "images/f13-thumb.jpg", gallery: ["images/f13-a.jpg", "images/f13-b.jpg"] },
    highlights: "https://www.youtube.com/watch?v=MWi_0_0vKDQ",
    story: "The first flight to deploy working Starlink V3 satellites, 20 of them, on a path that let them burn up afterwards as planned. The booster lost engines during its landing burn. The ship made its best re-entry yet and survived tipping over after splashdown. SpaceX then recovered it, towing it to Christmas Island and shipping it back towards Starbase so engineers can study its heat shield." },
  { n: 14, date: "2026-09-28T12:48:59Z", pad: "Pad 2", block: "V3", booster: "B21", ship: "S41", outcome: "success",
    headline: "First Starship to reach orbit",
    highlights: "",
    story: "Flight 14 launched from Pad 2, the third outing for Starship V3. The booster lost some engines on the way back but still made a controlled splashdown in the Gulf. Despite one of its six engines shutting down during ascent, Ship 41 became the first Starship to reach orbit and deployed all 26 Starlink V3 satellites. SpaceX then cut the planned six-orbit, ten-hour mission short, and the ship splashed down in the northern Pacific about three hours after liftoff before tipping over and exploding." },
];

// Photos work automatically: any flight without a "photo" field uses
// images/f<N>-thumb.jpg, images/f<N>-a.jpg and images/f<N>-b.jpg.
// Just upload files with those names; if one is missing, the placeholder shows.
FLIGHTS.forEach((f) => {
  if (!f.photo) f.photo = { thumb: `images/f${f.n}-thumb.jpg`, gallery: [`images/f${f.n}-a.jpg`, `images/f${f.n}-b.jpg`] };
});

// Used only if the live fetch below fails or hasn't loaded yet, or while nothing
// has come back for the very first paint.
const NEXT_FLIGHT_FALLBACK = {
  n: null, status: "tbc", date: null,
  pad: "", block: "", booster: "", ship: "",
  headline: "", note: "Details to be announced.",
};

const DATA_CHECKED = "7 Oct 2026";

// All flights so far launch from Starbase, Texas. If SpaceX ever flies Starship
// from a different site, add a "site" field to that flight object, e.g.
// site: "Cape Canaveral, Florida" — it overrides this default.
const DEFAULT_SITE = "Starbase, Texas";

/* ───────────── helpers ───────────── */

const DAY = 86400000;
const utcDay = (iso) => { const d = new Date(iso); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
// Days between two launches = whole UK (Europe/London) calendar days, the same day each launch is shown on.
// (Was UTC days: a launch at 23:23 UTC in summer is the next UK day, so F11→F12 read 221 instead of 220, F8→F9 82 instead of 83.)
const ukDayN = (iso) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)); };
const daysBetween = (a, b) => Math.round((ukDayN(b) - ukDayN(a)) / DAY);
const fmt = (iso, opts) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts }).replace(/\bSept\b/, "Sep");
// One date format across the app (Europe/London): "13 Sep · 05:02 UK", date-only "13 Sep", ranges "12–13 Sep".
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function ukParts(iso) { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return { day: Number(p.day), mon: MON3[Number(p.month) - 1], year: Number(p.year), time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` }; }
function ukStamp(iso, withTime = true, withYear = false) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  const p = ukParts(iso); const yr = withYear || p.year !== ukParts(new Date().toISOString()).year ? ` ${p.year}` : "";
  return `${p.day} ${p.mon}${yr}${withTime && p.time !== "00:00" ? ` · ${p.time} UK` : ""}`; // 00:00 = a date-only source
}
const LONG_MON = { January: "Jan", February: "Feb", March: "Mar", April: "Apr", June: "Jun", July: "Jul", August: "Aug", September: "Sep", Sept: "Sep", October: "Oct", November: "Nov", December: "Dec" };
// THE day/range formatter: "9 Sep", "9–10 Sep" (en dash, one month), "30 Sep–2 Oct" (across months).
const MONS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
function normDay(s) {
  if (typeof s !== "string") return s;
  let t = s.replace(/\b(January|February|March|April|June|July|August|September|Sept|October|November|December)\b\.?/g, (m) => LONG_MON[m.replace(".", "")]);
  t = t.replace(new RegExp(`\\b(${MONS}) (\\d{1,2})\\b`, "g"), "$2 $1"); // "Sep 30" → "30 Sep"
  t = t.replace(/\s*(?:[-–—]|\bto\b)\s*/g, "–");
  t = t.replace(new RegExp(`(\\d{1,2}) (${MONS})–(\\d{1,2}) \\2\\b`, "g"), "$1–$3 $2"); // "9 Sep–10 Sep" → "9–10 Sep"
  t = t.replace(new RegExp(`\\b(\\d{1,2}) (${MONS})–(\\d{1,2})\\b(?! (?:${MONS}))`, "g"), "$1–$3 $2"); // "9 Sep–10" → "9–10 Sep"
  return t.replace(/\s{2,}/g, " ").trim();
}
// An entry's date: its post time when known (full stamp), else its stored day label (date only).
const postIdOf = (h) => h && ((h.media_override && !h.media_override.credit_only && (h.media_override.post_id || (String(h.media_override.post_url || "").match(/status\/(\d+)/) || [])[1])) || (h.x_post && h.x_post.post_id) || (String(h.url || "").match(/x\.com\/[^/]+\/status\/(\d+)/) || [])[1]);
const sfIso = (id) => { try { return new Date(Number((BigInt(id) >> 22n) + 1288834974657n)).toISOString(); } catch { return ""; } };
// THE date formatter: every date in the app goes through ukStamp (or fmtDay for a stored day label).
const fmtDay = (s) => normDay(s);
const entryDate = (h) => { const iso = h && (h.publishedAt || h.at || (/^\d{1,2} [A-Z][a-z]{2}$/.test(normDay(h.date) || "") && postIdOf(h) && sfIso(postIdOf(h)))); return iso && Number.isFinite(Date.parse(iso)) ? ukStamp(iso, false) : fmtDay(h && h.date); }; // single day only, never a clock time
// No public source names in the UI: @handles stay, outlet names are removed.
const SRC_NAMES = /\s*(?:\(|\b)(?:per|via|from|according to)?\s*(?:NASASpaceflight(?:\.com)?|NSF|Spaceflight Now|SpaceNews|Teslarati|Next ?Spaceflight|LL2|Launch Library 2?|Spaceflight News API|LabPadre|Ars Technica|Space\.com)\b(?:\s*[-–]\s*NASASpaceflight\.com)?\)?/gi;
const scrub = (s) => typeof s !== "string" ? s : doneToLabel(s).replace(/\((?=\s*(?:per|via|from|according to)?\s*(?:NASASpaceflight(?:\.com)?|NSF|Spaceflight Now|SpaceNews|Teslarati|Next ?Spaceflight|LL2|Launch Library 2?|Spaceflight News API|LabPadre|Ars Technica|Space\.com)\b(?:\s+(?:reports?|reported|says|said))?\s*,\s*\d)[^,]*,\s*/gi, "(").replace(SRC_NAMES, "").replace(/\(\s*(unofficial|secondary|estimate)\s*\)/gi, "($1)").replace(/\s*·\s*(?=·|$)/g, "").replace(/^\s*·\s*/, "").replace(/\s{2,}/g, " ").replace(/\s+([.,;:!?])(?=\s|$)/g, "$1").replace(/([.!?])\.+$/, "$1").trim();
const uiSrc = (s) => { if (typeof s !== "string" || !s) return ""; if (/^@\w+$/.test(s.trim())) return s.trim(); const t = scrub(s).replace(/^(estimate|\(unofficial\)|\(secondary\)|\(estimate\))$/i, ""); return /^(FAA|SpaceX)\b/.test(t) ? t.replace(/\s+via\s*$/i, "") : ""; };
// For the next-flight card specifically: local launch time and date together,
// in the UK's own timezone (auto-adjusts BST/GMT), so there's no ambiguity.
const fmtDateTimeLondon = (iso) => ukStamp(iso);
// Short "Launched 13:48" line for the next-flight card while a mission is underway
// or just finished — London time, matching the rest of the card.
const fmtLaunchedLondon = (iso) => {
  const time = new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
  return `Launched ${time}`;
};
const pad2 = (x) => String(x).padStart(2, "0");
const hms = (ms) => { const t = Math.floor(Math.max(0, ms) / 1000); return `${pad2(Math.floor(t / 3600))}:${pad2(Math.floor(t / 60) % 60)}:${pad2(t % 60)}`; };
const fmtTimeLondon = (iso) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
const EXPAND_MS = 450; // how long a card takes to open or close
const OUTCOME_LABEL = { success: "Success", partial: "Partial", failure: "Failure" };
const siteLabel = (f) => f.site || DEFAULT_SITE;

// "Watch live" badge on the next-flight card: no free API can tell us whether
// SpaceX's stream is actually running, so this is time-based — it goes from a
// plain badge to a clickable button once we're within this window of the
// scheduled launch time (only for dates we have at all, confirmed or NET), and
// closes back to gray after the trailing window in case the date is stale.
const WATCH_LIVE_LEAD_MS = 60 * 60 * 1000; // opens 60 min before scheduled launch
const WATCH_LIVE_TRAIL_MS = 4 * 60 * 60 * 1000; // closes 4 hours after, well past a normal launch + stream
const WATCH_LIVE_URL = "https://x.com/SpaceX";

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Scroll just enough to show the whole card (extra = height it is about to grow by)
function ensureVisible(el, extra = 0) {
  if (!el) return;
  const margin = 16;
  const r = el.getBoundingClientRect();
  let d = r.bottom + extra + margin - window.innerHeight;
  d = Math.min(d, r.top - margin); // never push the card's top off screen
  if (d > 1) window.scrollBy({ top: d, behavior: reduceMotion() ? "auto" : "smooth" });
}

// The clock everything time-based uses. Always the real Date.now(), except in
// the dev-only ?mock=launchday demo, which swaps in a fake clock (see LD below).
const nowMs = () => (LD ? LD.now() : Date.now());

function useNow(fast) {
  const [now, setNow] = React.useState(nowMs());
  React.useEffect(() => {
    const id = setInterval(() => setNow(nowMs()), fast || LD ? 1000 : 60000);
    return () => clearInterval(id);
  }, [fast]);
  return now;
}

// Fetches the next Starship flight's date/status from Launch Library 2.
// Caches for an hour (well under LL2's 15 requests/hour free limit) and
// silently falls back to NEXT_FLIGHT_FALLBACK if the fetch fails.
// Asks for several upcoming launches (not just 1): LL2 keeps a finished flight
// in "upcoming" for a while after it lands, and also lists non-test Starship
// missions (HLS demo, customer satellites), so we pick the right one below.
const LL2_ENDPOINT = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?search=Starship&limit=10&mode=list";
const CACHE_KEY = "starship-next-flight-cache-v2";
const CACHE_MS = 60 * 60 * 1000;
// Launch day: while a flight is in the air, within an hour of a confirmed T-0,
// or just finished, re-check every 5 minutes while the app is open.
const HOT_TTL_MS = 5 * 60 * 1000;
const HOT_LEAD_MS = 60 * 60 * 1000;
// In that mode only the launch's own detail is re-fetched (1 call). The
// upcoming list (the 2nd call) is re-read at most once an hour, so the worst
// case is 12 detail + 1 list = 13 calls/hour, under LL2's free ~15/hour/IP.
const LIST_EVERY_MS = 60 * 60 * 1000;
// Hard cap shared by every open tab (logged in localStorage): never more than
// this many LL2 calls in any rolling hour. Over it, the refresh just waits.
const LL2_HOURLY_BUDGET = 14;
const LL2_LOG_KEY = "starship-ll2-calls-v1";
const RETRY_AFTER_FAIL_MS = 2 * 60 * 1000;
// 13 Nov (herofallback): a throttled LL2 (HTTP 429) says when it frees up ("Expected available in N seconds" / Retry-After).
// Every tab waits until then (persisted, so reloads don't keep re-asking and extending the throttle), capped at 30 min; a 429 with
// no hint waits 10 min. Other failures keep the 2-minute retry above.
const LL2_BACKOFF_KEY = "starship-ll2-backoff-v1";
const THROTTLE_DEFAULT_MS = 10 * 60 * 1000, THROTTLE_MAX_MS = 30 * 60 * 1000;
// Last good Launch Library answer per flight ({ [n]: { n, url, data, at } }), never overwritten by a failure or a placeholder.
// Used when LL2 fails and there's no usable cache: for the same upcoming flight (not logged / finished) and at most 48h old.
// 48h covers an overnight scrub and a 24h recycle; anything older falls back to road.json's own NET, which the checker keeps current.
const LL2_GOOD_KEY = "starship-ll2-lastgood-v1";
const LAST_GOOD_MAX_MS = 48 * 60 * 60 * 1000;

// Newest flight already in the log above (FLIGHTS). Once a flight is in the
// log, the top card moves on to the next one — no manual edit needed.
const SIM = (() => { try { return new URLSearchParams(window.location.search).get("sim") || ""; } catch { return ""; } })();
if (SIM === "C" || SIM === "D") FLIGHTS.push({ n: 15, date: "2026-11-12T23:30:00Z", pad: "Pad 2", block: "V3", booster: "B22", ship: "S42", outcome: "success",
  headline: "SIMULATED: booster and ship caught", highlights: "",
  story: "SIMULATED OUTCOME (not real): Booster 22 and Ship 42 lifted off from Pad 2 and both were caught by the tower chopsticks. This entry was written by the local simulation, not by the story writer.",
  photo: { thumb: "images/rtf-placeholder.jpg", gallery: [] } });
let LAST_LOGGED_N = Math.max(...FLIGHTS.map((f) => f.n)); // "let" only so the launchday demo can log a mock flight
// After liftoff the top card keeps showing that flight for at least this long
// (in flight, or its result), then moves on as soon as the flight is in the log.
const DONE_GRACE_MS = 2 * 60 * 60 * 1000;
// Safety net if the log never gets the flight: a finished flight stops showing
// on the top card this long after liftoff anyway.
const DONE_MAX_MS = 24 * 60 * 60 * 1000;

// True when the card should refresh every 5 minutes (see HOT_TTL_MS).
function isHot(d, now = nowMs()) {
  if (!d || d.placeholder) return false;
  if (d.status === "inflight" || d.status === "done") return true;
  const t0 = new Date(d.date).getTime();
  if (d.status !== "confirmed" || !Number.isFinite(t0)) return false;
  return t0 - now <= HOT_LEAD_MS && now - t0 <= IN_FLIGHT_FALLBACK_MS;
}

// Rolling one-hour log of LL2 calls, shared by all tabs (memory only in mocks).
let ll2MemLog = [];
function ll2Spend(n) {
  const now = nowMs();
  let log = ll2MemLog;
  if (!getMock()) { try { log = JSON.parse(localStorage.getItem(LL2_LOG_KEY)) || []; } catch { log = []; } }
  log = log.filter((t) => now - t < 3600000 && t <= now);
  if (log.length + n > LL2_HOURLY_BUDGET) return false;
  for (let i = 0; i < n; i++) log.push(now);
  if (getMock()) ll2MemLog = log; else { try { localStorage.setItem(LL2_LOG_KEY, JSON.stringify(log)); } catch {} }
  return true;
}

// LL2 counts a time as exact only at second/minute/hour precision.
function exactTime(f) {
  if (!f || !f.date || !Number.isFinite(new Date(f.date).getTime())) return false;
  if (f.ll2Status === "TBD") return false; // a dated TBD never supplies an exact T-0
  const p = f.netPrecision || "";
  return p ? /^(SEC|MIN|HR)$/.test(p) : !looksLikePlaceholder(new Date(f.date));
}

// "Starship | Starlink Group 31-1 (Starship Flight 14)" -> 14, "Starship | Flight 15" -> 15
function flightNumber(name) {
  const m = (name || "").match(/Flight\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

// True once a launch no longer belongs on the top card: it is already in the
// log (or older than the newest logged flight), or LL2 says it finished more
// than a day ago. Never true during the short grace period after liftoff.
function isFinishedLaunch(n, status, date, now = nowMs()) {
  const t0 = date ? new Date(date).getTime() : NaN;
  const since = Number.isFinite(t0) ? now - t0 : null;
  if (since != null && since >= 0 && since < DONE_GRACE_MS) return false;
  if (n != null && n <= LAST_LOGGED_N && (since == null || since >= 0)) return true;
  if (status === "done" && since != null && since > DONE_MAX_MS) return true;
  return false;
}

// Picks the launch for the top card from LL2's upcoming list: numbered Starship
// flights only, skipping any that already happened. null = nothing suitable.
function pickNextLaunch(results, now = nowMs()) {
  const numbered = (results || []).filter((l) => l?.url && flightNumber(l.name) != null);
  return numbered.find((l) => !isFinishedLaunch(flightNumber(l.name), mapLL2Status(l.status?.abbrev), l.net, now)) || null;
}

// Temporary card when LL2 has no next numbered flight yet.
function placeholderFlight(n) {
  return { ...NEXT_FLIGHT_FALLBACK, n, placeholder: true };
}

// "Go"/"TBC"/"TBD" are pre-launch. Mid-mission LL2 uses "In Flight" and, once
// the payload is away, "Deployed" (common on long orbital Starship flights) —
// both mean the mission is still going. Final results arrive later as Success /
// Failure / Partial Failure. Anything unknown with no usable date stays "tbc".
function mapLL2Status(abbrev) {
  if (abbrev === "Go") return "confirmed";
  if (abbrev === "TBC") return "net";
  if (abbrev === "TBD") return "tbc";
  if (abbrev === "Hold") return "confirmed"; // still a dated countdown; hold is temporary
  if (abbrev === "In Flight" || abbrev === "Deployed") return "inflight";
  if (abbrev === "Success" || abbrev === "Failure" || abbrev === "Partial Failure") return "done";
  return "tbc";
}

function mapLL2Outcome(abbrev) {
  if (abbrev === "Success") return "success";
  if (abbrev === "Failure") return "failure";
  if (abbrev === "Partial Failure") return "partial";
  return null;
}

// If LL2's status is still a pre-launch label but the clock is past T-0, treat
// the flight as in progress for a couple of hours (covers short gaps where the
// API hasn't flipped to "In Flight" yet). Recognising statuses win over this.
const IN_FLIGHT_FALLBACK_MS = 2 * 60 * 60 * 1000;
function effectiveStatus(flight, now = nowMs()) {
  if (!flight) return "tbc";
  const s = flight.status;
  if (s === "inflight" || s === "done") return s;
  if (usableTbdDate(flight)) return "net"; // a dated TBD is NET, never an exact launch time
  if (s === "tbc") return s;
  if (!flight.date) return s;
  if (roughNet(flight, now)) return "tbc"; // only a rough LL2 date: no countdown
  const t0 = new Date(flight.date).getTime();
  if (exactTime(flight) && Number.isFinite(t0) && now >= t0 && now <= t0 + IN_FLIGHT_FALLBACK_MS) return "inflight";
  return s;
}

// Dev-only overrides so we can screenshot states without waiting on a launch.
// Harmless in production: ignored unless ?mock= is present. Values:
//   inflight | done-success | done-failure | done-partial | tbc
//   next  -> fake LL2 list: newest logged flight finished + the next one announced
//   none  -> fake LL2 list: newest logged flight finished, no next flight listed
//   launchday -> fake LL2 + fake clock for a whole launch day (see LD below)
function getMock() {
  if (SIM) return "sim";
  try { return new URLSearchParams(window.location.search).get("mock") || ""; } catch { return ""; }
}

// ?mock=launchday: fake clock + fake LL2 that walk through a launch day:
// NET unconfirmed -> Go with a time -> window opens -> liftoff -> in flight ->
// Success -> the story gets logged (a MOCK entry added to FLIGHTS in memory)
// -> the card moves on to the next flight. Plays itself in under a minute;
// &warp=manual stops the autoplay and window.__ld.jump(ms, rate) drives it.
// Completely inert without ?mock=launchday (LD is null, nowMs is Date.now).
const LD_T0 = Date.parse("2026-10-13T22:00:00Z"); // mock liftoff: 23:00 UK time
const SIM_NOW = { A: "2026-11-03T18:45:00Z", B: "2026-11-12T23:55:00Z", C: "2026-11-13T01:05:00Z", D: "2026-11-13T09:30:00Z" };
const LD = getMock() === "launchday" ? makeLaunchdayMock() : SIM ? (() => { const q = new URLSearchParams(window.location.search); const b = Date.parse(q.get("t") || SIM_NOW[SIM]), a = Date.now(), r = Number(q.get("rate") || 1); return { now: () => b + (Date.now() - a) * r, jump() {}, rate() {} }; })() : null;
function makeLaunchdayMock() {
  let base = LD_T0 - 5 * DAY, anchor = Date.now(), rate = 1;
  const api = {
    T0: LD_T0,
    now: () => base + (Date.now() - anchor) * rate,
    jump(v, r = rate) { base = v; anchor = Date.now(); rate = r; },
    rate(r) { base = api.now(); anchor = Date.now(); rate = r; },
  };
  window.__ld = api;
  const M = 60000;
  // autoplay: [real seconds, virtual time, clock rate]
  const script = [
    [0, LD_T0 - 5 * DAY, 1], [5, LD_T0 - 2 * DAY, 1], [10, LD_T0 - 60 * M - 3000, 1], [15, LD_T0 - 30 * M - 3000, 1],
    [20, LD_T0 - 8000, 1], [30, LD_T0 + 9 * M, 60], [42, LD_T0 + 70 * M, 1], [47, LD_T0 + 76 * M, 1], [52, LD_T0 + 121 * M, 1],
  ];
  let warp = "";
  try { warp = new URLSearchParams(window.location.search).get("warp") || ""; } catch {}
  if (warp !== "manual") script.forEach(([sec, v, r]) => setTimeout(() => api.jump(v, r), sec * 1000));
  // The story writer (scripts/check-flights.js) adds the flight to FLIGHTS once LL2
  // posts the result; mock that ~10 min after the result, in memory only.
  setInterval(() => {
    if (api.now() < LD_T0 + 75 * M || FLIGHTS.some((f) => f.n === 15)) return;
    FLIGHTS.push({ n: 15, date: new Date(LD_T0).toISOString(), pad: "Pad 2", block: "V3", booster: "B22", ship: "S42", outcome: "success",
      headline: "MOCK (not real): auto-logged by the story writer", highlights: "",
      story: "MOCK (not real): this entry was added by the launch-day demo to show where the story writer logs a flight once Launch Library posts its result.",
      photo: { thumb: "images/f15-thumb.jpg", gallery: [] } });
    LAST_LOGGED_N = Math.max(...FLIGHTS.map((f) => f.n));
  }, 500);
  return api;
}
function ldLL2(url) {
  const v = nowMs(), M = 60000;
  const status = v < LD_T0 - 3 * DAY ? ["TBC", "M"] : v < LD_T0 ? ["Go", "SEC"] : v < LD_T0 + 66 * M ? ["In Flight", "SEC"] : ["Success", "SEC"];
  const f15 = {
    name: "Starship | Flight 15", url: "mock://f15", net: new Date(LD_T0).toISOString(),
    window_start: new Date(LD_T0 - 30 * M).toISOString(), window_end: new Date(LD_T0 + 90 * M).toISOString(),
    status: { abbrev: status[0] }, net_precision: { abbrev: status[1] },
    pad: { name: "Orbital Launch Pad 2" },
    rocket: { configuration: { variant: "V3" }, launcher_stage: [{ launcher: { serial_number: "Booster 22" } }], spacecraft_stage: [{ spacecraft: { serial_number: "S42" } }] },
    mission: { type: "Test Flight", description: "Mock: 15th test flight of the two-stage Starship launch vehicle." },
  };
  const f16 = {
    name: "Starship | Flight 16", url: "mock://f16", net: "2026-12-31T00:00:00Z", status: { abbrev: "TBD" }, net_precision: { abbrev: "Q4" },
    pad: { name: "Orbital Launch Pad 2" }, rocket: { configuration: { variant: "V3" } },
    mission: { type: "Test Flight", description: "Mock: 16th test flight of the two-stage Starship launch vehicle." },
  };
  if (url === LL2_ENDPOINT) return { results: [f15, f16] };
  return url === "mock://f16" ? f16 : f15;
}

// Fake LL2 responses for ?mock=next / ?mock=none, shaped like the real API so
// they run through exactly the same picking logic as live data.
function mockLL2(url) {
  const mock = getMock();
  const hour = 3600000;
  const last = {
    name: `Starship | Flight ${LAST_LOGGED_N}`, url: "mock://last", net: new Date(Date.now() - 8 * hour).toISOString(),
    status: { abbrev: "Success" }, net_precision: { abbrev: "SEC" },
    pad: { name: "Orbital Launch Pad 2" }, rocket: { configuration: { variant: "V3" } },
    mission: { type: "Test Flight", description: "Mock finished flight." },
  };
  const next = {
    name: `Starship | Flight ${LAST_LOGGED_N + 1}`, url: "mock://next", net: `${new Date().getUTCFullYear()}-12-31T00:00:00Z`,
    status: { abbrev: "TBD" }, net_precision: { abbrev: "Q4" },
    pad: { name: "Orbital Launch Pad 2" }, rocket: { configuration: { variant: "V3" } },
    mission: { type: "Test Flight", description: `Mock: flight ${LAST_LOGGED_N + 1} of the Starship launch vehicle.` },
  };
  const other = { name: "Starship | SpaceX HLS LEO Demo", url: "mock://hls", net: "2027-06-30T00:00:00Z", status: { abbrev: "TBD" } };
  if (url === LL2_ENDPOINT) return { results: mock === "next" ? [last, next, other] : [last, other] };
  return url === "mock://next" ? next : last;
}
function ll2Json(url) {
  const mock = getMock();
  if (mock === "sim") return fetch(`sim/${new URLSearchParams(window.location.search).get("ll2") || SIM}/ll2.json`).then((r) => r.json()).then((j) => url === LL2_ENDPOINT ? j : j.results.find((l) => l.url === url));
  if (mock === "launchday") return Promise.resolve(ldLL2(url));
  if (mock === "next" || mock === "none") return Promise.resolve(mockLL2(url));
  return fetch(url).then((r) => r.json().catch(() => null).then((j) => {
    if (r.ok && j) return j;
    const hint = Number(r.headers.get("Retry-After")) || Number((/available in (\d+) second/i.exec((j && j.detail) || "") || [])[1]) || 0;
    throw Object.assign(new Error(`LL2 HTTP ${r.status}`), { status: r.status, retryAfterMs: hint * 1000 });
  }));
}

function applyMockOverride(data) {
  const mock = getMock();
  if (!mock || mock === "next" || mock === "none" || mock === "launchday") return data;
  const base = data || { ...NEXT_FLIGHT_FALLBACK, n: LAST_LOGGED_N + 1, pad: "Pad 2", block: "V3", booster: "B99", ship: "S99", headline: "Orbital test flight", note: "Mocked for local testing." };
  if (mock === "inflight") {
    return { ...base, status: "inflight", outcome: null, date: new Date(Date.now() - 35 * 60 * 1000).toISOString() };
  }
  if (mock === "done-success" || mock === "done-failure" || mock === "done-partial") {
    const outcome = mock.replace("done-", "");
    return { ...base, status: "done", outcome, date: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() };
  }
  if (mock === "tbc") {
    return { ...NEXT_FLIGHT_FALLBACK, n: base.n || 15 };
  }
  return data;
}

// Build "V3, Booster 21, Ship 41" without empty ", Booster , Ship" holes when
// a fetch fails or LL2 hasn't filled serials yet.
// Hero vehicles: LL2's serials, else the Road's own vehicles for that flight (B23 / S43 are known before LL2 lists them).
function heroVehicles(f, road) {
  if (!f || f.booster || f.ship || !road || road.flight !== f.n || !Array.isArray(road.vehicles)) return f;
  const vs = roadVehicles(road), boo = vs.find((v) => /^B/i.test(v)), ship = vs.find((v) => /^S/i.test(v));
  return boo || ship ? { ...f, ...(boo ? { booster: boo } : {}), ...(ship ? { ship } : {}) } : f;
}
function vehicleLabel(f) {
  return f && f.block ? `Vehicle ${f.block}` : "Vehicle";
}
function vehicleLine(f) {
  const parts = [];
  if (f && isVehId(f.booster)) parts.push(`Booster ${String(f.booster).replace(/^B/i, "")}`);
  if (f && isVehId(f.ship)) parts.push(`Ship ${String(f.ship).replace(/^S/i, "")}`);
  return parts.length ? parts.join(", ") : "To be announced";
}
// Vehicle ids only: ignore blanks/undefined so a comparison can never match on
// undefined (an empty preview road used to make `undefined === ship` true, then .slice threw).
function isVehId(v) {
  return typeof v === "string" && /^[SB]\d+$/i.test(v);
}
function roadVehicles(road) {
  return ((road && road.vehicles) || []).filter(isVehId);
}

function siteLine(f) {
  if (f.placeholder) return "To be announced";
  const site = siteLabel(f);
  return f.pad ? `${f.pad}, ${site}` : site;
}

// "Booster 21" -> "Booster 21" (already fine); ship serial_number is already "S41".
// Pad name like "Orbital Launch Pad 2" -> "Pad 2", matching the FLIGHTS style.
function shortPad(padName) {
  const m = padName?.match(/Pad\s*(\d+)/i);
  return m ? `Pad ${m[1]}` : padName || "";
}

// LL2 often gives a far-off flight a placeholder date with a rough precision
// (e.g. net 31 Dec + precision "Q4"). That is not a real date, so instead of a
// countdown we show an honest label like "NET Oct · unconfirmed" (no day).
// Returns null when LL2 has a real date (day, hour, minute or second).
const ROUGH_PRECISION = /^(WK|M|Q[1-4]|H[12]|Y|FY|DEC)$/;
// No precision at all, but midnight UTC on the last day of a month: a placeholder.
function looksLikePlaceholder(d) {
  const next = new Date(d.getTime() + DAY);
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && next.getUTCDate() === 1;
}
function roughNet(f, now = nowMs()) {
  if (!f || !f.date) return null;
  const d = new Date(f.date);
  if (!Number.isFinite(d.getTime())) return null;
  const p = f.netPrecision || "";
  if (!p) return looksLikePlaceholder(d) ? { label: "Unconfirmed" } : null;
  if (!ROUGH_PRECISION.test(p)) return null;
  const y = d.getUTCFullYear();
  // First month the launch could fall in: Q4 -> October, H2 -> July, year -> January.
  let m = d.getUTCMonth();
  if (/^Q[1-4]$/.test(p)) m = (Number(p[1]) - 1) * 3;
  else if (p === "H1") m = 0;
  else if (p === "H2") m = 6;
  else if (p === "Y" || p === "FY" || p === "DEC") m = 0;
  // "No earlier than" can't be in the past: never show a month that has gone.
  const today = new Date(now);
  const nowY = today.getUTCFullYear(), nowM = today.getUTCMonth();
  let showY = y, showM = m;
  if (y < nowY || (y === nowY && m < nowM)) { showY = nowY; showM = nowM; }
  const yearOnly = (p === "Y" || p === "FY" || p === "DEC") && showY > nowY;
  const month = new Date(Date.UTC(showY, showM, 1)).toLocaleDateString("en-GB", { timeZone: "UTC", month: "short" });
  const when = yearOnly ? String(showY) : showY === nowY ? month : `${month} ${showY}`;
  return { label: `NET ${when} · unconfirmed` };
}

// Curated "predicted" date from road.json, e.g. {flight, net:"2026-11-08", basis, sources:[...]}.
// Shown only while LL2's date is unconfirmed (rough/placeholder), for the same
// flight, backed by 2+ trusted sources, and not already in the past. As soon as
// LL2 has a real date this returns null and the normal label takes over.
function predictedNet(f, road, now = nowMs()) {
  const p = road && road.predicted;
  if (!f || !p || !Array.isArray(p.sources) || p.sources.length < 2) return null;
  if (Number(p.flight) !== Number(f.n)) return null;
  if (effectiveStatus(f, now) !== "tbc" || exactTime(f)) return null;
  if (f.date && !roughNet(f, now)) return null; // LL2 has a day-or-better date
  const d = new Date(`${p.net}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.getTime() + DAY < now) return null; // stale
  const label = `NET ${d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })}`; // 3 Nov: just "NET 12 Nov" (no source, no "predicted")
  const basis = p.basis || p.sources.map((s) => s.name).filter(Boolean).join(" · ");
  return { label, basis };
}

// Day-or-better TBD is a usable NET day, not a confirmed T-0. Missing precision stays unknown.
function usableTbdDate(f) {
  return !!(f && f.ll2Status === "TBD" && /^(DAY|HR|MIN|SEC)$/.test(f.netPrecision || "") && f.date && Number.isFinite(Date.parse(f.date)));
}
function netDayLabel(f) {
  return `NET ${fmt(f.date, { day: "numeric", month: "short" })}`;
}
function dateOnlyNet(f) { return usableTbdDate(f) || !!(f && f.netPrecision === "DAY" && f.date && Number.isFinite(Date.parse(f.date))); }

// 9 Nov: the hero's NET for the Road Launch date box ("NET 13 Nov"), only while the hero itself shows a Launch Library NET date.
function heroNetFor(f, now = nowMs()) {
  return f && f.n && !f.fromRoad && f.date && Number.isFinite(Date.parse(f.date)) && effectiveStatus(f, now) === "net" ? { n: f.n, date: f.date } : null;
}
// 10 Nov: the Launch date box keeps only one date in the display — the hero's Launch Library NET,
// else the last NET in road.json (same lastKnownNet rule as the pending-lookup fallback). Never hard-coded.
// Official or post-liftoff lines (status done) are left alone. Display only: checkers and push logic unchanged.
function lastKnownNetLabel(road, n) {
  const c = ((road && road.categories) || []).find((x) => x.id === "date") || {};
  for (const s of [c.log_latest, c.latest]) {
    const m = /\bNET (\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))[a-z]*\b/.exec(String(s || "")), f = /\bFlight (\d+)\b/.exec(String(s || ""));
    if (m && (!f || Number(f[1]) === Number(n))) return `NET ${m[1]}`;
  }
  return "";
}
function authoritativeNetLabel(road, heroNet) {
  const n = road && road.flight;
  if (heroNet && Number(heroNet.n) === Number(n) && heroNet.date && Number.isFinite(Date.parse(heroNet.date))) {
    const p = ukParts(heroNet.date);
    return `NET ${p.day} ${p.mon}`;
  }
  return lastKnownNetLabel(road, n);
}
// 13 Nov: road.official_date with pin "status" = a manual pin of the CONFIRMED state only (SpaceX published the date on its own
// flight page). It carries no date of its own, so the shown date is always the newest NET (the hero's Launch Library NET, else the
// last NET in road.json's Launch date line): a slip shows the new date and stays Confirmed. For this flight only. If SpaceX pulls the
// date (no NET left anywhere) the box goes back to In progress; removing the pin from road.json also restores the old states.
function pinnedOfficialDate(road) {
  const o = road && road.official_date;
  return o && o.pin === "status" && Number(o.flight) === Number(road.flight) ? o : null;
}
function launchDateDisplay(flogDate, netLabel, road, heroNet) {
  if (flogDate && flogDate.status === "done" && flogDate.statusText === "Confirmed" && pinnedOfficialDate(road)) { // not after liftoff ("Complete")
    const label = String(netLabel || "").trim();
    if (!/^NET \d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(label)) return { ...flogDate, status: "progress", statusText: "In progress", latest: "Date to be confirmed", cards: [] };
    const hp = heroNet && Number(heroNet.n) === Number(road.flight) && Number.isFinite(Date.parse(heroNet.date)) ? ukParts(heroNet.date) : null;
    const time = hp && `NET ${hp.day} ${hp.mon}` === label && hp.time && hp.time !== "00:00" ? ` ${hp.time}` : "";
    return { ...flogDate, latest: `Confirmed · ${label}${time}`, cards: [] }; // the pill already says Confirmed; no drawer, so the item is not tappable
  }
  if (!flogDate || flogDate.status === "done") return flogDate;
  const label = String(netLabel || "").trim();
  if (!/^NET \d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(label)) return flogDate;
  // Unofficial: keep only the box header (latest). Drop the inner Flight Log entry so the date is not
  // repeated as a day stamp plus the same NET label under the headline. No "No official" wording.
  return { ...flogDate, latest: label, cards: [] };
}
// Display only (RoadCard): current-flight pad feed items on the Flight Log vehicle cards, newest first.
// Checkers still call boxes() and do not see these lines. 7 Nov S42 catch confirmation is a feed item only.
function feedPadLines(road) {
  const vs = roadVehicles(road);
  const out = Object.fromEntries(vs.map((v) => [v, []]));
  for (const f of (road && road.feed_items) || []) {
    if (!f || !f.body || f.card_hide || f.later_flight || f.box !== "pad") continue;
    if ((Number.isInteger(f.flight) ? f.flight : road.flight) !== road.flight) continue;
    if (typeof isRoadFlightEvent === "function" && isRoadFlightEvent({ text: f.body, at: f.at, publishedAt: f.at }, road)) continue;
    const t = String(f.body || "");
    const named = vs.filter((v) => new RegExp(`\\b(?:${v[0] === "S" || v[0] === "s" ? "ship\\s*|s" : "booster\\s*|b"})${v.slice(1)}\\b`, "i").test(t));
    if (!named.length) continue;
    const p = Number.isFinite(Date.parse(f.at)) ? ukParts(f.at) : null;
    const line = { day: (p ? `${p.day} ${p.mon}` : (f.date || "")), time: p && p.time && p.time !== "00:00" ? p.time : "", text: f.body, at: f.at || "", url: f.url || "", id: f.id };
    for (const v of named) out[v].push(line);
  }
  for (const v of vs) out[v].sort((a, b) => (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0));
  return out;
}
function flogPadDisplay(flogPad, road) {
  if (!flogPad || !road) return flogPad;
  const extra = feedPadLines(road);
  const vName = (v) => (!isVehId(v) ? "Launch pad" : /^S/i.test(v) ? `Ship ${v.slice(1)}` : /^B/i.test(v) ? `Booster ${v.slice(1)}` : v);
  const cards = (flogPad.cards || []).map((c) => {
    const add = extra[c.vehicle] || [];
    if (!add.length) return c;
    const seen = new Set((c.lines || []).flatMap((l) => [l.url, l.text].filter(Boolean)));
    const fresh = add.filter((l) => !seen.has(l.url) && !seen.has(l.text));
    if (!fresh.length) return c;
    const lines = [...fresh, ...(c.lines || [])].sort((a, b) => (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0));
    return { ...c, lines };
  });
  const have = new Set(cards.map((c) => c.vehicle));
  for (const v of roadVehicles(road)) {
    if (have.has(v) || !(extra[v] || []).length) continue;
    cards.push({ vehicle: v, name: vName(v), lines: extra[v] });
  }
  return { ...flogPad, cards: typeof orderPadFlogCards === "function" ? orderPadFlogCards(cards) : cards };
}
// Display only: no official licence → "Licence not yet issued" with no date. boxes() output is unchanged.
function faaLicenceDisplay(flogFaa) {
  if (!flogFaa || flogFaa.status === "done") return flogFaa;
  const line = { day: "", time: "", text: "Licence not yet issued" };
  const card = (flogFaa.cards && flogFaa.cards[0]) || { vehicle: "faa", name: "FAA licence" };
  const rest = (card.lines || []).slice(1);
  return { ...flogFaa, latest: "Licence not yet issued", cards: [{ ...card, lines: [line, ...rest] }] };
}

// Turns LL2's launch detail into the card's data.
function flightFromLL2(full) {
  const boosterSerial = full.rocket?.launcher_stage?.[0]?.launcher?.serial_number || "";
  const shipSerial = full.rocket?.spacecraft_stage?.[0]?.spacecraft?.serial_number || "";
  const description = (full.mission?.description || "").split(/\r?\n\r?\n/)[0]; // first paragraph only
  const abbrev = full.status?.abbrev;
  return {
    n: flightNumber(full.name),
    status: mapLL2Status(abbrev),
    ll2Status: abbrev,
    outcome: mapLL2Outcome(abbrev),
    date: full.net,
    netPrecision: full.net_precision?.abbrev || "",
    windowStart: full.window_start || null,
    windowEnd: full.window_end || null,
    pad: shortPad(full.pad?.name),
    block: full.rocket?.configuration?.variant || "",
    booster: boosterSerial.replace(/^Booster\s*/i, "B"),
    ship: shipSerial,
    headline: full.mission?.type ? `${full.mission.type} mission` : "",
    note: description || "Details to be announced.",
  };
}

// 13 Nov (herofallback): cached Launch Library data is only shown for a flight that is still upcoming (not logged, not finished)
// and at most 48h old (LAST_GOOD_MAX_MS). Placeholders ("no next flight listed") are not a cache of a real flight.
function usableCachedFlight(d, at, now = nowMs()) {
  if (!d || d.placeholder || d.n == null || !Number.isFinite(at)) return false;
  if (now - at > LAST_GOOD_MAX_MS || at > now + 60000) return false;
  return !isFinishedLaunch(d.n, d.status, d.date, now); // logged + past the post-liftoff grace, or done > 24h: not next any more
}
function readLastGood(now = nowMs()) {
  if (getMock()) return null;
  try {
    const all = JSON.parse(localStorage.getItem(LL2_GOOD_KEY)) || {};
    return Object.values(all).filter((g) => g && usableCachedFlight(g.data, g.at, now)).sort((a, b) => a.n - b.n)[0] || null; // the earliest still-upcoming flight is the next one
  } catch { return null; }
}
function saveLastGood(data, url, at) {
  if (getMock() || !data || data.placeholder || data.n == null) return;
  try {
    const all = JSON.parse(localStorage.getItem(LL2_GOOD_KEY)) || {};
    all[data.n] = { n: data.n, url: url || null, data, at };
    const keep = Object.values(all).sort((a, b) => b.at - a.at).slice(0, 3); // a few flights at most
    localStorage.setItem(LL2_GOOD_KEY, JSON.stringify(Object.fromEntries(keep.map((g) => [g.n, g]))));
  } catch {}
}
let ll2MemBackoff = 0;
function ll2BackoffUntil() {
  if (getMock()) return ll2MemBackoff;
  try { return Number(localStorage.getItem(LL2_BACKOFF_KEY)) || 0; } catch { return 0; }
}
function noteLL2Failure(err, now = nowMs()) {
  if (!err || err.status !== 429) return;
  const until = now + Math.min(err.retryAfterMs > 0 ? err.retryAfterMs : THROTTLE_DEFAULT_MS, THROTTLE_MAX_MS);
  if (getMock()) ll2MemBackoff = until; else { try { localStorage.setItem(LL2_BACKOFF_KEY, String(until)); } catch {} }
}

// 13 Nov (herofallback): when the hero has no Launch Library flight (lookup failed, throttled, no cache, or LL2 lists no next
// flight) but road.json tracks that same flight with a NET, show road.json's NET day and pad instead of "To be confirmed" /
// "To be announced". Uses the same NET line as the Road Launch date box (lastKnownNetLabel) and road.pad, so it works for any
// flight N. Day-only (a dated TBD: "NET 13 Nov", no countdown to an invented time, no live Watch badge) unless the Road also
// has a confirmed official date with a clock time — then the hero shows that UK time and a running NET countdown, the same as
// live Launch Library data with a time. Live data always wins.
function roadNetIso(label, now = nowMs()) {
  const m = /^NET (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.exec(label || "");
  if (!m) return null;
  const y = new Date(now).getUTCFullYear(), mon = MON3.indexOf(m[2]), day = Number(m[1]);
  // the year that puts the date nearest to now ("NET 3 Jan" seen in late December is next year's)
  const best = [y - 1, y, y + 1].map((yy) => Date.UTC(yy, mon, day, 12)).sort((a, b) => Math.abs(a - now) - Math.abs(b - now))[0];
  return new Date(best).toISOString(); // midday UTC: the same calendar day in UK time, summer or winter
}
// Civil clock in a named zone → UTC ms. Iterates the zone offset so UK BST and US Central DST stay correct.
function zonedLocalMs(year, mon0, day, hour, min, timeZone) {
  let t = Date.UTC(year, mon0, day, hour, min);
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const hh = p.hour === "24" ? 0 : Number(p.hour);
    const got = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hh, Number(p.minute));
    t += Date.UTC(year, mon0, day, hour, min) - got;
  }
  return t;
}
const CLOCK_ZONES = { UK: "Europe/London", GMT: "UTC", UTC: "UTC", CT: "America/Chicago", CST: "America/Chicago", CDT: "America/Chicago", ET: "America/New_York", EST: "America/New_York", EDT: "America/New_York" };
// "22:45 UK", "4:45 p.m. CT". Times 0–12 without am/pm are ambiguous in prose (allowBareMorning for structured official_date.time).
function parseClock(text, allowBareMorning = false) {
  const m = /\b(\d{1,2}):(\d{2})(?:\s*:\d{2})?\s*(?:([ap])\.?\s*m\.?)?\s*(UK|GMT|UTC|CT|CST|CDT|ET|EST|EDT)?\b/i.exec(String(text || ""));
  if (!m) return null;
  let hour = Number(m[1]), min = Number(m[2]);
  if (hour > 23 || min > 59) return null;
  const ap = (m[3] || "").toLowerCase(), z = (m[4] || "").toUpperCase();
  if (ap === "p" && hour < 12) hour += 12;
  if (ap === "a" && hour === 12) hour = 0;
  if (!ap && hour <= 12 && !allowBareMorning) return null;
  return { hour, min, zone: CLOCK_ZONES[z] || "Europe/London" };
}
function dayInText(text) {
  const t = String(text || "");
  let m = /\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.exec(t);
  if (m) return `${Number(m[1])} ${m[2]}`;
  m = /\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2})\b/.exec(t);
  if (!m) return "";
  const mon = m[1] === "May" ? "May" : LONG_MON[m[1]];
  return mon ? `${Number(m[2])} ${mon}` : "";
}
// official_date for this flight (status pin, or a record with at/day/time). Other flights' pins are ignored.
function officialDateOf(road) {
  const o = road && road.official_date;
  if (!o) return null;
  if (o.flight != null && Number.isInteger(road.flight) && Number(o.flight) !== Number(road.flight)) return null;
  return o;
}
function isoFromNetDayClock(dayLabel, clock, now) {
  if (!clock || !dayLabel) return null;
  const label = /^NET /i.test(dayLabel) ? dayLabel : `NET ${String(dayLabel).replace(/^NET /i, "")}`;
  const mid = roadNetIso(label, now);
  if (!mid) return null;
  const d = new Date(mid), t = zonedLocalMs(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), clock.hour, clock.min, clock.zone || "Europe/London");
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
// The calendar day the official_date pin itself belongs to (at, .day, or a date named in the quote/text). Empty if none.
function officialPinDay(o) {
  if (!o) return "";
  if (o.at && Number.isFinite(Date.parse(o.at))) {
    const p = ukParts(o.at);
    if (p.day && p.mon) return `${p.day} ${p.mon}`;
  }
  if (o.day) {
    const d = String(o.day).replace(/^NET\s+/i, "").trim();
    const m = /^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.exec(d);
    if (m) return `${Number(m[1])} ${m[2]}`;
    const named = dayInText(d);
    if (named) return named;
  }
  return dayInText(o.source_quote) || dayInText(o.text) || "";
}
// When SpaceX has officially confirmed the date, pick a clock time from road.json (any flight): official_date.at / .time,
// the pin's source_quote (e.g. "4:45 p.m. CT"), the Launch date line, or a same-day feed item. The official clock is used
// only when the pin's own day equals the newest NET day (or there is no NET line, so the pin's day stands alone). If the
// NET has slipped to a different day, return null so the hero stays day-only — never reuse the old clock on a new day.
// Times in the pin are converted from their own zone (CT → America/Chicago, "22:45" / "22:45 UK" → Europe/London, ISO at
// → as stored). No time, or no official day, → null (day-only fallback).
function officialTimeIso(road, now = nowMs()) {
  const o = officialDateOf(road);
  if (!o) return null;
  const netLabel = lastKnownNetLabel(road, road.flight), netDay = netLabel ? netLabel.replace(/^NET /, "") : "";
  const pinDay = officialPinDay(o);
  if (!pinDay) return null;
  if (netDay && pinDay !== netDay) return null; // a slip: do not put the official clock on a day nobody announced
  const day = netDay || pinDay;
  const apply = (clock) => isoFromNetDayClock(day, clock, now);
  if (o.at && Number.isFinite(Date.parse(o.at))) {
    const p = ukParts(o.at);
    if (p.time && p.time !== "00:00" && `${p.day} ${p.mon}` === day) return new Date(Date.parse(o.at)).toISOString();
  }
  if (o.time) {
    const clock = parseClock(/[A-Za-z]/.test(o.time) ? o.time : `${o.time} UK`, true);
    const iso = apply(clock);
    if (iso) return iso;
  }
  for (const text of [o.source_quote, o.text]) {
    const clock = parseClock(text);
    if (!clock) continue;
    const iso = apply(clock);
    if (iso) return iso;
  }
  const cat = ((road.categories) || []).find((c) => c && c.id === "date") || {};
  for (const s of [cat.log_latest, cat.latest]) {
    const clock = parseClock(s);
    if (!clock) continue;
    const mentioned = dayInText(s);
    if (mentioned && mentioned !== day) continue;
    const iso = apply(clock);
    if (iso) return iso;
  }
  const items = ((road.feed_items) || []).filter((it) => it && (it.flight == null || Number(it.flight) === Number(road.flight)));
  items.sort((a, b) => (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0));
  for (const it of items) {
    const text = `${it.body || ""} ${it.title || ""}`;
    const clock = parseClock(text);
    if (!clock) continue;
    const mentioned = dayInText(text);
    if (mentioned && mentioned !== day) continue;
    const iso = apply(clock);
    if (iso) return iso;
  }
  return null;
}
function withRoadFallback(f, road, now = nowMs()) {
  if (!f || !f.placeholder || !road || !Number.isInteger(road.flight) || Number(f.n) !== road.flight) return f;
  const exact = officialTimeIso(road, now);
  if (exact) {
    if (Date.parse(exact) + DAY < now) return f; // a dated official time already a day past: keep the honest TBC
    return { ...f, placeholder: false, fromRoad: true, status: "net", ll2Status: "TBC", netPrecision: "MIN", date: exact,
      pad: typeof road.pad === "string" ? road.pad : f.pad };
  }
  const date = roadNetIso(lastKnownNetLabel(road, road.flight), now);
  if (!date || Date.parse(date) + DAY < now) return f; // no NET in road.json, or that day has passed: keep the honest TBC
  return { ...f, placeholder: false, fromRoad: true, status: "net", ll2Status: "TBD", netPrecision: "DAY", date,
    pad: typeof road.pad === "string" ? road.pad : f.pad };
}

// Keeps the next-flight data fresh while the app is open: every hour normally,
// every 5 minutes on launch day (isHot), paused while the tab is hidden, and
// re-checked on return if stale. Every LL2 call goes through ll2Spend's
// hourly budget. Returns { flight, checkedAt }.
function useNextFlight() {
  const [live, setLive] = React.useState(null);
  const [checkedAt, setCheckedAt] = React.useState(null);
  const [settled, setSettled] = React.useState(false); // 9 Nov: false until the first Launch Library lookup answers (or is skipped)
  React.useEffect(() => {
    const persist = !getMock();
    let meta = { data: null, fetchedAt: 0, ttl: 0, url: null, listAt: 0, failedAt: 0 };
    // A cached "no next flight" placeholder only counts for the flight right after the log (the old detail-failure bug cached
    // N+2 placeholders) and never over a last good copy of a real flight; a real flight's cache must be usableCachedFlight.
    const usableCache = (c) => {
      if (!c.data.placeholder) return usableCachedFlight(c.data, c.fetchedAt);
      const g = readLastGood();
      return c.data.n === LAST_LOGGED_N + 1 && !(g && g.n <= c.data.n);
    };
    const readCache = () => {
      if (!persist) return;
      try {
        const c = JSON.parse(localStorage.getItem(CACHE_KEY));
        if (c?.data && c.fetchedAt > meta.fetchedAt && usableCache(c)) { // includes a fresher copy saved by another tab
          meta = { ...meta, url: null, listAt: 0, ttl: CACHE_MS, ...c };
          setLive(c.data); setCheckedAt(c.fetchedAt); setSettled(true);
        }
      } catch {}
      if (!meta.data) applyLastGood();
    };
    // No usable cache (first visit, cache too old, a finished flight's): the last good LL2 copy for the next flight, if any.
    // fetchedAt stays its real age, so the normal TTL decides whether to ask LL2 again.
    const applyLastGood = () => {
      const g = readLastGood();
      if (!g) return false;
      meta = { ...meta, data: g.data, fetchedAt: g.at, ttl: isHot(g.data) ? HOT_TTL_MS : CACHE_MS, url: g.url, listAt: 0 };
      setLive(g.data); setCheckedAt(g.at); setSettled(true);
      return true;
    };
    const finished = (d) => d && d.n != null && !d.placeholder && isFinishedLaunch(d.n, d.status, d.date);
    let busy = false;
    const load = () => {
      if (busy || document.visibilityState === "hidden") return; // paused in the background
      readCache();
      const now = nowMs();
      const d = meta.data;
      if (d && !finished(d) && now - meta.fetchedAt < meta.ttl) return; // still fresh
      if (now - meta.failedAt < RETRY_AFTER_FAIL_MS) return;
      if (now < ll2BackoffUntil()) { setSettled(true); return; } // LL2 throttled us: wait until it said it frees up
      const detailOnly = !!(d && meta.url && !finished(d) && isHot(d, now) && now - meta.listAt < LIST_EVERY_MS);
      if (!ll2Spend(detailOnly ? 1 : 2)) { setSettled(true); return; } // over the hourly LL2 budget: a later tick tries again
      busy = true;
      let seenMax = LAST_LOGGED_N;
      let listAt = meta.listAt;
      // Step 1: find which launch is next (skipped on launch day if the list was read in the last hour).
      const step1 = detailOnly ? Promise.resolve(meta.url) : ll2Json(LL2_ENDPOINT).then((json) => {
        if (!Array.isArray(json?.results) || !json.results.length) return null; // throttled / error / an empty answer: keep what we have
        listAt = nowMs();
        json.results.forEach((l) => { const n = flightNumber(l.name); if (n != null) seenMax = Math.max(seenMax, n); });
        const launch = pickNextLaunch(json.results);
        return launch ? launch.url : "none";
      });
      // Step 2: that launch's full detail (pad, vehicle serials, window, mission).
      step1
        .then((url) => (!url ? null : url === "none" ? { url: null, full: "none" } : ll2Json(url).then((full) => ({ url, full }))))
        .then((res) => {
          // 13 Nov: a failed detail call is a failure, not "no next flight" (it used to cache a Flight N+2 placeholder for an hour)
          if (!res || (res.full !== "none" && !res.full?.name)) { meta.failedAt = nowMs(); if (!meta.data) applyLastGood(); return; }
          const data = res.full === "none" ? placeholderFlight(seenMax + 1) : flightFromLL2(res.full);
          const at = nowMs();
          meta = { data, fetchedAt: at, ttl: isHot(data, at) ? HOT_TTL_MS : CACHE_MS, url: res.url, listAt, failedAt: 0 };
          setLive(data); setCheckedAt(at);
          if (persist) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(meta)); } catch {} }
          saveLastGood(data, res.url, at);
        })
        .catch((err) => { meta.failedAt = nowMs(); noteLL2Failure(err); if (!meta.data) applyLastGood(); })
        .finally(() => { busy = false; setSettled(true); });
    };
    load();
    // Cheap local tick (no network unless due); the demo's fake clock needs a fast one.
    const id = setInterval(load, LD ? 1000 : 15000);
    // Phones keep the app open in the background for hours: re-check (if stale) on return.
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return { flight: applyMockOverride(live), checkedAt, settled };
}

/* ───────────── pieces ───────────── */

function RocketMark() {
  return (
    <svg viewBox="0 0 24 80" aria-hidden="true">
      <path d="M12 2c4 6 6 13 6 20v48h-12V22c0-7 2-14 6-20z" fill="currentColor" />
      <path d="M6 58l-4 12h4zM18 58l4 12h-4z" fill="currentColor" />
    </svg>
  );
}

function PhotoSlot({ size, src, alt, onClick }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  if (src && !failed) {
    return (
      <div className={`photo photo-${size} has-img${onClick ? " tappable" : ""}`} onClick={onClick}>
        <img src={src} alt={alt || ""} loading="lazy" onError={() => setFailed(true)} />
        <span className="photo-credit">SpaceX</span>
      </div>
    );
  }
  return (
    <div className={`photo photo-${size}`} role="img" aria-label="Photo placeholder">
      <RocketMark />
      {size === "wide" && <span className="photo-cap">Photo to come</span>}
    </div>
  );
}

function Pill({ outcome }) {
  return <span className={`pill pill-${outcome}`}>{OUTCOME_LABEL[outcome]}</span>;
}

function Connector({ label, dashed }) {
  return (
    <div className="gap" aria-hidden="true">
      <span className={`gap-line${dashed ? " dashed" : ""}`} />
      <span className="gap-label">{label}</span>
    </div>
  );
}

// How long after T-0 we keep a post-liftoff UI before falling back to
// "Result pending" when LL2 still hasn't posted Success/Failure.
const RESULT_PENDING_AFTER_MS = 4 * 60 * 60 * 1000;

function Countdown({ flight, road }) {
  const now = useNow(true);
  const status = effectiveStatus(flight, now);

  if (status === "tbc") {
    const pred = predictedNet(flight, road, now); // 3 Nov: a predicted date replaces LL2's "Date to be confirmed" on the hero pill
    return <div className="cd"><span className="cd-val cd-tbc">{pred ? pred.label : "Date to be confirmed"}</span></div>;
  }
  if (status === "inflight") {
    const since = now - new Date(flight.date).getTime();
    if (exactTime(flight) && since >= 0) { // live T+ from liftoff
      return (
        <div className="cd cd-inflight" aria-label={`In flight, T plus ${hms(since)}`}>
          <span className="cd-tag cd-tag-live">● T+</span>
          <span className="cd-val">{hms(since)}</span>
        </div>
      );
    }
    return (
      <div className="cd cd-inflight" aria-label="Mission in progress">
        <span className="cd-tag cd-tag-live">● In flight</span>
        <span className="cd-val">Mission in progress</span>
      </div>
    );
  }
  if (status === "done") {
    const label = OUTCOME_LABEL[flight.outcome] || "Result in";
    return (
      <div className="cd" aria-label={`Flight result: ${label}`}>
        <span className={`cd-tag cd-tag-outcome cd-tag-${flight.outcome || "pending"}`}>{label}</span>
        <span className="cd-val">Flight complete</span>
      </div>
    );
  }

  if (status === "net" && dateOnlyNet(flight)) return <div className="cd"><span className="cd-val">{netDayLabel(flight)}</span></div>;

  const rawDiff = new Date(flight.date).getTime() - now;
  if (rawDiff < -RESULT_PENDING_AFTER_MS) {
    return <div className="cd"><span className="cd-val cd-tbc">Result pending</span></div>;
  }
  const diff = Math.max(0, rawDiff);
  const d = Math.floor(diff / DAY), h = Math.floor(diff / 3600000) % 24, m = Math.floor(diff / 60000) % 60, s = Math.floor(diff / 1000) % 60;
  const isNet = status === "net";
  return (
    <div className="cd" aria-label={isNet ? `Estimated countdown, no earlier than ${fmt(flight.date, { day: "numeric", month: "long" })}` : undefined}>
      <span className="cd-tag">{isNet ? "NET" : "T–"}</span>
      <span className="cd-val">{diff === 0 ? "Launching" : d > 0 ? `${d}d ${pad2(h)}:${pad2(m)}:${pad2(s)}` : hms(diff)}</span>
    </div>
  );
}

// The Watch live badge only once the flight has a date (not for "Date to be confirmed" / a rough NET month).
const showWatchBadge = (flight, status) => !!(flight && flight.date) && status !== "tbc";
function WatchLiveBadge({ flight, now }) {
  const status = effectiveStatus(flight, now);
  if (!showWatchBadge(flight, status)) return null; // no date yet: nothing to watch
  // No date yet (status "tbc"): still show the badge, just gray and not clickable.
  // Stay clickable for the whole in-flight window; otherwise use the usual
  // lead/trail timing around the scheduled T-0.
  let active = status === "inflight";
  if (!active && status !== "tbc" && flight.date && (!flight.fromRoad || exactTime(flight))) { // day-only road fallback has no T-0; a confirmed official time does
    const t = new Date(flight.date).getTime();
    active = now >= t - WATCH_LIVE_LEAD_MS && now <= t + WATCH_LIVE_TRAIL_MS;
  }
  const Tag = active ? "a" : "span";
  const linkProps = active ? { href: WATCH_LIVE_URL, target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <Tag className={`watch-badge${active ? " watch-badge-live" : ""}`} {...linkProps}>
      <span className="watch-dot" />
      Watch live
    </Tag>
  );
}

// "Opens 22:30 · Closes 00:30 (UK)" / "Open now · Closes 00:30 (UK)", from LL2's window.
function windowText(f, now) {
  const ws = new Date(f.windowStart).getTime(), we = new Date(f.windowEnd).getTime();
  if (!Number.isFinite(ws) || !Number.isFinite(we) || we < ws) return null;
  if (now > we) return null;
  if (ws === we) return `${fmtTimeLondon(f.windowStart)} only (UK)`;
  return now >= ws ? `Open now · Closes ${fmtTimeLondon(f.windowEnd)} (UK)` : `Opens ${fmtTimeLondon(f.windowStart)} · Closes ${fmtTimeLondon(f.windowEnd)} (UK)`;
}

function NextFlightCard({ f, checkedAt, road, children }) {
  const now = useNow(true);
  const status = effectiveStatus(f, now);
  const confirmed = status === "confirmed" && exactTime(f);
  const win = confirmed && f.windowStart ? windowText(f, now) : null;
  const dateLabel = status === "net" ? "NET date" : status === "inflight" || status === "done" ? "Liftoff" : "Date";
  let dateText = "To be confirmed";
  if (status === "inflight" || status === "done") dateText = f.date ? fmtLaunchedLondon(f.date) : dateText;
  else if (status !== "tbc" && f.date) dateText = fmtDateTimeLondon(f.date);
  if (status === "net" && dateOnlyNet(f)) dateText = ukStamp(f.date, false); // day only: the label is already "NET date", so not "NET 13 Nov"
  const rough = status === "tbc" ? roughNet(f, now) : null;
  if (rough) dateText = rough.label;
  const predicted = predictedNet(f, road, now);
  if (predicted) dateText = predicted.label;
  if (dateLabel === "NET date" && /^NET\s+/i.test(dateText)) dateText = dateText.replace(/^NET\s+/i, ""); // never "NET date: NET …"
  return (
    <section className="next" aria-label={`${status === "inflight" ? "Current" : status === "done" ? "Latest" : "Next"} flight: Flight ${f.n}`}>
      <div className="next-top">
        <Countdown flight={f} road={road} />
        <WatchLiveBadge flight={f} now={now} />
      </div>
      <div className="next-title"><span className="t-word">Starship Flight</span><span className="t-num">{f.n || "—"}</span></div>
      <dl className="facts">
        <dt>{dateLabel}</dt><dd>{dateText}</dd>
        {win && <><dt>Window</dt><dd>{win}</dd></>}
        <dt>Site</dt><dd>{siteLine(f)}</dd>
        <dt>{vehicleLabel(heroVehicles(f, road))}</dt><dd>{vehicleLine(heroVehicles(f, road))}</dd>
      </dl>
      {showMissionCard(road, f.n, f, now) ? (
        <p className="next-note">{cleanHeroNote(fillMissionCard(missionCardText(road, f.n), f, road))}</p>
      ) : (
        <p className="next-note">{cleanHeroNote(f.note)}</p>
      )}
      {heroMissionLines(road, f.n, f, now).map((line, i) => <p className="next-upd" key={i}>{line}</p>)}
      {children}
    </section>
  );
}

// The two gallery photos: the flight's own, else its Road milestones' real photos (newest milestones first), else one "Photo to come".
function galleryOf(f, past) {
  const own = ((f.photo && f.photo.gallery) || []).filter(Boolean);
  if (own.length) return own.slice(0, 2).concat(own.length < 2 ? [undefined] : []).slice(0, 2);
  const order = ["static", "pad", "raptor", "cryo"], road = (past || []).filter((e) => e.photo && e.photo.image && !/^https?:\/\/video\./.test(e.photo.image))
    .sort((a, b) => order.indexOf(a.box) - order.indexOf(b.box)).map((e) => e.photo.image);
  const pics = [...new Set(road)].slice(0, 2);
  return pics.length ? pics : [undefined];
}
// Thumb: the flight's own photo, else (placeholder or none) its first Road milestone photo.
const thumbOf = (f, past) => { const t = f.photo && f.photo.thumb; return t && t !== RTF_PLACEHOLDER ? t : galleryOf({ photo: {} }, past)[0] || t; };
function FlightCard({ f, open, onTap, onPhotoTap, register, road }) {
  const past = React.useMemo(() => (isLaunched(f.n) ? pastSummary(road, f.n) : []), [road, f.n]); // launched flights only, never the next flight
  const [pastOpen, setPastOpen] = React.useState(false); // the Road list starts closed
  // Archive flights only (the toggle already hides when pastSummary is empty): all six category dots filled.
  const pastDots = React.useMemo(() => ((road && road.categories) || []).filter((m) => !ROAD_HIDDEN.includes(m.id)).map((m) => ({ id: m.id, name: m.name, color: m.color || PAST_COLOR[m.id] })), [road]);
  const onKey = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(f.n); } };
  // While closed, tapping the thumb should expand the card like the rest of the header.
  // Once open, tapping the thumb opens the lightbox instead — so it needs to stop
  // the click from also bubbling up to the header's collapse handler.
  const thumbTap = open && thumbOf(f, past)
    ? (e) => { e.stopPropagation(); onPhotoTap(thumbOf(f, past), `Starship Flight ${f.n}`); }
    : undefined;

  return (
    <article ref={(el) => register(f.n, el)} className={`card${open ? " is-open" : ""}`}>
      <div className="card-head" role="button" tabIndex={0} aria-expanded={open} onClick={() => onTap(f.n)} onKeyDown={onKey}>
        <PhotoSlot size="thumb" src={thumbOf(f, past)} alt={`Starship Flight ${f.n}`} onClick={thumbTap} />
        <div className="info">
          <div className="info-top">
            <div className="title"><span className="t-word">Starship Flight</span><span className="t-num">{f.n}</span></div>
            <Pill outcome={f.outcome} />
          </div>
          <div className="date">{ukStamp(f.date, false, true)}</div>
          <div className="sub">{f.pad}, {siteLabel(f)}</div>
          <div className="sub">{f.block} · {f.booster} / {f.ship}</div>
        </div>
        <svg className="chev" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 5.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="more">
        <div className="more-inner">
          <div className="more-pad">
            <h3 className="headline">{f.headline}</h3>
            <p className="story">{f.story}</p>
            {past.length > 0 && (<>
              <button type="button" className={"past-toggle" + (pastOpen ? " open" : "")} aria-expanded={pastOpen} aria-controls={`past-${f.n}`}
                tabIndex={open ? 0 : -1} onClick={(e) => { e.stopPropagation(); setPastOpen((v) => !v); }} onKeyDown={(e) => e.stopPropagation()}>
                <span className="past-toggle-title">{`Road to Flight ${f.n}`}</span>
                <span className="road-dots">{pastDots.map((m) => <i key={m.id} className="dot dot-done" style={catVars(m.id, m.color)} title={m.name + ": " + (ROAD_DONE_LABEL[m.id] || "Complete")} aria-label={m.name + ": " + (ROAD_DONE_LABEL[m.id] || "Complete")} role="img" />)}</span>
                <span className="road-count">{pastDots.length} of {pastDots.length} done</span>
                <svg className="past-chev" width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <div className={"past-wrap" + (pastOpen ? " open" : "")} id={`past-${f.n}`} aria-hidden={!pastOpen}><div className="past-wrap-inner">
              <div className="past-sum" aria-label={`Road to Flight ${f.n}`}>
                {past.map((e, i) => (
                  <div className="past-box" key={i} data-id={e.box} style={catVars(e.box, e.color)}>
                    <PastTop vehicle={e.vehicle} labels={e.labels || [e.label]} />
                    <PastText tiers={(e.tiers && e.tiers.length ? e.tiers : [e.text]).map((t) => scrub(String(t || "")))} />
                  </div>
                ))}
              </div>
              </div></div>
            </>)}
            <div className="gallery">
              {galleryOf(f, past).map((src, i) => (
                <PhotoSlot key={i}
                  size="wide" src={src} alt={`${f.headline} \u2014 photo ${i + 1}`}
                  onClick={src ? () => onPhotoTap(src, `${f.headline} \u2014 photo ${i + 1}`) : undefined}
                />
              ))}
            </div>
            {f.highlights ? (
              <a className="highlights-link" href={f.highlights} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><path d="M4 2.5l7 4-7 4z" fill="currentColor" /></svg>
                Watch the flight highlights
              </a>
            ) : (
              <span className="highlights-link highlights-soon" aria-disabled="true">
                <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><path d="M4 2.5l7 4-7 4z" fill="currentColor" /></svg>
                Highlights coming soon
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

// Past boxes (fixed size): pick the first wording tier that fits. usePastFit steps down one tier per pass after
// layout (before paint) while overflows(el) is true, and starts again from the full tier whenever the width
// changes (ResizeObserver; also covers collapsed → open) or web fonts finish loading.
function usePastFit(count, key, overflows) {
  const ref = React.useRef(null);
  const [st, setSt] = React.useState({ key, i: 0 });
  const i = st.key === key ? Math.min(st.i, count - 1) : 0;
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !el.clientWidth || i >= count - 1) return;
    if (overflows(el)) setSt({ key, i: i + 1 });
  });
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let w = el.clientWidth, live = true;
    const reset = () => live && setSt((s) => ({ key: s.key, i: 0, w: el.clientWidth }));
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; reset(); } }) : null;
    if (ro) ro.observe(el);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(reset);
    return () => { live = false; if (ro) ro.disconnect(); };
  }, []);
  return [ref, i];
}
// Text: fits when it needs no more than 2 lines (scrollHeight vs 2 × line-height; the CSS 2-line clamp is the safety net).
const pastTextOverflows = (el) => el.scrollHeight > 2 * (parseFloat(getComputedStyle(el).lineHeight) || 16.56) + 1;
function PastText({ tiers }) {
  const [ref, i] = usePastFit(tiers.length, tiers.join("\u0001"), pastTextOverflows);
  // A date ("23 Sep") never breaks across the two lines.
  return <p ref={ref} className="past-text" data-tier={i} title={i > 0 ? tiers[0] : undefined}>{String(tiers[i]).replace(/\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, "$1\u00a0$2")}</p>;
}
// Title row: one line. If the vehicle name would be cut off next to the full pill, use the short pill wording (PAST_LABEL_SHORT).
// Sub-pixel safe: the text's own width (Range) vs the span's box, since scrollWidth / clientWidth round to whole pixels.
const pastTopOverflows = (el) => { const v = el.querySelector(".past-veh"); if (!v) return false; const r = document.createRange(); r.selectNodeContents(v); return r.getBoundingClientRect().width > v.getBoundingClientRect().width + 0.05; };
function PastTop({ vehicle, labels }) {
  const [ref, i] = usePastFit(labels.length, labels.join("\u0001"), pastTopOverflows);
  return (
    <div className="past-box-top" ref={ref}>
      <span className="past-veh">{vehicle}</span>
      <span className="past-pill" title={i > 0 ? labels[0] : undefined}>{labels[i]}</span>
    </div>
  );
}

function AboutPanel({ open, onClose, onManageNotifications }) {
  React.useEffect(() => {
    if (!open) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open]);

  return (
    <>
      <div className={`scrim${open ? " show" : ""}`} onClick={onClose} role="button" aria-label="Close menu" />
      <aside className={`about${open ? " show" : ""}`} aria-label="About">
        <h2>About</h2>
        <p>A personal log of every Starship flight. No ads, no tracking.</p>
        <dl>
          <dt>Photos</dt><dd>All photos by SpaceX, credited on each image.</dd>
          <dt>Flight data</dt><dd>Last checked {fmtDay(String(DATA_CHECKED).replace(new RegExp(" " + new Date().getFullYear() + "$"), ""))}.</dd>
          <dt>Next flight</dt><dd>Launch dates move often. The countdown runs off the best known date and is tagged NET (estimated) until SpaceX confirms the exact time.</dd>
        </dl>
        {FEEDBACK_ENABLED && <FeedbackForm />}
        {/* Notifications sit at the very bottom, under the feedback box (same look as the rows above) */}
        <dl>
          <dt>Notifications</dt><dd><button className="notify-manage-btn" onClick={onManageNotifications}>Manage notifications</button></dd>
        </dl>
        <p className="about-foot">Version 2</p>
      </aside>
    </>
  );
}

function NotifyModal({ open, onClose }) {
  const [status, setStatus] = React.useState("off");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) setStatus(window.STNotify?.getStatus() || "off");
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open]);

  if (!open) return null;

  const handleEnable = async () => {
    setBusy(true);
    const res = await window.STNotify.subscribe();
    setBusy(false);
    if (res.ok) onClose();
    else alert("Couldn't turn on notifications — check you allowed the permission prompt, then try again from the About menu.");
  };
  const handleDisable = async () => {
    setBusy(true);
    await window.STNotify.unsubscribe();
    setBusy(false);
    onClose();
  };
  const handleDismiss = () => {
    window.STNotify?.dismiss();
    onClose();
  };

  return (
    <>
      <div className="scrim show" onClick={onClose} />
      <div className="notify-modal" role="dialog" aria-modal="true">
        {status === "on" ? (
          <>
            <h2>Notifications are on</h2>
            <p>You'll get an alert when flight details change.</p>
            <div className="notify-actions">
              <button className="notify-btn notify-btn-quiet" onClick={handleDisable} disabled={busy}>Turn off</button>
              <button className="notify-btn notify-btn-primary" onClick={onClose} disabled={busy}>Close</button>
            </div>
          </>
        ) : (
          <>
            <h2>Get notified about flight changes?</h2>
            <p>Hear about launch date and status changes as soon as they happen.</p>
            <div className="notify-actions">
              <button className="notify-btn notify-btn-quiet" onClick={handleDismiss} disabled={busy}>Maybe later</button>
              <button className="notify-btn notify-btn-primary" onClick={handleEnable} disabled={busy}>Enable</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// Hidden for now (security): set FEEDBACK_ENABLED to true to bring the box back.
// When false, the About menu does not render it, and handleSend returns before any
// network or Firebase write. notifications.js is unchanged.
const FEEDBACK_ENABLED = false;
// The "What would you add?" box at the bottom of the About menu: the text box
// is right there, ready to type into, no extra tap. It sends a short note
// straight to Firestore via window.STNotify.sendFeedback (in notifications.js).
// The About menu never really unmounts, so a half-written draft is still there
// next time you open it; it only gets cleared once it has actually been sent.
// No auto-focus on purpose: on iPhone that would pop the keyboard up the
// moment the menu opens.
function FeedbackForm() {
  const [text, setText] = React.useState("");
  const [handle, setHandle] = React.useState("");
  const [state, setState] = React.useState("idle"); // "idle" | "sending" | "sent" | "error"
  const [typing, setTyping] = React.useState(false); // a field has focus (so the keyboard is probably up)
  const boxRef = React.useRef(null);
  const blurTimer = React.useRef(0);
  const sending = state === "sending";

  // On iPhone the keyboard covers the bottom of the screen but doesn't shrink
  // the menu, so while you're typing we add some empty room under the box and
  // scroll the menu just enough to keep the box and Send above the keyboard.
  const keepInView = () => {
    const box = boxRef.current, panel = box?.closest(".about");
    if (!box || !panel) return;
    const vv = window.visualViewport;
    const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const r = box.getBoundingClientRect();
    const d = Math.min(r.bottom + 12 - visibleBottom, r.top - 12); // never push the box's top off screen
    if (d > 1) panel.scrollBy({ top: d, behavior: reduceMotion() ? "auto" : "smooth" });
  };
  React.useEffect(() => {
    if (!typing) return;
    const t = setTimeout(keepInView, 350); // give the keyboard time to slide up
    window.visualViewport?.addEventListener("resize", keepInView);
    return () => { clearTimeout(t); window.visualViewport?.removeEventListener("resize", keepInView); };
  }, [typing]);
  // The short delay on blur stops the layout shifting under your finger
  // in the moment between leaving the text box and tapping Send.
  const onFocus = () => { clearTimeout(blurTimer.current); setTyping(true); };
  const onBlur = () => { blurTimer.current = setTimeout(() => setTyping(false), 300); };

  const handleSend = async () => {
    if (!FEEDBACK_ENABLED) return; // no network or Firebase write while the box is hidden
    if (!text.trim() || sending) return;
    setState("sending");
    let res = { ok: false };
    try {
      // If an old cached notifications.js is still loaded, the function won't
      // exist yet: treat that like any other failure so the retry shows.
      if (window.STNotify?.sendFeedback) res = await window.STNotify.sendFeedback(text, handle);
    } catch (e) { /* shown as the error message below */ }
    if (res.ok) { setText(""); setHandle(""); }
    setState(res.ok ? "sent" : "error");
  };

  return (
    <section ref={boxRef} className={`feedback-box${typing ? " typing" : ""}`} aria-labelledby="feedback-title" onFocus={onFocus} onBlur={onBlur}>
      {state === "sent" ? (
        <>
          <h3 id="feedback-title">Thanks! Got it. 🚀</h3>
          <p>Your note is on its way to me.</p>
          <button className="feedback-again" onClick={() => setState("idle")}>Send another</button>
        </>
      ) : (
        <>
          <h3 id="feedback-title">What would you add?</h3>
          <p>Ideas, missing features, anything that bugs you. I read every one.</p>
          <textarea
            className="feedback-field" rows={4} maxLength={1000} placeholder="I'd love to see…"
            aria-label="Your idea" value={text} disabled={sending}
            onChange={(e) => setText(e.target.value)}
          />
          {text.length >= 800 && <div className="feedback-count">{text.length}/1000</div>}
          <input
            className="feedback-field feedback-handle" type="text" maxLength={50}
            placeholder="X or Reddit name (optional)" aria-label="Your X or Reddit name (optional)"
            autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            value={handle} disabled={sending} onChange={(e) => setHandle(e.target.value)}
          />
          {state === "error" && (
            <p className="feedback-error" role="alert">Couldn't send that. Check your connection, then tap Try again.</p>
          )}
          <button className="notify-btn notify-btn-primary feedback-send" onClick={handleSend} disabled={!text.trim() || sending}>
            {sending ? "Sending…" : state === "error" ? "Try again" : "Send"}
          </button>
        </>
      )}
    </section>
  );
}

function Lightbox({ src, alt, onClose }) {
  const [shown, setShown] = React.useState(null); // keeps the image visible while the overlay fades out
  React.useEffect(() => { if (src) setShown({ src, alt }); }, [src, alt]);
  React.useEffect(() => {
    if (!src) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [src]);

  return (
    <div className={`lightbox${src ? " show" : ""}`} onClick={onClose} role={src ? "dialog" : undefined} aria-modal={src ? "true" : undefined} aria-label={shown?.alt}>
      {shown && <img src={shown.src} alt={shown.alt || ""} />}
    </div>
  );
}

/* ───────────── app ───────────── */

// ---- Road to Flight N ----
// The data lives in road.json (same folder). scripts/check-road.js keeps it up
// to date on its own; this card just shows whatever is in that file.
// status: "none" (○ Not yet) | "pending" (○) | "progress" (◐ In progress / Estimated) | "done" (● per-section label:
//   Complete / Installed / Confirmed) | "complete" (shown exactly like "done")
// An entry with kind: "check" is the box's "no news yet" placeholder (dashed outline).
// An entry with trust: "unconfirmed" gets a small "Unconfirmed" tag.
// Every box is shown, the Launch date box included (it sends pushes, so it must be visible too).
const ROAD_HIDDEN = [];
const ROAD_URL = SIM ? `sim/${SIM}/road.json` : "road.json";
const ROAD_CACHE_KEY = "starship-road-cache-v1";
const ROAD_STATUS_TEXT = { none: "Not yet", pending: "Not yet", progress: "In progress", done: "Complete", complete: "Complete" }; // finished boxes use ROAD_DONE_LABEL
// finished-status label per category (box pills, Road page chips, Flight Log pills); "Complete" for an unknown box. "Done" is never shown.
const ROAD_DONE_LABEL = { cryo: "Complete", raptor: "Installed", static: "Complete", pad: "Complete", faa: "Confirmed", date: "Confirmed" };
const roadDoneLabel = (m) => ROAD_DONE_LABEL[m && m.id] || (m && m.doneText && m.doneText !== "Done" ? m.doneText : "Complete");
// old push titles / status lines stored with "Done" ("❄️ Cryo tests: Done (22 Oct)"): shown with the section's label (render time only)
const ROAD_NAME_ID = { "Cryo tests": "cryo", "Raptor engines": "raptor", "Static fires": "static", "Pad activity": "pad", "FAA licence": "faa", "Launch date": "date" };
const doneToLabel = (t) => String(t || "").replace(/\b(Cryo tests|Raptor engines|Static fires|Pad activity|FAA licence|Launch date): Done\b/g, (_, n) => `${n}: ${ROAD_DONE_LABEL[ROAD_NAME_ID[n]]}`);

// Shows the last copy we saw straight away (no flicker on reopen), then
// fetches a fresh one, skipping the browser cache, and swaps it in.
// Flight Log Road box only: scripts/cleanup.js turns a per-vehicle section into one clean card per vehicle (a pure view;
// road.json and the Road to Flight page keep every post). Cards keep _hi = the source entry index for taps.
const ONE_CARD = ["static", "cryo", "raptor"];
const logView = (m, road) => { try { return window.RoadCleanup ? window.RoadCleanup.flightLogView(m, road) : m; } catch { return m; } };
function useRoad() {
  const [road, setRoad] = React.useState(() => {
    try { const d = JSON.parse(localStorage.getItem(ROAD_CACHE_KEY)) || null; if (d && d.image_cache) IMG_CACHE = d.image_cache; return d; } catch { return null; }
  });
  React.useEffect(() => {
    let alive = true;
    fetch(`${ROAD_URL}?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data || !Array.isArray(data.categories)) return;
        IMG_CACHE = data.image_cache || {};
        setRoad(data);
        try { localStorage.setItem(ROAD_CACHE_KEY, JSON.stringify(data)); } catch {}
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  // Raptor engines box shows the custom engine image instead of its data emoji (road.json and push text keep the emoji).
  return React.useMemo(() => (road && Array.isArray(road.categories)
    ? { ...road, categories: road.categories.map((c) => (isRaptorCat(c) ? { ...c, icon: <CatIcon c={c} /> } : c)) } : road), [road]);
}

// 9 Nov: "X feed offline" chip on the Road card. Shown only while check-road's last run recorded the X read failing with
// HTTP 402 (X API credits depleted) in data/health.json; every checker run rewrites that file, so the chip goes away on its
// own once X reads succeed again (status ok, error cleared). Read-only: the app never writes health or sends anything.
const HEALTH_URL = "data/health.json";
function xFeedOffline(health) {
  const s = health && health.scripts && health.scripts["check-road"];
  return !!(s && s.status === "failed" && /X read failed: HTTP 402\b/.test(String(s.error || "")));
}
function useXFeedOffline() {
  const [off, setOff] = React.useState(false);
  React.useEffect(() => {
    if (SIM) return undefined;
    let alive = true;
    const load = () => fetch(`${HEALTH_URL}?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((h) => { if (alive) setOff(xFeedOffline(h)); }).catch(() => {});
    load();
    const t = setInterval(load, 15 * 60 * 1000);
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return off;
}

// Lifecycle/tier tags: data only, never shown in the app (Bernardo, 23 Oct). Kept for previews/tests.
function Tags({ h }) {
  const phase = h.milestone && !h.hedged, tier = h.milestone && h.tier, unc = h.trust === "unconfirmed";
  if (!phase && !tier && !unc && !h.demo) return null;
  return (<div className="mini-tags">{phase && <span className={"mini-phase ph-" + h.milestone.phase}>{PHASE_LABEL[h.milestone.phase]}</span>}
    {tier && <TierTag t={h.tier} src={srcOf(h)} rep={h.reported} hedged={h.hedged} />}{unc && <span className="mini-unc">Unconfirmed</span>}{h.demo && <span className="mini-unc">DEMO</span>}</div>);
}
// The entry's own picture in the Road card (same picture as its feed card).
// A box's headline comes from this flight's own entries: a later flight's post (B23 for Flight 16) never replaces it.
// Flight Log lines (scripts/log-text.js mirrors these): the clean log_text first, then text; never the raw post.
const logLine = (h) => (h && (h.log_text || h.text)) || ""; // the Flight Log line; card_text is for Road cards / Earlier updates
const cardT = (o) => (o && (o.card_text || o.text)) || ""; // old data without card_text falls back to text
const LOG_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// The source's own day or day range ("3–4 Sep"), never a clock time: log_date, else the entry's date with any time stripped, else the post's UK day.
function logDay(h) {
  if (!h) return "";
  if (h.log_date) return h.log_date;
  const m = String(h.date || "").replace(/\s*-\s*/g, "–").match(/^(\d{1,2}(?: [A-Z][a-z]{2})?\s*[–-]\s*)?\d{1,2} [A-Z][a-z]{2}/);
  if (m) return m[0].replace(/\s*–\s*/, "–");
  const iso = h.publishedAt || h.at;
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", timeZone: "Europe/London" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${Number(p.day)} ${LOG_MON[p.month - 1]}`;
}
// A finished vehicle box: it glows on the Flight Log, and when every vehicle's box glows the section dot fills (same rule).
const logDone = (h) => !!h && ((h.milestone && h.milestone.phase === "completed") || h.complete === true);
const ROLLUP_IDS = ["cryo", "raptor", "static"];
const logGlows = (c, h, road) => ROLLUP_IDS.includes(c.id) && !!logHw(h) && h.trust !== "unconfirmed" && !(h.flight > road.flight) && logDone(h);
const logHw = (h) => { const m = String((h.milestone && h.milestone.hardware) || h.hardware || "").match(/^\s*(?:Ship\s*|S)(\d+)|^\s*(?:Booster\s*|B)(\d+)/i); return m ? (m[1] ? "S" + m[1] : "B" + m[2]) : null; };
// Every current-flight vehicle's latest entry in the section is completed → the section is done.
function rollupStatus(c, road) {
  if (!c || !ROLLUP_IDS.includes(c.id)) return c && c.status; // per-vehicle test sections only
  const vs = roadVehicles(road).map((v) => v.toUpperCase());
  const own = (c.history || []).filter((h) => h && h.kind !== "check" && !(h.flight > road.flight) && h.trust !== "unconfirmed" && logHw(h));
  if (!vs.length || !own.length) return c.status;
  const fin = logDone;
  const last = {};
  for (const h of own) if (!last[logHw(h)]) last[logHw(h)] = h;
  return vs.every((v) => last[v] && fin(last[v])) && Object.values(last).every(fin) ? "done" : c.status;
}
function boxLatest(m, road) {
  const own = (m.history || []).filter((h) => isRealEntry(h) && !(h.flight > road.flight) && !isLaunched(h.flight) && h.trust !== "unconfirmed");
  const later = (m.history || []).some((h) => h.flight > road.flight && (h.x_text || h.text || "").slice(0, 60) === String(m.latest || "").slice(0, 60));
  if (m.log_latest && !later) return m.log_latest;
  return later ? (own[0] ? logLine(own[0]) : "Nothing reported yet") : m.log_latest || m.latest;
}

// --- road-liftoff helpers (tracker-2026-11-14-herotrim) ---
// Display-only: once this flight has a confirmed liftoff (mission_alerts.liftoff_actual
// that is due, or the hero is inflight/done), every still-open Road box renders as
// complete (N of N). Pad headline stays factual: "Stacked {d}" when a stack date is
// known, else "Pad activity complete." — never an invented WDR date. Pre-launch
// logic is unchanged. road.box_overrides[flight] wins. Checkers and road.json stay put.
function boxOverrides(road, n) {
  const raw = road && road.box_overrides;
  return (raw && (raw[n] || raw[String(n)])) || null;
}
function roadLiftedOff(road, f, now) {
  const n = road && road.flight;
  const ov = boxOverrides(road, n);
  if (ov && typeof ov.liftedOff === "boolean") return ov.liftedOff;
  const t = Number.isFinite(now) ? now : (typeof nowMs === "function" ? nowMs() : Date.now());
  if (f && Number(f.n) === Number(n)) {
    const st = (typeof effectiveStatus === "function") ? effectiveStatus(f, t) : f.status;
    if (st === "inflight" || st === "done") return true;
    if (st === "confirmed" || st === "net" || st === "tbc") return false;
  }
  const a = road && road.mission_alerts;
  const iso = a && Number(a.flight) === Number(n) && a.liftoff_actual;
  if (iso && Number.isFinite(Date.parse(iso))) return t >= Date.parse(iso);
  return false;
}
function stackedHeadline(road) {
  const dates = ((((road || {}).milestones || {}).flight || {}).stacked || {}).dates || [];
  const last = dates.map((d) => Date.parse(d)).filter(Number.isFinite).sort((a, b) => b - a)[0];
  if (Number.isFinite(last) && typeof ukParts === "function") {
    const p = ukParts(new Date(last).toISOString());
    if (p && p.day && p.mon) return `Stacked ${p.day} ${p.mon}`;
  }
  const pad = ((road && road.categories) || []).find((c) => c.id === "pad");
  for (const h of (pad && pad.history) || []) {
    const blob = [h.text, h.card_text, h.log_text].filter(Boolean).join(" ");
    const named = blob.match(/Stacked\s+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i);
    if (named) return `Stacked ${named[1]}`;
    if (/\bstacked (?:on|onto|atop)\b/i.test(blob)) {
      const d = String(h.date || h.log_date || "").match(/^(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/);
      if (d) return `Stacked ${d[1]}`;
    }
  }
  return "";
}
function roadLiftoffMs(road) {
  const a = road && road.mission_alerts;
  const iso = a && Number(a.flight) === Number(road && road.flight) && a.liftoff_actual;
  const t = iso && Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}
function roadEntryMs(h) {
  if (!h) return null;
  const iso = (typeof cardIso === "function" && cardIso(h)) || h.at || h.publishedAt || h.event_at || "";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}
// Display only: in-flight / post-liftoff flight events stay off every Road box (deploy, orbit,
// reentry, catch, splashdown, burns, or anything dated at/after liftoff_actual). Pad prep
// wording (stack, chopsticks, catch height) is kept when it is from before liftoff.
function isRoadFlightEvent(h, road) {
  if (!h) return false;
  const t0 = roadLiftoffMs(road), t = roadEntryMs(h);
  if (t0 != null && t != null && t >= t0) return true;
  const text = [h.text, h.card_text, h.body, h.log_text].filter(Boolean).join(" ");
  if (!/\b(deploy(?:ed|s|ment)?|released \d+|reached orbit|in orbit|orbital insertion|re-?entry|splashdown|splashed down|landing burn|boostback|payload bay|was caught|tower catch)\b/i.test(text)) return false;
  if (/\b(catch (?:position|height|arms)|opening for launch|stacked|chopsticks|deluge|transport stand|wet dress|QD arm|lifted to)\b/i.test(text)) return false;
  return true;
}
function afterLiftoffLatest(flog, id, road) {

  if (id === "pad") return stackedHeadline(road) || "Pad activity complete.";
  return (flog && flog.latest) || "Complete";
}
function afterLiftoffFlog(flog, id, road, f, now) {
  const ov = boxOverrides(road, road && road.flight);
  const one = ov && ov[id];
  if (one && one.status) {
    return { ...(flog || {}), status: one.status, statusText: one.statusText || ((one.status === "done" || one.status === "complete") ? "Complete" : (flog && flog.statusText)), latest: one.latest != null ? one.latest : (flog && flog.latest) };
  }
  if (!flog) return flog;
  if (!roadLiftedOff(road, f, now)) return flog;
  if (flog.status === "done" || flog.status === "complete") return flog;
  return { ...flog, status: "done", statusText: "Complete", latest: afterLiftoffLatest(flog, id, road) };
}
function rtfCategoryVehicles(cid, cols) {
  const vs = (cols || []).filter((v) => v && v !== "pad");
  // Pad activity: Launch pad first, then Ship, then Booster. Fixed order, never by date.
  if (cid === "pad") return ["pad", ...vs];
  return vs;
}
function orderPadFlogCards(cards) {
  const rank = (c) => {
    const v = String((c && c.vehicle) || "");
    if (v === "pad" || /launch pad/i.test((c && c.name) || "")) return 0;
    if (/^S/i.test(v)) return 1;
    if (/^B/i.test(v)) return 2;
    return 3;
  };
  return (cards || []).slice().sort((a, b) => rank(a) - rank(b));
}
function filterRoadFlogEvents(flog, road) {
  if (!flog || !road || typeof isRoadFlightEvent !== "function") return flog;
  let cards = (flog.cards || []).map((c) => ({
    ...c,
    lines: (c.lines || []).filter((l) => !isRoadFlightEvent(l, road)),
  })).filter((c) => (c.lines || []).length);
  if (flog.id === "pad" || (cards.some && cards.some((c) => c.vehicle === "pad" || /launch pad/i.test(c.name || "")))) cards = orderPadFlogCards(cards);
  return { ...flog, cards };
}
function decorateFlogItem(m, flog, road, heroNet, heroFlight, now) {
  let f = flog;
  if (m.id === "date" && f) f = launchDateDisplay(f, (typeof authoritativeNetLabel === "function" ? authoritativeNetLabel(road, heroNet) : ""), road, heroNet);
  else if (m.id === "pad" && f) f = flogPadDisplay(f, road);
  else if (m.id === "faa" && f) f = faaLicenceDisplay(f);
  f = afterLiftoffFlog(f, m.id, road, heroFlight, now);
  if (f) f = filterRoadFlogEvents(f, road);
  return f ? { ...m, status: f.status, flog: f } : m;
}
// --- end road-liftoff helpers ---
function RoadCard({ road, onEntryTap, openReq, heroNet, netPending, heroFlight }) {
  const [main, setMain] = React.useState(false);
  const xOff = useXFeedOffline(); // 9 Nov: "X feed offline" chip while the checker's X read gets HTTP 402
  React.useEffect(() => { if (openReq) setMain(true); }, [openReq]); // header chip asks it to open
  const [open, setOpen] = React.useState(null);
  // Flight Log boxes: completed milestones only, one sub-card per vehicle (scripts/flightlog.js, same rules every flight).
  const flogBoxes = road && window.RoadFlightLog ? window.RoadFlightLog.boxes(road, undefined, { net: heroNet || null, pending: !!netPending }) : null; // heroNet: Launch date box says "NET 13 Nov" like the hero (display only)
  const dateNet = authoritativeNetLabel(road, heroNet);
  const items = road && Array.isArray(road.categories) ? road.categories.filter((m) => !ROAD_HIDDEN.includes(m.id)).map((m) => logView(m, road)).map((m) => ({ ...m, status: rollupStatus(m, road) }))
    .map((m) => decorateFlogItem(m, flogBoxes && flogBoxes[m.id], road, heroNet, heroFlight)) : [];
  const listRef = React.useRef(null);
  if (!items.length) return null;
  const title = `Road to Flight ${road.flight}`;
  const done = items.filter((m) => m.status === "done" || m.status === "complete").length; // shown boxes only; counts ● full only (◐ half does not count)
  const label = (m) => (m.flog ? m.flog.statusText : m.status === "done" || m.status === "complete" ? roadDoneLabel(m) : ROAD_STATUS_TEXT[m.status] || m.status);
  // Equal-width status pills, pure CSS: every pill stacks ALL of this card's labels in one grid cell (others
  // invisible), so each pill's width = the widest label + the same padding + the same border. No measuring.
  const pillLabels = [...new Set(items.map(label))];
  const pill = (m) => <span className={"badge badge-" + m.status}><span className="badge-stack">{pillLabels.map((l) => <span key={l} className="badge-ghost" aria-hidden="true">{l}</span>)}<span className="badge-txt">{label(m)}</span></span></span>;
  // 13 Nov: an item opens only if its drawer would show something (Flight Log cards with a line, or a history entry this card lists).
  // Decided from the data, never from the item id or flight number. Others render as a plain div: no tap, hover, focus or aria-expanded.
  const hasDrawer = (m) => (m.flog ? (m.flog.cards || []).some((c) => c && Array.isArray(c.lines) && c.lines.length > 0)
    : (m.history || []).some((h) => isRealEntry(h) && !(h.flight > road.flight) && !isLaunched(h.flight)));
  const count = (m) => { if (m.flog || !ONE_CARD.includes(m.id) || m.status === "done" || !window.RoadCleanup) return null;
    const vp = window.RoadCleanup.vehicleProgress(m, road); return vp.total && vp.done ? `${vp.done} of ${vp.total}` : null; };
  return (
    <section className={"road" + (main ? " main-open" : "")} aria-label={title}>
      <button className="road-head" aria-expanded={main} onClick={() => { setMain(!main); setOpen(null); }}>
        <span className="road-title"><h2>{title}</h2></span>
        <span className="road-sum">
          <span className="road-dots">{items.map((m) => <i key={m.id} className={"dot dot-" + m.status} style={catVars(m.id, m.color)} title={m.name + ": " + label(m)} aria-label={m.name + ": " + label(m)} role="img" />)}</span>
          <span className="road-count">{done} of {items.length} done</span>
          {xOff && <span className="road-xoff" title="The checker cannot read X right now (X API credits). Cards from other sources still update.">X feed offline</span>}
          <svg className="road-chev" width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </button>
      <div className="road-list"><div className="road-list-inner" ref={listRef}>
      {items.map((m) => {
        const canOpen = hasDrawer(m), isOpen = canOpen && open === m.id;
        const Head = canOpen ? "button" : "div";
        const headProps = canOpen ? { className: "callout-head", tabIndex: main ? 0 : -1, "aria-expanded": isOpen, onClick: () => setOpen(isOpen ? null : m.id) } : { className: "callout-head callout-static" };
        return (
          <div key={m.id} className={"callout" + (isOpen ? " open" : "") + (canOpen ? "" : " callout-fixed")} style={catVars(m.id, m.color)} data-id={m.id}>
            <Head {...headProps}>
              <span className="callout-icon">{m.icon}</span>
              <span className="callout-body">
                <span className="callout-name">{m.name}</span>
                <span className="callout-latest">{m.flog ? scrub(m.flog.latest) : m.status === "complete" ? roadDoneLabel(m) : scrub(window.RoadCleanup ? window.RoadCleanup.shortLine(boxLatest(m, road)) : boxLatest(m, road))}</span>
              </span>
              {count(m) ? <span className="badge-wrap">{pill(m)}<span className="badge-count">{count(m)}</span></span>
                : pill(m)}
            </Head>
            {canOpen && <div className="callout-hist"><div className="callout-hist-inner">
              {m.flog ? m.flog.cards.map((c) => <FlogCard key={c.vehicle} c={c} />) : (m.history || []).map((h, i) => isRealEntry(h) && !(h.flight > road.flight) && !isLaunched(h.flight) && ( /* later flights' cards: Road page only */
                <div className={"mini" + (onEntryTap ? " tappable" : "") + (logGlows(m, h, road) ? " glow done" : "")} key={i}
                  {...(onEntryTap ? { role: "button", tabIndex: isOpen ? 0 : -1, "aria-label": `${logDay(h)}: ${logLine(h)}. Show in the updates feed`,
                    onClick: () => onEntryTap(m.id, h._hi ?? i), onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEntryTap(m.id, h._hi ?? i); } } } : {})}>
                  <div className="mini-top">
                    <span className="mini-date">{logDay(h)}</span>
                    {(srcOf(h) || !ONE_CARD.includes(m.id)) && <span className="mini-src">{srcOf(h)}</span>}
                  </div>
                  <p>{scrub(logLine(h))}</p>
                  <BuildUp h={h} log onTap={onEntryTap ? (u) => onEntryTap(m.id, u && u._hi != null ? u._hi : (h._hi ?? i)) : null} />
                </div>
              ))}
            </div></div>}
          </div>
        );
      })}
      </div></div>
    </section>
  );
}

// One vehicle's sub-card in a Flight Log box: name, then the latest line (date · time, text on the next line);
// older lines behind "Earlier updates", newest first.
const flogWhen = (l) => (l.time ? `${l.day} · ${l.time}` : l.day);
// Category icon: Raptor engines uses a custom engine image instead of its data emoji (push text keeps the emoji).
const isRaptorCat = (c) => !!c && (c.id === "raptor" || c.name === "Raptor engines");
function CatIcon({ c }) {
  return isRaptorCat(c) ? <img className="cat-img" src="icons/raptor-icon.png" alt="" aria-hidden="true" /> : (c && c.icon) || null;
}
function FlogCard({ c }) {
  const [top, ...rest] = c.lines;
  if (!top) return null;
  return (
    <div className="mini flog-card" data-vehicle={c.vehicle}>
      <div className="flog-name">{c.name}</div>
      <div className="mini-top"><span className="mini-date">{flogWhen(top)}</span></div>
      <p>{scrub(cardT(top))}</p>
      {rest.length > 0 && <details className="buildup" onClick={(e) => e.stopPropagation()}>
        <summary>Earlier updates</summary>
        <ul>{rest.map((u, i) => <li key={i} className="bu-plain"><div className="bu-top"><span className="bu-date">{flogWhen(u)}</span></div><div className="bu-text">{scrub(cardT(u))}</div></li>)}</ul>
      </details>}
    </div>
  );
}
// No "seen" dimming anywhere: every card stays full strength. The old per-device seen list is cleared.
try { localStorage.removeItem("st_seen_v1"); } catch {}
// Milestone lifecycle (road.json entry.milestone: type + flight + vehicle + phase). One entry per milestone:
// later posts update it in place; the older lines stay under it as a collapsible build-up list.
const PHASE_LABEL = { expected: "Expected", progress: "In progress", completed: "Completed" };
const TIER_LABEL = { 1: "Confirmed", 2: "Reported", 3: "Rumour" }; // Tier 3 shows only as Expected // source tier (scripts/source-tiers.js)
function TierTag({ t, src, rep, hedged }) {
  if (!t) return null;
  return <span className={"mini-tier tier-" + t}>{t === 1 && hedged ? "Expected" : TIER_LABEL[t]}{t === 2 && rep ? " " + PHASE_LABEL[rep].toLowerCase() : ""}{uiSrc(src) ? " · " + uiSrc(src) : ""}</span>;
}
// Flight Log "Earlier updates": plain day + line, no @handle chips, no links. A line backed by a post is an invisible
// tap area that opens the Road to Flight page on this card (same jump as tapping the card); other lines do nothing.
const buLinked = (u) => !!(u && ((u.url && !isYouTube(u.url)) || u.handle));
function BuildUp({ h, log, onTap }) {
  const ups = Array.isArray(h.updates) ? h.updates.filter((u) => u && u.text) : [];
  if (!ups.length) return null;
  const stop = (e) => e.stopPropagation();
  const tapProps = (u) => (log && onTap && buLinked(u) ? { className: "bu-plain bu-tap", role: "link", tabIndex: 0, "aria-label": `${logDay(u)}: ${logLine(u)}. Show in Road to Flight`,
    onClick: (e) => { e.stopPropagation(); e.preventDefault(); onTap(u); }, onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onTap(u); } } } : { className: "bu-plain" });
  return (
    <details className="buildup" onClick={stop}>
      <summary>Earlier updates</summary>
      <ul>{ups.map((u, i) => log ? <li key={i} {...tapProps(u)}><div className="bu-top"><span className="bu-date">{logDay(u)}</span></div><div className="bu-text">{scrub(logLine(u))}</div></li>
        : <li key={i}><div className="bu-top"><span className="bu-date">{entryDate(u)}</span></div>
        <div className="bu-text">{u.url ? <a href={u.url} target="_blank" rel="noopener noreferrer" onClick={stop}>{scrub(cardT(u))}</a> : scrub(cardT(u))}</div></li>)}</ul>
    </details>
  );
}
// Photo source badge: the photo's own X account avatar (icons/avatars/, scripts/avatars.js), bottom-right of the photo.
// Badges the PHOTO's source (media author), not the text's. Tapping it opens the post the photo came from.
// No saved avatar -> a neutral circle with the initial. Own/placeholder pictures get no badge.
// Hotlinked pbs.twimg pictures: local copies (road.json image_cache, filled by the self-check). The picked image is unchanged.
let IMG_CACHE = {};
const localImg = (u) => (u && IMG_CACHE[u]) || u;
// A broken picture never shows as a broken icon: cached copy → original → placeholder picture → hidden.
const imgFallback = (orig, giveUp) => (e) => { const el = e.currentTarget, tried = (el.dataset.fb || "").split("|");
  const next = [orig, RTF_PLACEHOLDER].find((u) => u && !tried.includes(u) && !el.src.endsWith(u));
  if (next) { el.dataset.fb = [...tried, el.getAttribute("src")].join("|"); el.src = next; } else if (giveUp) giveUp(); };
let AVATARS = null; const avatarSubs = new Set();
fetch("icons/avatars/index.json").then((r) => r.json()).then((j) => { AVATARS = (j && j.avatars) || {}; avatarSubs.forEach((f) => f(AVATARS)); }).catch(() => { AVATARS = {}; avatarSubs.forEach((f) => f(AVATARS)); });
const badgeHandleOf = (author, url) => String(author || (String(url || "").match(/x\.com\/([A-Za-z0-9_]{1,15})\/status\//) || [])[1] || "").replace(/^@/, "");
const NO_BADGE_IMAGES = () => [SHIP_CRYO_IMAGE, RTF_PLACEHOLDER];
function SrcBadge({ author, url, image, keep }) {
  const [av, setAv] = React.useState(AVATARS);
  const [bad, setBad] = React.useState(false);
  React.useEffect(() => { if (AVATARS) return; avatarSubs.add(setAv); return () => avatarSubs.delete(setAv); }, []);
  const h = badgeHandleOf(author, url);
  if (!h || (image && NO_BADGE_IMAGES().includes(image) && !keep)) return null;
  const rec = av && av[h.toLowerCase()];
  return (
    <a className="src-badge" href={url || `https://x.com/${h}`} target="_blank" rel="noopener noreferrer" title={`@${h} on X`} aria-label={`Photo by @${h}: open the post on X`} onClick={(e) => e.stopPropagation()}>
      {rec && !bad ? <img src={rec.file} alt="" loading="lazy" onError={() => setBad(true)} /> : <span aria-hidden="true">{h[0].toUpperCase()}</span>}
    </a>
  );
}
// Context picture for a milestone that hasn't happened yet: an earlier trusted post's photo of the same hardware.
function ContextMedia({ mc }) {
  const [bad, setBad] = React.useState(false);
  if (bad || !mc || !mc.image) return null;
  return (
    <div className="xm xm-context">
      <div className="xm-grid n1"><a href={mc.post_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
        <img src={localImg(mc.image)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={imgFallback(mc.image, () => setBad(true))} /></a>
        <SrcBadge author={mc.author} url={mc.post_url} image={mc.image} keep={!!mc.keep_image} /></div>
      <div className="xm-foot">
        <a href={mc.post_url} target="_blank" rel="noopener noreferrer" aria-label="View on X" onClick={(e) => e.stopPropagation()}>View on X {LINK_ICON}</a></div>
    </div>
  );
}
const isRealEntry = (h) => h && h.kind !== "check"; // "no news yet" lines aren't shown any more
// Small "Road to Flight N ›" link next to the header title. Tapping it glides to
// the Road box inside the next-flight card and opens it.
const CHIP_CHEVRON = <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
function RoadChip({ road, onOpen }) {
  if (!road || !road.flight || !Array.isArray(road.categories)) return null;
  return (
    <button className="road-chip" onClick={onOpen} aria-label={`Road to Flight ${road.flight}: open`}>
      {`Road to Flight ${road.flight}`}{CHIP_CHEVRON}
    </button>
  );
}
// Smooth, fixed-length page glide (≈450 ms ease-in-out), same feel everywhere.
function glideTo(top, ms = 450) {
  const from = window.scrollY, dist = top - from;
  if (reduceMotion() || Math.abs(dist) < 2) { window.scrollTo(0, top); return; }
  const t0 = performance.now(), ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const step = (now) => { const t = Math.min(1, (now - t0) / ms); window.scrollTo(0, from + dist * ease(t)); if (t < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---- Updates feed ----
// Every Road entry from road.json as one newest-first list. Phone: a panel you
// swipe in from the right (swipe left to open, right to go back, or use the
// button top right). Desktop (900px+): always shown as a right-hand column.
// Tapping an entry in the Road card jumps to its post here and highlights it.
// Same data rules as the Road card (every box, Launch date included). Starship news and other
// pushes with no Road box (road.json "feed_items") are posts here too, same text as the push;
// "no news yet" checks (kind: "check") show as dashed placeholders.
const FEED_WIDE_QUERY = "(min-width: 900px)";
const FEED_SLIDE_MS = 400;
const FEED_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FEED_ICON = <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.75" cy="5" r="1.1" fill="currentColor" /><circle cx="3.75" cy="11" r="1.1" fill="currentColor" /><path d="M7 5h6M7 11h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
const BACK_ICON = <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const LINK_ICON = <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M8.5 2.5h3v3M11.5 2.5 6.5 7.5M10.5 8.5v2.25c0 .41-.34.75-.75.75h-6.5a.75.75 0 0 1-.75-.75v-6.5c0-.41.34-.75.75-.75H5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function useMedia(query) {
  const [match, setMatch] = React.useState(() => window.matchMedia(query).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

// "9–10 Sep" / "30 Sep–2 Oct" -> the LAST day of the range (UTC midnight), in the road's year.
// An entry dated well after the road's update must be from the previous year (Dec vs Jan).
function feedDay(str, updatedAt) {
  const all = [...String(str || "").matchAll(/(\d{1,2})\s+([A-Za-z]{3})/g)];
  const last = all[all.length - 1];
  if (!last) return 0;
  const mon = FEED_MONTHS.indexOf(last[2][0].toUpperCase() + last[2].slice(1, 3).toLowerCase());
  if (mon < 0) return 0;
  const ref = Number.isFinite(Date.parse(updatedAt)) ? new Date(updatedAt) : new Date();
  let d = Date.UTC(ref.getUTCFullYear(), mon, Number(last[1]));
  if (d > ref.getTime() + 7 * DAY) d = Date.UTC(ref.getUTCFullYear() - 1, mon, Number(last[1]));
  return d;
}
function londonDayUTC(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
}

// The source's real publish time in UK time ("14:32"), only when road.json has one.
function feedTime(iso) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

// Which flight a card belongs to: the entry's own "flight" tag; else Road vehicles → the next flight; a flown vehicle → its flight;
// else "Flight N" in the text; else the next flight.
function flightOf(h, road) {
  const hwMap = road.hardware_flights || {}, hk = String(h.hardware || "").toUpperCase().replace(/^SHIP\s*/, "S").replace(/^BOOSTER\s*/, "B");
  if (Number.isInteger(hwMap[hk])) return hwMap[hk]; // one hardware → flight map from the data (guards.js): B23/S43 → 16
  if (Number.isInteger(h.flight)) return h.flight; // data-driven: the entry says which flight it belongs to
  const txt = `${(h.x_post && h.x_post.text) || ""} ${h.x_text || h.text || ""}`; // the post first: the old entry text may mention past flights
  const vs = [...txt.matchAll(/\b(Ship|Booster|S|B)[\s-]?(\d{1,3})\b/g)].map((m) => (m[1][0].toUpperCase() === "S" ? "S" : "B") + Number(m[2]));
  if (vs.some((v) => (road.vehicles || []).includes(v))) return road.flight;
  for (const v of vs) if (Number.isInteger(hwMap[v])) return hwMap[v];
  for (const v of vs) { const f = [...FLIGHTS].reverse().find((x) => x.booster === v || x.ship === v); if (f) return f.n; }
  const m = txt.match(/\bFlight\s+(\d{1,3})\b/i);
  return m ? Number(m[1]) : road.flight;
}
// When a card happened, for sorting: the linked X post's time (picked post id snowflake, else the
// stored post), else the entry's time, else its date (last day of a range).
const snowflakeMs = (id) => { try { return Number((BigInt(id) >> 22n) + 1288834974657n); } catch { return 0; } };
function cardTime(h, road) {
  const pid = h.media_override && (h.media_override.post_id || (String(h.media_override.post_url || "").match(/status\/(\d+)/) || [])[1]);
  return (pid && snowflakeMs(pid)) || Date.parse((h.x_post && h.x_post.created_at) || "") || Date.parse(h.at || "") || feedDay(h.date, road.updatedAt) || 0;
}
// A launched flight's milestone summary (shown in its Flight Log card behind the "Road to Flight N"
// pill): road.archive[n].summary.items, one small box per vehicle per category (written by hand for
// Flight 14, frozen by the checker when later flights launch). The internal sources list is never shown.
const PAST_LABEL = { cryo: "Cryo", raptor: "Raptor", static: "Static fire", pad: "Pad", faa: "FAA licence", date: "Launch date" };
// Shorter pill wording when the title row is too narrow for the vehicle name + full pill (one fixed-height row).
const PAST_LABEL_SHORT = { static: "Static", faa: "FAA" };
// Past boxes are a fixed size (title row + 2 text lines); the TEXT is summarised to fit. Each box type has
// wording tiers (full → short → shortest); the card shows the first tier that fits in 2 lines at the current
// width (PastText measures it in the browser). Tiers only reword facts already in the text: every step is a
// rewrite of the previous one (drop the vehicle name already shown in the title, abbreviate, use digits);
// a date never changes and nothing is added. Keyed on box type, never on the flight number. Pad and Licence
// build their own tiers from their real dates (pastPadCard / pastLicenceCard). Unknown types: full text only.
const PAST_NUM = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };
const PAST_TIER_COMMON = [[/^(?:was |has |have |is )/i, ""]]; // after the vehicle name is dropped (it is already in the title row)
const PAST_TIER_RULES = {
  cryo: [
    [[/^At least (\d+)/i, "$1+"], [/\blast confirmed\b/i, "last"], [/\bthen its (first|second|third|fourth)\b/i, "then a $1"]],
    [[/ cryo (?:proof )?tests?\b/i, (m) => / tests$/.test(m) ? " cryo tests" : " cryo test"], [/\b(one|two|three|four|five|six)\b/gi, (m) => PAST_NUM[m.toLowerCase()]],
      [/\bthen a third\b/i, "then a 3rd"], [/\bthen a second\b/i, "then a 2nd"], [/^(\d+\+) cryo tests · last/i, "$1 cryo · last"],
      [/^completed its first (full )?cryo test\.?$/i, "First $1cryo test done."], [/^completed (?=\d)/i, ""]],
  ],
  raptor: [
    [[/^Engines installed by\b/i, "Engines in by"]],
    [[/^Engines in by\b/i, "Engines by"], [/^ready with all (\d+) Raptors\.?$/i, "All $1 Raptors ready."]],
  ],
  static: [
    [[/(\d{1,2}) and (\d{1,2}) ([A-Z][a-z]{2})\b/, "$1, $2 $3"]],
    [[/^(\d+) static fires? ·/i, (m, k) => `${k} ${k === "1" ? "fire" : "fires"} ·`], [/\b(one|two|three|four|five|six)\b/gi, (m) => PAST_NUM[m.toLowerCase()]], [/^completed an? (?=full|short|\d)/i, ""], [/ on (?:Pad|OLM|Massey's)[^.]*(?=\.?$)/i, ""]],
  ],
};
const pastCap = (t) => t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
function pastTiers(box, text, vehicle) {
  const full = String(text || "").trim(), steps = PAST_TIER_RULES[box];
  if (!steps || !full) return [full];
  const out = [full];
  const veh = vehicle ? new RegExp("^" + String(vehicle).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+", "i") : null;
  let cur = full;
  steps.forEach((rules, k) => {
    if (k === 0 && veh && veh.test(cur)) { cur = cur.replace(veh, ""); for (const [re, to] of PAST_TIER_COMMON) cur = cur.replace(re, to); }
    for (const [re, to] of rules) cur = cur.replace(re, to);
    cur = pastCap(cur.replace(/\s{2,}/g, " ").trim());
    if (cur && cur !== out[out.length - 1]) out.push(cur);
  });
  return out.slice(0, 3);
}
// Category CSS vars. Raptor engines is near-black #0E0F11 (option A2): ring and fill identical, light rims and a graphite halo keep it visible on navy.
const CAT_FILL = { raptor: { "--bg": "#0E0F11", "--on": "#E8EAEE", "--t": "#0E0F11" } }; // Raptor (A2): near-black #0E0F11 ring, fill, accent and connector; white title, see-through pill (CSS below)
const catVars = (id, c) => Object.assign({ "--c": c }, CAT_FILL[id] || {});
const PAST_COLOR = { cryo: "#BFE6FF", raptor: "#0E0F11", static: "#FF9A3D", pad: "#A88BFF", faa: "#2FD3B0", date: "#FFC93D" };
const PAST_DAY = /(\d{1,2}\s+[A-Z][a-z]{2})/;
const pastDay = (s) => { const m = String(s || "").match(PAST_DAY); return m ? m[1] : ""; };
// Dates and lines for the Full stack / Licence cards: archive items, archive entries, and
// any still-present history for that flight. Never invent a date; never key on the flight number.
function pastFlightSources(road, n, box) {
  const a = road && road.archive && road.archive[n];
  const items = ((a && a.summary && a.summary.items) || []).filter((e) => e && (!box || e.box === box));
  const entries = ((a && a.entries) || []).filter((e) => e && (!box || e.box === box));
  const hist = ((road && road.categories) || []).flatMap((c) => (!box || c.id === box) ? (c.history || []).map((h) => ({ ...h, box: c.id })) : []).filter((h) => !h.flight || h.flight === n);
  return items.concat(entries, hist);
}
function pastDateInText(text, re) {
  const m = String(text || "").match(re);
  return m && m[1] && PAST_DAY.test(m[1]) ? pastDay(m[1]) : "";
}
function pastDateInSources(sources, textRe, dateRe) {
  for (const e of sources) {
    const blob = [e && e.text, e && e.log_text, e && e.card_text].filter(Boolean).join(" · ");
    const fromText = dateRe && pastDateInText(blob, dateRe);
    if (fromText) return fromText;
    if (textRe && textRe.test(blob)) {
      const d = pastDay(e.date || e.log_date || "");
      if (d) return d;
    }
  }
  return "";
}
function pastPadCard(padItems, sources) {
  const src = (sources && sources.length ? sources : padItems) || [];
  // Also split hand-written "A · B" lines so each half can carry its own date (Flight 14 style).
  const halves = [];
  for (const e of src) for (const part of String((e && e.text) || "").split(/\s*·\s*/)) if (part) halves.push({ text: part, date: e.date || e.log_date });
  const all = src.concat(halves);
  const stack = pastDateInSources(all, /\bstacked (?:on|onto|atop)\b/i, /Stacked\s+(\d{1,2}\s+[A-Z][a-z]{2})/i);
  const wdr = pastDateInSources(all, /\b(?:wet dress(?: rehearsal)?|\bWDR\b)/i, /wet dress rehearsal\s+(\d{1,2}\s+[A-Z][a-z]{2})/i);
  // One line, no break: "Stacked {d} · Wet dress {d}" → "Stacked {d} · WDR {d}" → "Stacked {dd} · WDR {d}" (same month only).
  const sameMon = stack && wdr && stack.split(" ")[1] === wdr.split(" ")[1];
  const tiers = stack && wdr ? ["Stacked " + stack + " · Wet dress " + wdr, "Stacked " + stack + " · WDR " + wdr, ...(sameMon ? ["Stacked " + stack.split(" ")[0] + " · WDR " + wdr] : [])]
    : stack ? ["Stacked " + stack] : wdr ? ["Wet dress rehearsal " + wdr, "Wet dress " + wdr, "WDR " + wdr] : ["Not yet stacked"];
  const text = tiers[0];
  const photo = (padItems || []).map((e) => e.photo).find((p) => p && p.image) || src.map((e) => e.photo).find((p) => p && p.image) || null;
  if (!padItems.length && !stack && !wdr) return null;
  return { box: "pad", vehicle: "Full stack", text, tiers, ...(photo ? { photo } : {}) };
}
function pastLicenceIssued(sources) {
  for (const e of sources) {
    const blob = [e && e.text, e && e.log_text, e && e.card_text].filter(Boolean).join(" ");
    // A licence issued for another flight, or an explicit "not yet / needs a modification", is not a date for this card.
    if (/needs a licence|licence modification|covers Flight|for Flight \d+ only|no .+licence yet|not yet issued|licence pending/i.test(blob)) continue;
    const named = pastDateInText(blob, /Launch licence issued\s+(\d{1,2}\s+[A-Z][a-z]{2})/i);
    if (named) return named;
    if (/\blicence was issued\b/i.test(blob)) {
      const d = pastDay(e.date || e.log_date || "") || pastDateInText(blob, PAST_DAY);
      if (d) return d;
    }
  }
  return "";
}
function pastLicenceCard(faaItems, sources) {
  const src = (sources && sources.length ? sources : faaItems) || [];
  const date = pastLicenceIssued(src);
  const photo = (faaItems || []).map((e) => e.photo).find((p) => p && p.image) || src.map((e) => e.photo).find((p) => p && p.image) || null;
  const tiers = date ? ["Launch licence issued " + date, "Licence issued " + date, "Issued " + date] : ["Licence pending"];
  return { box: "faa", vehicle: "Licence", text: tiers[0], tiers, ...(photo ? { photo } : {}) };
}
function pastSummary(road, n) {
  if (!road || !Array.isArray(road.categories)) return [];
  const a = road.archive && road.archive[n], items = (a && a.summary && a.summary.items) || [];
  const color = (id) => (road.categories.find((c) => c.id === id) || {}).color || PAST_COLOR[id] || "#AAB6D6";
  // Display rule for every flight (by box id / type, never by flight number): rows 1–3 are
  // per-vehicle Cryo, Raptor and Static fire; row 4 is one combined Pad card (Full stack) and
  // one Licence card. Launch date is hidden (already in the card details). The frozen archive
  // is left as it is. Pad text is one line, "Stacked {date} · Wet dress {date}", built from
  // real events; a missing half is dropped. Licence is "Launch licence
  // issued {date}", or "Licence pending" when there is no issue date for this flight.
  const raw = items.filter((e) => e && e.text && e.vehicle && e.box !== "date");
  if (!raw.length) return []; // no invented past section when the archive has nothing for this flight
  const row = [...raw.filter((e) => e.box !== "pad" && e.box !== "faa"), pastPadCard(raw.filter((e) => e.box === "pad"), pastFlightSources(road, n, "pad")), pastLicenceCard(raw.filter((e) => e.box === "faa"), pastFlightSources(road, n, "faa"))].filter(Boolean);
  return row.map((e) => ({ box: e.box, vehicle: e.vehicle, text: e.text, tiers: e.tiers || pastTiers(e.box, e.text, e.vehicle), label: PAST_LABEL[e.box] || e.box, labels: [PAST_LABEL[e.box] || e.box, ...(PAST_LABEL_SHORT[e.box] ? [PAST_LABEL_SHORT[e.box]] : [])], color: color(e.box), photo: e.photo && e.photo.image ? e.photo : null }));
}
// --- past-road helpers (tested by tests/test-past-road.js) ---
// Road to Flight N groups for flights that already flew (Page 2, above the current flight). One system for every
// past flight: road.archive[n].summary (frozen by check-road.js archiveLaunched, carried by rollover/handover; the
// checkers never drop it) fed through pastSummary, plus a Launch date card from the flight's own logged liftoff
// (FLIGHTS). Liftoff closes every box, so every category is done. No date is invented: summary cards carry none.
const PAST_ROAD_ORDER = ["cryo", "raptor", "static", "pad", "faa", "date"];
const padFirst = (v) => (/launch pad|full stack/i.test(String(v || "")) ? 0 : 1);
function pastRoadFlights(road, flights, skip) {
  if (!road || !road.archive || !Number.isInteger(road.flight)) return [];
  return Object.keys(road.archive).filter((k) => /^\d+$/.test(k)).map(Number)
    .filter((n) => n < road.flight && !(skip && skip.includes(n)) && (flights || []).some((f) => f.n === n && f.date) && pastSummary(road, n).length > 0)
    .sort((a, b) => a - b); // oldest on top, then the current flight's group below
}
function pastRoadGroup(road, n, flights, hidden) {
  const f = (flights || []).find((x) => x.n === n) || {};
  const cats = ((road && road.categories) || []).filter((m) => !(hidden || []).includes(m.id));
  const items = cats.map((m) => ({ id: m.id, name: m.name, color: m.color || PAST_COLOR[m.id], status: "done" }));
  const cat = (id) => cats.find((m) => m.id === id) || { id, name: PAST_LABEL[id] || id, color: PAST_COLOR[id] };
  const rank = (id) => { const i = PAST_ROAD_ORDER.indexOf(id); return i < 0 ? 99 : i; };
  const sum = pastSummary(road, n).map((e, i) => ({ ...e, i })).sort((a, b) => rank(a.box) - rank(b.box) || (a.box === "pad" ? padFirst(a.vehicle) - padFirst(b.vehicle) : 0) || a.i - b.i);
  const cards = sum.filter((e) => cats.some((m) => m.id === e.box)).map((e, i) => ({ id: `past-${n}-${e.box}-${i}`, box: e.box, cat: cat(e.box), vehicle: e.vehicle, text: e.text, iso: null }));
  if (f.date && cats.some((m) => m.id === "date")) cards.push({ id: `past-${n}-date`, box: "date", cat: cat("date"), vehicle: null, text: `Flight ${n} lifted off${f.pad ? ` from ${f.pad}` : ""}.`, iso: f.date });
  return { flight: n, items, cards };
}
// --- end past-road helpers ---
// --- mission-card helpers (tested by scripts/test-missioncard.js) ---
// Hand-written Next-flight card copy (road.json mission_card[n]). Checkers never read or write this field.
// {NET} is filled from the hero's Launch Library date (day + full month, e.g. "13 November").
// If that date is unavailable, use the last NET already stored in road.json's Launch date line —
// the same lastKnownNet parse as the 9 Nov date-pending fix — expanded to a full month name.
// Never show a source or a stacked second date.
function missionCardText(road, n) {
  const raw = road && road.mission_card && typeof (road.mission_card[n] ?? road.mission_card[String(n)]) === "string"
    ? (road.mission_card[n] ?? road.mission_card[String(n)]) : "";
  return raw.trim();
}
function lastKnownNetDay(road, n) {
  const MON = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", May: "May", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December" };
  const c = ((road && road.categories) || []).find((x) => x.id === "date") || {};
  for (const s of [c.log_latest, c.latest]) {
    const m = /\bNET (\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))[a-z]*\b/.exec(String(s || "")), f = /\bFlight (\d+)\b/.exec(String(s || ""));
    if (m && (!f || Number(f[1]) === Number(n))) {
      const [day, mon] = m[1].split(" ");
      return `${day} ${MON[mon] || mon}`;
    }
  }
  return "";
}
function heroNetIso(f) {
  if (!f || !f.date || !Number.isFinite(Date.parse(f.date))) return null;
  const p = f.netPrecision || "";
  if (p && /^(WK|M|Q[1-4]|H[12]|Y|FY|DEC)$/.test(p)) return null;
  if (!p) {
    const d = new Date(f.date), next = new Date(d.getTime() + 86400000);
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && next.getUTCDate() === 1) return null;
  }
  return f.date;
}
function missionCardNet(f, road) {
  const iso = heroNetIso(f);
  if (iso) return fmt(iso, { day: "numeric", month: "long" });
  return lastKnownNetDay(road, f && f.n);
}
function fillMissionCard(text, f, road) {
  const net = missionCardNet(f, road);
  return String(text).replace(/\{NET\}/g, net || "to be confirmed");
}
function showMissionCard(road, n, f, now) {
  if (!missionCardText(road, n)) return false;
  if (road && road.launched && Number(road.launched.flight) === Number(n)) return false;
  if (f && Number(f.n) === Number(n)) {
    const st = (typeof effectiveStatus === "function") ? effectiveStatus(f, now) : f.status;
    if (st === "inflight" || st === "done") return false;
  }
  return true;
}
// --- end mission-card helpers ---
// Mission updates for the upcoming flight (road.json "mission_updates", written by the checker
// from X posts about the mission itself: catch plans, objectives, payload…). Text lines only.
// The text never repeats the credited name: "Elon Musk says X (Elon Musk, 22 Oct)." → "X (Elon Musk, 22 Oct)."
function noCreditRepeat(line) {
  const m = String(line).match(/^(.+?)(?:'s)?\s+(?:says|said|confirms|confirmed|announces|announced|reports|reported)(?:\s+that)?[:,]?\s+(.+)\s\(([^,()]+)(,[^()]*)?\)\.?$/i);
  if (!m) return line;
  const who = m[1].trim().toLowerCase(), cred = m[3].trim().toLowerCase();
  if (!(cred === who || cred.includes(who) || who.endsWith(" " + cred.split(/\s+/)[0]) || who.split(/\s+/).pop() === cred.split(/\s+/).pop())) return line;
  return `${m[2].charAt(0).toUpperCase() + m[2].slice(1).replace(/[.\s]+$/, "")} (${m[3]}${m[4] || ""}).`;
}
function missionLines(road, n) {
  const list = road && road.mission_updates && road.mission_updates[n];
  const rej = ((road && road.rejected_lines) || []).filter((r) => r && r.box === "mission");
  return Array.isArray(list) ? list.filter((u) => u && typeof u.line === "string" && u.line && !rej.some((r) => r.post_id === u.post_id))
    .map((u) => ({ ...u, line: noCreditRepeat(u.line) })).slice(0, 5) : [];
}
// --- hero-lines helpers (tracker-2026-11-14-herotrim / herowording / herostyleA) ---
// Display-only: the hero shows one flowing paragraph built from structured
// outcome items (stage, kind, clause). Booster and ship templates compose the
// sentence; a live flight stays in present tense and ends with the ship's
// pending clause. A confirmed ship result switches to past tense and replaces
// any pending override for that stage. Pre-launch and empty outcomes render
// nothing. Manual road.hero_lines overrides win. Checkers and road.json write
// paths are not touched here.
const HERO_MON = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
const HERO_NUM_ONES = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
const HERO_NUM_TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
function stripHeroCredit(line) {
  let t = String(line || "").trim();
  if (typeof scrub === "function") t = scrub(t);
  t = t.replace(new RegExp("\\s*\\((?:[^()]{0,120},\\s*)?\\d{1,2}\\s+(?:" + HERO_MON + ")\\)\\.?\\s*$", "i"), "");
  t = t.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
  if (t) t = t.replace(/[.]+$/, "") + ".";
  return t;
}
function cleanHeroNote(note) {
  let t = String(note || "");
  t = t.replace(/\s*\(\s*a group of Starlink satellites known as Starlink Group\s+\d+-\d+\s*\)/gi, "");
  t = typeof scrub === "function" ? scrub(t) : t;
  t = t.replace(/\s{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
  return t;
}
function wordsToNumber(s) {
  const t = String(s || "").toLowerCase().replace(/-/g, " ").trim();
  if (!t) return null;
  const parts = t.split(/\s+/);
  if (parts.length === 1) {
    const i = HERO_NUM_ONES.indexOf(parts[0]); if (i >= 0) return i;
    const ten = HERO_NUM_TENS.indexOf(parts[0]); if (ten >= 2) return ten * 10;
    return null;
  }
  if (parts.length === 2) {
    const ten = HERO_NUM_TENS.indexOf(parts[0]), one = HERO_NUM_ONES.indexOf(parts[1]);
    if (ten >= 2 && one >= 1 && one <= 9) return ten * 10 + one;
  }
  return null;
}
function replaceNumberWords(s) {
  return String(s || "").replace(/\b(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\s](?:one|two|three|four|five|six|seven|eight|nine))?\b|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/gi, (m) => {
    const n = wordsToNumber(m);
    return n == null ? m : String(n);
  });
}
function releasedToDeployed(s) {
  return String(s || "").replace(/\breleas(e|ed|es|ing)\b/gi, (m, x) => ({ e: "deploy", ed: "deployed", es: "deploys", ing: "deploying" }[x.toLowerCase()] || m));
}
function isDroppedHeroLine(text) {
  const t = String(text || "");
  if (/\baims to\b/i.test(t)) return true;
  if (/\bpassed\b[\s\S]{0,80}\bpoint\b/i.test(t)) return true;
  if (/\bexplained why\b/i.test(t)) return true;
  if (/\bshares the mission profile\b/i.test(t)) return true;
  return false;
}
function isPendingAttempt(text) {
  const t = String(text || "");
  if (/\b(aborted|failed|cancelled|called off|was not|were not|did not|didn't|diverted|instead of)\b/i.test(t) && /\b(attempt|catch|landing|recover)\b/i.test(t)) return false;
  return /\b((?:still\s+)?plans? to|will (?:try to |attempt )|to attempt|targeting (?:a |the )?(?:double )?catch|ahead of planned|planned catch|attempt(?:ing)? (?:a |the )?(?:soft landing|tower catch|catch|landing|return)|returning to the (?:launch site )?towers?)\b/i.test(t);
}
function isStageResult(text) {
  const t = String(text || "");
  if (isPendingAttempt(t)) return false;
  return /\b(splashdown|splashed down|was caught|successfully caught|catch (?:was )?successful|tower catch (?:was )?complete|(?:was |is )lost|lost during|failed to (?:catch|land)|aborted|not recovered|performed landing burn|destroyed|exploded|diverted to|ditched|broke apart|didn't attempt|did not attempt)\b/i.test(t);
}
function isPayloadDeploy(text) {
  const t = String(text || "");
  return /\b(deploy(?:ed|s|ment)?|releas(?:e|ed|es|ing))\b/i.test(t) && /\b(satellite|starlink|simulator|payload)\b/i.test(t);
}
function isNonStageResult(text) {
  const t = String(text || "");
  if (isPendingAttempt(t) || isStageResult(t) || isDroppedHeroLine(t)) return false;
  if (isPayloadDeploy(t)) return true;
  return /\b(in orbit|reached orbit|orbital insertion|completed its \d+|surpassed|sets record|record for|longest .{0,40}flight|payload bay door)\b/i.test(t);
}
function heroLineStage(text) {
  const t = String(text || "");
  const boost = /\b(booster(?:\s+\d+)?|super heavy|B\d{2})\b/i.test(t);
  const shipVeh = /\b(ship\s+\d+|S\d{2})\b/i.test(t) || (/\bstarship\b/i.test(t) && !/\bstarship flight\s+\d+\b/i.test(t) && !/\bstarship flight time\b/i.test(t));
  if (boost && !shipVeh) return "booster";
  if (shipVeh && !boost) return "ship";
  if (boost) return "booster";
  return null;
}
function heroLineKind(text) {
  if (isDroppedHeroLine(text)) return "drop";
  if (isPendingAttempt(text)) return "pending";
  if (isStageResult(text)) return "result";
  if (isNonStageResult(text)) return "other";
  return "drop";
}
function heroVehicleName(text, road) {
  const t = String(text || "");
  const sm = t.match(/\bShip\s+(\d+)\b/i) || t.match(/\bS(\d{2,3})\b/);
  if (sm) return "Ship " + sm[1];
  const bm = t.match(/\bBooster\s+(\d+)\b/i) || t.match(/\bB(\d{2,3})\b/);
  if (bm) return "Booster " + bm[1];
  const vs = (road && road.vehicles) || [];
  if (/\bsuper heavy\b/i.test(t)) {
    const b = vs.find((v) => /^B/i.test(v));
    return b ? "Booster " + String(b).slice(1) : "Booster";
  }
  if (/\bstarship\b/i.test(t) && !/\bstarship flight\s+\d+\b/i.test(t)) {
    const s = vs.find((v) => /^S/i.test(v));
    if (s) return "Ship " + String(s).slice(1);
  }
  return "";
}
function heroPayloadPhrase(s) {
  let p = String(s || "").replace(/\s+and\s+(closed|then|afterwards)\b.*$/i, "").replace(/[.\s]+$/, "").trim();
  p = p.replace(/\bV3 Starlink\b/g, "Starlink V3");
  return p;
}
function normalizeHeroLine(text, road) {
  const kind = heroLineKind(text);
  let raw = replaceNumberWords(stripHeroCredit(text));
  if (isPayloadDeploy(text) || isPayloadDeploy(raw)) raw = releasedToDeployed(raw);
  raw = raw.replace(/\bV3 Starlink\b/g, "Starlink V3");
  const veh = heroVehicleName(text, road) || heroVehicleName(raw, road);
  const flight = road && road.flight ? `Flight ${road.flight}` : "Flight";
  if (kind === "pending") return veh ? `SpaceX still plans to attempt the ${veh} tower catch.` : "SpaceX still plans to attempt the tower catch.";
  if (kind === "result") {
    if (/\b(was caught|successfully caught|catch (?:was )?successful|tower catch (?:was )?complete)\b/i.test(raw)) return `${veh || "The vehicle"} was caught.`;
    if (/\b(was lost|is lost|lost during|destroyed|exploded)\b/i.test(raw)) return `${veh || "The vehicle"} was lost.`;
    if (/\b(splashdown|splashed down|diverted to|didn't attempt|did not attempt|aborted|instead of|performed landing burn)\b/i.test(raw)) {
      if (/\b(diverted|instead of|didn't attempt|did not attempt|aborted|GNC|Gulf|not (?:try|attempt))\b/i.test(raw)) return `${veh || "The booster"} skipped the tower catch and splashed down in the Gulf.`;
      return `${veh || "The vehicle"} splashed down.`;
    }
  }
  const rec = /\b(sets? record|record for|longest .{0,40}flight|surpassed .{0,60}(duration|record|time|mission))\b/i.test(raw);
  const dep = raw.match(/\bdeploy(?:ed)?\s+(\d+)\s+(.+)$/i);
  const orb = /\b(reached orbit|orbital insertion|into (?:stable )?(?:low earth )?orbit|to orbit)\b/i.test(raw) && !rec;
  if (dep) {
    const payload = heroPayloadPhrase(dep[2]);
    if (orb && veh) return `${veh} reached orbit and deployed ${dep[1]} ${payload}.`;
    if (veh) return `${veh} deployed ${dep[1]} ${payload}.`;
  }
  if (rec) return `${veh || flight} set a new record for the longest Starship flight.`;
  if (orb || (kind === "other" && /\bin orbit\b/i.test(raw) && !isPendingAttempt(text))) return `${veh || "The ship"} reached orbit.`;
  return raw;
}
function mergeOrbitDeploy(lines) {
  const list = (lines || []).slice();
  const orbOf = {}, depOf = {};
  list.forEach((l, i) => {
    const o = l.match(/^(Ship \d+) reached orbit\.$/);
    const d = l.match(/^(Ship \d+) deployed (\d+) (.+)\.$/);
    if (o) orbOf[o[1]] = i;
    if (d) depOf[d[1]] = { i, n: d[2], payload: d[3] };
  });
  const drop = new Set();
  for (const veh of Object.keys(depOf)) if (orbOf[veh] != null) {
    const d = depOf[veh];
    list[orbOf[veh]] = `${veh} reached orbit and deployed ${d.n} ${d.payload}.`;
    drop.add(d.i);
  }
  return list.filter((_, i) => !drop.has(i));
}
function heroSourceLines(road, n) {
  const rej = ((road && road.rejected_lines) || []).filter((r) => r && r.box === "mission");
  const out = [];
  const mu = (road && road.mission_updates && (road.mission_updates[n] || road.mission_updates[String(n)])) || [];
  for (const u of Array.isArray(mu) ? mu : []) {
    if (!u || typeof u.line !== "string" || !u.line) continue;
    if (rej.some((r) => r.post_id === u.post_id)) continue;
    out.push({ line: typeof noCreditRepeat === "function" ? noCreditRepeat(u.line) : u.line, at: u.at, post_id: u.post_id, via: "mission" });
  }
  for (const f of (road && road.feed_items) || []) {
    if (!f || !f.body) continue;
    if (Number.isInteger(f.flight) && Number(f.flight) !== Number(n)) continue;
    if (!Number.isInteger(f.flight) && Number(road && road.flight) !== Number(n)) continue;
    out.push({ line: f.body, at: f.at, post_id: f.id || f.post_id, via: "feed" });
  }
  const seen = new Set();
  return out.filter((u) => {
    const k = stripHeroCredit(u.line).toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
function heroWaterBody(raw) {
  const m = String(raw || "").match(/\b(?:the\s+)?(Gulf(?: of Mexico)?|Indian Ocean|Pacific Ocean|Atlantic Ocean|Atlantic|Pacific)\b/i);
  if (!m) return "";
  const key = m[1].toLowerCase();
  if (key === "gulf" || key === "gulf of mexico") return "the Gulf";
  if (key === "indian ocean") return "the Indian Ocean";
  if (key === "pacific ocean") return "the Pacific Ocean";
  if (key === "atlantic ocean") return "the Atlantic Ocean";
  if (key === "atlantic") return "the Atlantic";
  if (key === "pacific") return "the Pacific";
  return "the " + m[1];
}
function heroResultClause(raw, stage) {
  const t = String(raw || "");
  if (/\b(was caught|successfully caught|catch (?:was )?successful|tower catch (?:was )?complete|caught by the tower)\b/i.test(t)) return "was caught by the tower";
  if (/\b(was lost|is lost|lost during|destroyed|exploded)\b/i.test(t)) return /\bre-?entry\b/i.test(t) ? "was lost during reentry" : "was lost";
  if (/\b(splashdown|splashed down|diverted to|didn't attempt|did not attempt|skipped the tower catch|aborted|instead of|performed landing burn|ditched)\b/i.test(t)) {
    const where = heroWaterBody(t);
    const skip = /\b(diverted|instead of|didn't attempt|did not attempt|skipped|aborted|GNC|not (?:try|attempt))\b/i.test(t);
    if (skip) return "skipped the tower catch and splashed down in " + (where || "the Gulf");
    return "splashed down" + (where ? " in " + where : "");
  }
  return "";
}
function extractHeroOutcomes(text, road) {
  if (!text || isDroppedHeroLine(text)) return [];
  let raw = replaceNumberWords(stripHeroCredit(text));
  if (isPayloadDeploy(text) || isPayloadDeploy(raw)) raw = releasedToDeployed(raw);
  raw = raw.replace(/\bV3 Starlink\b/g, "Starlink V3");
  const name = heroVehicleName(text, road) || heroVehicleName(raw, road);
  const stage = heroLineStage(text) || (/^Ship\b/i.test(name) ? "ship" : /^Booster\b/i.test(name) ? "booster" : null);
  const out = [];
  const push = (kind, clause, extra, st) => {
    if (!clause) return;
    let use = st || stage;
    if (!use) use = (kind === "orbit" || kind === "deploy" || kind === "record") ? "ship" : "other";
    out.push({ stage: use, kind, clause: String(clause).replace(/[.\s]+$/, "").trim(), name, ...(extra || {}) });
  };
  const isRes = isStageResult(text);
  const isPend = isPendingAttempt(text);
  if (isRes) push("result", heroResultClause(raw, stage));
  if (isPend && !isRes) push("pending", "with a tower catch still ahead");
  const rec = /\b(sets? record|record for|longest .{0,40}flight|surpassed .{0,60}(duration|record|time|mission)|flying the longest|flew the longest)\b/i.test(raw);
  if (rec) push("record", "flying the longest Starship mission ever", { clausePast: "flew the longest Starship mission ever" }, stage || "ship");
  if (isPayloadDeploy(text) || isPayloadDeploy(raw)) {
    const m = raw.match(/\bdeploy(?:ed)?\s+(\d+)\s+(.+)/i);
    if (m) push("deploy", "deployed " + m[1] + " " + heroPayloadPhrase(m[2]), null, stage || "ship");
  }
  const orb = /\b(reached orbit|pressed on to orbit|orbital insertion|into (?:stable )?(?:low earth )?orbit|to orbit|will stay in orbit|continues in orbit|\bin orbit\b)\b/i.test(raw) && !rec;
  if (orb && !isRes) push("orbit", "reached orbit", null, stage || "ship");
  return out;
}
function inferOverrideKind(e) {
  if (e && e.kind && e.kind !== "other") return e.kind;
  const t = (e && (e.clause || e.line)) || "";
  if (/\bwith a tower catch still ahead\b/i.test(t) || (typeof isPendingAttempt === "function" && isPendingAttempt(t))) return "pending";
  if (/\bpressed on to orbit|reached orbit\b/i.test(t)) return "orbit";
  if (/\bdeployed \d+\b/i.test(t)) return "deploy";
  if (/\bflying the longest|flew the longest|set a new record|record for\b/i.test(t)) return "record";
  if (typeof isStageResult === "function" && isStageResult(t)) return "result";
  return e && e.kind ? e.kind : "other";
}
function parseHeroOverrideEntry(x, stageHint, road) {
  if (typeof x === "string") {
    const line = x.trim();
    if (!line) return null;
    const extracted = extractHeroOutcomes(line, road);
    if (extracted.length) return extracted.map((o) => ({ ...o, line, stage: stageHint || o.stage }));
    const kind = inferOverrideKind({ line });
    const clause = line.replace(/^(Ship|Booster)\s+\d+\s+/i, "").replace(/[.\s]+$/, "").trim();
    return [{ line, kind, stage: stageHint || heroLineStage(line), clause }];
  }
  if (x && ((typeof x.line === "string" && x.line.trim()) || (typeof x.clause === "string" && x.clause.trim()))) {
    const line = (x.line || "").trim();
    const clausePast = x.clause_past || x.clausePast || "";
    let clause = (x.clause || "").trim();
    let kind = inferOverrideKind(x);
    const extracted = line || !clause ? extractHeroOutcomes(line || clause, road) : [];
    if (!clause && extracted.length) {
      return extracted.map((o) => ({ ...o, line, stage: x.stage || stageHint || o.stage, clausePast: o.clausePast || clausePast || undefined }));
    }
    if (!clause && line) clause = line.replace(/^(Ship|Booster)\s+\d+\s+/i, "").replace(/[.\s]+$/, "").trim();
    const name = x.name || heroVehicleName(line, road) || heroVehicleName(clause, road);
    return [{ line, kind, stage: x.stage || stageHint || heroLineStage(line || clause) || null, clause, clausePast: clausePast || undefined, name }];
  }
  return null;
}
function parseHeroOverrides(ov, road) {
  if (!ov) return null;
  const out = [];
  const add = (x, stageHint) => {
    const got = parseHeroOverrideEntry(x, stageHint, road);
    if (got) out.push(...got);
  };
  if (Array.isArray(ov)) ov.forEach((x) => add(x));
  else {
    for (const stage of ["booster", "ship"]) if (ov[stage] != null) add(ov[stage], stage);
    if (Array.isArray(ov.extra)) ov.extra.forEach((x) => add(x));
  }
  return out.length ? out : null;
}
function heroLineOverrides(road, n) {
  const raw = road && road.hero_lines;
  return (raw && (raw[n] || raw[String(n)])) || null;
}
function defaultHeroVehicleNames(road) {
  const vs = (road && road.vehicles) || (typeof roadVehicles === "function" && road ? roadVehicles(road) : []) || [];
  const ship = vs.find((v) => /^S/i.test(String(v)));
  const boo = vs.find((v) => /^B/i.test(String(v)));
  return {
    ship: ship ? "Ship " + String(ship).replace(/^[Ss]/, "") : "",
    booster: boo ? "Booster " + String(boo).replace(/^[Bb]/, "") : "",
  };
}
function outcomeName(o, road) {
  if (o && o.name) return o.name;
  const names = defaultHeroVehicleNames(road);
  if (o && o.stage === "ship") return names.ship || "Ship";
  if (o && o.stage === "booster") return names.booster || "Booster";
  return heroVehicleName(o && (o.line || o.clause), road) || "";
}
function bareClause(o) {
  if (!o) return "";
  return String(o.clause || "").replace(/[.\s]+$/, "").trim();
}
function presentRecordClause(o) {
  const c = bareClause(o);
  if (/^is now /i.test(c)) return c;
  if (/^flying /i.test(c)) return "is now " + c;
  return c;
}
function pastRecordClause(o) {
  const past = o && (o.clausePast || o.clause_past);
  if (past) return String(past).replace(/[.\s]+$/, "").trim();
  const c = bareClause(o);
  if (/^is now flying /i.test(c)) return c.replace(/^is now flying /i, "flew ");
  if (/^flying /i.test(c)) return c.replace(/^flying /i, "flew ");
  return c;
}
function joinHeroClauses(parts, conj) {
  const list = (parts || []).filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  return list.slice(0, -1).join(", ") + " " + (conj || "and") + " " + list[list.length - 1];
}
function pendingSentence(o) {
  if (!o) return "";
  let p = bareClause(o);
  p = p.replace(/^,?\s*/, "").replace(/^with\s+/i, "").replace(/^a\s+/i, "");
  p = p.replace(/[.?!\s]+$/, "").trim();
  if (!p) return "";
  return p.charAt(0).toUpperCase() + p.slice(1) + ".";
}
function composeShipPhrase(ship, live) {
  if (!ship || !ship.name) return "";
  if (live) {
    const acts = [];
    if (ship.orbit) acts.push(bareClause(ship.orbit));
    if (ship.deploy) acts.push(bareClause(ship.deploy));
    if (ship.record) acts.push(presentRecordClause(ship.record));
    const body = joinHeroClauses(acts, "and");
    return body ? ship.name + " " + body : "";
  }
  const acts = [];
  if (ship.orbit) acts.push(bareClause(ship.orbit));
  if (ship.deploy) acts.push(bareClause(ship.deploy));
  if (ship.record) acts.push(pastRecordClause(ship.record));
  if (ship.result) acts.push(bareClause(ship.result));
  const lost = !!(ship.result && /was lost/i.test(bareClause(ship.result)));
  const body = joinHeroClauses(acts, lost ? "but" : "and");
  return body ? ship.name + " " + body : "";
}
function composeHeroParagraph(outcomes, road) {
  const list = (outcomes || []).filter((o) => o && o.kind && (o.clause || o.line));
  if (!list.length) return "";
  const of = (stage, kind) => list.find((o) => o.stage === stage && o.kind === kind) || list.find((o) => o.kind === kind && (o.stage === "other" || !o.stage) && stage === "ship");
  const boosterRes = of("booster", "result");
  const shipRes = of("ship", "result");
  const shipPend = shipRes ? null : of("ship", "pending");
  const orbit = of("ship", "orbit");
  const deploy = of("ship", "deploy");
  const record = of("ship", "record");
  const shipName = outcomeName(orbit || deploy || record || shipPend || shipRes, road);
  const booName = outcomeName(boosterRes, road);
  const ship = composeShipPhrase({ name: shipName, orbit, deploy, record, pending: shipPend, result: shipRes }, !shipRes);
  const booClause = boosterRes ? (bareClause(boosterRes) || heroResultClause(boosterRes.line || "", "booster")) : "";
  const pend = !shipRes ? pendingSentence(shipPend) : "";
  let para = "";
  if (booClause && ship) para = booName + " " + booClause + ", while " + ship + ".";
  else if (booClause) para = booName + " " + booClause + ".";
  else if (ship) para = ship + ".";
  if (pend) para = para ? para + " " + pend : pend;
  return para;
}
function heroMissionLines(road, n, f, now) {
  const t = Number.isFinite(now) ? now : (typeof nowMs === "function" ? nowMs() : Date.now());
  let lifted;
  if (typeof roadLiftedOff === "function") lifted = roadLiftedOff(road, f, t);
  else {
    const st = f && ((typeof effectiveStatus === "function") ? effectiveStatus(f, t) : f.status);
    if (st === "inflight" || st === "done") lifted = true;
    else if (st === "confirmed" || st === "net" || st === "tbc") lifted = false;
    else {
      const a0 = road && road.mission_alerts;
      const iso0 = a0 && Number(a0.flight) === Number(n) && a0.liftoff_actual;
      lifted = !!(iso0 && Number.isFinite(Date.parse(iso0)) && t >= Date.parse(iso0));
    }
  }
  if (lifted === false) return [];
  const pickLatest = (arr) => arr.slice().sort((a, b) => (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0))[0];
  const autoItems = [];
  for (const u of heroSourceLines(road, n)) {
    for (const o of extractHeroOutcomes(u.line, road)) autoItems.push({ ...o, at: u.at, name: o.name || defaultHeroVehicleNames(road)[o.stage] });
  }
  const autoResult = {};
  for (const stage of ["booster", "ship"]) {
    const r = pickLatest(autoItems.filter((u) => u.stage === stage && u.kind === "result"));
    if (r) autoResult[stage] = r;
  }
  const ovEntries = parseHeroOverrides(heroLineOverrides(road, n), road);
  let outcomes;
  if (ovEntries && ovEntries.length) {
    outcomes = ovEntries.map((e) => ({
      ...e,
      name: e.name || outcomeName(e, road),
      clause: bareClause(e),
    })).filter((e) => e.kind && e.clause);
    outcomes = outcomes.map((e) => {
      if (e.kind === "pending" && e.stage && autoResult[e.stage]) {
        const r = autoResult[e.stage];
        return { ...r, stage: e.stage, kind: "result", name: r.name || e.name || defaultHeroVehicleNames(road)[e.stage] };
      }
      return e;
    });
  } else {
    const keys = new Map();
    autoItems.slice().sort((a, b) => (Date.parse(a.at || "") || 0) - (Date.parse(b.at || "") || 0)).forEach((o) => keys.set(o.stage + ":" + o.kind, o));
    outcomes = [...keys.values()];
  }
  const para = composeHeroParagraph(outcomes, road);
  return para ? [para] : [];
}
// --- end hero-lines helpers ---

const isLaunched = (n) => FLIGHTS.some((x) => x.n === n);
// "1 day" / "2 days"
const daysLabel = (n) => `${n} ${Math.abs(n) === 1 ? "day" : "days"}`;
// Flight Log list, newest first, without the flight the top card is still showing.
const logList = (heroN) => [...FLIGHTS].filter((f) => f.n !== heroN).sort((a, b) => b.n - a.n);
// The Road as shown: once the top card has moved past the Road's (logged) flight, the next flight's Road at the same
// moment (scripts/handover.js roll), even before the checker's own rollover lands in road.json.
const MILESTONE_TITLE = /Liftoff|Success|Failure|Partial|Road to Flight|caught|scrub/i;
const isMilestoneItem = (p) => !!(p && p.cat && /^feed-(?:flight|notice)$/.test(p.cat.id) && MILESTONE_TITLE.test(p.cat.name || ""));
if (typeof window !== "undefined") window.ST_NOW = () => nowMs();
if (typeof window !== "undefined") window.ST_LAUNCH = (n) => { const f = FLIGHTS.find((x) => x.n === n); return f && f.date && Date.parse(f.date) <= nowMs() ? f.date : null; }; // Launch date box: past tense once the flight is logged // FL.boxes "today" follows the app clock (sim / launch-day mock)
function roadForHero(road, heroN) {
  const H = typeof window !== "undefined" ? window.RoadHandover : null;
  if (!road || !H || !Number.isInteger(road.flight) || !Number.isInteger(heroN) || heroN <= road.flight || !isLaunched(road.flight)) return road;
  const now = new Date(nowMs()).toISOString();
  return H.roll(road, heroN - 1, { updated: window.RoadFlightLog ? window.RoadFlightLog.ukDay(now) : road.updated, updatedAt: now });
}
// Road to Flight N page: only cards backed by a trusted X post, in sections by flight (newest flight first).
function buildFeed(road) {
  if (!road || !Array.isArray(road.categories)) return { posts: [], rows: [] };
  const posts = [];
  road.categories.filter((c) => !ROAD_HIDDEN.includes(c.id)).forEach((c, ci) => (c.history || []).forEach((h, hi) => isRealEntry(h) && !h.log_only && posts.push({
    h, cat: c, ci, hi, id: `${c.id}-${hi}`, day: feedDay(h.date, road.updatedAt), at: Date.parse((h.x_post && h.x_post.created_at) || h.at) || 0, flight: flightOf(h, road),
    when: cardTime(h, road),
  })));
  // pushes with no Road box (Starship news, flight-checker alerts): the push's own title, text, source link and time
  (Array.isArray(road.feed_items) ? road.feed_items : []).forEach((f, fi) => { if (!f || !f.id || !f.body) return;
    const t = doneToLabel(f.title), m = t.match(/^(\p{Extended_Pictographic}\uFE0F?)\s*(.*)$/u);
    const at = Date.parse(f.event_at || f.at) || 0; // event_at: the event's own time when the post came later (self-check)
    const own = f.box && road.categories.find((c) => c.id === f.box); // filed by purpose (e.g. a Starship news push about B22's static fire → Static fires)
    const ids = [...String(f.body || "").matchAll(/\b(?:(B|S)(\d{2,3})|(Booster|Ship)\s+(\d{2,3}))\b/gi)].map((x) => ((x[1] || x[3])[0]).toUpperCase() + (x[2] || x[4]));
    const mine = (road.vehicles || []).map((v) => String(v).toUpperCase());
    let fl = Number.isInteger(f.flight) ? f.flight : road.flight;
    if (!Number.isInteger(f.flight) && ids.length && !ids.some((v) => mine.includes(v))) {
      const hw = road.hardware_flights || {};
      const known = ids.map((v) => hw[v]).find((n) => Number.isInteger(n));
      fl = known != null ? known : null; // named vehicles that are not this Road's hardware never default to it
    }
    posts.push({ h: { id: f.id, date: f.date, text: f.body, src: f.src || (String(f.url || "").match(/x\.com\/([A-Za-z0-9_]{1,15})\/status\//) ? "@" + String(f.url).match(/x\.com\/([A-Za-z0-9_]{1,15})\/status\//)[1] : ""), url: f.url, publishedAt: f.event_at || f.at, trust: "trusted", kind: "feed" },
      cat: own || { id: "feed-" + (f.kind || "news"), name: m ? m[2] : t, icon: m ? m[1] : "", color: "#AAB6D6" }, ci: 99, hi: fi, id: f.id,
      day: at, at, flight: fl, when: at });
  });
  // the Road's own flight stays while the top card still shows it (logged, before the rollover); the just-flown flight's
  // launch-day updates (Liftoff, result) stay in its own section after the rollover
  const keep = (p) => p.flight === road.flight || (isMilestoneItem(p) && p.flight === road.flight - 1); // Road page stays full until rollover; Liftoff/result stay above the new Road
  for (let i = posts.length - 1; i >= 0; i--) if (!Number.isInteger(posts[i].flight)) posts.splice(i, 1); else if (keep(posts[i]) && posts[i].flight <= road.flight) continue; else if (isLaunched(posts[i].flight)) posts.splice(i, 1); else if (posts[i].flight > road.flight) posts.splice(i, 1); // later flights (B23/S43 → 16): only on their own Road, kept in the data until rollover // launched flights: Flight Log card only // unassigned other-vehicle news: not on this Road
  // sections by date: the next flight to fly on top, then later flights in flying order (15, then 16…);
  // inside a section newest first by the card's post date (else its entry date)
  const rank = (n) => (n === road.flight ? -Infinity : n);
  posts.sort((a, b) => rank(a.flight) - rank(b.flight) || b.when - a.when || a.ci - b.ci || a.hi - b.hi);
  const rows = [];
  let cur = null;
  for (const p of posts) {
    if (p.flight !== cur) {
      cur = p.flight;
      const f = FLIGHTS.find((x) => x.n === cur);
      rows.push({ section: { n: cur, flown: f ? { ...f, day: londonDayUTC(f.date) } : null, next: cur === road.flight } });
    }
    rows.push({ post: p });
  }
  return { posts, rows };
}

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }
const PLAY_ICON = null; // no play badge on pictures: videos show just their preview image

// The source's own preview (image, or a looping muted video), linking to the original.
// Only the photos / video attached to the entry's trusted X post, with a tiny credit and
// a View on X link. No X media → text only. Videos play inline (controls, preload none).
// X videos: video.twimg.com refuses requests that carry our site as Referer (403), so the page
// switches to no-referrer while a video loads/plays and back afterwards. The file only loads on
// tap (preload none), plays inline with controls, never autoplays; taps never reach the card.
// If it still fails, the poster becomes a link to the post.
function setNoReferrer(on) {
  let m = document.querySelector('meta[name="referrer"]');
  if (!m) { m = document.createElement("meta"); m.name = "referrer"; document.head.appendChild(m); }
  m.content = on ? "no-referrer" : "strict-origin-when-cross-origin";
}
function XVideo({ m, url }) {
  const ref = React.useRef(null);
  const [state, setState] = React.useState("idle"); // idle | on | failed
  const stop = (e) => e.stopPropagation();
  const start = (e) => {
    e.stopPropagation(); e.preventDefault();
    const v = ref.current; if (!v) return;
    setNoReferrer(true);
    if (!v.getAttribute("src")) v.src = m.video_url;
    v.controls = true; setState("on");
    const pr = v.play(); if (pr && pr.catch) pr.catch(() => {});
  };
  if (state === "failed") return <a href={url} target="_blank" rel="noopener noreferrer" onClick={stop}><img src={m.poster} alt="" loading="lazy" referrerPolicy="no-referrer" />{PLAY_ICON}</a>;
  return (
    <div className="xm-video" onClick={stop} onTouchEnd={stop}>
      <video ref={ref} poster={m.poster} playsInline webkit-playsinline="true" preload="none" muted={false}
        onPlay={() => setNoReferrer(true)} onPause={() => setNoReferrer(false)} onEnded={() => setNoReferrer(false)}
        onError={() => { if (state !== "idle" || ref.current.getAttribute("src")) { setNoReferrer(false); setState("failed"); } }} />
      {state === "idle" && <button className="xm-play" aria-label="Play video" onClick={start}>{PLAY_ICON}</button>}
    </div>
  );
}
// Hand-picked picture (road-media.json): the image and a View on X link; the post opens on tap. The @author credit shows once, in the card foot.
// Two-photo split (Road cards): the wide/context shot goes LEFT, the close-up RIGHT; alt_media.side says where
// the second picture sits (default left). Never more than 2;
// a ship cryo standing photo or a missing/identical second image falls back to one picture.
const splitOf = (h, mo) => (mo && h.alt_media && h.alt_media.show === true && h.alt_media.image && h.alt_media.image !== mo.image && mo.image !== SHIP_CRYO_IMAGE
  ? (h.alt_media.side === "right" ? [mo, h.alt_media] : [h.alt_media, mo]).slice(0, 2) : null); // wide/context shot left, close-up right
function SplitMedia({ pair, onPhotoTap, alt }) {
  const [bad, setBad] = React.useState({});
  const ok = pair.filter((m, i) => !bad[i]);
  if (ok.length < 2) return <OneMedia mo={pair.find((m, i) => !bad[i]) || pair[1]} />;
  return (
    <div className="xm">
      <div className="xm-split">
        {pair.map((m, i) => (
          <a key={i} href={m.image} target="_blank" rel="noopener noreferrer" aria-label={`${alt} \u2014 photo ${i + 1}`}
            onClick={(e) => { e.stopPropagation(); if (onPhotoTap) { e.preventDefault(); onPhotoTap(m.image, `${alt} \u2014 photo ${i + 1}`); } }}>
            <img className={cropClass(m)} src={localImg(m.image)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={imgFallback(m.image, () => setBad((b) => ({ ...b, [i]: true })))} /></a>))}
        <SrcBadge author={pair[1].author} url={pair[1].post_url} image={pair[1].image} />
      </div>
    </div>
  );
}
// 3 Nov crop rule: a photo that does not fit its slot is cover-cropped (never extended): top of the vehicle for ships and boosters, bottom for engines
const cropClass = (m) => (m && m.crop === "bottom" ? "crop-bottom" : "crop-top");
function PickMedia({ mo }) {
  if (mo.pair) return <SplitMedia pair={mo.pair} onPhotoTap={mo.onPhotoTap} alt={mo.alt} />;
  return <OneMedia mo={mo} />;
}
function OneMedia({ mo }) {
  const [bad, setBad] = React.useState(false);
  if (bad) return null;
  return (
    <div className="xm">
      <div className="xm-grid n1"><a href={mo.post_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
        <img className={cropClass(mo)} src={localImg(mo.image)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={imgFallback(mo.image, () => setBad(true))} />{mo.type === "video" && PLAY_ICON}</a>
        <SrcBadge author={mo.author} url={mo.post_url} image={mo.image} keep={!!mo.keep_image} /></div>
      {/* credit-only photo: the photo and its badge already open the photo's post; the card keeps one View on X (its own post) */}
      {mo.credit_only && <div className="xm-foot"><span className="xm-ctx">{`Photo · @${mo.author}`}</span></div>}
    </div>
  );
}
function XMedia({ x }) {
  const [bad, setBad] = React.useState({});
  const media = (x.media || []).map((m, i) => ({ ...m, i })).filter((m) => !bad[m.i] && (m.type === "photo" ? m.url : m.video_url || m.poster));
  if (!media.length) return null;
  const off = (i) => () => setBad((b) => ({ ...b, [i]: true }));
  return (
    <div className="xm">
      <div className={"xm-grid n" + Math.min(media.length, 4)}>
        {media.slice(0, 4).map((m) => m.type === "photo"
          ? <a key={m.i} href={x.url} target="_blank" rel="noopener noreferrer"><img src={m.url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={off(m.i)} /></a>
          : m.video_url
          ? <XVideo key={m.i} m={m} url={x.url} />
          : <a key={m.i} href={x.url} target="_blank" rel="noopener noreferrer"><img src={m.poster} alt="" loading="lazy" referrerPolicy="no-referrer" onError={off(m.i)} />{PLAY_ICON}</a>)}
        <SrcBadge author={(x.x_post && x.x_post.author && x.x_post.author.username) || x.author} url={x.url} />
      </div>
    </div>
  );
}
// An entry with an X post credits and links the post's author, so text, media and credit match.
const srcOf = (h) => (h.media_override && !h.media_override.credit_only ? `@${h.media_override.author}` : h.x_post && h.x_post.author && h.x_post.author.username ? `@${h.x_post.author.username}` : uiSrc(h.src));
const isYouTube = (u) => /(^|\.)(youtube\.com|youtu\.be)$/i.test(hostOf(u || ""));
const urlOf = (h) => (h.media_override && !h.media_override.credit_only && h.media_override.post_url) || (h.x_post && h.x_post.url) || (h.url && !isYouTube(h.url) ? h.url : null); // YouTube sources: not clickable
const openUrl = (u) => window.open(u, "_blank", "noopener,noreferrer");
const linkProps = (h) => { const u = urlOf(h); return u ? { role: "link", tabIndex: 0, "aria-label": `${h.x_text || h.text} — open ${h.x_post ? "the post on X" : "the source"}`,
  onClick: (e) => { if (!e.target.closest("a, video, button, .xm-video")) openUrl(u); }, onKeyDown: (e) => { if (e.key === "Enter" && e.target === e.currentTarget) openUrl(u); } } : {}; };
// One small right-aligned "View on X ↗" line per post (the link is the attribution; the handle stays in its aria-label). No separate chip/icon row.
function CreditLine({ h }) {
  const u = urlOf(h), who = srcOf(h), isX = /^https?:\/\/(x|twitter)\.com\//i.test(u || "");
  if (!u) return null; // no post, no line (no standalone credit)
  return (<div className="xm-foot post-credit">
    {u && <a href={u} target="_blank" rel="noopener noreferrer" aria-label={`${isX ? "View on X" : "View source"}${who ? ": " + who : ""}`} onClick={(e) => e.stopPropagation()}>{isX ? "View on X" : "View source"} {LINK_ICON}</a>}</div>);
}
// Road page build-up: "Earlier updates" (no count). An earlier update with its own post is a
// bordered pill that opens the post, with its own "@handle · View on X ↗" line.
const handleOf = (u) => u && (u.handle ? String(u.handle).replace(/^@?/, "@") : ((String(u.url || "").match(/^https?:\/\/(?:x|twitter)\.com\/(\w+)\/status\//i) || [])[1] ? "@" + String(u.url).match(/^https?:\/\/(?:x|twitter)\.com\/(\w+)\//i)[1] : null));
// Road page "Earlier updates": repeat completion lines (the card's main line already says it) are folded,
// newest first; when 2+ lines share a day each shows its post time ("25 Oct · 11:42", 24h Europe/London, no "UK").
const upIso = (u) => (u && u.at && Number.isFinite(Date.parse(u.at)) ? u.at : (String((u && u.url) || "").match(/(?:x|twitter)\.com\/\w+\/status\/(\d{15,})/) || [])[1] ? sfIso(String(u.url).match(/status\/(\d+)/)[1]) : "");
// Completed cards: the header shows when it happened ("25 Oct · 13:24", 24h Europe/London, no "UK"):
// completed_at (earliest trusted post showing the event itself), else the completing post's time.
const isDoneCard = (h) => !!(h && (h.complete || (h.milestone && h.milestone.phase === "completed")));
// Every Road card header: "25 Oct · 13:24" (24h Europe/London, no "UK"). Time from: completed_at (completed cards), the stored at,
// the X status id (snowflake) in the card's url, then an article's stored publishedAt. time_known: false (day-only source) or none → date only.
const cardIso = (h) => { if (!h || h.time_known === false) return ""; const sid = (String(h.url || "").match(/(?:x|twitter)\.com\/\w+\/status\/(\d{15,})/) || [])[1];
  for (const v of [isDoneCard(h) && h.completed_at, h.at, sid && sfIso(sid), h.publishedAt]) if (v && Number.isFinite(Date.parse(v))) return v; return ""; };
const cardDate = (h) => { const iso = cardIso(h); return iso ? `${ukStamp(iso, false)} · ${feedTime(iso)}` : entryDate(h); };
// Earlier updates box → that update's OWN card in the Road feed when it has one; else its source (see extOf).
const statusIdOf = (u) => (String(u || "").match(/status\/(\d{15,})/) || [])[1] || null;
function entryIndex(road) {
  const m = new Map();
  for (const c of (road && road.categories) || []) for (const x of c.history || []) {
    if (!x || !x.id || x.feed_hide || x.log_only || x.kind === "check") continue;
    for (const k of [x.url, x.x_post && x.x_post.url, statusIdOf(x.url), x.x_post && x.x_post.post_id, (String(x.id).match(/^x-(\d+)$/) || [])[1]]) if (k && !m.has(k)) m.set(k, x.id);
  }
  return m;
}
const updateTarget = (u, idx, selfId) => { if (!u || !idx) return null; const id = (u.url && idx.get(u.url)) || (statusIdOf(u.url) && idx.get(statusIdOf(u.url))) || null; return id && id !== selfId ? id : null; };
// No card of its own → the box opens the update's own source (X post or article) in a new tab; no source → plain box.
const extOf = (u) => (u && /^https?:\/\//i.test(String(u.url || "")) ? u.url : null);
const goToEntry = (id) => window.dispatchEvent(new CustomEvent("st-entry", { detail: id }));
function roadUpdates(h) {
  const done = !!(h.complete || (h.milestone && h.milestone.phase === "completed"));
  const yr = Number.isFinite(Date.parse(h.at || "")) ? new Date(h.at).getUTCFullYear() : new Date().getUTCFullYear();
  const dayMs = (u) => { const m = String(u.log_date || u.date || "").match(/(\d{1,2})(?:[–-]\d{1,2})? ([A-Z][a-z]{2})/); return m ? Date.UTC(yr, MON3.indexOf(m[2]), Number(m[1]), 23, 59) : 0; };
  const ups = (typeof window !== "undefined" && window.RoadCleanup && window.RoadCleanup.latestEstimateUpdates ? window.RoadCleanup.latestEstimateUpdates(h) : Array.isArray(h.updates) ? h.updates : []).filter((u) => u && u.text && (u.event_row || !(done && (u.phase === "completed" || u.reported === "completed")))); // the event_record's own completion row always shows (guards.js event-row) // 3 Nov: only the latest estimate
  const ms = (u) => Date.parse(upIso(u)) || dayMs(u);
  const sorted = ups.map((u, i) => ({ u, i })).sort((a, b) => ms(b.u) - ms(a.u) || a.i - b.i).map((x) => x.u);
  const day = (u) => { const iso = upIso(u); return iso ? ukStamp(iso, false) : fmtDay(u.log_date || u.date); };
  const n = {}; sorted.forEach((u) => { n[day(u)] = (n[day(u)] || 0) + 1; });
  return sorted.map((u) => { const iso = upIso(u); return { u, when: n[day(u)] > 1 && iso ? `${day(u)} · ${feedTime(iso)}` : null }; });
}
function FeedBuildUp({ h, plain, idx }) {
  const rows = roadUpdates(h);
  if (!rows.length) return null;
  const stop = (e) => e.stopPropagation();
  return (
    <details className="buildup feed-bu" onClick={stop}>
      <summary>Earlier updates</summary>
      <ul>{rows.map(({ u, when }, i) => { const to = updateTarget(u, idx, h.id);
        const body = <><div className="bu-top"><span className="bu-date">{when || (plain ? logDay(u) : entryDate(u))}</span></div><div className="bu-text">{scrub(plain ? logLine(u) : cardT(u))}</div></>;
        return to ? <li key={i} className="bu-pill" role="link" tabIndex={0} data-to={to} aria-label={`${u.text} — show its card`}
            onClick={(e) => { e.stopPropagation(); goToEntry(to); }} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) goToEntry(to); }}>{body}</li>
          : extOf(u) ? <li key={i} className="bu-pill bu-ext"><a href={extOf(u)} target="_blank" rel="noopener noreferrer" aria-label={`${u.text} — open its source`} onClick={stop}>{body}</a></li>
          : <li key={i} className="bu-pill bu-nolink">{body}</li>; })}</ul>
    </details>
  );
}
// Ship cryo test cards: Bernardo's standing photo (images/ship-cryo.jpg) replaces any X/video thumbnail;
// the card still opens the original X post. A manual pick with keep_image: true (road-media.json) wins.
const SHIP_CRYO_IMAGE = "images/ship-cryo.jpg";
const isShipCryo = (h, cat) => { const t = `${h.x_text || ""} ${h.text || ""} ${h.log_text || ""}`; return !!cat && cat.id === "cryo" && /\b(ship|s)\s?\d{2}\b/i.test(t) && !/\bbooster\b|\bb\d{2}\b/i.test(t); };
// 1 Nov: a hand-saved local copy of the card's own source media (images/…, credited) also wins over the standing photo.
const ownLocalMedia = (mo) => !!mo && /^images\//.test(String(mo.image || "")) && mo.image !== SHIP_CRYO_IMAGE && !!mo.author;
const roadMediaOf = (h, cat) => (isShipCryo(h, cat) && !(h.media_override && (h.media_override.keep_image || ownLocalMedia(h.media_override)))
  ? { post_url: urlOf(h), author: (h.media_override && h.media_override.author) || "", type: "photo", image: SHIP_CRYO_IMAGE } : h.media_override);
// 3 Nov: a combined pill ("Cryo tests · Ship 42") shows as two same-style pills side by side, no dot separator
const pillParts = (name) => String(name || "").split(/\s+·\s+/).filter(Boolean);
function FeedPost({ p, onPhotoTap, idx, st }) {
  const { h, cat } = p;
  const mo1 = roadMediaOf(h, cat), pair = splitOf(h, mo1);
  const crop = mo1 && (mo1.crop || (window.RoadPick ? window.RoadPick.cropOf(cat.id, `${h.text || ""} ${h.card_text || ""}`) : "top"));
  const mo = mo1 ? (pair ? { ...mo1, crop, pair: pair.map((m) => ({ ...m, crop })), onPhotoTap, alt: scrub(h.card_text || h.x_text || h.text) } : { ...mo1, crop }) : mo1; // two-photo split rides on the picked picture
  return (
    <article className={"post" + (urlOf(h) ? " post-tap" : "")} id={`post-${p.id}`} data-id={p.id} data-entry={h.id || undefined} data-xposts={(h.x_posts || []).join(" ") || undefined} style={catVars(cat.id, cat.color)}
      {...linkProps(h)}>
      <div className="post-top">
        {pillParts(cat.name).map((t, i) => <span key={i} className={"chip chip-" + cat.id + (i ? " chip-2" : "")}>{!i && <span className="chip-i"><CatIcon c={cat} /></span>}{t}</span>)}
        {st && <span className={"badge badge-" + st.status + " post-status"}>{st.text}</span>}
        <span className="post-date">{cardDate(h)}</span>
      </div>
      <p className="post-text">{scrub(h.card_text || h.x_text || h.text)}</p>
      {mo ? <PickMedia mo={mo} /> : h.media_context ? <ContextMedia mc={h.media_context} /> : !h.milestone && h.x_post && <XMedia x={h.x_post} />}
      {String(h.id || "").startsWith("rtf-") ? <RtfCredit h={h} /> : <CreditLine h={h} />}
      {String(h.id || "").startsWith("rtf-") ? <RtfBuildUp h={h} /> : <FeedBuildUp h={h} idx={idx} />}
    </article>
  );
}

// Source link wording: X → "@handle · View on X"; YouTube → "NSF · View video"; anything else → "NSF · View article".
const rtfIsX = (u) => /^https?:\/\/(x|twitter)\.com\//i.test(u || "");
const rtfLinkText = (u) => (rtfIsX(u) ? "View on X" : isYouTube(u) ? "View video" : "View article");
const rtfWho = (u, hd) => { const w = rtfIsX(u.url) ? (hd ? String(hd).replace(/^@?/, "@") : "") : String(u.src || "").replace(/^@/, "").trim() || hostOf(u.url); return w ? `${w} · ` : ""; };
// Main post of a two-cards card: same View on X line; a source CreditLine can't link (YouTube) still opens its stored url.
function RtfCredit({ h }) {
  if (urlOf(h) || !h.url) return <CreditLine h={h} />;
  return (<div className="xm-foot post-credit"><a href={h.url} target="_blank" rel="noopener noreferrer" aria-label={rtfLinkText(h.url)} onClick={(e) => e.stopPropagation()}>{rtfWho(h, null)}{rtfLinkText(h.url)} {LINK_ICON}</a></div>);
}
// Two-cards layout: every post of this vehicle + category, newest first, no pictures; date · time + text, the whole pill opens the post.
function RtfBuildUp({ h }) {
  const rows = (h.updates || []).slice().sort((a, b) => (Date.parse(upIso(b)) || 0) - (Date.parse(upIso(a)) || 0));
  if (!rows.length) return null;
  const stop = (e) => e.stopPropagation();
  return (
    <details className="buildup feed-bu" onClick={stop}>
      <summary>Earlier updates</summary>
      <ul>{rows.map((u, i) => {
      const iso = upIso(u);
      const body = <><div className="bu-top"><span className="bu-date">{iso ? `${ukStamp(iso, false)} · ${feedTime(iso)}` : fmtDay(u.date)}</span></div><div className="bu-text">{scrub(cardT(u)).replace(/^\d{1,2}(?:[–-]\d{1,2})? [A-Z][a-z]{2}:\s*/, "")}</div></>;
      return extOf(u) ? <li key={i} className="bu-pill bu-ext"><a href={extOf(u)} target="_blank" rel="noopener noreferrer" aria-label={`${u.text} — ${rtfLinkText(u.url).toLowerCase()}${rtfHandle(u) ? " (" + rtfHandle(u) + ")" : ""}`} onClick={stop}>{body}</a></li>
        : <li key={i} className="bu-pill bu-nolink">{body}</li>;
      })}</ul>
    </details>
  );
}
// Phone header: an opaque, blurred bar fixed over both pages (and the status bar
// area). Each page has its own two-line title: "Starship / Flight Log" (with a small
// "Road to / Flight N ›" hint at the right) and "Road to / Flight N". Everything is
// driven by --fp (0 = main page, 1 = feed), the value the swipe sets live, so the
// titles cross over and the pill slides and resizes from one to the other with the
// finger, then springs on release. Sizes are re-measured whenever they change
// (ResizeObserver), so late fonts or late styles can't leave it mis-placed.
const ABOUT_ICON = <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6h10M3 10h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
const HDR_K = 0.72, HDR_PGAP = 10; // inactive pill scale, gap between pills
// Settle after a horizontal drag: true = Road page open. Commits to the other page once
// the drag passes SWIPE_DIST of the width, or on a quick flick (|v| > SWIPE_FLICK px/ms)
// in that direction even if short. A flick back the other way cancels.
const SWIPE_DIST = 0.18, SWIPE_FLICK = 0.3;
function swipeCommit(from, p, vx) {
  if (from === 0) return vx < SWIPE_FLICK && (p > SWIPE_DIST || vx < -SWIPE_FLICK);
  return !(vx > -SWIPE_FLICK && (1 - p > SWIPE_DIST || vx > SWIPE_FLICK));
}
function PhoneHeader({ road, feedOpen, onAbout, onFeed, onBack, onHint }) {
  const ref = React.useRef(null);
  const [ready, setReady] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = el.querySelector(".hdr-a"), b = el.querySelector(".hdr-b");
    const measure = () => {
      const W = el.clientWidth, wa = a.offsetWidth, wb = b.offsetWidth;
      if (!W || !wa || !wb || wa > W * 0.6 || wb > W * 0.6) return; // styles not applied yet: wait for the next resize
      const set = (k, v) => el.style.setProperty(k, v);
      set("--ph", a.offsetHeight + "px"); set("--cx", W / 2 + "px"); set("--wa", wa + "px"); set("--wb", wb + "px"); set("--k", String(HDR_K)); set("--pg", HDR_PGAP + "px");
      setReady(true);
    };
    measure();
    const raf = requestAnimationFrame(measure);
    let ro = null;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(measure); ro.observe(el); ro.observe(a); ro.observe(b); }
    window.addEventListener("resize", measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure).catch(() => {});
    return () => { cancelAnimationFrame(raf); if (ro) ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [road.flight]);
  // Two pills, always visible: the active page's is full size and bright, the other
  // smaller and dimmer. Everything is a function of --fp (0 = tracker, 1 = Road), so
  // it follows the finger and eases on release. Tap the small pill to switch pages.
  return (
    <>
      <div className="hdr-bar" aria-hidden="true" />
      <div className={"hdr" + (ready ? " hdr-ready" : "") + (feedOpen ? " hdr-feed" : "")} ref={ref}>
        <button className="round-btn hdr-left" onClick={feedOpen ? onBack : onAbout} aria-label={feedOpen ? "Back to the flight log" : "Open about"}>
          <span className="hdr-ic hdr-ic-a">{ABOUT_ICON}</span><span className="hdr-ic hdr-ic-b">{BACK_ICON}</span>
        </button>
        <span className="hdr-pill" aria-hidden="true" />
        <button className="hdr-p hdr-a" onClick={feedOpen ? onBack : undefined} aria-current={feedOpen ? undefined : "page"} aria-label="Starship Flight Log">
          <b>Starship</b><span>Flight Log</span>
        </button>
        <button className="hdr-p hdr-b" onClick={feedOpen ? undefined : onFeed} aria-current={feedOpen ? "page" : undefined} aria-label={`Road to Flight ${road.flight}`}>
          <b>Road to</b><span>{`Flight ${road.flight}`}</span>
        </button>
        <button className="round-btn hdr-right" onClick={onFeed} aria-label="Open updates feed" tabIndex={feedOpen ? -1 : 0}>{FEED_ICON}</button>
      </div>
    </>
  );
}

// ---- PROTOTYPE (local only): Road to Flight N as two cards per category (Ship, Booster; Pad adds Launch pad) ----
const RTF_PLACEHOLDER = "images/rtf-placeholder.jpg";
const RTF_CATS = { cryo: /cryo/i, raptor: /raptor|engine/i, static: /static[- ]fire/i };
const rtfVeh = (s, road) => { const out = []; const t = String(s || "");
  const vs = roadVehicles(road), ship = vs.find((v) => /^S/i.test(v)), boo = vs.find((v) => /^B/i.test(v));
  if (isVehId(ship) && new RegExp(`\\b(ship\\s*|s)${ship.slice(1)}\\b`, "i").test(t)) out.push(ship);
  if (isVehId(boo) && new RegExp(`\\b(booster\\s*|b)${boo.slice(1)}\\b`, "i").test(t)) out.push(boo);
  return out; };
// Every vehicle id a line names (B23, Ship 43…): a line naming only other vehicles never joins this flight's cards.
const vehIds = (s) => { const o = new Set(); for (const m of String(s || "").matchAll(/\b(?:(B|S)(\d{2,3})|(Booster|Ship)\s+(\d{2,3}))\b/gi)) o.add(((m[1] || m[3])[0]).toUpperCase() + (m[2] || m[4])); return [...o]; };
const otherVehOnly = (s, road) => { const ids = vehIds(s), mine = roadVehicles(road).map((v) => v.toUpperCase()); return ids.length > 0 && !ids.some((v) => mine.includes(v)); };
const rtfPad = (h, road) => new RegExp(`\\b${String(road.pad || "Pad 2").replace(/\s+/, "[- ]?")}\\b`, "i").test(`${h.hardware || ""} ${h.text || ""}`);
const rtfHandle = (u) => handleOf(u) || (u.src && /^@/.test(u.src) ? u.src : null);
const rtfIsDone = (h, cid) => isDoneCard(h) && (!RTF_CATS[cid] || RTF_CATS[cid].test(`${h.text || ""} ${h.x_text || ""}`)) && !/ahead|could|expected/i.test(h.text || "");
function rtfCards(road) {
  const cats = Object.fromEntries((road.categories || []).map((c) => [c.id, c]));
  const vs = roadVehicles(road);
  const ship = vs.find((v) => /^S/i.test(v)), boo = vs.find((v) => /^B/i.test(v));
  const vname = (v) => (!isVehId(v) ? "Launch pad" : ship && v === ship ? `Ship ${v.slice(1)}` : boo && v === boo ? `Booster ${v.slice(1)}` : "Launch pad");
  const mine = (h) => isRealEntry(h) && !h.feed_hide && !(h.flight > road.flight) && flightOf(h, road) === road.flight && h.trust !== "unconfirmed";
  const bucket = {}, loose = []; // "cid|veh" -> entries
  const put = (cid, v, h) => { (bucket[cid + "|" + v] = bucket[cid + "|" + v] || []).push(h); };
  for (const cid of ["cryo", "raptor", "static", "pad"]) for (const h of ((cats[cid] && cats[cid].history) || []).filter(mine)) {
    if (typeof isRoadFlightEvent === "function" && isRoadFlightEvent(h, road)) continue;
    const padHw = /^\s*pad/i.test(h.hardware || ""), hw = logHw(h), tv = rtfVeh(h.text, road), vv = padHw ? [] : tv.length ? tv : hw && vs.map(String).includes(hw) ? [hw] : [];
    const otherPad = /\bpad[- ]?(\d)\b/i.test(`${h.hardware || ""} ${h.text || ""}`) && !rtfPad(h, road);
    if (vv.length) vv.forEach((v) => put(cid, v, h));
    else if (otherPad || otherVehOnly(h.text, road)) continue;            // another pad or another flight's vehicle (e.g. B23): stays in the data, not on this card (e.g. Pad 1): stays in the data, not on this page
    else if (rtfPad(h, road) || cid === "pad") put("pad", "pad", h);      // Pad 2 / tower work (also when filed under Static fires)
    else loose.push([cid, h]);                                             // no vehicle named: goes to the nearest-in-time vehicle card below
  }
  // Starship news pushes filed to a box (road.json feed_items) are posts too: same text and link as the push
  for (const f of Array.isArray(road.feed_items) ? road.feed_items : []) {
    if (!f || !f.body || f.card_hide || (f.later_flight && f.flight !== road.flight) || !["cryo", "raptor", "static", "pad"].includes(f.box) || (Number.isInteger(f.flight) ? f.flight : road.flight) !== road.flight) continue;
    const h = { id: f.id, date: f.date, at: f.at, text: f.body, url: f.url, src: (String(f.url || "").match(/(?:x|twitter)\.com\/(\w+)\//) || [])[1] ? "@" + String(f.url).match(/(?:x|twitter)\.com\/(\w+)\//)[1] : "", kind: "feed" };
    if (typeof isRoadFlightEvent === "function" && isRoadFlightEvent(h, road)) continue;
    const vv = rtfVeh(h.text, road);
    if (!vv.length && otherVehOnly(h.text, road)) continue; // e.g. "Booster 23 returned to Megabay 1": a Flight 16 item, never under Ship 42's Earlier updates
    if (vv.length) vv.forEach((v) => put(f.box, v, h)); else if (rtfPad(h, road) || f.box === "pad") put("pad", "pad", h); else loose.push([f.box, h]);
  }
  // 9 Nov: the Flight Log's pinned pad lines (road.flightlog_pins, the agreed record for this flight) also show in the vehicle's Road pad
  // drawer (rows only, never the card's main line), so the 12-entry history window can't drop them (S42 12 Sep lift to catch height
  // under the 7 Nov catch confirmation). A pin whose post is still in the history shows once (rows dedupe by url).
  const fp = road.flightlog_pins && Number(road.flightlog_pins.flight) === Number(road.flight) && road.flightlog_pins.boxes && road.flightlog_pins.boxes.pad;
  const padPins = {};
  for (const k of (fp && fp.cards) || []) if (vs.map(String).includes(k.vehicle)) for (const l of k.lines || []) if (l && l.text && Number.isFinite(Date.parse(l.at)))
    (padPins[k.vehicle] = padPins[k.vehicle] || []).push({ text: l.text, at: l.at, date: l.day, url: l.url || "", src: (String(l.url || "").match(/(?:x|twitter)\.com\/(\w+)\//) || [])[1] ? "@" + String(l.url).match(/(?:x|twitter)\.com\/(\w+)\//)[1] : "" });
  for (const [cid, h] of loose) { const t = Date.parse(cardIso(h)) || 0; let best = null;
    for (const v of vs) for (const e of bucket[cid + "|" + v] || []) { const d = Math.abs((Date.parse(cardIso(e)) || 0) - t); if (!best || d < best.d) best = { d, v }; }
    if (best) put(cid, best.v, h); }
  const out = [];
  const cols = [ship, boo].filter(isVehId);
  for (const cid of ["cryo", "raptor", "static", "pad"]) for (const v of rtfCategoryVehicles(cid, cols)) {
    const cat = cats[cid]; const list = (bucket[cid + "|" + v] || []).slice().sort((a, b) => (Date.parse(cardIso(b)) || 0) - (Date.parse(cardIso(a)) || 0));
    const wdrOrDone = cid === "pad" ? list.find((h) => isDoneCard(h) && /wet dress/i.test(h.text || "")) : list.find((h) => rtfIsDone(h, cid));
    const ovBox = typeof boxOverrides === "function" ? boxOverrides(road, road.flight) : null;
    const forceOff = ovBox && ovBox[cid] && (ovBox[cid].status === "progress" || ovBox[cid].status === "none");
    const forceOn = ovBox && ovBox[cid] && (ovBox[cid].status === "done" || ovBox[cid].status === "complete");
    const lifted = !forceOff && (forceOn || (typeof roadLiftedOff === "function" && roadLiftedOff(road)));
    const doneOne = wdrOrDone || (lifted ? list[0] : null);
    let main = wdrOrDone || list[0];
    if (cid === "pad" && v === "pad" && lifted && typeof stackedHeadline === "function") {
      const stacked = stackedHeadline(road);
      if (stacked) main = { ...(main || {}), text: stacked, card_text: stacked, date: stacked.replace(/^Stacked\s+/, "") };
    }
    if (!main) { out.push({ empty: true, cat, v, name: vname(v) }); continue; }
    // every post for this vehicle + category except the milestone's own, newest first; text + time + credit only
    const rows = [], seen = new Set([urlOf(main), main.url].filter(Boolean));
    const add = (u) => { const k = u.url || u.text; if (!u.text || (seen.has(k) && !u.event_row)) return; seen.add(k); rows.push(u); }; // event_row: the completion row (guards.js) shows even when it is the main post
    for (const h of list) {
      if (h !== main) add({ text: h.text, ...(h.card_text ? { card_text: h.card_text } : {}), at: cardIso(h) || h.at, date: h.date, url: urlOf(h) || h.url, src: h.src, handle: (h.x_post && h.x_post.author && h.x_post.author.username) || (h.media_override && h.media_override.author) || (String(h.src || "").startsWith("@") ? h.src : null) });
      for (const u of h.updates || []) { if (typeof isRoadFlightEvent === "function" && isRoadFlightEvent(u, road)) continue; const uv = rtfVeh(u.text, road); if (v === "pad" ? !otherVehOnly(u.text, road) : uv.length ? uv.includes(v) : !otherVehOnly(u.text, road)) add({ text: u.text, ...(u.card_text ? { card_text: u.card_text } : {}), at: u.at, date: u.date, url: u.url, src: u.src, event_row: u.event_row, phase: u.phase, handle: u.handle || (String(u.src || "").startsWith("@") ? u.src : null) }); }
    }
    if (cid === "pad") { for (const u of padPins[v] || []) { if (typeof isRoadFlightEvent === "function" && isRoadFlightEvent(u, road)) continue; add(u); } rows.sort((a, b) => (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0)); } // Flight Log pins: drawer rows
    const h = { ...main, id: `rtf-${cid}-${v}`, updates: rows, alt_media: null, complete: !!doneOne, milestone: doneOne ? main.milestone : { phase: "progress" } };
    // picture: newest event (incomplete) or the completing event (done); best photo among that event's posts (scripts/road-pick.js)
    const pic = window.RoadPick ? window.RoadPick.cardPicture(list, { cid, done: doneOne || null }) : null;
    if (pic) h.media_override = { image: pic.image, type: pic.type, post_url: pic.post_url, author: String(pic.author || "").replace(/^@/, ""), keep_image: pic.manual, credit_only: pic.from !== main && !!pic.author, crop: pic.crop };
    else if (!doneOne) h.media_override = { image: RTF_PLACEHOLDER, type: "photo", post_url: urlOf(main) };
    h.rtf_pic = pic ? pic.from : null; h.media_context = null;
    out.push({ h, cat: { ...cat, name: `${cat.name} · ${vname(v)}` }, ci: 0, hi: 0, id: h.id, flight: road.flight, done: !!doneOne });
  }
  return relabelPadReturnCards(out);
}
function vehiclesForFlight(road, n) {
  const set = new Set();
  for (const [v, f] of Object.entries((road && road.hardware_flights) || {})) if (f === n) set.add(v);
  for (const c of (road && road.categories) || []) for (const h of c.history || []) {
    if (h.flight !== n) continue;
    const hk = String(h.hardware || "").toUpperCase().replace(/^SHIP\s*/, "S").replace(/^BOOSTER\s*/, "B");
    if (/^[SB]\d+$/.test(hk)) set.add(hk);
  }
  const all = [...set];
  return [...all.filter((v) => /^S/i.test(v)).sort(), ...all.filter((v) => /^B/i.test(v)).sort()];
}
function roadForFlight(road, n) {
  if (!road || !Number.isInteger(n)) return road;
  const vehicles = vehiclesForFlight(road, n);
  // Assign flights against the real Road (unknown items stay on the current flight).
  // The preview then keeps only this flight's steps, so a Flight 15 pad test cannot appear on Flight 16.
  const categories = (road.categories || []).map((c) => ({
    ...c,
    history: (c.history || []).filter((h) => flightOf(h, road) === n),
    latest: undefined,
    log_latest: undefined,
  }));
  const feed_items = (Array.isArray(road.feed_items) ? road.feed_items : []).filter((f) => Number.isInteger(f.flight) && f.flight === n);
  const pins = road.flightlog_pins && Number(road.flightlog_pins.flight) === n ? road.flightlog_pins : null;
  return { ...road, flight: n, vehicles, categories, feed_items, flightlog_pins: pins };
}
// Display only: a Megabay or production-site return is not pad activity,
// so promote a pad-accurate row as the main line and keep the return in
// Earlier updates. Applies to every Road pad card for any flight.
const MEGABAY_RETURN = /returned to megabay|returned to the production site/i;
const PAD_EVENT = /chopstick|tower|pusher|catch|pad\s*2|deluge|stack|lifted|lift to/i;
function relabelPadReturnCards(cards) {
  return (cards || []).map((p) => {
    if (!p || p.empty || !p.h || !p.cat || p.cat.id !== "pad") return p;
    const main = String((p.h.card_text || p.h.text) || "");
    if (!MEGABAY_RETURN.test(main) || /after cryo/i.test(main)) return p;
    const rows = Array.isArray(p.h.updates) ? p.h.updates : [];
    const better = rows.find((u) => PAD_EVENT.test(String(u.card_text || u.text || "")));
    if (!better) return p;
    const shown = better.card_text || better.text;
    const returnRow = { text: p.h.text, ...(p.h.card_text ? { card_text: p.h.card_text } : {}), at: p.h.at, date: p.h.date, url: p.h.url, src: p.h.src };
    const updates = [returnRow, ...rows.filter((u) => (u.text || "") !== (better.text || ""))];
    // FeedPost reads card_text || x_text || text, so clear the old return wording on all three.
    return { ...p, h: { ...p.h, text: shown, card_text: shown, x_text: shown, at: better.at || p.h.at, date: better.date || p.h.date, url: better.url || p.h.url, src: better.src || p.h.src, updates } };
  });
}
function peekCardTime(p) {
  const h = p && p.h;
  if (!h) return 0;
  return (typeof cardIso === "function" && Date.parse(cardIso(h))) || Date.parse(h.at || "") || Date.parse(h.publishedAt || "") || 0;
}

// Display only (Road to Flight view): keep only the newest Launch date card for this
// flight — date-box history plus launch_date feed items, even when a later slip was
// never filed to the date box. Older cards stay in road.json and in the Flight Log.
// The rule is newest-by-time; no date is hard-coded.
function isRoadLaunchDatePost(p) {
  const id = p && p.cat && p.cat.id;
  return id === "date" || id === "feed-launch_date";
}
function currentLaunchDateId(posts, flight) {
  let best = null, bestAt = -Infinity;
  for (const p of posts || []) {
    if (!isRoadLaunchDatePost(p)) continue;
    if (Number.isInteger(p.flight) && Number(p.flight) !== Number(flight)) continue;
    const at = Number(p.when) || Number(p.at) || 0;
    if (at > bestAt) { bestAt = at; best = p; }
  }
  return best ? best.id : null;
}
function launchDateCat(road) {
  const c = ((road && road.categories) || []).find((x) => x.id === "date");
  return c ? { id: c.id, name: c.name, icon: c.icon, color: c.color } : { id: "date", name: "Launch date", icon: "🗓️", color: "#FFC93D" };
}
function asLaunchDatePost(p, road) {
  if (!p || (p.cat && p.cat.id === "date")) return p;
  return { ...p, cat: launchDateCat(road) };
}
// Display only: a SpaceX-published window with no official_date and no FAA
// licence yet shows "Pending approval" (Estimated / progress style) on the
// newest Launch date card. boxes() itself is unchanged. No flight numbers
// are hard-coded.
function isSpaceXLaunchSource(url) {
  try {
    const u = new URL(String(url || ""));
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "spacex.com" || host === "content.spacex.com") return true;
    if ((host === "x.com" || host === "twitter.com") && /^\/spacex(?:\/|$)/i.test(u.pathname)) return true;
    return false;
  } catch { return false; }
}
function launchDateCardBadge(road, post, flog) {
  const d = flog && flog.date;
  if (!d || !post) return null;
  const base = { id: post.id, status: d.status, text: d.statusText };
  const url = (post.h && (post.h.url || (post.h.x_post && post.h.x_post.url))) || post.url || "";
  const faa = flog && flog.faa;
  // same check as faaLicenceDisplay: the "Licence not yet issued" path runs when the box exists and is not done
  const licenceNotIssued = !!(faa && faa.status !== "done");
  if (!(road && road.official_date) && isSpaceXLaunchSource(url) && licenceNotIssued) {
    return { ...base, status: "progress", text: "Pending approval" };
  }
  return base;
}
function rtfRows(road) {
  const { posts, rows } = buildFeed(road);
  if (!road) return { posts, rows };
  const keepDateId = currentLaunchDateId(posts, road.flight);
  const res = []; let inCur = false, tail = [], head = [], headAt = -1;
  // fixed real-world order for the next flight: Cryo, Raptor, Static fires, Pad (cards above), then FAA licence, then Launch date last
  const flush = () => { tail.sort((x, y) => (x.post.cat.id === "date") - (y.post.cat.id === "date")); res.push(...tail); tail = []; };
  for (const r of rows) {
    if (r.section) { flush(); inCur = r.section.n === road.flight; res.push(r); if (inCur) { headAt = res.length; rtfCards(road).forEach((p) => res.push(p.empty ? { empty: p } : { post: p })); } continue; }
    if (inCur && isRoadLaunchDatePost(r.post)) {
      if (keepDateId && r.post.id !== keepDateId) continue; // superseded Launch date cards: hidden here, kept in the data
      tail.push({ ...r, post: asLaunchDatePost(r.post, road) });
      continue;
    }
    if (inCur && r.post.cat.id === "faa") { tail.push(r); continue; } // FAA: at the bottom, Launch date after it
    if (inCur && isMilestoneItem(r.post)) { head.push(r); continue; } // Liftoff, result, "Road to Flight N": on top, newest first
    if (inCur) continue;
    flush(); res.push(r);
  }
  flush();
  if (head.length && headAt >= 0) res.splice(headAt, 0, ...head);
  return { posts, rows: res };
}

// Category status for the slim Road pills (same rules as the Flight Log RoadCard: rollup + Flight Log boxes).
function roadCatItems(road, { heroNet, netPending, heroFlight } = {}) {
  const flogBoxes = road && window.RoadFlightLog ? window.RoadFlightLog.boxes(road, undefined, { net: heroNet || null, pending: !!netPending }) : null;
  const dateNet = authoritativeNetLabel(road, heroNet);
  return road && Array.isArray(road.categories) ? road.categories.filter((m) => !ROAD_HIDDEN.includes(m.id)).map((m) => logView(m, road)).map((m) => ({ ...m, status: rollupStatus(m, road) }))
    .map((m) => decorateFlogItem(m, flogBoxes && flogBoxes[m.id], road, heroNet, heroFlight)) : [];
}
// Next-flight dots: this flight's own history only, never the current flight's category.status.
function peekCatItems(road) {
  if (!road || !Array.isArray(road.categories)) return [];
  return road.categories.filter((m) => !ROAD_HIDDEN.includes(m.id)).map((m) => {
    const own = (m.history || []).filter((h) => isRealEntry(h) && !(h.flight > road.flight) && h.trust !== "unconfirmed");
    let status = "pending";
    if (ROLLUP_IDS.includes(m.id)) {
      const vs = roadVehicles(road).map((v) => v.toUpperCase());
      const last = {};
      for (const h of own) { const v = logHw(h); if (v && !last[v]) last[v] = h; }
      if (vs.length && vs.every((v) => last[v] && logDone(last[v]))) status = "done";
      else if (own.length) status = "progress";
    } else if (own.some(logDone)) status = "done";
    else if (own.length) status = "progress";
    return { id: m.id, name: m.name, color: m.color || PAST_COLOR[m.id], status };
  });
}
function roadDotLabel(m) {
  return (m.status === "done" || m.status === "complete") ? (ROAD_DONE_LABEL[m.id] || "Complete") : (ROAD_STATUS_TEXT[m.status] || m.status);
}
// Slim Flight N pill used on the Road tab (current flight at the top, next flight at the bottom).
function RoadFlightPill({ flight, items, action, open, onClick, shortCount, className }) {
  const done = items.filter((m) => m.status === "done" || m.status === "complete").length;
  const n = items.length;
  const count = shortCount ? `${done} of ${n}` : `${done} of ${n} done`;
  const chevron = (
    <svg className={"rtf-chevron" + (open ? " open" : "")} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.25 4.25 L6 8 L9.75 4.25" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const inner = (
    <>
      <span className="feed-pill-title">{`Flight ${flight}`}</span>
      <span className="road-dots">{items.map((m) => <i key={m.id} className={"dot dot-" + m.status} style={catVars(m.id, m.color)} title={m.name + ": " + roadDotLabel(m)} aria-label={m.name + ": " + roadDotLabel(m)} role="img" />)}</span>
      <span className="road-count">{shortCount ? count : <><span className="rc-full">{count}</span><span className="rc-short" aria-hidden="true">{`${done} of ${n}`}</span></>}</span>
      {action && <span className="feed-pill-action">{action}{chevron}</span>}
    </>
  );
  const cls = "feed-pill" + (className ? " " + className : "") + (open ? " open" : "");
  if (onClick) return <button type="button" className={cls} onClick={onClick} aria-expanded={!!open}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

// Road-tab flight card (Tusk mock: liftoff.html + toggle.html): header row (Flight N, dots, count,
// Open ⌄ / Close ⌃), an optional live row (the flight's Liftoff push as a glowing pill with Watch now + its UK time),
// and the flight's updates sliding out inside the same card under a divider. First two updates, then "Show all updates".
const ROAD_PILL_LABEL = (open) => (open ? "Close" : "Open");
const RFS_FIRST = 2;
// "Flight 15 is in the air · Watch now" → "Flight 15 is in the air" (the Watch now button is drawn separately).
const liveLineOf = (p) => String((p && p.h && (p.h.card_text || p.h.text)) || "").replace(/\s*·\s*Watch (?:now|live)\s*$/i, "").trim();
// A past flight's Road card: same look as a feed card (category chip, vehicle chip, text); date only when known.
function PastPost({ c }) {
  return (
    <article className="post past-post" id={`post-${c.id}`} data-id={c.id} style={catVars(c.box, c.cat.color)}>
      <div className="post-top">
        <span className={"chip chip-" + c.box}><span className="chip-i"><CatIcon c={c.cat} /></span>{c.cat.name}</span>
        {c.vehicle && <span className={"chip chip-" + c.box + " chip-2"}>{c.vehicle}</span>}
        {c.iso && <span className="post-date">{`${ukStamp(c.iso, false)} · ${feedTime(c.iso)}`}</span>}
      </div>
      <p className="post-text">{String(scrub(c.text)).replace(/\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, "$1\u00a0$2")}</p>
    </article>
  );
}
function RoadLiveRow({ p }) {
  const href = (p.h && p.h.url) || WATCH_LIVE_URL;
  return (
    <div className="rfs-row">
      <a className="rfs-live" data-entry={(p.h && p.h.id) || undefined} href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`${liveLineOf(p)}. Watch now`}>
        <span className="rfs-live-txt">{scrub(liveLineOf(p))}</span>
        <span className="rfs-sep" aria-hidden="true" />
        <span className="rfs-watch">Watch now</span>
      </a>
      {(() => { const iso = cardIso(p.h); return iso
        ? <span className="rfs-date"><span>{ukStamp(iso, false)}</span><span className="rfs-dsep">{" · "}</span><span>{feedTime(iso)}</span></span>
        : <span className="rfs-date">{cardDate(p.h)}</span>; })()}
    </div>
  );
}
// Deep links (push ?entry=, Flight Log taps) call rfsReveal(el) first: it opens the card and shows all updates.
// Top of el inside the scroll pane's content (posts now sit inside the flight card, so offsetTop alone is relative to it).
const relTop = (el, pane) => el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
const rfsReveal = (el) => { const sec = el && el.closest && el.closest(".deck-wrap") && el.closest(".rfs"); if (!sec || (sec.classList.contains("is-open") && sec.classList.contains("show-all"))) return false;
  sec.dispatchEvent(new CustomEvent("rfs-reveal")); return true; };
function RoadFlightSection({ flight, items, open, onToggle, shortCount, deckReady, deckId, live, sectionId, past, children }) {
  const kids = React.Children.toArray(children).filter(Boolean);
  const [all, setAll] = React.useState(false);
  const ref = React.useRef(null), openRef = React.useRef(open), toggleRef = React.useRef(onToggle);
  openRef.current = open; toggleRef.current = onToggle;
  React.useEffect(() => { if (!open) setAll(false); }, [open]);
  React.useEffect(() => { const el = ref.current; if (!el) return;
    const on = () => { setAll(true); if (!openRef.current) toggleRef.current(); };
    el.addEventListener("rfs-reveal", on); return () => el.removeEventListener("rfs-reveal", on); }, []);
  // every update stays in the DOM (deep links find it); beyond the first two they are hidden until "Show all updates"
  const shown = kids.map((k, i) => (i < RFS_FIRST ? k : <div key={"x" + i} className="rfs-extra">{k}</div>));
  const more = kids.length > RFS_FIRST;
  const deckCls = "deck-wrap" + (open ? " open" : "") + (reduceMotion() ? " deck-no-motion" : deckReady ? " deck-animate" : "");
  return (
    <div ref={ref} className={"feed-section rfs" + (open ? " is-open" : "") + (all ? " show-all" : "") + (live ? " has-live" : "") + (past ? " rfs-past" : "")} id={sectionId || `fsec-${flight}`} data-flight={flight}>
      <RoadFlightPill flight={flight} items={items} action={ROAD_PILL_LABEL(open)} open={open} onClick={onToggle} shortCount={shortCount} />
      {live && <RoadLiveRow p={live} />}
      <div className={deckCls} id={deckId} aria-hidden={!open}>
        <div className="deck-inner"><div className="rfs-feed">
          {shown}
          {more && <button type="button" className="rfs-more" tabIndex={open ? 0 : -1} aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer updates" : "Show all updates"}
            <svg className={"rtf-chevron" + (all ? " open" : "")} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.25 4.25 L6 8 L9.75 4.25" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>}
        </div></div>
      </div>
    </div>
  );
}

function UpdatesFeed({ road, wide, shown, onBack, scrollRef, onPhotoTap, peekOpen, onTogglePeek, heroNet, netPending }) {
  const { posts, rows } = React.useMemo(() => rtfRows(road), [road]);
  const idx = React.useMemo(() => entryIndex(road), [road]);
  // Launch date: the section status pill rides on this flight's newest date card.
  // "Pending approval" (progress style) replaces it when there is no official_date,
  // the card is from SpaceX, and the FAA licence is not yet issued; otherwise the Flight Log badge stays.
  const dateSt = React.useMemo(() => { const f = road && window.RoadFlightLog ? window.RoadFlightLog.boxes(road) : null; const d = f && f.date;
    const keepId = road && currentLaunchDateId(posts, road.flight);
    const top = d && keepId && posts.find((q) => q.id === keepId);
    return top ? launchDateCardBadge(road, top, f) : null; }, [road, posts]);
  const peekN = road && Number.isInteger(road.flight) ? road.flight + 1 : null;
  const peekRoad = React.useMemo(() => (peekN && road ? roadForFlight(road, peekN) : null), [road, peekN]);
  const peekCards = React.useMemo(() => {
    if (!peekRoad) return [];
    const cards = rtfCards(peekRoad).filter((c) => !c.empty);
    return cards.slice().sort((a, b) => peekCardTime(b) - peekCardTime(a)); // newest first
  }, [peekRoad]);
  const curItems = React.useMemo(() => roadCatItems(road, { heroNet, netPending }), [road, heroNet, netPending]);
  const peekItems = React.useMemo(() => peekCatItems(peekRoad), [peekRoad]);
  const curPosts = [], rest = [];
  let mode = "before";
  for (const r of rows) {
    if (r.section && r.section.next) { mode = "cur"; continue; } // the next-flight divider is replaced by the slim pill
    if (r.section) { mode = "rest"; rest.push(r); continue; }
    if (mode === "cur") curPosts.push(r);
    else rest.push(r);
  }
  const liveIdx = curPosts.findIndex((r) => r && r.post && isMilestoneItem(r.post) && /lift ?off/i.test(r.post.cat.name || ""));
  const livePost = liveIdx >= 0 ? curPosts[liveIdx].post : null;
  const [curOpenUser, setCurOpen] = React.useState(null);
  const curOpen = curOpenUser ?? true; // the current flight stays the active, expanded group (past flights start collapsed)
  const pastGroups = React.useMemo(() => { const flown = rows.filter((r) => r.section).map((r) => r.section.n); // a flight still listed below keeps that section only
    return pastRoadFlights(road, FLIGHTS, flown).map((n) => pastRoadGroup(road, n, FLIGHTS, ROAD_HIDDEN)); }, [road, rows]);
  const [pastOpen, setPastOpen] = React.useState({}); // past flights start collapsed
  const [deckReady, setDeckReady] = React.useState(false); // skip the open morph on first paint
  React.useEffect(() => { const id = requestAnimationFrame(() => setDeckReady(true)); return () => cancelAnimationFrame(id); }, []);
  const renderRow = (r) => r.section
    ? <div className="fdiv" id={`fsec-${r.section.n}`} key={"f" + r.section.n}><span><b>{`Flight ${r.section.n}`}</b>{(r.section.flown || r.section.next) && <> <i>·</i> </>}{r.section.flown
        ? <><span className={"fdiv-" + r.section.flown.outcome}>{OUTCOME_LABEL[r.section.flown.outcome] || r.section.flown.outcome}</span> <i>·</i> {ukStamp(new Date(r.section.flown.day).toISOString(), false, true)}</>
        : r.section.next ? <span className="fdiv-next">Next flight</span> : null}</span></div>
    : r.empty ? null : <ErrorBoundary key={r.post.id} where={"feed:" + r.post.id}><FeedPost p={r.post} onPhotoTap={onPhotoTap} idx={idx} st={dateSt && dateSt.id === r.post.id ? dateSt : null} /></ErrorBoundary>;
  if (!posts.length) return null;
  return (
    <aside className="feed-pane" aria-label="Updates feed" aria-hidden={!wide && !shown}>
      <div className="feed" ref={scrollRef}>
        <header className="feed-head">
          {wide ? <span /> : <button className="round-btn" onClick={onBack} aria-label="Back to the flight log" tabIndex={shown ? 0 : -1}>{BACK_ICON}</button>}
          <div className="brand">Road to<span>{`Flight ${road.flight}`}</span></div>
          <span />
        </header>
        <div className="feed-list">
          {pastGroups.map((g) => (
            <RoadFlightSection key={"past" + g.flight} past flight={g.flight} items={g.items} open={!!pastOpen[g.flight]} sectionId={`fsec-past-${g.flight}`}
              onToggle={() => setPastOpen((o) => ({ ...o, [g.flight]: !o[g.flight] }))} deckReady={deckReady} deckId={`rtf-past-${g.flight}`}>
              {g.cards.map((c) => <PastPost key={c.id} c={c} />)}
            </RoadFlightSection>
          ))}
          {Number.isInteger(road && road.flight) && (
            <RoadFlightSection flight={road.flight} items={curItems} open={curOpen} onToggle={() => setCurOpen(!curOpen)} deckReady={deckReady} live={livePost}>
              {curPosts.filter((r, i) => i !== liveIdx).map(renderRow)}
            </RoadFlightSection>
          )}
          {peekN && (
            <RoadFlightSection flight={peekN} items={peekItems} open={peekOpen} onToggle={onTogglePeek} shortCount deckReady={deckReady} deckId="rtf-peek">
              {peekCards.length
                ? peekCards.map((c) => <ErrorBoundary key={c.id} where={"feed:" + c.id}><FeedPost p={c} onPhotoTap={onPhotoTap} idx={idx} st={null} /></ErrorBoundary>)
                : <p className="rtf-soon">Coming soon</p>}
            </RoadFlightSection>
          )}
          {rest.map(renderRow)}
        </div>
      </div>
    </aside>
  );
}

function StarshipTracker() {
  const [openId, setOpenId] = React.useState(null);
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const [lightbox, setLightbox] = React.useState(null); // { src, alt } | null
  const [notifyModalOpen, setNotifyModalOpen] = React.useState(false);
  const rawRoad = useRoad();
  const wide = useMedia(FEED_WIDE_QUERY);
  // ?feed=1 (tapping a "🚀 Starship" news push) opens the phone's Updates feed straight away
  // ?feed=1&entry=<id> (a Road push): open the Road page, scroll to that card and highlight it
  const [entryReq, setEntryReq] = React.useState(() => { try { return new URLSearchParams(window.location.search).get("entry") || new URLSearchParams(window.location.search).get("item") || null; } catch { return null; } });
  const [feedOpen, setFeedOpen] = React.useState(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get("feed") !== "1") return false;
      q.delete("feed"); q.delete("entry"); q.delete("item"); window.history.replaceState(null, "", window.location.pathname + (q.toString() ? `?${q}` : "") + window.location.hash);
      return window.innerWidth < 900;
    } catch { return false; }
  }); // phone panel
  const [feedOn, setFeedOn] = React.useState(false);     // panel open, opening or closing
  const [dragging, setDragging] = React.useState(false);
  const rootRef = React.useRef(null);
  const feedScroll = React.useRef(null);
  const blocked = aboutOpen || notifyModalOpen || !!lightbox;

  // First visit: ask about notifications once, before any decision is stored.
  React.useEffect(() => {
    if (window.STNotify && !window.STNotify.hasDecided()) setNotifyModalOpen(true);
  }, []);

  // Block background scroll while the notifications modal is open.
  React.useEffect(() => {
    document.body.style.overflow = notifyModalOpen ? "hidden" : "";
  }, [notifyModalOpen]);
  const cardEls = React.useRef({});
  const pending = React.useRef(null);
  const now = useNow(false);
  const { flight: liveNext, checkedAt, settled: nextSettled } = useNextFlight();
  const nextFlight = liveNext || placeholderFlight(LAST_LOGGED_N + 1);
  const road = React.useMemo(() => roadForHero(rawRoad, nextFlight.n), [rawRoad, nextFlight.n]); // rolls over with the top card

  const heroLogged = isLaunched(nextFlight.n); // the top card still shows a logged flight (its result): not repeated in the log below
  const flights = logList(nextFlight.n);
  const latest = flights[0];
  const daysSinceLatest = daysBetween(latest.date, new Date(now).toISOString()); // UK calendar days, like the gaps

  const register = (n, el) => { if (el) cardEls.current[n] = el; };

  const handleTap = (n) => {
    if (openId === n) { // tap the open card: it simply closes in place
      pending.current = { open: null, close: n };
      setOpenId(null);
      return;
    }
    const r = cardEls.current[n].getBoundingClientRect();
    const prev = openId != null ? cardEls.current[openId] : null;
    const pr = prev && prev.getBoundingClientRect();
    pending.current = {
      open: n, close: openId,
      startTop: r.top, startY: window.scrollY,
      oldAbove: !!pr && pr.top < r.top,                            // is the closing card above the tapped one?
      oldVisible: !!pr && pr.bottom > 0 && pr.top < window.innerHeight, // can you see it?
    };
    setOpenId(n);
  };

  // Plan the whole move up front, then do it in ONE straight line:
  // 1. Work out where the tapped card should end up:
  //    - old card visible above it: let it slide up naturally as the old one closes
  //    - old card off-screen: keep it exactly where your finger was
  //    - then nudge it up only if the opened card would run off the bottom
  // 2. Animate heights and scroll together, frame by frame, with the same easing.
  //    Nothing overshoots or reverses, so no flashing.
  // Touching or scrolling mid-animation hands scroll control straight back to you.
  React.useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const openEl = p.open != null ? cardEls.current[p.open] : null;
    const closeEl = p.close != null ? cardEls.current[p.close] : null;
    const openMore = openEl && openEl.querySelector(".more");
    const closeMore = closeEl && closeEl.querySelector(".more");
    const ms = reduceMotion() ? 0 : EXPAND_MS;
    const ease = (t) => 1 - Math.pow(1 - t, 3);

    const setHeights = (e) => {
      if (openMore) openMore.style.gridTemplateRows = `${e}fr`;
      if (closeMore) closeMore.style.gridTemplateRows = `${1 - e}fr`;
    };
    setHeights(0); // starting state, applied before the screen paints

    // 1. plan the destination
    let targetY = null;
    if (openEl && p.startTop != null) {
      const vh = window.innerHeight, m = 16;
      const oldShrink = p.oldAbove && closeEl ? closeEl.querySelector(".more-inner").offsetHeight : 0;
      const finalH = openEl.offsetHeight + openEl.querySelector(".more-inner").scrollHeight;
      const base = p.oldVisible ? p.startTop - oldShrink : p.startTop;
      let finalTop = Math.min(base, vh - m - finalH);       // fit the whole card on screen
      finalTop = Math.max(finalTop, Math.min(base, m));      // but never push its top off screen
      targetY = (p.startTop + p.startY - oldShrink) - finalTop;
      if (Math.abs(targetY - p.startY) < 1) targetY = null;  // no scroll needed
    }

    let userTookOver = false, raf = 0;
    const takeOver = () => { userTookOver = true; };
    window.addEventListener("touchstart", takeOver, { passive: true, once: true });
    window.addEventListener("wheel", takeOver, { passive: true, once: true });

    // 2. move there in one line
    const frame = (e) => {
      setHeights(e);
      if (targetY != null && !userTookOver) window.scrollTo(0, p.startY + (targetY - p.startY) * e);
    };
    const finish = () => {
      if (openMore) openMore.style.gridTemplateRows = "";
      if (closeMore) closeMore.style.gridTemplateRows = "";
    };

    if (ms === 0) { frame(1); finish(); }
    else {
      const t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        frame(ease(t));
        if (t < 1) raf = requestAnimationFrame(tick); else finish();
      };
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      finish();
      window.removeEventListener("touchstart", takeOver);
      window.removeEventListener("wheel", takeOver);
    };
  }, [openId]);

  // Feed panel (phone): keep it laid out while it slides, hide it once closed.
  React.useEffect(() => {
    if (feedOpen) { setFeedOn(true); return; }
    const t = setTimeout(() => setFeedOn(false), FEED_SLIDE_MS + 30);
    return () => clearTimeout(t);
  }, [feedOpen]);
  React.useEffect(() => {
    if (!feedOpen) return;
    const onEsc = (e) => e.key === "Escape" && !blocked && setFeedOpen(false);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [feedOpen, blocked]);
  React.useEffect(() => { if (wide) setFeedOpen(false); }, [wide]);
  // Phone: one scroll owner per page. While Road is open it scrolls inside .feed, so the
  // window (still sized by the hidden Flight Log) is locked; otherwise its scroll bar sits
  // stale on screen and doesn't track. The Flight Log position is kept for the way back.
  React.useEffect(() => {
    if (wide || !feedOpen) return;
    const de = document.documentElement, y = window.scrollY;
    de.classList.add("feed-lock");
    return () => { de.classList.remove("feed-lock"); if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y); };
  }, [wide, feedOpen]);

  // iOS-style swipe: the panel follows your finger, then settles open or shut
  // depending on how far / how fast you swiped. Vertical scrolling is left alone.
  const swipe = React.useRef({ feedOpen, blocked, wide });
  swipe.current.feedOpen = feedOpen; swipe.current.blocked = blocked; swipe.current.wide = wide;
  React.useEffect(() => {
    let g = null;
    let raf = 0, pend = null;
    const setNow = (p) => { if (raf) { cancelAnimationFrame(raf); raf = 0; } rootRef.current && rootRef.current.style.setProperty("--fp", String(p)); };
    const setP = (p) => { pend = p; if (!raf) raf = requestAnimationFrame(() => { raf = 0; setNow(pend); }); }; // one style write per frame
    const start = (e) => {
      const s = swipe.current;
      g = null;
      if (s.wide || s.blocked || e.touches.length !== 1) return;
      if (e.target.closest && e.target.closest(".lightbox, .about, .notify-modal, input, textarea")) return;
      const t = e.touches[0];
      g = { x: t.clientX, y: t.clientY, t: performance.now(), from: s.feedOpen ? 1 : 0, mode: null, p: s.feedOpen ? 1 : 0, vx: 0, lx: t.clientX, lt: performance.now() };
    };
    const move = (e) => {
      if (!g || g.mode === "no") return;
      const t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y;
      if (!g.mode) {
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { g.mode = "no"; return; }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if ((g.from === 0 && dx > 0) || (g.from === 1 && dx < 0)) { g.mode = "no"; return; }
        g.mode = "drag"; g.x = t.clientX; // start following from here: no jump
        setFeedOn(true); setDragging(true);
      }
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      const inst = (t.clientX - g.lx) / Math.max(1, now - g.lt);
      g.vx = g.vx ? g.vx * 0.3 + inst * 0.7 : inst; g.lx = t.clientX; g.lt = now; // lightly smoothed px/ms
      g.p = Math.min(1, Math.max(0, g.from - (t.clientX - g.x) / window.innerWidth));
      setP(g.p);
    };
    const end = () => {
      if (!g || g.mode !== "drag") { g = null; return; }
      const open = swipeCommit(g.from, g.p, g.vx), gp = g.p, gv = g.vx;
      g = null;
      // Carry the finger's speed into the settle: the curve's opening slope (~2.25 x average)
      // matches the release velocity, so a short flick glides on instead of snapping.
      const root = rootRef.current;
      if (root) {
        const left = Math.abs((open ? 1 : 0) - gp) * window.innerWidth, v = Math.abs(gv);
        const ms = Math.round(Math.min(520, Math.max(240, v > 0.05 ? (2.25 * left) / v : 520)));
        const ease = `${ms}ms cubic-bezier(.32,.72,0,1)`;
        root.style.setProperty("--slide", ease); root.style.setProperty("--hdr-ease", ease);
        clearTimeout(swipe.current.easeT);
        swipe.current.easeT = setTimeout(() => { root.style.removeProperty("--slide"); root.style.removeProperty("--hdr-ease"); }, ms + 60);
      }
      setNow(open ? 1 : 0); setDragging(false); setFeedOpen(open);
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, []);

  // Header link: (slide the phone feed away,) glide to the Road box in the top card and open it.
  const [roadOpenReq, setRoadOpenReq] = React.useState(0);
  const [peekOpen, setPeekOpen] = React.useState(false);
  const openRoad = () => {
    const go = () => {
      const el = document.querySelector(".next .road");
      if (!el) return;
      setRoadOpenReq((n) => n + 1); // opens with its own .5s ease while the page glides
      glideTo(Math.max(0, el.getBoundingClientRect().top + window.scrollY - 84));
    };
    if (!wide && feedOpen) { setFeedOpen(false); setTimeout(go, reduceMotion() ? 0 : Math.round(FEED_SLIDE_MS * 0.6)); } else go();
  };
  const togglePeek = () => setPeekOpen((v) => !v);
  React.useEffect(() => { if (!wide && !feedOpen && !dragging) setPeekOpen(false); }, [wide, feedOpen, dragging]);
  const chip = <RoadChip road={road} onOpen={openRoad} />;
  const phoneHeader = !wide && road && road.flight && Array.isArray(road.categories) ? (
    <PhoneHeader road={road} feedOpen={feedOpen} onAbout={() => setAboutOpen(true)}
      onFeed={() => setFeedOpen(true)} onBack={() => setFeedOpen(false)} onHint={openRoad} />
  ) : null;

  // Tap an Earlier updates box: same deep-link path (scroll to that card, highlight it).
  React.useEffect(() => { const on = (e) => e.detail && setEntryReq(e.detail); window.addEventListener("st-entry", on); return () => window.removeEventListener("st-entry", on); }, []);
  // Tap an entry in the Road card: show its post in the feed and light it up.
  React.useEffect(() => {
    if (!entryReq || !road) return;
    const t = setTimeout(() => {
      const pane = feedScroll.current;
      const num = (String(entryReq).match(/^x-(\d+)$/) || [])[1]; // a merged card keeps its old post ids (old push links still land on it)
      const el = pane && (pane.querySelector(`[data-entry="${CSS.escape(entryReq)}"]`) || (num && pane.querySelector(`[data-xposts~="${num}"]`)));
      setEntryReq(null);
      if (!el) return;
      const go = () => {
        const head = pane.querySelector(".feed-head");
        pane.scrollTop = Math.max(0, relTop(el, pane) - (head ? head.offsetHeight : 0) - 14);
        if (!wide) setFeedOpen(true);
        setTimeout(() => { el.classList.remove("hl"); void el.offsetWidth; el.classList.add("hl"); setTimeout(() => el.classList.remove("hl"), 2400); }, reduceMotion() ? 0 : FEED_SLIDE_MS);
      };
      if (rfsReveal(el)) setTimeout(go, reduceMotion() ? 30 : 340); else go();
    }, 300);
    return () => clearTimeout(t);
  }, [entryReq, road]);
  const jumpToPost = (catId, i) => {
    const pane = feedScroll.current;
    const el = pane && pane.querySelector(`#post-${CSS.escape(`${catId}-${i}`)}`);
    if (!el) return;
    if (rfsReveal(el)) { setTimeout(() => jumpToPost(catId, i), reduceMotion() ? 30 : 340); return; }
    const head = pane.querySelector(".feed-head");
    const y = Math.max(0, relTop(el, pane) - (head ? head.offsetHeight : 0) - 14);
    const flash = () => { el.classList.remove("hl"); void el.offsetWidth; el.classList.add("hl"); setTimeout(() => el.classList.remove("hl"), 2400); };
    if (wide) {
      pane.scrollTo({ top: y, behavior: reduceMotion() ? "auto" : "smooth" });
      setTimeout(flash, reduceMotion() ? 0 : 350);
    } else {
      pane.scrollTop = y;
      setFeedOpen(true);
      setTimeout(flash, reduceMotion() ? 0 : FEED_SLIDE_MS);
    }
  };

  return (
    <div className={"st" + (feedOn ? " feed-on" : "") + (dragging ? " feed-drag" : "") + (feedOpen && !dragging ? " feed-open" : "")} ref={rootRef} style={{ "--fp": feedOpen ? 1 : 0 }}>
      <style>{css}</style>
      <div className="st-layout">
      <div className="st-wrap" aria-hidden={!wide && feedOpen ? true : undefined}>
        <header className="top">
          <button className="round-btn" onClick={() => setAboutOpen(true)} aria-label="Open about">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6h10M3 10h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
          <div className="brand-row">
            <div className="brand">Starship<span>Flight Log</span></div>
            {chip}
          </div>
          {road && Array.isArray(road.categories)
            ? <button className="round-btn feed-btn" onClick={() => { if (!wide) return setFeedOpen(true); const p = feedScroll.current; if (p) { p.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" }); const pane = p.closest(".feed-pane"); if (pane) { pane.classList.remove("hl"); void pane.offsetWidth; pane.classList.add("hl"); setTimeout(() => pane.classList.remove("hl"), 1600); } } }} aria-label="Open updates feed">{FEED_ICON}</button>
            : <span />}
        </header>

        <ErrorBoundary where={"hero:" + ((nextFlight && nextFlight.n) || "")}><NextFlightCard f={withRoadFallback(nextFlight, road, now)} checkedAt={checkedAt} road={road}>
          <ErrorBoundary where="log"><RoadCard road={road} onEntryTap={jumpToPost} openReq={roadOpenReq} heroNet={heroNetFor(liveNext, now)} netPending={!liveNext && !nextSettled} heroFlight={withRoadFallback(nextFlight, road, now)} /></ErrorBoundary>
        </NextFlightCard></ErrorBoundary>
        <Connector dashed label={heroLogged ? daysLabel(daysBetween(flights[0].date, nextFlight.date)) : `${daysLabel(daysSinceLatest)} since the last flight`} />

        {flights.map((f, i) => (
          <div key={f.n}>
            <ErrorBoundary where={"past:" + f.n}><FlightCard f={f} open={openId === f.n} onTap={handleTap} onPhotoTap={(src, alt) => setLightbox({ src, alt })} register={register} road={road} /></ErrorBoundary>
            {i < flights.length - 1 && <Connector label={daysLabel(daysBetween(flights[i + 1].date, f.date))} />}
          </div>
        ))}

        <p className="end">That's every flight so far.</p>
      </div>
      <UpdatesFeed road={road} wide={wide} shown={feedOn} onBack={() => setFeedOpen(false)} scrollRef={feedScroll} onPhotoTap={(src, alt) => setLightbox({ src, alt })} peekOpen={peekOpen} onTogglePeek={togglePeek} heroNet={heroNetFor(liveNext, now)} netPending={!liveNext && !nextSettled} />
      </div>
      {phoneHeader}
      <AboutPanel
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        onManageNotifications={() => { setAboutOpen(false); setNotifyModalOpen(true); }}
      />
      <NotifyModal open={notifyModalOpen} onClose={() => setNotifyModalOpen(false)} />
      <Lightbox src={lightbox?.src} alt={lightbox?.alt} onClose={() => setLightbox(null)} />
    </div>
  );
}

/* ───────────── styles ───────────── */

const css = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700&display=swap');

.st {
  --sat: env(safe-area-inset-top, 0px); /* status bar / Dynamic Island (standalone PWA, viewport-fit=cover) */
  --bg: #1A2236; --card: #222D46; --card-open: #27344F; --line: #3B4A6B;
  --slide: .5s cubic-bezier(.32,.72,0,1);        /* pages: same curve as the header pill (swipe settle and taps) */
  --hdr-ease: .5s cubic-bezier(.32,.72,0,1);    /* header pill + titles: iOS-style critically damped settle, one curve for all */
  --spring: .42s cubic-bezier(.34,1.32,.64,1);   /* pill: a touch of overshoot */
  --text: #E4EAF6; --muted: #97A3BD; --faint: #66738F; --red: #EE6B6E;
  min-height: 100vh; color: var(--text);
  background: radial-gradient(130% 55% at 50% -8%, #2E3D63 0%, #1A2236 62%), #1A2236;
  font-family: Manrope, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.st *, .st *::before, .st *::after { box-sizing: border-box; }
html, body, .st { overflow-anchor: none; } /* we handle scroll position ourselves */
.title { flex-wrap: wrap; row-gap: 2px; }
.t-word { white-space: nowrap; }
.st-wrap { max-width: 440px; margin: 0 auto; padding: calc(18px + var(--sat)) 18px 72px; }

/* header */
.top { display: grid; grid-template-columns: 40px 1fr 40px; align-items: center; margin-bottom: 22px; }
.round-btn {
  width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
  border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03); color: var(--muted);
}
.round-btn:focus-visible, .card-head:focus-visible { outline: 2px solid #A9BDF0; outline-offset: 3px; }
.brand { text-align: center; font-weight: 600; font-size: 15px; }
.brand span { display: block; font-weight: 400; font-size: 12px; color: var(--faint); margin-top: 1px; }

/* next flight */
.next {
  border-radius: 24px; padding: 18px 18px 20px;
  background: linear-gradient(160deg, #3B4878 0%, #2B3558 100%);
  border: 1px solid rgba(170,190,245,.25);
  box-shadow: 0 24px 48px -28px rgba(8,12,28,.9);
}
.next-top { display: flex; justify-content: space-between; align-items: flex-start; }
.watch-badge {
  display: inline-flex; align-items: center; gap: 7px;
  border-radius: 10px; padding: 6px 10px; font-size: 13px; font-weight: 600;
  white-space: nowrap; text-decoration: none;
  color: rgba(255,255,255,.45); background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.1);
}
.watch-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: none; }
a.watch-badge-live {
  color: #fff; background: var(--red); border-color: var(--red); cursor: pointer;
  box-shadow: 0 10px 22px -10px rgba(238,107,110,.8);
}
a.watch-badge-live:active { transform: scale(.96); }
.watch-badge-live .watch-dot { background: #fff; animation: watch-pulse 1.1s ease-in-out infinite; }
@keyframes watch-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .2; } }
.cd { display: inline-flex; border-radius: 10px; overflow: hidden; font-size: 13px; font-weight: 600; }
.cd-tag { background: var(--red); color: #fff; padding: 6px 9px; }
.cd-val { background: #F4F6FB; color: #1D2540; padding: 6px 10px; font-variant-numeric: tabular-nums; }
.cd-tbc { background: rgba(255,255,255,.1); color: #fff; }
.cd-inflight .cd-tag-live {
  background: linear-gradient(135deg, #EE6B6E 0%, #F0A05A 100%);
  animation: inflight-pulse 1.4s ease-in-out infinite;
}
.cd-tag-outcome.cd-tag-success { background: #3E8F6A; }
.cd-tag-outcome.cd-tag-partial { background: #A8893A; }
.cd-tag-outcome.cd-tag-failure { background: #C45656; }
.cd-tag-outcome.cd-tag-pending { background: rgba(255,255,255,.18); }
@keyframes inflight-pulse {
  0%, 100% { filter: brightness(1); box-shadow: 0 0 0 0 rgba(238,107,110,.45); }
  50% { filter: brightness(1.12); box-shadow: 0 0 0 6px rgba(238,107,110,0); }
}
.next-title { display: flex; align-items: baseline; gap: 8px; margin: 22px 0 16px; }
.next-title .t-word { font-size: 21px; font-weight: 600; color: var(--text); }
.next-title .t-num { font-size: 30px; font-weight: 400; line-height: .9; letter-spacing: -.015em; }
.facts { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; font-size: 13.5px; margin: 0 0 14px; }
.facts dt { color: #AAB6D6; }
.facts dd { margin: 0; }
.facts .pred-basis { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; }
.next-note { font-size: 13.5px; line-height: 1.55; color: #CDD6EE; margin: 0; }
.next-upd { font-size: 13.5px; line-height: 1.55; color: #CDD6EE; margin: 6px 0 0; overflow-wrap: break-word; } /* one flowing mission paragraph, same look as the note */

/* connector between cards */
.gap { position: relative; height: 46px; }
.gap-line { position: absolute; left: 54px; top: 0; bottom: 0; width: 1px; background: var(--line); }
.gap-line.dashed { background: none; border-left: 1px dashed #5A6A9A; }
.gap-label { position: absolute; left: 68px; top: 50%; transform: translateY(-50%); font-size: 12px; color: var(--faint); font-variant-numeric: tabular-nums; }

/* flight card */
.card { background: var(--card); border-radius: 18px; transition: background-color .3s; }
.card.is-open { background: var(--card-open); }
.card-head { -webkit-tap-highlight-color: transparent; touch-action: manipulation; position: relative; display: grid; grid-template-columns: 84px 1fr; gap: 14px; padding: 12px; cursor: pointer; border-radius: 18px; }
.photo {
  position: relative; overflow: hidden; border-radius: 12px; display: grid; place-items: center;
  background: linear-gradient(165deg, #34466E 0%, #1C263D 100%); color: #8EA3D4;
}
.photo svg { height: 62%; width: auto; opacity: .28; }
.photo-thumb { width: 84px; height: 104px; }
.photo-wide { aspect-ratio: 4 / 3; }
.photo-wide svg { height: 48%; }
.photo-cap { position: absolute; left: 9px; bottom: 7px; font-size: 10.5px; color: rgba(220,228,245,.55); }
.photo.has-img img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  filter: saturate(88%) contrast(104%) brightness(92%);
}
.photo.has-img::after {
  content: ""; position: absolute; inset: 0;
  background:
    linear-gradient(180deg, rgba(26,34,54,0) 55%, rgba(26,34,54,.85) 100%),
    linear-gradient(200deg, rgba(59,72,120,.35) 0%, rgba(26,34,54,0) 55%);
}
.photo-credit { position: absolute; right: 8px; bottom: 6px; font-size: 9.5px; letter-spacing: .02em; color: rgba(228,234,246,.65); z-index: 1; }
.photo-thumb .photo-credit { display: none; } /* keep the small thumbnail clean; credit shows on the bigger gallery images */
.photo.tappable { cursor: pointer; }

/* lightbox */
.lightbox {
  position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; padding: 24px;
  background: rgba(8,12,24,0); opacity: 0; pointer-events: none;
  transition: opacity .25s, background-color .25s;
}
.lightbox.show { opacity: 1; pointer-events: auto; background: rgba(8,12,24,.9); }
.lightbox img { max-width: 100%; max-height: 100%; border-radius: 12px; box-shadow: 0 30px 60px -20px rgba(0,0,0,.7); }
.info { min-width: 0; padding-top: 2px; }
.info-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.title { display: flex; align-items: baseline; gap: 6px; }
.title .t-word { font-size: 17px; font-weight: 600; color: var(--text); }
.title .t-num { font-size: 21px; font-weight: 400; line-height: 1; letter-spacing: -.01em; }
.date { font-size: 14px; font-weight: 500; margin-top: 8px; }
.sub { font-size: 12.5px; color: var(--muted); margin-top: 3px; }
.pill { font-size: 11.5px; font-weight: 600; padding: 4px 9px; border-radius: 999px; white-space: nowrap; }
.pill-success { background: rgba(124,200,158,.14); color: #9EDBB8; }
.pill-partial { background: rgba(230,200,115,.15); color: #EBD38C; }
.pill-failure { background: rgba(238,120,120,.15); color: #F2A2A2; }
.chev { position: absolute; right: 14px; bottom: 14px; color: var(--faint); transition: transform .35s; }
.card.is-open .chev { transform: rotate(180deg); }

/* expand in place */
.more { display: grid; grid-template-rows: 0fr; } /* animated in JS, see useLayoutEffect */
.card.is-open .more { grid-template-rows: 1fr; }
.more-inner { overflow: hidden; }
.more-pad { padding: 2px 16px 16px; opacity: 0; transition: opacity .25s; }
.card.is-open .more-pad { opacity: 1; transition: opacity .35s .12s; }
.headline { font-size: 16px; font-weight: 600; margin: 6px 0 8px; }
.story { font-size: 14px; line-height: 1.62; color: #C9D2E6; margin: 0 0 14px; }
.gallery { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.past-toggle { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px 8px 14px; margin: 0 0 12px;
  border-radius: 999px; font: inherit; font-size: 13px; font-weight: 700; color: var(--text); cursor: pointer; -webkit-tap-highlight-color: transparent;
  background: rgba(12,16,32,.55); border: 1px solid rgba(170,190,245,.16); transition: background-color .15s, border-color .15s; }
.past-toggle-title { flex: none; white-space: nowrap; }
.past-toggle .road-count { flex: 1; font-size: 12px; font-weight: 500; color: var(--muted); white-space: nowrap; }
.past-toggle:active { border-color: rgba(170,190,245,.3); }
.past-toggle:focus-visible { outline: 2px solid rgba(170,190,245,.5); outline-offset: 2px; }
.past-chev { color: var(--text); flex: none; transition: transform .35s; }
.past-toggle.open .past-chev { transform: rotate(180deg); }
.past-wrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .45s cubic-bezier(.2,.8,.2,1); }
.past-wrap.open { grid-template-rows: 1fr; }
.past-wrap-inner { overflow: hidden; min-height: 0; }
/* Every past box is ONE fixed size at every width: border + padding + title row + gap + 2 text lines (= 76.1px). Text is summarised to fit (PastText tiers). */
.past-sum { --past-lh: calc(12px * 1.38); --past-top: 19px; --past-gap: 5px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0 0 14px;
  grid-auto-rows: calc(2px + 8px + 9px + var(--past-top) + var(--past-gap) + 2 * var(--past-lh)); }
.past-box { background: #1A2338; border: 1px solid rgba(170,190,245,.12); border-radius: 12px; padding: 8px 10px 9px; min-width: 0; height: 100%; box-sizing: border-box; overflow: hidden; }
.past-box-top { display: flex; flex-wrap: nowrap; justify-content: space-between; align-items: center; gap: 6px; height: var(--past-top); min-width: 0; }
.past-veh { font-size: 11.5px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.past-box p { margin: var(--past-gap) 0 0; font-size: 12px; line-height: var(--past-lh); color: #C9D2E6; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
.past-pill { font-size: 9.5px; font-weight: 700; letter-spacing: .02em; padding: 2px 7px; border-radius: 999px; white-space: nowrap; flex-shrink: 0;
  color: var(--t, var(--c)); background: var(--bg, color-mix(in srgb, var(--c) 14%, transparent)); border: 1px solid color-mix(in srgb, var(--c) 38%, transparent); }
.past-box[data-id="raptor"] .past-pill { color: #F2F4F8; background: rgba(14,15,17,.35); border: 1.5px solid #0E0F11; box-shadow: 0 0 0 1px rgba(255,255,255,.35); } /* same as .chip.chip-raptor: readable label on the near-black fill */
.highlights-link {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  margin-top: 12px; padding: 9px 14px; border-radius: 11px;
  background: rgba(150,165,235,.12); border: 1px solid rgba(170,190,245,.32);
  color: #C9D3F5; font-size: 12.5px; font-weight: 600; text-decoration: none;
}
.highlights-link:active { background: rgba(150,165,235,.2); }
.highlights-link svg { flex: none; }
.highlights-soon { background: rgba(255,255,255,.03); border-style: dashed; border-color: rgba(170,190,245,.2); color: var(--faint); font-weight: 500; cursor: default; }
.highlights-soon:active { background: rgba(255,255,255,.03); }
.end { text-align: center; color: var(--faint); font-size: 12px; margin-top: 28px; }

/* about panel */
.scrim { position: fixed; inset: 0; z-index: 20; background: rgba(8,12,24,.55); opacity: 0; pointer-events: none; transition: opacity .3s; }
.scrim.show { opacity: 1; pointer-events: auto; cursor: pointer; touch-action: none; -webkit-tap-highlight-color: transparent; } /* cursor:pointer makes iOS Safari fire the tap */
.about {
  position: fixed; top: 0; bottom: 0; left: 0; z-index: 21; width: min(84vw, 340px); overflow-y: auto;
  padding: 18px 22px calc(28px + env(safe-area-inset-bottom)); background: #202A42; border-right: 1px solid rgba(255,255,255,.06);
  overscroll-behavior: contain; /* scrolling to the end of the menu doesn't scroll the page behind it */
  transform: translateX(-102%); visibility: hidden;
  transition: transform .4s cubic-bezier(.2,.75,.2,1), visibility 0s .4s;
}
.about.show { transform: none; visibility: visible; transition: transform .4s cubic-bezier(.2,.75,.2,1); }
.about h2 { font-size: 20px; font-weight: 600; margin: 14px 0 8px; }
.about p { font-size: 14px; line-height: 1.6; color: #C9D2E6; margin: 0; }
.about dl { margin: 8px 0 0; }
.about dt { font-size: 12.5px; color: var(--faint); margin-top: 18px; }
.about dd { margin: 4px 0 0; font-size: 14px; line-height: 1.55; }
.about .about-foot { margin-top: 32px; font-size: 12px; color: var(--faint); }

/* notifications: manage button (in About) + the enable/disable modal */
.notify-manage-btn {
  font-size: 13px; font-weight: 600; color: #C9D3F5; cursor: pointer;
  background: rgba(150,165,235,.12); border: 1px solid rgba(170,190,245,.32);
  border-radius: 10px; padding: 7px 12px;
}
.notify-manage-btn:active { background: rgba(150,165,235,.2); }
.notify-modal {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  z-index: 25; width: min(86vw, 340px);
  background: #202A42; border-radius: 18px; padding: 22px 22px 20px;
  border: 1px solid rgba(255,255,255,.06); box-shadow: 0 30px 60px -20px rgba(0,0,0,.7);
}
.notify-modal h2 { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
.notify-modal p { font-size: 14px; line-height: 1.55; color: #C9D2E6; margin: 0 0 18px; }
.notify-actions { display: flex; justify-content: flex-end; gap: 10px; }
.notify-btn { font-size: 13.5px; font-weight: 600; padding: 8px 14px; border-radius: 10px; border: none; cursor: pointer; }
.notify-btn-quiet { background: transparent; color: #AAB6D6; }
.notify-btn-primary { background: #4A63A8; color: white; }
.notify-btn:disabled { opacity: .6; }

/* feedback: the "What would you add?" box at the bottom of the About menu */
.feedback-box {
  margin-top: 28px; padding: 16px 16px 16px; border-radius: 16px;
  background: rgba(150,165,235,.08); border: 1px solid rgba(170,190,245,.22);
}
.feedback-box.typing { margin-bottom: 45vh; } /* room to scroll above the iPhone keyboard */
.feedback-box h3 { font-size: 16px; font-weight: 600; margin: 0 0 6px; }
.about .feedback-box p { font-size: 13.5px; line-height: 1.55; color: #C9D2E6; margin: 0 0 12px; }
.feedback-field {
  display: block; width: 100%; margin: 0;
  font: inherit; font-size: 16px; line-height: 1.5; color: var(--text); /* 16px+ stops iPhone zooming in on tap */
  background: rgba(255,255,255,.05); border: 1px solid rgba(170,190,245,.28); border-radius: 12px;
  padding: 10px 12px; -webkit-appearance: none; appearance: none;
}
textarea.feedback-field { resize: none; min-height: 112px; }
.feedback-field::placeholder { color: var(--faint); opacity: 1; }
.feedback-field:focus { outline: none; border-color: #A9BDF0; box-shadow: 0 0 0 3px rgba(169,189,240,.16); }
.feedback-field:disabled { opacity: .6; }
.feedback-handle { margin-top: 8px; padding: 8px 12px; }
.feedback-count { text-align: right; font-size: 11.5px; color: var(--faint); margin-top: 5px; font-variant-numeric: tabular-nums; }
.about .feedback-box .feedback-error { font-size: 13px; color: #F2A2A2; margin: 10px 0 0; }
.feedback-send { display: block; width: 100%; margin-top: 12px; padding: 11px 14px; font-size: 14px; }
.feedback-send:disabled { opacity: .4; cursor: default; }
.feedback-again {
  font: inherit; font-size: 13.5px; font-weight: 600; color: #C9D3F5; cursor: pointer;
  background: none; border: none; padding: 0; text-decoration: underline; text-underline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .st *, .st *::before, .st *::after { transition: none !important; animation: none !important; }
}
/* road to flight N (data in road.json) */
.road {
  margin: 16px 0 0; background: none; border: 0; box-shadow: none;
}
.road-head { all: unset; box-sizing: border-box; width: 100%; cursor: pointer; display: flex; align-items: center; gap: 8px;
  padding: 8px 12px 8px 14px; border-radius: 999px; background: rgba(12,16,32,.55); border: 1px solid rgba(170,190,245,.16);
  -webkit-tap-highlight-color: transparent; color: var(--text); }
.road-head:focus-visible { outline: 2px solid #A9BDF0; outline-offset: 2px; border-radius: 999px; }
.road-title { flex: none; }
.road-title h2 { font-size: 13px; font-weight: 700; margin: 0; white-space: nowrap; }
.road-sum:has(.road-xoff) { gap: 8px; } /* room for the chip on a 390px phone */
.road-sum:has(.road-xoff) .road-count { white-space: nowrap; }
.road-xoff { flex: none; font-size: 10.5px; font-weight: 600; padding: 2px 6px; border-radius: 999px; background: rgba(238,120,120,.15); color: #F2A2A2; white-space: nowrap; } /* 9 Nov: X feed offline chip (pill-failure colours) */
.road-sum { display: flex; align-items: center; gap: 8px; margin-top: 0; flex: 1; min-width: 0; color: var(--muted); font-size: 12px; }
.road-dots { display: flex; gap: 5px; flex: none; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: block; border: 1.5px solid var(--c); background: transparent; } /* ○ empty = not yet */
.dot-progress { background: linear-gradient(90deg, var(--c) 50%, transparent 50%); } /* ◐ half = one vehicle / one test completed */
.dot-done, .dot-complete { background: var(--c); } /* ● full = every Flight N vehicle done, or official; ring and fill always the same colour */
.road-count { flex: 1; white-space: nowrap; }
.road-chev { flex: none; transition: transform .35s; }
.main-open .road-chev { transform: rotate(180deg); }
.road-list { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .5s cubic-bezier(.2,.8,.2,1); }
.main-open .road-list { grid-template-rows: 1fr; }
.road-list-inner { overflow: hidden; padding: 0; }
.main-open .road-list-inner { padding-top: 10px; padding-bottom: 0; }
.callout {
  position: relative; border-radius: 18px; margin-bottom: 10px; overflow: hidden;
  background: var(--card); /* solid, like the flight log cards */
  border: 1px solid color-mix(in srgb, var(--c) 22%, rgba(170,190,245,.12));
  box-shadow: inset 4px 0 0 var(--c), 0 10px 26px -20px color-mix(in srgb, var(--c) 60%, transparent);
  transition: box-shadow .3s, background .3s;
}
.callout.open { box-shadow: inset 4px 0 0 var(--c), 0 0 26px -6px color-mix(in srgb, var(--c) 55%, transparent); }
.callout-head {
  all: unset; box-sizing: border-box; width: 100%; cursor: pointer; display: grid;
  grid-template-columns: 34px 1fr auto; gap: 10px; align-items: start; padding: 14px 14px 14px 18px;
}
.callout-icon { font-size: 22px; line-height: 1.2; }
.callout-head.callout-static { cursor: default; -webkit-tap-highlight-color: transparent; } /* 13 Nov: item with no drawer: not tappable */
/* Same size everywhere: every box head is the same height (summary clamped to 2 lines), every vehicle sub-card
   is full width with the same padding and minimum height. */
/* Road box head: icon + title + pill on one centred top row; the summary sits under that row at full width
   (no fixed height, no empty bottom space). */
section.road .callout-head { grid-template-columns: auto 1fr auto; column-gap: 8px; row-gap: 3px; align-items: center; padding: 10px 12px 11px 16px; }
section.road .callout-body { display: contents; }
section.road .callout-icon { grid-row: 1; grid-column: 1; font-size: 18px; line-height: 1; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; }
section.road .callout-icon .cat-img { height: 25px; } /* 3 Nov: Raptor icon slightly bigger */
section.road .callout-name { grid-row: 1; grid-column: 2; min-width: 0; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
section.road .callout-head > .badge, section.road .callout-head > .badge-wrap { grid-row: 1; grid-column: 3; justify-self: end; }
section.road .callout-head .badge { padding: 3px 8px; font-size: 10.5px; }
section.road .callout-head .badge-wrap { flex-direction: row-reverse; gap: 6px; }
section.road .callout-latest { grid-row: 2; grid-column: 2 / -1; margin-top: 0; overflow-wrap: anywhere; text-wrap: pretty; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.mini.flog-card { box-sizing: border-box; width: 100%; min-height: 96px; padding: 10px 12px; }
.callout-name { display: block; font-weight: 700; font-size: 15px; color: var(--t, var(--c)); }
.callout-latest { display: block; font-size: 13px; color: var(--text); margin-top: 3px; line-height: 1.35; }
.badge { font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 999px; white-space: nowrap; letter-spacing: .02em; }
.badge-done, .badge-complete { background: var(--c); color: var(--on, #141B2D); border: 1px solid var(--c); } /* filled = done / confirmed */
.badge-progress, .badge-pending { background: transparent; color: var(--t, var(--c)); border: 1px solid color-mix(in srgb, var(--c) 70%, transparent); } /* outline */
.badge-none { background: transparent; color: var(--t, var(--c)); border: 1px solid color-mix(in srgb, var(--c) 45%, transparent); } /* ○ not yet: faint outline */
.callout-hist { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .45s cubic-bezier(.2,.8,.2,1); }
.callout.open .callout-hist { grid-template-rows: 1fr; }
.callout-hist-inner { overflow: hidden; padding: 0 14px 0 30px; position: relative; }
.callout.open .callout-hist-inner { padding-bottom: 14px; }
.callout-hist-inner::before { content: ""; position: absolute; left: 22px; top: 4px; bottom: 18px; width: 2px; background: color-mix(in srgb, var(--c) 40%, transparent); }
.mini { position: relative; background: #1A2338; border: 1px solid rgba(170,190,245,.12); border-radius: 12px; padding: 9px 11px; margin-top: 8px; }
.road .mini.glow { border-color: color-mix(in srgb, var(--c) 45%, transparent); box-shadow: 0 0 12px -2px color-mix(in srgb, var(--c) 45%, transparent); } /* Flight Log only: finished vehicle box, soft glow in the section colour */
.mini::before { content: ""; position: absolute; left: -12px; top: 14px; width: 8px; height: 8px; box-sizing: border-box; border-radius: 50%; background: transparent; border: 1.5px solid var(--c); } /* hollow = this vehicle has not completed the category */
.mini.done::before { background: var(--c); } /* filled = completed; ring and fill always the same colour */
/* Raptor (A2): near-black #0E0F11 accent bar with a light rim, graphite halo, white title, see-through pill with a dark border + light rim, solid black connector line */
.callout[data-id="raptor"] { border-color: rgba(255,255,255,.22) !important; box-shadow: inset 4px 0 0 #0E0F11, inset 5px 0 0 rgba(255,255,255,.4), 0 0 22px 1px rgba(200,210,230,.32) !important; }
.callout[data-id="raptor"] .callout-name { color: #F2F4F8; }
.callout[data-id="raptor"] .mini-date { color: #C9CDD6; }
.callout[data-id="raptor"] .badge { color: #E8EAEE; background: rgba(14,15,17,.35); border: 1.5px solid #0E0F11; box-shadow: 0 0 0 1px rgba(255,255,255,.35); }
.callout[data-id="raptor"] .mini::before { box-shadow: 0 0 0 1px rgba(255,255,255,.5); }
.callout[data-id="raptor"] .mini.glow { border-color: rgba(255,255,255,.18); box-shadow: 0 0 12px -2px rgba(200,210,230,.25); }
.callout[data-id="raptor"] .callout-hist-inner::before { background: #0E0F11; } /* main connector line: solid black */
.flog-name { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #8E9AB8; margin-bottom: 3px; }
.mini-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.mini-date { font-size: 12px; font-weight: 700; color: var(--t, var(--c)); }
.mini-src { font-size: 10.5px; color: var(--muted); background: rgba(255,255,255,.07); padding: 2px 7px; border-radius: 6px; }
.mini p { margin: 4px 0 0; font-size: 13px; line-height: 1.4; } /* the update that finished the stage */
.mini-check { border-style: dashed; } /* "no news yet" placeholder */
.mini-phase { margin-left: 6px; font-size: 10.5px; font-weight: 700; padding: 1px 6px; border-radius: 6px; background: rgba(170,182,214,.16); color: #AAB6D6; }
.mini-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin: 5px 0 2px; }
.mini-tags .mini-unc, .mini-tags .mini-phase, .mini-tags .mini-tier { margin: 0; }
.mini-media { position: relative; margin: 8px 0 2px; border-radius: 10px; overflow: hidden; aspect-ratio: 16 / 9; background: #0E1424; }
.mini-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.mini-ctx { position: absolute; left: 6px; top: 6px; font-size: 10px; padding: 2px 6px; border-radius: 6px; background: rgba(10,14,28,.7); color: #C9D4F2; }
.mini-date { white-space: nowrap; }
.buildup .bu-top { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; min-width: 0; white-space: nowrap; }
.buildup .bu-top .bu-date { flex: none; }
.buildup .bu-top .mini-tier { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 0 1 auto; margin: 0; }
.buildup .bu-text { margin-top: 2px; }
.buildup.feed-bu ul { padding-left: 0; margin-left: 0; margin-right: 0; list-style: none; } /* Road page */
.buildup.feed-bu li { padding: 0 2px; margin-left: 0; margin-right: 0; }
.feed-bu .bu-pill { box-sizing: border-box; width: 100%; } /* same left/right edges as the post image */
.buildup.feed-bu li.bu-pill { padding: 12px 16px; margin: 6px 0; border: 1px solid rgba(255,255,255,.14); border-radius: 10px; background: rgba(255,255,255,.035); cursor: pointer; -webkit-tap-highlight-color: transparent; }
.feed-bu .bu-pill:focus-visible { outline: 2px solid #A9BDF0; outline-offset: 2px; }
.buildup.feed-bu li.bu-pill.bu-nolink { cursor: default; } /* boxed like the others, no link */
.feed-bu .bu-pill .post-credit { margin-top: 4px; }
.buildup.feed-bu li.bu-pill.bu-ext { padding: 0; }
.feed-bu .bu-pill.bu-ext > a { grid-column: 1 / -1; display: block; padding: 12px 16px; color: inherit; text-decoration: none; border-radius: 10px; -webkit-tap-highlight-color: transparent; }
.feed-bu .bu-pill.bu-ext > a:focus-visible { outline: 2px solid #A9BDF0; outline-offset: 2px; }
.mini-tier { margin-left: 6px; font-size: 10.5px; font-weight: 600; padding: 1px 6px; border-radius: 6px; background: rgba(255,255,255,.06); color: #AAB6D6; }
.mini-tier.tier-1 { color: #6EE7A0; } .mini-tier.tier-3 { color: #F9A8D4; font-style: italic; }
.mini-phase.ph-completed { background: rgba(74,222,128,.16); color: #6EE7A0; }
.mini-phase.ph-progress { background: rgba(250,204,21,.14); color: #FACC15; }
.buildup { margin-top: 6px; font-size: 12.5px; color: var(--muted, #AAB6D6); }
.buildup summary { cursor: pointer; font-weight: 500; font-size: 11.5px; color: var(--faint, #8592B5); list-style: none; }
.buildup summary::after { content: " ⌄"; }
.buildup[open] summary::after { content: " ⌃"; }
.buildup:not(.feed-bu) summary { display: inline-flex; align-items: center; gap: 4px; line-height: 1.2; } /* Flight Log: chevron at text height */
.buildup:not(.feed-bu) summary::-webkit-details-marker { display: none; }
.buildup:not(.feed-bu) summary::after { content: "⌄"; display: inline-block; line-height: 1; transform: translateY(-0.2em); }
.buildup:not(.feed-bu)[open] summary::after { content: "⌃"; transform: translateY(0.15em); }
.buildup summary::-webkit-details-marker { display: none; }
.buildup ul { margin: 6px 0 0; padding-left: 16px; }
.buildup li { margin: 3px 0; }
.buildup a { color: inherit; }
.buildup li.bu-tap { cursor: pointer; -webkit-tap-highlight-color: transparent; outline: none; } /* invisible tap area: no box, border or underline */
.buildup li.bu-tap:focus-visible { outline: 2px solid #A9BDF0; outline-offset: 2px; border-radius: 4px; }
.road .callout-head .badge { display: inline-block; box-sizing: border-box; width: auto; min-width: 0; max-width: none; text-align: center; flex: none; border-width: 1.5px; } /* same border on every pill (filled, outline, dotted, Raptor) */
.badge-stack { display: inline-grid; justify-items: center; }
.badge-stack > span { grid-area: 1 / 1; white-space: nowrap; }
.badge-ghost { visibility: hidden; } /* sizes every pill to the widest label in the card */
.badge-wrap { display: inline-flex; flex-direction: column; align-items: center; gap: 3px; flex: none; }
.post-status { margin-left: auto; }
.badge-count { font-size: 10.5px; color: var(--muted, #AAB6D6); }
.bu-date { font-weight: 700; margin-right: 4px; }
.xm-ctx { font-size: 11px; opacity: .75; margin-right: auto; }
.mini-unc { margin-left: 7px; font-size: 10px; font-weight: 700; letter-spacing: .02em; color: #FFC93D; border: 1px dashed rgba(255,201,61,.65); padding: 1px 6px; border-radius: 6px; vertical-align: 1px; } /* single smaller source: never shown as fact */

/* updates feed */
.feed { position: relative; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; }
@media (min-width: 900px) { .feed { scrollbar-width: none; } .feed::-webkit-scrollbar { display: none; } } /* desktop column: no bar; phone Road page keeps its own (it owns the scroll) */
.feed-head {
  position: sticky; top: 0; z-index: 3;
  display: grid; grid-template-columns: 40px 1fr 40px; align-items: center;
  padding: calc(18px + var(--sat)) 18px 12px;
  background: linear-gradient(180deg, rgba(38,51,84,.985) 0%, rgba(33,44,72,.975) 100%);
  -webkit-backdrop-filter: blur(18px) saturate(140%); backdrop-filter: blur(18px) saturate(140%);
  border-bottom: 1px solid rgba(170,190,245,.10);
}
.feed-head .brand { line-height: 1.3; }
.feed-list { padding: 14px 18px calc(72px + env(safe-area-inset-bottom)); max-width: 440px; margin: 0 auto; }
.feed-list .end { margin-top: 24px; }
.feed-list > .post:has(+ .end) { margin-bottom: 0; }
/* Road-tab flight card (14 Nov, tusk/mock/liftoff.html + toggle.html): one card holds the header, the live row and,
   when open, the flight's updates under a divider. Values copied from the mock. */
.feed-section.rfs { margin: 0 0 14px; background: #28304b; border: 1px solid #3a4363; border-radius: 22px; padding: 16px 12px; overflow: hidden; container-type: inline-size; }
/* 12px sides: the phone card is 4px narrower than the mock's, so its 328px content row (pill + date) stays the same */
.feed-section.rfs.has-live:not(.is-open) { padding-bottom: 18px; }
.feed-pill { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 8px;
  color: #e8ecf7; font: inherit; -webkit-tap-highlight-color: transparent; }
button.feed-pill { cursor: pointer; }
button.feed-pill:focus-visible { outline: 2px solid #A9BDF0; outline-offset: 4px; border-radius: 8px; }
.feed-pill-title { flex: none; font-size: 17px; font-weight: 700; white-space: nowrap; }
.feed-pill .road-dots { margin-left: 4px; }
.feed-pill .road-count { flex: 1; margin-left: 6px; font-size: 14px; font-weight: 500; color: #9aa3bd; white-space: nowrap; }
.feed-pill-action { flex: none; display: inline-flex; align-items: center; gap: 5px; font-size: 15px; font-weight: 600; color: #e8ecf7; }
/* live row: glowing pill (text · dot · Watch now) and the push's UK time on the right */
.rfs-row { display: flex; align-items: center; gap: 6px; margin-top: 16px; }
.rfs-live { display: inline-flex; align-items: center; gap: 7px; min-width: 0; padding: 4px 4px 4px 11px; border-radius: 999px;
  border: 1px solid rgba(255,92,92,.85); box-shadow: 0 0 8px rgba(255,70,70,.45), inset 0 0 6px rgba(255,70,70,.18);
  background: rgba(255,70,70,.07); color: #e8ecf7; font-size: 13px; font-weight: 600; white-space: nowrap; text-decoration: none; -webkit-tap-highlight-color: transparent; }
.rfs-live-txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.rfs-sep { flex: none; width: 6px; height: 6px; border-radius: 50%; background: #ff8a8a; }
.rfs-watch { flex: none; background: #ff5a5a; color: #fff; padding: 4px 9px; border-radius: 999px; font-weight: 700; }
.rfs-live:active .rfs-watch { background: #ff4545; }
.rfs-live:focus-visible { outline: 2px solid #A9BDF0; outline-offset: 2px; }
.rfs-date { margin-left: auto; color: #9aa3bd; font-size: 12px; white-space: nowrap; line-height: 1; display: inline-flex; align-items: center; }
.rfs-dsep { white-space: pre; }
/* narrow phones (360): the date stacks over the time so the pill text is never cut */
@container (max-width: 316px) { .rfs-date { flex-direction: column; align-items: flex-end; gap: 3px; } .rfs-dsep { display: none; }
  .rfs .feed-pill .rc-full { display: none; } .rfs .feed-pill .rc-short { display: inline; } }
.feed-pill .rc-short { display: none; }
.feed-pill .road-count { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* updates slide out inside the same card, under a divider */
.rfs-feed { margin-top: 16px; padding-top: 14px; border-top: 1px solid #3a4363; display: flex; flex-direction: column; gap: 10px; }
.rfs-feed .post { margin: 0; background: #222a43; border: 1px solid #343d5c; border-radius: 16px; padding: 12px; box-shadow: none; }
.rfs-feed .post::after { border-radius: 16px; }
.rfs-feed .post-date { font-size: 12px; font-weight: 500; color: #9aa3bd; }
.rfs-feed .post > .post-text { margin-top: 9px; font-size: 14px; }
.rfs-feed .rtf-soon { margin: 0; }
.rfs-extra { display: none; }
.rfs.show-all .rfs-extra { display: contents; }
.rfs-more { all: unset; box-sizing: border-box; display: inline-flex; align-self: center; align-items: center; gap: 5px; margin-top: 4px; padding: 2px 8px;
  color: #9aa3bd; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.rfs-more:focus-visible { outline: 2px solid #A9BDF0; border-radius: 6px; }
.deck-wrap { display: grid; grid-template-rows: 0fr; }
.deck-wrap.open { grid-template-rows: 1fr; }
.deck-wrap.deck-animate { transition: grid-template-rows 300ms ease, opacity 300ms ease; }
.deck-wrap.deck-animate:not(.open) { opacity: 0; pointer-events: none; }
.deck-wrap.deck-no-motion { transition: none; }
.deck-inner { min-height: 0; overflow: hidden; }
/* Cards fan in on open (transform/opacity only). Total span stays inside 250–350ms. */
.deck-wrap.deck-animate.open .rfs-feed > .post,
.deck-wrap.deck-animate.open .rtf-soon {
  animation: deck-fan 200ms ease both;
}
.deck-wrap.deck-animate.open .rfs-feed > .post:nth-child(1) { animation-delay: 20ms; }
.deck-wrap.deck-animate.open .rfs-feed > .post:nth-child(2) { animation-delay: 50ms; }
@keyframes deck-fan {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: none; }
}
.deck-wrap.deck-no-motion .rfs-feed > .post,
.deck-wrap.deck-no-motion .rtf-soon { animation: none; }
.rtf-teaser {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; min-height: 44px; margin: 12px 0 0; padding: 10px 8px;
  border: 0; background: none; box-shadow: none; cursor: pointer;
  color: var(--faint); font: inherit; font-size: 14px; font-weight: 500;
  text-align: center; line-height: 1.35;
}
.rtf-teaser:active { color: color-mix(in srgb, var(--faint) 90%, #fff); }
.rtf-chevron { flex: none; transition: transform 300ms ease; }
.rtf-chevron.open { transform: rotate(180deg); }
.rtf-peek-wrap {
  display: grid; grid-template-rows: 0fr; opacity: 0;
  transition: grid-template-rows 250ms ease, opacity 250ms ease;
  pointer-events: none;
}
.rtf-peek-wrap.open { grid-template-rows: 1fr; opacity: 1; pointer-events: auto; }
.rtf-peek-wrap.rtf-no-motion { transition: none; }
.rtf-peek-inner { overflow: hidden; min-height: 0; }
.rtf-peek { margin-top: 32px; padding-bottom: 32px; }
.rtf-peek-rule { height: 0; border: 0; border-top: 1px solid rgba(170,190,245,.12); margin: 0 24px; }
.rtf-peek-eyebrow {
  margin: 16px 0 0; padding: 0;
  font-size: 12px; font-weight: 500; line-height: 1.3;
  color: var(--faint); letter-spacing: .08em;
  font-variant: small-caps; text-transform: uppercase; text-align: left;
}
.rtf-peek-title {
  margin: 4px 0 0; padding: 0;
  font-size: 18px; font-weight: 600; line-height: 1.3;
  color: var(--text); text-align: left;
}
.rtf-soon {
  margin: 16px 0 0; padding: 0;
  font-size: 14px; font-weight: 500; line-height: 1.45;
  color: var(--faint); text-align: left;
}
.post {
  position: relative; margin-bottom: 10px;
  background: var(--card); border: 1px solid rgba(170,190,245,.12); border-radius: 18px;
  padding: 14px 16px; box-shadow: 0 18px 40px -28px rgba(8,12,28,.9);
}
.post::after { /* tap-to-post highlight */
  content: ""; position: absolute; inset: -1px; border-radius: 18px; pointer-events: none; opacity: 0;
  background: var(--bg, color-mix(in srgb, var(--c) 8%, transparent));
  border: 1.5px solid color-mix(in srgb, var(--c) 75%, transparent);
  box-shadow: 0 0 30px -4px color-mix(in srgb, var(--c) 55%, transparent);
}
.post.hl::after { animation: post-hl 2.2s forwards; }
@keyframes post-hl { 0% { opacity: 0; } 11% { opacity: 1; animation-timing-function: linear; } 45% { opacity: 1; animation-timing-function: cubic-bezier(.45,0,.25,1); } 100% { opacity: 0; } }
.post-top { display: flex; align-items: center; gap: 8px; min-height: 24px; }
.chip {
  display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px 0 7px;
  border-radius: 999px; font-size: 11.5px; font-weight: 700; letter-spacing: .02em; white-space: nowrap; color: var(--t, var(--c));
  background: var(--bg, color-mix(in srgb, var(--c) 13%, transparent)); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
}
.chip.chip-raptor { color: #F2F4F8; background: rgba(14,15,17,.35); border: 1.5px solid #0E0F11; box-shadow: 0 0 0 1px rgba(255,255,255,.35); } /* Raptor (A2): same as the In progress pill, white label */
.cat-img { height: 1.2em; width: auto; vertical-align: middle; display: inline-block; }
.chip-i { font-size: 12px; line-height: 1; letter-spacing: 0; }
.post-sep { color: var(--faint); font-size: 12.5px; }
.post-date { font-size: 12.5px; font-weight: 600; color: var(--muted); white-space: nowrap; margin-left: auto; text-align: right; } /* 3 Nov: right edge, in line with View on X */
.post-top { gap: 6px; } .post-top .chip-2 { margin-left: -1px; }
.post-top .mini-unc { margin-left: auto; vertical-align: 0; }
.post-text { margin: 9px 0 0; font-size: 14.5px; line-height: 1.5; color: var(--text); }
.post-photo { margin-top: 10px; }
.post-credit { margin-top: 10px; }
/* Road page: main View on X sits 8px under the image; with Earlier updates it shares that row (toggle left, link right) */
.post > .post-credit { margin-top: 10px; min-height: 20px; line-height: 20px; }
.post > .post-credit:has(+ .feed-bu) { float: right; position: relative; z-index: 1; margin-left: 12px; }
.post > .post-credit + .buildup.feed-bu { margin-top: 10px; }
.post > .buildup.feed-bu > summary { display: flex; align-items: center; justify-content: space-between; min-height: 20px; line-height: 20px; }
.post > .buildup.feed-bu > summary::after { margin-left: 4px; margin-right: auto; }
/* compact pill: date left + View on X right on the first line; update text below */
.buildup.feed-bu li.bu-pill { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 12px; align-items: center; }
.feed-bu .bu-pill > .bu-top { grid-column: 1; grid-row: 1; }
.feed-bu .bu-pill > .bu-text { grid-column: 1 / -1; grid-row: 2; }
.feed-bu .bu-pill > .post-credit { grid-column: 2; grid-row: 1; margin-top: 0; align-self: center; }
.post > .xm { margin-top: 8px; } /* text sits close to the image */
.post > .post-text { margin-top: 10px; } /* text+image centred: 10px under the pill row, 10px above the Earlier updates row */
.post-src { font-size: 10.5px; color: var(--muted); background: rgba(255,255,255,.07); padding: 2px 7px; border-radius: 6px; }
.post-link {
  width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; flex: none;
  border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03); color: var(--muted);
}
.post-link:focus-visible, .mini.tappable:focus-visible { outline: 2px solid #A9BDF0; outline-offset: 3px; }
.post-check { border-style: dashed; border-color: rgba(170,190,245,.22); background: rgba(34,45,70,.6); }
.post-check .post-text { color: var(--muted); }
.fdiv { display: flex; align-items: center; gap: 12px; margin: 18px 2px 16px; font-size: 12px; color: var(--faint); white-space: nowrap; }
.fdiv::before, .fdiv::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.fdiv b { font-weight: 600; color: var(--muted); }
.fdiv i { font-style: normal; margin: 0 1px; }
.fdiv-success { color: #9EDBB8; font-weight: 600; }
.fdiv-partial { color: #EBD38C; font-weight: 600; }
.fdiv-failure { color: #F2A2A2; font-weight: 600; }
.mini.tappable { cursor: pointer; -webkit-tap-highlight-color: transparent; transition: transform .12s, background-color .12s; }
.mini.tappable:active { transform: scale(.98); background: rgba(10,16,32,.75); border-color: color-mix(in srgb, var(--c) 45%, transparent); }
.feed-dim { display: none; }
@media (max-width: 899px) { /* phone: two pages side by side; the content slides, the background stays */
  .st { position: relative; isolation: isolate; background: #1A2236; }
  .st::before { content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
    background: radial-gradient(130% 55% at 50% -8%, #2E3D63 0%, #1A2236 62%), #1A2236; }
  /* Each page is its own clipped viewport, and they crossfade with the swipe, so only
     one page's content is legible at any moment (a brief mid-swipe blend at most). */
  .feed-pane {
    position: fixed; inset: 0; z-index: 15; background: none; overflow: hidden; contain: paint;
    -webkit-transform: translate3d(calc((1 - var(--fp)) * 100%), 0, 0); transform: translate3d(calc((1 - var(--fp)) * 100%), 0, 0);
    opacity: calc(var(--fp) * 2 - .4); visibility: hidden;
    transition: transform var(--slide), opacity var(--slide); will-change: transform, opacity;
  }
  .feed-pane .feed { height: 100%; scrollbar-width: thin; scrollbar-color: rgba(170,190,245,.35) transparent; }
  html.feed-lock, html.feed-lock body { overflow: hidden; scrollbar-gutter: stable; } /* Road open: the window doesn't scroll (no stale bar), .feed does */
  .feed-on .feed-pane { visibility: visible; }
  .feed-on .st-wrap {
    -webkit-transform: translate3d(calc(var(--fp) * -100%), 0, 0); transform: translate3d(calc(var(--fp) * -100%), 0, 0);
    opacity: calc(1.6 - var(--fp) * 2); transition: transform var(--slide), opacity var(--slide); will-change: transform, opacity;
  }
  .feed-open .st-wrap { visibility: hidden; transition-property: transform, opacity, visibility; transition-delay: 0s, 0s, .5s; }
  .feed-drag .feed-pane, .feed-drag .st-wrap { transition: none; }
  .st.feed-on { overflow-x: hidden; }
  html, body { overflow-x: hidden; }
  /* the fixed header stands in for both pages' own header rows, which stay as spacers */
  .st-wrap > .top, .feed-head > * { visibility: hidden; }
  .feed-head { position: static; background: none; border-bottom: 0; -webkit-backdrop-filter: none; backdrop-filter: none; }
  /* no bar: pills + buttons sit on the page; content scrolling under them fades out into the page colour */
  .hdr-bar { position: fixed; left: 0; right: 0; top: 0; height: calc(var(--sat) + 84px); z-index: 16; pointer-events: none;
    background: linear-gradient(180deg, #1F2840 0%, #1F2840 calc(var(--sat) + 52px), rgba(31,40,64,0) 100%); }
  .hdr { position: fixed; z-index: 17; top: calc(var(--sat) + 5px); left: 0; right: 0; height: 64px; overflow: hidden; pointer-events: none; opacity: 0; }
  .hdr.hdr-ready { opacity: 1; transition: opacity .2s; }
  .hdr > * { pointer-events: auto; -webkit-tap-highlight-color: transparent; }
  .hdr-left { position: absolute; left: 18px; top: 13px; }
  .hdr-right { position: absolute; right: 18px; top: 13px; will-change: transform, opacity; opacity: calc(1 - var(--fp) * 1.5);
    -webkit-transform: translate3d(calc(var(--fp) * -24px), 0, 0); transform: translate3d(calc(var(--fp) * -24px), 0, 0);
    transition: opacity var(--slide), transform var(--slide); }
  .hdr-ic { position: absolute; inset: 0; display: grid; place-items: center; transition: opacity var(--slide); }
  .hdr-ic-a { opacity: calc(1 - var(--fp) * 2); }
  .hdr-ic-b { opacity: calc(var(--fp) * 2 - 1); }
  .hdr-feed .hdr-right { pointer-events: none; }
  /* pills: --act 1 = active page. Width T of the pair is linear in --fp, so the pair stays centred */
  .hdr-p { position: absolute; left: 0; top: 10px; display: block; width: max-content; white-space: nowrap; text-align: center;
    padding: 7px 14px; border: 0; background: none; color: #fff; font: inherit; cursor: pointer;
    line-height: 1.2; isolation: isolate; will-change: transform; -webkit-transform-origin: 0 50%; transform-origin: 0 50%;
    --s: calc(var(--k, .72) + (1 - var(--k, .72)) * var(--act));
    --T: calc(var(--wa, 0px) * (1 - (1 - var(--k, .72)) * var(--fp)) + var(--pg, 10px) + var(--wb, 0px) * (var(--k, .72) + (1 - var(--k, .72)) * var(--fp)));
    transition: transform var(--hdr-ease); }
  /* one pill (fill + border) that only the active title wears: it slides and resizes from one to the other with --fp */
  .hdr-pill { position: absolute; left: 0; top: 10px; height: var(--ph, 54px); border-radius: 14px; pointer-events: none !important; will-change: transform, width;
    background: #4A5684; border: 1px solid rgba(190,205,255,.28); box-sizing: border-box;
    --xa: calc(var(--cx, 0px) - (var(--wa, 0px) + var(--pg, 10px) + var(--wb, 0px) * var(--k, .72)) / 2);
    --xb: calc(var(--cx, 0px) - (var(--wa, 0px) * var(--k, .72) + var(--pg, 10px) + var(--wb, 0px)) / 2 + var(--wa, 0px) * var(--k, .72) + var(--pg, 10px));
    width: calc(var(--wa, 0px) + (var(--wb, 0px) - var(--wa, 0px)) * var(--fp));
    -webkit-transform: translate3d(calc(var(--xa) + (var(--xb) - var(--xa)) * var(--fp)), 0, 0); transform: translate3d(calc(var(--xa) + (var(--xb) - var(--xa)) * var(--fp)), 0, 0);
    transition: transform var(--hdr-ease), width var(--hdr-ease); }
  .hdr-p b, .hdr-p span { display: block; will-change: opacity; opacity: calc(.5 + .5 * var(--act)); transition: opacity var(--hdr-ease); }
  .hdr-p b { font-size: 15px; font-weight: 700; letter-spacing: -.01em; }
  .hdr-p span { font-size: 11px; font-weight: 600; color: #DCE3F5; margin-top: 1px; }
  .hdr-a { --act: calc(1 - var(--fp));
    -webkit-transform: translate3d(calc(var(--cx, 0px) - var(--T) / 2), 0, 0) scale(var(--s)); transform: translate3d(calc(var(--cx, 0px) - var(--T) / 2), 0, 0) scale(var(--s)); }
  .hdr-b { --act: var(--fp);
    -webkit-transform: translate3d(calc(var(--cx, 0px) - var(--T) / 2 + var(--wa, 0px) * (1 - (1 - var(--k, .72)) * var(--fp)) + var(--pg, 10px)), 0, 0) scale(var(--s));
    transform: translate3d(calc(var(--cx, 0px) - var(--T) / 2 + var(--wa, 0px) * (1 - (1 - var(--k, .72)) * var(--fp)) + var(--pg, 10px)), 0, 0) scale(var(--s)); }
  .feed-drag .hdr * { transition: none !important; }
}
@media (max-width: 899px) and (prefers-reduced-motion: reduce) {
  .feed-pane, .feed-on .st-wrap, .hdr, .hdr * { transition: none !important; }
}
@media (min-width: 900px) { /* desktop: main page + feed column */
  .st-layout { display: grid; grid-template-columns: 476px 420px; justify-content: center; align-items: start; }
  .st-layout .st-wrap { width: 100%; }
  .feed-btn { visibility: visible; }
  .feed-pane { position: sticky; top: 0; height: 100vh; border-left: 1px solid rgba(170,190,245,.10); border-right: 1px solid rgba(170,190,245,.10); }
  .feed-pane .feed { height: 100%; }
  .feed-head { background: linear-gradient(180deg, rgba(44,58,94,.985) 0%, rgba(38,51,84,.975) 100%); }
}

/* Road to Flight N as a slim pill at the bottom of the next-flight card */
.next .road { margin: 16px 0 0; }
.next .road-chev { color: var(--text); flex: none; margin-right: -2px; }

/* header: small "Road to Flight N ›" link next to the title */
.brand-row { display: flex; align-items: center; justify-content: center; gap: 12px; min-width: 0; }
.brand-row .brand { text-align: left; }
.road-chip { display: inline-flex; align-items: center; gap: 2px; padding: 6px 2px; border: 0; background: none; cursor: pointer;
  font: inherit; font-size: 11.5px; color: var(--muted); white-space: nowrap; -webkit-tap-highlight-color: transparent; transition: color .3s ease; }
.road-chip svg { opacity: .8; transition: transform .3s ease; }
.road-chip:hover, .road-chip:active { color: var(--text); }
.road-chip:hover svg { transform: translateX(2px); }
.road-chip:focus-visible { outline: 2px solid #A9BDF0; outline-offset: 2px; border-radius: 6px; }


/* feed media: the source's own preview, linking to the original */
  background: linear-gradient(165deg, #34466E 0%, #1C263D 100%); border: 1px solid rgba(255,255,255,.06); }
.xm { margin-top: 10px; }
.xm-grid { display: grid; gap: 3px; border-radius: 12px; overflow: hidden; aspect-ratio: 16 / 9; background: #0E1424; }
.xm-split { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; aspect-ratio: 16 / 9; }
.xm-split > a { display: block; min-width: 0; min-height: 0; border-radius: 12px; overflow: hidden; background: #0E1424; }
.xm-split img { width: 100%; height: 100%; object-fit: cover; display: block; }
.xm-grid.n2, .xm-grid.n4 { grid-template-columns: 1fr 1fr; }
.xm-grid.n3 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
.xm-grid.n3 > :first-child { grid-row: span 2; }
.xm-video { position: relative; min-height: 0; min-width: 0; background: #000; }
.xm-video video { position: absolute; inset: 0; }
.xm-play { all: unset; position: absolute; inset: 0; cursor: pointer; }
.post-tap { cursor: pointer; -webkit-tap-highlight-color: transparent; }
.post-tap:focus-visible { outline: 2px solid #A9BDF0; outline-offset: 3px; }
.fdiv-next { color: #A9BDF0; font-weight: 600; }
.xm-grid > a, .xm-grid > video { position: relative; display: block; min-height: 0; min-width: 0; }
.xm-grid img, .xm-grid video { width: 100%; height: 100%; object-fit: cover; display: block; }
/* cropped card photos keep the top of the vehicle */
.xm-grid img, .xm-split img { object-position: center top; } /* 3 Nov: no background extending; cover-crop, vehicles keep their top */
.xm-grid img.crop-bottom, .xm-split img.crop-bottom { object-position: center bottom; } /* engines / Raptors keep their bottom */
.xm-grid, .xm-split { position: relative; }
/* photo source badge: 22px avatar, bottom-right, thin white ring + soft dark shadow */
.xm-grid > a.src-badge, .xm-split > a.src-badge { position: absolute; right: 8px; bottom: 8px; z-index: 2; width: 22px; height: 22px; min-width: 0; border-radius: 50%; overflow: hidden;
  display: grid; place-items: center; background: #3A4560; color: #E8ECF5; font: 600 11px/1 -apple-system, Inter, "Segoe UI", Roboto, sans-serif; text-decoration: none;
  box-shadow: 0 0 0 1.5px rgba(255,255,255,.85), 0 2px 6px rgba(0,0,0,.45), 0 0 0 3px rgba(0,0,0,.18); transition: transform .15s; grid-row: auto; }
.xm-grid > a.src-badge:hover, .xm-split > a.src-badge:hover { transform: scale(1.1); }
.xm-grid > a.src-badge img, .xm-split > a.src-badge img { width: 100%; height: 100%; object-fit: cover; display: block; }
.xm-foot { display: flex; justify-content: flex-end; align-items: center; margin-top: 6px; font-size: 10.5px; color: var(--muted); }
.xm-foot a { display: inline-flex; align-items: center; gap: 4px; color: #A9BDF0; text-decoration: none; font-weight: 600; }
.xm-foot svg { width: 12px; height: 12px; }
.post-media-play { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
  display: grid; place-items: center; color: #fff; background: rgba(10,16,32,.6); border: 1px solid rgba(255,255,255,.35);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.post-media-play svg { margin-left: 2px; }
  background: rgba(10,16,32,.62); padding: 3px 8px; border-radius: 999px; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
`;

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error(this.props.where || "app", error, info && info.componentStack); }
  render() { return this.state.error ? (this.props.fallback || null) : this.props.children; }
}
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<ErrorBoundary where="app"><StarshipTracker /></ErrorBoundary>);
