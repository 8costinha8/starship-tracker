/* Next-flight picker (pipeline iteration 1, Tusk).
   LL2's upcoming list is NOT "the next Starship flight": on 21 Nov 2026 it had no Flight 16, so its first result was
   "SpaceX HLS LEO Demo" (June 2027, month precision) and check-flights.js (limit=1) tracked that as the next flight with n = null.
   Rules:
     1. The next flight is the first result whose name carries a flight number ("Flight 16"); other missions are never tracked.
     2. No numbered flight in the list → unresolved: the caller makes no date / status push and keeps its saved state.
     3. A date push needs a date that means something: month, quarter, half-year and year precision are placeholders (no push). */
const FLIGHT_RX = /\bFlight\s*(\d+)\b/i;
const COARSE = /^(?:M|MONTH|Y|YEAR|H[12]?|HALF|Q[1-4]?|QTR|QUARTER)$/i; // LL2 abbrevs seen: "M", "Y"; others kept for safety
const flightNumber = (name) => { const m = FLIGHT_RX.exec(String(name || "")); return m ? Number(m[1]) : null; };
const isCoarsePrecision = (p) => COARSE.test(String(p || ""));
function pickNext(results) {
  const list = Array.isArray(results) ? results : [];
  for (const l of list) { const n = flightNumber(l && l.name); if (n) return { launch: l, n, reason: "numbered flight" }; }
  return { launch: null, n: null, reason: list.length ? `no numbered Starship flight in LL2's list (first: "${list[0] && list[0].name}")` : "LL2 list is empty" };
}
module.exports = { flightNumber, isCoarsePrecision, pickNext };
