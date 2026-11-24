#!/usr/bin/env python3
"""Progress-dot size render-check (headless Chrome, iPhone UA, touch) at 320 / 360 / 390 x 844.
Not part of run-tests.js (the runner is node-only and offline; this needs a browser).
Usage: python3 scripts/render-check-dots.py [site_root_or_URL] [shot_prefix]
Page 1 (hero Road pill) and Page 2 (every flight's pill): for every .road-dots row it measures each dot's RENDERED size:
the border box plus any hard outer box-shadow ring (spread + offset, blur 0: an outer outline draws outside the box and
makes a dot look bigger; a soft glow — including Raptor C4's 1px-spread halo, because its blur is > 0 — is not counted).
Every COMPLETE dot (dot-done / dot-complete) must glow (a soft outer box-shadow or a filter). Other categories: the glow
colour must reach 3:1 on navy. Raptor C4 (24 Nov 18:28 UK, index4.py): the glow alpha/colour change is intentional and
does not reach 3:1; FULL is #0E0F11 fill/border + 0 0 3px rgba(226,232,240,.35), 0 0 10px 1px rgba(74,80,89,.9); HALF and
EMPTY are border #000 + 0 0 8px rgba(201,206,214,.35); no inset ring. Asserts every dot in a row, Raptor included, has
the same rendered width and height (+-0.01px) and the box is square. Prints the sizes. Exit 1 on any failure."""
import sys, os, threading, json, re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[2] if len(sys.argv) > 2 else None
if SRC.startswith("http"): URL = SRC
else:
    class H(SimpleHTTPRequestHandler):
        def __init__(s, *a, **k): super().__init__(*a, directory=SRC, **k)
        def log_message(s, *a): pass
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=httpd.serve_forever, daemon=True).start()
    URL = f"http://127.0.0.1:{httpd.server_address[1]}/index.html"
SEP = "&" if "?" in URL else "?"
DISMISS = "() => { const q=document.querySelector('.notify-btn-quiet'); if(q) q.click(); const st=document.createElement('style'); st.textContent='.notify-modal{display:none!important}'; document.head.appendChild(st); }"
MEASURE = """() => [...document.querySelectorAll('.road-dots')].filter(r => r.getClientRects().length).map((row, ri) => {
  const where = row.closest('.road-head') ? 'page1-road' : row.closest('.feed-pill') ? 'page2-pill' : row.closest('.past-toggle') ? 'past' : 'other';
  return { where, ri, dots: [...row.querySelectorAll('.dot')].map(d => { const b = d.getBoundingClientRect(), cs = getComputedStyle(d);
    let out = 0; // outer box-shadow extent (spread + blur + |offset|), inset shadows draw inside
    for (const sh of (cs.boxShadow === 'none' ? [] : cs.boxShadow.split(/,(?![^(]*\\))/))) { if (/\\binset\\b/.test(sh)) continue;
      const n = (sh.replace(/rgba?\\([^)]*\\)/g, '').match(/-?[\\d.]+px/g) || []).map(parseFloat); const [x = 0, y = 0, blur = 0, spread = 0] = n; if (blur > 0) continue; /* a soft glow (done dots) is not a ring */ out = Math.max(out, spread + Math.max(Math.abs(x), Math.abs(y))); }
    const glows = (cs.boxShadow === 'none' ? [] : cs.boxShadow.split(/,(?![^(]*\\))/)).filter(sh => !/\\binset\\b/.test(sh)).map(sh => { const n = (sh.replace(/rgba?\\([^)]*\\)/g, '').match(/-?[\\d.]+px/g) || []).map(parseFloat); const c = (sh.match(/rgba?\\([^)]*\\)/) || [''])[0]; return { blur: n[2] || 0, color: c }; }).filter(g => g.blur > 0);
    const done = d.classList.contains('dot-done') || d.classList.contains('dot-complete');
    const progress = d.classList.contains('dot-progress');
    return { done, progress, glows, filter: cs.filter, shadow: cs.boxShadow, bg: cs.backgroundImage, cat: d.dataset.cat || null, w: b.width, h: b.height, rw: b.width + 2 * out, rh: b.height + 2 * out, outer: out, ring: cs.borderTopColor, fill: cs.backgroundColor, bw: cs.borderTopWidth }; }) }; })"""
