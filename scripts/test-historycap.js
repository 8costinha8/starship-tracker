/* Road history cap (9 Nov, Tusk: NARROW capHistory). Rows behind agreed Flight Log lines (road.flightlog_pins url, refiled_pin,
   journey_pin) are never trimmed; only unprotected rows are cut, oldest first, to LIMITS.historyPerBox (12); newest first.
   No network, no pushes: node scripts/test-historycap.js */
const fs = require("fs"), os = require("os"), path = require("path");
const HC = require("./history-cap.js"), xf = require("./x-first.js"), road = require("./check-road.js"), RC = require("./render-check.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, ".."), clone = (x) => JSON.parse(JSON.stringify(x));
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const LIMIT = road.LIMITS.historyPerBox, pad = (r) => r.categories.find((c) => c.id === "pad");
const rowKey = (h) => h.id || h.url || `${h.at}|${h.text}`;
const atsNewestFirst = (list) => { const a = list.filter((h) => h.at).map((h) => Date.parse(h.at)); return a.every((t, i) => !i || a[i - 1] >= t); };

(async () => {
  check(LIMIT === 12, "LIMITS.historyPerBox stays 12");

  // fixture: live copy (no estimated-date push noise); pad gets one more protected row of each kind beside the live ones
  const base = clone(live); delete base.predicted_candidates; delete base.predicted;
  const p0 = pad(base), pins0 = HC.pinnedUrls(base);
  // oldest unprotected Launch pad rows (not a vehicle row, so a Launch pad pin line for it is a genuine Launch pad line)
  const free = HC.sortHistory(p0.history).filter((h) => !HC.isProtected(h, pins0) && h.url && !/^(?:B|S)\d+$/.test(h.hardware || "")).reverse();
  free[0].journey_pin = true;
  { const fp = base.flightlog_pins.boxes.pad.cards.find((k) => k.vehicle === "pad") || base.flightlog_pins.boxes.pad.cards[0];
    // a pin line for an existing row's own post (same day, time and text, so the Flight Log and the Road card agree)
    const h = free[1]; fp.lines.push({ day: h.date, time: "", text: h.log_text || h.text, at: h.at, url: h.url }); }
  const pinsB = HC.pinnedUrls(base), protB = p0.history.filter((h) => HC.isProtected(h, pinsB));
  check(protB.length >= 4 && protB.some((h) => h.refiled_pin) && protB.some((h) => h.journey_pin) && protB.some((h) => !h.refiled_pin && !h.journey_pin), `fixture: ${protB.length} protected pad rows (refiled_pin, journey_pin and pin-url kinds)`);

  const newest = (p, extra) => HC.sortHistory([...p.history.filter((h) => !HC.isProtected(h, HC.pinnedUrls(baseRef))), ...extra]).slice(0, LIMIT).map(rowKey);
  let baseRef = base;
  const verify = (label, r, before) => {
    const pins = HC.pinnedUrls(r), h = pad(r).history, keys = new Set(h.map(rowKey));
    const prot = before.filter((x) => HC.isProtected(x, pins)), unprot = h.filter((x) => !HC.isProtected(x, pins));
    check(prot.every((x) => keys.has(rowKey(x))), `${label}: every protected row kept (${prot.length})`);
    check(unprot.length === LIMIT, `${label}: exactly ${LIMIT} unprotected rows kept (${unprot.length})`);
    const all = HC.sortHistory([...before, ...h.filter((x) => !before.some((b) => rowKey(b) === rowKey(x)))]).filter((x) => !HC.isProtected(x, pins)).slice(0, LIMIT).map(rowKey);
    check(JSON.stringify(unprot.map(rowKey)) === JSON.stringify(all), `${label}: the kept unprotected rows are the ${LIMIT} newest`);
    check(atsNewestFirst(h), `${label}: box reads newest first`);
    const again = clone(pad(r)); HC.capHistory(again, LIMIT, r);
    check(JSON.stringify(again.history) === JSON.stringify(h), `${label}: capHistory again changes nothing (idempotent)`);
  };

  // path 1: x-first placePost(), 20 new pad posts (2.5 days apart, after every live row)
  { const r = clone(base), before = clone(pad(r).history), t0 = Date.parse("2026-11-10T12:00:00Z");
    for (let i = 0; i < 20; i++) {
      const id = String(9100000000000000000n + BigInt(i)), at = new Date(t0 + i * 60 * 3600000).toISOString();
      const post = { post_id: id, url: `https://x.com/NASASpaceflight/status/${id}`, created_at: at, text: `Pad 2 deluge system test ${i + 1} completed.`, author: { username: "NASASpaceflight", name: "NSF" }, media: [] };
      xf.placePost(r, post, { kind: "road", stage: "pad", hardware: "Pad 2", event: null, flight: 15, text: `Pad 2 completed deluge system test ${i + 1}.`, log_text: `Pad 2 completed deluge system test ${i + 1}.`, media_fit: "none", speculative: false }, Date.parse(at));
    }
    const added = pad(r).history.filter((h) => /deluge system test \d+/.test(h.text || "")).length;
    check(added >= LIMIT, `placePost: the new posts landed in Pad activity (${added} kept of 20)`);
    verify("placePost ×20", r, before);
    const rc = RC.check(r);
    check(rc.length === 0, `placePost ×20: render-check clean (${rc.map((p) => `[${p.type}] ${p.msg}`).join(" | ") || "no flags"})`);
  }

  // path 2: check-road applyUpdates(), 20 new pad lines
  { const r = clone(base), before = clone(pad(r).history), t0 = Date.parse("2026-11-10T12:00:00Z");
    for (let i = 0; i < 20; i++) {
      const at = new Date(t0 + i * 60 * 3600000).toISOString();
      const items = [{ key: `hc${i}`, title: `Pad 2 tower work ${i + 1}`, src: "NSF", source: "nsf", tier: "trusted", publishedAt: at, url: `https://www.nasaspaceflight.com/hc-${i}/` }];
      road.applyUpdates(r, items, [{ item: 1, box: "pad", line: `Pad 2 completed tower work step ${i + 1}.`, short: `Pad 2 tower work ${i + 1}`, status: null, supersedes: false }], () => {}, 5);
    }
    const added = pad(r).history.filter((h) => /tower work step \d+/.test(h.text || "")).length;
    check(added >= LIMIT, `applyUpdates: the new lines landed in Pad activity (${added} kept of 20)`);
    verify("applyUpdates ×20", r, before);
    const rc = RC.check(r);
    check(rc.length === 0, `applyUpdates ×20: render-check clean (${rc.map((p) => `[${p.type}] ${p.msg}`).join(" | ") || "no flags"})`);
  }

  // render-check stays clean when every box of the live data goes through capHistory
  { const r = clone(live); for (const c of r.categories) HC.capHistory(c, LIMIT, r);
    check(RC.check(r).length === 0 && JSON.stringify(r.feed_items) === JSON.stringify(live.feed_items), "live data through capHistory: render-check clean, feed unchanged"); }

  // clearing the pins (and their flags) brings back the plain 12 cap; pins for another flight protect nothing
  { const r = clone(base); delete r.flightlog_pins; const p = pad(r); for (const h of p.history) { delete h.refiled_pin; delete h.journey_pin; }
    for (let i = 0; i < 8; i++) p.history.push({ id: `old-${i}`, date: "1 Sep", at: `2026-09-01T0${i}:00:00Z`, text: `Old row ${i}.` });
    const want = HC.sortHistory(p.history).slice(0, LIMIT).map(rowKey); HC.capHistory(p, LIMIT, r);
    check(p.history.length === LIMIT && JSON.stringify(p.history.map(rowKey)) === JSON.stringify(want), "no pins: plain 12 cap, newest 12 kept");
    const r2 = clone(base); r2.flightlog_pins.flight = 16; for (const h of pad(r2).history) { delete h.refiled_pin; delete h.journey_pin; }
    for (let i = 0; i < 8; i++) pad(r2).history.push({ id: `old-${i}`, date: "1 Sep", at: `2026-09-01T0${i}:00:00Z`, text: `Old row ${i}.` });
    HC.capHistory(pad(r2), LIMIT, r2); check(pad(r2).history.length === LIMIT, "pins for another flight (after rollover) protect nothing"); }

  // code: both trim sites use capHistory; no bare slice(0, 12) / slice(0,12) on a history list anywhere
  { const src = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
    check(/require\("\.\/history-cap\.js"\)\.capHistory\(box, historyPerBox\(\), road/.test(src("x-first.js")) && /capHistory\(box, LIMITS\.historyPerBox, road\)/.test(src("check-road.js")), "x-first placePost() and check-road applyUpdates() both trim through capHistory");
    const bad = fs.readdirSync(__dirname).filter((f) => /\.js$/.test(f) && !/^test-/.test(f)).flatMap((f) => src(f).split("\n").map((l, i) => [f, i + 1, l]))
      .filter(([, , l]) => /history/i.test(l) && /\.slice\(0,\s*12\)/.test(l));
    check(!bad.length, `no bare slice(0, 12) on a history list (${bad.map(([f, n]) => `${f}:${n}`).join(", ") || "none"})`);
    check(!/\bfetch\(|sendPush|addFeedItem|notifications|writeFileSync/.test(src("history-cap.js")), "history-cap.js is pure data (no fetch, push, feed item, notification or file write)"); }

  // kept rows cause no push, feed item or notification: two check-road dry runs on a copy whose pad box holds > 12 rows
  { const r = clone(base); const p = pad(r);
    for (let i = 0; i < 6; i++) p.history.push({ id: `kept-${i}`, date: "2 Sep", at: `2026-09-02T0${i}:00:00Z`, text: `Kept row ${i}.`, journey_pin: true });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hcap-")), roadPath = path.join(tmp, "road.json"), appJsPath = path.join(tmp, "app.js");
    fs.writeFileSync(roadPath, JSON.stringify(r)); fs.copyFileSync(path.join(ROOT, "app.js"), appJsPath);
    const notifBefore = fs.readFileSync(path.join(ROOT, "notifications.json"), "utf8"), sent = [], commits = [], logs = [];
    let stored = { seen: [], news: { seen: [], pending: [], sent: [], count: 0, day: "2026-11-09" }, xFirst: { sinceId: "1", seen: [] } };
    const ol = console.log, ow = console.warn, oe = console.error; console.log = console.warn = console.error = (...a) => logs.push(a.join(" "));
    try { for (let i = 0; i < 2; i++) await road.run({ xFirst: true, xToken: "", mode: "dry-run", roadPath, appJsPath, sources: [], next: { n: 15, status: "TBC", precision: "MIN", date: "2026-11-13T22:45:00Z" },
      askNews: async () => [], askDates: async () => [], selfCheck: false,
      deps: { loadState: async () => stored, saveState: async (s) => { stored = s; }, push: async (n) => sent.push(n) }, commit: (f, m) => commits.push(m) }); }
    finally { console.log = ol; console.warn = ow; console.error = oe; }
    const out = JSON.parse(fs.readFileSync(roadPath, "utf8"));
    check(sent.length === 0 && !logs.some((m) => /→ push|ALARM|::error::/i.test(m)), `check-road dry run ×2 with kept rows: 0 pushes (${sent.length})`);
    check(JSON.stringify(out.feed_items) === JSON.stringify(r.feed_items), "no feed item added");
    check(fs.readFileSync(path.join(ROOT, "notifications.json"), "utf8") === notifBefore, "notifications.json untouched");
    check(pad(out).history.filter((h) => /^kept-/.test(h.id || "")).length === 6, "the kept rows are still there after the runs"); }

  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
