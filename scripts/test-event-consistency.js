/* One event, one time and one wording in every view: the Road to Flight card (app.js rtfCards + cardDate), the Flight Log
   box (scripts/flightlog.js, pins read from the card's event_record) and the card's log line (date + log_text).
   Real case: B22 cryo showed "9–10 Sep · 08:02 … first full cryo proof test" in the box but "9 Sep · 22:57 … cryo test at
   Massey's" on the card. Source: @Blobifie 10 Sep 08:02 BST, the first post saying it completed.  node scripts/test-event-consistency.js */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), F = require("./flightlog.js"), events = require("./events.js");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const line = (re) => { const m = app.match(re); if (!m) throw new Error("missing " + re); return m[0]; };
const fnBody = (name) => app.slice(app.indexOf(`function ${name}(`), app.indexOf("\n}\n", app.indexOf(`function ${name}(`)) + 2);
const block = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
const src = [line(/const MON3 = [^\n]+/), line(/function ukParts[^\n]+/), fnBody("ukStamp"), line(/const sfIso = [^\n]+/), fnBody("feedTime"),
  line(/const isRealEntry = [^\n]+/), fnBody("flightOf"), line(/const isDoneCard = [^\n]+/), line(/const cardIso = [^\n]+\n[^\n]+/), line(/const cardDate = [^\n]+/),
  line(/const logHw = [^\n]+/), line(/const urlOf = [^\n]+/), block("const RTF_PLACEHOLDER", "function rtfRows(")].join("\n");
const { rtfCards, cardDate } = eval(`(() => { const window = {}; const entryDate = (h) => h.date || ""; const isYouTube = (u) => /youtu\\.?be/i.test(String(u || "")); ${src}\n return { rtfCards, cardDate }; })()`);
const road = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const boxes = F.boxes(road, "30 Oct"), rtf = rtfCards(road);
const recs = road.categories.flatMap((c) => (c.history || []).filter((h) => h.event_record).map((h) => ({ c, h })));
check(recs.length >= 1, `${recs.length} event record(s) in road.json`);
for (const { c, h } of recs) {
  const r = h.event_record, v = F.vehicles ? (h.milestone && h.milestone.hardware) : null;
  const want = `${F.ukDay(r.at)} · ${F.ukTime(r.at)} | ${r.text}`;
  const card = (rtf.find((p) => p.id === `rtf-${c.id}-${v}`) || {}).h;
  const cardShown = card ? `${cardDate(card)} | ${card.x_text || card.text}` : "(no card)";
  const box = ((boxes[c.id] && boxes[c.id].cards || []).find((k) => k.vehicle === v) || { lines: [] }).lines.find((l) => l.text === r.text || l.event === (h.milestone && h.milestone.key));
  const boxShown = box ? `${box.day} · ${box.time} | ${box.text}` : "(no box line)";
  const logShown = `${h.log_date || h.date} · ${F.ukTime(h.completed_at)} | ${h.log_text}`;
  check(cardShown === want, `${c.id}/${v} Road to Flight card: ${cardShown}`);
  check(boxShown === want, `${c.id}/${v} Flight Log box: ${boxShown}`);
  check(logShown === want, `${c.id}/${v} log line: ${logShown}`);
  check(card && card.url === r.url && box && box.url === r.url, `${c.id}/${v}: every view links the same source (${r.url})`);
}
const b22 = recs.find(({ h }) => h.milestone && h.milestone.key === "cryo_test|15|B22");
check(b22 && b22.h.event_record.at === "2026-09-10T07:02:12.000Z" && /Blobifie\/status\/2097943705911193755/.test(b22.h.event_record.url) && b22.h.event_record.text === "Booster 22 completed its first full cryo test.",
  "B22 cryo: 10 Sep 08:02 BST, 'Booster 22 completed its first full cryo test.' (@Blobifie, first completion post)");
check(events.sync(JSON.parse(JSON.stringify(road))).length === 0, "road.json already agrees with its event records");
// a drifted card is pulled back to its record
const d = JSON.parse(JSON.stringify(road)), x = d.categories.find((c) => c.id === "cryo").history.find((h) => h.event_record);
x.text = "Booster 22 completed its cryo test at Massey's."; x.completed_at = null; x.url = "https://x.com/colleenadastra/status/2097806728846868982";
check(events.sync(d).length === 1 && x.text === x.event_record.text && x.completed_at === x.event_record.at && x.url === x.event_record.url, "a drifted card (old 22:57 text/link) is re-synced to its record");
check(/events\.js"\)\.sync\(road\)/.test(fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8")), "checker re-syncs event records each pass");
console.log(fails ? `\n${fails} FAILED` : "\n✅ All event-consistency checks passed."); process.exit(fails ? 1 : 0);
