/* Logged-flight story = the final Style A hero paragraph, verbatim (15 Nov rule, every flight).
   The checker's log step (check-flights.js) uses this instead of a written summary: it runs app.js's own hero
   composer (heroOutcomeItems → composeHeroParagraph, pulled out of app.js at run time, so it can't drift from the
   hero) on the flight's road.json hero data: road.hero_lines[n] / mission_updates[n] / mission_alerts, or the copy the
   rollover keeps in road.archive[n].hero. Returns { story: "" , reason } when the data is missing or not final
   (one stage without a confirmed result): the story is then left for review, never invented. Read-only. */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const WANT = ["heroOutcomeItems", "composeHeroParagraph"];
const EXTRA = new Set(); // names only referenced lazily (found missing at call time), loaded on the next build
function heroFns(src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8")) {
  const lines = src.split("\n"), starts = [];
  lines.forEach((l, i) => { const m = l.match(/^(?:async\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/); if (m) starts.push({ name: m[1], i }); });
  const decl = (name) => { const k = starts.findIndex((s) => s.name === name); if (k < 0) return null;
    let end = lines.length; for (let j = starts[k].i + 1; j < lines.length; j++) if (/^\S/.test(lines[j]) && !/^[}\])]/.test(lines[j])) { end = j; break; }
    return lines.slice(starts[k].i, end).join("\n"); };
  const have = new Set(), parts = [];
  const add = (n) => { if (have.has(n)) return true; const d = decl(n); if (!d) return false; have.add(n); parts.unshift(d); return true; };
  WANT.forEach(add); [...EXTRA].forEach(add);
  const window = {}, React = { createElement() { return null; } }, document = {}, localStorage = { getItem() { return null; } };
  for (let tries = 0; tries < 300; tries++) {
    try {
      const F = new Function("window", "React", "document", "localStorage", `${parts.join("\n")}\nreturn { ${WANT.join(", ")} };`)(window, React, document, localStorage);
      return F;
    } catch (e) {
      const m = String(e.message).match(/^(\w+) is not defined/) || String(e.message).match(/Cannot access '(\w+)' before initialization/);
      if (!m) throw e;
      if (/before initialization/.test(e.message)) { const i = parts.findIndex((p) => new RegExp(`^(?:const|let|function)\\s+${m[1]}\\b`).test(p)); const [p] = parts.splice(i, 1); parts.unshift(p); continue; }
      if (!add(m[1])) throw new Error(`hero-story: app.js has no top-level ${m[1]}`);
    }
  }
  throw new Error("hero-story: could not load app.js hero composer");
}
const pick = (o, n) => (o && (o[n] || o[String(n)])) || null;
// The hero data of flight n as the hero saw it: live fields while the Road is still n, else the rollover's archive copy.
function heroDataFor(road, n) {
  const arch = pick(road && road.archive, n), kept = (arch && arch.hero) || {};
  const live = road && Number(road.flight) === Number(n);
  const ma = road && road.mission_alerts && Number(road.mission_alerts.flight) === Number(n) ? road.mission_alerts : null;
  return {
    hero_lines: pick(road && road.hero_lines, n) || kept.hero_lines || null,
    mission_updates: pick(road && road.mission_updates, n) || kept.mission_updates || null,
    mission_alerts: ma || kept.mission_alerts || null,
    feed_items: ((road && road.feed_items) || []).filter((f) => f && (Number(f.flight) === Number(n) || (live && !Number.isInteger(f.flight)))),
  };
}
function loggedStory(road, n, { vehicles, appSrc } = {}) {
  const d = heroDataFor(road, n);
  if (!d.hero_lines && !d.mission_updates) return { story: "", reason: `no hero data for Flight ${n} (hero_lines / mission_updates missing)` };
  const view = { flight: n, vehicles: vehicles || [], hero_lines: d.hero_lines ? { [n]: d.hero_lines } : {}, mission_updates: d.mission_updates ? { [n]: d.mission_updates } : {},
    mission_alerts: d.mission_alerts || undefined, feed_items: d.feed_items, rejected_lines: (road && road.rejected_lines) || [] };
  let items, story;
  for (let tries = 0; ; tries++) { // a lazy reference only fails when called: load it and run again
    try { const F = heroFns(appSrc); items = F.heroOutcomeItems(view, n) || []; story = String(F.composeHeroParagraph(items, view) || "").trim(); break; }
    catch (e) { const m = String(e.message).match(/^(\w+) is not defined/); if (!m || tries > 100 || EXTRA.has(m[1])) throw e; EXTRA.add(m[1]); }
  }
  // A stage result counts only when it is confirmed: a manual hero line, or an automatic one whose source line is not an
  // Elon plan / opinion and is not worded as a plan or anticipation ("aims to", "attempts", "anticipated").
  const gate = require("./story-gate.js"), srcLines = (view.mission_updates[n] || []);
  const confirmed = (o) => { if (!o.at) return true; const u = srcLines.find((x) => x.at === o.at); return !u || gate.isTrustedResult(u.src, u.line); };
  const res = (st) => items.some((o) => o && o.stage === st && o.kind === "result" && (o.clause || o.line) && confirmed(o));
  // each confirmed stage result as one short sentence ("Ship 42 was caught by the tower."), for a short push line
  const name = (o) => o.name || (view.vehicles.find((v) => (o.stage === "ship" ? /^S/i : /^B/i).test(String(v))) || "").replace(/^S/i, "Ship ").replace(/^B/i, "Booster ");
  const results = items.filter((o) => o && o.kind === "result" && (o.stage === "booster" || o.stage === "ship") && (o.clause || o.line))
    .map((o) => String(o.line || `${name(o)} ${o.clause}.`).trim()).filter(Boolean);
  if (!res("booster") || !res("ship")) return { story: "", results, reason: `Flight ${n} hero is not final (${["booster", "ship"].filter((s) => !res(s)).join(" + ")} result missing)` };
  if (!story) return { story: "", results, reason: `Flight ${n} hero paragraph is empty` };
  const v = gate.verifyStory(story, results); // the paragraph may only say what the confirmed results say
  if (!v.ok) return { story: "", results, reason: `Flight ${n} story blocked by the result gate: ${v.problems[0]}` };
  return { story, results, reason: "hero paragraph" };
}
// The hero data the rollover keeps with the archived flight, so the log step (or a later re-log) can still read it.
function heroArchive(old, n) {
  const out = {};
  const hl = pick(old && old.hero_lines, n), mu = pick(old && old.mission_updates, n);
  if (hl) out.hero_lines = JSON.parse(JSON.stringify(hl));
  if (mu) out.mission_updates = JSON.parse(JSON.stringify(mu));
  if (old && old.mission_alerts && Number(old.mission_alerts.flight) === Number(n)) out.mission_alerts = JSON.parse(JSON.stringify(old.mission_alerts));
  return Object.keys(out).length ? out : null;
}
module.exports = { loggedStory, heroDataFor, heroArchive, heroFns };
