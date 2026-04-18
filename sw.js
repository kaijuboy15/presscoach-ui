const CACHE_NAME = "presscoach-v1";

// Only cache the UI files — not API calls to Flask
const STATIC_ASSETS = [
    "/",
    "/index.html",
    "/dashboard.html",
    "/register.html",
    "/forgot_password.html",
    "/firebase_config.js",
    "/script.js",
    "/manifest.json",
    "/icons/icon-192.png",
    "/icons/icon-512.png"
];

// Install — cache all static assets
self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log("PressCoach SW: Caching assets");
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// Fetch — serve from cache, fall back to network
self.addEventListener("fetch", event => {
    // Never cache Firebase or Flask API calls
    if (
        event.request.url.includes("firebaseio.com") ||
        event.request.url.includes("googleapis.com") ||
        event.request.url.includes("gstatic.com") ||
        event.request.url.includes(":5000")
    ) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request);
        })
    );
});