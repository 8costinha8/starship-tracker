/* Offline: push gate (hold / re-read / staleness / media-only / big news / corrections), shadow mode, watchdog
   source faults, media tier climb + SpaceX lock, and the 26–29 Oct replay. No network, no sends. */
const gate = require("./push-gate.js"), pp = require("./push-policy.js"), ps = require("./push-sync.js"), wd = require("./watchdog.js"), mc = require("./media-cascade.js");
const fs = require("fs"), os = require("os"), path = require("path");
let fail = 0; const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };
const V = ["B22", "S42"], H = 3600000;
const sent = (body, at, key) => ({ title: "x", body, at, sent_at: at, verdict: "sent", ...(key ? { key } : {}) });
(async () => {
  // B. staleness + recaps
  const hist = [sent("Booster 22 completed its static fire at the launch site.", "2026-10-25T11:45:42Z")];
  const recap = { title: "💥", body: "Booster 22 completes its static fire at Pad 2.", at: "2026-10-29T02:10:57Z", url: "https://x.com/NASASpaceflight/status/2115627415947059537", source_text: "Starship Update with Max Evans (@_MaxQ_)", has_media: true };
  let g = await gate.evaluate(recap, { history: hist, now: Date.parse("2026-10-29T02:32Z"), vehicles: V });
  ok(g.action === "drop" && /25 Oct/.test(g.reason), `recap of the 25 Oct B22 static fire → drop (${g.reason})`);
  ok(gate.staleCheck({ body: "Booster 22 completes its static fire.", at: "2026-10-29T02:10Z", source_text: "Starship Update with Max Evans" }, hist, { vehicles: V }).stale, "staleCheck (card step) also flags it → no card");
  ok(!gate.staleCheck({ body: "Booster 22 completes a second static fire.", at: "2026-10-29T02:10Z", source_text: "B22 fires again!" }, hist, { vehicles: V }).stale, "'second static fire' wording is a new event, not stale");
  // media-only
  g = await gate.evaluate({ ...recap, url: "https://x.com/SpaceX/status/9", source_text: "New views of Booster 22's static fire", body: "Booster 22 completed its static fire." }, { history: hist, now: Date.parse("2026-10-29T10Z"), vehicles: V });
  ok(g.action === "media_only", "new SpaceX footage of a known event → media-only (no push, no new card)");
  ok(gate.isRecap({ url: "https://www.youtube.com/watch?v=vKqb6w5FeEs", source_text: "Starbase Static Fire Galore - Is Flight Nearly Here? | Starship Update" }), "NSF YouTube 'Starship Update' is a recap");
  // A. hold, corroboration, re-read
  const st = { pending: [] }, t = Date.parse("2026-10-29T07:15Z");
  const s42 = { title: "🏗️ Pad activity · Flight 15", body: "Ship 42 heads to launch site after tests.", at: "2026-10-29T07:03:21Z", url: "https://x.com/RGVaerialphotos/status/2115701002095755563", source_text: "Ship 42 and the tiled barrel section have arrived back at the launch site." };
  g = await gate.evaluate(s42, { history: [], state: st, now: t, vehicles: V });
  ok(g.action === "hold" && st.pending.length === 1, "tracker post, no second source → held one run");
  g = await gate.evaluate(s42, { history: [], state: st, now: t + 15 * 60000, vehicles: V, refetch: async () => "Ship 42 and the tiled barrel section have arrived back at the production site." });
  ok(g.action === "send" && g.edited && /production site/.test(g.n.source_text) && g.big, "hold passed → source re-read, edit picked up, goes through (skips quiet)");
  ok(!st.pending.length, "released push leaves the pending list");
  const st2 = { pending: [] };
  g = await gate.evaluate({ ...s42, body: "Ship 42 rolls to the launch site." }, { history: [], state: st2, now: t, vehicles: V, seenPosts: [{ text: "Ship 42 rolling to the launch site now", created_at: "2026-10-29T07:00Z", url: "https://x.com/LabPadre/status/1" }] });
  ok(g.action === "send" && /second trusted/.test(g.reason), "second trusted account agrees → sends at once");
  g = await gate.evaluate({ ...s42, url: "https://x.com/SpaceX/status/5", body: "Ship 42 rolls to the launch site." }, { history: [], state: { pending: [] }, now: t, vehicles: V });
  ok(g.action === "send" && g.big, "SpaceX post → no hold, big news");
  g = await gate.evaluate({ ...s42, at: "2026-10-28T04:24:49Z", body: "Ship 43 has returned to the production site" }, { history: [], state: { pending: [] }, now: Date.parse("2026-10-28T13:36Z"), vehicles: V });
  ok(g.action === "send", "a post found late (after an outage) is not held again");
  // D. correction of a push already sent
  g = await gate.evaluate({ title: "🚀 Starship", body: "Ship 42 has arrived back at the production site.", at: "2026-10-29T07:04:29Z", url: "https://x.com/RGVaerialphotos/status/2115701286096277589" }, { history: [sent("Ship 42 heads to launch site after tests.", "2026-10-29T07:03:21Z")], state: { pending: [] }, now: t, vehicles: V });
  ok(g.action === "send" && g.correction && /^Correction/.test(g.n.title), "contradicts a sent push → Correction push");
  ok(pp.decide(g.n, [sent("Ship 42 heads to launch site after tests.", "2026-10-29T07:19Z")], { now: t, vehicles: V, big: true }).push, "correction skips the 24h quiet window (was suppressed as 'minor')");
  // C. big news
  ok(pp.decide({ body: "Ship 42 will be the first tower catch.", at: "2026-10-29T02:37Z" }, [sent("x", "2026-10-29T02:32Z")], { now: Date.parse("2026-10-29T02:45Z"), vehicles: V, big: true }).push, "Elon Flight 15 milestone post skips the quiet window");
  ok(!pp.decide({ body: "Ship 42 completes a static fire.", at: "2026-10-29T02:37Z" }, [sent("Ship 42 completes a static fire.", "2026-10-29T01:00Z")], { now: Date.parse("2026-10-29T02:45Z"), vehicles: V, big: true }).push, "big news still deduped against a sent push");
  ok(!pp.decide({ body: "Booster 22 completes a static fire.", at: "2026-10-29T02:37Z" }, [{ ...sent("Booster 22 completes a static fire.", "2026-10-29T01:00Z"), retracted: true }], { now: Date.parse("2026-10-29T02:45Z"), vehicles: V }).reason.startsWith("duplicate"), "a retracted (stale/wrong) row no longer dedupes");
  // shadow mode
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shadow-"));
  ok(!gate.shadowOn({ root: dir, env: {} }), "shadow off by default");
  fs.writeFileSync(path.join(dir, "push-shadow.json"), JSON.stringify({ until: new Date(Date.now() + 24 * H).toISOString() }));
  ok(gate.shadowOn({ root: dir, env: {} }), "push-shadow.json with a future 'until' → shadow on");
  fs.writeFileSync(path.join(dir, "push-shadow.json"), JSON.stringify({ until: new Date(Date.now() - H).toISOString() }));
  ok(!gate.shadowOn({ root: dir, env: {} }), "expired 'until' → shadow off again by itself");
  const road = { categories: [], feed_items: [] }; const fi = ps.addFeedItem(road, { title: "T", body: "Ship 42 completes a static fire.", at: "2026-10-29T10:00:00Z" });
  let calls = 0; const rows = [];
  const r = await ps.sendPush(fi, { road, send: async () => { calls++; }, save: true, logRows: rows, log: () => {}, now: () => Date.parse("2026-10-29T10:05Z"), shadow: true });
  ok(r.verdict === "shadow: would push" && calls === 0, "shadow mode: logged as would-push, sender never called");
  // sendPush wiring: hold, then release with an edit rewrite through the gate (card + push agree)
  const rd2 = { vehicles: V, categories: [{ id: "pad", history: [{ id: "x-7", text: "Ship 42 arrived back at the launch site.", log_text: "Ship 42 heads to launch site after tests.", push: { title: "🏗️ Pad", url: "https://x.com/RGVaerialphotos/status/7", at: "2026-10-29T07:03:21Z" } }] }] };
  const np = { title: "🏗️ Pad", body: "Ship 42 heads to launch site after tests.", url: "https://x.com/RGVaerialphotos/status/7", at: "2026-10-29T07:03:21Z", source_text: "arrived back at the launch site.", visible: { where: "road", box: "pad", id: "x-7" } };
  const gst = { pending: [] }; let sends = 0; const lr = [];
  const gt = { state: gst, refetch: async () => "arrived back at the production site.", rewrite: async (n) => { const h = rd2.categories[0].history[0]; h.log_text = "Ship 42 is back at the production site / Megabay 2."; return { ...n, body: h.log_text }; } };
  let rr = await ps.sendPush(np, { road: rd2, send: async () => { sends++; }, logRows: lr, log: () => {}, now: () => Date.parse("2026-10-29T07:15Z"), gate: gt, shadow: false });
  ok(rr.held && !sends && !lr.length && gst.pending.length === 1, "sendPush: held push is not sent or logged yet");
  rr = await ps.sendPush(np, { road: rd2, send: async () => { sends++; }, logRows: lr, log: () => {}, now: () => Date.parse("2026-10-29T07:31Z"), gate: gt, shadow: false });
  ok(rr.verdict === "sent" && sends === 1 && rr.body === "Ship 42 is back at the production site / Megabay 2.", "sendPush: next run re-reads the edited post, card and push both say production site");
  // D. watchdog source faults
  let s = {}; ok(wd.check(s, { terms: ["B22"], candidates: 5, xFailed: "X search HTTP 403" }).some((a) => /X read failed: HTTP 403/.test(a)), "X 403 → alarm on the first run");
  ok(wd.check({}, { terms: ["B22"], candidates: 5, xFailed: "X search HTTP 402" }).length === 1, "X 402 (credits) → alarm on the first run");
  s = {}; let a; for (let i = 0; i < wd.WATCHDOG_RUNS; i++) a = wd.check(s, { terms: ["B22"], candidates: 5, xFailed: "timeout" });
  ok(a.some((x) => /X-first failed for 4/.test(x)), "other X failures → alarm after 4 runs in a row");
  // tier climb + SpaceX lock (media cascade)
  const T0 = Date.parse("2026-10-27T21:45:25Z");
  const card = { id: "x-1", date: "27 Oct", at: new Date(T0).toISOString(), text: "Ship 42 completed a six-engine static fire test.", x_text: "Ship 42 completed a six-engine static fire test.", url: "https://x.com/RGVaerialphotos/status/1", src: "@RGVaerialphotos", x_post: { post_id: "1", author: { username: "RGVaerialphotos" } }, media_override: { post_id: "1", author: "RGVaerialphotos", image: "https://img/1.jpg", type: "photo" } };
  const rd = { categories: [{ id: "static", name: "Static fires", history: [card] }] };
  const post = (id, user, dt) => ({ post_id: String(id), url: `https://x.com/${user}/status/${id}`, created_at: new Date(T0 + dt * H).toISOString(), author: { username: user }, text: "Ship 42 conducts a six-engine static fire test.", media: [{ type: "video", video_url: `v${id}.mp4`, poster: `p${id}.jpg` }] });
  const opts = { now: T0 + 3 * H, frameFor: async (p) => ({ image: `images/${p.post_id}-frame.jpg`, lit: true, score: 0.9 }) };
  await mc.runCascade(rd, [post(2, "NASASpaceflight", 1)], opts);
  ok(card.media_override.author === "NASASpaceflight" && !card.media_locked && rd.categories[0].history.length === 1, "tier climb: NSF swaps the tracker image on the SAME card (no new card)");
  await mc.runCascade(rd, [post(3, "LabPadre", 1.5)], opts);
  ok(card.media_override.author === "NASASpaceflight", "one-way: a tracker never replaces NSF's media");
  await mc.runCascade(rd, [post(4, "SpaceX", 2)], opts);
  ok(card.media_override.author === "SpaceX" && card.media_locked && card.text_locked, "SpaceX's own post does the final swap and LOCKS the card");
  await mc.runCascade(rd, [post(5, "NASASpaceflight", 2.5), post(6, "SpaceX", 2.6)], opts);
  ok(card.media_override.post_id === "4", "after the lock: no more media changes (NSF or SpaceX)");
  // replay: all 4 cases + no correct push lost
  const { rows: rp, alarms } = await require("./replay-push.js").replay();
  const row = (re) => rp.find((x) => re.test(x.body));
  ok(alarms.length && /HTTP 402/.test(alarms[0].alarm) && alarms[0].at.startsWith("2026-10-28T09:30"), "case 1: outage → watchdog alarm at the first failed run (09:30), not silence");
  ok(/^PUSH/.test(row(/Ship 43 has returned/).verdict), "case 1: Ship 43 still pushes on the first healthy run");
  ok(/^PUSH/.test(row(/six-engine static fire and deorbit/).verdict), "case 2: S42 six-engine static fire pushes");
  ok(/backfill/.test(row(/Ship 42 completed both static fires/).verdict), "case 2: the NSF 23:59 log is silent as 'already on the card (backfill)', not a mystery duplicate");
  ok(/^no push, no card — stale/.test(row(/Booster 22 completes its static fire at Pad 2/).verdict), "case 3: the Max Evans recap → no push, no card");
  const s42r = row(/Ship 42 is back at the production site/);
  ok(s42r && /^PUSH/.test(s42r.verdict) && !rp.some((x) => /^PUSH/.test(x.verdict) && /launch site after/.test(x.body)), "case 4: the wrong 'launch site' push never goes; the edited 'production site' one does");
  ok(/media-only/.test(row(/\[synthetic\]|Booster 22 completed its static fire at Pad 2/).verdict), "media-only replay case: no push");
  const lost = rp.filter((x) => /^PUSH/.test(x.main || "") && !/^PUSH/.test(x.verdict) && !/stale/.test(x.verdict));
  ok(!lost.length, `no correct push lost vs main (${lost.map((x) => x.body).join(" | ") || "none"})`);
  console.log(fail ? `\n❌ ${fail} check(s) failed` : "\nAll push-gate checks passed."); process.exit(fail ? 1 : 0);
})();
