/* Display only: the Road peek toggle labels the next flight from peekN; a
   Megabay / production-site return is promoted off the main line of every Road
   pad card (any flight, including the current view); and a SpaceX window with
   no official_date and no FAA licence shows a Pending approval badge.
   node scripts/test-generalise12.js */
const fs = require("fs"), path = require("path"), RC = require("./render-check.js"), F = require("./flightlog.js");
let pass = 0, fail = 0;
const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));

// 1. toggle open label is generic (Hide Flight ${peekN} updates), not hard-coded 16
const labelSrc = APP.match(/peekOpen \? (`Hide Flight \$\{peekN\} updates`) : (`After Flight \$\{road\.flight\} · see Road to Flight \$\{peekN\} so far`)/);
check(!!labelSrc, "UpdatesFeed open label is `Hide Flight ${peekN} updates` (not a hard-coded 16)");
check(!/Hide Flight 16 updates/.test(APP) && !/relabelF16Cards|F16_MEGABAY_RETURN|F16_PAD_EVENT/.test(APP),
  "no leftover Flight-16-only toggle or relabel names in app.js");
check(/function relabelPadReturnCards\(/.test(APP) && /const MEGABAY_RETURN = /.test(APP) && /const PAD_EVENT = /.test(APP)
  && /return relabelPadReturnCards\(out\);/.test(APP),
  "relabelPadReturnCards / MEGABAY_RETURN / PAD_EVENT apply inside rtfCards (every Road pad card)");

function toggleLabels(flight) {
  const road = { flight }, peekN = Number.isInteger(road.flight) ? road.flight + 1 : null, peekOpen = true;
  const open = Function("peekOpen", "peekN", "road", "return " + labelSrc[1])(true, peekN, road);
  const closed = Function("peekOpen", "peekN", "road", "return " + labelSrc[2])(false, peekN, road);
  return { open, closed };
}
const f17 = toggleLabels(17), f15 = toggleLabels(15);
check(f17.open === "Hide Flight 18 updates" && f17.closed === "After Flight 17 · see Road to Flight 18 so far",
  "synthetic Flight 17 toggle: open 'Hide Flight 18 updates', closed names Flight 17 / 18");
check(f15.open === "Hide Flight 16 updates" && f15.closed === "After Flight 15 · see Road to Flight 16 so far",
  "Flight 15 still renders 'Hide Flight 16 updates' from peekN");

// 2. live Flight 15 pad cards: the rule does not change any current card
const livePads = RC.view(live).cards.filter((c) => c.cat === "pad");
const MEGA = /returned to megabay|returned to the production site/i;
const unexpected = livePads.filter((c) => MEGA.test(c.text) && !/after cryo/i.test(c.text));
check(livePads.length >= 1 && unexpected.length === 0,
  `live Flight 15 pad cards are unchanged by the rule (${livePads.map((c) => c.id + ": " + c.text).join(" | ")})`);

// 3. synthetic Flight 17 current view: a Megabay return is demoted, pad-accurate row promoted
function padRoad({ flight, ship, booster, returnText, padText, also } = {}) {
  const history = [
    { text: returnText, date: "11 Nov", at: "2026-11-11T12:00:00.000Z", hardware: ship, flight, url: "https://x.com/test/status/1", src: "@test" },
    { text: padText, date: "10 Nov", at: "2026-11-10T12:00:00.000Z", hardware: ship, flight, url: "https://x.com/test/status/2", src: "@test" },
  ];
  if (also) history.push(...also);
  return {
    flight, vehicles: [ship, booster], hardware_flights: { [ship]: flight, [booster]: flight },
    categories: [
      { id: "cryo", name: "Cryo tests", history: [] },
      { id: "raptor", name: "Raptor", history: [] },
      { id: "static", name: "Static fires", history: [] },
      { id: "pad", name: "Pad activity", history },
      { id: "date", name: "Launch date", history: [] },
      { id: "faa", name: "FAA licence", history: [] },
    ],
    feed_items: [],
  };
}
const syn17 = padRoad({
  flight: 17, ship: "S99", booster: "B99",
  returnText: "Ship 99 returned to Megabay 2.",
  padText: "The chopsticks lifted Ship 99 to the top of the tower.",
});
const s99 = RC.view(syn17).cards.find((c) => c.id === "rtf-pad-S99");
check(s99 && s99.text === "The chopsticks lifted Ship 99 to the top of the tower.",
  "Flight 17 current view: pad-accurate row is the main line");
check(s99 && s99.rows.some((r) => r.text === "Ship 99 returned to Megabay 2."),
  "Flight 17 current view: Megabay return is kept in Earlier updates");

// 4. same rule on a Flight 18 current view (the Flight 17 peek flight), production-site wording
const syn18 = padRoad({
  flight: 18, ship: "S100", booster: "B100",
  returnText: "Ship 100 returned to the production site.",
  padText: "Ship 100 was lifted to catch height.",
});
const s100 = RC.view(syn18).cards.find((c) => c.id === "rtf-pad-S100");
check(s100 && s100.text === "Ship 100 was lifted to catch height.",
  "Flight 18 current view: production-site return is promoted off the main line");
check(s100 && s100.rows.some((r) => r.text === "Ship 100 returned to the production site."),
  "Flight 18 current view: production-site return is kept in Earlier updates");

// 5. "after cryo" returns stay on the main line (same exception as before)
const synCryo = padRoad({
  flight: 17, ship: "S99", booster: "B99",
  returnText: "Ship 99 returned to Megabay 2 after cryo testing.",
  padText: "The chopsticks lifted Ship 99 to the top of the tower.",
});
const s99cryo = RC.view(synCryo).cards.find((c) => c.id === "rtf-pad-S99");
check(s99cryo && s99cryo.text === "Ship 99 returned to Megabay 2 after cryo testing.",
  "a Megabay return after cryo is left as the main line");

// 6. Launch date badge: "Pending approval" only when all three conditions hold
const srcFn = (name) => { const i = APP.indexOf(`function ${name}(`); return i < 0 ? "" : APP.slice(i, APP.indexOf("\n}\n", i) + 2); };
const badgeFns = new Function(`${srcFn("isSpaceXLaunchSource")}\n${srcFn("launchDateCardBadge")}\nreturn { isSpaceXLaunchSource, launchDateCardBadge };`)();
check(/function launchDateCardBadge\(/.test(APP) && /return top \? launchDateCardBadge\(road, top, f\) : null/.test(APP),
  "UpdatesFeed uses launchDateCardBadge for the Launch date pill (display only)");
check(!/Pending approval/.test(fs.readFileSync(path.join(__dirname, "flightlog.js"), "utf8")),
  "flightlog.js is unchanged (no Pending approval badge there)");

const sx = badgeFns.isSpaceXLaunchSource;
check(sx("https://www.spacex.com/launches/starship-flight-17") && sx("https://spacex.com/x") && sx("https://content.spacex.com/y")
  && sx("https://x.com/SpaceX/status/1") && sx("https://twitter.com/spacex/status/1"),
  "SpaceX page and @SpaceX post URLs are recognised");
check(!sx("https://www.nasaspaceflight.com/x") && !sx("https://x.com/LabPadre/status/1") && !sx("https://x.com/SpaceXNews/status/1") && !sx(""),
  "non-SpaceX URLs are not treated as SpaceX");

function dateRoad(extra) {
  return Object.assign({
    flight: 17, vehicles: ["S99", "B99"],
    categories: [
      { id: "cryo", name: "Cryo tests", history: [] },
      { id: "raptor", name: "Raptor", history: [] },
      { id: "static", name: "Static fires", history: [] },
      { id: "pad", name: "Pad activity", history: [] },
      { id: "date", name: "Launch date", history: [] },
      { id: "faa", name: "FAA licence", history: [] },
    ],
  }, extra || {});
}
function badgeOf(road, url) {
  return badgeFns.launchDateCardBadge(road, { id: "launch_date-f17", h: { url, text: "SpaceX set the launch window." } }, F.boxes(road));
}
const sxUrl = "https://www.spacex.com/launches/starship-flight-17";
const allTrue = badgeOf(dateRoad(), sxUrl);
check(allTrue && allTrue.text === "Pending approval" && allTrue.status === "progress",
  "Flight 17: all three conditions true → Pending approval (progress style)");

const withOfficial = badgeOf(dateRoad({ official_date: { at: "2026-12-20T22:00:00Z", text: "Flight 17 is set for 20 Dec." } }), sxUrl);
check(withOfficial && withOfficial.text === "Confirmed" && withOfficial.status === "done",
  "Flight 17: official_date set → existing Confirmed badge");

const notSx = badgeOf(dateRoad(), "https://www.nasaspaceflight.com/2026/11/window/");
check(notSx && notSx.text === "Not confirmed" && notSx.status === "none",
  "Flight 17: non-SpaceX source → existing Not confirmed badge");

const licenced = badgeOf(dateRoad({ milestones: { flight: { licence: { dates: ["2026-12-01T00:00:00Z"], src: ["https://faa.gov"] } } } }), sxUrl);
check(licenced && licenced.text === "Not confirmed" && licenced.status === "none",
  "Flight 17: FAA licence issued → existing Not confirmed badge");

const xPost = badgeOf(dateRoad(), "https://x.com/SpaceX/status/123");
check(xPost && xPost.text === "Pending approval" && xPost.status === "progress",
  "Flight 17: a SpaceX X post also qualifies");

const estimated = badgeOf(dateRoad({ predicted: { flight: 17, net: "2026-12-20" } }), sxUrl);
check(estimated && estimated.text === "Pending approval" && estimated.status === "progress",
  "Flight 17: Estimated NET is still replaced when all three conditions hold");

const estimatedNoSx = badgeOf(dateRoad({ predicted: { flight: 17, net: "2026-12-20" } }), "https://x.com/LabPadre/status/1");
check(estimatedNoSx && estimatedNoSx.text === "Estimated" && estimatedNoSx.status === "progress",
  "Flight 17: Estimated badge is kept when the source is not SpaceX");

const unoff = JSON.parse(JSON.stringify(live)); delete unoff.official_date; // 13 Nov: live now carries a pinned official_date; these two checks model the world without it
const liveFlog = F.boxes(unoff), liveDate = (live.feed_items || []).find((f) => f.id === (RC.view(live).cards.find((c) => c.cat === "date") || {}).id);
const liveBadge = liveDate && badgeFns.launchDateCardBadge(unoff, { id: liveDate.id, h: { url: liveDate.url, text: liveDate.body } }, liveFlog);
check(liveFlog.date && liveFlog.date.statusText === "Not confirmed",
  "boxes() itself is unchanged on the live road (still Not confirmed)");
check(liveBadge && liveBadge.text === "Pending approval" && liveBadge.status === "progress",
  "live Flight 15 window card (SpaceX, no official_date, no FAA licence) shows Pending approval");

console.log(fail ? `❌ ${fail} failed, ${pass} passed` : `✅ All generalise-12 checks passed (${pass}).`);
process.exit(fail ? 1 : 0);
