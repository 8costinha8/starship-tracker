// Hero status lines (tracker-2026-11-14-herotrim). Display-only filter in app.js.
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
const H = eval(`(() => {\n${app.slice(start, end)}\nreturn { stripHeroCredit, cleanHeroNote, isDroppedHeroLine, isPendingAttempt, isStageResult, isNonStageResult, heroLineStage, heroLineKind, heroMissionLines }; })()`);

const NOTE = "Second Starship flight to deploy satellites (a group of Starlink satellites known as Starlink Group 31-2) into stable Low Earth Orbit and first ever to attempt returning the Starship 2nd stage back to the launch site.";
check(H.cleanHeroNote(NOTE) === "Second Starship flight to deploy satellites into stable Low Earth Orbit and first ever to attempt returning the Starship 2nd stage back to the launch site.", "note: Starlink Group 31-2 parenthetical is stripped and spacing is cleaned");
check(!/\(/.test(H.cleanHeroNote(NOTE)), "cleaned note has no leftover parenthesis");
check(H.stripHeroCredit("Booster 22 performed landing burn and splashdown (SpaceX, 14 Nov).") === "Booster 22 performed landing burn and splashdown.", "source/date suffix is stripped from a hero line");

const at = (line, iso, topic) => ({ topic: topic || "x", line, at: iso, post_id: iso });
const roadOf = (lines, extra) => ({ flight: 15, mission_updates: { 15: lines }, ...(extra || {}) });

// pending shown
{ const r = roadOf([
    at("SpaceX still plans to attempt the Ship 42 tower catch (SpaceX, 14 Nov).", "2026-11-14T05:00:00.000Z", "catch"),
  ]);
  const lines = H.heroMissionLines(r, 15);
  check(lines.length === 1 && lines[0] === "SpaceX still plans to attempt the Ship 42 tower catch.", "pending shown: ship catch plan, no source or date");
}

// pending replaced by result
{ const r = roadOf([
    at("Booster 22 to attempt soft landing on Flight 15 (LabPadre, 14 Nov).", "2026-11-14T00:10:00.000Z", "landing"),
    at("Booster 22 aborted landing attempt due to GNC issue leading to splashdown (Dan Huot, 14 Nov).", "2026-11-14T05:42:58.000Z", "landing"),
  ]);
  const lines = H.heroMissionLines(r, 15);
  check(lines.length === 1 && lines[0] === "Booster 22 aborted landing attempt due to GNC issue leading to splashdown.", "pending replaced by result: only the booster result remains");
  check(!lines.some((l) => /to attempt soft landing/i.test(l)), "the old booster pending line is gone");
}

// dedupe of pending variants (latest wording wins)
{ const r = roadOf([
    at("Ship 42 will attempt a tower catch (NSF reports, 13 Nov).", "2026-11-13T12:00:00.000Z", "catch"),
    at("SpaceX still plans to attempt the Ship 42 tower catch (SpaceX, 14 Nov).", "2026-11-14T05:00:00.000Z", "catch"),
  ]);
  const lines = H.heroMissionLines(r, 15);
  check(lines.length === 1 && lines[0] === "SpaceX still plans to attempt the Ship 42 tower catch.", "dedupe pending variants: latest wording only");
}

// override wins
{ const r = roadOf([
    at("Booster 22 aborted landing attempt due to GNC issue leading to splashdown (Dan Huot, 14 Nov).", "2026-11-14T05:42:58.000Z", "landing"),
    at("Starship continues in orbit with healthy heatshield ahead of planned catch (SpaceX, 14 Nov).", "2026-11-14T05:44:58.000Z", "catch"),
  ], { hero_lines: { 15: { booster: "Booster 22 splashed down after a GNC abort.", ship: "SpaceX still plans to attempt the Ship 42 tower catch." } } });
  const lines = H.heroMissionLines(r, 15);
  check(lines[0] === "Booster 22 splashed down after a GNC abort." && lines[1] === "SpaceX still plans to attempt the Ship 42 tower catch.", "override wins over auto-selected booster and ship lines");
}

// drop aims-to / passed-point / commentary; keep non-stage results
{ const r = roadOf([
    at("Starship Flight 15 aims to complete the first full mission profile (NSF reports, 12 Nov).", "2026-11-12T01:30:37.000Z", "objectives"),
    at("Ship 42 passed S41 landing burn point in flight (Blobifie, 14 Nov).", "2026-11-14T03:00:00.000Z", "trajectory"),
    at("SpaceX explained why Super Heavy booster on Flight 15 was not recovered (Dan Huot, 14 Nov).", "2026-11-14T06:39:36.000Z", "landing"),
    at("Flight 15 sets record for longest Starship flight time (NSF reports, 14 Nov).", "2026-11-14T07:00:00.000Z", "trajectory"),
  ]);
  const lines = H.heroMissionLines(r, 15);
  check(lines.length === 1 && lines[0] === "Flight 15 sets record for longest Starship flight time.", "aims to, passed-point and commentary are dropped; record line is kept");
}

// pre-launch clock hides post-liftoff lines
{ const r = JSON.parse(JSON.stringify(live));
  const pre = Date.parse("2026-11-13T20:00:00Z");
  const lines = H.heroMissionLines(r, 15, { n: 15, status: "confirmed" }, pre);
  check(lines.length === 0, "pre-launch: post-liftoff result/pending lines are hidden");
}

// live F15 list
const f15 = H.heroMissionLines(live, 15);
console.log("F15_RENDERED_LINES", JSON.stringify(f15, null, 2));
check(f15.includes("Booster 22 aborted landing attempt due to GNC issue leading to splashdown."), "F15: booster result is shown");
check(f15.includes("Starship continues in orbit with healthy heatshield ahead of planned catch."), "F15: ship pending catch line is shown");
check(f15.includes("Ship 42 completed its 7th orbit and surpassed Ship 41 mission duration."), "F15: orbit/record non-stage result is shown");
check(!f15.some((l) => /aims to|explained why|to attempt soft landing|\(\d{1,2} Nov\)/i.test(l)), "F15: dropped lines and source/date suffixes are gone");
check(f15.length === 3, "F15: exactly three hero lines");

const body = (n) => { const a = app.indexOf(`function ${n}(`); return app.slice(a, app.indexOf("\nfunction ", a + 10)); };
const nf = body("NextFlightCard");
check(/heroMissionLines\(road, f\.n, f, now\)/.test(nf) && !/auto-note/.test(nf) && !/Auto-updating/.test(nf), "NextFlightCard renders heroMissionLines and no auto-updating line");
check(/setInterval\(load, LD \? 1000 : 15000\)/.test(app), "LL2 polling timer is unchanged");

console.log(fails ? `\n${fails} FAILED` : "\n✅ All hero-line checks passed.");
process.exit(fails ? 1 : 0);
