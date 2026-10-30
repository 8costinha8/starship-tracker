/* One event record per completed milestone card: card.event_record = { at, text, url, src, why }.
   sync(road) makes the card itself agree with it (text, log_text, completed_at, url), so the Road to Flight card,
   the Flight Log box (pins with { event: key }, scripts/flightlog.js) and the Earlier-updates/log lines all show the
   same time and wording. No push. Returns [{ id, fields }]. */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ukDay = (iso) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "numeric" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${Number(p.day)} ${MON[Number(p.month) - 1]}`; };
function sync(road) {
  const out = [];
  for (const c of road.categories || []) for (const h of c.history || []) {
    const r = h && h.event_record; if (!r || !r.at || !r.text) continue;
    const want = { date: ukDay(r.at), text: r.text, log_text: r.text, completed_at: r.at, ...(r.url ? { url: r.url } : {}) }, fields = [];
    for (const [k, v] of Object.entries(want)) if (h[k] !== v) { h[k] = v; fields.push(k); }
    if (h.x_text && h.x_text !== r.text) { h.x_text = r.text; fields.push("x_text"); }
    if (h.status_line && h.status_line !== r.text) { h.status_line = r.text; fields.push("status_line"); }
    if (fields.length) out.push({ id: h.id || h.text, fields });
  }
  return out;
}
module.exports = { sync };
