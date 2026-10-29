/* Offline tests for the predicted launch date (scripts/predicted.js + its use in check-road.js).
     node scripts/test-predicted.js        exit 1 if any check fails */
process.env.PUSH_SHADOW = process.env.PUSH_SHADOW || "0"; // live push-shadow.json must not turn this suite into shadow mode
const fs = require("fs");
const os = require("os");
const path = require("path");
const P = require("./predicted.js");
const roadMod = require("./check-road.js");

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "✅" : "❌"} ${msg}`); if (!ok) failed++; };
const NOW = Date.parse("2026-10-13T08:00:00Z");
const Q4 = { n: 15, status: "TBD", precision: "Q4", date: "2026-12-31T00:00:00Z" };
const base = (extra = {}) => ({ flight: 15, vehicles: ["B22", "S42"], categories: [], ...extra });
const MANUAL = { flight: 15, net: "2026-11-08", mode: "manual", basis: "FAA planning · NSF", sources: [{ name: "NSF", note: "FAA planning" }, { name: "Elon Musk", note: "4-6 weeks" }] };
const m = (source, date, seen_at, flight = 15) => ({ flight, source, url: `https://x.com/${source}/1`, date, seen_at });
const calc = (road, mentions, next = Q4, lastLogged = 14) => P.computePredicted({ road, target: next ? next.n : road.flight, next, lastLogged, mentions, now: NOW });

// prefilter + dates
check(P.prefilter({ title: "@NASASpaceflight on X", text: "Starship Flight 15 now NET November 8" }, 15, [], NOW), "prefilter: flight + NET + day passes");
check(!P.prefilter({ text: "Flight 15 hopefully in 4-6 weeks" }, 15, [], NOW), "undated comment ('4-6 weeks') fails the prefilter");
check(!P.prefilter({ text: "Flight 15 next month" }, 15, [], NOW), "'next month' fails the prefilter");
check(!P.prefilter({ text: "Flight 14 launched on 13 October" }, 15, [], NOW), "other flight number fails the prefilter");
check(P.prefilter({ text: "Ship 42 and B22 targeting launch on 8 Nov" }, 15, ["B22", "S42"], NOW), "vehicle names count as the flight");
check(JSON.stringify(P.datesIn("NET 8th November", NOW)) === '["2026-11-08"]', "datesIn: '8th November' → 2026-11-08");
const items = [{ src: "NSF", title: "x", text: "Flight 15 NET Nov 8", url: "u1", publishedAt: "2026-10-12T10:00:00Z" }, { src: "Elon Musk", title: "x", text: "Flight 15 in 4-6 weeks", url: "u2" }];
const ms = P.mentionsFromReply(items, [{ item: 1, date: "2026-11-08" }, { item: 2, date: "2026-11-15" }], 15, NOW);
check(ms.length === 1 && ms[0].source === "NSF", "LLM date not written in the post (hallucinated) is rejected");

