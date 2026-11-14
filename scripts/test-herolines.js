// Hero status lines (tracker-2026-11-14-herotrim / herowording). Display-only in app.js.
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
const H = eval(`(() => {\n${app.slice(start, end)}\nreturn { stripHeroCredit, cleanHeroNote, isDroppedHeroLine, isPendingAttempt, isStageResult, isNonStageResult, isPayloadDeploy, heroLineStage, heroLineKind, heroMissionLines, normalizeHeroLine, replaceNumberWords, heroSourceLines, parseHeroOverrides, mergeOrbitDeploy }; })()`);

const road = { flight: 15, vehicles: ["S42", "B22"] };
check(H.replaceNumberWords("twenty six") === "26" && H.replaceNumberWords("twenty-six") === "26", "number words: 'twenty six' / 'twenty-six' → 26");
check(H.normalizeHeroLine("Ship 42 released twenty six V3 Starlink satellites.", road) === "Ship 42 deployed 26 Starlink V3 satellites.", "released → deployed, twenty six → 26, V3 Starlink → Starlink V3");
check(H.normalizeHeroLine("Booster 22 aborted landing attempt due to GNC issue leading to splashdown (Dan Huot, 14 Nov).", road) === "Booster 22 didn't attempt the tower catch and splashed down in the Gulf.", "booster splashdown / abort normalises to the clean result form");
check(H.normalizeHeroLine("Starship continues in orbit with healthy heatshield ahead of planned catch (SpaceX, 14 Nov).", road) === "SpaceX still plans to attempt the Ship 42 tower catch.", "pending catch normalises to the SpaceX still-plans template");
check(H.normalizeHeroLine("Flight 15 sets record for longest Starship flight time (NSF reports, 14 Nov).", road) === "Ship 42 set a new record for the longest Starship flight.", "record line normalises to the clean record form");
check(H.normalizeHeroLine("Starship completed orbital insertion burn on Flight 15 (SpaceX, 13 Nov).", road) === "Ship 42 reached orbit.", "orbital insertion normalises to 'reached orbit'");
check(H.isPayloadDeploy("Ship 42 deployed twenty six V3 Starlink satellites and closed its payload bay door.") && !H.isPayloadDeploy("A batch of NOTAMs was released ahead of Flight 15."), "deploy detection is payload-only (not NOTAMs)");

const at = (line, iso, topic) => ({ topic: topic || "x", line, at: iso, post_id: iso });
const roadOf = (lines, extra) => ({ flight: 15, vehicles: ["S42", "B22"], mission_updates: { 15: lines }, ...(extra || {}) });
const POST = Date.parse("2026-11-14T09:30:00Z");

// pending shown
{ const r = roadOf([at("SpaceX still plans to attempt the Ship 42 tower catch (SpaceX, 14 Nov).", "2026-11-14T05:00:00.000Z", "catch")]);
  const lines = H.heroMissionLines(r, 15, { n: 15, status: "inflight" }, POST);
  check(lines.length === 1 && lines[0] === "SpaceX still plans to attempt the Ship 42 tower catch.", "pending shown: normalised ship catch plan, no source or date");
}

// pending replaced by result
{ const r = roadOf([
    at("Booster 22 to attempt soft landing on Flight 15 (LabPadre, 14 Nov).", "2026-11-14T00:10:00.000Z", "landing"),
    at("Booster 22 aborted landing attempt due to GNC issue leading to splashdown (Dan Huot, 14 Nov).", "2026-11-14T05:42:58.000Z", "landing"),
  ]);
  const lines = H.heroMissionLines(r, 15, { n: 15, status: "inflight" }, POST);
  check(lines.length === 1 && lines[0] === "Booster 22 didn't attempt the tower catch and splashed down in the Gulf.", "pending replaced by result: only the normalised booster result remains");
  check(!lines.some((l) => /to attempt soft landing|still plans/i.test(l)), "the old booster pending line is gone");
}

// dedupe of pending variants (latest wording, same template)
{ const r = roadOf([
    at("Ship 42 will attempt a tower catch (NSF reports, 13 Nov).", "2026-11-13T12:00:00.000Z", "catch"),
    at("SpaceX still plans to attempt the Ship 42 tower catch (SpaceX, 14 Nov).", "2026-11-14T05:00:00.000Z", "catch"),
  ]);
  const lines = H.heroMissionLines(r, 15, { n: 15, status: "inflight" }, POST);
  check(lines.length === 1 && lines[0] === "SpaceX still plans to attempt the Ship 42 tower catch.", "dedupe pending variants: one normalised catch plan");
}

// deploy detected from feed_items even when it is not a mission_update
{ const r = { flight: 15, vehicles: ["S42", "B22"], mission_updates: { 15: [] }, feed_items: [
    { id: "dep", flight: 15, box: "pad", at: "2026-11-14T00:06:57.000Z", body: "Ship 42 deployed twenty six V3 Starlink satellites and closed its payload bay door." }
  ] };
  const lines = H.heroMissionLines(r, 15, { n: 15, status: "inflight" }, POST);
  check(lines.includes("Ship 42 deployed 26 Starlink V3 satellites."), "deploy result is detected from feed_items and normalised");
}

