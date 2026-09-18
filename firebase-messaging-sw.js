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
// No fallback title here on purpose: Safari already shows the site name in bold
// above every push notification, so any title we add just repeats it.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "";
  const options = {
    body: payload.notification?.body || "",
    icon: "icons/icon-192.png"
  };
  self.registration.showNotification(title, options);
});