// 1. two agreeing sources
let r = calc(base(), [m("NSF", "2026-11-08", "2026-10-12T10:00:00Z"), m("Elon Musk", "2026-11-08", "2026-10-12T12:00:00Z")]);
check(r.predicted && r.predicted.mode === "auto" && r.predicted.net === "2026-11-08" && r.predicted.sources.length === 2 && r.predicted.basis === "Elon Musk · NSF", `2 agreeing sources → auto predicted (${r.predicted && r.predicted.basis})`);
// 2. one source
r = calc(base(), [m("NSF", "2026-11-08", "2026-10-12T10:00:00Z")]);
check(!r.predicted && r.candidates.length === 1, "1 source → no predicted, mention kept as a candidate");
// same source twice doesn't count as two
r = calc(base(), [m("NSF", "2026-11-08", "2026-10-12T10:00:00Z"), m("NSF", "2026-11-08", "2026-10-12T11:00:00Z")]);
check(!r.predicted && r.candidates.length === 1, "same source twice is still 1 source");
// 3. undated comment → no mention at all (covered by prefilter) → nothing
r = calc(base(), []);
check(!r.predicted, "undated only → nothing");
// 4. date moving
let road = base(); road.predicted = calc(road, [m("NSF", "2026-11-08", "2026-10-11T10:00:00Z"), m("SpaceNews", "2026-11-08", "2026-10-11T11:00:00Z")]).predicted;
road.predicted_candidates = calc(base(), [m("NSF", "2026-11-08", "2026-10-11T10:00:00Z"), m("SpaceNews", "2026-11-08", "2026-10-11T11:00:00Z")]).candidates;
r = calc(road, [m("NSF", "2026-11-15", "2026-10-12T10:00:00Z")]);
check(!r.predicted && r.candidates.find((c) => c.source === "NSF").date === "2026-11-15", "one source moves its date → agreement lost → auto predicted cleared");
road = { ...road, predicted: r.predicted, predicted_candidates: r.candidates };
if (!road.predicted) delete road.predicted;
r = calc(road, [m("SpaceNews", "2026-11-15", "2026-10-12T12:00:00Z")]);
check(r.predicted && r.predicted.net === "2026-11-15", "second source follows → new date 2026-11-15");
r = calc(base(), [m("NSF", "2026-11-08", "2026-10-10T10:00:00Z"), m("FAA", "2026-11-08", "2026-10-10T11:00:00Z"), m("SpaceX", "2026-11-20", "2026-10-12T10:00:00Z"), m("CNBC", "2026-11-20", "2026-10-12T09:00:00Z")]);
check(r.predicted && r.predicted.net === "2026-11-20", "two agreed days → the one with the newest mention");
// 5. LL2 confirms
r = calc(base({ predicted: MANUAL }), [m("NSF", "2026-11-08", "2026-10-12T10:00:00Z"), m("FAA", "2026-11-08", "2026-10-12T11:00:00Z")], { n: 15, status: "TBC", precision: "DAY", date: "2026-11-08T00:00:00Z" });
check(!r.predicted, "LL2 day precision → predicted cleared (and not re-created)");
r = calc(base({ predicted: MANUAL }), [], { n: 15, status: "Go", precision: "MIN", date: "2026-11-08T23:30:00Z" });
check(!r.predicted, "LL2 Go → predicted cleared");
// 6. the flight launches
r = calc(base({ predicted: MANUAL }), [], { n: 15, status: "In Flight", precision: "SEC", date: "2026-11-08T23:30:00Z" });
check(!r.predicted, "LL2 In Flight → predicted cleared");
r = calc(base({ predicted: MANUAL }), [], null, 15);
check(!r.predicted, "flight logged in app.js → predicted cleared");
r = calc(base({ predicted: MANUAL, predicted_candidates: [m("NSF", "2026-11-08", "x")] }), [], { n: 16, status: "TBD", precision: "Q1", date: "2027-03-31T00:00:00Z" });
check(!r.predicted && r.candidates.length === 0, "next flight number changes → predicted + old candidates cleared");
// 7. manual entry
r = calc(base({ predicted: MANUAL }), [m("NSF", "2026-11-10", "2026-10-12T10:00:00Z")]);
check(r.predicted === null ? false : r.predicted.mode === "manual" && r.predicted.net === "2026-11-08", "manual entry kept when only 1 new dated source");
r = calc(base({ predicted: MANUAL }), [], null);
check(r.predicted && r.predicted.mode === "manual", "manual entry kept when LL2 info is unknown");
r = calc(base({ predicted: MANUAL }), [m("NSF", "2026-11-10", "2026-10-12T10:00:00Z"), m("SpaceX", "2026-11-10", "2026-10-12T11:00:00Z")]);
check(r.predicted && r.predicted.mode === "auto" && r.predicted.net === "2026-11-10", "manual entry replaced when 2 new sources agree");
P.validatePredicted({ predicted: MANUAL }); check(true, "manual entry validates");

