/* Offline check of the phone swipe settle rule in app.js (swipeCommit).
     node scripts/test-swipe.js        exit 1 if any check fails */
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = src.indexOf("const SWIPE_DIST");
const end = src.indexOf("\n}\n", src.indexOf("function swipeCommit")) + 2;
const { swipeCommit, SWIPE_DIST, SWIPE_FLICK } = new Function(`${src.slice(start, end)}; return { swipeCommit, SWIPE_DIST, SWIPE_FLICK };`)();
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "✅" : "❌"} ${msg}`); if (!ok) failed++; };
check(SWIPE_DIST >= 0.15 && SWIPE_DIST <= 0.2 && Math.abs(SWIPE_FLICK - 0.3) < 1e-9, `thresholds: ${SWIPE_DIST * 100}% of width, flick ${SWIPE_FLICK} px/ms`);
// tracker → Road (from 0, finger moves left: p grows, vx negative)
check(swipeCommit(0, 0.2, -0.05) === true, "slow drag past 18-20% → opens Road");
check(swipeCommit(0, 0.12, -0.05) === false, "slow drag of 12% → springs back");
check(swipeCommit(0, 0.06, -0.45) === true, "short quick flick (6%, 0.45 px/ms) → opens Road");
check(swipeCommit(0, 0.5, 0.4) === false, "dragged far then flicked back → stays on tracker");
// Road → tracker (from 1, finger moves right: p falls, vx positive)
check(swipeCommit(1, 0.8, 0.05) === false, "slow drag back past 20% → tracker");
check(swipeCommit(1, 0.9, 0.05) === true, "slow drag back of 10% → stays on Road");
check(swipeCommit(1, 0.95, 0.4) === false, "short quick flick back → tracker");
check(swipeCommit(1, 0.5, -0.4) === true, "dragged back then flicked forward → stays on Road");
console.log(failed ? `\n❌ ${failed} check(s) failed.` : "\n✅ All checks passed.");
process.exit(failed ? 1 : 0);
