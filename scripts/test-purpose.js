// Road updates are filed by PURPOSE, not place (scripts/purpose.js), and re-filing sends no push.
const fs = require("fs"), path = require("path"), os = require("os");
const P = require("./purpose.js"), C = require("./cleanup.js");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
const check = (ok, name) => { ok ? pass++ : fail++; console.log((ok ? "✅ " : "❌ ") + name); };
const live = () => JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const road = live();
// fixture states: B22 cryo done, static fire open (before 25 Oct); S42 cryo done, static open
const pre = JSON.parse(JSON.stringify(road));
const st = pre.categories.find((c) => c.id === "static");
st.history = st.history.filter((h) => !/completed/.test(h.text));
const box = (r, text, extra = {}) => P.purposeOf(r, { date: "25 Oct", text, ...extra }).box;

console.log("── static fire campaign window (B22 cryo done, static fire open) ──");
for (const t of ["Booster 22 rolls out to the pad for a static fire.", "Road closure notice for Booster 22 testing.", "Beach closure tomorrow for testing.",
  "Booster 22 is being lifted onto the launch mount at Pad 2.", "Booster 22 chill-down under way.", "Frost forming on Booster 22's LOX tank.",
  "Booster 22 propellant loading has begun.", "Booster 22 venting at Pad 2.", "Booster 22 fired!", "Booster 22 lifted onto transport stand ahead of rollout.",
  "Booster 22 is being lifted onto launch pad 2"]) check(box(pre, t, { box: "pad" }) === "static", `Static fires: "${t}"`);
check(box(road, "Booster 22 rolls back to Mega Bay 1 after its static fire.", { date: "27 Oct" }) === "static", "rollback after the static fire → Static fires");

console.log("── cryo ──");
for (const t of ["Ship 43 rolls out to Massey's.", "Booster 23 completed a cryo proof test.", "Frost on the test tank at Massey's.", "Booster 23 rolled back to the Mega Bay after cryo testing at Massey's."])
  check(box(pre, t, { box: "pad" }) === "cryo", `Cryo: "${t}"`);

console.log("── Raptors (even at the pad) ──");
for (const t of ["Raptor engines installed on Booster 22 at Pad 2.", "Ship 42 had its Raptor engines removed.", "Engine swap on Booster 22 at the pad."])
  check(box(pre, t, { box: "static" }) === "raptor", `Raptor engines: "${t}"`);

console.log("── launch / stacking (after static fires) ──");
const done = JSON.parse(JSON.stringify(road)); // B22 fired 25 Oct
const lb = P.launchBox(done);
check(lb === "pad", "no Launch/Stacking section exists → closest existing section is Pad activity (reported)");
check(box(done, "Booster 22 lifted onto the launch mount for launch.", { date: "3 Nov" }) === lb, "after the fire: lift onto the mount for launch → launch section");
check(box(done, "Ship 42 stacked onto Booster 22.", { date: "5 Nov" }) === lb && box(done, "Wet dress rehearsal for Flight 15.", { date: "6 Nov" }) === lb && box(done, "Launch closure posted for Flight 15.", { date: "7 Nov" }) === lb, "stacking, WDR, launch closure → launch section");

console.log("── pure pad work stays in Pad activity ──");
for (const t of ["Pad 1 flame trench wall work is progressing.", "Chopsticks tested at the tower top.", "QD arm swung at Pad 2.", "Deluge test at Pad 2.", "Tank farm work continues.", "OLM repairs under way at Pad 1."])
  check(box(pre, t, { box: "pad" }) === "pad", `Pad activity: "${t}"`);

