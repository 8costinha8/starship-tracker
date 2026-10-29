// one-time lifecycle migration: labels + build-up, idempotent, no pushes
process.env.PUSH_SHADOW = process.env.PUSH_SHADOW || "0"; // live push-shadow.json must not turn this suite into shadow mode
const fs = require("fs"), path = require("path");
const { migrate } = require("./migrate-lifecycle.js");
const { validateRoad } = require("./check-road.js");
let fail = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fail++; };
const road = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "road-push-sync.json"), "utf8"));
const before = road.categories.map((c) => [c.id, c.status, c.latest]);
const r = migrate(road);
const all = road.categories.flatMap((c) => c.history || []).filter((h) => h.kind !== "check");
check(r.touched > 0 && all.every((h) => h.tier), "every entry gets a tier");
check(all.filter((h) => h.milestone).every((h) => h.milestone.type && h.milestone.flight && h.milestone.phase && h.milestone.key), "milestones carry type, flight, phase, key");
const keys = road.categories.flatMap((c) => c.history.filter((h) => h.milestone && !h.manual).map((h) => c.id + h.milestone.key));
check(new Set(keys).size === keys.length, "one entry per milestone (the rest are build-up lines)");
check(JSON.stringify(road.categories.map((c) => [c.id, c.status, c.latest])) === JSON.stringify(before), "box status/latest untouched");
const again = JSON.stringify(road); migrate(road); check(JSON.stringify(road) === again, "idempotent");
check(!/push-sync|firebase/.test(fs.readFileSync(path.join(__dirname, "migrate-lifecycle.js"), "utf8").replace(/\/\*[\s\S]*?\*\//, "")), "never loads the push sender");
try { validateRoad(road); check(true, "migrated road validates"); } catch (e) { check(false, "migrated road validates: " + e.message); }
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const rc = app.slice(app.indexOf("function RoadCard"), app.indexOf("\n}\n", app.indexOf("function RoadCard")));
check(rc.length > 100 && !/<img|Media\b|<video|media_override|media_context|x_post\.media/.test(rc), "Flight Log page Road box (RoadCard) is text only: no images or media components");
check(!/function MiniMedia/.test(app), "no MiniMedia component left");
check(!/post-done|mini-done/.test(app), "no card gets a different (green) border");
const fp = app.slice(app.indexOf("function FeedPost"), app.indexOf("\n}\n", app.indexOf("function FeedPost")));
check(/<CreditLine h=\{h\} \/>/.test(fp) && !/post-foot|post-src|post-link/.test(fp), "feed cards: one credit line '@handle · View on X', no chip/icon row");
console.log(fail ? `\n${fail} FAILED` : "\nall passed"); process.exit(fail ? 1 : 0);