// 8. end to end through check-road.js run(): Elon + NSF on X, no push, Road "Updated" untouched
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pred-test-"));
  const roadPath = path.join(tmp, "road.json"), appJsPath = path.join(tmp, "app.js");
  const start = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8"));
  start.predicted = MANUAL; delete start.predicted_candidates;
  fs.writeFileSync(roadPath, JSON.stringify(start, null, 2));
  fs.copyFileSync(path.join(__dirname, "..", "app.js"), appJsPath);
  const now = Date.now();
  const iso = (h) => new Date(now - h * 3600000).toISOString();
  const day = new Date(now + 20 * 86400000), dTxt = day.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }), dIso = day.toISOString().slice(0, 10);
  const xItems = [
    { key: "x:1", title: "@elonmusk on X", text: `Starship Flight 15 NET ${dTxt}`, url: "https://x.com/elonmusk/status/1", publishedAt: iso(1), src: "Elon Musk", source: "x:elonmusk", tier: "trusted", predictOnly: true },
    { key: "x:2", title: "@NASASpaceflight on X", text: `Flight 15 is now targeting ${dTxt} per FAA notices`, url: "https://x.com/NASASpaceflight/status/2", publishedAt: iso(2), src: "NSF", source: "x:NASASpaceflight", tier: "trusted" },
    { key: "x:3", title: "@elonmusk on X", text: "Flight 15 hopefully 4-6 weeks", url: "https://x.com/elonmusk/status/3", publishedAt: iso(1), src: "Elon Musk", source: "x:elonmusk", tier: "trusted", predictOnly: true },
  ];
  const roadPrompts = [], datePrompts = [], pushes = [], commits = [];
  const res = await roadMod.run({
    mode: "dry-run", roadPath, appJsPath, next: { n: 15, status: "TBD", precision: "Q4", date: "2026-12-31T00:00:00Z" },
    sources: [{ name: "fake X", fetch: async () => xItems }],
    deps: { loadState: async () => ({ seen: [] }), saveState: async () => {}, push: async (n) => pushes.push(n) },
    commit: (f, msg) => commits.push(msg),
    askClaude: async (prompt) => { roadPrompts.push(prompt); return []; },
    askDates: async (prompt) => { datePrompts.push(prompt); return [{ item: 1, date: dIso }, { item: 2, date: dIso }]; },
    mediaFor: async () => null,
  });
  const out = JSON.parse(fs.readFileSync(roadPath, "utf8"));
  check(datePrompts.length === 1 && !datePrompts[0].includes("hopefully"), "LLM called once, only on dated candidates (undated Elon post filtered out)");
  check(out.predicted && out.predicted.mode === "auto" && out.predicted.net === dIso && out.predicted.basis === "Elon Musk · NSF", `run(): auto predicted written (${out.predicted && out.predicted.basis} → ${out.predicted && out.predicted.net})`);
  check(out.predicted_candidates.length === 2, "run(): 2 candidates stored");
  check(pushes.length === 0 && res.notifications.length === 0, "no push for a prediction change");
  check(roadPrompts.every((p) => !p.includes("@elonmusk")), "Elon posts never reach the Road prompt");
  check(out.updatedAt === start.updatedAt && out.updated === start.updated, "Road card's Updated stamp unchanged");
  check(commits.length === 1 && /predicted date NET/.test(commits[0]), `one commit: ${commits[0]}`);
  check(roadMod.PREDICT_X_ACCOUNTS.elonmusk.id === "44196397", "Elon's X id hard-coded (no users/by lookup)");
  console.log(failed ? `\n❌ ${failed} check(s) failed.` : "\n✅ All checks passed. (Offline — nothing real was fetched, saved, committed or sent.)");
  process.exit(failed ? 1 : 0);
})();
