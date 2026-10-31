/* Offline: journey routing for news / RSS items in check-road (scripts/journey.js routeNews). No network, nothing sent.
   node scripts/test-journey-news.js */
const J = require("./journey.js"), fs = require("fs"), path = require("path");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const road = (j) => ({ flight: 15, vehicles: ["B22", "S42"], journeys: j, categories: ["cryo", "raptor", "static", "pad", "faa", "date"].map((id) => ({ id, history: [] })) });
const B = J.blank();
let r = J.routeNews(road({ S42: { ...B, location: "Megabay 2" } }), "Ship 42 left Megabay 2 for Massey's.", { box: "cryo" });
check(r && r.box === "pad" && r.likely, "news: ambiguous move → Pad card, likely");
r = J.routeNews(road({ S42: { ...B, location: "Massey's" } }), "Frost seen on both of Ship 42's tanks.", { box: "static" });
check(r && r.box === "cryo" && r.text === "Frost on both tanks: Ship 42 likely in a cryo test.", "news: frost at Massey's → Cryo, plain-meaning line, likely");
r = J.routeNews(road({ S42: { ...B, location: "pad", stacked: true, engines: true } }), "Frost on Ship 42 during tanking on the pad.", { box: "cryo" });
check(r && r.box === "pad", "news: frost while stacked → Pad, never cryo");
r = J.routeNews(road({ B22: { ...B, location: "pad", engines: true } }), "Frost forming on Booster 22's LOX tank.", { box: "cryo" });
check(r && r.box === "static", "news: B22 frost on the launch mount with engines → Static fires (b675c0b case)");
r = J.routeNews(road({ B22: { ...B, last_test: { test: "static", at: "2026-10-25T19:00:00Z" } } }), "Booster 22 returned to Megabay 1.", { box: "pad", at: "2026-10-26T09:00:00Z" });
check(r && r.box === "static", "news: return right after a static fire → Static fires");
check(J.routeNews(road({ S42: B }), "Booster 23 returned to Megabay 1.", { box: "cryo" }) === null, "news: another flight's vehicle → no journey opinion (scope guards handle it)");
check(J.routeNews(road({ S42: B }), "FAA licence issued for Ship 42's flight.", { box: "faa" }) === null, "news: FAA / date boxes are never re-routed");
check(J.routeNews({ ...road(), journeys: undefined }, "Ship 42 left Megabay 2 for Massey's.", { box: "cryo" }) === null, "news: no saved journey → unchanged behaviour");
const src = fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8");
check(/journey\.routeNews\(road, line/.test(src) && /journey\.observe\(road, line/.test(src) && /journey\.confirmLine\(/.test(src), "check-road: news items are routed, observed (state saved) and confirm the same likely line");
console.log(fails ? `\n❌ ${fails} check(s) failed` : "\nAll journey news checks passed."); process.exit(fails ? 1 : 0);
