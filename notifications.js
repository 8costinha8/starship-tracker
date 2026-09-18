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

// Small floating button so anyone using the app can turn notifications on
function addNotifyButton() {
  const btn = document.createElement('button');
  btn.textContent = '🔔 Enable notifications';
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: 9999,
    padding: '10px 16px',
    borderRadius: '999px',
    border: 'none',
    background: '#2E3D63',
    color: 'white',
    fontSize: '14px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    cursor: 'pointer'
  });
  btn.onclick = enableNotifications;
  document.body.appendChild(btn);
}

async function enableNotifications() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Notifications were not allowed — you can turn them on later in your phone settings.');
      return;
    }

    const registration = await navigator.serviceWorker.register('firebase-messaging-sw.js');
    const token = await messaging.getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (token) {
      await db.collection('subscribers').doc(token).set({
        token: token,
        createdAt: new Date().toISOString()
      });
      alert("Notifications enabled! You'll get an alert when flight details change.");
    }
  } catch (err) {
    console.error('Notification setup failed:', err);
    alert('Something went wrong turning on notifications: ' + err.message);
  }
}

window.addEventListener('DOMContentLoaded', addNotifyButton);