def _lum(r, g, b):
    f = lambda c: (c / 255) / 12.92 if c / 255 <= 0.04045 else (((c / 255) + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
BG = (11, 16, 32)
def glow_reads(color):
    m = re.match(r"rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)", color or "")
    if not m: return False
    r, g, b = (float(m.group(i)) for i in (1, 2, 3)); a = float(m.group(4)) if m.group(4) else 1.0
    if a <= 0: return False
    c = tuple(a * x + (1 - a) * y for x, y in zip((r, g, b), BG)); l1, l2 = sorted((_lum(*c), _lum(*BG)), reverse=True)
    return (l1 + 0.05) / (l2 + 0.05) >= 3.0
fails = []; report = {}
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    for W in (320, 360, 390):
        for page, q in (("p1", ""), ("p2", "feed=1")):
            ctx = br.new_context(viewport={"width": W, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True,
                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")
            pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(URL + (SEP + q if q else ""), wait_until="domcontentloaded", timeout=60000); pg.wait_for_timeout(3500); pg.evaluate(DISMISS); pg.wait_for_timeout(600)
            rows = pg.evaluate(MEASURE)
            if not rows: fails.append(f"{W} {page}: no progress dots found")
            for r in rows:
                ds = r["dots"]; tag = f"{W} {page} {r['where']}#{r['ri']}"
                sizes = sorted({(round(d["rw"], 2), round(d["rh"], 2)) for d in ds})
                rap = [d for d in ds if d["cat"] == "raptor"]
                report[tag] = {"sizes": sizes, "raptor": [(round(d["rw"], 2), round(d["rh"], 2), d["ring"], d["fill"]) for d in rap], "n": len(ds)}
                if len(sizes) != 1: fails.append(f"{tag}: dots differ in rendered size {sizes} " + json.dumps([(d['cat'], round(d['rw'], 2), round(d['rh'], 2)) for d in ds]))
                if any(abs(d["rw"] - d["rh"]) > 0.01 for d in ds): fails.append(f"{tag}: a dot is not round (w != h)")
                # C4 (24 Nov): Raptor has no inset ring. FULL fill+border are #0E0F11; HALF/EMPTY border is #000.
                # Visibility is the soft glow. Size stays equal (blur > 0 is not counted as a hard ring).
                C4_FULL = re.compile(r"rgba\(\s*226,\s*232,\s*240,\s*0\.35\s*\)\s*0px\s+0px\s+3px(?:\s+0px)?\s*,\s*rgba\(\s*74,\s*80,\s*89,\s*0\.9\s*\)\s*0px\s+0px\s+10px\s+1px")
                C4_SOFT = re.compile(r"rgba\(\s*201,\s*206,\s*214,\s*0\.35\s*\)\s*0px\s+0px\s+8px")
                def _flat(x): return re.sub(r"\s", "", x or "")
                for d in rap:
                    sh = d.get("shadow") or ""
                    if "inset" in sh: fails.append(f"{tag}: Raptor C4 must not have an inset ring (box-shadow {sh})")
                    if d["done"]:
                        if _flat(d["ring"]) != "rgb(14,15,17)" or _flat(d["fill"]) != "rgb(14,15,17)": fails.append(f"{tag}: Raptor FULL fill/border should be #0E0F11, got ring {d['ring']} fill {d['fill']}")
                        if not C4_FULL.search(sh): fails.append(f"{tag}: Raptor FULL glow is not C4 (got {sh})")
                    elif d.get("progress"):
                        if "linear-gradient" not in (d.get("bg") or ""): fails.append(f"{tag}: Raptor HALF should use a 50% linear-gradient, got {d.get('bg')}")
                        if _flat(d["ring"]) not in ("rgb(0,0,0)", "rgba(0,0,0,1)"): fails.append(f"{tag}: Raptor HALF border should be #000, got {d['ring']}")
                        if not C4_SOFT.search(sh): fails.append(f"{tag}: Raptor HALF glow is not C4 (got {sh})")
                    else:
                        if not re.search(r"rgba\(\s*0,\s*0,\s*0,\s*0\s*\)", d["fill"] or ""): fails.append(f"{tag}: Raptor EMPTY fill should be transparent, got {d['fill']}")
                        if _flat(d["ring"]) not in ("rgb(0,0,0)", "rgba(0,0,0,1)"): fails.append(f"{tag}: Raptor EMPTY border should be #000, got {d['ring']}")
                        if not C4_SOFT.search(sh): fails.append(f"{tag}: Raptor EMPTY glow is not C4 (got {sh})")
                # every COMPLETE dot glows. Other categories: colour must read at 3:1 on navy. Raptor C4: glow
                # alpha/colour are intentional (below 3:1); still fail on none / transparent / alpha 0.
                for d in ds:
                    if not d["done"]: continue
                    gl = [g for g in d["glows"] if glow_reads(g["color"])]
                    has_filter = d["filter"] not in ("none", "", None) and "transparent" not in d["filter"] and not re.search(r"rgba\([^)]*,\s*0\)", d["filter"])
                    if not d["glows"] and not has_filter: fails.append(f"{tag}: complete {d['cat']} dot: box-shadow and filter are none (no glow)")
                    for g in d["glows"]:
                        if g["color"] in ("", "transparent") or re.search(r"rgba\([^)]*,\s*0\)$", g["color"]): fails.append(f"{tag}: complete {d['cat']} dot: glow colour {g['color'] or 'transparent'} has alpha 0")
                    report[tag].setdefault("glow", []).append((d["cat"], d["glows"][0]["color"] if d["glows"] else d["filter"]))
                    if d["cat"] == "raptor":
                        if not d["glows"] and not has_filter: fails.append(f"{tag}: complete Raptor C4 has no glow (box-shadow {d.get('shadow') or 'none'})")
                    elif not gl and not has_filter:
                        fails.append(f"{tag}: complete {d['cat']} dot has no visible glow (box-shadow {d['glows'] or 'none'}, filter {d['filter']})")
                if OUT and W == 390 and rap:
                    row = pg.locator(".road-dots").nth(r["ri"])
                    try: row.screenshot(path=f"{OUT}-{page}-dots{r['ri']}-390.png")
                    except Exception: pass
            if errs: fails.append(f"{W} {page}: JS errors {errs[:2]}")
            ctx.close()
    br.close()
for k, v in report.items(): print(f"{k}: {v['n']} dots, rendered {v['sizes']}" + (f", raptor {v['raptor']}" if v['raptor'] else "") + (f", complete glows {v['glow']}" if v.get('glow') else ""))
print("dots render-check:", "PASS" if not fails else "FAIL")
for f in fails: print("  FAIL", f)
sys.exit(1 if fails else 0)
