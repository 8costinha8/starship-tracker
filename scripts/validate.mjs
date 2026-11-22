#!/usr/bin/env node
/* Starship Tracker — read-only invariant validator (Tusk pipeline review, 21 Nov 2026).
   Reads the LIVE site (GitHub Pages) over plain GET. Never writes anywhere, never touches Firebase, never sends a push.
   Usage:  node validate.mjs [--base URL | --dir /workspace/tusk/sandbox/app] [--repo PATH_TO_READONLY_CLONE] [--json out.json] [--no-images] [--ll2]
   --repo enables the "app model" checks (Page 2 cards / Page 1 boxes computed by app.js's own functions via
   scripts/render-check.js from the clone; the clone is only read). --ll2 makes ONE Launch Library call for a date cross-check.
   Exit code: 0 = no ERROR, 1 = at least one ERROR. */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = (opt("--base") || "https://8costinha8.github.io/starship-tracker/").replace(/\/?$/, "/");
const REPO = opt("--repo");
const OUT = opt("--json");
const DIR = opt("--dir"); // read a local copy instead (e.g. /workspace/tusk/sandbox/app)
const NO_IMAGES = args.includes("--no-images");
const DO_LL2 = args.includes("--ll2") && !OFFLINE;
const OFFLINE = args.includes("--offline"); // gate mode: no network at all
const RATCHET = opt("--ratchet"); // baseline dir: only ERRORs that are NEW compared with it fail the run
const NOW = opt("--now") ? Date.parse(opt("--now")) : Date.now();
const H = 3600e3, D = 24 * H;

const findings = [];
const add = (sev, id, msg, evidence = null) => findings.push({ sev, id, msg, evidence });
const ERR = (...a) => add("ERROR", ...a), WARN = (...a) => add("WARN", ...a), INFO = (...a) => add("INFO", ...a);

