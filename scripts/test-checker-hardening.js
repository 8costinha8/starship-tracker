// Batch 1 checker hardening: LL2 fetch (User-Agent, one retry layer, 429), Hold state, TBD gate, date debounce, FCM collapse keys. Offline.
process.env.PUSH_SHADOW = "0";
const flights = require("./check-flights.js"), collapse = require("./fcm-collapse.js"), { withRetry } = require("./retry.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✅ " + m); } else { fail++; console.log("  ❌ " + m); } };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const quiet = () => {};

(async () => {
  console.log("LL2 fetch:");
  let calls = [], seq;
  const fake = async (url, opts) => { calls.push({ url, opts }); return seq.shift() || res(200, { results: [] }); };
  seq = [res(429), res(429), res(429), res(429), res(429), res(429), res(429), res(429), res(429)];
  const wrapped = withRetry(fake, { wait: async () => {}, log: quiet });
  let err = null; await flights.makeFetchJson({ fetchFn: wrapped.__raw, sleep: async () => {}, log: quiet })("https://ll.test/x").catch((e) => (err = e));
  ok(err && err.status === 429 && calls.length === 1, `persistent 429 → ${calls.length} call (was 9: 3 tries × 3 wrapped attempts)`);
  // old behaviour for the record: wrapped fetch inside a 3-try loop
  calls = []; seq = Array(9).fill(0).map(() => res(429)); let old = 0;
  for (let i = 0; i < 3; i++) { const r = await wrapped("https://ll.test/x"); old++; }
  ok(calls.length === 9, "(for the record) the old stack really did 3 × 3 = 9 calls on a 429");
  calls = []; seq = [res(503), res(503), res(200, { results: [1] })];
  const j = await flights.makeFetchJson({ fetchFn: fake, sleep: async () => {}, log: quiet })("https://ll.test/y");
  ok(calls.length === 3 && j.results[0] === 1, "5xx twice then 200 → 3 calls, data returned");
  calls = []; seq = [res(503), res(503), res(503)]; err = null;
  await flights.makeFetchJson({ fetchFn: fake, sleep: async () => {}, log: quiet })("https://ll.test/z").catch((e) => (err = e));
  ok(err && calls.length === 3, "5xx three times → gives up after 3 calls (one layer)");
  calls = []; seq = [res(404)]; err = null;
  await flights.makeFetchJson({ fetchFn: fake, sleep: async () => {}, log: quiet })("https://ll.test/n").catch((e) => (err = e));
  ok(err && calls.length === 1, "404 → no retry");
  ok(calls[0].opts.headers["user-agent"] === flights.UA && /StarshipTracker\//.test(flights.UA), "every LL2 request carries the User-Agent");
  const g = globalThis.fetch; globalThis.fetch = withRetry(fake, { wait: async () => {}, log: quiet }); calls = []; seq = Array(9).fill(0).map(() => res(429)); err = null;
  await flights.makeFetchJson({ log: quiet })("https://ll.test/g").catch((e) => (err = e)); globalThis.fetch = g;
  ok(calls.length === 1, "with the global retry wrapper installed (as in CI) the checker bypasses it: still 1 call");

  console.log("\nHold, TBD, debounce:");
  let state = null; const sent = []; let ll2 = null, nowIso = "2026-12-01T12:00:00Z";
  const deps = { fetchJson: async () => ({ results: [ll2] }), loadState: async () => (state ? JSON.parse(JSON.stringify(state)) : null), saveState: async (s) => { state = JSON.parse(JSON.stringify(s)); }, push: async (n) => { sent.push(n); }, readAppJs: () => "", writeAppJs() {}, commitAndPush() {}, writeStory: async () => ({}), readRoad: () => ({ flight: 16, vehicles: ["B23", "S43"] }), flagReview() {}, now: () => Date.parse(nowIso) };
  const L = (abbrev, net, prec = "MIN") => ({ name: "Starship | Flight 16", url: "https://ll.test/16", net, net_precision: { abbrev: prec }, status: { abbrev } });
  const step = async (l, t) => { ll2 = l; if (t) nowIso = t; const b = sent.length; const log = console.log; console.log = quiet; try { await flights.run(deps); } finally { console.log = log; } return sent.slice(b); };
  await step(L("Go", "2026-12-10T01:00:00Z"));
  let got = await step(L("Hold", "2026-12-10T01:00:00Z"), "2026-12-01T12:15:00Z");
  ok(got.length === 1 && got[0].title === "⚠️ Flight update" && got[0].body === "Now: On hold", `Go → Hold with the same NET now pushes: "${got[0] && got[0].title} / ${got[0] && got[0].body}" (before: nothing)`);
  got = await step(L("Hold", "2026-12-10T01:00:00Z"), "2026-12-01T12:30:00Z"); ok(got.length === 0, "still on hold: no repeat");
  got = await step(L("Go", "2026-12-10T01:00:00Z"), "2026-12-01T12:45:00Z"); ok(got.length === 1 && got[0].title === "✅ Launch time confirmed", "Hold → Go: back on, one push");
  // TBD placeholder
  state = null; await step(L("TBC", "2026-12-20T00:00:00Z", "DAY"), "2026-12-01T13:00:00Z");
  got = await step(L("TBD", "2027-02-01T00:00:00Z", "DAY"), "2026-12-01T13:15:00Z");
  ok(!got.some((n) => /delayed|estimated date|time confirmed/i.test(n.title)), "TBD placeholder date (even at DAY precision) → no 'delayed' / 'estimate' push");
  got = await step(L("TBD", "2027-03-01T00:00:00Z", "DAY"), "2026-12-01T13:30:00Z");
  ok(got.length === 0, "…and a second TBD wiggle stays silent too");
  // debounce
  state = null; await step(L("TBC", "2026-12-20T00:00:00Z", "DAY"), "2026-12-02T10:00:00Z");
  got = await step(L("TBC", "2026-12-24T00:00:00Z", "DAY"), "2026-12-02T10:15:00Z"); ok(got.length === 0 && state.date === "2026-12-20T00:00:00Z" && state.pendingDate === "2026-12-24T00:00:00Z", "NET slip (not Go), first poll: no push, old date kept as baseline, pending recorded");
  got = await step(L("TBC", "2026-12-24T00:00:00Z", "DAY"), "2026-12-02T10:30:00Z"); ok(got.length === 1 && /delayed/i.test(got[0].title) && !state.pendingDate, "second poll with the same date: ONE 'Launch delayed' push");
  state = null; await step(L("TBC", "2026-12-20T00:00:00Z", "DAY"), "2026-12-02T10:00:00Z");
  await step(L("TBC", "2026-12-24T00:00:00Z", "DAY"), "2026-12-02T10:15:00Z"); got = await step(L("TBC", "2026-12-20T00:00:00Z", "DAY"), "2026-12-02T10:30:00Z");
  ok(got.length === 0 && state.date === "2026-12-20T00:00:00Z", "a wiggle that flips back never pushes");
  state = null; await step(L("TBC", "2026-12-20T00:00:00Z", "DAY"), "2026-12-02T10:00:00Z");
  got = await step(L("TBC", "2026-12-21T00:00:00Z", "DAY"), "2026-12-19T10:00:00Z"); ok(got.length === 1 && /delayed/i.test(got[0].title), "T-0 within 24 h: a slip pushes at once (no debounce)");
  state = null; await step(L("Go", "2026-12-20T00:00:00Z"), "2026-12-02T10:00:00Z");
  got = await step(L("Go", "2026-12-24T00:00:00Z"), "2026-12-02T10:15:00Z"); ok(got.length === 1 && /delayed/i.test(got[0].title), "Go + exact time: a slip pushes at once (trusted)");

  console.log("\nFCM collapse keys:");
  const road = require("./check-road.js");
  const m = road.fcmMessage(["t"], { title: "🚧 Launch delayed", body: "Flight 16 · Now 3 Dec 01:00", link: "https://x/y" });
  ok(m.android.collapseKey === "launch-date-f16" && m.apns.headers["apns-collapse-id"] === "launch-date-f16" && m.webpush.headers.Topic === "launch-date-f16" && m.webpush.notification.tag === "launch-date-f16", "date push carries Android collapseKey, APNs collapse id, Web Push Topic and notification tag");
  ok(m.webpush.fcmOptions.link === "https://x/y" && m.notification.title === "🚧 Launch delayed", "link / title / body untouched");
  ok(/^[A-Za-z0-9_-]{1,32}$/.test(m.webpush.headers.Topic), "Topic is valid for Web Push (≤32 chars, URL-safe)");
  for (const t of ["🚀 Liftoff!", "📡 Livestream ready", "🏁 Flight 16 — Success", "✅ Ship caught!", "Road to Flight 17", "🚀 Starship"]) {
    const x = road.fcmMessage(["t"], { title: t, body: "b" });
    ok(!x.android && !x.apns && !(x.webpush && x.webpush.headers), `no collapse key on "${t}" (must always arrive)`);
  }
  ok(collapse.keyFor({ title: "✅ Launch time confirmed", body: "Flight 16 · 3 Dec" }) === collapse.keyFor({ title: "🚧 Launch delayed", body: "Flight 16 · Now 4 Dec" }), "delayed and confirmed for one flight share a key (newest replaces older)");
  console.log(`\n${fail ? "❌" : "✅"} ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
