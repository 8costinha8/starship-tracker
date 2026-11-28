#!/usr/bin/env node
/* Default-on review layer: every checker run applies review unless REVIEW=off
   (or opts.review === false). Sources append/dedupe, idempotence, and no extra
   push notifications. Isolated temp roads; never writes the repo road.json. */
"use strict";
const fs = require("fs");
const { execSync } = require("child_process");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const CR = require("./check-road.js");
const RS = require("./review-sources.js");
const RR = require("./review-rules.js");

const ROOT = path.join(__dirname, "..");
const fails = [];
function check(cond, msg) { if (!cond) { fails.push(msg); console.log("FAIL " + msg); } else console.log("ok   " + msg); }

const savedReview = process.env.REVIEW;
delete process.env.REVIEW;

const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "review-sources.json"), "utf8"));
check(Array.isArray(seed.sources) && seed.sources.filter((s) => s.kind === "x_post").length === 95, "seed has 95 verbatim X posts");
check(seed.sources.filter((s) => s.kind === "article").length === 10, "seed has 10 verbatim articles");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/f16-review/f16-sources.json"), "utf8"));
check(JSON.stringify(seed.sources) === JSON.stringify(fixture), "seed sources are byte-identical to the recorded fixture pack");

// --- kill switch (pure) ---
check(RS.reviewWanted({}) === true, "reviewWanted: default ON");
check(RS.reviewWanted({ review: true }) === true, "reviewWanted: opts.review true stays on");
check(RS.reviewWanted({ review: false }) === false, "reviewWanted: opts.review === false is the code kill switch");
check(RS.reviewWanted({}, { REVIEW: "off" }) === false, "reviewWanted: REVIEW=off");
check(RS.reviewWanted({}, { REVIEW: "OFF" }) === false, "reviewWanted: REVIEW=OFF");
check(RS.reviewWanted({}, { REVIEW: "0" }) === false, "reviewWanted: REVIEW=0");
check(RS.reviewWanted({}, { REVIEW: "false" }) === false, "reviewWanted: REVIEW=false");
check(RS.reviewWanted({ review: true }, { REVIEW: "off" }) === false, "reviewWanted: env REVIEW=off wins even if opts.review true");

// --- append / dedupe / prune ---
const seedPost = seed.sources.find((s) => s.kind === "x_post" && s.url);
const urlA = seedPost.url;
const pack0 = { sources: seed.sources.slice() };
const dup = RS.appendAndPrune(pack0, [{ id: "dup", kind: "x_post", url: urlA, text: "dup", published_utc: seedPost.published_utc, flight: 16 }], { road: live, nowIso: "2026-11-28T17:00:00.000Z" });
check(dup.added === 0 && dup.changed === false, "dedupe by URL: a recorded fixture post is not appended again (added=" + dup.added + ")");
const twUrl = urlA.replace("https://x.com/", "https://twitter.com/");
const twitterForm = RS.appendAndPrune(pack0, [{ id: "tw", kind: "x_post", url: twUrl, text: "dup", flight: 16 }], { road: live, nowIso: "2026-11-28T17:00:00.000Z" });
check(twitterForm.added === 0, "dedupe treats twitter.com and x.com as the same URL");
const freshUrl = "https://x.com/NASASpaceflight/status/2999999999999999999";
const add = RS.appendAndPrune(pack0, [{ id: "2999999999999999999", kind: "x_post", handle_or_outlet: "NASASpaceflight", url: freshUrl, text: "Ship 43 rolled back to Mega Bay 2.", published_utc: "2026-11-28T12:00:00.000Z", flight: 16, retrieved_at: "2026-11-28T17:00:00.000Z" }], { road: live, nowIso: "2026-11-28T17:00:00.000Z" });
check(add.added === 1 && add.store.sources.some((s) => s.url === freshUrl), "append: a new already-read trusted post is added once");
const again = RS.appendAndPrune(add.store, [{ id: "2999999999999999999", kind: "x_post", url: freshUrl, text: "Ship 43 rolled back to Mega Bay 2.", flight: 16 }], { road: live, nowIso: "2026-11-28T17:01:00.000Z" });
check(again.added === 0 && again.changed === false, "append is idempotent for the same URL");
const oldFlight = RS.appendAndPrune(pack0, [{ id: "old", kind: "x_post", url: "https://x.com/LabPadre/status/111", text: "Flight 12 leftover", published_utc: "2025-10-01T00:00:00.000Z", flight: 12 }], { road: live, nowIso: "2026-11-28T17:00:00.000Z" });
check(oldFlight.added === 0 && !oldFlight.store.sources.some((s) => s.flight === 12 || /status\/111\b/.test(s.url || "")), "prune by flight: a Flight 12 item is not kept when current flight is 16");

