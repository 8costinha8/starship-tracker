# UI test for the Road vehicle cards against the local preview (http://localhost:8765). No pushes, no network writes.
import json, copy, sys
from playwright.sync_api import sync_playwright
base = json.load(open('/workspace/push-sync/v2/road.json')); fails = 0; n = 0
def check(ok, m):
    global fails, n; n += 1; fails += (not ok); print(('✅ ' if ok else '❌ ') + m)
def variant(kind):
    r = copy.deepcopy(base); c = next(x for x in r['categories'] if x['id'] == 'cryo'); s42 = c['history'][2]
    if kind == 'one':  # S42 back to an unfinished state (fresh test today): only B22 done
        s42.update(text="Ship 42 is in cryo testing at Massey's.", x_text="Ship 42 is in cryo testing at Massey's.", at=r['updatedAt'], date='23 Oct'); s42.pop('assumed', None)
        s42['milestone']['phase'] = 'progress'; s42.pop('complete', None); s42['updates'] = [u for u in s42['updates'] if 'complete' not in u['text']]; c['latest'] = "Ship 42 is in cryo testing at Massey's."
    if kind == 'newrun':
        s42['updates'] = [{'date': s42['date'], 'at': s42['at'], 'text': s42['text'], 'tier': 2}] + s42['updates']
        s42.update(text="Ship 42 heads back to Massey's for another cryo test.", x_text="Ship 42 heads back to Massey's for another cryo test.", date='22 Oct', at='2026-10-22T12:00:00Z'); s42.pop('assumed', None); s42.setdefault('milestone', {})['phase'] = 'progress'
    if kind == 'append':
        s42['updates'] = [{'date': s42['date'], 'at': s42['at'], 'text': s42['text'], 'tier': 2}] + s42['updates']
        s42.update(text="Ship 42 rolled back to Mega Bay 2.", x_text="Ship 42 rolled back to Mega Bay 2.", date='11 Oct', at='2026-10-11T12:00:00Z')
    return r
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    def load(kind):
        ctx = b.new_context(viewport={'width': 390, 'height': 844}); ctx.add_init_script("try{localStorage.setItem('st_notify_decided','1')}catch(e){}")
        pg = ctx.new_page(); data = json.dumps(variant(kind))
        pg.route('**/road.json*', lambda rt: rt.fulfill(status=200, content_type='application/json', body=data))
        pg.goto('http://localhost:8765/', wait_until='load'); pg.wait_for_selector('.road', timeout=30000); pg.wait_for_timeout(1500)
        for t in ['text=Not now', 'text=No thanks', 'text=Maybe later']:
            if pg.locator(t).count(): pg.locator(t).first.click(); pg.wait_for_timeout(300)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        return ctx, pg
    st = lambda pg: pg.evaluate("""()=>{const c=document.querySelector('.callout[data-id=cryo]'),d=document.querySelector('.dot[data-id=cryo]');
      return {sec:c.dataset.status,glow:c.querySelectorAll('.vcard.vc-done').length,cards:[...c.querySelectorAll('.vcard')].map(v=>v.dataset.card),
      dot:getComputedStyle(d).backgroundColor,count:document.querySelector('.road-count').innerText,imgs:c.querySelectorAll('img').length,
      s42:[...c.querySelectorAll('.vcard[data-card=S42] .vbox')].map(b=>[b.dataset.n,b.tagName,b.open===undefined?'open':String(b.open),b.className]),
      labels:[...c.querySelectorAll('.vcard')].map(v=>v.innerText).join(' ')}}""")
    ctx, pg = load('one'); s = st(pg)
    check(s['glow'] == 1 and s['sec'] == 'progress' and s['dot'] == 'rgba(0, 0, 0, 0)' and s['count'].startswith('0 of'), f"one vehicle done → one glow, section In progress, dot not filled ({s['glow']}, {s['sec']}, {s['count']})"); ctx.close()
    ctx, pg = load('both'); s = st(pg)
    check(s['glow'] == 2 and s['sec'] == 'completed' and s['dot'] == 'rgb(255, 255, 255)' and s['count'].startswith('1 of'), f"both done → Completed, dot filled white, count {s['count']}")
    check(len(s['cards']) == len(set(s['cards'])) == 2, f"no duplicate cards ({s['cards']})")
    check(s['imgs'] == 0, "Flight Log box: text only (no images)")
    check(not any(w in s['labels'] for w in ['Expected', 'In progress', 'Completed', 'Reported', 'Rumour', 'Unconfirmed', 'assumed', 'UK']), "no tier/status/source labels or times inside cards")
    pg.locator('.hdr-right').click(); pg.wait_for_timeout(1200)
    imgs = pg.evaluate("()=>[...document.querySelectorAll('.rsec[data-sec=cryo] .vcard')].map(v=>v.querySelectorAll('img').length)")
    check(len(imgs) >= 2 and all(x == 1 for x in imgs), f"Road page: exactly one image per vehicle card, every flight ({imgs})"); ctx.close()
    ctx, pg = load('append'); s = st(pg)
    check(s['cards'].count('S42') == 1 and len(s['s42']) == 3, f"an update to the latest instance updates its box, no new card or box ({s['s42']})"); ctx.close()
    ctx, pg = load('newrun'); s = st(pg)
    check(len(s['s42']) == 4 and s['s42'][0][0] == '4' and s['s42'][0][1] == 'DIV' and all(x[1] == 'DETAILS' and x[2] == 'false' for x in s['s42'][1:]), f"a new instance adds box #4 on top (open); older boxes are collapsed toggles ({s['s42']})")
    check(s['glow'] == 1 and s['sec'] == 'progress', f"new unfinished latest box → that card stops glowing, section back to In progress ({s['glow']}, {s['sec']})"); ctx.close()
    ctx, pg = load('both')
    pg.locator('.road-head').click(); pg.wait_for_timeout(600); pg.locator('.callout[data-id=cryo] .callout-head').click(); pg.wait_for_timeout(800)
    t = pg.locator('.callout[data-id=cryo] .vcard[data-card=S42] details.vb-old').first; t.locator('summary').click(); pg.wait_for_timeout(300)
    check(t.evaluate("e=>e.open") and "Massey's" in t.inner_text() and '4 Sep' in t.inner_text(), "tapping an older box opens its place and sentence")
    s = st(pg); check(s['s42'][0][1] == 'DIV' and 'vb-done' in s['s42'][0][3], "latest S42 box open and glowing (completed)"); ctx.close()
print(f"\n{n - fails} of {n} passed"); sys.exit(1 if fails else 0)
