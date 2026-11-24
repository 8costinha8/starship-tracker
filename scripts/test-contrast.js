// Category colours must be visible on the app's dark surfaces: WCAG contrast ratio of at least 3:1 (non-text UI,
// WCAG 1.4.11) against the Road card (#10151F), the Page 2 section (#161C2C), the page (#0D111D) and the hero card
// (#222D46). A category may instead pass through an outline: Raptor engines keeps its near-black #0E0F11 (option A2,
// 25 Oct) and its progress dot's own border is a light ring (drawn inside the dot, same size as every other dot); the ring
// (composited on each surface) must reach 3:1. An outer box-shadow is refused: it makes the dot look bigger.
//   node scripts/test-contrast.js
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const hex = (h) => { h = String(h).replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (rgb, a, bg) => rgb.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
const BGS = { card: "#10151F", section: "#161C2C", page: "#0D111D", hero: "#222D46" };
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const rc = fs.readFileSync(path.join(ROOT, "scripts/check-road.js"), "utf8");
const road = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const past = JSON.parse((app.match(/const PAST_COLOR = (\{[^\n]*\});/) || [])[1].replace(/(\w+):/g, '"$1":'));
// outlines: .dot[data-cat="<id>"] ... { border-color: rgba(r,g,b,a) } (inside the dot) or an inset box-shadow
const OUTLINE = {};
for (const m of app.matchAll(/\.dot\[data-cat="(\w+)"\][^{]*\{ (?:border-color: |box-shadow: inset 0 0 0 1px )rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/g)) OUTLINE[m[1]] = { rgb: [+m[2], +m[3], +m[4]], a: +m[5] };
check(!/\.dot\[data-cat="\w+"\][^{]*\{[^}]*box-shadow: 0 0 0 /.test(app), "no outer outline on any progress dot (it would make that dot look bigger)");
check(/data-cat=\{m\.id\} style=\{catVars\(m\.id, m\.color\)\}/.test(app), "progress dots carry data-cat so a category outline can apply");
const sets = [["road.json", Object.fromEntries(road.categories.map((c) => [c.id, c.color]))], ["PAST_COLOR", past],
  ["check-road BOXES", Object.fromEntries([...rc.matchAll(/\{ id: "(\w+)", icon: "[^"]*", name: "[^"]*", color: "(#[0-9A-Fa-f]{6})"/g)].map((m) => [m[1], m[2]]))]];
for (const [name, cols] of sets) {
  check(Object.keys(cols).length >= 6, `${name}: ${Object.keys(cols).length} category colours found`);
  for (const [id, c] of Object.entries(cols)) {
    const fill = Math.min(...Object.values(BGS).map((b) => ratio(hex(c), hex(b))));
    const ol = OUTLINE[id] ? Math.min(...Object.values(BGS).map((b) => ratio(over(OUTLINE[id].rgb, OUTLINE[id].a, hex(b)), hex(b)))) : 0;
    check(fill >= 3 || ol >= 3, `${name} ${id} ${c}: ${fill >= 3 ? `colour ${fill.toFixed(2)}:1` : `colour ${fill.toFixed(2)}:1, outline ${ol.toFixed(2)}:1`} ≥ 3:1 on every surface`);
  }
}
check(!!OUTLINE.raptor && OUTLINE.raptor.a <= 0.5, "Raptor's outline stays subtle (white at 50% or less)");
console.log(`\n${n - fails}/${n} checks passed`); process.exit(fails ? 1 : 0);
