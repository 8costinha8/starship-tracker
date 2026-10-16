
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
const daysBetween = (a, b) => Math.round((utcDay(b) - utcDay(a)) / DAY);
const fmt = (iso, opts) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
// For the next-flight card specifically: local launch time and date together,
// in the UK's own timezone (auto-adjusts BST/GMT), so there's no ambiguity.
const fmtDateTimeLondon = (iso) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric" });
  const month = d.toLocaleDateString("en-GB", { timeZone: "Europe/London", month: "long" });
  const year = d.toLocaleDateString("en-GB", { timeZone: "Europe/London", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
  return `${time} | ${day} ${month} ${year}`;
};
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
// "Where to watch" links on launch day (plain links; nothing is fetched from them).
// The YouTube channel ids are the same ones scripts/check-road.js reads.
const WATCH_LINKS = [
  { label: "SpaceX on X", href: "https://x.com/SpaceX" },
  { label: "SpaceX website", href: "https://www.spacex.com/launches/" },
  { label: "NASASpaceflight", href: "https://www.youtube.com/channel/UCSUu1lih2RifWkKtDOJdsBA/live" },
  { label: "LabPadre", href: "https://www.youtube.com/channel/UCFwMITSkc1Fms6PoJoh1OUQ/live" },
];

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

// Newest flight already in the log above (FLIGHTS). Once a flight is in the
// log, the top card moves on to the next one — no manual edit needed.
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
  if (s === "inflight" || s === "done" || s === "tbc") return s;
  if (!flight.date) return s;
  if (roughNet(flight, now)) return "tbc"; // only a rough LL2 date: no countdown
  const t0 = new Date(flight.date).getTime();
  if (Number.isFinite(t0) && now >= t0 && now <= t0 + IN_FLIGHT_FALLBACK_MS) return "inflight";
  return s;
}

// Dev-only overrides so we can screenshot states without waiting on a launch.
// Harmless in production: ignored unless ?mock= is present. Values:
//   inflight | done-success | done-failure | done-partial | tbc
//   next  -> fake LL2 list: newest logged flight finished + the next one announced
//   none  -> fake LL2 list: newest logged flight finished, no next flight listed
//   launchday -> fake LL2 + fake clock for a whole launch day (see LD below)
function getMock() {
  try { return new URLSearchParams(window.location.search).get("mock") || ""; } catch { return ""; }
}

