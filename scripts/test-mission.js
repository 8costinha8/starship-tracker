// Offline tests for the mission-update verdict (no network): road | mission-update | starship-news | skip.
const fs = require("fs"), os = require("os"), path = require("path");
const road = require("./check-road.js"), xf = require("./x-first.js"), mission = require("./mission.js");
const ROOT = path.join(__dirname, "..");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const NOW = Date.parse("2026-10-19T12:00:00Z"), ago = (h) => new Date(NOW - h * 3600000).toISOString();
const users = [{ id: "1", username: "NASASpaceflight", name: "NSF" }, { id: "2", username: "SpaceX", name: "SpaceX" }, { id: "3", username: "LabPadre", name: "LabPadre" }];
const P = (id, uid, h, text) => ({ id, author_id: uid, created_at: ago(h), text });
const page = (posts) => ({ ok: true, status: 200, json: async () => ({ data: posts, meta: { newest_id: posts.length ? posts[0].id : undefined }, includes: { users } }) });
const V = { // verdicts by the "#id" tag in the post text
  "m1": { kind: "mission-update", topic: "catch", text: "SpaceX plans to try catching both Booster 22 and Ship 42", attribution: "Musk confirmed" },
  "m2": { kind: "mission-update", topic: "net", text: "Flight 15 is targeting 8 November", attribution: "SpaceX" },
  "m3": { kind: "mission-update", topic: "catch", text: "SpaceX will try to catch Booster 22 only", attribution: "SpaceX" },
  "r1": { kind: "road", stage: "static", hardware: "B22", text: "Booster 22 rolled to Pad 2 for its static fire.", status: "progress" },
  "n1": { kind: "news", reason: "older wording" } };
