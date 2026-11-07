/* ============================================================
   iota√-1 — service worker
   ------------------------------------------------------------
   Caches the page shell and the data file so a weak or missing
   connection still shows the report. It never caches /api/*,
   so the AI tutor is always asked live.
   ============================================================ */

'use strict';

const VERSION = 'iota-shell-v4';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './manifest.webmanifest',
  './favicon.svg',
  './data/study.js',
  './js/study.js',
  './js/config.js',
  './js/quiz-data.js',
  './js/translations.js',
  './js/i18n.js',
  './js/app.js',
  './js/map.js',
  './js/features.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION)
      .then(function (cache) {
        // One missing file must not stop the whole install.
        return Promise.all(SHELL.map(function (url) {
          return cache.add(url).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (key) {
          return key !== VERSION;
        }).map(function (key) { return caches.delete(key); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url;
  try { url = new URL(request.url); } catch (e) { return; }

  // The AI tutor stays live — never serve a cached answer.
  if (url.origin === self.location.origin && url.pathname.indexOf('/api/') === 0) return;

  // Fonts, Leaflet, Chart.js and map tiles are cross-origin: network only.
  if (url.origin !== self.location.origin) return;

  // Pages: fresh when online, cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var copy = response.clone();
          caches.open(VERSION).then(function (cache) {
            cache.put(request, copy).catch(function () {});
          });
          return response;
        })
        .catch(function () {
          return caches.match(request).then(function (hit) {
            return hit || caches.match('./index.html') || caches.match('./');
          });
        })
    );
    return;
  }

  // Everything else same-origin: cached copy first, refreshed in the background.
  event.respondWith(
    caches.match(request).then(function (hit) {
      var network = fetch(request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(VERSION).then(function (cache) {
            cache.put(request, copy).catch(function () {});
          });
        }
        return response;
      }).catch(function () {
        return hit;
      });
      return hit || network;
    })
  );
});
