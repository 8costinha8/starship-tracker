// Runs hourly via GitHub Actions (see .github/workflows/check-flight.yml).
// Checks Launch Library 2 for the next Starship flight, compares it to the
// last known state stored in Firestore (app-state/next-flight), and if
// anything changed, pushes a notification to every device in `subscribers`
// and updates the stored state. First-ever run just saves a baseline —
// nothing to compare against yet, so no notification is sent.

const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Same endpoint and status mapping as app.js's useNextFlight(), so the
// watcher and the app always agree on what "the next flight" means.
const LL2_ENDPOINT = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?search=Starship&limit=1&mode=list";
const APP_URL = "https://8costinha8.github.io/starship-tracker/";

function mapLL2Status(abbrev) {
  if (abbrev === "Go") return "confirmed";
  if (abbrev === "TBC") return "net";
  return "tbc";
}

async function main() {
  const res = await fetch(LL2_ENDPOINT);
  if (!res.ok) throw new Error(`LL2 request failed: ${res.status}`);
  const json = await res.json();
  const launch = json.results?.[0];
  if (!launch) {
    console.log("No upcoming Starship launch returned by LL2 — nothing to do.");
    return;
  }

  const match = launch.name.match(/Flight (\d+)/);
  const fresh = {
    n: match ? Number(match[1]) : null,
    status: mapLL2Status(launch.status?.abbrev),
    date: launch.net,
  };

  const ref = db.collection("app-state").doc("next-flight");
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set(fresh);
    console.log("First run — saved baseline, no notification sent.", fresh);
    return;
  }

  const prev = snap.data();
  const changed = prev.n !== fresh.n || prev.status !== fresh.status || prev.date !== fresh.date;

  if (!changed) {
    console.log("No change.", fresh);
    return;
  }

  console.log("Change detected:", { prev, fresh });
  await ref.set(fresh);

  // Plain-English summary of exactly what changed
  const bits = [];
  if (prev.n !== fresh.n) bits.push(`next flight is now Flight ${fresh.n}`);
  if (prev.date !== fresh.date) {
    const d = new Date(fresh.date).toLocaleString("en-GB", {
      timeZone: "Europe/London", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    });
    bits.push(`new window ${d} (UK time)`);
  }
  if (prev.status !== fresh.status) bits.push(`status: ${fresh.status.toUpperCase()}`);
  const body = bits.length ? bits.join(" · ") : "Flight details updated.";

  const subsSnap = await db.collection("subscribers").get();
  const tokens = subsSnap.docs.map((d) => d.id);
  if (tokens.length === 0) {
    console.log("No subscribers to notify.");
    return;
  }

  const message = {
    notification: { title: `Flight ${fresh.n} update`, body },
    webpush: { fcmOptions: { link: APP_URL } },
    tokens,
  };

  const result = await admin.messaging().sendEachForMulticast(message);
  console.log(`Push sent — succeeded: ${result.successCount}, failed: ${result.failureCount}`);

  // Prune subscriptions that are dead (app uninstalled, token expired) so
  // the list doesn't quietly accumulate devices that can never be reached.
  const deletions = [];
  result.responses.forEach((r, i) => {
    if (!r.success && r.error?.code === "messaging/registration-token-not-registered") {
      deletions.push(db.collection("subscribers").doc(tokens[i]).delete());
    }
  });
  if (deletions.length) {
    await Promise.all(deletions);
    console.log(`Removed ${deletions.length} dead subscription(s).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
