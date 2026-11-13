/*
 * Pop-Kanji 手書き入力（Canvas + Pointer Events）
 * new PopKanjiPad(padElement, { onChange }) → { strokes(), clear(), undo(), size(), lock(bool) }
 * 入力中のスクロール・拡大を止め、ペンを使ったら指のタッチを無視する（手のひら対策）。
 */
(function (root) {
  'use strict';
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  function Pad(pad, opts) {
    opts = opts || {};
    var cv = document.createElement('canvas');
    cv.setAttribute('aria-label', '手書き入力欄');
    pad.appendChild(cv);
    var ctx = cv.getContext('2d');
    var strokes = [], cur = null, activeId = null, penSeen = false, size = 0, locked = false;
    var guide = null;   // うすく表示するお手本の字
    var ink = null;     // 線の色を一時的に変える（練習で書けたとき 緑 など）

    function resize() {
      var r = pad.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      if (!r.width) return;
      if (size && r.width !== size) {
        var k = r.width / size;
        strokes = strokes.map(function (st) { return st.map(function (p) { return [p[0] * k, p[1] * k]; }); });
      }
      size = r.width;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    }
    function line(st) {
      if (!st.length) return;
      ctx.beginPath(); ctx.moveTo(st[0][0], st[0][1]);
      if (st.length === 1) ctx.lineTo(st[0][0] + 0.1, st[0][1] + 0.1);
      for (var i = 1; i < st.length; i++) ctx.lineTo(st[i][0], st[i][1]);
      ctx.stroke();
    }
    function redraw() {
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.strokeStyle = cssVar('--grid'); ctx.lineWidth = 1.5; ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(size / 2, 10); ctx.lineTo(size / 2, size - 10); ctx.moveTo(10, size / 2); ctx.lineTo(size - 10, size / 2); ctx.stroke();
      ctx.restore();
      if (guide) {
        ctx.save();
        ctx.fillStyle = cssVar('--guide');
        ctx.font = Math.round(size * 0.8) + 'px ' + cssVar('--font-kanji');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(guide, size / 2, size / 2 + size * 0.03);
        ctx.restore();
      }
      ctx.strokeStyle = ink ? cssVar(ink) : cssVar('--stroke'); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(6, size / 40);
      strokes.forEach(line);
      if (cur) line(cur);
      if (opts.onChange) opts.onChange(strokes.length + (cur ? 1 : 0));
    }
    function pt(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

    cv.addEventListener('pointerdown', function (e) {
      if (locked) return;
      if (e.pointerType === 'pen') penSeen = true;
      if (penSeen && e.pointerType === 'touch') return;
      if (activeId !== null) return;
      e.preventDefault();
      activeId = e.pointerId;
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      cur = [pt(e)];
      redraw();
    });
    cv.addEventListener('pointermove', function (e) {
      if (e.pointerId !== activeId || !cur) return;
      e.preventDefault();
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      if (!evs.length) evs = [e];
      for (var i = 0; i < evs.length; i++) cur.push(pt(evs[i]));
      redraw();
    });
    function end(e) {
      if (e.pointerId !== activeId) return;
      activeId = null;
      if (cur && cur.length) strokes.push(cur);
      cur = null;
      redraw();
    }
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    ['contextmenu', 'selectstart', 'dblclick'].forEach(function (t) { pad.addEventListener(t, function (e) { e.preventDefault(); }); });
    pad.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    pad.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

    new ResizeObserver(resize).observe(pad);
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);

    return {
      strokes: function () { return strokes; },
      size: function () { return size; },
      clear: function () { strokes = []; cur = null; redraw(); },
      setStrokes: function (list) { strokes = (list || []).map(function (st) { return st.map(function (q) { return q.slice(); }); }); cur = null; redraw(); },
      undo: function () { strokes.pop(); redraw(); },
      lock: function (v) { locked = !!v; pad.classList.toggle('locked', locked); },
      setGuide: function (ch) { guide = ch || null; redraw(); },
      setInk: function (v) { ink = v || null; redraw(); },
      // 判定用：256 座標に変換した筆跡（記録用）
      strokes256: function () {
        return strokes.map(function (st) { return st.map(function (p) { return [Math.round(p[0] * 256 / size), Math.round(p[1] * 256 / size)]; }); });
      },
      redraw: resize
    };
  }
  root.PopKanjiPad = Pad;
})(window);
