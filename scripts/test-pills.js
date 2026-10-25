// Road to Flight N: every status pill shares the widest pill's width (--pill-w), live.
// Code checks always run; the 390px browser check runs when playwright + Chrome are available (set PLAYWRIGHT_PATH to a node_modules/playwright dir).
const fs = require("fs"), path = require("path"), http = require("http");
const root = path.join(__dirname, ".."), app = fs.readFileSync(path.join(root, "app.js"), "utf8");
let pass = 0, fail = 0; const check = (ok, msg) => { ok ? pass++ : fail++; console.log((ok ? "✅ " : "❌ ") + msg); };
check(/\.badge-stack \{ display: inline-grid;/.test(app) && /\.badge-stack > span \{ grid-area: 1 \/ 1;/.test(app) && /\.badge-ghost \{ visibility: hidden; \}/.test(app), "pure CSS: every pill stacks all the card's labels in one grid cell (widest sets the width)");
check(/pillLabels = \[\.\.\.new Set\(items\.map\(label\)\)\]/.test(app) && !/--pill-w/.test(app) && !/min-width: var\(/.test(app), "no JS measuring and no min-width hack left");
check(/\.road \.callout-head \.badge \{[^}]*box-sizing: border-box;[^}]*border-width: 1\.5px;/.test(app), "same border width on every pill (filled, outline, dotted, Raptor)");
(async () => {
  let pw = null; try { pw = require(process.env.PLAYWRIGHT_PATH || "playwright"); } catch (e) {}
  const chrome = process.env.CHROME || "/usr/bin/google-chrome";
  if (!pw || !fs.existsSync(chrome)) { console.log("(browser check skipped: no playwright/Chrome)"); return done(); }
  const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
  const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split("?")[0])); if (f.endsWith("/")) f += "index.html";
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); r.end(d); }); });
  await new Promise((ok) => srv.listen(0, ok));
  const b = await pw.chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
  try {
    const url = process.env.PILLS_URL || `http://localhost:${srv.address().port}/`;
    for (const W of [360, 390, 430]) {
      const pg = await (await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 3 })).newPage();
      await pg.goto(url, { waitUntil: "networkidle" });
      await pg.waitForSelector(".road-head", { state: "attached", timeout: 30000 });
      await pg.evaluate(() => document.fonts && document.fonts.ready);
      await pg.evaluate(() => { const h = document.querySelector(".road-head"); if (h.getAttribute("aria-expanded") !== "true") h.click(); }); await pg.waitForTimeout(1500); // the box expanded, as the user sees it
      const r = await pg.evaluate(() => [...document.querySelectorAll(".road .callout-head .badge")].map((e) => { const b = e.getBoundingClientRect(), h = e.closest(".callout-head").getBoundingClientRect();
        return { t: e.querySelector(".badge-txt").textContent, w: b.width, h: b.height, right: b.right, hr: h.right, vis: b.width > 0 }; }));
      const ws = r.map((x) => x.w);
      console.log(`   ${W}px: ${r.map((x) => `${x.t}=${x.w.toFixed(2)}`).join(", ")}`);
      check(r.length >= 3 && r.every((x) => x.vis) && Math.max(...ws) - Math.min(...ws) <= 1, `${W}px expanded: all ${r.length} pills equal within 1px (${Math.min(...ws).toFixed(2)}–${Math.max(...ws).toFixed(2)})`);
      check(r.every((x) => x.h < 30 && x.right <= x.hr + 0.5), `${W}px: no pill wraps or overflows its card`);
      if (W === 390 && !process.env.PILLS_URL) { // live: a longer label → every pill follows, no script
        const live = await pg.evaluate(async () => { document.querySelectorAll(".road .badge-txt")[0].textContent = "Confirmed again"; document.querySelectorAll(".road .badge-stack").forEach((s) => { const g = document.createElement("span"); g.className = "badge-ghost"; g.textContent = "Confirmed again"; s.prepend(g); });
          await new Promise((ok) => setTimeout(ok, 300)); return [...document.querySelectorAll(".road .callout-head .badge")].map((e) => e.getBoundingClientRect().width); });
        check(Math.max(...live) - Math.min(...live) <= 1 && Math.max(...live) > Math.max(...ws) + 5, "a longer label widens every pill (CSS only)");
      }
      if (process.env.SHOT && W === 390) await pg.screenshot({ path: process.env.SHOT });
      await pg.context().close();
    }
  } finally { await b.close(); srv.close(); }
  done();
})().catch((e) => { check(false, "browser check crashed: " + e.message); done(); });
function done() { console.log(`\n${pass}/${pass + fail} checks passed`); process.exit(fail ? 1 : 0); }
