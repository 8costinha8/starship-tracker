/* Offline: header page-switch (push 2b, tracker-2026-11-24-road-list-consistency).
   The header titles (.hdr-p) are positioned BY their transform: translate3d(calc(...--cx/--wa/--wb/--fp...)) scale(var(--s)).
   Any CSS that sets `transform` on .hdr-p itself in a press state replaces that position (bug: scale(.9) sent the tapped
   title to x=0, over the menu button, then slid it back; group off-centre ~0.5s). Static CSS checks; the live 390x844
   start/mid/end capture is scripts/render-check-header.py (needs headless Chrome, so it is not in this runner).
   node scripts/test-header-press.js */
const fs = require("fs"), path = require("path");
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
let fails = 0; const ok = (c, m) => { console.log((c ? "✅ " : "❌ ") + m); if (!c) fails++; };
// every CSS rule whose selector list hits .hdr-p (the element itself, not a child) and that sets transform
const rules = [...app.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(), body: m[2] }));
const selfHit = (sel) => sel.split(",").some((s) => /\.hdr-p(?![\w-])(?![^\s>+~]*\s*[>+~\s]\s*[\w.*\[])/.test(s.trim()) && /:active|is-pressed|:hover|:focus/.test(s));
const bad = rules.filter((r) => selfHit(r.sel) && /(^|[;\s])transform\s*:/.test(r.body));
ok(bad.length === 0, "no press/hover/focus rule sets transform on .hdr-p itself" + (bad.length ? " — found: " + bad.map((r) => r.sel).join(" | ") : ""));
ok(/\.hdr-p:active > b, \.hdr-p:active > span \{ transform: scale\(\.92\)/.test(app) && /\.hdr-p\.is-pressed > b, \.hdr-p\.is-pressed > span \{ transform: scale\(\.92\)/.test(app), "press feedback on the header titles is on their label lines (b/span), both :active and .is-pressed");
ok(/\.round-btn\.is-pressed \{ transform: scale\(\.9\); \}/.test(app) && /\.round-btn:active \{ transform: scale\(\.9\) !important/.test(app), "round buttons keep their press feedback");
// menu/back icon crossfade: at any --fp at least one icon is >= .5 visible
const ia = app.match(/\.hdr-ic-a \{ opacity: calc\(([\d.]+) - var\(--fp\) \* ([\d.]+)\); \}/), ib = app.match(/\.hdr-ic-b \{ opacity: calc\(var\(--fp\) \* ([\d.]+) - ([\d.]+)\); \}/);
ok(!!(ia && ib), "menu/back icon opacities are linear in --fp");
if (ia && ib) { let min = 1; for (let i = 0; i <= 100; i++) { const fp = i / 100, cl = (v) => Math.max(0, Math.min(1, v)); min = Math.min(min, Math.max(cl(+ia[1] - fp * +ia[2]), cl(fp * +ib[1] - +ib[2]))); }
  ok(min >= 0.5, `the button always shows an icon mid-swipe (min visible opacity ${min.toFixed(2)} ≥ .5)`);
  const cl = (v) => Math.max(0, Math.min(1, v)); ok(cl(+ia[1]) === 1 && cl(-+ib[2]) === 0 && cl(+ia[1] - +ia[2]) === 0 && cl(+ib[1] - +ib[2]) === 1, "menu icon only at --fp 0, back icon only at --fp 1"); }
ok(/\.hdr-a \{ --act: calc\(1 - var\(--fp\)\)/.test(app) && /\.hdr-b \{ --act: var\(--fp\)/.test(app) && /className="hdr-p hdr-a"[\s\S]{0,400}className="hdr-p hdr-b"/.test(app), "fixed order in the DOM: Flight Log title (hdr-a) before Road title (hdr-b)");
console.log(fails ? `❌ ${fails} failed` : "✅ header press checks pass"); process.exit(fails ? 1 : 0);
