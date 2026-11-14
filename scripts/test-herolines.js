// Hero status paragraph (tracker-2026-11-14-herostyleA). Display-only in app.js.
// No network, no pushes: node scripts/test-herolines.js
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };

const start = app.indexOf("// --- hero-lines helpers");
const end = app.indexOf("// --- end hero-lines helpers ---");
check(start > 0 && end > start, "app.js has the hero-lines helper block");
const SRC_NAMES = /\s*(?:\(|\b)(?:per|via|from|according to)?\s*(?:NASASpaceflight(?:\.com)?|NSF|Spaceflight Now|SpaceNews|Teslarati|Next ?Spaceflight|LL2|Launch Library 2?|Spaceflight News API|LabPadre|Ars Technica|Space\.com)\b(?:\s*[-–]\s*NASASpaceflight\.com)?\)?/gi;
const doneToLabel = (t) => String(t || "");
const scrub = (s) => typeof s !== "string" ? s : doneToLabel(s).replace(/\((?=\s*(?:per|via|from|according to)?\s*(?:NASASpaceflight(?:\.com)?|NSF|Spaceflight Now|SpaceNews|Teslarati|Next ?Spaceflight|LL2|Launch Library 2?|Spaceflight News API|LabPadre|Ars Technica|Space\.com)\b(?:\s+(?:reports?|reported|says|said))?\s*,\s*\d)[^,]*,\s*/gi, "(").replace(SRC_NAMES, "").replace(/\s{2,}/g, " ").replace(/([.!?])\.+$/, "$1").trim();
function noCreditRepeat(line) { return line; }
const H = eval(`(() => {\n${app.slice(start, end)}\nreturn { stripHeroCredit, cleanHeroNote, isDroppedHeroLine, isPendingAttempt, isStageResult, isNonStageResult, isPayloadDeploy, heroLineStage, heroLineKind, heroMissionLines, normalizeHeroLine, replaceNumberWords, heroSourceLines, parseHeroOverrides, extractHeroOutcomes, composeHeroParagraph, heroResultClause, pendingSentence }; })()`);

const road = { flight: 15, vehicles: ["S42", "B22"] };
check(H.replaceNumberWords("twenty six") === "26" && H.replaceNumberWords("twenty-six") === "26", "number words: 'twenty six' / 'twenty-six' → 26");
check(H.normalizeHeroLine("Ship 42 released twenty six V3 Starlink satellites.", road) === "Ship 42 deployed 26 Starlink V3 satellites.", "released → deployed, twenty six → 26, V3 Starlink → Starlink V3");
check(H.normalizeHeroLine("Booster 22 aborted landing attempt due to GNC issue leading to splashdown (Dan Huot, 14 Nov).", road) === "Booster 22 skipped the tower catch and splashed down in the Gulf.", "booster splashdown / abort normalises to the skipped-catch result form");
check(H.isPayloadDeploy("Ship 42 deployed twenty six V3 Starlink satellites and closed its payload bay door.") && !H.isPayloadDeploy("A batch of NOTAMs was released ahead of Flight 15."), "deploy detection is payload-only (not NOTAMs)");
check(H.heroResultClause("Ship 42 was caught by the tower.") === "was caught by the tower", "caught result clause");
check(H.heroResultClause("Ship 42 splashed down in the Indian Ocean.") === "splashed down in the Indian Ocean", "Indian Ocean splashdown clause");
check(H.heroResultClause("Ship 42 was lost during reentry.") === "was lost during reentry", "lost-during-reentry clause");

const at = (line, iso, topic) => ({ topic: topic || "x", line, at: iso, post_id: iso });
const roadOf = (lines, extra) => ({ flight: 15, vehicles: ["S42", "B22"], mission_updates: { 15: lines }, ...(extra || {}) });
const POST = Date.parse("2026-11-14T09:30:00Z");
const F15 = "Booster 22 skipped the tower catch and splashed down in the Gulf, while Ship 42 pressed on to orbit, deployed 26 Starlink V3 satellites and is now flying the longest Starship mission ever. Tower catch still ahead.";
const F15_CAUGHT = "Booster 22 skipped the tower catch and splashed down in the Gulf, while Ship 42 pressed on to orbit, deployed 26 Starlink V3 satellites, flew the longest Starship mission ever and was caught by the tower.";
const F15_OCEAN = "Booster 22 skipped the tower catch and splashed down in the Gulf, while Ship 42 pressed on to orbit, deployed 26 Starlink V3 satellites, flew the longest Starship mission ever and splashed down in the Indian Ocean.";
const F15_LOST = "Booster 22 skipped the tower catch and splashed down in the Gulf, while Ship 42 pressed on to orbit, deployed 26 Starlink V3 satellites, flew the longest Starship mission ever but was lost during reentry.";
const SHIP_ONLY = "Ship 42 pressed on to orbit, deployed 26 Starlink V3 satellites and is now flying the longest Starship mission ever. Tower catch still ahead.";
const BOOST_ONLY = "Booster 22 skipped the tower catch and splashed down in the Gulf.";
const F15_OV = [
  { stage: "booster", kind: "result", clause: "skipped the tower catch and splashed down in the Gulf" },
  { stage: "ship", kind: "orbit", clause: "pressed on to orbit" },
  { stage: "ship", kind: "deploy", clause: "deployed 26 Starlink V3 satellites" },
  { stage: "ship", kind: "record", clause: "flying the longest Starship mission ever", clause_past: "flew the longest Starship mission ever" },
  { stage: "ship", kind: "pending", clause: "with a tower catch still ahead" },
];

function para(r, status) {
  const lines = H.heroMissionLines(r, 15, { n: 15, status: status || "inflight" }, POST);
  return lines;
}

check(H.composeHeroParagraph(F15_OV, road) === F15, "compose: F15 live paragraph from structured clauses");

check(H.pendingSentence({ clause: "with a tower catch still ahead" }) === "Tower catch still ahead.", "pendingSentence: strips leading 'with a' and capitalises");
check(H.pendingSentence({ clause: "Tower catch still ahead." }) === "Tower catch still ahead.", "pendingSentence: already-final form stays exact");
check(!/,\s*with a /i.test(F15) && /\. Tower catch still ahead\.$/.test(F15), "F15 target: pending is its own sentence after a full stop");

// pending only
{ const r = roadOf([], { hero_lines: { 15: [F15_OV[4]] } });
  const lines = para(r);
  check(lines.length === 1 && lines[0] === "Tower catch still ahead.", "only a pending clause: capitalised short sentence, nothing dangling");
}

// booster result + ship pending only (no orbit/deploy/record)
{ const r = roadOf([], { hero_lines: { 15: [F15_OV[0], F15_OV[4]] } });
  const lines = para(r);
  check(lines.length === 1 && lines[0] === "Booster 22 skipped the tower catch and splashed down in the Gulf. Tower catch still ahead.", "booster result + pending only: two sentences, pending not left dangling");
}


// only booster outcomes
{ const r = roadOf([], { hero_lines: { 15: [F15_OV[0]] } });
  const lines = para(r);
  check(lines.length === 1 && lines[0] === BOOST_ONLY, "only booster outcomes: exact booster sentence");
}

// only ship outcomes
{ const r = roadOf([], { hero_lines: { 15: F15_OV.filter((e) => e.stage === "ship") } });
  const lines = para(r);
  check(lines.length === 1 && lines[0] === SHIP_ONLY, "only ship outcomes: exact ship paragraph with pending ending");
}

// booster result + ship pending (full F15 target via override)
{ const r = roadOf([], { hero_lines: { 15: F15_OV } });
  const lines = para(r);
  check(lines.length === 1 && lines[0] === F15, "booster result + ship pending: exact F15 target paragraph");
}

// no outcomes at all
{ const r = roadOf([]);
  const lines = para(r);
  check(lines.length === 0, "no outcomes at all: render nothing, no empty paragraph");
}

// pre-launch: nothing
{ const r = JSON.parse(JSON.stringify(live));
  const pre = Date.parse("2026-11-13T20:00:00Z");
  const lines = H.heroMissionLines(r, 15, { n: 15, status: "confirmed" }, pre);
  check(lines.length === 0, "pre-launch: nothing");
}

// deploy detected from feed_items, satellites always 'deployed'
{ const r = { flight: 15, vehicles: ["S42", "B22"], mission_updates: { 15: [] }, feed_items: [
    { id: "dep", flight: 15, box: "pad", at: "2026-11-14T00:06:57.000Z", body: "Ship 42 released twenty six V3 Starlink satellites and closed its payload bay door." }
  ] };
  const lines = para(r);
  check(lines.length === 1 && lines[0] === "Ship 42 deployed 26 Starlink V3 satellites.", "deploy result is detected from feed_items; always 'deployed'");
}

// auto pending + booster result compose (no override)
{ const r = roadOf([
    at("Booster 22 aborted landing attempt due to GNC issue leading to splashdown (Dan Huot, 14 Nov).", "2026-11-14T05:42:58.000Z", "landing"),
    at("Starship continues in orbit with healthy heatshield ahead of planned catch (SpaceX, 14 Nov).", "2026-11-14T05:44:58.000Z", "catch"),
  ]);
  const lines = para(r);
  check(lines.length === 1 && lines[0] === "Booster 22 skipped the tower catch and splashed down in the Gulf, while Ship 42 reached orbit. Tower catch still ahead.", "auto compose: booster result + ship orbit/pending, no sources or dates");
}

// aims-to / passed-point / commentary dropped; record kept
{ const r = roadOf([
    at("Starship Flight 15 aims to complete the first full mission profile (NSF reports, 12 Nov).", "2026-11-12T01:30:37.000Z", "objectives"),
    at("Ship 42 passed S41 landing burn point in flight (Blobifie, 14 Nov).", "2026-11-14T03:00:00.000Z", "trajectory"),
    at("SpaceX explained why Super Heavy booster on Flight 15 was not recovered (Dan Huot, 14 Nov).", "2026-11-14T06:39:36.000Z", "landing"),
    at("Flight 15 sets record for longest Starship flight time (NSF reports, 14 Nov).", "2026-11-14T07:00:00.000Z", "trajectory"),
  ]);
  const lines = para(r);
  check(lines.length === 1 && lines[0] === "Ship 42 is now flying the longest Starship mission ever.", "aims to, passed-point and commentary are dropped; record is composed");
}

// override pending replaced by auto confirmed result — three variants
function withResult(sourceLine) {
  return roadOf([at(sourceLine, "2026-11-14T10:00:00.000Z", "catch")], { hero_lines: { 15: F15_OV } });
}
{ const lines = para(withResult("Ship 42 was caught at the tower (SpaceX, 14 Nov)."));
  check(lines.length === 1 && lines[0] === F15_CAUGHT, "confirmed ship result: caught by the tower (pending override replaced, past tense)");
}
{ const lines = para(withResult("Ship 42 splashed down in the Indian Ocean (SpaceX, 14 Nov)."));
  check(lines.length === 1 && lines[0] === F15_OCEAN, "confirmed ship result: Indian Ocean splashdown");
}
{ const lines = para(withResult("Ship 42 was lost during reentry (SpaceX, 14 Nov)."));
  check(lines.length === 1 && lines[0] === F15_LOST, "confirmed ship result: lost during reentry");
}

// override wins (exact owner wording) while no auto ship result
{ const r = roadOf([
    at("Booster 22 aborted landing attempt due to GNC issue leading to splashdown (Dan Huot, 14 Nov).", "2026-11-14T05:42:58.000Z", "landing"),
    at("Starship continues in orbit with healthy heatshield ahead of planned catch (SpaceX, 14 Nov).", "2026-11-14T05:44:58.000Z", "catch"),
  ], { hero_lines: { 15: F15_OV } });
  const lines = para(r);
  check(lines.length === 1 && lines[0] === F15, "override wins with the owner's exact F15 paragraph while the ship result is still pending");
}

// live F15
const f15 = H.heroMissionLines(live, 15, { n: 15, status: "inflight" }, POST);
console.log("F15_RENDERED_PARAGRAPH", JSON.stringify(f15));
check(f15.length === 1 && f15[0] === F15, "F15: exactly the owner target paragraph");
check(H.heroSourceLines(live, 15).some((u) => /deployed twenty six V3 Starlink/i.test(u.line)), "F15: the deploy line is among the auto sources");

const body = (n) => { const a = app.indexOf(`function ${n}(`); return app.slice(a, app.indexOf("\nfunction ", a + 10)); };
const nf = body("NextFlightCard");
check(/heroMissionLines\(road, f\.n, f, now\)/.test(nf) && !/auto-note/.test(nf) && !/Auto-updating/.test(nf), "NextFlightCard renders heroMissionLines and no auto-updating line");
check(/setInterval\(load, LD \? 1000 : 15000\)/.test(app), "LL2 polling timer is unchanged");
check(/overflow-wrap:\s*break-word/.test(app), "hero paragraph wraps with overflow-wrap");

console.log(fails ? `\n${fails} FAILED` : "\n✅ All hero-line checks passed.");
process.exit(fails ? 1 : 0);