async function get(p, kind = "json") {
  if (DIR && !/^https?:/.test(p)) { const f = path.join(DIR, p.split("?")[0]); if (!fs.existsSync(f)) throw new Error(`${p}: missing in ${DIR}`); const b = fs.readFileSync(f); return kind === "json" ? JSON.parse(b) : kind === "text" ? b.toString("utf8") : b; }
  const r = await fetch(new URL(p, BASE).href + (p.includes("?") ? "&" : "?") + "cb=" + NOW, { cache: "no-store", headers: { "user-agent": "tusk-validator/1.0 (read-only)" } });
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return kind === "json" ? r.json() : kind === "text" ? r.text() : Buffer.from(await r.arrayBuffer());
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ukDay = (iso) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", timeZone: "Europe/London" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${Number(p.day)} ${MON[p.month - 1]}`; };
const short = (s, n = 90) => String(s || "").replace(/\s+/g, " ").slice(0, n);
const hwKey = (s) => String(s || "").toUpperCase().replace(/^SHIP\s*/, "S").replace(/^BOOSTER\s*/, "B").replace(/\s+/g, "");
const VEH_IN_TEXT = /\b(?:Booster|Ship|B|S)\s?(\d{2,3})\b/g;
function vehiclesIn(text) { const out = new Set(); for (const m of String(text || "").matchAll(/\b(Booster|Ship)\s?(\d{2,3})\b|\b([BS])(\d{2,3})\b/g)) out.add((m[1] ? (m[1] === "Booster" ? "B" : "S") + m[2] : m[3] + m[4])); return [...out]; }

// Box keyword rules (wrong-box classifier check). A line filed in a box should talk about that box's subject.
const BOX_RX = {
  cryo: /\bcryo|proof|frost|massey|test stand|ambient|pressur/i,
  raptor: /\braptor|engine/i,
  static: /\bstatic[- ]?fire|\bfired?\b|\bfiring|spin prime|\bhot fire|engine test/i,
  pad: /\bpad\b|\btower|chopstick|mount|stack|OLM|rolled? (?:out|to)|rollout|launch site|QD|quick disconnect|wet dress|WDR|pusher/i,
  faa: /\bFAA|licen[cs]e|mishap|environmental|airspace|NOTAM|marine/i,
  date: /\bNET\b|\bdate|window|launch(?:es|ed|ing)? (?:on|in|no earlier)|target|\bT-?\d|\bslip|delay|countdown/i,
};
const SPECULATIVE = /\b(may|might|could|reportedly|rumou?r|expected to|plans? to|aims? to|hopes? to|possibly|likely)\b/i;
const RECAP_PAST_FLIGHT = (text, n) => { const ms = [...String(text).matchAll(/\bFlight (\d+)\b/g)].map((m) => Number(m[1])); return ms.length && ms.every((x) => x < n) ? ms : null; };
const VEH_CREDIT = /^@?(?:Booster|Ship)\s?\d+$|^@?[BS]\d{2,3}$/i;

async function runBaseline(dir) { // validate the baseline tree in a child process (same flags, no ratchet)
  const { spawnSync } = await import("node:child_process");
  const tmpOut = path.join(fs.mkdtempSync("/tmp/tusk-base-"), "b.json");
  const a = ["--dir", dir, "--no-images", "--offline", "--now", new Date(NOW).toISOString(), "--json", tmpOut]; if (REPO) a.push("--repo", REPO);
  spawnSync(process.execPath, [new URL(import.meta.url).pathname, ...a], { encoding: "utf8" });
  try { return JSON.parse(fs.readFileSync(tmpOut, "utf8")).findings; } catch { return []; }
}
async function main() {
  const t0 = Date.now();
  const [road, media, notif, health, review, appjs, indexHtml] = await Promise.all([
    get("road.json"), get("road-media.json").catch(() => null), get("notifications.json").catch(() => null),
    get("data/health.json").catch(() => null), get("data/needs-review.json").catch(() => null), get("app.js", "text"), get("index.html", "text"),
  ]);
  const N = road.flight;
  const cats = road.categories || [];
  const allHist = cats.flatMap((c) => (c.history || []).map((h) => ({ ...h, _box: c.id })));
  const feed = road.feed_items || [];
  const FLIGHTS = [...appjs.matchAll(/\{\s*n:\s*(\d+),\s*date:\s*"([^"]+)"[^]*?outcome:\s*"(\w+)"[^]*?headline:\s*"([^"]*)"[^]*?highlights:\s*"([^"]*)"[^]*?story:\s*"((?:[^"\\]|\\.)*)"/g)]
    .map((m) => ({ n: +m[1], date: m[2], outcome: m[3], headline: m[4], highlights: m[5], story: m[6] }))
    .filter((f, i, a) => a.findIndex((g) => g.n === f.n) === i);
  const lastLogged = Math.max(0, ...FLIGHTS.map((f) => f.n));

  /* ── A. Schema / structure ── */
  { // A6: the block the checker rewrites must still parse (a broken app.js = a white screen for every visitor)
    const m = appjs.match(/^const FLIGHTS = (\[[^]*?\n\]);/m);
    if (!m) ERR("A6-flights-block", "app.js has no `const FLIGHTS = [ … ];` block");
    else { try { const vm = await import("node:vm"); const arr = vm.runInNewContext("(" + m[1] + ")", {}, { timeout: 500 });
        if (!Array.isArray(arr) || !arr.length) ERR("A6-flights-block", "FLIGHTS is empty");
        else for (const f of arr) for (const k of ["n", "date", "outcome", "story"]) if (f[k] === undefined || f[k] === "") ERR("A6-flights-block", `Flight ${f.n} has no ${k}`); }
      catch (e) { ERR("A6-flights-block", `FLIGHTS block does not parse: ${String(e.message).slice(0, 120)}`); } }
    try { const bp = await import("@babel/parser"); try { (bp.parse || bp.default.parse)(appjs, { sourceType: "script", plugins: ["jsx"] }); } catch (e) { ERR("A6-app-parse", `app.js does not parse: ${String(e.message).slice(0, 120)}`); } }
    catch { INFO("A6-app-parse", "full app.js parse skipped (@babel/parser not installed in the runner)"); }
  }
  const BOX_IDS = ["cryo", "raptor", "static", "pad", "faa", "date"];
  if (!Number.isInteger(N)) ERR("A1-schema", "road.flight is not an integer", road.flight);
  if (cats.length !== 6 || !BOX_IDS.every((b) => cats.some((c) => c.id === b))) ERR("A1-schema", "road.json must have exactly the 6 Road boxes", cats.map((c) => c.id));
  for (const h of allHist) {
    if (!h.id || !h.text || !(h.at || h.date)) ERR("A2-entry", `history entry missing id/text/date in ${h._box}`, short(JSON.stringify(h), 160));
  }
  for (const f of feed) if (!f.id || !f.at || !f.body || !f.kind) ERR("A3-feed", "feed item missing id/at/body/kind", short(JSON.stringify(f), 160));
  if (N !== lastLogged + 1) ERR("A4-rollover", `road.flight (${N}) is not last logged flight + 1 (${lastLogged + 1})`);
  else INFO("A4-rollover", `road.flight ${N} = last logged Flight ${lastLogged} + 1`);
  for (const k of Object.keys(road.archive || {})) if (+k >= N) ERR("A5-archive", `archive holds Flight ${k}, which is not launched yet (tracked ${N})`);

  /* ── B. Duplicates ── */
  const dupe = (arr, key) => { const seen = new Map(), d = []; for (const x of arr) { const k = key(x); if (!k) continue; if (seen.has(k)) d.push([k, seen.get(k), x]); else seen.set(k, x); } return d; };
  for (const [k] of dupe(feed, (f) => f.id)) ERR("B1-dup-feed-id", `duplicate feed id ${k}`);
  for (const [k] of dupe(allHist, (h) => h.id)) ERR("B2-dup-entry-id", `duplicate Road entry id ${k}`);
  for (const [k, a, b] of dupe(feed, (f) => f.url && `${f.url}|${f.box || ""}`)) WARN("B3-dup-feed-url", `two feed items share one source URL`, `${a.id} / ${b.id} ${k}`);
  for (const [k, a, b] of dupe(feed, (f) => short(f.body, 200).toLowerCase())) WARN("B4-dup-feed-body", `two feed items say the same thing`, `${a.id} / ${b.id}: "${short(k, 70)}"`);

  /* ── C. Date sanity ── */
  for (const x of [...allHist.map((h) => ({ ...h, _w: `entry ${h.id} (${h._box})` })), ...feed.map((f) => ({ ...f, _w: `feed ${f.id}` }))]) {
    if (!x.at) continue;
    const t = Date.parse(x.at);
    if (!Number.isFinite(t)) { ERR("C1-date-parse", `${x._w}: unparseable at "${x.at}"`); continue; }
    if (t > NOW + H) ERR("C2-future", `${x._w}: timestamp in the future (${x.at})`);
    if (x.date && /^\d{1,2} [A-Z][a-z]{2}$/.test(x.date) && x.date !== ukDay(x.at)) {
      // a card's day label should be the UK day of its own timestamp (log_date may differ by design)
      WARN("C3-day-label", `${x._w}: day label "${x.date}" ≠ UK day of its timestamp (${ukDay(x.at)})`, short(x.text || x.body, 70));
    }
  }
  const dc = (appjs.match(/const DATA_CHECKED = "([^"]+)"/) || [])[1];
  if (dc && !/function (?:dataCheckedLabel|lastCheckedLabel)\(/.test(appjs)) { const age = (NOW - Date.parse(dc + " 12:00 UTC")) / D; if (age > 2) ERR("C4-data-checked", `About › "Flight data last checked ${dc}" is ${age.toFixed(0)} days old while the checker runs every 15 min`, `app.js DATA_CHECKED`); }
  const upd = Date.parse(road.updatedAt || 0); if (NOW - upd > 36 * H) WARN("C5-road-stale", `road.json updatedAt is ${((NOW - upd) / H).toFixed(0)} h old`);

  /* ── D. Flight scope / leaks ── */
  const veh = new Set((road.vehicles || []).map(hwKey));
  const hf = road.hardware_flights || {};
  for (const h of allHist) {
    const hw = hwKey(h.hardware);
    if (h.flight && h.flight !== N) ERR("D1-scope", `entry ${h.id} in ${h._box} is tagged Flight ${h.flight} on the Flight ${N} Road`, short(h.text));
    if (/^[BS]\d+$/.test(hw) && !veh.has(hw) && hf[hw] !== N) ERR("D2-hardware", `entry ${h.id} (${h._box}) is for ${hw}, not a Flight ${N} vehicle (${[...veh].join("/")})`, short(h.text));
    const other = vehiclesIn(h.text).filter((v) => !veh.has(v) && (!hf[v] || hf[v] !== N));
    if (other.length) WARN("D3-mentions-other", `entry ${h.id} (${h._box}) mentions ${other.join(", ")} (not Flight ${N} hardware)`, short(h.text));
  }
  for (const f of feed) {
    const r = RECAP_PAST_FLIGHT(`${f.body}`, f.flight || N);
    if (f.flight && r) ERR("D4-flight-tag", `feed ${f.id} is tagged Flight ${f.flight} but only talks about Flight ${r.join(", ")}`, short(f.body));
  }
  // post-flight recaps pushed/tagged as next-flight news (pattern seen 17–20 Nov): SpaceX post, tagged N, after last launch, mentions catch/splashdown/liftoff with no N
  const lastLaunch = FLIGHTS.find((f) => f.n === lastLogged);
  if (lastLaunch) for (const f of feed) {
    if (f.flight === N && /@SpaceX/i.test(f.src || "") && Date.parse(f.at) > Date.parse(lastLaunch.date) && !new RegExp(`Flight ${N}\\b`).test(f.body) && /\b(caught|catch|splash(?:ed)? ?down|liftoff|lift-off|hot[- ]?stag|abort|powered .* on Flight)\b/i.test(f.body))
      WARN("D5-recap", `feed ${f.id} (@SpaceX, ${f.date}) reads like a Flight ${lastLogged} recap but is tagged Flight ${N}`, short(f.body));
  }

  /* ── E. Box classification (wrong box) ── */
  for (const h of allHist) {
    const rx = BOX_RX[h._box]; const txt = `${h.text} ${h.card_text || ""}`;
    if (rx && !rx.test(txt) && !h.refiled_pin) WARN("E1-box-words", `entry ${h.id} in ${h._box} has no ${h._box} words`, short(h.text));
  }
  for (const f of feed.filter((f) => f.box)) {
    const rx = BOX_RX[f.box];
    if (rx && !rx.test(f.body)) ERR("E2-feed-box", `feed ${f.id} is filed in the ${f.box} box but is not about ${f.box}`, short(f.body));
    if (SPECULATIVE.test(f.body)) ERR("E3-speculative-box", `feed ${f.id} in the ${f.box} box is speculative ("${f.body.match(SPECULATIVE)[0]}") — a Road box should hold events`, short(f.body));
  }
  // box status vs content
  for (const c of cats) {
    if ((c.status === "done" || c.status === "complete") && !(c.history || []).some((h) => h.complete)) WARN("E4-status", `${c.id} is ${c.status} but no entry is marked complete`);
    if (c.status === "progress" && !(c.history || []).length) WARN("E4-status", `${c.id} is In progress with no entries`);
  }

  /* ── F. Credits = publisher ── */
  for (const f of feed) {
    if (f.url && !f.src && f.kind === "news") ERR("F1-no-publisher", `feed ${f.id} has a source URL but no publisher credit`, `${new URL(f.url).hostname} · "${short(f.body, 60)}"`);
    if (f.src && VEH_CREDIT.test(f.src)) ERR("F2-vehicle-credit", `feed ${f.id} credit is a vehicle name (${f.src})`);
  }
  for (const h of allHist) if (h.src && VEH_CREDIT.test(h.src)) ERR("F2-vehicle-credit", `entry ${h.id} credit is a vehicle name (${h.src})`);
  if (/credit=\{p\.label\}/.test(appjs) && /data-vehicles\][^\n]*photo-credit[^\n]*vehicle name/.test(appjs))
    ERR("F3-photo-credit-slot", "opened flight card puts the vehicle label (\"Booster 22\" / \"Ship 42\") in the photo-credit slot; the credit must be the publisher", "app.js PhotoSlot credit={p.label} + .gallery[data-vehicles] .photo-credit");
  for (const [n, a] of Object.entries(road.archive || {})) for (const [k, p] of Object.entries(a.vehicle_photos || {})) {
    const pub = (String(p.note || "").match(/^([^,(]+?),/) || [])[1];
    if (!p.credit) WARN("F4-vp-credit-field", `archive ${n} ${k} photo has no credit field (publisher only in a note: "${short(p.note, 60)}")`);
    if (pub && !/spacex/i.test(pub) && /All photos by SpaceX/.test(appjs)) ERR("F5-about-credit", `About says "All photos by SpaceX" but the Flight ${n} ${k} photo is by ${pub}`);
  }

  /* ── G. Photos ── */
  for (const [n, a] of Object.entries(road.archive || {})) {
    if (+n < lastLogged) continue; // rule applies to the newest flight card
    const vp = a.vehicle_photos || {};
    if (!vp.booster || !vp.ship) ERR("G1-vehicle-photos", `Flight ${n} card lacks one photo per vehicle`, Object.keys(vp));
    if (!NO_IMAGES) for (const [k, p] of Object.entries(vp)) {
      try {
        const buf = await get(p.image, "buf"); const dim = jpegSize(buf) || pngSize(buf);
        if (!dim) WARN("G2-photo-dims", `Flight ${n} ${k} photo: could not read size`, p.image);
        else { const ar = dim.w / dim.h; const txt = `${dim.w}×${dim.h} (${ar.toFixed(2)})`;
          if (ar < 1) WARN("G3-portrait-in-landscape", `Flight ${n} ${k} photo is portrait ${txt}, shown in the locked 4:3 landscape frame (cover crop keeps ${(ar / (4 / 3) * 100).toFixed(0)}% of its height)`, `${p.image} focus ${p.focus}`);
          else INFO("G3-photo", `Flight ${n} ${k} photo ${txt}`); }
      } catch (e) { ERR("G4-photo-missing", `Flight ${n} ${k} photo does not load: ${e.message}`); }
    }
  }
  const hot = [...new Set(allHist.flatMap((h) => (h.x_post && h.x_post.media || []).map((m) => m.url)).filter((u) => u && /pbs\.twimg\.com/.test(u)))];
  const cached = new Set(Object.keys(road.image_cache || {}));
  const unc = hot.filter((u) => !cached.has(u)); if (unc.length) WARN("G5-hotlinks", `${unc.length} Road photo(s) hot-linked from pbs.twimg.com with no local cache copy (break if X changes/removes media)`, unc.slice(0, 3));

  /* ── H. Lifecycle ── */
  const launchedN = FLIGHTS.find((f) => f.n === N) || (road.launched && road.launched.flight === N);
  if (launchedN) for (const c of cats) if (!["done", "complete"].includes(c.status)) ERR("H1-liftoff-boxes", `Flight ${N} has lifted off but its ${c.id} box is still ${c.status}`);
  const arch = road.archive && road.archive[lastLogged];
  if (arch && arch.summary) { const open = (arch.summary.items || []).filter((i) => i && i.status && !/done|complete/.test(i.status)); if (open.length) ERR("H2-archive-open", `Flight ${lastLogged} archive still has open boxes after liftoff`, open.map((i) => i.box || i.id)); }
  for (const f of FLIGHTS) {
    if (/\b(is attempting|will attempt|will try|is expected|pending|awaits?)\b/i.test(`${f.headline} ${f.story}`)) ERR("H3-hero-tense", `logged Flight ${f.n} story uses future/pending wording`, short(f.story, 100));
    if (!f.highlights && NOW - Date.parse(f.date) > 3 * D) WARN("H4-highlights", `Flight ${f.n} still shows "Highlights coming soon" ${((NOW - Date.parse(f.date)) / D).toFixed(0)} days after launch`);
  }
  if (road.mission_alerts && road.mission_alerts.flight !== N) ERR("H5-mission-alerts", `mission_alerts.flight ${road.mission_alerts.flight} ≠ Road flight ${N}`);
  for (const m of (road.mission_updates || {})[N] || []) {
    if (new RegExp(`after Flight ${N} launch|Flight ${N} (?:launched|lifted off|flew)`, "i").test(m.line) && !launchedN) ERR("H6-invented-event", `Flight ${N} mission update describes a launch that has not happened`, `${short(m.line)} (${m.src})`);
  }

  { // H7: a logged story may not claim more than the confirmed stage outcomes (14 Nov dac2d2b: "both stages returned" while the booster splashed down)
    try { const tmp = fs.mkdtempSync("/tmp/tusk-h7-"); if (REPO) { fs.cpSync(path.join(path.resolve(REPO), "scripts"), path.join(tmp, "scripts"), { recursive: true });
      const req = createRequire(path.join(tmp, "scripts", "x.js")); const HS = req("./hero-story.js"), SG = req("./story-gate.js");
      for (const f of FLIGHTS) { const hd = HS.heroDataFor(road, f.n); if (!hd.hero_lines && !hd.mission_updates) continue;
        const veh = (road.archive && road.archive[f.n] && road.archive[f.n].vehicles) || (Number(road.flight) === f.n ? road.vehicles : []) || [];
        const r = HS.loggedStory(road, f.n, { vehicles: veh, appSrc: appjs }); if (!r.results || r.results.length < 2) continue;
        const v = SG.verifyStory(f.story.replace(/\\"/g, '"'), r.results);
        for (const pr of v.problems.filter((x) => !/^no confirmed outcome/.test(x))) ERR("H7-story-claims", `Flight ${f.n} story says more than the confirmed outcomes: ${pr}`); } } }
    catch (e) { WARN("Z-h7", `story-claims check unavailable (${String(e.message).slice(0, 80)})`); } }

  /* ── I. Push ↔ app ── */
  const pushes = (notif && notif.pushes) || [];
  const recent = pushes.filter((p) => p.verdict === "sent" && NOW - Date.parse(p.sent_at || p.at) < 14 * D);
  const archUrls = new Set(Object.values(road.archive || {}).flatMap((a) => (a.entries || []).map((e) => e.url)));
  const histIds = new Set(allHist.map((h) => h.id)), feedIds = new Set(feed.map((f) => f.id));
  let appModel = null;
  if (REPO) { try { const tmp = fs.mkdtempSync("/tmp/tusk-vmodel-"); fs.cpSync(path.join(path.resolve(REPO), "scripts"), path.join(tmp, "scripts"), { recursive: true }); fs.writeFileSync(path.join(tmp, "app.js"), appjs);
      const req = createRequire(path.join(tmp, "scripts", "x.js")); const RC = req("./render-check.js"); const repoApp = appjs;
      const v = RC.view(road); const app = RC.appFns(repoApp); appModel = { view: v, RC, app }; }
    catch (e) { WARN("Z-app-model", `app model unavailable (${e.message})`); } }
  const rendered = appModel ? new Set(appModel.view.cards.flatMap((c) => [c.id, ...c.rows.map((r) => r.url)]).concat(appModel.view.cards.map((c) => c.url))) : null;
  const renderedText = appModel ? appModel.view.cards.map((c) => c.text + " " + c.rows.map((r) => r.text).join(" ")).join(" ") : "";
  for (const p of recent) {
    const u = new URL(p.link); const entry = u.searchParams.get("entry"), item = u.searchParams.get("item");
    if (entry && !histIds.has(entry)) { const archived = p.url && archUrls.has(p.url);
      WARN("I1-push-target", `push "${short(p.body, 60)}" (${p.sent_at}) deep-links to entry ${entry}, which no longer exists${archived ? " (moved to the Flight archive without its id, so the link opens nothing)" : " anywhere in road.json"}`); }
    if (item && !feedIds.has(item)) WARN("I1-push-target", `push "${short(p.body, 60)}" links to feed item ${item}, no longer in feed_items`);
    if (entry && histIds.has(entry) && appModel) {
      const h = allHist.find((x) => x.id === entry);
      if (!rendered.has(h.url) && !renderedText.includes(short(h.text, 30))) ERR("I2-push-invisible", `push "${short(p.body, 60)}" (${p.sent_at}) deep-links to ${entry}, which the app does not render on Page 2`, `${h._box} · hardware ${h.hardware} · flight ${h.flight}`);
    }
  }
  const wk = pushes.filter((p) => NOW - Date.parse(p.at) < 7 * D); const sent7 = wk.filter((p) => p.verdict === "sent").length;
  INFO("I3-push-volume", `last 7 days: ${sent7} push(es) sent, ${wk.length - sent7} held/silent/blocked`);
  for (const p of recent) if (/@?elonmusk/.test(p.url || "") && p.gate === "official source") WARN("I4-elon-official", `Elon Musk post pushed as "official source" (sources.js marks Elon predictOnly)`, short(p.body, 70));

  /* ── J. App model: Page 2 scope + Page 1/Page 2 parity ── */
  if (appModel) {
    const cards = appModel.view.cards;
    const flightsShown = new Set(appModel.app.rtfRows(road).rows.filter((r) => r.section).map((r) => r.section.n));
    const extra = [...flightsShown].filter((n) => n !== N && n !== N + 1);
    if (extra.length) INFO("J1-page2-scope", `app model rtfRows still builds sections ${[...flightsShown].join(", ")}; the page component must hide all but ${N}/${N + 1} (21 Nov DOM check: only Flight ${N} + ${N + 1} visible). Move the filter into rtfRows so every view and test sees one rule.`); else INFO("J1-page2-scope", `Page 2 sections: ${[...flightsShown].join(", ")}`);
    for (const c of cards) {
      const rx = BOX_RX[c.cat]; if (rx && !rx.test(c.text) && !c.rows.some((r) => rx.test(r.text))) ERR("J2-card-box", `Page 2 ${c.name} · ${c.vehicle} card shows a line that is not about ${c.cat}`, short(c.text));
      if (c.vehicle && /^[BS]\d+$/.test(c.vehicle)) { const oth = vehiclesIn(c.text).filter((v) => v !== c.vehicle); if (oth.length) WARN("J3-crossover", `Page 2 ${c.name} · ${c.vehicle} card names ${oth.join(", ")}`, short(c.text)); }
    }
    const byKey = new Map(); for (const c of cards) { const k = `${c.cat}|${c.text}`; byKey.set(k, (byKey.get(k) || 0) + 1); }
    for (const [k, n] of byKey) if (n > 1) WARN("J4-same-line-twice", `the same line is shown on ${n} Page 2 cards`, k);
    // Page 1 box status vs data status (pill contradiction)
    const log = appModel.view.log;
    for (const c of cats) { const lb = log[c.id]; if (lb && lb.status !== c.status && !(lb.status === "done" && c.status === "complete")) WARN("J5-pill", `${c.id}: Page 1 box shows "${lb.statusText}" (${lb.status}) but road.json status is ${c.status}`); }
    // render-check's own list (same as the daily self-check)
    try { const rc = appModel.RC.check(road, { app: appModel.app }); const fails = (rc && (rc.failures || rc.items || rc)) || []; if (Array.isArray(fails)) for (const f of fails) WARN("J6-render-check", typeof f === "string" ? f : f.msg || JSON.stringify(f)); } catch (e) { INFO("J6-render-check", `render-check.check not callable here (${short(e.message, 60)})`); }
  }

  /* ── K. Ops health ── */
  if (health) {
    const age = (NOW - Date.parse(health.updated)) / H;
    if (age > 2) ERR("K1-health-stale", `data/health.json last updated ${age.toFixed(1)} h ago (checker every 15 min, file refreshed hourly)`);
    if (health.alert) ERR("K2-health-alert", `health alert: ${health.last_error && health.last_error.error}`);
    if (health.render_check && health.render_check.status !== "ok") ERR("K3-render-check", `daily render check FAILED (${health.render_check.failures}) on ${health.render_check.at} and nothing acted on it`, health.render_check.items);
  }
  if (review && review.items) { const old = review.items.filter((i) => NOW - Date.parse(i.date) > 7 * D); WARN("K4-review-backlog", `${review.items.length} item(s) in data/needs-review.json, ${old.length} older than 7 days (no resolved field; nobody drains it)`); }
  if (/@babel\/standalone\/babel\.min\.js/.test(indexHtml) && !/@babel\/standalone@\d/.test(indexHtml)) WARN("K5-unpinned-cdn", "index.html loads @babel/standalone and react@18 from unpkg without an exact version: a CDN release or outage can blank the app");
  { const wf = OFFLINE ? [DIR && path.join(DIR, ".github/workflows/mission-alert.yml"), REPO && path.join(path.resolve(REPO), ".github/workflows/mission-alert.yml")].filter(Boolean).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, "utf8"))[0] || "" : await fetch("https://raw.githubusercontent.com/8costinha8/starship-tracker/main/.github/workflows/mission-alert.yml").then((r) => r.ok ? r.text() : "").catch(() => "");
    if (/cron: "35 19 14 11 \*"/.test(wf)) ERR("K6-annual-cron", "mission-alert.yml keeps Flight 15's 14 Nov crons, which fire again every 14 Nov"); }

  /* ── L. Optional LL2 cross-check (one call) ── */
  if (DO_LL2) { try {
    const j = await (await fetch("https://ll.thespacedevs.com/2.3.0/launches/upcoming/?search=Starship&limit=5&mode=list")).json();
    const first = (j.results || [])[0]; const hasN = (j.results || []).find((l) => new RegExp(`Flight ${N}\\b`).test(l.name));
    if (first && !/Flight \d+/.test(first.name)) WARN("L1-ll2-first", `LL2's first upcoming Starship launch is "${first.name}" (${first.net}); check-flights reads limit=1 and takes it as the next flight (n = null)`);
    if (!hasN) WARN("L2-ll2-missing", `LL2 has no "Flight ${N}" upcoming entry; hero date falls back to road.json`);
  } catch (e) { INFO("L1-ll2", `LL2 not reachable (${e.message})`); } }

  const order = { ERROR: 0, WARN: 1, INFO: 2 };
  findings.sort((a, b) => order[a.sev] - order[b.sev] || a.id.localeCompare(b.id));
  const c = (s) => findings.filter((f) => f.sev === s).length;
  console.log(`Starship Tracker validator — ${new Date(NOW).toISOString()} — ${DIR ? "local " + DIR : BASE}`);
  console.log(`Flight ${N} Road · ${allHist.length} entries · ${feed.length} feed items · ${pushes.length} logged pushes · app model: ${appModel ? "on" : "off"}`);
  console.log(`RESULT: ${c("ERROR")} ERROR · ${c("WARN")} WARN · ${c("INFO")} INFO  (${Date.now() - t0} ms)\n`);
  for (const f of findings) console.log(`${f.sev === "ERROR" ? "❌" : f.sev === "WARN" ? "⚠️ " : "ℹ️ "} [${f.id}] ${f.msg}${f.evidence ? `\n      ↳ ${typeof f.evidence === "string" ? f.evidence : JSON.stringify(f.evidence)}` : ""}`);
  if (RATCHET) {
    const fp = (f) => `${f.id}|${String(f.msg).replace(/\d+(?:\.\d+)? (days?|h)\b/g, "N $1").replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "T")}`;
    const base = await runBaseline(RATCHET);
    const baseSet = new Set(base.filter((f) => f.sev === "ERROR").map(fp));
    const newErr = findings.filter((f) => f.sev === "ERROR" && !baseSet.has(fp(f)));
    // what may stop a commit: errors about the CONTENT being written (shape, dates, scope, box filing, invented claims, push links).
    // Producer gaps (missing publisher credit), rollover transients (liftoff boxes, mission_alerts), app/infra state (K*, C4, F3, F5) are reported, never blocking.
    const BLOCK = new RegExp(opt("--block") || "^(A[1-6]|B[12]|C[12]-|D[124]|E[23]-|H3|H6|H7|I2|J2)");
    const fresh = newErr.filter((f) => BLOCK.test(f.id)), advisory = newErr.filter((f) => !BLOCK.test(f.id));
    console.log(`\nRATCHET vs ${RATCHET}: ${baseSet.size} existing error(s) tolerated, ${fresh.length} NEW blocking, ${advisory.length} NEW advisory`);
    for (const f of fresh) console.log(`🚫 BLOCK [${f.id}] ${f.msg}${f.evidence ? ` ↳ ${short(typeof f.evidence === "string" ? f.evidence : JSON.stringify(f.evidence), 160)}` : ""}`);
    for (const f of advisory) console.log(`⚠️  ADVISE [${f.id}] ${f.msg}`);
    if (OUT) fs.writeFileSync(OUT, JSON.stringify({ at: new Date(NOW).toISOString(), mode: "ratchet", existing: baseSet.size, new: fresh, advisory }, null, 2));
    process.exitCode = fresh.length ? 1 : 0; return;
  }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ at: new Date(NOW).toISOString(), base: BASE, counts: { error: c("ERROR"), warn: c("WARN"), info: c("INFO") }, findings }, null, 2));
  process.exitCode = c("ERROR") ? 1 : 0;
}
function jpegSize(b) { if (b[0] !== 0xff || b[1] !== 0xd8) return null; let i = 2; while (i < b.length) { if (b[i] !== 0xff) return null; const m = b[i + 1], len = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + len; } return null; }
function pngSize(b) { return b.slice(1, 4).toString() === "PNG" ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null; }
main().catch((e) => { console.error("validator crashed:", e); process.exitCode = 2; });
