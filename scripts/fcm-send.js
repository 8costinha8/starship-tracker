/* One FCM multicast to every subscriber, with delivery counts and a safe token clean-up.
   Returns { tokens, success, failure, removed, failed_codes } (sendPush stores it on the push log row as `delivery`).
   A token is deleted only when FCM says it is gone for good (DEAD codes), or after MAX_FAILS failed sends in a row;
   any other failure only bumps a `fails` counter on the subscriber document, and a later success resets it.
   No send happens without real Firebase credentials (the caller builds admin/db from FIREBASE_SERVICE_ACCOUNT). */
const DEAD = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);
const MAX_FAILS = 3;
function plan(responses, docs) { // pure: what to do with each token (tested offline)
  const out = { success: 0, failure: 0, remove: [], bump: [], reset: [], codes: {} };
  responses.forEach((r, i) => {
    const d = docs[i] || {}, fails = Number((d.data && d.data.fails) || 0);
    if (r.success) { out.success++; if (fails > 0) out.reset.push(d.id); return; }
    out.failure++; const code = (r.error && (r.error.code || r.error.errorInfo && r.error.errorInfo.code)) || "unknown";
    out.codes[code] = (out.codes[code] || 0) + 1;
    if (DEAD.has(code) || fails + 1 >= MAX_FAILS) out.remove.push(d.id); else out.bump.push({ id: d.id, fails: fails + 1 });
  });
  return out;
}
async function sendToSubscribers({ admin, db, message, title = "", log = console.log }) {
  const subs = await db.collection("subscribers").get();
  const docs = subs.docs.map((d) => ({ id: d.id, data: typeof d.data === "function" ? d.data() || {} : {} }));
  const tokens = docs.map((d) => d.id);
  if (!tokens.length) { log(`Would have sent "${title}" — but there are no subscribers yet.`); return { tokens: 0, success: 0, failure: 0, removed: 0 }; }
  const resp = await admin.messaging().sendEachForMulticast(message(tokens));
  const p = plan(resp.responses, docs);
  log(`Sent "${title}" to ${p.success}/${tokens.length} device(s)${p.failure ? ` (${p.failure} failed: ${JSON.stringify(p.codes)}; ${p.remove.length} removed)` : ""}.`);
  const col = db.collection("subscribers");
  await Promise.all([
    ...p.remove.map((id) => col.doc(id).delete().catch(() => {})),
    ...p.bump.map((b) => col.doc(b.id).set({ fails: b.fails, last_fail: new Date().toISOString() }, { merge: true }).catch(() => {})),
    ...p.reset.map((id) => col.doc(id).set({ fails: 0 }, { merge: true }).catch(() => {})),
  ]);
  return { tokens: tokens.length, success: p.success, failure: p.failure, removed: p.remove.length, ...(p.failure ? { failed_codes: p.codes } : {}) };
}
module.exports = { sendToSubscribers, plan, DEAD, MAX_FAILS };
