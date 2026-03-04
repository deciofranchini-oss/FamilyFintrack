/* Family FinTrack Service Worker
   Offline shell cache + safe update strategy (network-first for HTML)
*/
const CACHE_NAME = 'fintrack-shell-v2-20260304';
const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './css/app.css',
  './js/config.js',
  './js/ui-config.js',
  './js/utils.js',
  './js/state.js',
  './js/supabase.js',
  './js/ui_helpers.js',
  './js/payee_autocomplete.js',
  './js/accounts.js',
  './js/categories.js',
  './js/payees.js',
  './js/transactions.js',
  './js/budgets.js',
  './js/dashboard.js',
  './js/reports.js',
  './js/scheduled.js',
  './js/attachments.js',
  './js/iof.js',
  './js/forecast.js',
  './js/email.js',
  './js/settings.js',
  './js/import.js',
  './js/backup.js',
  './js/auth.js',
  './js/auto_register.js',
  './js/audit.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(()=>{})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // remove old caches (including previous "fintrack-shell-v1" that might contain stale scripts/eruda)
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Network-first for HTML navigations to avoid stale index.html and script ordering issues
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      try{
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone()).catch(()=>{});
        return fresh;
      }catch(e){
        const cached = await caches.match(req);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }

  // Cache-first for shell assets
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(()=>{});
      return resp;
    }).catch(()=>cached))
  );
});
