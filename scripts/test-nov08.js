/* 8 Nov quality review: a same-UK-date placeholder time upgrade is not
   "Launch delayed"; Ship 40 news is not Flight 15; feed headlines and card
   wording are full past-tense sentences; S42 pad history matches the Flight
   Log pins; a card-update push with an empty body uses the card line.
   Offline: node scripts/test-nov08.js */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const flights = require("./check-flights.js");
const SC = require("./scope.js");
const CR = require("./check-road.js");
const PS = require("./push-sync.js");
const RC = require("./render-check.js");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
let pass = 0, fail = 0;
const check = (ok, msg) => { console.log(`${ok ? "✅" : "❌"} ${msg}`); ok ? pass++ : fail++; };

// 1. live feed item retitled
const delayed = (live.feed_items || []).find((f) => f.id === "flight-mw6lawnq-3cabdd");
check(delayed && /New estimated time/.test(delayed.title) && delayed.body === "NET 13 Nov · 22:45 UK", `delay item retitled: "${delayed && delayed.title}" / "${delayed && delayed.body}"`);
check(delayed && !/Launch delayed/i.test(delayed.title), "delay item no longer says Launch delayed");

// 2. classifier: same-UK-date midnight/DAY → real window time is not a delay
const launch = (n, abbrev, net, precision) => ({ name: `Starship | Flight ${n}`, url: `https://ll2.test/${n}`, net, net_precision: { abbrev: precision }, status: { abbrev } });
async function classify(first, second, nowIso = "2026-11-07T16:00:00Z") {
  let ll2 = first, state = null; const sent = [];
  const deps = {
    fetchJson: async () => ({ results: [ll2] }),
    loadState: async () => (state ? JSON.parse(JSON.stringify(state)) : null),
    saveState: async (s) => { state = JSON.parse(JSON.stringify(s)); },
    push: async (n) => sent.push(n),
    readAppJs: () => "const FLIGHTS = [\n];\n",
    writeAppJs() {},
    commitAndPush() {},
    writeStory: async () => ({ headline: "x", story: "y" }),
    now: () => Date.parse(nowIso),
  };
  await flights.run(deps);
  sent.length = 0;
  ll2 = second;
  await flights.run(deps);
  return sent;
}

