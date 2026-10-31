/* Rendered-output check (part of the daily self-check). Checks what the page SHOWS, not only the data:
   it runs app.js's own render functions (rtfRows / rtfCards / roadUpdates / cardDate / cardT / scrub, pulled out of app.js
   at run time, so it can't drift from the page) plus scripts/flightlog.js boxes (the Flight Log), then checks:
     tense      — card / Earlier-update / Flight Log lines in present tense (push wording is never rendered here)
     date       — Flight Log box line vs Road to Flight card for the same vehicle + section (day and time);
                  newest Launch date card vs the hero's predicted NET
     duplicate  — two rows in one drawer for the same event at the same minute
     crossover  — a Ship card showing a Booster line or the other way round
     status     — a box pill that contradicts its own headline ("Not yet" next to "work under way")
   Read-only. Usage: node scripts/render-check.js [road.json]   (exit 1 when anything fails)
   Optional live DOM pass: RENDER_URL=https://… node scripts/render-check.js --live  (needs playwright installed; CI does not) */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let APP = null;
// Pull top-level declarations out of app.js by name and evaluate them with their dependencies (resolved on ReferenceError).
const EXTRA = new Set(); // names found missing at call time (lazy references), loaded on the next build
function appFns(src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8")) {
  const lines = src.split("\n"), starts = [];
  lines.forEach((l, i) => { const m = l.match(/^(?:async\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/); if (m) starts.push({ name: m[1], i }); });
  const decl = (name) => { const k = starts.findIndex((s) => s.name === name); if (k < 0) return null;
    let end = lines.length; for (let j = starts[k].i + 1; j < lines.length; j++) if (/^(?:\S)/.test(lines[j]) && !/^[}\])]/.test(lines[j])) { end = j; break; }
    return lines.slice(starts[k].i, end).join("\n"); };
  const want = ["rtfRows", "rtfCards", "roadUpdates", "upIso", "cardDate", "cardT", "scrub", "ukStamp", "feedTime", "fmtDay", "entryDate", "isDoneCard"];
  const have = new Set(), parts = [];
  const add = (n) => { if (have.has(n)) return true; const d = decl(n); if (!d) return false; have.add(n); parts.unshift(d); return true; };
  want.forEach(add); [...EXTRA].forEach(add);
  const window = { RoadPick: null, RoadFlightLog: null, RoadCleanup: null, addEventListener() {}, dispatchEvent() {} }, React = { createElement() { return null; } }, document = {}, localStorage = { getItem() { return null; } };
  for (let tries = 0; tries < 200; tries++) {
    try { return new Function("window", "React", "document", "localStorage", `${parts.join("\n")}\nreturn { ${want.join(", ")} };`)(window, React, document, localStorage); }
    catch (e) { const m = String(e.message).match(/^(\w+) is not defined/) || String(e.message).match(/Cannot access '(\w+)' before initialization/);
      if (!m) throw e;
      if (/before initialization/.test(e.message)) { const i = parts.findIndex((p) => new RegExp(`^(?:const|let|function)\\s+${m[1]}\\b`).test(p)); const [p] = parts.splice(i, 1); parts.unshift(p); continue; }
      if (!add(m[1])) throw new Error(`render-check: app.js has no top-level ${m[1]}`); }
  }
  throw new Error("render-check: could not load app.js render functions");
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ukDay = (iso) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", timeZone: "Europe/London" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${Number(p.day)} ${MON[p.month - 1]}`; };
// The model of what the page shows (Flight Log boxes + Road to Flight cards with their drawers).
function view(road, opts = {}) {
  for (let i = 0; i < 100; i++) {
    try { return view1(road, { app: opts.app || APP || (APP = appFns()) }); }
    catch (e) { const m = e instanceof ReferenceError && String(e.message).match(/^(\w+) is not defined/); if (!m || EXTRA.has(m[1]) || opts.app) throw e; EXTRA.add(m[1]); APP = null; }
  }
}
function view1(road, { app }) {
  const FL = require("./flightlog.js");
  const log = FL.boxes(road);
  const cards = [];
  for (const r of app.rtfRows(road).rows) {
    if (!r.post || r.post.flight !== road.flight) continue;
    const { h, cat } = r.post, rtf = String(h.id || "").startsWith("rtf-");
    const rows = rtf ? (h.updates || []).slice().sort((a, b) => (Date.parse(app.upIso(b)) || 0) - (Date.parse(app.upIso(a)) || 0)).map((u) => { const iso = app.upIso(u); return { when: iso ? `${app.ukStamp(iso, false)} · ${app.feedTime(iso)}` : app.fmtDay(u.date), iso, text: app.scrub(app.cardT(u)).replace(/^\d{1,2}(?:[–-]\d{1,2})? [A-Z][a-z]{2}:\s*/, ""), url: u.url || "" }; })
      : app.roadUpdates(h).map(({ u, when }) => ({ when: when || app.entryDate(u), iso: app.upIso(u), text: app.scrub(app.cardT(u)), url: u.url || "" }));
    const v = (String(h.id || "").match(/^rtf-\w+-(S\d+|B\d+|pad)$/) || [])[1] || null;
    cards.push({ id: h.id, cat: cat.id, name: cat.name, vehicle: v, when: app.cardDate(h), text: app.scrub(h.card_text || h.x_text || h.text), done: !!r.post.done, rows });
  }
  return { log, cards };
}
const PRESENT = /\b(?:is|are) (?:being|now|undergoing|moving|heading|rolling)\b|\b(?:has|have) (?:been|begun|left|arrived|returned|reportedly)\b|\b(?:completes|performing|purging|undergoing|departs|arrives|rolls out|heads to|is in)\b|^(?:Ship|Booster) \d+ (?:waiting|rolls|arrives|heads|leaves|returns|moves|lifts)\b|\bpropellant loading has\b|\b(?:reports|sources) say\b|\b(?:is|are) targeting\b|\bsuggests\b|\bsaid Flight \d+ is\b/i;
const FORECAST = /\b(?:could|may|might|expected|plans?|will)\b/i;
const vehs = (t) => { const o = new Set(); for (const m of String(t || "").matchAll(/\b(?:(B|S)(\d{2,3})|(Booster|Ship)\s+(\d{2,3}))\b/gi)) o.add(((m[1] || m[3])[0]).toUpperCase() + (m[2] || m[4])); return [...o]; };
const EVENT = (t) => (/static fire|\bfired\b/i.test(t) ? "static" : /cryo/i.test(t) ? "cryo" : /\bremov/i.test(t) ? "removal" : /reinstall|installed/i.test(t) ? "install" : /catch height|chopsticks/i.test(t) ? "catch" : null);
function check(road, opts = {}) {
  const { log, cards } = view(road, opts), out = [];
  const fail = (type, msg, extra = {}) => out.push({ type: `render-${type}`, msg, ...extra });
  const tracked = (road.vehicles || []).map(String);
  // tense
  const tense = (where, t) => { if (t && PRESENT.test(String(t).replace(/\b(?:was|were) \w+ing\b/gi, ""))  && !FORECAST.test(t)) fail("tense", `${where}: "${t}" is present tense on screen`, { item: where, values: [t], reason: "cards and feed text are past tense (push wording stays present)" }); };
  for (const c of cards) { tense(`Road card ${c.name}`, c.text); for (const r of c.rows) tense(`Road card ${c.name} › ${r.when}`, r.text); }
  for (const b of Object.values(log)) for (const k of b.cards || []) for (const l of k.lines || []) tense(`Flight Log ${b.id} ${k.name} ${l.day}`, l.text);
  // date: Flight Log vehicle line vs Road card, same section + vehicle (cryo/static: completed cards; pad: the vehicle's newest line)
  for (const id of ["cryo", "static", "pad"]) for (const k of (log[id] && log[id].cards) || []) {
    if (!tracked.includes(k.vehicle)) continue;
    const top = k.lines[0], c = cards.find((x) => x.cat === id && x.vehicle === k.vehicle);
    if (!top || !c || (id !== "pad" && !c.done)) continue;
    const want = top.time ? `${top.day.split("–").pop()} · ${top.time}` : top.day.split("–").pop();
    if (id !== "pad") { const got = top.time ? c.when : String(c.when).split(" · ")[0];
      if (got !== want) fail("date", `${id} ${k.vehicle}: Flight Log shows ${want}, Road card shows ${c.when}`, { item: `${id}|${k.vehicle}`, values: [want, c.when], reason: "one event time on every view" }); continue; }
    // pad: the Flight Log's newest line (pad tests, no transport) must appear on the Road card at the same day/time
    const all = [c.when, ...c.rows.map((r) => r.when)].map((w) => top.time ? w : String(w).split(" · ")[0]);
    if (!all.includes(want)) fail("date", `pad ${k.vehicle}: Flight Log shows ${want} ("${top.text}"), no Road card line at that time (card ${c.when})`, { item: `pad|${k.vehicle}`, values: [want, c.when], reason: "one event time on every view" });
  }
  const P = road.predicted;
  if (P && P.net && Number(P.flight) === road.flight) {
    const label = ukDay(`${P.net}T12:00:00Z`), d = cards.filter((c) => c.cat === "date")[0];
    if (d && !d.text.includes(label)) fail("date", `newest Launch date card says "${d.text}", hero says NET ${label}`, { item: "date", values: [d.text, `NET ${label}`], reason: "the newest date shows everywhere" });
    if (log.date && !String(log.date.latest).includes(label)) fail("date", `Flight Log Launch date says "${log.date.latest}", hero says NET ${label}`, { item: "date", values: [log.date.latest, `NET ${label}`] });
  }
  // duplicates: same drawer, same minute, same kind of event (or same text)
  for (const c of cards) { const seen = new Map();
    for (const r of c.rows) { if (r.text === c.text) continue; // the event_record's own completion row (guards.js) is allowed
      const k1 = `t|${r.text.toLowerCase()}`, k2 = r.iso && EVENT(r.text) ? `e|${String(r.iso).slice(0, 16)}|${EVENT(r.text)}` : null;
      for (const k of [k1, k2]) if (k && seen.has(k)) fail("duplicate", `${c.name}: "${r.text}" and "${seen.get(k)}" (${r.when}) are the same event`, { item: c.id, values: [r.text, seen.get(k)], reason: "dedupe drawer rows" }); else if (k) seen.set(k, r.text); } }
  // crossover: ship ↔ booster
  for (const c of cards) { if (!c.vehicle || c.vehicle === "pad") continue;
    for (const t of [c.text, ...c.rows.map((r) => r.text)]) { const other = vehs(t).filter((v) => tracked.includes(v) && v !== c.vehicle && v[0] !== c.vehicle[0]);
      if (other.length) fail("crossover", `${c.name} shows "${t}" (names ${other.join(", ")})`, { item: c.id, values: [t], reason: "ship and booster lines never cross over" }); } }
  for (const k of (log.pad && log.pad.cards) || []) if (k.vehicle === "pad") for (const l of k.lines) { const n = vehs(l.text).filter((v) => tracked.includes(v)); if (n.length && !/\bpad\b|tower|chopsticks|deluge|quick disconnect/i.test(l.text)) fail("crossover", `Launch pad card shows a vehicle line "${l.text}"`, { item: "pad|pad", values: [l.text] }); }
  // status vs headline
  for (const b of Object.values(log)) if (b.statusText === "Not yet" && /\bunder ?way|in progress\b/i.test(b.latest || "")) fail("status", `${b.id}: pill "Not yet" beside "${b.latest}"`, { item: b.id, values: [b.statusText, b.latest] });
  return out;
}
// Optional: the same checks on the live DOM (used to verify the deployed page; needs playwright).
async function live(url, { widths = [[390, 844], [1280, 900]] } = {}) {
  const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright"); const b = await chromium.launch(), res = [];
  for (const [w, h] of widths) { const p = await b.newPage({ viewport: { width: w, height: h } }); await p.goto(url, { waitUntil: "load" }); await p.waitForSelector("article.post", { state: "attached", timeout: 30000 });
    const cards = await p.evaluate(() => [...document.querySelectorAll("article.post")].map((a) => ({ name: (a.querySelector(".chip") || {}).textContent, when: (a.querySelector(".post-date") || {}).textContent, text: (a.querySelector(".post-text") || {}).textContent, rows: [...a.querySelectorAll(".bu-pill")].map((li) => ({ when: (li.querySelector(".bu-date") || {}).textContent, text: (li.querySelector(".bu-text") || {}).textContent })) })));
    const hero = await p.evaluate(() => ({ pill: (document.querySelector(".cd") || {}).textContent, date: [...document.querySelectorAll(".facts dd")].map((d) => d.textContent)[0], width: Math.round((document.querySelector("main, .st-main, .page") || document.body).getBoundingClientRect().width) }));
    res.push({ width: w, hero, cards }); await p.close(); }
  await b.close(); return res;
}
module.exports = { appFns, view, check, live, PRESENT };
if (require.main === module) {
  (async () => {
    if (process.argv.includes("--live")) { const r = await live(process.env.RENDER_URL || "https://8costinha8.github.io/starship-tracker/"); console.log(JSON.stringify(r, null, 1)); return; }
    const file = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : path.join(ROOT, "road.json");
    const r = check(JSON.parse(fs.readFileSync(file, "utf8")));
    for (const f of r) console.log(`❌ [${f.type}] ${f.msg}`);
    console.log(r.length ? `${r.length} rendered-output problem(s)` : "✅ rendered output: tense, dates, duplicates, crossover, status all OK");
    process.exit(r.length ? 1 : 0);
  })();
}
