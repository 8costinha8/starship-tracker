/* ─────────────────────────────────────────────────────────────
   Notification logic only — no buttons or popups here.
   The UI (first-visit prompt + "Manage notifications" in the
   About menu) lives in app.js and calls the functions below via
   window.STNotify. Keeping this file logic-only means a UI
   change never risks breaking the Firebase wiring, and vice versa.
   ───────────────────────────────────────────────────────────── */

// Firebase config — these are identifiers, not secrets, safe to be public
const firebaseConfig = {
  apiKey: "AIzaSyDejskSpNWmIjmF08cF-FYyHD6BRdLHmtA",
  authDomain: "starship-tracker-8df7c.firebaseapp.com",
  projectId: "starship-tracker-8df7c",
  storageBucket: "starship-tracker-8df7c.firebasestorage.app",
  messagingSenderId: "625303440602",
  appId: "1:625303440602:web:0f14fe66e72e864354a9e3"
};

const VAPID_KEY = "BOODFUfu-w6ffa4bOp6bURNtPnAKixTmvWPW78w8q50r2jwHr4tfboDavvpfZLxtPs0xNx1pZCg8-uhXCtzAOQo";

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();
const db = firebase.firestore();

const STATUS_KEY = "st_notif_status";  // "on" | "off" | (not set = never decided)
const TOKEN_KEY = "st_notif_token";

// Turns notifications on: asks iOS for permission, registers this device
// with Firebase, and saves its token to Firestore so the flight-change
// checker (built later) knows where to send alerts.
async function subscribe() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    localStorage.setItem(STATUS_KEY, "off");
    return { ok: false, reason: "permission-denied" };
  }

  const registration = await navigator.serviceWorker.register("firebase-messaging-sw.js");
  const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) return { ok: false, reason: "no-token" };

  await db.collection("subscribers").doc(token).set({
    token: token,
    createdAt: new Date().toISOString()
  });
  localStorage.setItem(STATUS_KEY, "on");
  localStorage.setItem(TOKEN_KEY, token);
  return { ok: true };
}

// Turns notifications off: removes this device's token from Firestore so
// it stops receiving pushes. (iOS itself still shows "allowed" in Settings —
// browsers don't let a website revoke that permission directly. This is
// the real, honest off-switch: no more messages get sent to this device.)
async function unsubscribe() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    try { await db.collection("subscribers").doc(token).delete(); } catch (e) { /* already gone, fine */ }
  }
  localStorage.setItem(STATUS_KEY, "off");
  return { ok: true };
}

// "Maybe later" from the first-visit prompt: remembers the choice without
// touching permissions or Firestore, so the prompt doesn't nag every visit.
function dismiss() {
  localStorage.setItem(STATUS_KEY, "off");
}

// "on" only counts if the browser's own permission is still actually granted —
// if someone revokes it in iOS Settings, we should reflect that truthfully.
function getStatus() {
  const saved = localStorage.getItem(STATUS_KEY);
  return (saved === "on" && Notification.permission === "granted") ? "on" : "off";
}

function hasDecided() {
  return localStorage.getItem(STATUS_KEY) !== null;
}

window.STNotify = { subscribe, unsubscribe, dismiss, getStatus, hasDecided };
