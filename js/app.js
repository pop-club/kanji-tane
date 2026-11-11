/*
 * かんじのたね 学習アプリ
 * 画面: #home #grade #test #result #weak #print #data #about
 * 習得のきまり（指示書 7章）:
 *   はじめて正解 → おぼえかけ / まちがい → にがて / 2回つづけて正解 → おぼえた（1週間後に再確認）
 *   再確認でまちがい → にがてに戻す / 読み取れなかった・判定ミスは まちがいにしない
 */
(function () {
  'use strict';
  var R = window.PopKanjiRecognizer, Store = window.PopKanjiStore;
  var QD = window.POPKANJI_QUESTIONS || {};
  // 学年の番号: 1〜6 = 小学校、7〜10 = 中学の字を漢検の級で分けたもの（4級・3級・準2級・2級）
  var GRADE_TOTAL = { 1: 80, 2: 160, 3: 200, 4: 202, 5: 193, 6: 191, 7: 313, 8: 284, 9: 328, 10: 185, 11: 863, 12: 3360 };
  var GRADE_NAME = { 1: '[1年生:1ねんせい]', 2: '[2年生:2ねんせい]', 3: '[3年生:3ねんせい]', 4: '[4年生:4ねんせい]', 5: '[5年生:5ねんせい]', 6: '[6年生:6ねんせい]',
    7: '漢検4級', 8: '漢検3級', 9: '漢検準2級', 10: '漢検2級', 11: '漢検準1級', 12: '漢検1級' };
  // 漢検協会の目安。準1級・1級は字の一覧が公開されていないため、JIS第1・第2水準の常用外の字で代用（data/kanken-levels.json）
  var LEVEL_NOTE = { 7: '中学在学程度', 8: '中学卒業程度', 9: '高校在学程度', 10: '高校卒業程度', 11: '大学・一般程度（JIS第1水準の字）', 12: '大学・一般程度（JIS第2水準の字）' };
  var SHORT_NAME = { 1: '[1年:1ねん]', 2: '[2年:2ねん]', 3: '[3年:3ねん]', 4: '[4年:4ねん]', 5: '[5年:5ねん]', 6: '[6年:6ねん]', 7: '4級', 8: '3級', 9: '準2級', 10: '2級', 11: '準1級', 12: '1級' };
  // モード: しょうがくせい（小1〜小6）／漢検（中学の字）。この端末に覚えておく
  var MODES = { sho: [1, 2, 3, 4, 5, 6], kanken: [7, 8, 9, 10, 11, 12] };
  var mode = 'sho';
  try { if (localStorage.getItem('kt-mode') === 'kanken') mode = 'kanken'; } catch (e) {}
  function levels() { return MODES[mode]; }
  function inMode(ch) { var k = KANJI[ch]; return !!k && levels().indexOf(k.grade) >= 0; }
  var DAY = 86400000, REVIEW_AFTER = 7 * DAY, MAX_RETRY = 3;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // ---------- 問題データ ----------
  var KANJI = {}, QUESTIONS = {}, QBYID = {};
  Object.keys(QD).forEach(function (g) {
    var d = QD[g];
    Object.keys(d.kanji).forEach(function (ch) { KANJI[ch] = d.kanji[ch]; KANJI[ch].char = ch; QUESTIONS[ch] = []; });
    d.questions.forEach(function (q) { QUESTIONS[q.kanji].push(q); QBYID[q.id] = q; });
  });
  function gradeChars(g) { return QD[g] ? Object.keys(QD[g].kanji) : []; }
  // 学年別漢字配当表（2020年度施行、js/grades.js）。習った字かどうかの判断に使う
  var STD_STROKES = window.POPKANJI_STROKES || {};   // 標準の画数（js/stroke-counts.js）
  var GRADE_OF = {};
  var GL = window.POPKANJI_GRADES || {};
  Object.keys(GL).forEach(function (g) { Array.from(GL[g]).forEach(function (c) { GRADE_OF[c] = +g; }); });
  function hasGrade(g) { return !!QD[g]; }

  /*
   * 画面の文字を、その子のレベルに合わせて漢字にする。
   * K('[今日:きょう]の [漢字:かんじ]') → 習った字だけの言葉は漢字、まだの字をふくむ言葉は ひらがな。
   * レベル: 小学生モードは「えらんだ学年 − 1」年までの字（1年生は ひらがなだけ）、漢検モードは常用漢字すべて。
   * 漢検モードでは、ことばの間の空白（わかち書き）も つめる。
   */
  var uiGrade = 1;
  try { uiGrade = +localStorage.getItem('kt-grade') || 1; } catch (e) {}
  function uiLevel() { return mode === 'kanken' ? 10 : Math.max(0, Math.min(6, uiGrade) - 1); }
  function K(s) {
    var lv = uiLevel();
    var out = String(s).replace(/\[([^:\]]+):([^\]]+)\]/g, function (m, k, rd) {
      return Array.from(k).every(function (c) { return !/[\u3400-\u9fff\uf900-\ufaff]/.test(c) || (GRADE_OF[c] && GRADE_OF[c] <= lv); }) ? k : rd;
    });
    if (lv >= 7) out = out.replace(/([^\x00-\x7F]) (?=[^\x00-\x7F])/g, '$1');
    return out;
  }
  function paintText() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-k]'), function (el) { el.textContent = K(el.getAttribute('data-k')); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-ka]'), function (el) { el.setAttribute('aria-label', K(el.getAttribute('data-ka'))); });
  }

  /*
   * ふりがなは <ruby> を使わず、「よみ」と「字」を縦に積んだ箱で表示する
   * （端末によって <ruby> のふりがなが □ の枠に隠れるため）。
   * 文は空白で区切ったまとまりごとに折り返す。
   * mode: 'test' 空欄 / 'answer' 答えを緑で / 'wrong' 答えを赤で / 'sheet' プリントの空欄 / 'sheetans' プリントのこたえ
   */
  function renderQ(q, mode) {
    // 中学の字の問題では、小学校で習った字だけの言葉には ふりがなを付けない
    var plainElem = !!(q.kanji && KANJI[q.kanji] && KANJI[q.kanji].grade >= 7);
    var words = [[]];
    q.tokens.forEach(function (t) {
      if (t.t === undefined) { words[words.length - 1].push(t); return; }
      var parts = t.t.split(/([ 　、]+)/);
      parts.forEach(function (p) {
        if (!p) return;
        if (/^[ 　]+$/.test(p)) { if (words[words.length - 1].length) words.push([]); return; }
        if (/^[ 　]*、[ 　]*$/.test(p)) { words[words.length - 1].push({ t: '、' }); words.push([]); return; }
        words[words.length - 1].push({ t: p });
      });
    });
    return words.filter(function (w) { return w.length; }).map(function (w) {
      return '<span class="qw">' + w.map(function (t) {
        if (t.t !== undefined) return '<span class="qc"><span class="qr" aria-hidden="true">&#8203;</span><span class="qk">' + esc(t.t) + '</span></span>';
        var body;
        if (t.k !== undefined) {
          body = esc(t.k);
          if (plainElem && Array.from(t.k).every(function (c) { return GRADE_OF[c] && GRADE_OF[c] <= 6; }))
            return '<span class="qc"><span class="qr" aria-hidden="true">&#8203;</span><span class="qk">' + body + '</span></span>';
        }
        else if (mode === 'test' || mode === 'sheet') body = '<span class="' + (mode === 'sheet' ? 'box' : 'blank') + '" aria-label="しかく"></span>';
        else if (mode === 'sheetans') body = '<span class="box ans">' + esc(t.b) + '</span>';
        else body = '<span class="blank filled' + (mode === 'wrong' ? ' ng' : '') + '">' + esc(t.b) + '</span>';
        return '<span class="qc"><span class="qr">' + esc(t.r) + '</span><span class="qk">' + body + '</span></span>';
      }).join('') + '</span>';
    }).join('');
  }
  function plainQ(q) { return q.tokens.map(function (t) { return t.t !== undefined ? t.t : (t.k || t.b); }).join(''); }

  // ---------- 習熟度 ----------
  function rec(ch) {
    return Store.get(ch) || { char: ch, grade: KANJI[ch] ? KANJI[ch].grade : 0, status: 'new', correct: 0, wrong: 0, streak: 0, recogErr: 0, history: [] };
  }
  function isDue(r, now) { return r.status === 'mastered' && r.reviewAt && r.reviewAt <= (now || Date.now()); }
  function applyResult(ch, qid, result) {
    var r = rec(ch), now = Date.now();
    if (result === 'correct') {
      r.correct++; r.streak++;
      if (r.status === 'mastered') { r.reviewAt = null; r.checkedAt = now; }       // 再確認に合格
      else if (r.streak >= 2) { r.status = 'mastered'; r.masteredAt = now; r.reviewAt = now + REVIEW_AFTER; }
      else if (r.status !== 'weak') r.status = 'candidate';
    } else if (result === 'wrong') {
      r.wrong++; r.streak = 0; r.status = 'weak'; r.reviewAt = null;
    } else if (result === 'recog') {
      r.recogErr = (r.recogErr || 0) + 1;                                            // 読み取りの問題は習熟度を変えない
    }
    r.lastAt = now; r.lastQ = qid;
    r.history = (r.history || []).concat([{ at: now, q: qid, r: result }]).slice(-30);
    return Store.save(r);
  }
  function statusCounts(chars) {
    var c = { mastered: 0, candidate: 0, weak: 0, due: 0, new: 0 }, now = Date.now();
    chars.forEach(function (ch) {
      var r = Store.get(ch);
      if (!r || r.status === 'new') c.new++;
      else { c[r.status]++; if (isDue(r, now)) c.due++; }
    });
    return c;
  }
  function reviewList() {
    var all = Store.all(), now = Date.now();
    return Object.keys(all).filter(function (ch) { return inMode(ch) && (all[ch].status === 'weak' || isDue(all[ch], now)); })
      .sort(function (a, b) { return (all[a].lastAt || 0) - (all[b].lastAt || 0); });
  }

  // ---------- 読み取りの準備 ----------
  var ready = false;
  // build.sh が付けた ?v=（バージョン）を、あとから読む手本データにも付ける
  var APP_VER = (function () { var c = document.currentScript; var m = c && /[?&]v=([^&]+)/.exec(c.src); return m ? m[1] : ''; })();
  if (/[?&]t=\d+/.test(location.search) && history.replaceState) history.replaceState(null, '', location.pathname + location.hash);   // 読みこみなおし用の ?t= を消す
  function loadScript(src) {
    if (APP_VER) src += '?v=' + APP_VER;
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.body.appendChild(s); });
  }
  $('loadstate').textContent = K('[読:よ]み[取:と]りの [準備中:じゅんびちゅう]…');
  loadScript('vendor/kanjicanvas/ref-patterns.js').then(function () {
    R.setCandidateSet(window.JOYO_KANJI);
    return loadScript('vendor/kanjivg-refs/kvg-refs.js').then(function () {
      // 元の手本の画数がちがう字は、KanjiVG の手本があれば元の手本を使わない（中学の字は、漢検モードで手本を読んでから効く）
      R.setReplaced('衛臨熟数歌社馬鳥鳴島進駅健散験慣敬' + '幾御驚駆騒傍離肝貫敢騎鶏駐篤乏薦駄騰駒緻鶴罵箸璃');
      R.setKvgRefs(window.POPKANJI_KVG_REFS);
    }, function () {});
  }).then(function () {
    return mode === 'kanken' ? loadMidRefs() : null;
  }).then(function () {
    ready = true;
    $('loadstate').textContent = '';
    updateAnswerBtn();
  }, function () {
    $('loadstate').textContent = K('[読:よ]み[取:と]りの データを [読:よ]み[込:こ]めませんでした。ページを [読:よ]み[込:こ]み[直:なお]してください。');
  });
  // 中学の字の手本（約4MB）は、漢検モードにしたときだけ読む
  var midLoading = null;
  function loadMidRefs() {
    if (!midLoading) midLoading = loadScript('vendor/kanjivg-refs/kvg-refs-mid.js').then(function () {
      R.setKvgRefs((window.POPKANJI_KVG_REFS || []).concat(window.POPKANJI_KVG_REFS_MID || []));
    });
    return midLoading;
  }
  // 準1級・1級の字の手本（約3MB・約8MB）は、その字をテストするときだけ読む
  var extLoading = {}, extChars = '';
  function loadExtRefs(lv) {
    if (!extLoading[lv]) extLoading[lv] = loadMidRefs().then(function () { return loadScript('vendor/kanjivg-refs/kvg-refs-' + lv + '.js'); }).then(function () {
      var add = window['POPKANJI_KVG_REFS_' + lv] || [];
      add.forEach(function (p) { if (!STD_STROKES[p[0]]) STD_STROKES[p[0]] = p[1]; });   // 常用外の字の画数は KanjiVG の画数
      extChars += GL[lv] || '';
      R.setCandidateSet((window.JOYO_KANJI || '') + extChars);
      var all = (window.POPKANJI_KVG_REFS || []).concat(window.POPKANJI_KVG_REFS_MID || []);
      [11, 12].forEach(function (k) { all = all.concat(window['POPKANJI_KVG_REFS_' + k] || []); });
      R.setKvgRefs(all);
    });
    return extLoading[lv];
  }
  function ensureRefs(chars) {
    var need = {};
    chars.forEach(function (ch) { var g = GRADE_OF[ch]; if (g >= 11) need[g] = true; });
    var lvs = Object.keys(need).filter(function (k) { return !window['POPKANJI_KVG_REFS_' + k]; });
    if (!lvs.length) return null;
    return Promise.all(lvs.map(function (k) { return loadExtRefs(+k); }));
  }
  function setMode(m) {
    if (m === mode || session) return;
    mode = m;
    try { localStorage.setItem('kt-mode', m); } catch (e) {}
    selected = null;
    paintMode();
    if (m === 'kanken' && ready && !window.POPKANJI_KVG_REFS_MID) {
      ready = false;
      $('loadstate').textContent = K('[漢字:かんじ]の [手本:てほん]を [読:よ]み[込:こ]み[中:ちゅう]…');
      loadMidRefs().then(function () { $('loadstate').textContent = ''; }, function () { $('loadstate').textContent = K('[手本:てほん]を [読:よ]み[込:こ]めませんでした'); })
        .then(function () { ready = true; updateAnswerBtn(); });
    }
    route();
  }
  function paintMode() {
    Array.prototype.forEach.call(document.querySelectorAll('#modeSw button'), function (b) { b.setAttribute('aria-pressed', b.dataset.m === mode); });
    document.body.classList.toggle('kanken', mode === 'kanken');
    paintText();
  }
  Array.prototype.forEach.call(document.querySelectorAll('#modeSw button'), function (b) { b.onclick = function () { setMode(b.dataset.m); }; });
  paintMode();

  // ---------- 画面の切り替え ----------
  var views = ['home', 'grade', 'test', 'result', 'weak', 'print', 'data', 'about'];
  function show(name) {
    views.forEach(function (v) { $('v-' + v).hidden = v !== name; });
    window.scrollTo(0, 0);
    document.body.classList.toggle('testing', name === 'test');
    if (name !== 'test') document.body.classList.remove('practicing');
    if (name === 'test' && pad) setTimeout(function () { fitPad(); pad.redraw(); }, 0);
  }
  function route() {
    var h = (location.hash || '#home').slice(1);
    if (views.indexOf(h) < 0) h = 'home';
    if (h === 'test' && !session) h = 'home';
    if (h === 'result' && !lastResult) h = 'home';
    if (h === 'print' && !printChars.length) h = 'weak';
    paintText();   // 固定の文を先に。そのあと各画面の render が動く文を書く
    if (h === 'home') renderHome();
    if (h === 'grade') renderGrade();
    if (h === 'weak') renderWeak();
    if (h === 'print') renderPrint();
    if (h === 'data') renderData();
    if (h === 'about') renderAbout();
    show(h);
  }
  function go(h) { if (location.hash === '#' + h) route(); else location.hash = h; }

  // ---------- ホーム ----------
  function renderHome() {
    var rv = reviewList();
    var weak = Object.keys(Store.all()).filter(function (ch) { return inMode(ch) && Store.get(ch).status === 'weak'; }).length;
    $('hReview').textContent = rv.length;
    $('hWeak').textContent = weak;
    $('hReviewBtn').disabled = !rv.length;
    $('hReviewBtn').textContent = rv.length ? K('[苦手:にがて]を [復習:ふくしゅう] する（') + Math.min(rv.length, 10) + K('[問:もん]）') : K('[復習:ふくしゅう]する [漢字:かんじ]は ありません');
    var html = '';
    levels().forEach(function (g) {
      if (!hasGrade(g)) {
        html += '<div class="level soon"><span>' + K(SHORT_NAME[g]) + '</span><span class="bar"></span><span class="n">' + K('[準備中:じゅんびちゅう]') + '</span></div>';
        return;
      }
      // 数字は「せいかいした字（おぼえた＋おぼえかけ）」。おぼえた は2回つづけて正解したときなので、1回めのテストでは 0 のまま
      var chars = gradeChars(g), c = statusCounts(chars), t = chars.length, done = c.mastered + c.candidate, tested = t - c.new;
      html += '<div class="level"><span>' + K(SHORT_NAME[g]) + '</span><span class="bar" role="img" aria-label="' + K(SHORT_NAME[g]) + ' ' + K('[覚:おぼ]えた ') + c.mastered + '字、' + K('[覚:おぼ]えかけ ') + c.candidate + '字、' + K('[苦手:にがて] ') + c.weak + '字 / ' + t + '字">' +
        '<i class="m" style="width:' + (100 * c.mastered / t) + '%"></i><i class="c" style="width:' + (100 * c.candidate / t) + '%"></i><i class="w" style="width:' + (100 * c.weak / t) + '%"></i>' +
        '</span><span class="n">' + done + ' / ' + t + '字</span>' +
        (tested ? '<small class="ld">' + K('[覚:おぼ]えた ') + c.mastered + '　' + K('[覚:おぼ]えかけ ') + c.candidate + '　' + K('[苦手:にがて] ') + c.weak + '</small>' : '') + '</div>';
    });
    $('hLevels').innerHTML = html;
    $('hLevelsTitle').textContent = mode === 'kanken' ? K('[級:きゅう]ごとの [覚:おぼ]え[具合:ぐあい]') : K('[学年:がくねん]ごとの [覚:おぼ]え[具合:ぐあい]');
  }
  $('hReviewBtn').onclick = function () { var l = reviewList(); if (l.length) startTest('review', 0, l.slice(0, 10)); };

  // ---------- 学年えらび ----------
  var pickGrade = uiGrade, pickN = 10;
  function renderGrade() {
    var html = '';
    if (levels().indexOf(pickGrade) < 0) pickGrade = mode === 'sho' ? uiGrade : levels()[0];
    $('gTitle').textContent = mode === 'kanken' ? K('どの [級:きゅう]に する？') : K('[何年生:なんねんせい]の [漢字:かんじ]？');
    levels().forEach(function (g) {
      var ok = hasGrade(g);
      var sample = ok ? gradeChars(g).slice(0, 4).join('') : '';
      var c = ok ? statusCounts(gradeChars(g)) : null;
      html += '<button class="grade' + (ok && g === pickGrade ? ' on' : '') + '" data-g="' + g + '"' + (ok ? '' : ' disabled') + '>' +
        '<b>' + K(GRADE_NAME[g]) + '</b>' + (LEVEL_NOTE[g] ? '<small>' + LEVEL_NOTE[g] + '</small>' : '') +
        (ok ? '<span class="sample">' + esc(sample) + '…</span><small>' + GRADE_TOTAL[g] + '字' + (gradeChars(g).length < GRADE_TOTAL[g] ? '（' + K('[問題:もんだい]は ') + gradeChars(g).length + '字ぶん）' : '') + ' ・ ' + K('[正解:せいかい] ') + (c.mastered + c.candidate) + '字（' + K('[覚:おぼ]えた ') + c.mastered + '）</small>'
            : '<small>' + GRADE_TOTAL[g] + '字 ・ ' + K('[準備中:じゅんびちゅう]') + '</small>') + '</button>';
    });
    $('gList').innerHTML = html;
    Array.prototype.forEach.call($('gList').querySelectorAll('.grade'), function (b) {
      b.onclick = function () {
        pickGrade = +b.dataset.g;
        if (pickGrade <= 6) { uiGrade = pickGrade; try { localStorage.setItem('kt-grade', pickGrade); } catch (e) {} paintText(); }
        renderGrade();
      };
    });
    $('gStart').disabled = !hasGrade(pickGrade);
  }
  Array.prototype.forEach.call($('gCount').querySelectorAll('button'), function (b) {
    b.onclick = function () {
      pickN = +b.dataset.n;
      Array.prototype.forEach.call($('gCount').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x === b); });
    };
  });
  $('gStart').onclick = function () { startTest('grade', pickGrade); };

  // ---------- テスト ----------
  var session = null, pad = null, lastResult = null;
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pickQuestion(ch) {
    var qs = QUESTIONS[ch], r = Store.get(ch);
    var pool = qs.filter(function (q) { return !r || q.id !== r.lastQ; });
    return (pool.length ? pool : qs)[Math.floor(Math.random() * (pool.length || qs.length))];
  }
  function chooseForGrade(g, n) {
    // 4もんに1もんくらい（10もんなら3もん）は、にがて・再確認の字を入れる。
    // のこりは まだ出ていない字 → にがて → 再確認 → おぼえかけ → おぼえた の順に
    var order = { new: 0, weak: 1, due: 2, candidate: 3, mastered: 4 }, now = Date.now();
    function kind(ch) { var r = Store.get(ch); return !r ? 'new' : isDue(r, now) ? 'due' : r.status; }
    var chars = shuffle(gradeChars(g).slice());
    var weak = chars.filter(function (ch) { var k = kind(ch); return k === 'weak' || k === 'due'; });
    var pick = weak.slice(0, Math.min(weak.length, Math.round(n / 4)));
    var rest = chars.filter(function (ch) { return pick.indexOf(ch) < 0; });
    rest.sort(function (a, b) { return order[kind(a)] - order[kind(b)]; });
    return shuffle(pick.concat(rest.slice(0, n - pick.length)));
  }
  function startTest(mode, grade, chars) {
    if (!chars) chars = chooseForGrade(grade, pickN);
    var wait = ensureRefs(chars);
    if (wait) {
      $('loadstate').textContent = K('[漢字:かんじ]の [手本:てほん]を [読:よ]み[込:こ]み[中:ちゅう]…（[初:はじ]めてのときは [少:すこ]し [時間:じかん]が かかります）');
      $('gStart').disabled = true;
      wait.then(function () { $('loadstate').textContent = ''; $('gStart').disabled = false; startTest(mode, grade, chars); },
        function () { $('loadstate').textContent = K('[手本:てほん]を [読:よ]み[込:こ]めませんでした'); $('gStart').disabled = false; });
      return;
    }
    session = { id: 's' + Date.now(), at: Date.now(), mode: mode, grade: grade, idx: 0,
      items: chars.map(function (ch) { return { ch: ch, q: pickQuestion(ch), result: null, tries: 0 }; }) };
    if (!pad) pad = new window.PopKanjiPad($('tPad'), { onChange: function (n) {
      $('tPadHint').hidden = n > 0;
      showCount(n);
      updateAnswerBtn();
    } });
    go('test');
    showItem();
  }
  function cur() { return session.items[session.idx]; }
  // 書く枠の左上：いまの画数 / その字の画数（ヒント）。ちょうどなら緑、多すぎたら黄色
  function showCount(n) {
    var el = $('tCount'), std = session && STD_STROKES[cur().ch];
    el.hidden = !n && !std;
    el.textContent = std ? n + ' / ' + std + K('[画:かく]') : n + K('[画:かく]');
    el.className = 'padcount' + (std && n === std ? ' ok' : std && n > std ? ' over' : '');
  }
  function updateAnswerBtn() {
    if (!pad || !session) return;
    var n = pad.strokes().length;
    var busy = answered && !practicing;
    $('tAnswer').disabled = !ready || !n || busy;
    $('tAnswer').textContent = !ready ? K('[準備中:じゅんびちゅう]…') : practicing ? K('[書:か]けた！') : K('[答:こた]える');
    $('tUndo').disabled = !n || busy; $('tClear').disabled = !n || busy;
  }
  var answered = false, pending = null, practicing = false;
  function showItem() {
    var it = cur(), n = session.items.length, k = KANJI[it.ch];
    answered = false; pending = null; practicing = false; practiceBusy = false;
    pad.setGuide(null); pad.setInk(null); $('tPad').classList.remove('ok', 'ng');
    $('tFb').classList.remove('practicing'); document.body.classList.remove('practicing');
    $('tNum').textContent = (session.idx + 1) + ' / ' + n;
    $('tProg').style.width = (100 * session.idx / n) + '%';
    $('tLabel').textContent = it.again ? K('もう[一度:いちど]：さっき [間違:まちが]えた [漢字:かんじ]だよ') :
      session.mode === 'review' ? K('[復習:ふくしゅう]：[四角:しかく]に [入:はい]る [漢字:かんじ]を [書:か]こう') : K(GRADE_NAME[k.grade]) + K('：[四角:しかく]に [入:はい]る [漢字:かんじ]を [書:か]こう');
    $('tLabel').classList.toggle('again', !!it.again);
    $('tQ').innerHTML = renderQ(it.q, 'test');
    $('tQ').dataset.qid = it.q.id;
    $('tHint').hidden = true;
    $('tFb').hidden = true; $('tFb').innerHTML = '';
    $('tControls').hidden = false; $('tNextRow').hidden = true; $('tSkip').hidden = false;
    pad.lock(false); pad.clear();
    showCount(0);
    updateAnswerBtn();
    window.scrollTo(0, 0);
    fitPad();
  }
  // スマホ縦向き：問題・書く枠・ボタンが1画面に収まるように、枠の大きさを決める
  var narrowMq = window.matchMedia('(orientation: portrait), (max-width: 820px) and (min-height: 561px)');
  function fitPad() {
    var w = $('tPad').parentNode;
    w.style.width = '';
    if (!session || !narrowMq.matches || $('v-test').hidden) return;
    var full = w.getBoundingClientRect().width;
    var top = $('tPad').getBoundingClientRect().top + window.scrollY;
    var below = 0;
    Array.prototype.forEach.call(w.children, function (c) { if (c.id !== 'tPad' && !c.hidden) below += c.getBoundingClientRect().height + 10; });
    var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var avail = Math.floor(vh - top - below - 12);
    var min = answered && !practicing ? 150 : 230;
    var size = Math.max(min, Math.min(full, avail));
    if (size < full) w.style.width = size + 'px';
  }
  window.addEventListener('resize', function () { if (session) fitPad(); });
  function infoDl(ch) {
    var k = KANJI[ch];
    var yomi = [].concat(k.on, k.kun).filter(Boolean).join('・') || '—';
    var hasK = k.meaningTokens && k.meaningTokens.some(function (t) { return t.k !== undefined; });
    var mean = hasK ? '<span class="qline mline">' + renderQ({ tokens: k.meaningTokens, kanji: ch }, 'answer') + '</span>' : esc(k.meaning);
    return '<dl><dt>' + K('[読:よ]み') + '</dt><dd>' + esc(yomi) + '</dd><dt>' + K('[意味:いみ]') + '</dt><dd>' + mean + '</dd>' +
      (k.words && k.words.length ? '<dt>' + K('[言葉:ことば]') + '</dt><dd class="kj">' + esc(k.words.slice(0, 4).join('　')) + '</dd>' : '') + '</dl>';
  }
  function feedback(kind, verdict, detail, withInfo, misjudge) {
    var it = cur();
    var showAns = kind !== 'retry';   // 書き直しのときは答えを見せない
    var html = '<div class="fb ' + kind + '" role="status"><div class="head">' + (showAns ? '<span class="ans">' + esc(it.ch) + '</span>' : '') + '<div><div class="verdict">' + verdict + '</div>' +
      (detail ? '<div>' + detail + '</div>' : '') + '</div></div>' + (withInfo ? infoDl(it.ch) : '') +
      (kind === 'wrong' || kind === 'recog' ? '<button class="btn practice" id="tPractice">✏️ ' + K('お[手本:てほん]を [見:み]て [練習:れんしゅう]する') + '</button><div class="pmsg" id="tPmsg" aria-live="polite"></div>' : '') +
      (misjudge ? '<button class="misjudge" id="tMis">' + K('[正:ただ]しく [書:か]いたのに [間違:まちが]いに なった') + '</button>' : '') + '</div>';
    $('tFb').innerHTML = html; $('tFb').hidden = false;
    setTimeout(fitPad, 0);
    if ($('tPractice')) $('tPractice').onclick = startPractice;
    if (misjudge) $('tMis').onclick = function () {
      pending = 'recog';
      $('tFb').firstChild.className = 'fb recog';
      $('tFb').querySelector('.verdict').textContent = K('[間違:まちが]いに しませんでした');
      this.remove();
    };
  }
  function finishItem(result, seenAs) {
    var it = cur();
    answered = true; pending = result; it.seenAs = seenAs || null;
    it.strokes = pad.strokes256();
    pad.lock(true);
    $('tControls').hidden = true; $('tSkip').hidden = true; $('tNextRow').hidden = false;
    $('tQ').innerHTML = renderQ(it.q, result === 'correct' ? 'answer' : 'wrong');
    $('tNext').focus({ preventScroll: true });
    updateAnswerBtn();
    fitPad();
  }
  // まちがえた字の練習：お手本をうすく出して、なぞって書く。記録（まちがい）は変えない
  var practiceOk = 0, practiceBusy = false;
  function startPractice() {
    practicing = true; practiceOk = 0; practiceBusy = false;
    pad.setGuide(cur().ch);
    pad.lock(false); pad.clear();
    $('tControls').hidden = false;
    $('tPmsg').textContent = K('うすい お[手本:てほん]を なぞって [書:か]いてみよう');
    $('tPractice').hidden = true;
    $('tFb').classList.add('practicing'); document.body.classList.add('practicing');
    updateAnswerBtn();
    fitPad();
    setTimeout(function () { try { $('tControls').scrollIntoView({ block: 'end', behavior: 'smooth' }); } catch (e) {} }, 50);
  }
  // 書けたら：線が緑になり、枠が光って「できた！」が出る → 少しして消して、もう一度書ける
  // おしいとき：枠が黄色く ゆれる
  function practiceCheck() {
    if (practiceBusy) return;
    var it = cur(), padEl = $('tPad');
    var cands = R.recognize(pad.strokes(), { width: pad.size(), height: pad.size() }, 10);
    var ok = R.judge(cands, it.ch).result === 'correct';
    padEl.classList.remove('ok', 'ng'); void padEl.offsetWidth;
    if (ok) {
      practiceOk++;
      practiceBusy = true;
      pad.setInk('--ok'); pad.lock(true);
      padEl.classList.add('ok');
      $('tStamp').innerHTML = '<span class="mark">◎</span><span class="word">' + esc(K('よく [書:か]けたね！')) + '</span>';
      $('tPmsg').textContent = K('よく [書:か]けたね！') + '（' + practiceOk + K('[回:かい]）') + K(' もう[一度:いちど] [書:か]いてみよう');
      $('tPmsg').className = 'pmsg ok';
      setTimeout(function () {
        if (!practicing) return;
        padEl.classList.remove('ok'); pad.setInk(null); pad.lock(false); pad.clear(); practiceBusy = false; updateAnswerBtn();
      }, 1400);
    } else {
      padEl.classList.add('ng');
      $('tPmsg').textContent = K('おしい！ お[手本:てほん]を よく [見:み]て [書:か]こう');
      $('tPmsg').className = 'pmsg ng';
      setTimeout(function () { padEl.classList.remove('ng'); }, 600);
    }
    updateAnswerBtn();
  }
  $('tUndo').onclick = function () { pad.undo(); };
  $('tClear').onclick = function () { pad.clear(); };
  $('tAnswer').onclick = function () {
    if (practicing) { if (pad.strokes().length) practiceCheck(); return; }
    if (!ready || answered || !pad.strokes().length) return;
    var it = cur();
    var cands = R.recognize(pad.strokes(), { width: pad.size(), height: pad.size() }, 10);
    var j = R.judge(cands, it.ch);
    it.tries++;
    // 画数がちがうと読み取れないことが多い（例: 五の2画目と3画目をつなげる）。
    // 1回めは画数のヒントを出して書き直し、2回めも画数がちがえば理由を伝えてまちがいにする。
    var std = STD_STROKES[it.ch], n = pad.strokes().length, mismatch = !!std && n !== std;
    if (j.result === 'correct') {
      feedback('correct', K('[正解:せいかい]！'), it.again ? K('[今度:こんど]は [書:か]けたね。[別:べつ]の [日:ひ]にも [書:か]けたら「[覚:おぼ]えた」に なるよ。') : '', true, false);
      finishItem('correct');
    } else if (mismatch && !it.strokeHinted) {
      it.strokeHinted = true;
      feedback('retry', std + K('[画:かく]で [書:か]いてみよう'), K('[今:いま]は ') + n + K('[画:かく] だったよ。1[画:かく]ずつ [離:はな]して [書:か]こう。'), false, false);
      pad.clear();
    } else if (j.result === 'retry' && it.tries < MAX_RETRY) {
      feedback('retry', K('もう[一度:いちど] ていねいに [書:か]いてね'), K('うまく [読:よ]み[取:と]れなかったよ（') + it.tries + ' / ' + MAX_RETRY + '）', false, false);
      pad.clear();
      $('tHint').hidden = true;
    } else if (j.result === 'retry') {
      feedback('recog', K('[読:よ]み[取:と]れませんでした'), K('[間違:まちが]いには しません。[答:こた]えは この [漢字:かんじ]です。'), true, false);
      finishItem('recog');
    } else {
      // 「〜に みえたよ」と見せるのは、その子が習った・習いそうな字（学年＋1まで）だけ。上位5つから選ぶ
      var maxGrade = (KANJI[it.ch] ? KANJI[it.ch].grade : 1) + 1;
      var shown = null;
      for (var i = 0; i < Math.min(cands.length, 5); i++) {
        var g = GRADE_OF[cands[i].char];
        if (cands[i].char !== it.ch && g && g <= maxGrade) { shown = cands[i].char; break; }
      }
      var seen = mismatch ? K('[画数:かくすう]が [違:ちが]ったよ（[正:ただ]しくは ') + std + K('[画:かく]）。[答:こた]えは この [漢字:かんじ]。')
        : shown ? '「<span class="kj">' + esc(shown) + '</span>」' + K('に [見:み]えたよ。[答:こた]えは この [漢字:かんじ]。') : K('[違:ちが]う [漢字:かんじ]に [見:み]えたよ。[答:こた]えは この [漢字:かんじ]。');
      feedback('wrong', K('[残念:ざんねん]'), seen, true, true);
      finishItem('wrong', j.seenAs);
    }
    it.top = cands.slice(0, 5).map(function (c) { return c.char; }).join('');
  };
  $('tSkip').onclick = function () {
    if (answered) return;
    cur().tries++;
    feedback('wrong', K('[答:こた]えは この [漢字:かんじ]'), K('[次:つぎ]は [書:か]けるように [練習:れんしゅう] しよう。'), true, false);
    finishItem('wrong', null);
  };
  $('tNext').onclick = function () {
    var it = cur();
    it.result = pending;
    // 「もういちど」は答えを見た直後なので、記録（にがて・おぼえた）は変えない
    if (!it.again) applyResult(it.ch, it.q.id, pending);
    saveSession(session.items.filter(function (x) { return x.result; }));   // 1問ごとに保存（とちゅうで とじても のこる）
    if (session.idx + 1 >= session.items.length && !session.againAdded) {
      // さいごに、このテストで まちがえた字を もういちど出す（ちがう問題で、1回だけ）
      session.againAdded = true;
      session.items.forEach(function (x) {
        if (!x.again && x.result === 'wrong') session.items.push({ ch: x.ch, q: pickQuestion(x.ch), result: null, tries: 0, again: true });
      });
    }
    if (session.idx + 1 < session.items.length) { session.idx++; showItem(); }
    else endTest();
  };
  var quitArmed = false;
  $('tQuit').onclick = function () {
    if (!quitArmed) { quitArmed = true; this.textContent = K('[本当:ほんとう]に やめる？'); var b = this; setTimeout(function () { quitArmed = false; b.textContent = K('やめる'); }, 3000); return; }
    quitArmed = false; this.textContent = 'やめる';
    // こたえた ところまでを保存する（「つぎへ」を おす前の 問題も ふくめる）
    var it = cur();
    if (answered && !it.result) { it.result = pending; if (!it.again) applyResult(it.ch, it.q.id, pending); }
    var done = session.items.filter(function (x) { return x.result; });
    if (!done.length) { session = null; go('home'); return; }
    saveSession(done);
    lastResult = { mode: session.mode, grade: session.grade, items: done, partial: true };
    session = null;
    renderResult();
    go('result');
  };
  function saveSession(items) {
    Store.addSession({ id: session.id, at: session.at, mode: session.mode, grade: session.grade,
      items: items.map(function (x) {
        var o = { ch: x.ch, q: x.q.id, result: x.result, tries: x.tries, seenAs: x.seenAs, top: x.top || null };
        if (x.again) o.again = true;
        if (x.result !== 'correct') o.strokes = x.strokes;   // まちがい・読み取れなかった字の筆跡（読み取り改善用、この端末だけ）
        return o;
      }) });
  }
  function endTest() {
    saveSession(session.items);
    lastResult = { mode: session.mode, grade: session.grade, items: session.items };
    session = null;
    renderResult();
    go('result');
  }

  // ---------- 結果 ----------
  var PILL = { correct: '[正解:せいかい]', wrong: '[間違:まちが]い', recog: '[読:よ]み[取:と]れず' };
  function renderResult() {
    var all = lastResult.items;
    var items = all.filter(function (x) { return !x.again; }), again = all.filter(function (x) { return x.again; });
    var ok = items.filter(function (x) { return x.result === 'correct'; }).length;
    var wrong = items.filter(function (x) { return x.result === 'wrong'; });
    var recog = items.filter(function (x) { return x.result === 'recog'; }).length;
    $('rScore').textContent = ok;
    $('rOf').textContent = '/ ' + items.length + K(' [問:もん] [正解:せいかい]') + (lastResult.partial ? K('（[途中:とちゅう]で やめた ところまで）') : '');
    $('rNote').textContent = (wrong.length ? K('[間違:まちが]えた ') + wrong.length + K('字は [苦手:にがて]リストに [入:はい]りました。') : K('[間違:まちが]いは ありませんでした。')) +
      (recog ? K(' [読:よ]み[取:と]れなかった ') + recog + K('字は [間違:まちが]いに していません。') : '') +
      (again.length ? K(' もう[一度:いちど]：') + again.filter(function (x) { return x.result === 'correct'; }).length + ' / ' + again.length + K('字 [書:か]けました。') : '');
    function row(x) {
      return '<div class="ritem' + (x.again ? ' again' : '') + '"><span class="k">' + esc(x.ch) + '</span><span class="q qline">' + renderQ(x.q, x.result === 'correct' ? 'answer' : 'wrong') +
        '</span><span class="pill ' + x.result + '">' + (x.again ? K('もう[一度:いちど] ') : '') + K(PILL[x.result]) + '</span></div>';
    }
    $('rList').innerHTML = items.map(row).join('') + (again.length ? '<h3 class="rsub">' + K('もう[一度:いちど] [書:か]いた [漢字:かんじ]') + '</h3>' + again.map(row).join('') : '');
    $('rPrint').disabled = !wrong.length;
    $('rPrint').textContent = wrong.length ? K('[間違:まちが]えた [漢字:かんじ]の プリント（') + wrong.length + '字）' : K('[間違:まちが]えた [漢字:かんじ]は ありません');
  }
  $('rPrint').onclick = function () {
    printChars = uniq(lastResult.items.filter(function (x) { return !x.again && x.result === 'wrong'; }).map(function (x) { return x.ch; }));
    printFrom = 'result'; go('print');
  };
  $('rAgain').onclick = function () {
    if (lastResult.mode === 'grade') startTest('grade', lastResult.grade);
    else { var l = reviewList(); if (l.length) startTest('review', 0, l.slice(0, 10)); else go('home'); }
  };
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  // ---------- 新しいバージョンの読みこみ ----------
  // ブラウザに残っている古いページを取りなおしてから開きなおす（学習の記録 IndexedDB はそのまま）
  $('aUpdate').onclick = function () {
    var btn = this; btn.disabled = true; $('aUpMsg').textContent = K('[読:よ]み[込:こ]み[中:ちゅう]…');
    var url = location.pathname + '?t=' + Date.now();
    fetch(location.pathname, { cache: 'reload' }).catch(function () {}).then(function () {
      location.replace(url + '#home');
    });
  };

  // ---------- 苦手リスト ----------
  var weakGrade = 1, selected = null;
  var GROUPS = [
    ['weak', '[苦手:にがて]', 'wrong'], ['due', 'もう[一度:いちど] [確認:かくにん]', 'recog'], ['candidate', '[覚:おぼ]えかけ', ''], ['mastered', '[覚:おぼ]えた', 'correct'], ['new', 'まだ テストして いない', '']
  ];
  function kindOf(ch, now) { var r = Store.get(ch); if (!r || r.status === 'new') return 'new'; if (isDue(r, now)) return 'due'; return r.status; }
  function renderWeak() {
    var now = Date.now();
    if (!selected) {
      selected = {};
      Object.keys(Store.all()).forEach(function (ch) { var k = kindOf(ch, now); if (k === 'weak' || k === 'due') selected[ch] = true; });
    }
    var tabs = '';
    if (levels().indexOf(weakGrade) < 0) weakGrade = levels()[0];
    levels().forEach(function (g) {
      if (!hasGrade(g)) return;
      var c = statusCounts(gradeChars(g));
      tabs += '<button class="tab" role="tab" data-g="' + g + '" aria-selected="' + (g === weakGrade) + '">' + K(SHORT_NAME[g]) + K('（[苦手:にがて] ') + c.weak + '）</button>';
    });
    $('wTabs').innerHTML = tabs;
    Array.prototype.forEach.call($('wTabs').querySelectorAll('.tab'), function (b) { b.onclick = function () { weakGrade = +b.dataset.g; renderWeak(); }; });
    var chars = gradeChars(weakGrade), html = '';
    GROUPS.forEach(function (gr) {
      var list = chars.filter(function (ch) { return kindOf(ch, now) === gr[0]; });
      html += '<div class="group"><h3>' + K(gr[1]) + ' <span class="pill ' + gr[2] + '">' + list.length + '字</span></h3>';
      if (!list.length) html += '<div class="empty">' + K('ありません') + '</div>';
      else html += '<div class="kgrid">' + list.map(function (ch) {
        var r = Store.get(ch);
        var meta = r ? '○' + r.correct + ' ×' + r.wrong + (r.lastAt ? ' ・ ' + new Date(r.lastAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '') : '';
        return '<button class="chipk" data-ch="' + esc(ch) + '" aria-pressed="' + !!selected[ch] + '"><span class="k">' + esc(ch) + '</span><small>' + (meta || '&nbsp;') + '</small></button>';
      }).join('') + '</div>';
      html += '</div>';
    });
    $('wGroups').innerHTML = html;
    Array.prototype.forEach.call($('wGroups').querySelectorAll('.chipk'), function (b) {
      b.onclick = function () { var ch = b.dataset.ch; selected[ch] = !selected[ch]; b.setAttribute('aria-pressed', !!selected[ch]); updateSel(); };
    });
    updateSel();
  }
  function selList() { return Object.keys(selected || {}).filter(function (ch) { return selected[ch] && KANJI[ch]; }); }
  function updateSel() {
    var n = selList().length;
    $('wSel').textContent = n + K('字 [選:えら]んで います');
    $('wTest').disabled = !n; $('wPrint').disabled = !n;
  }
  $('wAll').onclick = function () {
    var chars = gradeChars(weakGrade), allOn = chars.every(function (ch) { return selected[ch]; });
    chars.forEach(function (ch) { selected[ch] = !allOn; });
    renderWeak();
  };
  $('wTest').onclick = function () { var l = shuffle(selList()); if (l.length) startTest('review', 0, l.slice(0, 20)); };
  $('wPrint').onclick = function () { printChars = selList(); printFrom = 'weak'; go('print'); };

  // ---------- プリント ----------
  var printChars = [], printFrom = 'weak', ROWS = 10;
  function questionsForPrint(ch, per) {
    // まちがえた問題を先に、つぎに熟語、それから文
    var r = Store.get(ch), qs = QUESTIONS[ch].slice(), wrongIds = {};
    if (r && r.history) r.history.forEach(function (h) { if (h.r === 'wrong') wrongIds[h.q] = true; });
    qs.sort(function (a, b) { return (wrongIds[b.id] ? 2 : 0) - (wrongIds[a.id] ? 2 : 0) || (a.type === 'word' ? -1 : 1) - (b.type === 'word' ? -1 : 1); });
    return qs.slice(0, per);
  }
  function sheetQ(q, answer) { return renderQ(q, answer ? 'sheetans' : 'sheet'); }
  function renderPrint() {
    var per = +$('pPer').value, trace = $('pTrace').checked, withAns = $('pAnswer').checked;
    var rows = [];
    printChars.forEach(function (ch) { questionsForPrint(ch, per).forEach(function (q) { rows.push({ ch: ch, q: q }); }); });
    var pages = [];
    for (var i = 0; i < rows.length; i += ROWS) pages.push(rows.slice(i, i + ROWS));
    var today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    var grades = uniq(printChars.map(function (ch) { return KANJI[ch].grade; })).sort(function (a, b) { return a - b; }).map(function (g) { return g <= 6 ? '小' + g : GRADE_NAME[g]; }).join('・');
    var total = pages.length * (withAns ? 2 : 1), pageNo = 0;
    function sheet(rowsOnPage, startNo, answer) {
      pageNo++;
      return '<div class="sheet-wrap"><div class="sheet">' +
        '<div class="sh-head"><div><h2>' + (answer ? K('[答:こた]え') : K('[漢字:かんじ] [練習:れんしゅう]プリント')) + '</h2><p>' +
        (answer ? K('[赤:あか]い [字:じ]が [答:こた]えです。') : K('[四角:しかく]に [入:はい]る [漢字:かんじ]を [書:か]いて、マスで [練習:れんしゅう] しよう。')) + '</p></div>' +
        '<div class="sh-meta"><span>' + K('[日付:ひづけ]') + '　' + esc(today) + '</span>' + (answer ? '' : '<span class="name">' + K('[名前:なまえ]') + '</span>') + '</div></div>' +
        rowsOnPage.map(function (row, k) {
          var cells = '';
          for (var c = 0; c < 5; c++) cells += '<span class="sh-cell">' + ((answer || trace) && c === 0 ? esc(row.ch) : '') + '</span>';
          return '<div class="sh-row"><span class="sh-no">' + (startNo + k + 1) + '.</span><span class="sh-q qline">' + sheetQ(row.q, answer) + '</span><span class="sh-grid">' + cells + '</span></div>';
        }).join('') +
        '<div class="sh-foot"><span>かんじのたね ・ ' + esc(grades) + '</span><span>' + pageNo + ' / ' + total + '</span></div></div></div>';
    }
    var html = '';
    pages.forEach(function (p, i) { html += sheet(p, i * ROWS, false); });
    if (withAns) pages.forEach(function (p, i) { html += sheet(p, i * ROWS, true); });
    $('pSheets').innerHTML = html;
    $('pNote').textContent = printChars.length + '字・' + rows.length + K('[問:もん]（A4 ') + total + K('[枚:まい]）。[印刷:いんさつ]の [設定:せってい]で「余白なし」または「既定」、倍率100%を [選:えら]んでください。');
  }
  ['pPer', 'pTrace', 'pAnswer'].forEach(function (id) { $(id).onchange = renderPrint; });
  $('pPrintBtn').onclick = function () { window.print(); };
  $('pBack').onclick = function () { go(printFrom === 'result' && lastResult ? 'result' : 'weak'); };

  // ---------- データ ----------
  function renderData() {
    var n = Object.keys(Store.all()).length, s = Store.sessions().length;
    $('dState').textContent = (Store.persistent() ? 'この端末に保存しています。' : 'この端末に保存できない設定のため、ページを閉じると記録は消えます。') +
      ' 記録のある字: ' + n + '字 ・ テストの回数: ' + s + '回';
  }
  $('dExport').onclick = function () {
    try {
      var blob = new Blob([JSON.stringify(Store.exportData())], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kanji-tane-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      $('dMsg').textContent = '書き出しました。';
    } catch (e) { $('dMsg').textContent = '書き出せませんでした。'; }
  };
  $('dImport').onchange = function () {
    var f = this.files && this.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var data;
      try { data = JSON.parse(rd.result); } catch (e) { $('dMsg').textContent = 'ファイルを読めませんでした。かんじのたね で書き出したファイルを選んでください。'; return; }
      Store.importData(data).then(function () { selected = null; $('dMsg').textContent = '読み込みました。'; renderData(); },
        function (e) { $('dMsg').textContent = e.message + '。かんじのたね で書き出したファイルを選んでください。'; });
    };
    rd.readAsText(f);
    this.value = '';
  };
  var resetArmed = false;
  $('dReset').onclick = function () {
    if (!resetArmed) { resetArmed = true; this.textContent = '本当に消す（元に戻せません）'; var b = this; setTimeout(function () { resetArmed = false; b.textContent = '学習の記録をすべて消す'; }, 4000); return; }
    resetArmed = false; this.textContent = '学習の記録をすべて消す';
    Store.reset().then(function () { selected = null; $('dMsg').textContent = '学習の記録を消しました。'; renderData(); });
  };

  function renderAbout() {
    var ok = [], soon = [];
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach(function (g) { (hasGrade(g) ? ok : soon).push(g); });
    var nm = function (g) { return g <= 6 ? '小' + g : GRADE_NAME[g]; };
    $('aRange').textContent = '問題があるのは ' + ok.map(function (g) { return nm(g) + '（' + GRADE_TOTAL[g] + '字）'; }).join('・') + ' です。' +
      (soon.length ? soon.map(nm).join('・') + ' は準備中です。' : '') +
      ' 手書きの読み取りは、小学校の1026字、中学・高校の1110字（漢検4級〜2級）、JIS第1・第2水準の常用外の4223字（漢検準1級・1級の目安）に対応しています。中学からの字の手本は漢検モードにしたときに、準1級・1級の手本はその字をテストするときに読みこみます。' +
      ' 漢検の準1級・1級は字の一覧が公開されていないため、協会の示す目安（JIS第1水準・第2水準）で分けています。実際の出題範囲とは一部ちがいます。';
  }

  // ---------- はじめ ----------
  Store.init().then(function () {
    window.addEventListener('hashchange', route);
    route();
  });
})();
