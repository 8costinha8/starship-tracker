/* Regression (live bug 30 Oct): the "Cryo tests · Ship 42" card's Earlier updates showed "30 Oct 09:03 Booster 23 has returned
   to Megabay 1 from the Massey outpost" — a B23 / Flight 16 item. Earlier updates must hold only the card's own vehicle + flight,
   in the data (scripts/scope.js) and in app.js rendering (rtfCards).  node scripts/test-earlier-scope.js */
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const ROOT = path.join(__dirname, ".."), scope = require("./scope.js");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const line = (re) => { const m = app.match(re); if (!m) throw new Error("missing " + re); return m[0]; };
const block = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
const fnBody = (name) => app.slice(app.indexOf(`function ${name}(`), app.indexOf("\n}\n", app.indexOf(`function ${name}(`)) + 2);
const src = [line(/const isRealEntry = [^\n]+/), fnBody("flightOf"), line(/const sfIso = [^\n]+/), line(/const isDoneCard = [^\n]+/), line(/const cardIso = [^\n]+\n[^\n]+/),
  line(/const logHw = [^\n]+/), line(/const urlOf = [^\n]+/), block("const RTF_PLACEHOLDER", "function rtfRows(")].join("\n");
const rtfCards = eval(`(() => { const window = {}; const entryDate = (h) => h.date || ""; const isYouTube = (u) => /youtu\.?be/i.test(String(u || "")); ${src}\n return rtfCards; })()`);
const leak = "Booster 23 has returned to Megabay 1 from the Massey outpost";
const s42cryo = (road) => (rtfCards(road).find((p) => p.id === "rtf-cryo-S42") || {}).h || {};
// 1. the real case: road.json as it was live (f403a17), app rendering
let before = null; try { before = JSON.parse(execSync("git show f403a17:road.json", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString()); } catch {}
if (!before) { before = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8")); const f = before.feed_items.find((x) => x.body === leak); if (f) f.flight = 15; }
check(before.feed_items.some((f) => f.body === leak && f.flight === 15 && f.box === "cryo"), "fixture: the live leak (B23 news item tagged Flight 15, box cryo)");
const ups = (s42cryo(before).updates || []).map((u) => u.text);
check(ups.length > 0 && !ups.includes(leak), `app: Ship 42 Cryo Earlier updates no longer show the B23 line, even with the old data (${ups.length} lines, top: "${ups[0]}")`);
check(ups.every((t) => !scope.vehOf(t).length || scope.vehOf(t).includes("S42")), "app: every Ship 42 Cryo Earlier update names Ship 42 or no vehicle");
const b22 = (rtfCards(before).find((p) => p.id === "rtf-cryo-B22") || {}).h || {};
check(!(b22.updates || []).some((u) => u.text === leak), "app: nor on Booster 22's Cryo card");
// 2. the data: scope.enforce re-tags the item to Flight 16 and leaves the live file clean
const d = JSON.parse(JSON.stringify(before)), moves = scope.enforce(d);
check(moves.some((m) => m.text === leak) && d.feed_items.find((f) => f.body === leak).flight === 16, "data: B23 item re-tagged to Flight 16 (B23 is Flight 16 hardware)");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
check(scope.enforce(JSON.parse(JSON.stringify(live))).length === 0, "data: road.json has no leaked items left");
check(!(s42cryo(live).updates || []).some((u) => u.text === leak), "app + live road.json: no leak");
// 3. card updates: an update naming another flight's vehicle is dropped, own/neutral kept
const r = { flight: 15, vehicles: ["B22", "S42"], categories: [{ id: "cryo", history: [{ id: "c1", hardware: "S42", flight: 15, text: "Ship 42 cryo", updates: [{ text: "Ship 42 back on the stand" }, { text: "Frost on the tanks" }, { text: leak }, { text: "Ship 42 test", flight: 16 }] }, { id: "c2", hardware: "B23", flight: 16, text: "B23 cryo" }] }], feed_items: [] };
scope.enforce(r);
check(r.categories[0].history[0].updates.map((u) => u.text).join("|") === "Ship 42 back on the stand|Frost on the tanks", "data: card keeps own + neutral updates, drops other vehicle / other flight");
check(/scope\.js"\)\.enforce\(road\)/.test(fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8")), "checker runs the scope clean-up each pass");
console.log(fails ? `\n${fails} FAILED` : "\n✅ All Earlier-updates scope checks passed."); process.exit(fails ? 1 : 0);
