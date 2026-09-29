/**
 * Service Worker do painel (PWA).
 *
 * SEGURANÇA: somente arquivos ESTÁTICOS do painel (HTML sem dados, CSS, JS,
 * ícones) são guardados em cache. Respostas da API (/api/), fotos enviadas
 * e qualquer requisição que não seja GET passam direto para a rede e NUNCA
 * são armazenadas — dados administrativos não ficam salvos no aparelho.
 *
 * CACHE_VERSION é trocada AUTOMATICAMENTE pelo scripts/publicar.py (hash dos
 * arquivos do painel) — não precisa mudar à mão.
 */
const CACHE_VERSION = 'rv-admin-dev-icons-full-20260928';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const FONT_CACHE = `${CACHE_VERSION}-fonts`;

const APP_SHELL = [
  './',
  './index.html',
  './login.html',
  './imoveis.html',
  './imovel-form.html',
  './categorias.html',
  './caracteristicas.html',
  './localidades.html',
  './configuracoes.html',
  './usuarios.html',
  './perfil.html',
  './trocar-senha.html',
  './offline.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-full-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  '../assets/images/logo-assinatura.webp',
  '../assets/images/marble-sm.webp',
  '../assets/images/marble.webp',
  "./css/admin.css",
  "./js/core/api.js",
  "./js/core/format.js",
  "./js/core/gallery.js",
  "./js/core/icons.js",
  "./js/core/layout.js",
  "./js/core/money.js",
  "./js/core/pwa.js",
  "./js/core/ui.js",
  "./js/pages/catalog.js",
  "./js/pages/dashboard.js",
  "./js/pages/first-access.js",
  "./js/pages/locations.js",
  "./js/pages/login.js",
  "./js/pages/profile.js",
  "./js/pages/properties.js",
  "./js/pages/property-form.js",
  "./js/pages/settings.js",
  "./js/pages/users.js",
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isApiOrUpload(url) {
  return url.pathname.includes('/api/') || url.pathname.includes('/uploads/') || url.pathname.includes('/install/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;                       // POST/uploads: sempre rede

  const url = new URL(request.url);

  // Fontes do Google: cache primeiro (arquivos públicos e imutáveis)
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;           // outros domínios (ex.: ViaCEP): rede
  if (isApiOrUpload(url)) return;                            // dados: NUNCA em cache

  // Páginas: rede primeiro (sempre a versão mais nova); sem internet → cache → offline.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(url.pathname)) || (await caches.match('./offline.html')))
    );
    return;
  }

  // CSS, JS, ícones: responde do cache e atualiza em segundo plano
  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((res) => {
          if (res.ok && res.type === 'basic') cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Permite que a página peça atualização imediata
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
