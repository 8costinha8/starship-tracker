// Category colours must be visible on the app's dark surfaces: WCAG contrast ratio of at least 3:1 (non-text UI,
// WCAG 1.4.11) against the Road card (#10151F), the Page 2 section (#161C2C), the page (#0D111D) and the hero card
// (#222D46). A category may instead pass through an outline: Raptor engines keeps its near-black #0E0F11 (option A2,
// 25 Oct) and may use an inside-the-dot outline (same size as every other dot); a ring
// (composited on each surface) must reach 3:1. A hard outer box-shadow ring (0 0 0) is refused: it makes the dot look bigger.
// Raptor C4 (24 Nov 18:28 UK): no inset ring; visibility is a soft glow (blur > 0). The glow's alpha and colour are
// intentional and do not reach 3:1; the 10×10 size is unchanged.
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
const c4full = /\.dot\.dot-done\[data-cat="raptor"\][^}]*background: #0E0F11;[^}]*border-color: #0E0F11 !important;[^}]*box-shadow: 0 0 3px rgba\(226,232,240,\.35\), 0 0 10px 1px rgba\(74,80,89,\.9\)/.test(app);
const c4half = /\.dot\.dot-progress\[data-cat="raptor"\][^}]*background: linear-gradient\(90deg,#0E0F11 50%,transparent 50%\);[^}]*border-color: #000 !important;[^}]*box-shadow: 0 0 8px rgba\(201,206,214,\.35\)/.test(app);
const c4empty = /\.dot\[data-cat="raptor"\] \{ background: transparent; border-color: #000 !important; box-shadow: 0 0 8px rgba\(201,206,214,\.35\); \}/.test(app);
const c4 = c4full && c4half && c4empty;
check(c4, "Raptor C4 CSS (index4.py): full #0E0F11 + 3px/10px halo, half/empty #000 + 8px rgba(201,206,214,.35), no inset ring");
check(!OUTLINE.raptor && !/data-cat="raptor"[^}]*rgba\(255,\s*255,\s*255,\s*\.4\)/.test(app) && !/data-cat="raptor"[^}]*0 0 8px #E2E8F0/.test(app), "v6 Raptor inset ring and opaque #E2E8F0 glow are gone");
const sets = [["road.json", Object.fromEntries(road.categories.map((c) => [c.id, c.color]))], ["PAST_COLOR", past],
  ["check-road BOXES", Object.fromEntries([...rc.matchAll(/\{ id: "(\w+)", icon: "[^"]*", name: "[^"]*", color: "(#[0-9A-Fa-f]{6})"/g)].map((m) => [m[1], m[2]]))]];
for (const [name, cols] of sets) {
  check(Object.keys(cols).length >= 6, `${name}: ${Object.keys(cols).length} category colours found`);
  for (const [id, c] of Object.entries(cols)) {
    if (id === "raptor") { check(c4, `${name} raptor ${c}: C4 soft glow (no inset ring; glow alpha/colour are intentional, size unchanged)`); continue; }
    const fill = Math.min(...Object.values(BGS).map((b) => ratio(hex(c), hex(b))));
    const ol = OUTLINE[id] ? Math.min(...Object.values(BGS).map((b) => ratio(over(OUTLINE[id].rgb, OUTLINE[id].a, hex(b)), hex(b)))) : 0;
    check(fill >= 3 || ol >= 3, `${name} ${id} ${c}: ${fill >= 3 ? `colour ${fill.toFixed(2)}:1` : `colour ${fill.toFixed(2)}:1, outline ${ol.toFixed(2)}:1`} ≥ 3:1 on every surface`);
  }
}
console.log(`\n${n - fails}/${n} checks passed`); process.exit(fails ? 1 : 0);
