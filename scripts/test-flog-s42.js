/* Display only: Flight Log pad · S42 shows the 7 Nov catch-confirmation feed item on top,
   with the 12 Sep pin moved into Earlier updates. boxes() itself is unchanged.
   node scripts/test-flog-s42.js */
const fs = require("fs"), path = require("path"), F = require("./flightlog.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
function extract(name) {
  const start = APP.indexOf(`function ${name}(`);
  if (start < 0) throw new Error("missing " + name);
  let depth = 0, i = start, begun = false;
  for (; i < APP.length; i++) {
    if (APP[i] === "{") { depth++; begun = true; }
    else if (APP[i] === "}") { depth--; if (begun && depth === 0) { i++; break; } }
  }
  return APP.slice(start, i);
}
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fns = new Function("MON3", `${extract("ukParts")}\n${extract("feedPadLines")}\n${extract("flogPadDisplay")}\nreturn { feedPadLines, flogPadDisplay };`)(MON3);
const raw = F.boxes(live).pad;
const s42raw = (raw.cards || []).find((c) => c.vehicle === "S42");
check(s42raw && s42raw.lines[0] && /12 Sep/.test(s42raw.lines[0].day) && /lifted to catch height/.test(s42raw.lines[0].text), "boxes() S42 top line is still the 12 Sep pin (checkers unchanged)");
const feed = (live.feed_items || []).find((f) => f.id === "news-mw6lov68-8f7179");
check(feed && feed.box === "pad" && /confirmed for a catch attempt/.test(feed.body), "7 Nov S42 catch confirmation is the pad feed item news-mw6lov68-8f7179");
const view = fns.flogPadDisplay(raw, live);
const s42 = (view.cards || []).find((c) => c.vehicle === "S42");
check(s42 && s42.lines[0] && s42.lines[0].day === "7 Nov" && s42.lines[0].time === "16:11" && s42.lines[0].text === feed.body && s42.lines[0].id === "news-mw6lov68-8f7179", `display top line is 7 Nov · 16:11 catch confirmation: "${s42 && s42.lines[0] && s42.lines[0].day} ${s42 && s42.lines[0] && s42.lines[0].time} ${s42 && s42.lines[0] && s42.lines[0].text}"`);
const earlier = (s42.lines || []).slice(1);
check(earlier.some((l) => l.day && l.day.startsWith("12 Sep") && /lifted to catch height/.test(l.text)), "12 Sep lift is in Earlier updates (not the top line)");
check(JSON.stringify(s42raw.lines) === JSON.stringify(raw.cards.find((c) => c.vehicle === "S42").lines), "display helper does not mutate boxes() card lines");
check(/m\.id === "pad" && f\) \? flogPadDisplay\(f, road\)/.test(APP), "RoadCard applies flogPadDisplay only when rendering the pad box");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
