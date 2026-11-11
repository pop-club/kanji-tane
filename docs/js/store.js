/*
 * Pop-Kanji 学習データの保存（IndexedDB・この端末の中だけ）
 *  kanji:    字ごとの習熟度 { char, grade, status, correct, wrong, streak, recogErr, lastAt, reviewAt, history[] }
 *  sessions: テストの記録 { id, at, mode, grade, items[] }
 * IndexedDB が使えないときは、ページを開いている間だけメモリに保存する。
 */
(function (root) {
  'use strict';
  var DB = 'popkanji', VER = 1, db = null;
  var kanji = {}, sessions = [];
  var persistent = false;

  function open() {
    return new Promise(function (resolve) {
      try {
        var rq = indexedDB.open(DB, VER);
        rq.onupgradeneeded = function () {
          var d = rq.result;
          if (!d.objectStoreNames.contains('kanji')) d.createObjectStore('kanji', { keyPath: 'char' });
          if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'id' });
        };
        rq.onsuccess = function () { db = rq.result; resolve(true); };
        rq.onerror = function () { resolve(false); };
        rq.onblocked = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }
  function readAll(name) {
    return new Promise(function (resolve) {
      try {
        var out = [];
        var t = db.transaction(name, 'readonly');
        var rq = t.objectStore(name).openCursor();
        rq.onsuccess = function () { var c = rq.result; if (c) { out.push(c.value); c.continue(); } };
        t.oncomplete = function () { resolve(out); };
        t.onerror = function () { resolve(out); };
      } catch (e) { resolve([]); }
    });
  }
  function write(name, value) {
    if (!db) return Promise.resolve(false);
    return new Promise(function (resolve) {
      try {
        var t = db.transaction(name, 'readwrite');
        t.objectStore(name).put(value);
        t.oncomplete = function () { resolve(true); };
        t.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }
  function clearStore(name) {
    if (!db) return Promise.resolve(false);
    return new Promise(function (resolve) {
      try {
        var t = db.transaction(name, 'readwrite');
        t.objectStore(name).clear();
        t.oncomplete = function () { resolve(true); };
        t.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  var Store = {
    init: function () {
      return open().then(function (ok) {
        persistent = ok;
        if (!ok) return;
        return Promise.all([readAll('kanji'), readAll('sessions')]).then(function (r) {
          r[0].forEach(function (k) { kanji[k.char] = k; });
          sessions = r[1].sort(function (a, b) { return a.at - b.at; });
        });
      });
    },
    persistent: function () { return persistent; },
    get: function (ch) { return kanji[ch] || null; },
    all: function () { return kanji; },
    save: function (rec) { kanji[rec.char] = rec; return write('kanji', rec); },
    sessions: function () { return sessions; },
    addSession: function (s) { sessions.push(s); return write('sessions', s); },
    exportData: function () {
      return { app: 'Pop-Kanji', version: 1, exportedAt: new Date().toISOString(),
        kanji: Object.keys(kanji).map(function (k) { return kanji[k]; }), sessions: sessions };
    },
    importData: function (data) {
      if (!data || data.app !== 'Pop-Kanji' || !Array.isArray(data.kanji)) return Promise.reject(new Error('Pop-Kanji のデータではありません'));
      return Store.reset().then(function () {
        var jobs = [];
        data.kanji.forEach(function (k) { if (k && k.char) { kanji[k.char] = k; jobs.push(write('kanji', k)); } });
        (data.sessions || []).forEach(function (s) { if (s && s.id) { sessions.push(s); jobs.push(write('sessions', s)); } });
        return Promise.all(jobs);
      });
    },
    reset: function () {
      kanji = {}; sessions = [];
      return Promise.all([clearStore('kanji'), clearStore('sessions')]);
    }
  };
  root.PopKanjiStore = Store;
})(window);
