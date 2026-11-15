/*
 * かんじのたね Service Worker（1回開いたら 通信がなくても使えるようにする）
 * build.sh が バージョンと index.html の script の一覧を書きこんで、書き出し先に sw.js として置く。
 *  - バージョンごとにキャッシュの名前を変える（kt-shell-<版> / kt-run-<版>）。新しい版が使われはじめたら 古いキャッシュは消す
 *  - アプリの本体（index.html・js・手本・小学校の問題）は はじめに とっておく（precache）
 *  - 大きいファイル（中学からの手本・準1級/1級の手本・漢検の問題）は、使ったときに とっておく（runtime）
 *  - ページ（index.html）は 通信を先に使い、つながらないときだけ とっておいたものを出す（古いページと新しい js が まざらない）
 *  - ほかのサイトへの通信（判定ミスの報告 script.google.com など）には さわらない（いつも通信する）
 */
'use strict';
var VERSION = '2026.11.16-0834';
var SHELL = 'kt-shell-' + VERSION, RUN = 'kt-run-' + VERSION;
var V = '?v=' + VERSION;
// index.html の <script src> （build.sh が index.html から取り出す。?v= 付き）
var PAGE_JS = ["vendor/kanjicanvas/kanji-canvas.js?v=2026.11.16-0834","js/joyo.js?v=2026.11.16-0834","js/recognizer.js?v=2026.11.16-0834","js/store.js?v=2026.11.16-0834","js/pad.js?v=2026.11.16-0834","js/stroke-counts.js?v=2026.11.16-0834","js/grades.js?v=2026.11.16-0834","js/app.js?v=2026.11.16-0834"];
// あとから読むもの（app.js の loadScript と同じ URL）
var LATER_JS = ['vendor/kanjicanvas/ref-patterns.js', 'vendor/kanjivg-refs/kvg-refs.js', 'vendor/kanjivg-refs/kvg-refs-variants.js',
  'q/1.js', 'q/2.js', 'q/3.js', 'q/4.js', 'q/5.js', 'q/6.js'].map(function (u) { return u + V; });
var PLAIN = ['manifest.webmanifest', 'icons/icon.svg', 'icons/favicon-32.png', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/qr.svg'];
var NAV_TIMEOUT = 6000;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    // ページは HTTP のキャッシュを使わずに取り、この版のページかどうか たしかめてから入れる（ちがう版なら入れなおしは つぎの機会に）
    return fetch(new Request('./', { cache: 'no-cache' })).then(function (r) {
      if (!r.ok) throw new Error('index ' + r.status);
      return r.clone().text().then(function (t) {
        if (t.indexOf(V) < 0) throw new Error('index is not ' + VERSION);
        return c.put('./', r);
      });
    }).then(function () {
      return c.addAll(PAGE_JS.concat(LATER_JS)).then(function () {
        return c.addAll(PLAIN.map(function (u) { return new Request(u, { cache: 'no-cache' }); }));
      });
    });
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return /^kt-/.test(k) && k !== SHELL && k !== RUN; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// ページから: { type: 'skipWaiting', ifVersion } … 待っている新しい版を すぐ使う（ifVersion があれば、その版のページのときだけ）
self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type === 'skipWaiting' && (!d.ifVersion || d.ifVersion === VERSION)) self.skipWaiting();
  if (d.type === 'version' && e.ports && e.ports[0]) e.ports[0].postMessage(VERSION);
});

function fromCache(req, opt) {
  return caches.open(SHELL).then(function (c) { return c.match(req, opt); }).then(function (r) {
    return r || caches.open(RUN).then(function (c) { return c.match(req, opt); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // ほかのサイトには さわらない
  var scope = self.registration.scope;
  if (req.url.indexOf(scope) !== 0) return;
  var path = req.url.slice(scope.length).split(/[?#]/)[0];
  if (path === 'sw.js') return;

  if (req.mode === 'navigate') {
    // ページ: 通信が先。つながらない・おそいときは とっておいたページ（この版の js と組になっているもの）
    var isApp = path === '' || path === 'index.html';
    e.respondWith(new Promise(function (resolve, reject) {
      var settled = false;
      function fallback(err) {
        if (!isApp) { if (!settled) { settled = true; reject(err); } return; }
        fromCache('./').then(function (r) {
          if (settled) return;
          if (r) { settled = true; resolve(r); } else if (err) { settled = true; reject(err); }
        });
      }
      var t = setTimeout(function () { fallback(null); }, NAV_TIMEOUT);
      fetch(new Request(req, { cache: 'no-cache' })).then(function (r) {
        clearTimeout(t);
        if (!settled) { settled = true; resolve(r); }
      }, function (err) { clearTimeout(t); fallback(err || new Error('offline')); });
    }));
    return;
  }

  // ほかのファイル: とっておいたものが先（?v= 付きなので 版がちがえば 別のファイル）。なければ通信して とっておく
  e.respondWith(fromCache(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (r) {
      if (r && r.ok && r.type === 'basic') {
        var copy = r.clone();
        e.waitUntil(caches.open(RUN).then(function (c) { return c.put(req, copy); }).catch(function () {}));
      }
      return r;
    });
  }));
});
