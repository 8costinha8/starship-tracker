/* Source tiers — ONE config (easy to revert). Used by x-first.js.
   Tier 1 confirmed ("Confirmed · @handle"): moves a milestone to In progress / Completed (and a box status).
   Tier 2 trusted trackers ("Reported · @handle"): can also move a milestone to In progress / Completed and count it.
   Only SpaceX/FAA can move a stage backwards or confirm the launch date (statusRule in check-road.js).
   Tier 3 rumour/speculation (wording from ANY account, or a Tier 3 account): "Expected/rumour" only.
   PROPOSED (preview only, needs Bernardo's OK): only active when SOURCE_TIERS_PROPOSED=1.
   The live X search list (x-first XF_ACCOUNTS) is NOT changed by this file unless PROPOSED is on. */
const TIER1 = ["SpaceX", "FAANews", "NASASpaceflight", "elonmusk"];
const TIER1_SITES = ["spacex.com", "faa.gov", "nasaspaceflight.com"];
const TIER2 = ["LabPadre", "RGVaerialphotos", "StarbaseSurfer", "CSI_Starbase", "nicans", "ZackGolden_", "Starship_Spring", "efraser77", "TrackingTheSB", "Blobifie", "StarshipGazer"];
const TIER3 = [];
const PROPOSED = {
  tier1: ["SpaceflightNow", "SpaceNews_Inc"], tier1Sites: ["spaceflightnow.com", "spacenews.com"],
  tier3: ["joehansen", "outerspacetoday", "SERobinsonJr"],
};
const proposedOn = () => process.env.SOURCE_TIERS_PROPOSED === "1";
const lc = (a) => a.map((x) => x.toLowerCase());
const t1 = () => new Set(lc([...TIER1, ...(proposedOn() ? PROPOSED.tier1 : [])]));
const t3 = () => new Set(lc([...TIER3, ...(proposedOn() ? PROPOSED.tier3 : [])]));
const RUMOUR = /\b(rumou?rs?|reportedly|hearing|speculat\w*|possibly|maybe|might|could|may|hopefully|unconfirmed|allegedly|apparently|potentially|likely)\b|\?/i;
// tier of one post + the writer's line about it
function tierOf(post, cls = {}) {
  const u = String(post && post.author && post.author.username || "").toLowerCase();
  if (t1().has(u)) return 1; // Tier 1 hedged wording ("hopefully", "could") stays Tier 1 but only Expected — see hedged()
  if (cls.speculative === true || RUMOUR.test(cls.text || "") || t3().has(u)) return 3;
  return 2;
}
const hedged = (cls = {}) => cls.speculative === true || RUMOUR.test(cls.text || "");
const TIER_LABEL = { 1: "confirmed", 2: "reported", 3: "Expected/rumour" };
const extraAccounts = () => (proposedOn() ? [...PROPOSED.tier1, ...PROPOSED.tier3] : []);
module.exports = { hedged, TIER1, TIER1_SITES, TIER2, TIER3, PROPOSED, tierOf, TIER_LABEL, RUMOUR, extraAccounts, proposedOn };
