/* Offline: ONE source list (sources.js) feeds x-first search, check-road trust, tiers and the watchdog. node scripts/test-sources.js */
const SRC = require("./sources.js"), xf = require("./x-first.js"), tiers = require("./source-tiers.js"), road = require("./check-road.js"), wd = require("./watchdog.js");
let failed = 0; const check = (ok, m) => { console.log(`${ok ? "✅" : "❌"} ${m}`); if (!ok) failed++; };
const all = SRC.handles();
check(SRC.audit().length === 0, "source list is well-formed (no duplicates, every entry has src + tier)");
check(JSON.stringify(xf.XF_ACCOUNTS) === JSON.stringify(all), "x-first searches exactly the shared list");
check(SRC.audit(xf.xfQuery()).length === 0 && xf.xfQuery().length <= 512, `x-first query covers every source (${xf.xfQuery().length} chars ≤ 512)`);
check(all.every((h) => road.X_ACCOUNTS[h] || road.PREDICT_X_ACCOUNTS[h]), "check-road knows every shared source (trust + legacy search)");
check(Object.keys(road.X_ACCOUNTS).every((h) => all.includes(h)) && Object.keys(road.PREDICT_X_ACCOUNTS).every((h) => all.includes(h)), "check-road has no source outside the shared list");
for (const h of ["FAANews", "SpaceflightNow", "SpaceNews_Inc", "SpaceX", "NASASpaceflight"]) check(tiers.tierOf({ author: { username: h } }, { text: "Static fire done." }) === 1, `${h} is top tier`);
check(tiers.TIER1_SITES.includes("spaceflightnow.com") && tiers.TIER1_SITES.includes("spacenews.com") && tiers.TIER1_SITES.includes("faa.gov"), "Spaceflight Now, SpaceNews, FAA sites top tier");
check(road.X_ACCOUNTS.FAANews.tier === "official" && road.X_ACCOUNTS.SpaceflightNow.tier === "trusted", "only SpaceX/FAA are 'official' (can move a box back / confirm the date)");
check(road.trustForUrl("https://x.com/TrackingTheSB/status/1").tier === "trusted", "a tracker searched by x-first is trusted in check-road too (was 'unconfirmed')");
check(tiers.tierOf({ author: { username: "Blobifie" } }, { text: "B23 rolled out." }) === 2, "trackers stay Tier 2");
wd.check({}, { terms: ["B22"], candidates: 1, sourceQuery: "(from:SpaceX) x" });
check(wd.check.warnings.some((w) => /misses source/.test(w)), "watchdog warns when the search stops covering the list");
wd.check({}, { terms: ["B22"], candidates: 1 });
check(!wd.check.warnings.some((w) => /source/.test(w)), "watchdog quiet with the live x-first query");
process.exit(failed ? 1 : 0);
