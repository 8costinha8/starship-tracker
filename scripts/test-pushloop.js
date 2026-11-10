/* 10 Nov push loop (Tusk): a held push that turned into a blocked Correction (LabPadre 2119904079321412037, "Booster 22 was
   brought out of Megabay 1.") stayed in state.pushGate.pending, so every 15-min run re-queued it, logged another
   "blocked: visible title differs" row and made an "Auto: push log" commit. Fix: a decided push (correction / stale, or one
   already in the push log) leaves the held list. Three check-road dry runs on a copy of live data: 0 sends, 0 re-logs.
   No network (fetch stubbed), no FCM, nothing committed: node scripts/test-pushloop.js */
const fs = require("fs"), os = require("os"), path = require("path");
const road = require("./check-road.js"), PG = require("./push-gate.js"), RC = require("./render-check.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, ".."), clone = (x) => JSON.parse(JSON.stringify(x));
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const liveLog = JSON.parse(fs.readFileSync(path.join(ROOT, "notifications.json"), "utf8"));
const URL = "https://x.com/LabPadre/status/2119904079321412037", BODY = "Booster 22 was brought out of Megabay 1.";
// the held push as check-road queued it (the feed item news-mw9rrxc8-6ac1cd)
const HELD = { title: "🚀 Starship", body: BODY, url: URL, at: "2026-11-09T21:24:53.000Z", kind: "news",
  link: "https://8costinha8.github.io/starship-tracker/?feed=1&item=news-mw9rrxc8-6ac1cd", visible: { where: "feed", id: "news-mw9rrxc8-6ac1cd" } };
const SENT_PAD2 = liveLog.pushes.find((r) => r.verdict === "sent" && r.body === "Booster 22 heads to Pad 2 for potential launch prep.");
const isLoop = (r) => r.url === URL && r.body === BODY;

(async () => {
  const realFetch = global.fetch, net = []; global.fetch = async (u) => { net.push(String(u)); throw new Error("network disabled in test"); };
  try {
    check(!!SENT_PAD2, "live push log has the sent 9 Nov 'Booster 22 heads to Pad 2…' push");
    // 1. push-gate: a correction decided this run leaves the held list
    { const st = { pending: [{ key: URL, first: "2026-11-09T21:30:00.000Z", n: HELD }] };
      const g = await PG.evaluate(clone(HELD), { history: [SENT_PAD2], state: st, now: Date.parse("2026-11-10T18:45:00Z"), vehicles: live.vehicles || [] });
      check(g.correction && /^Correction/.test(g.n.title), "evaluate: still read as a correction of the Pad 2 push");
      check(st.pending.length === 0, `evaluate: correction removed from the held list (${st.pending.length} left)`); }

    // 2. three check-road runs on a live copy, held entry in state (as in Firestore)
    const runs = async (label, logRows) => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pushloop-")), roadPath = path.join(tmp, "road.json"), appJsPath = path.join(tmp, "app.js");
      const r = clone(live); delete r.predicted_candidates; delete r.predicted;
      fs.writeFileSync(roadPath, JSON.stringify(r, null, 2) + "\n"); fs.copyFileSync(path.join(ROOT, "app.js"), appJsPath);
      fs.writeFileSync(path.join(tmp, "notifications.json"), JSON.stringify({ pushes: logRows }, null, 2) + "\n");
      let stored = { seen: [], news: { seen: [], pending: [], sent: [], count: 0, day: "2026-11-10" }, xFirst: { sinceId: "1", seen: [] },
        pushGate: { pending: [{ key: URL, first: "2026-11-09T21:30:00.000Z", n: clone(HELD) }], recent: [] } };
      const sent = [], commits = [], logs = [], perRun = [];
      const ol = console.log, ow = console.warn, oe = console.error; console.log = console.warn = console.error = (...a) => logs.push(a.join(" "));
      try { for (let i = 0; i < 3; i++) { const res = await road.run({ xFirst: true, xToken: "", mode: "dry-run", roadPath, appJsPath, sources: [], pushGate: true,
          next: { n: 15, status: "TBC", precision: "MIN", date: "2026-11-13T22:45:00Z" }, askNews: async () => [], askDates: async () => [], selfCheck: false,
          deps: { loadState: async () => clone(stored), saveState: async (s) => { stored = clone(s); }, push: async (n) => sent.push(n) }, commit: (f, m) => commits.push(m) });
        perRun.push((res.pushLog || []).filter(isLoop).length); } }
      finally { console.log = ol; console.warn = ow; console.error = oe; }
      const after = JSON.parse(fs.readFileSync(path.join(tmp, "notifications.json"), "utf8")).pushes;
      return { sent, commits, perRun, newRows: after.filter(isLoop).length - logRows.filter(isLoop).length, pending: (stored.pushGate || {}).pending || [] };
    };
    { const o = await runs("live log", clone(liveLog.pushes));
      console.log(`   live copy, 3 runs: re-logged per run ${JSON.stringify(o.perRun)}, commits ${JSON.stringify(o.commits)}`);
      check(o.sent.length === 0, `live copy ×3: 0 pushes sent (${o.sent.length})`);
      check(o.newRows === 0 && o.perRun.every((x) => x === 0), `live copy ×3: 0 new push-log rows for the correction (${o.newRows})`);
      check(!o.commits.some((m) => /push log/.test(m)), "live copy ×3: no 'Auto: push log' commit");
      check(!o.pending.some((x) => x.key === URL), "live copy ×3: correction no longer held"); }
    { const o = await runs("no prior log", clone(liveLog.pushes.filter((r) => !isLoop(r))));
      console.log(`   push log without the 90 blocked rows, 3 runs: rows per run ${JSON.stringify(o.perRun)}`);
      check(o.sent.length === 0, `first decision ×3: 0 pushes sent (${o.sent.length})`);
      check(JSON.stringify(o.perRun) === "[1,0,0]", "first decision ×3: logged once (blocked), then never again");
      check(!o.pending.some((x) => x.key === URL), "first decision ×3: correction no longer held"); }
    check(net.length === 0, `no network calls (${net.length})`);

    // 3. the 9 Nov 21:07 Booster 22 Pad row: past tense, source link kept, render-check clean for it
    { const h = live.categories.find((c) => c.id === "pad").history.find((x) => x.id === "x-2119899586005536831");
      check(h.card_text === "Booster 22 began moving ahead of a potential rollout to Pad 2.", `card line is a past-tense record: "${h.card_text}"`);
      check(!/launch prep/i.test(h.card_text), "no unsupported 'launch prep' claim on the card");
      check(h.url === "https://x.com/RGVaerialphotos/status/2119998556929192383" && h.push.url === "https://x.com/NASASpaceflight/status/2119899586005536831", "row source links kept");
      const rc = RC.check(live).filter((p) => /Booster 22/.test(p.msg) && /9 Nov/.test(p.msg) || /Megabay 1\./.test(p.msg));
      check(rc.length === 0, `render-check: no flag for the 9 Nov B22 Pad rows (${rc.map((p) => p.msg).join(" | ") || "none"})`); }
  } finally { global.fetch = realFetch; }
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
