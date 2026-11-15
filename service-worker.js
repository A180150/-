/* Service Worker — 小鱼家宴
   策略：页面 Network First，静态资源 Cache First
   网络资源：字体 / hero 图片 / 页面本身
*/
const CACHE = 'xiaoyu-home-v12';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=67',
  './app.js?v=65',
  './manifest.json',
  './robots.txt',
  './404.html',
  './assets/hero.webp',
  './assets/avatar.webp'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 主播抽奖台不接管缓存，永远取网络最新版
  if (/host\.(html|js)($|\?)/.test(req.url)) return;

  // 页面优先取最新版，断网时回退到缓存
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((resp) => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone));
        }
        return resp;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // 字体（miaoda 自托管镜像）：Stale While Revalidate（返回旧缓存，后台更新）
  if (req.url.includes('miaoda.feishu.cn')) {
    e.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const fetched = fetch(req).then((resp) => {
            cache.put(req, resp.clone());
            return resp;
          }).catch(() => cached);
          return cached || fetched;
        })
      )
    );
    return;
  }

  // 本地资源：Cache First
  e.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((resp) => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone));
        }
        return resp;
      })
    )
  );
});
