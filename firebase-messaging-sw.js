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
// Always give it a real, distinct title — a blank one gets silently replaced
// by the app's own name, which then collides with the OS's own attribution line.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "🚀 Flight update";
  const options = {
    body: payload.notification?.body || "",
    icon: "icons/icon-192.png"
  };
  self.registration.showNotification(title, options);
});
