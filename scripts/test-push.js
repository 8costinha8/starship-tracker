/* ─────────────────────────────────────────────────────────────
   One-off test push. Run via the workflow's "test_push" input.
   Sends ONE notification to every token in Firestore "subscribers"
   and logs how many got it. Changes nothing: no git, no road.json,
   no app-state writes, and it does NOT delete failed tokens (it
   only prints why each one failed, so you can decide).
   ───────────────────────────────────────────────────────────── */
const admin = require("firebase-admin");

// Optional overrides (workflow inputs test_title / test_body / test_link), e.g. to send one example news push.
const TITLE = process.env.TEST_PUSH_TITLE || "🚀 Road to Flight 15 — test notification";
const BODY = process.env.TEST_PUSH_BODY || "If you see this, Road alerts work.";
const LINK = process.env.TEST_PUSH_LINK || "";

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const subs = await admin.firestore().collection("subscribers").get();
  const tokens = subs.docs.map((d) => d.id);
  console.log(`Found ${tokens.length} subscribed device(s).`);
  if (!tokens.length) { console.log("Nothing sent: no subscribers."); return; }

  const resp = await admin.messaging().sendEachForMulticast({ tokens, notification: { title: TITLE, body: BODY },
    ...(LINK ? { webpush: { fcmOptions: { link: LINK } } } : {}) });
  console.log(`Sent "${TITLE}" to ${resp.successCount}/${tokens.length} device(s). Failures: ${resp.failureCount}.`);
  resp.responses.forEach((r, i) => {
    if (!r.success) console.log(`  ✗ token …${tokens[i].slice(-8)} (created ${subs.docs[i].get("createdAt") || "?"}): ${r.error?.code} ${r.error?.message || ""}`);
  });
}

main().catch((err) => {
  console.error("Test push failed:", err);
  process.exit(1);
});