console.log("── signals / confidence ──");
check(box(pre, "Activity at Starbase tonight.", { box: "static", confidence: 0.9 }) === "static", "no rule hit, confident model pick (≥ 0.7) kept");
check(P.purposeOf(pre, { text: "Booster 22 seen at the launch site.", box: "pad", confidence: 0.4 }).box === "static", "vehicle named, low confidence → campaign window default, never Pad activity");
check(P.purposeFor(pre, "Pad 2 tower crane removed.", "as Booster 22 static fire nears", { box: "pad" }).box === "pad", "the line decides; source words only help when the line has no signal");
check(/Current section states per vehicle: B22: cryo done[^;]*static fire done/.test(P.promptRules(road)) && /confidence/.test(P.promptRules(road)), "Grok prompt carries the current section states and the 0.7 confidence rule");
const cr = fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8"), xf = fs.readFileSync(path.join(__dirname, "x-first.js"), "utf8");
check(/purpose\.promptRules\(road\)/.test(cr) && /promptRules\(road\)/.test(xf) && /purposeFor\(road, line/.test(cr) && /purposeFor\(road, cls\.text/.test(xf), "both writers (Grok lines and X posts) use the purpose rule and prompt");

console.log("── re-file (live road.json, today's posts) ──");
const r2 = JSON.parse(JSON.stringify(road));
check(P.refile(r2).length === 0, "live road.json is already re-filed (re-file is idempotent)");
const where = (id) => (road.categories.find((c) => (c.history || []).some((h) => h.id === id)) || {}).id;
for (const id of ["x-2114016319679201462", "x-2113914954801889326", "x-2113907865060819060", "x-2113617185218429437", "x-2112967167767433728", "x-2112035558994419901", "x-2114335419785679308", "x-2114317866409595106", "x-2113955770337550391", "x-2111327584122437857"])
  check(where(id) === "static", `${id} is in Static fires (same id, deep link kept)`);
check(where("x-2113664154762457446") === "pad" && where("x-2112967167767433728-pad") === "pad", "Pad 1 flame trench and the split-off pad-only steps stay in Pad activity");
check(where("x-2113834862339617215") === "raptor", "lifting jig for engine testing stays in Raptor engines");
const feed = (road.feed_items || []).find((f) => /lifted onto launch pad 2/i.test(f.body)), prop = (road.feed_items || []).find((f) => /propellant loading/i.test(f.body));
check(feed && feed.box === "static" && prop && prop.box === "static", "generic 'Starship' cards (B22 lifted onto launch pad 2, propellant loading) → Static fires");
check(!road.categories.find((c) => c.id === "cryo").history.some((h) => /Booster 22/.test(h.text) && /2026-10-2/.test(h.at || "")), "the wrong B22 cryo card stays removed");
const ids = road.categories.flatMap((c) => (c.history || []).map((h) => h.id)).filter(Boolean);
check(new Set(ids).size === ids.length, "no entry duplicated by the re-file");

console.log("── Flight Log view + Road page ──");
const v = C.flightLogView(road.categories.find((c) => c.id === "static"), road).history;
check(v.length === 2 && v[0].complete && /two to three weeks/.test(v[1].log_text) && (v[0].updates || []).some((u) => /transport stand/.test(u.log_text || u.text)), "Flight Log Static fires: B22 completed with the re-filed steps, S42 earliest prediction");
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
check(/const own = f\.box && road\.categories\.find\(\(c\) => c\.id === f\.box\)/.test(app) && /cat: own \|\|/.test(app), "Road page: a purpose-filed news push shows as a card of its section, every post kept");
check(/ukStamp\(iso, false\) : fmtDay/.test(app) && !/ukStamp\(iso\) : fmtDay/.test(app), "Road page update cards: single date only, no clock time");

console.log("── re-file sends no push ──");
(async () => {
  const roadMod = require("./check-road.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "purpose-"));
  const rp = path.join(dir, "road.json");
  const old = JSON.parse(JSON.stringify(road));
  // undo the re-file: move today's static steps back to Pad activity
  const pad = old.categories.find((c) => c.id === "pad"), stc = old.categories.find((c) => c.id === "static");
  for (const id of ["x-2113907865060819060", "x-2114016319679201462"]) { const i = stc.history.findIndex((h) => h.id === id); pad.history.unshift(...stc.history.splice(i, 1)); }
  fs.writeFileSync(rp, JSON.stringify(old, null, 2));
  const pushes = [];
  let res;
  try {
    const appJsPath = path.join(dir, "app.js"); fs.copyFileSync(path.join(ROOT, "app.js"), appJsPath);
    let stored = { seen: [], news: { seen: [], pending: [], sent: [], count: 0, day: "2026-10-25" }, xFirst: { sinceId: "1", seen: [] } };
    res = await roadMod.run({ xFirst: true, xToken: "", mode: "dry-run", roadPath: rp, appJsPath, sources: [], next: null, askNews: async () => [], askDates: async () => [],
      deps: { loadState: async () => stored, saveState: async (x) => { stored = x; }, push: async (n) => pushes.push(n) }, commit: () => {} });
  } catch (e) { res = { error: e.message }; }
  const after = JSON.parse(fs.readFileSync(rp, "utf8"));
  const inStatic = (id) => after.categories.find((c) => c.id === "static").history.some((h) => h.id === id);
  check(inStatic("x-2113907865060819060") && inStatic("x-2114016319679201462"), `pipeline run re-files the moved-back entries to Static fires${res && res.error ? ` (run: ${res.error})` : ""}`);
  check(pushes.length === 0, "re-filing sends NO push");
  console.log(`\n${pass}/${pass + fail} checks passed`); process.exit(fail ? 1 : 0);
})();
