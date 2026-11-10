/* Display only: the Road to Flight view shows only the newest/current Launch date
   card (date-box history + launch_date feed items). Older slips stay in road.json
   and in the Flight Log. No dates are hard-coded. node scripts/test-onelaunchcard.js */
const fs = require("fs"), path = require("path"), F = require("./flightlog.js"), RC = require("./render-check.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));

const dateCards = (road) => RC.view(road).cards.filter((c) => c.cat === "date" || c.cat === "feed-launch_date");
const roadDateIds = (road) => dateCards(road).map((c) => c.id);
const stillInData = (road, id) => {
  if ((road.feed_items || []).some((f) => f && f.id === id)) return true;
  const c = (road.categories || []).find((x) => x.id === "date");
  return !!(c && (c.history || []).some((h, hi) => h && (`date-${hi}` === id || h.id === id)));
};

function expectedNewest(road) {
  const items = [];
  for (const f of road.feed_items || []) {
    if (!f || !f.id || !f.body) continue;
    if (f.kind !== "launch_date" && f.box !== "date") continue;
    const fl = Number.isInteger(f.flight) ? f.flight : road.flight;
    if (fl !== road.flight) continue;
    items.push({ id: f.id, at: Date.parse(f.event_at || f.at) || 0, text: f.body });
  }
  const cat = (road.categories || []).find((x) => x.id === "date");
  (cat && cat.history || []).forEach((h, hi) => {
    if (!h || h.log_only) return;
    const fl = Number.isInteger(h.flight) ? h.flight : road.flight;
    if (fl !== road.flight) return;
    items.push({ id: `date-${hi}`, at: Date.parse((h.x_post && h.x_post.created_at) || h.at || h.publishedAt) || 0, text: h.card_text || h.text });
  });
  items.sort((a, b) => b.at - a.at);
  return items[0] || null;
}

// 1. live Road view: exactly one Launch date card, and it is the newest item
const want = expectedNewest(live);
const liveCards = dateCards(live);
check(want && liveCards.length === 1, `live Road view has exactly one Launch date card (got ${liveCards.length})`);
check(liveCards[0] && liveCards[0].id === want.id && liveCards[0].cat === "date" && liveCards[0].name === "Launch date",
  `that card is the newest launch-date item (${want && want.id}) filed as Launch date`);
check(liveCards[0] && liveCards[0].text === want.text, "the visible card shows the newest item's text");

// 2. superseded items remain in the data and in the Flight Log, but not on the Road view
const hidden = [];
for (const f of live.feed_items || []) if (f && (f.kind === "launch_date" || f.box === "date") && f.id !== want.id && (Number.isInteger(f.flight) ? f.flight : live.flight) === live.flight) hidden.push(f.id);
const dateCat = live.categories.find((c) => c.id === "date");
(dateCat.history || []).forEach((h, hi) => { const id = `date-${hi}`; if (id !== want.id) hidden.push(id); });
check(hidden.length >= 1 && hidden.every((id) => !roadDateIds(live).includes(id)), `superseded Launch date items are hidden on the Road view (${hidden.join(", ")})`);
check(hidden.every((id) => stillInData(live, id)), "hidden items are still in road.json (nothing deleted)");
const flog = F.boxes(live, "10 Nov").date;
const histDays = (dateCat.history || []).map((h) => h.date).filter(Boolean);
const flogDays = ((flog.cards || [])[0] && flog.cards[0].lines || []).map((l) => l.day);
check(histDays.length && histDays.every((d) => flogDays.includes(d)), "Flight Log date box still lists every stored history day");
check(flog.latest === `No official Flight ${live.flight} date yet.`, "boxes() itself is unchanged (checkers still see the official-empty line)");

// 3. the rule is generic: a newer launch_date feed item becomes the only visible card
const syn = clone(live);
const newer = { id: "launch_date-test-newer", kind: "launch_date", title: "📅 Flight 15", body: "Flight 15 moved to a later NET (from the previous estimate)", at: "2026-12-01T12:00:00.000Z", date: "1 Dec", flight: 15 };
syn.feed_items = [newer, ...(syn.feed_items || [])];
const synCards = dateCards(syn);
check(synCards.length === 1 && synCards[0].id === newer.id && synCards[0].cat === "date" && synCards[0].text === newer.body,
  "a newer launch_date feed item becomes the only Launch date card");
check(!roadDateIds(syn).includes(want.id), "the previous current card is then hidden too");
check((syn.feed_items || []).some((f) => f.id === want.id) && stillInData(syn, hidden[0]), "older items remain in the cloned data");

// 4. if the newest item is removed, the previous one is shown (still newest-wins, no hard-coded date)
const dropped = clone(live);
dropped.feed_items = (dropped.feed_items || []).filter((f) => f.id !== want.id);
const next = expectedNewest(dropped);
const dropCards = dateCards(dropped);
check(next && dropCards.length === 1 && dropCards[0].id === next.id, `removing the newest card leaves the previous newest (${next && next.id})`);

// 5. helpers live only in app.js, and never hard-code a calendar date
check(/function currentLaunchDateId\(/.test(APP) && /function isRoadLaunchDatePost\(/.test(APP) && /keepDateId && r\.post\.id !== keepDateId/.test(APP),
  "rtfRows filters Launch date cards with currentLaunchDateId (display only)");
const helperSrc = APP.slice(APP.indexOf("// Display only (Road to Flight view): keep only the newest Launch date card"), APP.indexOf("function UpdatesFeed"));
check(helperSrc.length > 100 && !/\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(helperSrc) && !/\b20\d{2}-\d{2}-\d{2}\b/.test(helperSrc),
  "the Road-view filter never hard-codes a calendar date");
const checkers = fs.readdirSync(__dirname).filter((f) => /\.js$/.test(f) && !/^test-/.test(f)).filter((f) => /currentLaunchDateId|isRoadLaunchDatePost|asLaunchDatePost/.test(fs.readFileSync(path.join(__dirname, f), "utf8")));
check(!checkers.length, `no checker or script calls the display helpers (${checkers.join(", ") || "none"})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
