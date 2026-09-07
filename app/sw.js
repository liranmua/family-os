// Family OS — Service Worker. app-shell cache ל-offline + טיפול בלחיצה על התראה.
// שלב 1: אין Push-שרת. ה-SW רק מגיש את הקבצים ומרכז את showNotification.

const CACHE = "family-os-v3";
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
  "./js/firebase.js",
  "./js/sync-check.js",
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
