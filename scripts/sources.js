/* ONE source list for the checkers. Everything that names a source reads it from here:
   - x-first.js search (XF_ACCOUNTS) and check-road.js X search / trust (X_ACCOUNTS, PREDICT_X_ACCOUNTS)
   - source-tiers.js (Tier 1 / Tier 2)
   - watchdog.js (checks the live search query really covers this list)
   Fields: handle (X), src (label), tier 1 = top tier (Confirmed), 2 = trusted tracker (Reported),
   official = SpaceX/FAA themselves (only they move a box backwards or confirm the launch date),
   id = X user id where known (no paid lookup), predictOnly = read only for the predicted launch date
   (never a Road card, feed line or push) in the check-road.js legacy search; x-first still classifies it. */
const ACCOUNTS = [
  // Tier 1 (top tier)
  { handle: "SpaceX", src: "SpaceX", tier: 1, official: true, id: "34743251" },
  { handle: "FAANews", src: "FAA", tier: 1, official: true, id: "160946337", note: "FAA, incl. its CADENA air-traffic planning decks" },
  { handle: "NASASpaceflight", src: "NSF", tier: 1, id: "21292523" },
  { handle: "elonmusk", src: "Elon Musk", tier: 1, id: "44196397", predictOnly: true },
  { handle: "SpaceflightNow", src: "Spaceflight Now", tier: 1, id: "17217640" },
  { handle: "SpaceNews_Inc", src: "SpaceNews", tier: 1, id: "31098756" },
  // Tier 2 (trusted trackers / outlets)
  { handle: "BocaChicaGal", src: "NSF", tier: 2, id: "1077756486997168128" },
  { handle: "StarbaseWatcher", src: "Starbase Watcher", tier: 2, id: "1416984433979138051" },
  { handle: "LabPadre", src: "LabPadre", tier: 2, id: "1110905864578363394" },
  { handle: "RGVaerialphotos", src: "RGV Aerial", tier: 2, id: "752724282925412352" },
  { handle: "thesheetztweetz", src: "CNBC", tier: 2, id: "1231406720" },
  { handle: "StarbaseSurfer", src: "Starbase Surfer", tier: 2 },
  { handle: "CSI_Starbase", src: "CSI Starbase", tier: 2 },
  { handle: "nicans", src: "nicans", tier: 2 },
  { handle: "ZackGolden_", src: "Zack Golden", tier: 2 },
  { handle: "Starship_Spring", src: "Starship Spring", tier: 2 },
  { handle: "efraser77", src: "efraser77", tier: 2 },
  { handle: "TrackingTheSB", src: "Tracking The Starbase", tier: 2 },
  { handle: "Blobifie", src: "Blobifie", tier: 2 },
  { handle: "StarshipGazer", src: "Starship Gazer", tier: 2 },
];
// Web sites at the top tier (articles; FAA = statements + CADENA planning decks)
const TIER1_SITES = ["spacex.com", "faa.gov", "nasaspaceflight.com", "spaceflightnow.com", "spacenews.com"];

const handles = (f = () => true) => ACCOUNTS.filter(f).map((a) => a.handle);
// check-road.js shape: { handle: { src, tier: "official" | "trusted", id } }
const toRoad = (list) => Object.fromEntries(list.map((a) => [a.handle, { src: a.src, tier: a.official ? "official" : "trusted", ...(a.id ? { id: a.id } : {}) }]));
const roadAccounts = () => toRoad(ACCOUNTS.filter((a) => !a.predictOnly));
const predictAccounts = () => toRoad(ACCOUNTS.filter((a) => a.predictOnly));
const byHandle = (h) => ACCOUNTS.find((a) => a.handle.toLowerCase() === String(h || "").replace(/^@/, "").toLowerCase()) || null;
// sanity check of the list itself + coverage of a search query (watchdog)
function audit(query = null) {
  const out = [], seen = new Set();
  for (const a of ACCOUNTS) {
    const k = a.handle.toLowerCase();
    if (seen.has(k)) out.push(`duplicate source ${a.handle}`); seen.add(k);
    if (!a.src || ![1, 2].includes(a.tier)) out.push(`source ${a.handle} needs src + tier 1/2`);
  }
  if (query != null) { const q = String(query).toLowerCase(); const miss = ACCOUNTS.filter((a) => !q.includes(`from:${a.handle.toLowerCase()}`)).map((a) => a.handle); if (miss.length) out.push(`search query misses source(s): ${miss.join(", ")}`); }
  return out;
}
module.exports = { ACCOUNTS, TIER1_SITES, handles, roadAccounts, predictAccounts, byHandle, audit };
