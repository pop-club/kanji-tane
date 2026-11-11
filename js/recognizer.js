/*
 * Pop-Kanji recognizer
 * KanjiCanvas (MIT, https://github.com/asdfjkl/kanjicanvas) の認識コアを
 * Pointer Events で取った筆跡から直接呼び出すラッパー。
 * 外部通信は一切しない（参照パターンは同梱の ref-patterns.js）。
 *
 * strokes: [[ [x,y], [x,y], ... ], ...]  任意の座標系
 * box:     { width, height }  入力領域の大きさ（正方形を想定）
 * 戻り値:  [{ char, score }, ...]  score は距離（小さいほど近い）
 */
(function (root) {
  'use strict';

  var KC = root.KanjiCanvas;
  var TMP_ID = '__popkanji_tmp__';
  var FEATURE_INTERVAL = 20;
  var RESAMPLE_STEP = 1.5; // 256座標系での点間隔（参照パターンの記録密度に合わせる）
  var userWeight = 1;
  var userStrict = true;
  var strokePenalty = 0.1; // 画数差1画あたりの上乗せ。tools/penalty_test.js の比較で決めた値

  function scaleTo256(strokes, box) {
    var s = 256 / Math.max(box.width, box.height);
    return strokes.map(function (st) {
      return st.map(function (p) { return [p[0] * s, p[1] * s]; });
    });
  }

  // 端末ごとのサンプリング間隔の違いを吸収するため、筆跡を等間隔に再サンプリング
  function resample(stroke, step) {
    if (stroke.length < 2) {
      var p = stroke[0];
      return [p, [p[0] + 0.5, p[1] + 0.5]]; // 点（ドット）も短い線として扱う
    }
    var out = [stroke[0].slice()];
    var carry = 0;
    for (var i = 1; i < stroke.length; i++) {
      var a = stroke[i - 1], b = stroke[i];
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;
      var t = step - carry;
      while (t <= len) {
        out.push([a[0] + dx * t / len, a[1] + dy * t / len]);
        t += step;
      }
      carry = len - (t - step);
    }
    var last = stroke[stroke.length - 1];
    var ol = out[out.length - 1];
    if (ol[0] !== last[0] || ol[1] !== last[1]) out.push(last.slice());
    if (out.length < 2) out.push([last[0] + 0.5, last[1] + 0.5]);
    return out;
  }

  // KanjiCanvas.fineClassification と同じ計算で、文字列ではなく距離付きの順位を返す
  function fineRanked(input, coarse, limit) {
    var n0 = input.length;
    var res = [];
    for (var i = 0; i < Math.min(coarse.length, 100); i++) {
      var j = coarse[i][0];
      var ref = KC.refPatterns[j];
      var refLen = ref[1];
      if (!(n0 < refLen + 2 && n0 > refLen - 3)) continue;
      // 登録した手本は正しい画数で書かれているので、同じ画数の入力とだけ比べる
      // （王4画の手本が玉5画を、大3画の手本が犬4画を引き寄せるのを防ぐ。tools/crossround.js の結果）
      if (ref[3] === 'user' && userStrict && refLen !== n0) continue;
      var map = KC.getMap(ref[2], input, KC.initialDistance);
      map = KC.completeMap(ref[2], input, KC.wholeWholeDistance, map);
      var d = KC.computeWholeDistanceWeighted(ref[2], input, map);
      d = d / Math.min(n0, ref[2].length);
      // 画数の差への上乗せ。1画少ない似た字（間→問など）に1位を取られるのを防ぐ
      d = d * (1 + strokePenalty * Math.abs(n0 - ref[2].length));
      if (ref[3] === 'user') d = d * userWeight; // 登録した手本は少し遠めに見る（ほかの字を引き寄せすぎないため）
      res.push({ char: ref[0], score: d });
    }
    res.sort(function (a, b) { return a.score - b.score; });
    // 同じ字の手本が複数あるときは、いちばん近いものだけを残す
    var seen = {}, out = [];
    for (var k = 0; k < res.length && out.length < (limit || 10); k++) {
      if (seen[res[k].char]) continue;
      seen[res[k].char] = true; out.push(res[k]);
    }
    return out;
  }

  // 筆跡を参照パターンと同じ形式の特徴量に変換する
  function features(strokes, box) {
    var pat = scaleTo256(strokes, box).map(function (s) { return resample(s, RESAMPLE_STEP); });
    KC['recordedPattern_' + TMP_ID] = pat;
    var mn = KC.momentNormalize(TMP_ID);
    delete KC['recordedPattern_' + TMP_ID];
    return KC.extractFeatures(mn, FEATURE_INTERVAL);
  }

  function recognize(strokes, box, limit) {
    if (!strokes || !strokes.length) return [];
    var feats = features(strokes, box);
    var coarse = KC.coarseClassification(feats);
    // 粗い分類の上位100件に同じ字の手本が複数入るため、字の種類で数えて広めに渡す
    var seen = {}, picked = [];
    for (var i = 0; i < coarse.length && picked.length < 100; i++) {
      var ch = KC.refPatterns[coarse[i][0]][0];
      if (!seen[ch]) { seen[ch] = 0; }
      if (seen[ch]++ < 3) picked.push(coarse[i]);
    }
    return fineRanked(feats, picked, limit);
  }

  // 追加の手本（手書きで登録したもの）。[字, 画数, 特徴量] の配列
  function makePattern(ch, strokes, box) {
    var f = features(strokes, box);
    return [ch, f.length, f, 'user'];
  }

  /*
   * 出題漢字との照合。認識失敗と書き間違いを区別する。
   *  - "correct": 1位が出題漢字
   *  - "retry":   出題漢字が上位にあり、1位との距離比が ratio 以下（正解候補）。
   *               書き直しを促す。不正解として記録しない。
   *  - "wrong":   はっきり別の字と認識された（seenAs に1位の字）
   * 「上位5位以内なら正解」は使わない：士を書くと土が100%上位5位に入るため、
   * 似た字の書き間違いを正解にしてしまう（tools/pairs.js の検証結果）。
   * ratio=1.25 は tools/threshold.js の検証で決めた値。
   */
  function judge(candidates, answer, opts) {
    opts = opts || {};
    var ratio = opts.ratio || 1.25;
    if (!candidates.length) return { result: 'retry', rank: -1, reason: 'empty' };
    var rank = -1;
    for (var i = 0; i < candidates.length; i++) if (candidates[i].char === answer) { rank = i; break; }
    if (rank === 0) return { result: 'correct', rank: 0 };
    var r = rank > 0 ? candidates[rank].score / candidates[0].score : Infinity;
    if (r <= ratio) return { result: 'retry', rank: rank, ratio: r, seenAs: candidates[0].char };
    return { result: 'wrong', rank: rank, ratio: r, seenAs: candidates[0].char };
  }

  /*
   * 手本の管理
   *  base:     同梱の参照パターン（KanjiCanvas）
   *  extras:   手書きで登録した手本（字ごとに複数可）
   *  replaced: 元の手本が壊れているため、登録した手本があれば元を使わない字
   */
  var base = null, extras = [], candidateSet = null, useExtras = true;
  var replaced = {};
  function rebuild() {
    if (!base) base = KC.refPatterns;
    var extraChars = {};
    if (useExtras) extras.forEach(function (p) { extraChars[p[0]] = true; });
    var list = base.filter(function (p) {
      if (candidateSet && !candidateSet[p[0]]) return false;
      if (useExtras && replaced[p[0]] && extraChars[p[0]]) return false;
      return true;
    });
    if (useExtras) list = list.concat(extras.filter(function (p) { return !candidateSet || candidateSet[p[0]]; }));
    KC.refPatterns = list;
    return list.length;
  }
  // 認識対象の文字を絞り込む（例：常用漢字のみ）。null で全パターンに戻す。
  function setCandidateSet(chars) {
    if (!base) base = KC.refPatterns;
    candidateSet = null;
    if (chars) { candidateSet = {}; for (var i = 0; i < chars.length; i++) candidateSet[chars[i]] = true; }
    rebuild();
    return base.filter(function (p) { return !candidateSet || candidateSet[p[0]]; }).length;
  }
  function addPatterns(list) { extras = extras.concat(list); rebuild(); return extras.length; }
  function clearPatterns() { extras = []; rebuild(); }
  function setExtras(list) { extras = list.slice(); rebuild(); return extras.length; }
  function setUseExtras(v) { useExtras = !!v; rebuild(); }
  function setReplaced(chars) { replaced = {}; for (var i = 0; i < chars.length; i++) replaced[chars[i]] = true; rebuild(); }

  function setStrokePenalty(v) { strokePenalty = v; }
  function setUserWeight(v) { userWeight = v; }
  function setUserStrict(v) { userStrict = !!v; }

  var api = {
    recognize: recognize, judge: judge, resample: resample, features: features,
    setCandidateSet: setCandidateSet, setStrokePenalty: setStrokePenalty, setUserWeight: setUserWeight, setUserStrict: setUserStrict,
    makePattern: makePattern, addPatterns: addPatterns, clearPatterns: clearPatterns,
    setExtras: setExtras, setUseExtras: setUseExtras, setReplaced: setReplaced
  };
  root.PopKanjiRecognizer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
