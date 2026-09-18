importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDejskSpNWmIjmF08cF-FYyHD6BRdLHmtA",
  authDomain: "starship-tracker-8df7c.firebaseapp.com",
  projectId: "starship-tracker-8df7c",
  storageBucket: "starship-tracker-8df7c.firebasestorage.app",
  messagingSenderId: "625303440602",
  appId: "1:625303440602:web:0f14fe66e72e864354a9e3"
});

const messaging = firebase.messaging();

// Handles a notification that arrives while the app is closed or in the background.
// The automated checker sends "data-only" messages (so this code alone decides
// what's shown — no duplicate banners). Manual tests from Firebase Console send
// "notification" messages instead — both are handled here.
messaging.onBackgroundMessage((payload) => {
  const title = payload.data?.title || payload.notification?.title || "🚀 Flight update";
  const options = {
    body: payload.data?.body || payload.notification?.body || "",
    icon: "icons/icon-192.png"
  };
  self.registration.showNotification(title, options);
});