const incoming = RS.collectAlreadyRead(
  { posts: [{ post_id: "1", url: "https://x.com/StarshipGazer/status/1", text: "hi", created_at: "2026-11-20T00:00:00.000Z", author: { username: "StarshipGazer" } }] },
  [{ url: "https://www.nasaspaceflight.com/2026/11/example/", title: "NSF", text: "article", publishedAt: "2026-11-20", src: "NSF", tier: "trusted" }],
  { nowIso: "2026-11-28T17:00:00.000Z", flight: 16 }
);
check(incoming.length === 2 && incoming[0].kind === "x_post" && incoming[1].kind === "article", "collectAlreadyRead maps in-memory posts and articles (no fetch)");

// --- applyToRoad idempotence ---
function sha(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
const logs = [];
const r1 = RR.applyToRoad(structuredClone(live), { sources: seed.sources, log: (s) => logs.push(s) });
const j1 = JSON.stringify(r1.road.review);
const r2 = RR.applyToRoad(structuredClone(r1.road), { sources: seed.sources, log: () => {} });
const j2 = JSON.stringify(r2.road.review);
check(j1 === j2 && r1.road.review && r1.road.review.pills.length === 22, "applyToRoad is idempotent: two passes produce identical road.review (" + r1.road.review.pills.length + " pills)");
check(JSON.stringify(r1.road) === JSON.stringify(r2.road), "applyToRoad second pass is a no-op on the rest of the road as well");

// --- checker default-on / kill switch / notifications (isolated temp tree) ---
function unreviewedRoad() {
  // Kill-switch / default-on proofs start from the pre-review committed road, not the worktree
  // after a checker run has already written road.review.
  for (const rev of ["da54f54:road.json", "382b210:road.json"]) {
    try { return execSync("git show " + rev, { cwd: ROOT, encoding: "utf8", maxBuffer: 20e6 }); } catch {}
  }
  throw new Error("could not load unreviewed road.json from git");
}
function stageTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f16-review-default-"));
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });
  fs.writeFileSync(path.join(dir, "road.json"), unreviewedRoad());
  fs.copyFileSync(path.join(ROOT, "app.js"), path.join(dir, "app.js"));
  fs.copyFileSync(path.join(ROOT, "data", "review-sources.json"), path.join(dir, "data", "review-sources.json"));
  if (fs.existsSync(path.join(ROOT, "data", "vehicles.json"))) fs.copyFileSync(path.join(ROOT, "data", "vehicles.json"), path.join(dir, "data", "vehicles.json"));
  fs.writeFileSync(path.join(dir, "notifications.json"), JSON.stringify({ pushes: [] }) + "\n");
  return dir;
}

function hashRoad(obj) { return sha(JSON.stringify(obj, null, 2) + "\n"); }