const ask = async (prompt) => ({ entries: [...prompt.matchAll(/^(\d+)\. @\S+ \S+ \[[^\]]*\]: .*?#(\w+)/gm)].map((m) => ({ item: +m[1], kind: "skip", stage: null, hardware: null, text: null, status: null, event: null, topic: null, attribution: null, reason: "x", ...V[m[2]] })) });
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mis-"));
  const roadPath = path.join(tmp, "road.json"), appJsPath = path.join(tmp, "app.js");
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8")); delete live.mission_updates;
  fs.writeFileSync(roadPath, JSON.stringify(live)); fs.copyFileSync(path.join(ROOT, "app.js"), appJsPath);
  let stored = { seen: [], news: { seen: [], pending: [], sent: [], count: 0, day: "2026-10-19" }, xFirst: { sinceId: "100", seen: [] }, lastRun: ago(0.25) };
  const sent = [], datesAsked = [];
  let xPage;
  const base = { xFirst: true, mode: "dry-run", roadPath, appJsPath, sources: [], next: null, xToken: "fake", now: () => NOW, askXFirst: ask, askNews: async () => [],
    askDates: async (prompt) => { datesAsked.push(prompt); return []; }, xFetch: async () => xPage, linkFetch: null,
    deps: { loadState: async () => JSON.parse(JSON.stringify(stored)), saveState: async (s) => { stored = JSON.parse(JSON.stringify(s)); }, push: async (n) => sent.push(n) }, commit: () => {} };
  xPage = page([P("205", "1", 1, "Flight 15 targeting November 8 #m2"), P("204", "3", 2, "B22 rolls to Pad 2 #r1"), P("203", "1", 3, "Musk: catch both on Flight 15 #m1"), P("202", "1", 4, "Cadence plans #n1")]);
  const res = await road.run(base);
  const out = JSON.parse(fs.readFileSync(roadPath, "utf8"));
  const mu = out.mission_updates && out.mission_updates[15];
  check(mu && mu.length === 1 && mu[0].topic === "catch" && mu[0].line === "SpaceX plans to try catching both Booster 22 and Ship 42 (Musk confirmed, 19 Oct).", "mission-update → a line on Flight 15's mission_updates, written as 'fact (who, UK day).'");
  check(!out.categories.some((c) => c.history.some((h) => ["x-203", "x-205"].includes(h.id))), "mission updates never create Road cards");
  check(out.categories.find((c) => c.id === "static").history.some((h) => h.id === "x-204" || (h.x_posts || []).includes("204")), "road verdicts (hardware/tests) still reach the Road (new card, or a new line on that vehicle's card)");
  const mp = res.notifications.filter((n) => n.title === "Flight 15 update");
  check(mp.length === 1 && mp[0].body === mu[0].line && mp[0].link === "https://8costinha8.github.io/starship-tracker/?flight=15", "push: 'Flight 15 update', body = the line, deep link ?flight=15");
  check(!mu.some((u) => u.topic === "net") && datesAsked.some((p) => /November 8/.test(p)), "a NET mission-update is not a line: it goes to the predicted-date check (which owns the date display)");
  check(!res.notifications.some((n) => /November 8/.test(n.body || "")), "…and sends no push of its own");
  // same topic again: identical → nothing; newer different → replaces (newest wins), one push
  xPage = page([P("206", "1", 0.5, "again #m1")]);
  const r2 = await road.run(base);
  check(r2.notifications.length === 0 && JSON.parse(fs.readFileSync(roadPath, "utf8")).mission_updates[15].length === 1, "the same line again: no change, no push (dedup)");
  xPage = page([P("207", "2", 0.2, "update #m3")]);
  const r3 = await road.run(base);
  const mu3 = JSON.parse(fs.readFileSync(roadPath, "utf8")).mission_updates[15];
  check(mu3.length === 1 && /Booster 22 only \(SpaceX, 19 Oct\)\.$/.test(mu3[0].line) && r3.notifications.filter((n) => n.title === "Flight 15 update").length === 1, "a newer post on the same topic replaces the line (newest wins), one push");
  // cap: missions + cards share the per-run cap
  const st = { xFirst: { sinceId: "1", seen: [], pending: [] } };
  const many = page(Array.from({ length: 7 }, (_, i) => P(String(300 + i), "1", 1, `x #m1`)));
  const rr = { flight: 15, vehicles: ["B22", "S42"], categories: road.freshRoad(15).categories };
  const got = await xf.runXFirst(rr, st, { token: "t", fetchFn: async () => many, ask, postCard: road.xPostCard, log: () => {}, maxCards: 5 });
  check(got.missions.length === 5 && got.state.pending.length === 2, "mission updates share the per-run cap (the rest wait)");
  // validation
  let threw = false; try { mission.validateMission({ mission_updates: { 15: [{ topic: "catch", line: "a", at: ago(1) }, { topic: "catch", line: "b", at: ago(2) }] } }); } catch { threw = true; }
  check(threw, "validation: one line per topic");
  // app: the line sits right after the mission note on the Next flight card only
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const body = (n) => { const a = app.indexOf(`function ${n}(`); return app.slice(a, app.indexOf("\nfunction ", a + 10)); };
  const nf = body("NextFlightCard");
  check(nf.indexOf('className="next-note"') < nf.indexOf("missionLines(road, f.n)") && nf.indexOf("missionLines(road, f.n)") < nf.indexOf("showWatch &&"), "Next flight card: the line(s) sit right under the mission description");
  check(!/missionLines/.test(body("FlightCard")) && !/missionLines/.test(body("FeedPost")) && !/<a |<img/.test(nf.slice(nf.indexOf("missionLines"), nf.indexOf("showWatch &&"))), "text only; no other card renders it");
  const repo = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
  check(repo.mission_updates[15].some((u) => u.topic === "catch" && /catch/i.test(u.line) && /^https:\/\/x\.com\//.test(u.url)) && mission.validateMission(repo) === undefined, "repo: Flight 15's catch-plan line");
  console.log(fails ? `\n${fails} FAILED` : "\n✅ All mission-update checks passed."); process.exit(fails ? 1 : 0);
})();
