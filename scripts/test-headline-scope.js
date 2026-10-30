/* A box headline comes from the tracked flight's vehicles only (Flight 15 Cryo: not the B23 "headed back to Massey's" line). */
const fs = require("fs"), path = require("path"), scope = require("./scope.js");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const live = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8"));
const cryo = live.categories.find((c) => c.id === "cryo");
check(!/Booster 23|B23/.test(cryo.latest) && cryo.latest === "Ship 42 completed further cryo tests.", `Flight ${live.flight} Cryo headline is a Flight ${live.flight} line ("${cryo.latest}")`);
check(scope.headlines(JSON.parse(JSON.stringify(live))).length === 0, "no box headline comes from a later flight's card");
check(cryo.history.some((h) => h.id === "f16-b23-2115312218590126505" && h.flight === 16), "the B23 28 Oct card itself stays (Flight 16 section)");
const r = { flight: 15, categories: [{ id: "cryo", latest: "B23 line", history: [{ text: "B23 line", flight: 16 }, { text: "S42 line", flight: 15 }] }] };
check(scope.headlines(r).length === 1 && r.categories[0].latest === "S42 line", "later-flight headline → newest own-flight line");
console.log(fails ? `\n${fails} FAILED` : "\n✅ All headline scope checks passed."); process.exit(fails ? 1 : 0);
