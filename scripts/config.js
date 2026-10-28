/* Tunables shared by the checker scripts. */
module.exports = {
  // Milestone media cascade (media-cascade.js): how long after a milestone card first appears the card keeps
  // following a better source (image + link + source post). After it, only SpaceX's own accounts can still swap.
  ASSESS_WINDOW_DAYS: 2,
  // Cascade source tiers: 1 = SpaceX's own accounts (swap immediately, skip the window);
  // 2 = NSF and outlets with a similar track record; anyone else = 3 (a first signal only, never shown alone).
  CASCADE_TIER1: ["SpaceX", "SpaceXStarship", "Starbase", "elonmusk"],
  CASCADE_TIER2: ["NASASpaceflight", "LabPadre", "RGVaerialphotos", "StarbaseSurfer", "CSI_Starbase", "Blobifie", "TrackingTheSB", "StarshipGazer", "efraser77", "colleenadastra", "StarbaseWatcher", "nicans", "ZackGolden_"],
};