// override pending replaced by auto result
{ const r = roadOf([
    at("Ship 42 was caught at the tower (SpaceX, 14 Nov).", "2026-11-14T10:00:00.000Z", "catch"),
  ], { hero_lines: { 15: [
    { stage: "ship", kind: "pending", line: "SpaceX still plans to attempt the Ship 42 tower catch." },
    { stage: "ship", kind: "other", line: "Ship 42 reached orbit and deployed 26 Starlink V3 satellites." }
  ] } });
  const lines = H.heroMissionLines(r, 15, { n: 15, status: "inflight" }, POST);
  check(lines.includes("Ship 42 was caught.") && !lines.some((l) => /still plans/i.test(l)), "override pending ship line is replaced once an automatic confirmed result exists");
  check(lines.includes("Ship 42 reached orbit and deployed 26 Starlink V3 satellites."), "other override lines are kept when the pending line is replaced");
}

// override wins (exact owner wording) while no auto ship result
{ const r = roadOf([
    at("Booster 22 aborted landing attempt due to GNC issue leading to splashdown (Dan Huot, 14 Nov).", "2026-11-14T05:42:58.000Z", "landing"),
    at("Starship continues in orbit with healthy heatshield ahead of planned catch (SpaceX, 14 Nov).", "2026-11-14T05:44:58.000Z", "catch"),
  ], { hero_lines: { 15: [
    { stage: "booster", kind: "result", line: "Booster 22 didn't attempt the tower catch and splashed down in the Gulf." },
    { stage: "ship", kind: "pending", line: "SpaceX still plans to attempt the Ship 42 tower catch." }
  ] } });
  const lines = H.heroMissionLines(r, 15, { n: 15, status: "inflight" }, POST);
  check(lines[0] === "Booster 22 didn't attempt the tower catch and splashed down in the Gulf." && lines[1] === "SpaceX still plans to attempt the Ship 42 tower catch.", "override wins with the owner's exact wording while the ship result is still pending");
}

// drop aims-to / passed-point / commentary; keep record
{ const r = roadOf([
    at("Starship Flight 15 aims to complete the first full mission profile (NSF reports, 12 Nov).", "2026-11-12T01:30:37.000Z", "objectives"),
    at("Ship 42 passed S41 landing burn point in flight (Blobifie, 14 Nov).", "2026-11-14T03:00:00.000Z", "trajectory"),
    at("SpaceX explained why Super Heavy booster on Flight 15 was not recovered (Dan Huot, 14 Nov).", "2026-11-14T06:39:36.000Z", "landing"),
    at("Flight 15 sets record for longest Starship flight time (NSF reports, 14 Nov).", "2026-11-14T07:00:00.000Z", "trajectory"),
  ]);
  const lines = H.heroMissionLines(r, 15, { n: 15, status: "inflight" }, POST);
  check(lines.length === 1 && lines[0] === "Ship 42 set a new record for the longest Starship flight.", "aims to, passed-point and commentary are dropped; record is normalised");
}

// pre-launch clock hides post-liftoff lines
{ const r = JSON.parse(JSON.stringify(live));
  const pre = Date.parse("2026-11-13T20:00:00Z");
  const lines = H.heroMissionLines(r, 15, { n: 15, status: "confirmed" }, pre);
  check(!lines.some((l) => /splashed down|reached orbit|deployed 26|set a new record/i.test(l)), "pre-launch: in-flight result overrides are hidden");
}

// live F15 list (owner override)
const F15 = [
  "Booster 22 didn't attempt the tower catch and splashed down in the Gulf.",
  "Ship 42 reached orbit and deployed 26 Starlink V3 satellites.",
  "Ship 42 set a new record for the longest Starship flight.",
  "SpaceX still plans to attempt the Ship 42 tower catch."
];
const f15 = H.heroMissionLines(live, 15, { n: 15, status: "inflight" }, POST);
console.log("F15_RENDERED_LINES", JSON.stringify(f15, null, 2));
check(JSON.stringify(f15) === JSON.stringify(F15), "F15: exactly the four owner hero lines, in order");
check(H.heroSourceLines(live, 15).some((u) => /deployed twenty six V3 Starlink/i.test(u.line)), "F15: the deploy line is among the auto sources");

const body = (n) => { const a = app.indexOf(`function ${n}(`); return app.slice(a, app.indexOf("\nfunction ", a + 10)); };
const nf = body("NextFlightCard");
check(/heroMissionLines\(road, f\.n, f, now\)/.test(nf) && !/auto-note/.test(nf) && !/Auto-updating/.test(nf), "NextFlightCard renders heroMissionLines and no auto-updating line");
check(/setInterval\(load, LD \? 1000 : 15000\)/.test(app), "LL2 polling timer is unchanged");

console.log(fails ? `\n${fails} FAILED` : "\n✅ All hero-line checks passed.");
process.exit(fails ? 1 : 0);
