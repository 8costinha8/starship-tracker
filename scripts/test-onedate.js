/* 10 Nov: the Road to Flight Launch date box shows the date exactly once — the header "NET 13 Nov"
   from the hero's Launch Library NET, else lastKnownNet from road.json. While unofficial, the inner
   Flight Log entry is dropped so the date is not repeated. Display only (app.js). No network:
   node scripts/test-onedate.js */
const fs = require("fs"), path = require("path"), F = require("./flightlog.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, ".."), clone = (x) => JSON.parse(JSON.stringify(x));
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const APP = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

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
const ukPartsSrc = extract("ukParts");
const lastSrc = extract("lastKnownNetLabel");
const authSrc = extract("authoritativeNetLabel");
const dispSrc = extract("launchDateDisplay");
const fns = new Function("MON3", `${ukPartsSrc}\n${lastSrc}\n${authSrc}\n${dispSrc}\nreturn { lastKnownNetLabel, authoritativeNetLabel, launchDateDisplay };`)(MON3);

const fx = clone(live); delete fx.predicted; delete fx.official_date; delete fx.launched;
const dc = fx.categories.find((c) => c.id === "date");
dc.latest = dc.log_latest = "Flight 15 NET 13 Nov.";
const raw = (opts) => F.boxes(clone(fx), "10 Nov", opts).date;
const view = (flog, road, heroNet) => fns.launchDateDisplay(flog, fns.authoritativeNetLabel(road, heroNet));
const linesOf = (d) => (d.cards || []).flatMap((c) => c.lines || []);
const boxText = (d) => [d.latest, ...linesOf(d).flatMap((l) => [l.day, l.time, l.text])].filter(Boolean).join("\n");
const countLabel = (d, label) => boxText(d).split(label).length - 1;

// 1. hero Launch Library NET wins, and the box has only that date
const withHero = view(raw({ net: { n: 15, date: "2026-11-13T22:45:00Z" } }), fx, { n: 15, date: "2026-11-13T22:45:00Z" });
check(withHero.latest === "NET 13 Nov", `hero NET is the headline: "${withHero.latest}"`);
check((withHero.cards || []).length === 0 && linesOf(withHero).length === 0, "unofficial: the inner Flight Log entry is dropped; only the header remains");
check(countLabel(withHero, "NET 13 Nov") === 1 && countLabel(withHero, "13 Nov") === 1, "date text renders exactly once in that box (header only)");
check(!/No official/.test(JSON.stringify(withHero)), "no 'No official Flight 15 date yet' in the display");
check(!/8 November|10 Nov/.test(boxText(withHero)), "stale 8 November / 10 Nov rows are not shown");

// 2. no hero NET: fall back to lastKnownNet from road.json, never a hard-coded date
const fallback = view(raw({}), fx, null);
check(fns.lastKnownNetLabel(fx, 15) === "NET 13 Nov" && fallback.latest === "NET 13 Nov", "no hero NET → lastKnownNet 'NET 13 Nov'");
check((fallback.cards || []).length === 0 && countLabel(fallback, "NET 13 Nov") === 1 && countLabel(fallback, "13 Nov") === 1, "fallback also renders the date exactly once (header only)");
check(!/13 Nov/.test(extract("authoritativeNetLabel") + extract("launchDateDisplay") + extract("lastKnownNetLabel")), "helpers never hard-code 13 Nov");

// 3. late-evening UK stays on the hero's UK day
const late = view(raw({}), fx, { n: 15, date: "2026-11-13T23:30:00Z" });
check(late.latest === "NET 13 Nov" && countLabel(late, "NET 13 Nov") === 1, "23:30 UTC in November stays 13 Nov UK, once in the header");

// 4. official / launched (status done) is not replaced
const officialRoad = clone(fx); officialRoad.official_date = { at: "2026-11-13T22:45:00Z", text: "Flight 15 is set for 13 Nov." };
const officialRaw = F.boxes(officialRoad, "10 Nov", { net: { n: 15, date: "2026-11-13T22:45:00Z" } }).date;
const officialView = view(officialRaw, officialRoad, { n: 15, date: "2026-11-13T22:45:00Z" });
check(officialRaw.status === "done" && officialView === officialRaw, "an official date (status done) is left unchanged");

// 5. a non-15 next flight with no NET of its own is unchanged (Flight 16 behaviour)
const r16 = clone(fx); r16.flight = 16;
const d16 = F.boxes(r16, "10 Nov", {}).date;
const v16 = view(d16, r16, null);
check(fns.lastKnownNetLabel(r16, 16) === "" && v16 === d16 && /No official Flight 16 date yet/.test(d16.latest), "non-15 flight with no lastKnownNet of its own renders as before");
check(view(d16, r16, { n: 15, date: "2026-11-13T22:45:00Z" }) === d16, "a Flight 15 hero NET is not applied to Flight 16");

// 6. boxes() itself is unchanged (checkers still see the old lines); only the app display is folded
const checker = raw({});
check(checker.latest === "No official Flight 15 date yet." && linesOf(checker)[0].day === "10 Nov" && linesOf(checker).length > 1, "checkers (boxes() with no display helper) still see the stored official-empty line");
check(/dateNet = authoritativeNetLabel\(road, heroNet\)/.test(APP) && /launchDateDisplay\(f, dateNet\)/.test(APP), "RoadCard applies launchDateDisplay only when rendering the date box");
check(/boxes\(road, undefined, \{ net: heroNet \|\| null, pending: !!netPending \}\)/.test(APP), "RoadCard still passes hero NET + pending into boxes() for the headline");

const others = fs.readdirSync(__dirname).filter((f) => /\.js$/.test(f) && !/^test-/.test(f)).filter((f) => /launchDateDisplay|authoritativeNetLabel/.test(fs.readFileSync(path.join(__dirname, f), "utf8")));
check(!others.length, `no checker or script calls the display helpers (${others.join(", ") || "none"})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
