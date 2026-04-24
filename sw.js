const CACHE_NAME = "presscoach-v11";

// Use relative paths — works regardless of subdirectory
const STATIC_ASSETS = [
    "./",
    "./index.html",
    "./dashboard.html",
    "./register.html",
    "./forgot_password.html",
    "./firebase_config.js",
    "./script.js",
    "./manifest.json"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS);
        }).catch(err => {
            console.log("Cache failed:", err);
        })
    );
    self.skipWaiting();
});

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

self.addEventListener("fetch", event => {
    // Never intercept Firebase or Flask API calls
    if (
        event.request.url.includes("firebaseio.com") ||
        event.request.url.includes("googleapis.com") ||
        event.request.url.includes("gstatic.com") ||
        event.request.url.includes(":5000")
    ) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request);
        })
    );
});
