// オフラインで遊べるようにする Service Worker。
// app/ の中のファイルだけをキャッシュする。外部（ほかのサイト）へのリクエストには一切さわらない。
// ファイルを足したら ASSETS に足し、内容を変えて公開するときは VERSION を上げる（tests/pwa.test.js で検査）。

const VERSION = 'v52';
const CACHE = `rekishi-dopa-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './js/audio.js',
  './js/effects.js',
  './js/game.js',
  './js/main.js',
  './js/mascot.js',
  './js/rewards.js',
  './js/storage.js',
  './js/validate.js',
  './data/units.json',
  './data/kyusekki.json',
  './data/jomon.json',
  './data/yayoi.json',
  './data/kofun.json',
  './data/asuka.json',
  './data/nara.json',
  './data/heian.json',
  './data/kamakura.json',
  './data/muromachi.json',
  './data/azuchi.json',
  './data/edo.json',
  './data/meiji.json',
  './data/rikken.json',
  './data/nisshin.json',
  './data/taisho.json',
  './data/showa.json',
  './data/sengo.json',
  './data/kodo.json',
  './data/heisei.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './img/edo-windows.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // 76回目：ブラウザの HTTP キャッシュを通さずに取る（更新の直後に、古い版のファイルが新しい版のキャッシュへ
      // 混ざって起動が止まるのを防ぐ。Pages は max-age 600 なので、通すと10分は古いファイルが返りうる）
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

// 古い版のキャッシュを消し、開いているページをすぐにこの Service Worker の管理下に置く
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('rekishi-dopa-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 同じ配信元の GET だけを扱う。キャッシュがあればすぐ返し、裏でネットワークから新しい内容を取りにいく
// （オフラインなら取りにいくのに失敗するだけで、キャッシュの内容で遊べる）
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const update = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(update);
        return cached;
      }
      const res = await update;
      return res || new Response('オフラインのため読み込めません', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }),
  );
});