// ?mock=launchday: fake clock + fake LL2 that walk through a launch day:
// NET unconfirmed -> Go with a time -> window opens -> liftoff -> in flight ->
// Success -> the story gets logged (a MOCK entry added to FLIGHTS in memory)
// -> the card moves on to the next flight. Plays itself in under a minute;
// &warp=manual stops the autoplay and window.__ld.jump(ms, rate) drives it.
// Completely inert without ?mock=launchday (LD is null, nowMs is Date.now).
const LD_T0 = Date.parse("2026-10-13T22:00:00Z"); // mock liftoff: 23:00 UK time
const LD = getMock() === "launchday" ? makeLaunchdayMock() : null;
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
  if (mock === "launchday") return Promise.resolve(ldLL2(url));
  if (mock === "next" || mock === "none") return Promise.resolve(mockLL2(url));
  return fetch(url).then((r) => r.json());
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
function vehicleLine(f) {
  const parts = [];
  if (f.block) parts.push(f.block);
  if (f.booster) parts.push(`Booster ${String(f.booster).replace(/^B/i, "")}`);
  if (f.ship) parts.push(`Ship ${String(f.ship).replace(/^S/i, "")}`);
  return parts.length ? parts.join(", ") : "To be announced";
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
  const label = `NET ${d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })} · predicted`;
  const basis = p.basis || p.sources.map((s) => s.name).filter(Boolean).join(" · ");
  return { label, basis };
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

// Keeps the next-flight data fresh while the app is open: every hour normally,
// every 5 minutes on launch day (isHot), paused while the tab is hidden, and
// re-checked on return if stale. Every LL2 call goes through ll2Spend's
// hourly budget. Returns { flight, checkedAt }.
function useNextFlight() {
  const [live, setLive] = React.useState(null);
  const [checkedAt, setCheckedAt] = React.useState(null);
  React.useEffect(() => {
    const persist = !getMock();
    let meta = { data: null, fetchedAt: 0, ttl: 0, url: null, listAt: 0, failedAt: 0 };
    const readCache = () => {
      if (!persist) return;
      try {
        const c = JSON.parse(localStorage.getItem(CACHE_KEY));
        if (c?.data && c.fetchedAt > meta.fetchedAt) { // includes a fresher copy saved by another tab
          meta = { ...meta, url: null, listAt: 0, ttl: CACHE_MS, ...c };
          setLive(c.data); setCheckedAt(c.fetchedAt);
        }
      } catch {}
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
      const detailOnly = !!(d && meta.url && !finished(d) && isHot(d, now) && now - meta.listAt < LIST_EVERY_MS);
      if (!ll2Spend(detailOnly ? 1 : 2)) return; // over the hourly LL2 budget: a later tick tries again
      busy = true;
      let seenMax = LAST_LOGGED_N;
      let listAt = meta.listAt;
      // Step 1: find which launch is next (skipped on launch day if the list was read in the last hour).
      const step1 = detailOnly ? Promise.resolve(meta.url) : ll2Json(LL2_ENDPOINT).then((json) => {
        if (!Array.isArray(json?.results)) return null; // throttled / error: keep what we have
        listAt = nowMs();
        json.results.forEach((l) => { const n = flightNumber(l.name); if (n != null) seenMax = Math.max(seenMax, n); });
        const launch = pickNextLaunch(json.results);
        return launch ? launch.url : "none";
      });
      // Step 2: that launch's full detail (pad, vehicle serials, window, mission).
      step1
        .then((url) => (!url ? null : url === "none" ? { url: null, full: "none" } : ll2Json(url).then((full) => ({ url, full }))))
        .then((res) => {
          if (!res) { meta.failedAt = nowMs(); return; }
          const data = res.full === "none" || !res.full?.name ? placeholderFlight(seenMax + 1) : flightFromLL2(res.full);
          const at = nowMs();
          meta = { data, fetchedAt: at, ttl: isHot(data, at) ? HOT_TTL_MS : CACHE_MS, url: res.url, listAt, failedAt: 0 };
          setLive(data); setCheckedAt(at);
          if (persist) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(meta)); } catch {} }
        })
        .catch(() => { meta.failedAt = nowMs(); })
        .finally(() => { busy = false; });
    };
    load();
    // Cheap local tick (no network unless due); the demo's fake clock needs a fast one.
    const id = setInterval(load, LD ? 1000 : 15000);
    // Phones keep the app open in the background for hours: re-check (if stale) on return.
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return { flight: applyMockOverride(live), checkedAt };
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

function Countdown({ flight }) {
  const now = useNow(true);
  const status = effectiveStatus(flight, now);

  if (status === "tbc") {
    return <div className="cd"><span className="cd-val cd-tbc">Date to be confirmed</span></div>;
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

function WatchLiveBadge({ flight, now }) {
  const status = effectiveStatus(flight, now);
  // No date yet (status "tbc"): still show the badge, just gray and not clickable.
  // Stay clickable for the whole in-flight window; otherwise use the usual
  // lead/trail timing around the scheduled T-0.
  let active = status === "inflight";
  if (!active && status !== "tbc" && flight.date) {
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
  const showWatch = confirmed || status === "inflight";
  const dateLabel = status === "net" ? "NET date" : status === "inflight" || status === "done" ? "Liftoff" : "Date";
  let dateText = "To be confirmed";
  if (status === "inflight" || status === "done") dateText = f.date ? fmtLaunchedLondon(f.date) : dateText;
  else if (status !== "tbc" && f.date) dateText = fmtDateTimeLondon(f.date);
  const rough = status === "tbc" ? roughNet(f, now) : null;
  if (rough) dateText = rough.label;
  const predicted = predictedNet(f, road, now);
  if (predicted) dateText = predicted.label;
  return (
    <section className="next" aria-label={`${status === "inflight" ? "Current" : status === "done" ? "Latest" : "Next"} flight: Flight ${f.n}`}>
      <div className="next-top">
        <Countdown flight={f} />
        <WatchLiveBadge flight={f} now={now} />
      </div>
      <div className="next-title"><span className="t-word">Starship Flight</span><span className="t-num">{f.n || "—"}</span></div>
      <dl className="facts">
        <dt>{dateLabel}</dt><dd>{dateText}{predicted && predicted.basis && <span className="pred-basis">{predicted.basis}</span>}</dd>
        {win && <><dt>Window</dt><dd>{win}</dd></>}
        <dt>Site</dt><dd>{siteLine(f)}</dd>
        <dt>Vehicle</dt><dd>{vehicleLine(f)}</dd>
      </dl>
      <p className="next-note">{f.note}</p>
      {showWatch && (
        <div className="watch-where">
          <span className="watch-where-h">Where to watch</span>
          <ul>{WATCH_LINKS.map((l) => <li key={l.href}><a href={l.href} target="_blank" rel="noopener noreferrer">{l.label}</a></li>)}</ul>
        </div>
      )}
      {status === "inflight" && checkedAt && <p className="auto-note">Auto-updating · last checked {fmtTimeLondon(checkedAt)}</p>}
      {children}
    </section>
  );
}

function FlightCard({ f, open, onTap, onPhotoTap, register }) {
  const onKey = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(f.n); } };
  // While closed, tapping the thumb should expand the card like the rest of the header.
  // Once open, tapping the thumb opens the lightbox instead — so it needs to stop
  // the click from also bubbling up to the header's collapse handler.
  const thumbTap = open && f.photo?.thumb
    ? (e) => { e.stopPropagation(); onPhotoTap(f.photo.thumb, `Starship Flight ${f.n}`); }
    : undefined;

  return (
    <article ref={(el) => register(f.n, el)} className={`card${open ? " is-open" : ""}`}>
      <div className="card-head" role="button" tabIndex={0} aria-expanded={open} onClick={() => onTap(f.n)} onKeyDown={onKey}>
        <PhotoSlot size="thumb" src={f.photo?.thumb} alt={`Starship Flight ${f.n}`} onClick={thumbTap} />
        <div className="info">
          <div className="info-top">
            <div className="title"><span className="t-word">Starship Flight</span><span className="t-num">{f.n}</span></div>
            <Pill outcome={f.outcome} />
          </div>
          <div className="date">{fmt(f.date, { day: "numeric", month: "short", year: "numeric" })}</div>
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
            <div className="gallery">
              <PhotoSlot
                size="wide" src={f.photo?.gallery?.[0]} alt={`${f.headline} \u2014 photo 1`}
                onClick={f.photo?.gallery?.[0] ? () => onPhotoTap(f.photo.gallery[0], `${f.headline} \u2014 photo 1`) : undefined}
              />
              <PhotoSlot
                size="wide" src={f.photo?.gallery?.[1]} alt={`${f.headline} \u2014 photo 2`}
                onClick={f.photo?.gallery?.[1] ? () => onPhotoTap(f.photo.gallery[1], `${f.headline} \u2014 photo 2`) : undefined}
              />
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
          <dt>Flight data</dt><dd>Last checked {DATA_CHECKED}.</dd>
          <dt>Next flight</dt><dd>Launch dates move often. The countdown runs off the best known date and is tagged NET (estimated) until SpaceX confirms the exact time.</dd>
        </dl>
        <FeedbackForm />
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
// status: "none" (Not started, dotted) | "pending" / "progress" (outline) | "done" (filled; label is doneText, e.g. "Confirmed", else "Done")
//   | "complete" (a stage the source says is finished: shown exactly like "done", label and headline "Done")
// An entry with complete: true (the update that marked the stage finished) gets a subtle green tint.
// An entry with kind: "check" is the box's "no news yet" placeholder (dashed outline).
// An entry with trust: "unconfirmed" gets a small "Unconfirmed" tag.
// The "date" (Launch date) box stays in road.json and keeps sending pushes, but isn't shown here.
const ROAD_HIDDEN = ["date"];
const ROAD_URL = "road.json";
const ROAD_CACHE_KEY = "starship-road-cache-v1";
const ROAD_STATUS_TEXT = { none: "Not started", pending: "Pending", progress: "In progress", done: "Done", complete: "Done" };

// Shows the last copy we saw straight away (no flicker on reopen), then
// fetches a fresh one, skipping the browser cache, and swaps it in.
function useRoad() {
  const [road, setRoad] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(ROAD_CACHE_KEY)) || null; } catch { return null; }
  });
  React.useEffect(() => {
    let alive = true;
    fetch(`${ROAD_URL}?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data || !Array.isArray(data.categories)) return;
        setRoad(data);
        try { localStorage.setItem(ROAD_CACHE_KEY, JSON.stringify(data)); } catch {}
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return road;
}

function RoadCard({ road, onEntryTap, openReq }) {
  const [main, setMain] = React.useState(false);
  React.useEffect(() => { if (openReq) setMain(true); }, [openReq]); // header chip asks it to open
  const [open, setOpen] = React.useState(null);
  const items = road && Array.isArray(road.categories) ? road.categories.filter((m) => !ROAD_HIDDEN.includes(m.id)) : [];
  if (!items.length) return null;
  const title = `Road to Flight ${road.flight}`;
  const done = items.filter((m) => m.status === "done" || m.status === "complete").length; // shown boxes only
  const label = (m) => (m.status === "done" ? m.doneText || "Done" : ROAD_STATUS_TEXT[m.status] || m.status);
  return (
    <section className={"road" + (main ? " main-open" : "")} aria-label={title}>
      <button className="road-head" aria-expanded={main} onClick={() => { setMain(!main); setOpen(null); }}>
        <span className="road-title"><h2>{title}</h2>{road.updated && <span className="road-upd">{`Updated ${road.updated}`}</span>}</span>
        <span className="road-sum">
          <span className="road-dots">{items.map((m) => <i key={m.id} className={"dot dot-" + m.status} style={{ "--c": m.color }} title={m.name + ": " + label(m)} aria-label={m.name + ": " + label(m)} role="img" />)}</span>
          <span className="road-count">{done} of {items.length} done</span>
          <svg className="road-chev" width="20" height="20" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </button>
      <div className="road-list"><div className="road-list-inner">
      {items.map((m) => {
        const isOpen = open === m.id;
        return (
          <div key={m.id} className={"callout" + (isOpen ? " open" : "")} style={{ "--c": m.color }} data-id={m.id}>
            <button className="callout-head" tabIndex={main ? 0 : -1} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : m.id)}>
              <span className="callout-icon">{m.icon}</span>
              <span className="callout-body">
                <span className="callout-name">{m.name}</span>
                <span className="callout-latest">{m.status === "complete" ? "Done" : m.latest}</span>
              </span>
              <span className={"badge badge-" + m.status}>{label(m)}</span>
            </button>
            <div className="callout-hist"><div className="callout-hist-inner">
              {(m.history || []).map((h, i) => isRealEntry(h) && (
                <div className={"mini" + (h.complete ? " mini-done" : "") + (onEntryTap ? " tappable" : "")} key={i}
                  {...(onEntryTap ? { role: "button", tabIndex: isOpen ? 0 : -1, "aria-label": `${h.date}: ${h.text}. Show in the updates feed`,
                    onClick: () => onEntryTap(m.id, i), onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEntryTap(m.id, i); } } } : {})}>
                  <div className="mini-top">
                    <span className="mini-date">{h.date}{h.trust === "unconfirmed" && <span className="mini-unc">Unconfirmed</span>}</span>
                    <span className="mini-src">{srcOf(h)}</span>
                  </div>
                  <p>{h.x_text || h.text}</p>
                </div>
              ))}
            </div></div>
          </div>
        );
      })}
      </div></div>
    </section>
  );
}

// No "seen" dimming anywhere: every card stays full strength. The old per-device seen list is cleared.
try { localStorage.removeItem("st_seen_v1"); } catch {}
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
// Same data rules as the Road card: the hidden Launch date box is left out,
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

// Which flight a card belongs to: Road vehicles → the next flight; a flown vehicle → its flight;
// else "Flight N" in the text; else the next flight.
function flightOf(h, road) {
  const txt = `${(h.x_post && h.x_post.text) || ""} ${h.x_text || h.text || ""}`; // the post first: the old entry text may mention past flights
  const vs = [...txt.matchAll(/\b(Ship|Booster|S|B)[\s-]?(\d{1,3})\b/g)].map((m) => (m[1][0].toUpperCase() === "S" ? "S" : "B") + Number(m[2]));
  if (vs.some((v) => (road.vehicles || []).includes(v))) return road.flight;
  for (const v of vs) { const f = [...FLIGHTS].reverse().find((x) => x.booster === v || x.ship === v); if (f) return f.n; }
  const m = txt.match(/\bFlight\s+(\d{1,3})\b/i);
  return m ? Number(m[1]) : road.flight;
}
// Road to Flight N page: only cards backed by a trusted X post, in sections by flight (newest flight first).
function buildFeed(road) {
  if (!road || !Array.isArray(road.categories)) return { posts: [], rows: [] };
  const posts = [];
  road.categories.filter((c) => !ROAD_HIDDEN.includes(c.id)).forEach((c, ci) => (c.history || []).forEach((h, hi) => isRealEntry(h) && posts.push({
    h, cat: c, ci, hi, id: `${c.id}-${hi}`, day: feedDay(h.date, road.updatedAt), at: Date.parse((h.x_post && h.x_post.created_at) || h.at) || 0, flight: flightOf(h, road),
  })));
  posts.sort((a, b) => b.flight - a.flight || b.day - a.day || b.at - a.at || a.ci - b.ci || a.hi - b.hi);
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
const PLAY_ICON = <span className="post-media-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span>;

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
// Hand-picked picture (road-media.json): the image, a play icon for videos, @author credit; the post opens on tap.
function PickMedia({ mo }) {
  const [bad, setBad] = React.useState(false);
  if (bad) return null;
  return (
    <div className="xm">
      <div className="xm-grid n1"><a href={mo.post_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
        <img src={mo.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />{mo.type === "video" && PLAY_ICON}</a></div>
      <div className="xm-foot"><span>@{mo.author}</span>
        <a href={mo.post_url} target="_blank" rel="noopener noreferrer" aria-label="View on X" onClick={(e) => e.stopPropagation()}>View on X {LINK_ICON}</a></div>
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
      </div>
      <div className="xm-foot"><span>@{x.author && x.author.username}</span>
        <a href={x.url} target="_blank" rel="noopener noreferrer" aria-label="View on X">View on X {LINK_ICON}</a></div>
    </div>
  );
}
// An entry with an X post credits and links the post's author, so text, media and credit match.
const srcOf = (h) => (h.media_override ? `@${h.media_override.author}` : h.x_post && h.x_post.author && h.x_post.author.username ? `@${h.x_post.author.username}` : h.src);
const isYouTube = (u) => /(^|\.)(youtube\.com|youtu\.be)$/i.test(hostOf(u || ""));
const urlOf = (h) => (h.media_override && h.media_override.post_url) || (h.x_post && h.x_post.url) || (h.url && !isYouTube(h.url) ? h.url : null); // YouTube sources: not clickable
const openUrl = (u) => window.open(u, "_blank", "noopener,noreferrer");
const linkProps = (h) => { const u = urlOf(h); return u ? { role: "link", tabIndex: 0, "aria-label": `${h.x_text || h.text} — open ${h.x_post ? "the post on X" : "the source"}`,
  onClick: (e) => { if (!e.target.closest("a, video, button, .xm-video")) openUrl(u); }, onKeyDown: (e) => { if (e.key === "Enter" && e.target === e.currentTarget) openUrl(u); } } : {}; };
function FeedPost({ p, onPhotoTap }) {
  const { h, cat } = p;
  return (
    <article className={"post" + (urlOf(h) ? " post-tap" : "") + (h.complete ? " post-done" : "")} id={`post-${p.id}`} data-id={p.id} data-entry={h.id || undefined} style={{ "--c": cat.color }}
      {...linkProps(h)}>
      <div className="post-top">
        <span className="chip"><span className="chip-i">{cat.icon}</span>{cat.name}</span>
        <span className="post-sep">·</span>
        <span className="post-date">{h.date}{feedTime(h.publishedAt) ? ` · ${feedTime(h.publishedAt)}` : ""}</span>
        {h.trust === "unconfirmed" && <span className="mini-unc">Unconfirmed</span>}
      </div>
      <p className="post-text">{h.x_text || h.text}</p>
      {h.media_override ? <PickMedia mo={h.media_override} /> : h.x_post && <XMedia x={h.x_post} />}
      <div className="post-foot">
        <span className="post-src">{srcOf(h)}</span>
        {urlOf(h) && <a className="post-link" href={urlOf(h)} target="_blank" rel="noopener noreferrer" aria-label={`Open source: ${srcOf(h)}`}>{LINK_ICON}</a>}
      </div>
    </article>
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

function UpdatesFeed({ road, wide, shown, onBack, scrollRef, onPhotoTap }) {
  const { posts, rows } = React.useMemo(() => buildFeed(road), [road]);
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
          {rows.map((r) => r.section
            ? <div className="fdiv" key={"f" + r.section.n}><span><b>{`Flight ${r.section.n}`}</b> <i>·</i> {r.section.flown
                ? <><span className={"fdiv-" + r.section.flown.outcome}>{OUTCOME_LABEL[r.section.flown.outcome] || r.section.flown.outcome}</span> <i>·</i> {`${new Date(r.section.flown.day).getUTCDate()} ${FEED_MONTHS[new Date(r.section.flown.day).getUTCMonth()]}`}</>
                : <span className="fdiv-next">{r.section.next ? "Next flight" : "Upcoming"}</span>}</span></div>
            : <FeedPost key={r.post.id} p={r.post} onPhotoTap={onPhotoTap} />)}
          <p className="end">That's every update so far.</p>
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
  const road = useRoad();
  const wide = useMedia(FEED_WIDE_QUERY);
  // ?feed=1 (tapping a "🚀 Starship" news push) opens the phone's Updates feed straight away
  // ?feed=1&entry=<id> (a Road push): open the Road page, scroll to that card and highlight it
  const [entryReq, setEntryReq] = React.useState(() => { try { return new URLSearchParams(window.location.search).get("entry") || null; } catch { return null; } });
  const [feedOpen, setFeedOpen] = React.useState(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get("feed") !== "1") return false;
      q.delete("feed"); q.delete("entry"); window.history.replaceState(null, "", window.location.pathname + (q.toString() ? `?${q}` : "") + window.location.hash);
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
  const { flight: liveNext, checkedAt } = useNextFlight();
  const nextFlight = liveNext || placeholderFlight(LAST_LOGGED_N + 1);

  const flights = [...FLIGHTS].sort((a, b) => b.n - a.n);
  const latest = flights[0];
  const daysSinceLatest = Math.round((Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()) - utcDay(latest.date)) / DAY);

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
  const openRoad = () => {
    const go = () => {
      const el = document.querySelector(".next .road");
      if (!el) return;
      setRoadOpenReq((n) => n + 1); // opens with its own .5s ease while the page glides
      glideTo(Math.max(0, el.getBoundingClientRect().top + window.scrollY - 84));
    };
    if (!wide && feedOpen) { setFeedOpen(false); setTimeout(go, reduceMotion() ? 0 : Math.round(FEED_SLIDE_MS * 0.6)); } else go();
  };
  const chip = <RoadChip road={road} onOpen={openRoad} />;
  const phoneHeader = !wide && road && road.flight && Array.isArray(road.categories) ? (
    <PhoneHeader road={road} feedOpen={feedOpen} onAbout={() => setAboutOpen(true)}
      onFeed={() => setFeedOpen(true)} onBack={() => setFeedOpen(false)} onHint={openRoad} />
  ) : null;

  // Tap an entry in the Road card: show its post in the feed and light it up.
  React.useEffect(() => {
    if (!entryReq || !road) return;
    const t = setTimeout(() => {
      const pane = feedScroll.current;
      const el = pane && pane.querySelector(`[data-entry="${CSS.escape(entryReq)}"]`);
      setEntryReq(null);
      if (!el) return;
      const head = pane.querySelector(".feed-head");
      pane.scrollTop = Math.max(0, el.offsetTop - (head ? head.offsetHeight : 0) - 14);
      if (!wide) setFeedOpen(true);
      setTimeout(() => { el.classList.remove("hl"); void el.offsetWidth; el.classList.add("hl"); setTimeout(() => el.classList.remove("hl"), 2400); }, reduceMotion() ? 0 : FEED_SLIDE_MS);
    }, 300);
    return () => clearTimeout(t);
  }, [entryReq, road]);
  const jumpToPost = (catId, i) => {
    const pane = feedScroll.current;
    const el = pane && pane.querySelector(`#post-${CSS.escape(`${catId}-${i}`)}`);
    if (!el) return;
    const head = pane.querySelector(".feed-head");
    const y = Math.max(0, el.offsetTop - (head ? head.offsetHeight : 0) - 14);
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
            ? <button className="round-btn feed-btn" onClick={() => setFeedOpen(true)} aria-label="Open updates feed">{FEED_ICON}</button>
            : <span />}
        </header>

        <NextFlightCard f={nextFlight} checkedAt={checkedAt} road={road}>
          <RoadCard road={road} onEntryTap={jumpToPost} openReq={roadOpenReq} />
        </NextFlightCard>
        <Connector dashed label={`${daysSinceLatest} days since the last flight`} />

        {flights.map((f, i) => (
          <div key={f.n}>
            <FlightCard f={f} open={openId === f.n} onTap={handleTap} onPhotoTap={(src, alt) => setLightbox({ src, alt })} register={register} />
            {i < flights.length - 1 && <Connector label={`${daysBetween(flights[i + 1].date, f.date)} days`} />}
          </div>
        ))}

        <p className="end">That's every flight so far.</p>
      </div>
      <UpdatesFeed road={road} wide={wide} shown={feedOn} onBack={() => setFeedOpen(false)} scrollRef={feedScroll} onPhotoTap={(src, alt) => setLightbox({ src, alt })} />
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
.watch-where { margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(170,190,245,.16); }
.watch-where-h { display: block; font-size: 12px; color: #AAB6D6; margin-bottom: 8px; }
.watch-where ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.watch-where a { display: inline-block; font-size: 12.5px; font-weight: 600; color: var(--text); text-decoration: none; padding: 5px 10px; border-radius: 9px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.1); }
.watch-where a:active { transform: scale(.96); }
.auto-note { margin: 12px 0 0; font-size: 11.5px; color: var(--muted); opacity: .8; font-variant-numeric: tabular-nums; }

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
  margin: 18px 0 6px; border-radius: 22px; background: var(--card); border: 1px solid rgba(170,190,245,.14);
  box-shadow: 0 18px 40px -28px rgba(8,12,28,.9);
}
.road-head { all: unset; box-sizing: border-box; width: 100%; cursor: pointer; display: block; padding: 16px 16px 15px; }
.road-head:focus-visible { outline: 2px solid #A9BDF0; outline-offset: 3px; border-radius: 22px; }
.road-title { display: flex; justify-content: space-between; align-items: baseline; }
.road-title h2 { font-size: 17px; font-weight: 700; margin: 0; }
.road-upd { font-size: 12px; color: var(--faint); }
.road-sum { display: flex; align-items: center; gap: 10px; margin-top: 10px; color: var(--muted); font-size: 13px; }
.road-dots { display: flex; gap: 6px; }
.dot { width: 11px; height: 11px; border-radius: 50%; display: block; border: 1.5px solid var(--c); background: transparent; } /* outline = pending / in progress */
.dot-none { border: 2px dotted var(--c); } /* dotted = not started */
.dot-done, .dot-complete { background: var(--c); } /* filled = done / confirmed */
.road-count { flex: 1; }
.road-chev { transition: transform .35s; }
.main-open .road-chev { transform: rotate(180deg); }
.road-list { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .5s cubic-bezier(.2,.8,.2,1); }
.main-open .road-list { grid-template-rows: 1fr; }
.road-list-inner { overflow: hidden; padding: 0 10px; }
.main-open .road-list-inner { padding-top: 8px; padding-bottom: 16.5px; } /* 8px clear room above the first card (and its open glow, which overflow:hidden would clip); bottom gap matches the top: 26.5px each */
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
.callout-name { display: block; font-weight: 700; font-size: 15px; color: var(--c); }
.callout-latest { display: block; font-size: 13px; color: var(--text); margin-top: 3px; line-height: 1.35; }
.badge { font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 999px; white-space: nowrap; letter-spacing: .02em; }
.badge-done, .badge-complete { background: var(--c); color: #141B2D; border: 1px solid var(--c); } /* filled = done / confirmed */
.badge-progress, .badge-pending { background: transparent; color: var(--c); border: 1px solid color-mix(in srgb, var(--c) 70%, transparent); } /* outline */
.badge-none { background: transparent; color: var(--c); border: 1.5px dotted var(--c); } /* dotted = not started */
.callout-hist { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .45s cubic-bezier(.2,.8,.2,1); }
.callout.open .callout-hist { grid-template-rows: 1fr; }
.callout-hist-inner { overflow: hidden; padding: 0 14px 0 30px; position: relative; }
.callout.open .callout-hist-inner { padding-bottom: 14px; }
.callout-hist-inner::before { content: ""; position: absolute; left: 22px; top: 4px; bottom: 18px; width: 2px; background: color-mix(in srgb, var(--c) 40%, transparent); }
.mini { position: relative; background: #1A2338; border: 1px solid rgba(170,190,245,.12); border-radius: 12px; padding: 9px 11px; margin-top: 8px; }
.mini::before { content: ""; position: absolute; left: -12px; top: 14px; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
.mini-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.mini-date { font-size: 12px; font-weight: 700; color: var(--c); }
.mini-src { font-size: 10.5px; color: var(--muted); background: rgba(255,255,255,.07); padding: 2px 7px; border-radius: 6px; }
.mini p { margin: 4px 0 0; font-size: 13px; line-height: 1.4; }
.mini-done { background: linear-gradient(100deg, rgba(61,220,132,.14), rgba(61,220,132,.05)); border-color: rgba(61,220,132,.30); box-shadow: inset 3px 0 0 rgba(61,220,132,.75); } /* the update that finished the stage */
.mini-check { border-style: dashed; } /* "no news yet" placeholder */
.mini-unc { margin-left: 7px; font-size: 10px; font-weight: 700; letter-spacing: .02em; color: #FFC93D; border: 1px dashed rgba(255,201,61,.65); padding: 1px 6px; border-radius: 6px; vertical-align: 1px; } /* single smaller source: never shown as fact */

/* updates feed */
.feed { position: relative; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-width: none; }
.feed::-webkit-scrollbar { display: none; }
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
.feed-list .end { margin-top: 22px; }
.post {
  position: relative; margin-bottom: 10px;
  background: var(--card); border: 1px solid rgba(170,190,245,.12); border-radius: 18px;
  padding: 14px 16px; box-shadow: 0 18px 40px -28px rgba(8,12,28,.9);
}
.post::after { /* tap-to-post highlight */
  content: ""; position: absolute; inset: -1px; border-radius: 18px; pointer-events: none; opacity: 0;
  background: color-mix(in srgb, var(--c) 8%, transparent);
  border: 1.5px solid color-mix(in srgb, var(--c) 75%, transparent);
  box-shadow: 0 0 30px -4px color-mix(in srgb, var(--c) 55%, transparent);
}
.post.hl::after { animation: post-hl 2.2s forwards; }
@keyframes post-hl { 0% { opacity: 0; } 11% { opacity: 1; animation-timing-function: linear; } 45% { opacity: 1; animation-timing-function: cubic-bezier(.45,0,.25,1); } 100% { opacity: 0; } }
.post-top { display: flex; align-items: center; gap: 7px; min-height: 24px; }
.chip {
  display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px 0 7px;
  border-radius: 999px; font-size: 11.5px; font-weight: 700; letter-spacing: .02em; white-space: nowrap; color: var(--c);
  background: color-mix(in srgb, var(--c) 13%, transparent); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
}
.chip-i { font-size: 12px; line-height: 1; letter-spacing: 0; }
.post-sep { color: var(--faint); font-size: 12.5px; }
.post-date { font-size: 12.5px; font-weight: 600; color: var(--muted); white-space: nowrap; }
.post-top .mini-unc { margin-left: auto; vertical-align: 0; }
.post-text { margin: 9px 0 0; font-size: 14.5px; line-height: 1.5; color: var(--text); }
.post-photo { margin-top: 10px; }
.post-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; min-height: 28px; }
.post-src { font-size: 10.5px; color: var(--muted); background: rgba(255,255,255,.07); padding: 2px 7px; border-radius: 6px; }
.post-link {
  width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; flex: none;
  border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03); color: var(--muted);
}
.post-link:focus-visible, .mini.tappable:focus-visible { outline: 2px solid #A9BDF0; outline-offset: 3px; }
.post-check { border-style: dashed; border-color: rgba(170,190,245,.22); background: rgba(34,45,70,.6); }
.post-check .post-text { color: var(--muted); }
.post-done { /* same recipe as .mini-done */
  background: linear-gradient(100deg, rgba(61,220,132,.14), rgba(61,220,132,.05)), var(--card);
  border-color: rgba(61,220,132,.30); box-shadow: inset 3px 0 0 rgba(61,220,132,.75), 0 18px 40px -28px rgba(8,12,28,.9);
}
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
  .feed-pane .feed { height: 100%; }
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
  .feed-btn { visibility: hidden; }
  .feed-pane { position: sticky; top: 0; height: 100vh; border-left: 1px solid rgba(170,190,245,.10); border-right: 1px solid rgba(170,190,245,.10); }
  .feed-pane .feed { height: 100%; }
  .feed-head { background: linear-gradient(180deg, rgba(44,58,94,.985) 0%, rgba(38,51,84,.975) 100%); }
}

/* Road to Flight N as the bottom section of the next-flight card: a darker inset panel */
.next .road {
  margin: 16px -4px -6px; border-radius: 20px;
  background: rgba(14,20,38,.42); border: 1px solid rgba(255,255,255,.06); box-shadow: none;
}
.next .road-head { padding: 15px 16px 14px; }
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
.xm-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 10.5px; color: var(--muted); }
.xm-foot a { display: inline-flex; align-items: center; gap: 4px; color: #A9BDF0; text-decoration: none; font-weight: 600; }
.xm-foot svg { width: 12px; height: 12px; }
.post-media-play { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
  display: grid; place-items: center; color: #fff; background: rgba(10,16,32,.6); border: 1px solid rgba(255,255,255,.35);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.post-media-play svg { margin-left: 2px; }
  background: rgba(10,16,32,.62); padding: 3px 8px; border-radius: 999px; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
`;

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<StarshipTracker />);
