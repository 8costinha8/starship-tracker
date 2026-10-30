// Offline tests for the Flight Log lines (log_text): single date, the card prefers log_text, the style
process.env.PUSH_SHADOW = process.env.PUSH_SHADOW || "0"; // live push-shadow.json must not turn this suite into shadow mode
// lint, a new post producing a log line + matching push, and a section rolling up to Done.
//   node scripts/test-logtext.js        exit 1 if any check fails (no network, fake X + writer + Firebase)
const fs = require("fs"), os = require("os"), path = require("path");
const road = require("./check-road.js"), L = require("./log-text.js");
const ROOT = path.join(__dirname, "..");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const fn = (name) => { const i = app.indexOf(`function ${name}(`); return app.slice(i, app.indexOf("\n}\n", i) + 2); };
const A = new Function(`${app.slice(app.indexOf("const logLine ="), app.indexOf("function rollupStatus("))}${fn("rollupStatus")}; return { logLine, logDay, rollupStatus, logDone, logGlows };`)();
const cur = (c) => (c.history || []).filter((h) => h.kind !== "check" && !(h.flight > live.flight));

// 1. date only, single date
const days = live.categories.flatMap((c) => cur(c).flatMap((h) => [h, ...(h.updates || [])])).map(A.logDay);
check(days.length > 0 && days.every((d) => /^(\d{1,2}( [A-Z][a-z]{2})?–)?\d{1,2} [A-Z][a-z]{2}$/.test(d) && !/:|UK/.test(d)), `Flight Log dates are a day or a source day range, never a time (${days.length} lines)`);
check(A.logDay({ date: "9–10 Sep" }) === "9–10 Sep" && A.logDay({ date: "30 Sep–2 Oct" }) === "30 Sep–2 Oct" && A.logDay({ date: "9 Oct · 15:36 UK" }) === "9 Oct" && A.logDay({ at: "2026-10-09T14:36:44.000Z" }) === "9 Oct" && A.logDay({ date: "9 Oct", log_date: "8 Oct", at: "2026-10-09T14:36:44Z" }) === "8 Oct", "ranges kept, clock times stripped; no date → the post's UK day; log_date wins");
check(A.logDay({ date: "3–4 Sep" }) === L.logDay({ date: "3–4 Sep" }) && A.logDay({ at: "2026-10-23T23:30:00Z" }) === L.logDay({ at: "2026-10-23T23:30:00Z" }), "app and scripts agree on the day");
const cryo = live.categories.find((c) => c.id === "cryo"), e = (t) => cur(cryo).find((h) => (h.log_text || "").startsWith(t));
check(A.logDay(e("Booster 22")) === "10 Sep" && A.logDay(e("Ship 42")) === "9 Oct" && e("Ship 42").updates.some((u) => A.logDay(u) === "3–4 Sep" && /two back-to-back/.test(u.text)) && e("Booster 22").updates.length === 3, "Cryo: S42 9 Oct with its dated steps (3–4 Sep = two back-to-back tests); B22 10 Sep (its event record) with rollout, test and return");
check(/<span className="mini-date">\{logDay\(h\)\}<\/span>/.test(app) && /log \? <li key=\{i\} \{\.\.\.tapProps\(u\)\}><div className="bu-top"><span className="bu-date">\{logDay\(u\)\}/.test(app) && /post-date">\{(ONE_CARD\.includes\(cat\.id\) \? logDay\(h\) : )?(entryDate|cardDate)\(h\)\}/.test(app), "Flight Log uses the plain day; the Updates feed keeps its times");

// 2. the Flight Log prefers log_text and never shows raw post text
check(A.logLine({ log_text: "Clean.", x_text: "X text", text: "Text", x_post: { text: "RAW" } }) === "Clean." && A.logLine({ x_text: "X text", text: "Text" }) === "Text", "logLine: log_text first, then text (never x_text)");
const card = fn("RoadCard"), bu = fn("BuildUp");
check(!/x_text|x_post/.test(card) && /<p>\{scrub\(logLine\(h\)\)\}<\/p>/.test(card) && /<BuildUp h=\{h\} log onTap=\{onEntryTap \? \(u\) => onEntryTap\(m\.id, /.test(card) && /bu-text">\{scrub\(logLine\(u\)\)\}/.test(bu), "Road to Flight N card never reads x_text / x_post.text");
check(/if \(m\.log_latest && !later\) return m\.log_latest;/.test(fn("boxLatest")) && !/x_text/.test(fn("boxLatest").split("\n").filter((l) => !/const later/.test(l)).join("\n")), "box headline: log_latest, else the clean line");
check(cryo.log_latest === "Ship 42 completed its cryo tests at Massey's." && e("Ship 42").log_text === "Ship 42 completed further cryo tests." && e("Ship 42").updates.map((u) => u.log_text).join("|") === "Ship 42 completes its first cryo tests." && e("Booster 22").log_text === "Booster 22 completed its cryo test at Massey's.", "Cryo matches the target wording");

// glow: Flight Log only, on completed vehicle boxes, and the same rule as the dot
{ const rp = app.indexOf("// Road to Flight N page"), page = app.slice(rp, app.indexOf("\n}\n", app.indexOf("function", rp)));
  const glowLines = app.split("\n").filter((l) => /\.glow\b|" glow"|logGlows/.test(l) && !/^\s*\/\//.test(l) && !/data-id="raptor"/.test(l)); // the Raptor A2 halo override is styling, not a new glow rule
  check(/\.road \.mini\.glow \{[^}]*box-shadow: 0 0 12px -2px color-mix\(in srgb, var\(--c\)/.test(app) && rp > 0 && !/glow/i.test(page) && glowLines.length === 3 && /logGlows\(m, h, road\) \? " glow done"/.test(card), "soft glow in the section colour, Flight Log card only (Road page untouched)"); }
check(cur(cryo).filter((h) => A.logGlows(cryo, h, live)).map((h) => h.log_text).join("|") === "Ship 42 completed further cryo tests.|Booster 22 completed its first full cryo test." && A.rollupStatus(cryo, live) === "done", "Cryo: S42 and B22 boxes glow → the Cryo dot fills");
for (const c of live.categories) {
  const vs = live.vehicles, own = cur(c).filter((h) => A.logGlows({ id: c.id }, { ...h, milestone: { ...(h.milestone || {}), phase: "completed" } }, live)); // vehicle boxes in a roll-up section
  const latest = vs.map((v) => cur(c).find((h) => own.includes(h) && (h.milestone && h.milestone.hardware || h.hardware || "").toUpperCase().replace(/^SHIP ?/, "S").replace(/^BOOSTER ?/, "B") === v));
  const allGlow = latest.every((h) => h && A.logGlows(c, h, live));
  check((A.rollupStatus({ ...c, status: "progress" }, live) === "done") === (own.length > 0 && allGlow), `${c.id}: dot fills exactly when every vehicle's box glows`);
}
check(!A.logGlows(live.categories.find((c) => c.id === "pad"), { hardware: "B22", milestone: { phase: "completed" }, flight: 15 }, live) && !A.logGlows(cryo, { hardware: "B22", milestone: { phase: "progress" }, flight: 15 }, live), "no glow outside the vehicle test sections or on unfinished boxes");

// the wrong 9 Sep S42 line can't come back
const JS = JSON.stringify(live);
check(!/heads back to Massey's for further cryo testing/.test(JS.replace(JSON.stringify(live.rejected_lines), "")) && live.rejected_lines.some((r) => r.box === "cryo" && r.date === "9 Sep"), "the 9 Sep S42 line is gone and listed in rejected_lines");
{ const seed = { flight: 15, vehicles: ["B22", "S42"], rejected_lines: live.rejected_lines, categories: [{ id: "cryo", history: [
  { date: "9 Oct", text: "Ship 42 completed further cryo tests.", trust: "trusted", flight: 15, milestone: { key: "cryo_test|15|S42", type: "cryo_test", flight: 15, hardware: "S42", phase: "completed", migrated: true } },
  { date: "9 Sep", text: "Ship 42 heads back to Massey's for further cryo testing.", src: "NSF (secondary)", trust: "trusted", flight: 15, milestone: { key: "cryo_test|15|S42", type: "cryo_test", flight: 15, hardware: "S42", phase: "progress", migrated: true } },
  { date: "3–4 Sep", text: "Ship 42 completes its first cryo tests.", trust: "trusted", flight: 15, milestone: { key: "cryo_test|15|S42", type: "cryo_test", flight: 15, hardware: "S42", phase: "progress", migrated: true } }] }] };
  require("./migrate-lifecycle.js").migrate(seed);
  const u = seed.categories[0].history[0].updates || [];
  check(seed.categories[0].history.length === 1 && u.length === 1 && u[0].date === "3–4 Sep", "migration drops the rejected 9 Sep line instead of folding it in");
  const mix = { categories: [{ id: "cryo", history: [{ date: "9 Oct", text: "x", updates: [{ date: "9 Sep", text: "Some other wording of the same story." }, { date: "3–4 Sep", text: "y" }] }] }] };
  L.scrubRejected(mix);
  check(mix.categories[0].history[0].updates.map((x) => x.date).join() === "3–4 Sep" && L.isMonthMixup({ date: "9 Oct" }, { date: "9 Sep" }) && !L.isMonthMixup({ date: "9 Oct" }, { date: "9 Sep", url: "https://x.com/a/status/1" }), "an unsourced line dated the entry's day in another month is dropped on every save");
}

// 3. style lint on every log line
const all = live.categories.flatMap((c) => [c.log_latest, ...cur(c).flatMap((h) => [h.log_text, ...(h.updates || []).map((u) => u.log_text)])]);
const bad = all.map((s) => [s, L.lintLogText(s)]).filter(([, er]) => er.length);
check(all.every(Boolean) && !bad.length, `every current log line passes the style lint (${all.length} lines)${bad.length ? ": " + JSON.stringify(bad) : ""}`);
const BAD = ["Ship 42's completes its cryo test.", "Booster 22 is been tested.", "Ship 42 finished it's cryo test.", "Ship 42 has been transported to Massey's.", "Ship 42 completed completed cryo.", "Ship 42 rolled out at 15:36 UK.", "Ship 42 rolled out. Then it stopped.", "NSF says Ship 42 rolled out.", "Starlink satellites were released.", "ship 42 rolled out"];
check(BAD.every((s) => L.lintLogText(s).length > 0), "the lint catches 's completes, is been, it's, filler, doubled words, times, two sentences, source names, 'released', lower case");
check(L.cleanLogText("Ship 42 completed it's cryo test at Massey's") === "Ship 42 completed its cryo test at Massey's." && L.cleanLogText("NSF says Ship 42 rolled out") === null, "cleanLogText fixes small slips, refuses what it can't fix");

// 4 + 5. a new post → a log line; the section rolls up to Done when every vehicle completed
(async () => {
  const NOW = Date.parse("2026-10-24T18:00:00Z"), ago = (h) => new Date(NOW - h * 3600000).toISOString();
  const users = [["4", "SpaceX"]].map(([id, username]) => ({ id, username, name: username }));
  const P = (id, h, text) => ({ id, author_id: "4", created_at: ago(h), text, attachments: { media_keys: [id + "m"] } });
  const xReply = (posts, newest) => ({ ok: true, status: 200, json: async () => ({ data: posts, meta: { newest_id: newest }, includes: { users, media: posts.map((p) => ({ media_key: p.id + "m", type: "photo", url: `https://pbs.twimg.com/${p.id}.jpg` })) } }) });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lt-"));
  const roadPath = path.join(tmp, "road.json"), appJsPath = path.join(tmp, "app.js");
  fs.copyFileSync(path.join(ROOT, "road.json"), roadPath); fs.copyFileSync(path.join(ROOT, "app.js"), appJsPath);
  { // seed a fixed Static fires state (live road.json moves on every 15 min): B22 static fire in progress, S42 none yet
    const r0 = JSON.parse(fs.readFileSync(roadPath, "utf8")), sc = r0.categories.find((c) => c.id === "static");
    sc.status = "progress"; sc.latest = sc.log_latest = "Booster 22 is waiting to roll out for its static fire test.";
    sc.history = [{ id: "x-seed-b22-sf", date: "23 Oct", log_date: "23 Oct", at: ago(30), text: "Booster 22 waits to roll out for its static fire.", x_text: "Booster 22 waits to roll out for its static fire.", log_text: "Booster 22 is waiting to roll out for its static fire test.",
      url: "https://x.com/SpaceX/status/4999", src: "@SpaceX", trust: "trusted", x_first: true, stage: "static", hardware: "B22", tier: 1, x_posts: ["4999"], milestone: { key: "static_fire|15|B22", type: "static_fire", flight: 15, hardware: "B22", phase: "progress" } }];
    fs.writeFileSync(roadPath, JSON.stringify(r0, null, 2)); }
  let stored = { seen: [], news: { seen: [], pending: [], sent: [], count: 0, day: "2026-10-24" }, lastRun: ago(0.25), xFirst: { sinceId: "900", seen: [], pending: [] } };
  const events = [], prompts = [];
  const deps = { loadState: async () => JSON.parse(JSON.stringify(stored)), saveState: async (s) => { stored = JSON.parse(JSON.stringify(s)); },
    push: async (n) => { const onDisk = JSON.parse(fs.readFileSync(roadPath, "utf8")); events.push({ push: n, visible: JSON.stringify(onDisk).includes(JSON.stringify(n.body)) }); } };
  let xPage;
  const cls = {
    "5001": { kind: "road", stage: "static", hardware: "B22", event: "static_fire", phase: "completed", status: "done", flight: 15, text: "Booster 22 has finished it's static fire on Pad 2 at 15:36.", log_text: "Booster 22 completed its static fire at Pad 2." },
    "5002": { kind: "road", stage: "static", hardware: "S42", event: "static_fire", phase: "completed", status: "done", flight: 15, text: "Ship 42 static fire done at Massey's.", log_text: "Ship 42's completes its static fire at Massey's." } };
  const ask = async (prompt) => { prompts.push(prompt); return { entries: [...prompt.matchAll(/^(\d+)\. @\S+ \S+ \[[^\]]*\]: .*?#(\d+)/gm)].map((m) => ({ item: +m[1], kind: "skip", stage: null, hardware: null, text: null, log_text: null, reason: "x", ...cls[m[2]] })) }; };
  const base = { xFirst: true, mode: "dry-run", roadPath, appJsPath, deps, sources: [], commit: (f, m) => events.push({ commit: f }), now: () => NOW, next: null, xToken: "fake",
    askClaude: async () => [], askNews: async () => [], askDates: async () => [], askXFirst: ask, linkFetch: null, xFetch: async () => xPage };
  const st = () => JSON.parse(fs.readFileSync(roadPath, "utf8")).categories.find((c) => c.id === "static");

  xPage = xReply([P("5001", 3, "Booster 22 static fire complete on Pad 2 #5001")], "5001");
  await road.run(base);
  let s = st(), b22 = s.history.find((h) => h.milestone && h.milestone.hardware === "B22" && h.milestone.type === "static_fire");
  check(/log_text \(road only, else null\)/.test(prompts[0]) && /"completed" or "completes"/.test(prompts[0]) && /never "it's"/.test(prompts[0]) && require("./x-first.js").CLASSIFY_SCHEMA.properties.entries.items.required.includes("log_text"), "the Grok classify call asks for log_text in the Flight Log style");
  check(b22 && b22.log_text === "Booster 22 completed its static fire at Pad 2." && b22.log_date === "24 Oct" && b22.milestone.phase === "completed" && b22.complete === true, "new post → log_text + single day stored on the entry, milestone Completed");
  check(L.lintLogText(b22.log_text).length === 0 && b22.updates[0].log_text === "Booster 22 is waiting to roll out for its static fire test.", "the older line keeps its own log_text under Earlier updates");
  check(s.log_latest === require("./cleanup.js").shortLine(b22.log_text) && s.status === "progress" && A.rollupStatus(s, { ...live, vehicles: ["B22", "S42"] }) === "progress", "section latest refreshed; one of two vehicles done → still In progress");
  const p1 = events.find((x) => x.push);
  check(p1 && p1.push.body === b22.log_text && p1.visible && events.findIndex((x) => x.commit === "road.json") < events.indexOf(p1), "the push says the visible log line, sent only after road.json is committed");

  events.length = 0;
  xPage = xReply([P("5002", 1, "Ship 42 static fire complete #5002")], "5002");
  await road.run(base);
  s = st(); const s42 = s.history.find((h) => h.milestone && h.milestone.hardware === "S42");
  check(s42 && s42.log_text === "Ship 42 completes its static fire at Massey's." && L.lintLogText(s42.log_text).length === 0, "a writer slip (\"Ship 42's completes\") is fixed before it is stored");
  check(s.status === "done" && s.log_latest === require("./cleanup.js").shortLine(s42.log_text) && s.log_latest === "Ship 42 static fire done." && A.rollupStatus(s, live) === "done", "every Flight 15 vehicle completed → section Done (pill Done, filled dot)");
  const p2 = events.find((x) => x.push && /Static fires: (Done|Complete)/.test(x.push.title));
  check(p2 && p2.push.body === s42.log_text && p2.visible, "Done push wording = the visible log line");
  check(A.rollupStatus(cryo, live) === "done" && A.rollupStatus(live.categories.find((c) => c.id === "pad"), live) === live.categories.find((c) => c.id === "pad").status, "live Cryo rolls up to Done; pad work never rolls up");
  const reopened = JSON.parse(JSON.stringify(cryo)); reopened.history.unshift({ log_text: "Ship 42 heads back to Massey's.", flight: 15, trust: "trusted", milestone: { hardware: "S42", phase: "progress" } });
  check(A.rollupStatus({ ...reopened, status: "progress" }, live) === "progress", "a vehicle back for more testing → not Done");
  console.log(fails ? `\n❌ ${fails} failed` : "\n✅ All log-line checks passed.");
  process.exit(fails ? 1 : 0);
})();