(async () => {
  const prevDay = launch(15, "TBD", "2026-11-13T00:00:00Z", "DAY");
  const nowMin = launch(15, "TBC", "2026-11-13T22:45:00Z", "MIN");
  let got = await classify(prevDay, nowMin);
  check(got.length === 1 && /New estimated time/.test(got[0].title) && got[0].body === "NET 13 Nov · 22:45 UK", `DAY midnight → MIN same UK date: "${got[0] && got[0].title}" / "${got[0] && got[0].body}"`);
  check(got[0] && !/Launch delayed/i.test(got[0].title), "same-date placeholder upgrade is not Launch delayed");
  check(flights.isPlaceholderTimeUpgrade(
    { date: "2026-11-13T00:00:00Z", precision: "DAY" },
    { date: "2026-11-13T22:45:00Z", precision: "MIN" }
  ) && flights.fmtNetTime("2026-11-13T22:45:00Z") === "NET 13 Nov · 22:45 UK", "helper: placeholder upgrade + NET 13 Nov · 22:45 UK");

  got = await classify(launch(15, "TBD", "2026-11-13T00:00:00Z", "DAY"), launch(15, "TBC", "2026-11-14T00:00:00Z", "DAY"));
  check(got.length === 1 && got[0].title === "🚧 Launch delayed", `later calendar date still delays: "${got[0] && got[0].title}" / "${got[0] && got[0].body}"`);

  got = await classify(launch(15, "TBC", "2026-11-13T22:45:00Z", "MIN"), launch(15, "TBC", "2026-11-14T02:00:00Z", "MIN"));
  check(got.length === 1 && got[0].title === "🚧 Launch delayed", `later UK date from a real time still delays: "${got[0] && got[0].title}"`);

  got = await classify(launch(16, "TBD", "2026-12-31T00:00:00Z", "Q4"), launch(16, "TBC", "2027-01-20T00:00:00Z", "DAY"), "2026-10-20T03:00:00Z");
  check(got.length === 1 && got[0].title === "🚧 Launch delayed", "a real later-date slip of the same flight still pushes Launch delayed");

  got = await classify(launch(15, "Go", "2026-11-13T00:00:00Z", "MIN"), launch(15, "TBC", "2026-11-13T01:00:00Z", "MIN"));
  check(got.length === 1 && got[0].title === "🚧 Launch delayed", `exact midnight slip is Launch delayed: "${got[0] && got[0].title}" / "${got[0] && got[0].body}"`);
  check(got[0] && !/New estimated time/i.test(got[0].title), "exact midnight slip is not New estimated time");
  check(!flights.isPlaceholderTimeUpgrade(
    { date: "2026-11-13T00:00:00Z", precision: "MIN" },
    { date: "2026-11-13T01:00:00Z", precision: "MIN" }
  ), "helper: a genuine exact midnight time is not a placeholder upgrade");
  check(!flights.isPlaceholderTimeUpgrade(
    { date: "2026-11-13T00:00:00Z" },
    { date: "2026-11-13T01:00:00Z", precision: "MIN" }
  ), "helper: unknown prior precision is not a placeholder upgrade");
  got = await classify(
    { name: "Starship | Flight 15", url: "https://ll2.test/15", net: "2026-11-13T00:00:00Z", status: { abbrev: "TBD" } },
    launch(15, "TBC", "2026-11-13T01:00:00Z", "MIN")
  );
  check(got.length === 1 && got[0].title === "🚧 Launch delayed", `unknown prior precision is treated as a delay: "${got[0] && got[0].title}"`);

  // 3. Ship 40 live items + tagging logic
  for (const id of ["news-mw7f2b2o-0823fc", "news-mw6jkips-73c35e", "news-mw6i0uuw-399d48"]) {
    const f = (live.feed_items || []).find((x) => x.id === id);
    check(f && /Ship 40/.test(f.body) && f.flight !== 15 && !f.box && f.later_flight && f.flight === 13, `Ship 40 ${id}: flight ${f && f.flight}, box ${f && f.box}, later_flight ${f && f.later_flight}`);
  }
  const sample = { flight: 15, vehicles: ["B22", "S42"], hardware_flights: { B22: 15, S42: 15, B23: 16, S43: 16 }, categories: live.categories, feed_items: [
    { id: "t-s40", kind: "news", flight: 15, box: "static", body: "Ship 40 was moved into the Gigabay starfactory bay." },
    { id: "t-s42", kind: "news", flight: 15, box: "static", body: "Ship 42 returned to Megabay 2 after its static fires." },
  ] };
  SC.enforce(sample);
  const s40 = sample.feed_items.find((x) => x.id === "t-s40");
  const s42 = sample.feed_items.find((x) => x.id === "t-s42");
  check(s40 && s40.flight === 13 && s40.later_flight && !s40.box, `enforce takes Ship 40 off Flight 15 (flight ${s40 && s40.flight}, box ${s40 && s40.box})`);
  check(s42 && s42.flight === 15 && s42.box === "static" && !s42.later_flight, "Ship 42 news stays on Flight 15");
  const tag = SC.feedFlight({ flight: 15, vehicles: ["B22", "S42"], hardware_flights: { B22: 15, S42: 15 }, categories: [] }, "Ship 40 appeared in Megabay 2 with raceway covers removed.");
  check(tag.flight === 13 && tag.other === true, `feedFlight(Ship 40) → Flight ${tag.flight}, other=${tag.other}`);
  const rd = { flight: 15, vehicles: ["B22", "S42"], hardware_flights: { B22: 15, S42: 15, B23: 16, S43: 16 }, categories: [], feed_items: [] };
  PS.addFeedItem(rd, { title: "🚀 Starship", body: "Ship 40 was lifted onto a transport stand inside Megabay 2.", at: "2026-11-07T14:28:35.000Z" });
  const added = rd.feed_items[0];
  check(added && added.flight === 13 && added.later_flight && added.flight !== 15, `addFeedItem does not default Ship 40 to Flight 15 (flight ${added && added.flight})`);
  PS.addFeedItem(rd, { title: "🚀 Starship", body: "Ship 42 completed a static fire at Massey's.", at: "2026-11-07T16:00:00Z" });
  const added42 = rd.feed_items.find((x) => /Ship 42/.test(x.body));
  check(added42 && added42.flight === 15 && !added42.later_flight, "addFeedItem still files Ship 42 on Flight 15");
  check(SC.enforce(JSON.parse(JSON.stringify(live))).length === 0, "live feed tags are idempotent under enforce");

  // 4. headline fragment
  const frag = (live.feed_items || []).find((f) => f.id === "news-mw72afio-c6e295");
  check(frag && frag.body === "Starbase was prepared for a Flight 15 double catch.", `headline: "${frag && frag.body}"`);

  // 5. S42 pad history + 7 Nov catch confirmation kept
  const pad = live.categories.find((c) => c.id === "pad");
  const sep12 = pad.history.find((h) => /2098798758335225974/.test(h.url || ""));
  const sep11 = pad.history.find((h) => /2098443279763464572/.test(h.url || ""));
  const line12 = "Ship 42 was lifted to catch height by the Pad 2 chopsticks.";
  const line11 = "Pad 2 chopsticks lifted Ship 42 without the stabiliser arms.";
  // 9 Nov re-date: the two history entries added on 8 Nov fell out of the 12-entry history window (x-first.js); the lines now come
  // from the Flight Log pins straight into the Road S42 pad drawer (app.js rtfCards), so check what the card shows.
  const s42pad = RC.view(JSON.parse(JSON.stringify(live))).cards.find((c) => c.id === "rtf-pad-S42");
  const row = (when, text) => !!s42pad && s42pad.rows.some((r) => r.when === when && r.text === text);
  check(row("12 Sep · 16:39", line12) || (sep12 && sep12.text === line12), "12 Sep catch-height lift is on the Road pad card");
  check(row("11 Sep · 17:07", line11) || (sep11 && sep11.text === line11), "11 Sep chopsticks lift is on the Road pad card");
  const nov7 = (live.feed_items || []).find((f) => f.at === "2026-11-07T16:11:14.000Z");
  check(nov7 && /confirmed for a catch attempt/.test(nov7.body), `7 Nov catch confirmation kept: "${nov7 && nov7.body}"`);

  // 6. wording
  const h3 = pad.history.find((h) => h.id === "x-2117466177400434911");
  const headed = "Booster 22 headed to preparation in Mega Bay 1.";
  check(h3 && h3.text === headed && h3.log_text === headed && h3.card_text === headed, `3 Nov pad wording: "${h3 && h3.text}"`);
  const deluge = "Pad 2 completed deluge and catch tests.";
  const h6 = pad.history.find((h) => h.id === "x-2118577080837574862");
  check(h6 && h6.text === deluge && h6.log_text === deluge && h6.card_text === deluge, `6 Nov pad entry: "${h6 && h6.text}" (pad.latest moves on with newer posts: "${pad.latest}")`);
  const date = live.categories.find((c) => c.id === "date");
  const dateLine = "Flight 15 is targeting NET 13 Nov, with the window opening at 22:45 UK, pending regulatory approval.";
  check(date.latest === dateLine && date.log_latest === dateLine, `date latest/log: "${date.latest}"`);
  check(/NET 13 Nov/.test(date.history[0].card_text) && !/NET 12 Nov/.test(date.history[0].card_text), `14 Oct card_text moved forward to 13 Nov: "${date.history[0].card_text}"`);
  const faa = live.categories.find((c) => c.id === "faa");
  check(faa.latest === "The 26 Sep licence covers Flight 14 only, with no Flight 15 change yet." && /[.]$/.test(faa.latest), `FAA latest: "${faa.latest}"`);
  check(faa.history[0].log_text === faa.history[0].card_text, "FAA history log_text and card_text match");

  // 7. empty push body → card line
  const n = CR.notificationFor({ flight: 15 }, {
    box: { id: "pad", icon: "🏗️", name: "Pad activity", status: "complete" },
    entry: { card_text: "Starbase tower completed a deluge system test.", text: "", push_text: "" },
    from: "progress", to: "complete",
  });
  check(n.title === "🏗️ Pad activity: Complete" && n.body === "Starbase tower completed a deluge system test.", `empty-body safeguard: "${n.title}" / "${n.body}"`);
  const n2 = CR.notificationFor({ flight: 15 }, {
    box: { id: "cryo", icon: "❄️", name: "Cryo tests", status: "progress" },
    entry: { text: "x", log_text: "log", push_text: "Frost on both tanks: Ship 42 likely in another cryo test.", card_text: "c", flight: 15 },
    from: "progress", to: "progress",
  });
  check(n2.body === "Frost on both tanks: Ship 42 likely in another cryo test.", "push_text still preferred when present");

  // 8. render-check: the two 8 Nov flags are gone
  const rc = RC.check(live);
  check(!rc.some((f) => /news-mw72afio/.test(JSON.stringify(f))), "render-check: headline fragment cleared");
  check(!rc.some((f) => f.type === "render-date" && /pad S42/.test(f.msg || "")), "render-check: pad S42 date mismatch cleared");
  const leftover = rc.filter((f) => /news-mw72afio|pad S42|Launch delayed|Ship 40/.test(JSON.stringify(f)));
  check(leftover.length === 0, leftover.length ? `render-check leftovers: ${leftover.map((f) => f.msg).join(" | ")}` : "render-check has no leftovers for this review");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
