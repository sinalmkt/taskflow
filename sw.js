self.addEventListener('install', (e) => {
  e.waitUntil(caches.open('taskflow-cache-v6').then(c => c.addAll(['./','./index.html','./style.css','./app.js','./manifest.json','./medusa.png'])));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
