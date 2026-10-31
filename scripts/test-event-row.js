/* Guard event-row: a completed milestone always shows its completion (from its event_record) as a row in that vehicle's
   Earlier updates — Road box (Road feed card) and Road to Flight card. Every vehicle and test type. Live case: B22 cryo
   jumped 8 Sep → 12 Sep with the 10 Sep completion missing.  node scripts/test-event-row.js */
const fs = require("fs"), path = require("path"), guards = require("./guards.js");
const ROOT = path.join(__dirname, "..");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const line = (re) => app.match(re)[0], block = (a, b) => app.slice(app.indexOf(a), app.indexOf(b, app.indexOf(a)));
const fnBody = (n) => app.slice(app.indexOf(`function ${n}(`), app.indexOf("\n}\n", app.indexOf(`function ${n}(`)) + 2);
const src = [line(/const isRealEntry = [^\n]+/), fnBody("flightOf"), line(/const sfIso = [^\n]+/), line(/const isDoneCard = [^\n]+/), line(/const cardIso = [^\n]+\n[^\n]+/), line(/const logHw = [^\n]+/), line(/const urlOf = [^\n]+/), block("const RTF_PLACEHOLDER", "function rtfRows(")].join("\n");
const rtfCards = eval(`(() => { const window = {}; const entryDate = (h) => h.date || ""; const isYouTube = (u) => /youtu\\.?be/i.test(String(u || "")); ${src}\n return rtfCards; })()`);
const roadUpdates = eval(`(() => { const MON3 = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; const sfIso = () => ""; const ukStamp = (iso) => iso.slice(0, 10); const feedTime = () => ""; const fmtDay = (d) => d;
  ${line(/const upIso = [^\n]+/)}\n${fnBody("roadUpdates")}\n return roadUpdates; })()`);
const REC = { at: "2026-09-10T07:02:12.000Z", text: "Booster 22 completed its first full cryo test.", url: "https://x.com/Blobifie/status/2097943705911193755", src: "@Blobifie" };
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const b22 = live.categories[0].history.find((h) => h.event_record && h.event_record.url === REC.url);
const ups = (b22 && b22.updates) || [];
const iRow = ups.findIndex((u) => u.event_row && u.text === REC.text && u.url === REC.url && u.phase === "completed" && u.date === "10 Sep" && u.at === REC.at);
check(iRow > 0 && /moved to Massey/.test(ups[iRow - 1].text) && ups.slice(iRow + 1).some((u) => /left Massey/.test(u.text)), "road.json: B22 cryo row '10 Sep Booster 22 completed its first full cryo test.' sits between 8 Sep and 12 Sep, phase completed, Blobifie link");
const rtfB22 = (rtfCards(live).find((p) => p.id === "rtf-cryo-B22") || {}).h || {};
check((rtfB22.updates || []).some((u) => u.text === REC.text && u.url === REC.url), "Road to Flight card (Cryo · Booster 22): the completion row is in Earlier updates");
check(roadUpdates(b22).some(({ u }) => u.text === REC.text && u.url === REC.url), "Road box (feed card): the completion row is in Earlier updates (not folded away)");
// guard: every vehicle and test type
const fx = () => ({ flight: 15, vehicles: ["B22", "S42"], categories: [
  { id: "static", history: [{ id: "s", text: "Ship 42 completed its static fire.", hardware: "S42", milestone: { key: "static_fire|15|S42", phase: "completed" }, event_record: { at: "2026-10-27T21:00:00Z", text: "Ship 42 completed its static fire.", url: "https://x.com/a/status/1", src: "@a" }, updates: [{ date: "26 Oct", at: "2026-10-26T10:00:00Z", text: "Ship 42 arrived at Massey's." }, { date: "29 Oct", at: "2026-10-29T10:00:00Z", text: "Ship 42 back in Megabay 2." }] }] },
  { id: "cryo", history: [{ id: "p", text: "Booster 30 cryo under way.", milestone: { phase: "progress" }, event_record: { at: "2026-10-01T10:00:00Z", text: "x" } }] }] });
const logs = [], r = fx(); guards.run(r, { log: (m) => logs.push(m) });
const su = r.categories[0].history[0].updates;
check(su.length === 3 && su[1].event_row && su[1].text === "Ship 42 completed its static fire." && su[1].date === "27 Oct" && su[1].url === "https://x.com/a/status/1", "guard: ship static fire missing its row → added in time order from the event record");
check(logs.some((l) => /^GUARD event-row:/.test(l)), "guard logs GUARD event-row");
check(!r.categories[1].history[0].updates, "guard: a milestone not completed gets no row");
const n = logs.length; guards.run(r, { log: (m) => logs.push(m) });
check(!logs.slice(n).some((l) => /event-row/.test(l)) && r.categories[0].history[0].updates.length === 3, "guard is idempotent (no second row, no log)");
const r2 = fx(); r2.categories[0].history[0].updates.push({ event_row: true, date: "1 Jan", text: "old", url: "u" }); guards.eventRows(r2);
const row = r2.categories[0].history[0].updates.find((u) => u.event_row);
check(row.text === "Ship 42 completed its static fire." && row.date === "27 Oct", "guard: a drifted row is synced back to the event record (all views match)");
check(guards.eventRows(JSON.parse(JSON.stringify(live))).length === 0, "road.json: no completed milestone is missing its row");
console.log(fails ? `\n❌ ${fails} check(s) failed` : "\nAll event-row checks passed."); process.exit(fails ? 1 : 0);
