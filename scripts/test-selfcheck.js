/* Self-check (daily audit), backfill, self-healing and run health. No network, no pushes: node scripts/test-selfcheck.js */
const fs = require("fs"), os = require("os"), path = require("path");
const SC = require("./self-check.js"), H = require("./health.js"), { withRetry } = require("./retry.js"), G = require("./guards.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, ".."), road0 = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));
(async () => {
  // gate: once a UK day, first run at/after 06:00 London
  check(!SC.due({}, Date.parse("2026-10-31T05:59:00Z")) && SC.due({}, Date.parse("2026-10-31T06:00:00Z")), "due: not before 06:00 UK, due at 06:00 UK (GMT)");
  check(!SC.due({}, Date.parse("2026-07-01T04:30:00Z")) && SC.due({}, Date.parse("2026-07-01T05:00:00Z")), "due: 06:00 BST = 05:00 UTC in summer");
  const st = {}; SC.markDone(st, Date.parse("2026-10-31T06:10:00Z"), {}); check(!SC.due(st, Date.parse("2026-10-31T20:00:00Z")) && SC.due(st, Date.parse("2026-11-01T06:01:00Z")), "due: once per UK day");
  // day gaps (UK calendar days)
  check(SC.daysBetweenUK("2025-10-13T23:23:00Z", "2026-05-22T22:30:22Z") === 220, "F11→F12 = 220 days");
  check(SC.daysBetweenUK("2025-03-06T23:31:02Z", "2025-05-27T23:36:28Z") === 83, "F8→F9 = 83 days");
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const db = eval(`(() => { ${app.match(/const DAY = 86400000;/)[0]} ${app.match(/const ukDayN = [^\n]+/)[0]} ${app.match(/const daysBetween = [^\n]+/)[0]} return daysBetween; })()`);
  check(db("2025-10-13T23:23:00Z", "2026-05-22T22:30:22Z") === 220 && db("2025-03-06T23:31:02Z", "2025-05-27T23:36:28Z") === 83, "app.js daysBetween uses UK days (220 / 83)");
  check(/ukStamp\(f\.date, false, true\)/.test(app), "app.js flight log dates always carry the year (F14 28 Sep 2026)");
  check(/imgFallback\(mo\.image/.test(app) && /imgFallback\(mc\.image/.test(app) && /imgFallback\(m\.image/.test(app), "app.js: every card picture has an onerror fallback");
  const scrub = eval(`(() => { const doneToLabel = (s) => s; ${app.match(/const SRC_NAMES = [^\n]+/)[0]} ${app.match(/const scrub = [^\n]+/)[0]} return scrub; })()`);
  check(scrub("Catch both (Elon Musk, 22 Oct) .") === "Catch both (Elon Musk, 22 Oct).", "scrub: no space before a full stop");

  // the audit: dry run on a copy → fixes, zero pushes, zero milestones, media and links untouched
  const road = clone(road0), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sc-")); fs.mkdirSync(path.join(tmp, "images"));
  let judgeCalls = 0; const judge = async () => { judgeCalls++; return "unsure"; };
  const r = await SC.audit(road, { dryRun: true, root: tmp, log: () => {}, judge, now: Date.parse("2026-10-31T07:00:00Z") });
  check(r.pushes.length === 0 && r.milestones.length === 0, "dry run: zero pushes, zero milestones");
  check(JSON.stringify(road.milestones) === JSON.stringify(road0.milestones), "milestones unchanged");
  check(road.feed_items.length === road0.feed_items.length, "no feed item added or removed");
  check(!/push-sync|milestones\.js|addFeedItem|sendPush/.test(fs.readFileSync(path.join(__dirname, "self-check.js"), "utf8").replace(/\/\*[\s\S]*?\*\//, "")), "self-check.js cannot reach the push/milestone code");
  const prevById = new Map(road0.categories.flatMap((c) => c.history.filter((h) => h.id).map((h) => [h.id, h])));
  check(G.mediaDowngrades(clone(road), prevById).length === 0, "GUARD media-downgrade still passes");
  const mo = (x) => JSON.stringify(x.categories.map((c) => c.history.map((h) => h.media_override || null)));
  check(mo(road) === mo(road0), "no card picture changed (locks, keep_image, tier order)");
  const urls = (x) => new Set(JSON.stringify(x).match(/https:\/\/x\.com\/[^"]+/g)); const ua = urls(road);
  check([...urls(road0)].every((u) => ua.has(u)), "no source link dropped");
  check(judgeCalls <= SC.JUDGE_CAP && r.calls <= SC.JUDGE_CAP, `judge calls capped (${r.calls} ≤ ${SC.JUDGE_CAP})`);
  check(fs.readdirSync(path.join(tmp, "images")).length === 0, "dry run downloads nothing");
  const dc = road.categories.find((c) => c.id === "date");
  check(/NET 12 Nov/.test(dc.latest) && dc.status === "progress", "launch date: card follows the hero NET 12 Nov, pill no longer 'Not yet'");
  check(road.feed_items[0].src === "@efraser77", "first feed item gets its source badge");
  const b22 = road.categories.find((c) => c.id === "static").history.find((h) => h.id === "x-2114686191627030843");
  check(b22.updates.some((u) => /transporter/.test(u.text) && u.url.includes("2114612462184178003")), "B22 transporter move added to its card with its link");
  const rap = road.categories.find((c) => c.id === "raptor").history.find((h) => /reinstalled/.test(h.text));
  check(rap.superseded && /were reportedly being reinstalled; all 6 Raptors were installed by 26 Oct/.test(rap.card_text) && rap.text === "Ship 42's Raptor engines are reportedly being reinstalled.", "stale 'being reinstalled' superseded in card_text, text kept");
  check(r.flags.some((f) => /x-2114904512217694216/.test(f.msg)), "S42 static fire 27 vs 28 Oct flagged, not guessed");
  check(road.categories.find((c) => c.id === "pad").history.find((h) => h.id === "s42-pad2-sep").date === "12 Sep", "S42 pad lift shows 12 Sep");
  // judge cap with an always-answering judge on many clashes
  let n = 0; const many = clone(road0); for (let i = 0; i < 12; i++) many.categories[0].history.push({ id: `t${i}`, text: "Ship 42 completed a cryo test.", at: "2026-10-09T10:00:00Z", updates: [{ text: "Ship 42 likely in another cryo test.", at: "2026-10-09T18:00:00Z" }] });
  const rm = await SC.audit(many, { dryRun: true, root: tmp, log: () => {}, judge: async () => { n++; return "unsure"; } });
  check(n === SC.JUDGE_CAP && rm.calls === SC.JUDGE_CAP, "judge never called more than 5 times a run");
  // needs-review list
  const nr = path.join(tmp, "data", "needs-review.json"); SC.writeReview(r.flags, nr); const added2 = SC.writeReview(r.flags, nr);
  const q = JSON.parse(fs.readFileSync(nr, "utf8")); check(q.items.length === r.flags.length && added2 === 0 && q.items.every((x) => x.date && x.reason), "needs-review.json: date, item, values, sources, reason; no duplicates");
  // image fallback: broken local picture → allowed alternative; locked one never swapped
  const t2 = fs.mkdtempSync(path.join(os.tmpdir(), "sc2-")); fs.mkdirSync(path.join(t2, "images")); fs.writeFileSync(path.join(t2, "images", "empty.jpg"), "");
  const mini = { flight: 15, vehicles: ["S42"], categories: [{ id: "static", history: [
    { id: "a", text: "Ship 42 x.", media_override: { image: "images/empty.jpg", author: "LabPadre" }, photo_alternatives: [{ image: "https://pbs.twimg.com/media/ALT.jpg", author: "NASASpaceflight", post_url: "https://x.com/NASASpaceflight/status/1" }] },
    { id: "b", text: "Ship 42 y.", media_override: { image: "images/gone.jpg", author: "LabPadre", keep_image: true } }] }], feed_items: [] };
  await SC.audit(mini, { dryRun: true, root: t2, log: () => {} });
  check(mini.categories[0].history[0].media_override.image === "https://pbs.twimg.com/media/ALT.jpg", "0-byte picture → next allowed picture (same/higher tier)");
  check(mini.categories[0].history[1].media_override.image === "images/gone.jpg", "missing LOCKED picture is never swapped (flagged)");
  // retry
  let k = 0; const flaky = withRetry(async () => { k++; if (k < 3) throw new Error("ECONNRESET"); return { ok: true, status: 200 }; }, { wait: async () => {} });
  check((await flaky("u")).status === 200 && k === 3, "fetch retried twice, then succeeds");
  let k2 = 0; const dead = withRetry(async () => { k2++; throw new Error("down"); }, { wait: async () => {} });
  let threw = false; try { await dead("u"); } catch { threw = true; } check(threw && k2 === 3, "gives up after 2 retries");
  let k3 = 0; const nf = withRetry(async () => { k3++; return { ok: false, status: 404 }; }, { wait: async () => {} });
  check((await nf("u")).status === 404 && k3 === 1, "404 is not retried");
  // health
  let h = H.update(null, "check-road", { ok: true, now: 1 }); check(h.status === "ok" && !h.alert && h.consecutive_failures === 0, "health ok");
  h = H.update(h, "check-road", { ok: false, error: new Error("boom"), now: 2 }); check(h.consecutive_failures === 1 && !h.alert && h.last_error.error === "boom", "1 failure: no alert");
  h = H.update(h, "check-road", { ok: false, error: new Error("boom2"), now: 3 }); check(h.consecutive_failures === 2 && h.alert === true, "2 consecutive failures: alert true");
  h = H.update(h, "check-road", { ok: true, now: 4 }); check(h.consecutive_failures === 0 && !h.alert, "recovers on success");
  const t3 = fs.mkdtempSync(path.join(os.tmpdir(), "hl-")); let commits = 0;
  H.record("check-road", { ok: false, error: "x" }, { root: t3, commit: () => commits++, log: () => {} });
  check(fs.existsSync(path.join(t3, "data", "health.json")) && commits === 1, "health.json written (and committed) on failure");
  check(/health\.js"\)\.record\("check-road"/.test(fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8")) && /\.finally\(/.test(fs.readFileSync(path.join(__dirname, "check-flights.js"), "utf8")), "both checkers write health in finally");
  // backfill: invariants (no pushes, no milestones, no media change, no link lost, no reroute applied)
  const BF = require("./backfill-2026-10-31.js"), rb = clone(road0); const out = await BF.backfill(rb, { log: () => {}, root: tmp, dryRun: true });
  check(JSON.stringify(rb.milestones) === JSON.stringify(road0.milestones) && rb.feed_items.length === road0.feed_items.length, "backfill: zero milestones, zero feed items/pushes");
  const hw = (x) => x.categories.flatMap((c) => c.history.map((h) => `${c.id}|${h.id}|${h.flight}|${h.hardware}`)).sort().join("\n");
  check(hw(rb) === hw(road0) || road0.categories.every((c) => c.history.every((h) => rb.categories.find((d) => d.id === c.id).history.some((x) => x.id === h.id))), "backfill: no card rerouted (B23/S43/B24 stay off Flight 15, booster news stays off ship cards)");
  check(out.text.every((x) => x.after && x.before), "backfill: past-tense rows listed with before/after");
  // integration: the real checker run with the self-check forced → no push sent, no milestone created
  { const t4 = fs.mkdtempSync(path.join(os.tmpdir(), "scr-")), rp = path.join(t4, "road.json"), ap = path.join(t4, "app.js");
    fs.writeFileSync(rp, JSON.stringify(road0, null, 2)); fs.copyFileSync(path.join(ROOT, "app.js"), ap); fs.copyFileSync(path.join(ROOT, "road-media.json"), path.join(t4, "road-media.json"));
    const pushes = [], commits = [], logs = []; const ol = console.log; console.log = (...a) => logs.push(a.join(" "));
    let res; try { res = await require("./check-road.js").run({ mode: "dry-run", roadPath: rp, appJsPath: ap, selfCheckForce: true, sources: [], next: null,
      deps: { loadState: async () => ({ seen: [] }), saveState: async () => {}, push: async (n) => pushes.push(n) }, commit: (f, m) => commits.push(m),
      askClaude: async () => [], askDates: async () => [], mediaFor: async () => null, xToken: "", mediaWatch: { enabled: false }, bestFrame: { enabled: false } }); }
    catch (e) { logs.push("ERR " + e.message); } finally { console.log = ol; }
    const out = JSON.parse(fs.readFileSync(rp, "utf8"));
    check(logs.some((l) => /self-check: \d+ fix/.test(l)), "checker run: self-check ran (forced)");
    const pl = logs.filter((l) => /sent push|push sent|pushed to/i.test(l)); if (pl.length) ol(pl.join("\n")); check(pushes.length === 0 && pl.length === 0 && (!res || !(res.notifications || []).length), `checker run: zero pushes (${pushes.length})`);
    check(JSON.stringify(out.milestones) === JSON.stringify(road0.milestones), "checker run: zero milestones created");
    if (!logs.some((l) => /self-check: \d+ fix/.test(l))) ol(logs.slice(-15).join("\n")); }
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
})();