async function runOnce(dir, extra = {}) {
  const pushCalls = [];
  const fcmCalls = [];
  const commitCalls = [];
  const fetchCalls = [];
  const opts = {
    mode: "preview",
    roadPath: path.join(dir, "road.json"),
    appJsPath: path.join(dir, "app.js"),
    notifLogPath: path.join(dir, "notifications.json"),
    reviewSourcesPath: path.join(dir, "data", "review-sources.json"),
    sources: [],
    xFirst: false,
    xToken: null,
    xFetch: async (url) => { fetchCalls.push(String(url)); throw new Error("test blocked X/API " + url); },
    selfCheck: false,
    pushGate: false,
    pushPolicy: false,
    cascade: false,
    mediaWatch: false,
    deps: {
      loadState: async () => ({ seen: [] }),
      saveState: async () => {},
      push: async (n) => { pushCalls.push(n); throw new Error("test blocked FCM push"); }
    },
    commit: (f, m) => { commitCalls.push({ f, m }); },
    now: () => Date.parse("2026-11-28T17:20:00.000Z"),
    ...extra
  };
  const res = await CR.run(opts);
  return { res, pushCalls, fcmCalls, commitCalls, fetchCalls, opts };
}

(async () => {
  try {
    const dirOn = stageTree();
    const a = await runOnce(dirOn);
    check(a.fetchCalls.length === 0, "default-on dry run makes zero X/API fetch calls (got " + a.fetchCalls.length + ")");
    check(a.res.road && a.res.road.review && a.res.road.review.generated === true, "default-on path writes road.review (no opts.review required)");
    check((a.res.road.review.pills || []).length === 22, "default-on review has 22 pills");
    check((a.res.notifications || []).length === 0, "default-on dry run notifications.length === 0 (got " + (a.res.notifications || []).length + ")");
    check((a.res.pushLog || []).length === 0, "default-on dry run pushLog.length === 0 (got " + (a.res.pushLog || []).length + ")");
    check((a.res.newsPushes || []).length === 0, "default-on dry run newsPushes.length === 0");
    check(a.pushCalls.length === 0, "FCM deps.push was not called");
    check(a.commitCalls.length === 0, "preview/test mode did not commit (got " + a.commitCalls.length + ")");
    const startRoad = JSON.parse(fs.readFileSync(path.join(dirOn, "road.json"), "utf8"));
    check(!startRoad.review, "temp copy of production road was not written by the preview run");

    // Consecutive runs: feed run 2 the output of run 1; would-be road.json must be byte-identical.
    const json1 = JSON.stringify(a.res.road, null, 2) + "\n";
    const hash1 = sha(json1);
    fs.writeFileSync(path.join(dirOn, "road.json"), json1);
    const b = await runOnce(dirOn);
    const json2 = JSON.stringify(b.res.road, null, 2) + "\n";
    const hash2 = sha(json2);
    fs.writeFileSync(path.join(dirOn, "road.json"), json2);
    const c = await runOnce(dirOn);
    const json3 = JSON.stringify(c.res.road, null, 2) + "\n";
    const hash3 = sha(json3);
    check(hash2 === hash3, "idempotence: two consecutive checker runs on the reviewed road produce byte-identical road.json (" + hash2.slice(0, 16) + "…)");
    check((b.res.notifications || []).length === 0 && (b.res.pushLog || []).length === 0 && b.pushCalls.length === 0, "second run also adds no push notifications and does not call FCM");
    check((c.res.notifications || []).length === 0 && c.pushCalls.length === 0 && c.fetchCalls.length === 0, "third run also adds no notifications and makes no X/API calls");

    // Kill switch: starts from a production road with no review, stays without review.
    const dirOff = stageTree();
    process.env.REVIEW = "off";
    const off = await runOnce(dirOff);
    delete process.env.REVIEW;
    check(!off.res.road.review, "REVIEW=off kill switch does not generate road.review");
    check((off.res.notifications || []).length === 0 && off.pushCalls.length === 0, "kill-switch run also adds no notifications");

    const dirOff2 = stageTree();
    const off2 = await runOnce(dirOff2, { review: false });
    check(!off2.res.road.review, "opts.review === false kill switch does not generate road.review");
  } catch (e) {
    check(false, "checker runs threw: " + (e && (e.stack || e.message) || e));
  } finally {
    if (savedReview === undefined) delete process.env.REVIEW;
    else process.env.REVIEW = savedReview;
    if (fails.length) { console.log("\n" + fails.length + " FAILED"); process.exit(1); }
    console.log("\n" + "all checks passed");
  }
})();
