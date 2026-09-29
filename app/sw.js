// Family OS — Service Worker. app-shell cache ל-offline + Push אמיתי (סבב 2,
// Family_OS_Notifications_Brief.md, מסלול ב'). אותו Service Worker קיים מטפל גם
// בהתראות Push ברקע — לא קובץ firebase-messaging-sw.js נפרד — כי getToken() בצד
// הלקוח (app/js/push.js) מקבל את ה-registration הזה ישירות (serviceWorkerRegistration).
// importScripts (לא ES import) כי זהו Service Worker קלאסי, לא מודול.

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// firebaseConfig ציבורי-בכוונה (כמו ב-app/js/firebase.js) — מוכפל כאן כי Service
// Worker קלאסי לא יכול לייבא מודול ES מהקובץ השני.
firebase.initializeApp({
  apiKey: "AIzaSyBV0Ix1RIXJN9xIlolT7pjflrCmZAvG6HI",
  authDomain: "family-os-poc.firebaseapp.com",
  projectId: "family-os-poc",
  storageBucket: "family-os-poc.firebasestorage.app",
  messagingSenderId: "670882998874",
  appId: "1:670882998874:web:9d25c8bc70349dc92a8663",
});

const messaging = firebase.messaging();
// scripts/send-push.mjs שולח הודעת data-only (לא "notification") בכוונה, כדי
// שההצגה תמיד תעבור דרך כאן ותשתמש באותו notificationclick הקיים למטה — לא שני
// מנגנוני-קליק נפרדים.
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.data || {};
  if (!title) return;
  self.registration.showNotification(title, {
    body: body || "",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
  });
});

const CACHE = "family-os-v21";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/constants.js",
  "./js/db.js",
  "./js/state.js",
  "./js/seed.js",
  "./js/render.js",
  "./js/forms.js",
  "./js/notifications.js",
  "./js/toast.js",
  "./js/firebase.js",
  "./js/cloud.js",
  "./js/auth.js",
  "./js/nav.js",
  "./js/calendar.js",
  "./js/drive.js",
  "./js/push.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// same-origin GET: קודם רשת (כדי לקבל עדכוני קוד), נופל לcache באופליין.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(request).then((r) => r || caches.match("./index.html")))
  );
});

// Notification Triggers API (Chrome) — התראות מתוזמנות מראש מגיעות לכאן.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
