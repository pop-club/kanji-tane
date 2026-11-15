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
  var QD = window.POPKANJI_QUESTIONS = window.POPKANJI_QUESTIONS || {};
  // 学年の番号: 1〜6 = 小学校、7〜10 = 中学の字を漢検の級で分けたもの（4級・3級・準2級・2級）
  // 65 = 漢検5級（小学校で習う1026字ぜんぶ。卒業テストのように使う）
  var SHO_ALL = 65;
  var GRADE_TOTAL = { 1: 80, 2: 160, 3: 200, 4: 202, 5: 193, 6: 191, 65: 1026, 7: 313, 8: 284, 9: 328, 10: 185, 11: 863, 12: 3360 };
  var GRADE_NAME = { 1: '[1年生:1ねんせい]', 2: '[2年生:2ねんせい]', 3: '[3年生:3ねんせい]', 4: '[4年生:4ねんせい]', 5: '[5年生:5ねんせい]', 6: '[6年生:6ねんせい]',
    65: '漢検5級', 7: '漢検4級', 8: '漢検3級', 9: '漢検準2級', 10: '漢検2級', 11: '漢検準1級', 12: '漢検1級' };
  // 漢検協会の目安。準1級・1級は字の一覧が公開されていないため、JIS第1・第2水準の常用外の字で代用（data/kanken-levels.json）
  var LEVEL_NOTE = { 65: '小学校卒業程度（1〜6年の字ぜんぶ）', 7: '中学在学程度', 8: '中学卒業程度', 9: '高校在学程度', 10: '高校卒業程度', 11: '大学・一般程度（JIS第1水準の字）', 12: '大学・一般程度（JIS第2水準の字）' };
  var SHORT_NAME = { 1: '[1年:1ねん]', 2: '[2年:2ねん]', 3: '[3年:3ねん]', 4: '[4年:4ねん]', 5: '[5年:5ねん]', 6: '[6年:6ねん]', 65: '5級', 7: '4級', 8: '3級', 9: '準2級', 10: '2級', 11: '準1級', 12: '1級' };
  // モード: しょうがくせい（小1〜小6）／漢検（中学の字）。この端末に覚えておく
  var MODES = { sho: [1, 2, 3, 4, 5, 6], kanken: [SHO_ALL, 7, 8, 9, 10, 11, 12] };
  var mode = 'sho';
  try { if (localStorage.getItem('kt-mode') === 'kanken') mode = 'kanken'; } catch (e) {}
  function levels() { return MODES[mode]; }
  function inMode(ch) { var g = QG[ch]; return !!g && (levels().indexOf(g) >= 0 || (mode === 'kanken' && g <= 6)); }
  var DAY = 86400000, REVIEW_AFTER = 7 * DAY, MAX_RETRY = 3;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // ---------- 問題データ ----------
  // 問題は 学年・級ごとのファイル（q/<学年>.js）。はじめは読まず、テスト・練習・読みの問題・プリントの前に、使う学年のぶんだけ読む。
  // ホームの字数・育ち具合は js/grades.js の POPKANJI_QCHARS（問題のある字の一覧）で数える
  var QCH = window.POPKANJI_QCHARS || {};
  var QG = {};   // 字 → 問題のある学年・級
  Object.keys(QCH).forEach(function (g) { Array.from(QCH[g]).forEach(function (c) { QG[c] = +g; }); });
  var KANJI = {}, QUESTIONS = {}, QBYID = {}, qAdded = {};
  function addGrade(g) {
    var d = QD[g];
    if (!d || qAdded[g]) return;
    qAdded[g] = true;
    Object.keys(d.kanji).forEach(function (ch) { KANJI[ch] = d.kanji[ch]; KANJI[ch].char = ch; QUESTIONS[ch] = []; });
    d.questions.forEach(function (q) { QUESTIONS[q.kanji].push(q); QBYID[q.id] = q; });
  }
  Object.keys(QD).forEach(addGrade);
  function gradeChars(g) {
    if (+g === SHO_ALL) return [1, 2, 3, 4, 5, 6].reduce(function (a, k) { return a.concat(gradeChars(k)); }, []);
    return QCH[g] ? Array.from(QCH[g]) : [];
  }
  // 学年別漢字配当表（2020年度施行、js/grades.js）。習った字かどうかの判断に使う
  var STD_STROKES = window.POPKANJI_STROKES || {};   // 標準の画数（js/stroke-counts.js）
  // 判定ミスの報告先（Google Apps Script のウェブアプリ URL）。空なら送らない（今までどおり端末の中だけで記録する）
  var REPORT_URL = window.POPKANJI_REPORT_URL || 'https://script.google.com/macros/s/AKfycbwXKyThC6aNYodJZLmWgu3c1IOUQUafF7_Z30UMd1CXpZgvW0jb8Xc0DZL2VL7OKeih7Q/exec';
  var REPORT_TIMEOUT = 20000;
  var GRADE_OF = {};
  var GL = window.POPKANJI_GRADES || {};
  Object.keys(GL).forEach(function (g) { Array.from(GL[g]).forEach(function (c) { GRADE_OF[c] = +g; }); });
  function hasGrade(g) { return +g === SHO_ALL ? [1, 2, 3, 4, 5, 6].every(function (k) { return !!QCH[k]; }) : !!QCH[g]; }

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
    var plainElem = !!(q.kanji && QG[q.kanji] >= 7);
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
        if (t.mb !== undefined) {
          // 熟語テスト：1つの読みの下に、字の数だけ四角を並べる
          var st = q.state || {};
          body = Array.from(t.mb).map(function (c, i) {
            var pi = t.base + i, p = (st.parts || [])[pi] || {};
            if (mode === 'answer' || mode === 'wrong') return '<span class="blank filled' + (p.res && p.res !== 'correct' ? ' ng' : '') + '">' + esc(c) + '</span>';
            return '<span class="blank' + (pi === st.cur ? ' cur' : '') + (p.thumb ? ' done' : '') + '" data-i="' + pi + '" aria-label="' + (pi + 1) + K('[字:じ][目:め]') + '">' + (p.thumb || '') + '</span>';
          }).join('');
          return '<span class="qc"><span class="qr">' + esc(t.r) + '</span><span class="qk mb' + (st.pick ? ' pick' : '') + '">' + body + '</span></span>';
        }
        if (t.k !== undefined) {
          body = esc(t.k);
          if (plainElem && Array.from(t.k).every(function (c) { return GRADE_OF[c] && GRADE_OF[c] <= 6; }))
            return '<span class="qc"><span class="qr" aria-hidden="true">&#8203;</span><span class="qk">' + body + '</span></span>';
        }
        else if (mode === 'read') return '<span class="qc"><span class="qr" aria-hidden="true">&#8203;</span><span class="qk"><span class="blank filled read">' + esc(t.b) + '</span></span></span>';
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
    return Store.get(ch) || { char: ch, grade: QG[ch] || 0, status: 'new', correct: 0, wrong: 0, streak: 0, recogErr: 0, history: [] };
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
      // よくある書き方の手本（五の2画目が長い形など）。読めなくても動作は変わらない
      return loadScript('vendor/kanjivg-refs/kvg-refs-variants.js').catch(function () {});
    }).then(function () {
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
  }).then(function () { registerSW(); });   // 手本を読みおわってから（はじめの読みこみと とりあわないように）
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
  // 問題データ（q/<学年>.js）を読む。1回読めば あとは そのまま。失敗したら 次に また読みにいく
  var qLoading = {};
  function loadGrade(g) {
    g = String(g);
    if (QD[g]) { addGrade(g); return Promise.resolve(); }
    if (!qLoading[g]) qLoading[g] = loadScript('q/' + g + '.js').then(function () {
      if (!QD[g]) throw new Error('no data');
      addGrade(g);
    }).catch(function (e) { delete qLoading[g]; throw e; });
    return qLoading[g];
  }
  // 字の問題データがまだなら、その学年のファイルを読む Promise（ぜんぶあれば null）
  function needChars(chars) {
    var gs = {};
    chars.forEach(function (ch) { var g = QG[ch]; if (g && !KANJI[ch]) gs[g] = true; });
    var list = Object.keys(gs);
    return list.length ? Promise.all(list.map(loadGrade)) : null;
  }
  function needGrade(g) { return needChars(gradeChars(g)); }
  // 読みこみの知らせ（画面の下）。テスト中でも見えるように固定で出す
  var netTimer = null;
  function netMsg(text, bad) {
    var el = $('netMsg'); if (!el) return;
    clearTimeout(netTimer);
    el.textContent = text || '';
    el.classList.toggle('ng', !!bad);
    el.hidden = !text;
    if (text && bad) netTimer = setTimeout(function () { el.hidden = true; }, 10000);
  }
  function netFailText() {
    return K('[通信:つうしん]できないので [問題:もんだい]を [読:よ]み[込:こ]めませんでした。インターネットに つないでから もう[一度:いちど] [試:ため]してね');
  }
  // wait（Promise）が終わってから then を動かす。そのあいだ ボタン（btns）を おせなくする。失敗したら知らせて ボタンを もどす
  var dataBusy = false;
  function waitData(wait, then, btns) {
    if (dataBusy) return;
    dataBusy = true;
    btns = (btns || []).map($).filter(Boolean);
    var was = btns.map(function (b) { return b.disabled; });
    btns.forEach(function (b) { b.disabled = true; });
    netMsg('');   // 前の「読み込めませんでした」は けす
    var showT = setTimeout(function () { netMsg(K('[問題:もんだい]を [読:よ]み[込:こ]み[中:ちゅう]…')); }, 150);
    function back() { dataBusy = false; clearTimeout(showT); btns.forEach(function (b, i) { b.disabled = was[i]; }); }
    // つながったまま 返事が来ないときも、ずっと待たせない（45秒で あきらめる。あとで届けば 次は すぐ使える）
    var limit = new Promise(function (res, rej) { setTimeout(function () { rej(new Error('timeout')); }, 45000); });
    Promise.race([wait, limit]).then(function () { back(); netMsg(''); then(); }, function () { back(); netMsg(netFailText(), true); });
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
  var views = ['home', 'grade', 'test', 'drill', 'drillrun', 'drilldone', 'quiz', 'quizrun', 'quizdone', 'result', 'weak', 'print', 'data', 'about'];
  function show(name) {
    views.forEach(function (v) { $('v-' + v).hidden = v !== name; });
    window.scrollTo(0, 0);
    document.body.classList.toggle('testing', name === 'test' || name === 'drillrun');
    if (name !== 'test') document.body.classList.remove('practicing');
    // テスト中は モードを切りかえられない（ボタンを おせない見た目にする）
    Array.prototype.forEach.call(document.querySelectorAll('#modeSw button'), function (b) { b.disabled = name === 'test' || name === 'drillrun'; });
    if (name === 'test' && pad) setTimeout(function () { fitPad(); pad.redraw(); }, 0);
    if (name === 'drillrun' && dpad) setTimeout(dFitPad, 0);
  }
  function route() {
    var h = (location.hash || '#home').slice(1);
    if (views.indexOf(h) < 0) h = 'home';
    if (session && h !== 'test' && !(drill && drill.back && h === 'drillrun')) leaveTest();   // 練習（テストから）の間は つづける
    if (drill && h !== 'drillrun' && h !== 'drilldone') { drill = null; dBusy = false; }   // 練習の画面から はなれたら 練習は おわり
    if (h === 'test' && !session) h = 'home';
    if (h === 'result' && !lastResult) h = 'home';
    if ((h === 'drillrun' || h === 'drilldone') && !drill) h = 'drill';
    if ((h === 'quizrun' || h === 'quizdone') && !quiz) h = 'quiz';
    if (h === 'print' && !printChars.length) h = 'weak';
    paintText();   // 固定の文を先に。そのあと各画面の render が動く文を書く
    if (h === 'home') renderHome();
    if (h === 'grade') renderGrade();
    if (h === 'drill') renderDrill();
    if (h === 'quiz') renderQuizPick();
    if (h === 'weak') renderWeak();
    if (h === 'print') renderPrint();
    if (h === 'data') renderData();
    if (h === 'about') renderAbout();
    show(h);
    updateExportHint(h);
  }
  function go(h) { if (location.hash === '#' + h) route(); else location.hash = h; }

  // ---------- たねキャラの成長 ----------
  // 覚えぐあいに合わせて、アイコンのたねが 芽 → 葉 → つぼみ → 花 → 満開 と育つ。
  // 絵は icons/icon.svg と同じ形・同じ色。stage 0〜6。最後まで その級の花のまま（花が ふえていく）
  var PLANT_NAME = ['たね', '[芽:め]', '[双葉:ふたば]', '[茎:くき]', 'つぼみ', '[花:はな]', '[満開:まんかい]'];
  function plantName(st) { return PLANT_NAME[st] || PLANT_NAME[0]; }
  function plantStage(done, total, mastered) {
    if (total && mastered >= total) return 6;
    var p = total ? done / total : 0;
    return !done ? 0 : p < 0.1 ? 1 : p < 0.25 ? 2 : p < 0.5 ? 3 : p < 0.75 ? 4 : 5;
  }
  // stage 5（花）の あいだは、「おぼえた」が ふえるほど 咲く花が 1 → 2 → 3 と ふえる
  function bloomCount(st, total, mastered) {
    if (st !== 5) return st >= 6 ? 5 : 0;
    return 1 + Math.min(2, Math.floor(3 * (total ? mastered / total : 0)));
  }
  // つぎの すがたまで あと何字か
  function plantNext(done, total, mastered) {
    var st = plantStage(done, total, mastered);
    if (st >= 6) return 0;
    if (st === 5) return Math.max(0, total - mastered);
    var need = [1, 0.1, 0.25, 0.5, 0.75, 1][st];
    return Math.max(1, Math.ceil((need <= 1 && st ? need * total : 1) - done));
  }
  // 級・学年ごとに咲く花がちがう（育てた花がたまっていく感じにする）
  var PLANTS = {
    1:  { nm: 'さくら',      sh: 'round',  fl: '#f9b8cd', ce: '#ffd66e', lf: '#43b96f', l2: '#5ccc82' },
    2:  { nm: 'ひまわり',    sh: 'thin',   fl: '#ffd05c', ce: '#8a5a2b', lf: '#3faa63', l2: '#63c98a' },
    3:  { nm: 'コスモス',    sh: 'point',  fl: '#e59ad8', ce: '#ffd66e', lf: '#4fbd7a', l2: '#76d79a' },
    4:  { nm: 'チューリップ', sh: 'bell',   fl: '#f07d7d', ce: '#ffd66e', lf: '#36a95f', l2: '#5ccc82' },
    5:  { nm: 'あじさい',    sh: 'cluster',fl: '#8fb7f2', ce: '#cfe0ff', lf: '#2f9e5b', l2: '#52c37c' },
    6:  { nm: 'うめ',        sh: 'round',  fl: '#fff2f6', ce: '#f6a8c0', lf: '#3faa63', l2: '#69cf8e' },
    65: { nm: 'きく',        sh: 'thin',   fl: '#fff0b8', ce: '#ffb347', lf: '#3b9e60', l2: '#64c98a' },
    7:  { nm: 'あさがお',    sh: 'round',  fl: '#8aa8f0', ce: '#ffffff', lf: '#3aa862', l2: '#63c98a' },
    8:  { nm: 'すいせん',    sh: 'point',  fl: '#fff6cf', ce: '#ffb347', lf: '#45b06c', l2: '#6fd296' },
    9:  { nm: 'ばら',        sh: 'bell',   fl: '#e8577a', ce: '#ffd66e', lf: '#2f9e5b', l2: '#52c37c' },
    10: { nm: 'はす',        sh: 'point',  fl: '#f7c0d6', ce: '#ffe08a', lf: '#3faa63', l2: '#6fd296' },
    11: { nm: 'ふじ',        sh: 'cluster',fl: '#c3a6ef', ce: '#e5d8ff', lf: '#3b9e60', l2: '#63c98a' },
    12: { nm: 'きんもくせい', sh: 'thin',   fl: '#ffb45c', ce: '#fff0c8', lf: '#2f9e5b', l2: '#52c37c' }
  };
  function plantOf(g) { return PLANTS[+g] || PLANTS[1]; }
  try { window.__plantSvg = function (st, l, g, n) { return plantSvg(st, l, g, n); }; } catch (e) {}
  function paleEdge(P) { return P.fl.charAt(1) === 'f' && P.fl.charAt(3) === 'f' ? 1.5 : 0; }
  function flowerSvg(cx, cy, P, scale) {
    var k = scale || 1, s = '', i, a;
    function pet(deg, inner) { return '<g transform="rotate(' + deg.toFixed(1) + ' ' + cx + ' ' + cy + ')">' + inner + '</g>'; }
    if (P.sh === 'thin') {
      for (i = 0; i < 12; i++) s += pet(i * 30, '<ellipse cx="' + cx + '" cy="' + (cy - 20 * k) + '" rx="' + (5 * k) + '" ry="' + (14 * k) + '" fill="' + P.fl + '"/>');
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (11 * k) + '" fill="' + P.ce + '"/>';
    } else if (P.sh === 'point') {
      for (i = 0; i < 8; i++) s += pet(i * 45, '<path d="M' + cx + ' ' + cy + ' C' + (cx - 9 * k) + ' ' + (cy - 14 * k) + ' ' + (cx - 7 * k) + ' ' + (cy - 26 * k) + ' ' + cx + ' ' + (cy - 32 * k) + ' C' + (cx + 7 * k) + ' ' + (cy - 26 * k) + ' ' + (cx + 9 * k) + ' ' + (cy - 14 * k) + ' ' + cx + ' ' + cy + ' Z" fill="' + P.fl + '"/>');
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (8 * k) + '" fill="' + P.ce + '"/>';
    } else if (P.sh === 'bell') {
      s += '<path d="M' + (cx - 17 * k) + ' ' + (cy - 10 * k) + ' C' + (cx - 17 * k) + ' ' + (cy + 16 * k) + ' ' + (cx + 17 * k) + ' ' + (cy + 16 * k) + ' ' + (cx + 17 * k) + ' ' + (cy - 10 * k) + ' C' + (cx + 10 * k) + ' ' + (cy - 30 * k) + ' ' + (cx - 10 * k) + ' ' + (cy - 30 * k) + ' ' + (cx - 17 * k) + ' ' + (cy - 10 * k) + ' Z" fill="' + P.fl + '"/>';
      s += '<path d="M' + (cx - 6 * k) + ' ' + (cy - 26 * k) + ' C' + (cx - 12 * k) + ' ' + (cy - 4 * k) + ' ' + (cx + 12 * k) + ' ' + (cy - 4 * k) + ' ' + (cx + 6 * k) + ' ' + (cy - 26 * k) + ' Z" fill="' + P.ce + '" opacity=".85"/>';
    } else if (P.sh === 'cluster') {
      var pts = [[0, -18], [-15, -8], [15, -8], [-9, 9], [9, 9], [0, -1]];
      for (i = 0; i < pts.length; i++) s += '<circle cx="' + (cx + pts[i][0] * k) + '" cy="' + (cy + pts[i][1] * k) + '" r="' + (9 * k) + '" fill="' + (i === pts.length - 1 ? P.ce : P.fl) + '"/>';
    } else {
      for (i = 0; i < 5; i++) {
        a = -Math.PI / 2 + i * Math.PI * 2 / 5;
        s += '<ellipse cx="' + (cx + 20 * k * Math.cos(a)).toFixed(1) + '" cy="' + (cy + 20 * k * Math.sin(a)).toFixed(1) + '" rx="' + (13 * k) + '" ry="' + (13 * k) + '" fill="' + P.fl + '" stroke="#e9dccb" stroke-width="' + paleEdge(P) + '"/>';
      }
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (10 * k) + '" fill="' + P.ce + '"/>';
    }
    return s;
  }
  // つぼみ（stage 4 のつぼみ。小さくしても使う）
  function budSvg(cx, cy, P, k) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (15 * k) + '" ry="' + (20 * k) + '" fill="' + P.fl + '" stroke="#e9dccb" stroke-width="' + paleEdge(P) + '"/>' +
      '<path d="M' + cx + ' ' + (cy - 18 * k) + ' C' + (cx + 7 * k) + ' ' + (cy - 12 * k) + ' ' + (cx + 7 * k) + ' ' + (cy - 4 * k) + ' ' + cx + ' ' + (cy + 2 * k) + '" stroke="' + P.ce + '" stroke-width="' + (5 * k) + '" fill="none" stroke-linecap="round"/>';
  }
  function branch(d) { return '<path d="' + d + '" stroke="#2f9e5b" stroke-width="4.5" stroke-linecap="round" fill="none"/>'; }
  // 完成した級のしるし（その級の花）
  function gotIcon(g) {
    var P = plantOf(g);
    return '<svg class="gic" viewBox="64 8 66 66" role="img" aria-label="' + esc(K(SHORT_NAME[g]) + ' ' + P.nm) + '">' + flowerSvg(97, 41, P, 1) + '</svg>';
  }
  // n: 咲いている花の数（stage 5 は 1〜3。stage 6 は満開）
  function plantSvg(stage, label, g, n) {
    var P = plantOf(g == null ? 1 : g);
    if (n == null) n = bloomCount(stage, 0, 0);
    var s = '<svg class="plant" viewBox="0 0 200 210" role="img" aria-label="' + esc(label || '') + '">';
    s += '<ellipse cx="100" cy="186" rx="66" ry="13" fill="#9fd8b1"/>';   // つち
    if (stage >= 6) s += branch('M24 186 C24 176 25 166 26 156') + branch('M176 186 C176 176 175 166 174 156');   // つちからも 小さい花
    if (stage === 5 && n >= 2) s += branch('M99 104 C82 92 66 80 54 68');
    if (stage === 5 && n >= 3) s += branch('M99 100 C116 86 132 72 148 62');
    if (stage >= 6) s += branch('M99 104 C80 92 64 70 56 54') + branch('M99 100 C118 88 136 66 144 50') + branch('M98 110 C80 104 58 96 40 82') + branch('M99 106 C120 100 144 90 162 76');
    if (stage >= 1) {   // くき
      var top = [0, 120, 96, 62, 52, 46, 44][stage];
      s += '<path d="M100 132 C100 ' + (top + 28) + ' 99 ' + (top + 12) + ' 97 ' + top + '" stroke="#2f9e5b" stroke-width="7" stroke-linecap="round" fill="none"/>';
    }
    if (stage === 1) s += '<path d="M97 124 C80 100 56 100 46 112 C52 134 82 140 97 124 Z" fill="' + P.lf + '"/>';
    if (stage >= 2) {
      s += '<path d="M97 104 C76 72 42 70 29 83 C33 109 70 121 97 104 Z" fill="' + P.lf + '"/>';
      s += '<path d="M99 100 C112 66 146 58 166 71 C165 98 130 117 99 100 Z" fill="' + P.l2 + '"/>';
    }
    if (stage >= 3) s += '<path d="M98 72 C84 52 58 48 47 57 C50 77 78 86 98 72 Z" fill="' + P.lf + '"/>';
    if (stage === 4) s += budSvg(97, 42, P, 1);
    if (stage === 5) {
      s += n >= 2 ? flowerSvg(52, 66, P, 0.55) : budSvg(50, 70, P, 0.42);
      s += n >= 3 ? flowerSvg(150, 60, P, 0.55) : budSvg(150, 62, P, 0.42);
      s += flowerSvg(97, 42, P, 0.85);
    }
    if (stage >= 6) {
      s += flowerSvg(26, 152, P, 0.34) + flowerSvg(174, 152, P, 0.34);
      s += budSvg(40, 80, P, 0.4) + budSvg(162, 74, P, 0.4);
      s += flowerSvg(54, 54, P, 0.64) + flowerSvg(146, 50, P, 0.64);
      s += flowerSvg(100, 38, P, 0.98);
    }
    // たね（かお）
    s += '<path d="M100 120 C133 120 153 147 153 170 C153 193 129 205 100 205 C71 205 47 193 47 170 C47 147 67 120 100 120 Z" fill="#eeb06a"/>';
    s += '<path d="M65 151 C70 139 79 131 90 127" stroke="#fff3dd" stroke-width="6" stroke-linecap="round" fill="none" opacity=".8"/>';
    s += '<ellipse cx="81" cy="168" rx="6" ry="7.5" fill="#3b2a1a"/><ellipse cx="119" cy="168" rx="6" ry="7.5" fill="#3b2a1a"/>';
    s += '<circle cx="83" cy="165" r="2" fill="#fff"/><circle cx="121" cy="165" r="2" fill="#fff"/>';
    s += '<ellipse cx="68" cy="181" rx="9" ry="5" fill="#f39a8c" opacity=".75"/><ellipse cx="132" cy="181" rx="9" ry="5" fill="#f39a8c" opacity=".75"/>';
    s += stage >= 6 ? '<path d="M89 180 C95 190 105 190 111 180" stroke="#3b2a1a" stroke-width="4" stroke-linecap="round" fill="none"/>'
      : '<path d="M91 180 C95 186 105 186 109 180" stroke="#3b2a1a" stroke-width="4" stroke-linecap="round" fill="none"/>';
    return s + '</svg>';
  }
  // 花のことば（ホームと「大きく見る」で同じ文）
  function plantMsg(st, g) {
    var nm = plantOf(g).nm;
    return st >= 6 ? nm + K('が [満開:まんかい]に なったよ！') : st >= 5 ? nm + K('が [咲:さ]いたよ！') : K('[育:そだ]てている[花:はな]：') + nm;
  }
  function plantHint(st, left) {
    return st >= 6 ? K('ぜんぶ [覚:おぼ]えたね！') : st === 5 ? K('あと ') + left + K('[字:じ] 「[覚:おぼ]えた」に なると [満開:まんかい]') : K('あと ') + left + K('[字:じ]で つぎの すがた');
  }

  // ---------- 大きく見る（育ち具合をタッチ） ----------
  var plantInfo = {}, plantOpener = null;
  function openPlant(g, opener) {
    var d = plantInfo[g]; if (!d) return;
    var st = d.st, n = bloomCount(st, d.total, d.mastered), left = plantNext(d.done, d.total, d.mastered), i, strip = '';
    for (i = 0; i <= 6; i++) strip += '<li' + (i === st ? ' aria-current="step"' : '') + '>' + plantSvg(i, '', g, i === 5 ? (st === 5 ? n : 1) : null) + '<span>' + K(plantName(i)) + '</span></li>';
    $('pdTitle').textContent = K(SHORT_NAME[g]) + 'の ' + plantOf(g).nm;
    $('pdBody').innerHTML = '<div class="pdpic">' + plantSvg(st, K(SHORT_NAME[g]) + ' ' + K(plantName(st)), g, n) + '</div>' +
      '<p class="pdst"><b>' + K(plantName(st)) + '</b><em>' + plantMsg(st, g) + '</em></p>' +
      '<dl class="pdnum"><div class="m"><dt>' + K('[覚:おぼ]えた') + '</dt><dd>' + d.mastered + K('[字:じ]') + '</dd></div>' +
      '<div class="c"><dt>' + K('[覚:おぼ]えかけ') + '</dt><dd>' + d.candidate + K('[字:じ]') + '</dd></div>' +
      '<div><dt>' + K('[全部:ぜんぶ]の [字:じ]') + '</dt><dd>' + d.total + K('[字:じ]') + '</dd></div></dl>' +
      '<p class="pdnext">' + plantHint(st, left) + '</p>' +
      '<ol class="pdstrip" aria-label="' + esc(K('[育:そだ]つ じゅんばん')) + '">' + strip + '</ol>';
    plantOpener = opener || document.activeElement;
    $('plantDlg').hidden = false;
    document.body.classList.add('dlg-open');
    $('pdClose').focus();
  }
  function closePlant() {
    if ($('plantDlg').hidden) return;
    $('plantDlg').hidden = true;
    document.body.classList.remove('dlg-open');
    var o = plantOpener; plantOpener = null;
    if (o && o.focus && document.body.contains(o)) o.focus();
  }
  $('pdClose').onclick = closePlant;
  $('plantDlg').addEventListener('click', function (e) { if (e.target === this) closePlant(); });
  $('plantDlg').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); closePlant(); }
    else if (e.key === 'Tab') { e.preventDefault(); $('pdClose').focus(); }   // 押せるのは「とじる」だけ。フォーカスを外に出さない
  });
  window.addEventListener('hashchange', closePlant);
  function plantTap(e) {
    var el = e.target.closest ? e.target.closest('[data-pg]') : null;
    if (!el) return;
    if (e.type === 'keydown') { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); }
    openPlant(el.getAttribute('data-pg'), el);
  }
  ['hGrow', 'hLevels'].forEach(function (id) { $(id).addEventListener('click', plantTap); $(id).addEventListener('keydown', plantTap); });

  // ---------- ホーム ----------
  function renderHome() {
    var rv = reviewList();
    var weak = Object.keys(Store.all()).filter(function (ch) { return inMode(ch) && Store.get(ch).status === 'weak'; }).length;
    $('hReview').textContent = rv.length;
    $('hWeak').textContent = weak;
    $('hReviewBtn').disabled = !rv.length;
    $('hReviewBtn').textContent = rv.length ? K('[苦手:にがて]を [復習:ふくしゅう] する（') + Math.min(rv.length, 10) + K('[問:もん]）') : K('[復習:ふくしゅう]する [漢字:かんじ]は ありません');
    var html = '', big = null;
    levels().forEach(function (g) {
      if (!hasGrade(g)) {
        html += '<div class="level soon"><span></span><span>' + K(SHORT_NAME[g]) + '</span><span class="bar"></span><span class="n">' + K('[準備中:じゅんびちゅう]') + '</span></div>';
        return;
      }
      // 数字は「せいかいした字（おぼえた＋おぼえかけ）」。おぼえた は2回つづけて正解したときなので、1回めのテストでは 0 のまま
      var chars = gradeChars(g), c = statusCounts(chars), t = chars.length, done = c.mastered + c.candidate, tested = t - c.new;
      var st = plantStage(done, t, c.mastered);
      plantInfo[g] = { st: st, done: done, total: t, mastered: c.mastered, candidate: c.candidate };
      html += '<div class="level tap" role="button" tabindex="0" data-pg="' + g + '" aria-label="' + esc(K(SHORT_NAME[g]) + ' ' + K('[覚:おぼ]えた ') + c.mastered + '字、' + K('[覚:おぼ]えかけ ') + c.candidate + '字、' + K('[苦手:にがて] ') + c.weak + '字 / ' + t + '字。' + K('タッチすると [大:おお]きく [見:み]える')) + '">' + plantSvg(st, '', g, bloomCount(st, t, c.mastered)) + '<span>' + K(SHORT_NAME[g]) + '</span><span class="bar" role="img" aria-label="' + K(SHORT_NAME[g]) + ' ' + K('[覚:おぼ]えた ') + c.mastered + '字、' + K('[覚:おぼ]えかけ ') + c.candidate + '字、' + K('[苦手:にがて] ') + c.weak + '字 / ' + t + '字">' +
        '<i class="m" style="width:' + (100 * c.mastered / t) + '%"></i><i class="c" style="width:' + (100 * c.candidate / t) + '%"></i><i class="w" style="width:' + (100 * c.weak / t) + '%"></i>' +
        '</span><span class="n">' + done + ' / ' + t + '字</span>' +
        (tested ? '<small class="ld">' + K('[覚:おぼ]えた ') + c.mastered + '　' + K('[覚:おぼ]えかけ ') + c.candidate + '　' + K('[苦手:にがて] ') + c.weak + '</small>' : '') + '</div>';
      if (!big || (big.st < 6 && st <= big.st && done > big.done) || (big.st === 6 && st < 6)) big = { g: g, st: st, done: done, total: t, mastered: c.mastered };
    });
    $('hLevels').innerHTML = html;
    if (big) {
      var left = plantNext(big.done, big.total, big.mastered);
      var got = levels().filter(function (g) {
        if (!hasGrade(g)) return false;
        var ch = gradeChars(g); return statusCounts(ch).mastered >= ch.length;
      });
      var gl = K(SHORT_NAME[big.g]) + ' ' + K(plantName(big.st));
      $('hGrow').setAttribute('data-pg', big.g);
      $('hGrow').setAttribute('aria-label', gl + '。' + plantMsg(big.st, big.g) + '。' + K('タッチすると [大:おお]きく [見:み]える'));
      $('hGrow').innerHTML = plantSvg(big.st, gl, big.g, bloomCount(big.st, big.total, big.mastered)) +
        '<div class="gtx"><b>' + K(SHORT_NAME[big.g]) + 'の ' + K(plantName(big.st)) + '</b>' +
        '<em class="fl">' + plantMsg(big.st, big.g) + '</em>' +
        '<span>' + big.done + ' / ' + big.total + K('[字:じ] [書:か]けたよ') + '</span>' +
        (got.length ? '<span class="got">' + K('そだてた：') + got.map(function (g) { return gotIcon(g) + '<b>' + K(SHORT_NAME[g]) + '</b>'; }).join('') + '</span>' : '') +
        '<small>' + plantHint(big.st, left) + '</small></div>' +
        '<span class="zoom" aria-hidden="true">🔍</span>';
    } else {
      $('hGrow').removeAttribute('data-pg');
    }
    $('hLevelsTitle').textContent = mode === 'kanken' ? K('[級:きゅう]ごとの [覚:おぼ]え[具合:ぐあい]') : K('[学年:がくねん]ごとの [覚:おぼ]え[具合:ぐあい]');
  }
  $('hReviewBtn').onclick = function () { var l = reviewList(); if (l.length) startTest('review', 0, l.slice(0, 10)); };

  // ---------- 学年えらび ----------
  var pickGrade = uiGrade, pickN = 10, pickKind = 'single';
  try { if (localStorage.getItem('kt-kind') === 'word') pickKind = 'word'; } catch (e) {}
  function appMode() { return mode; }
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
    $('gKindBox').hidden = mode !== 'kanken';
    Array.prototype.forEach.call($('gKind').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x.dataset.kind === pickKind); });
  }
  Array.prototype.forEach.call($('gKind').querySelectorAll('button'), function (b) {
    b.onclick = function () {
      pickKind = b.dataset.kind;
      try { localStorage.setItem('kt-kind', pickKind); } catch (e) {}
      Array.prototype.forEach.call($('gKind').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x === b); });
    };
  });
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
  // 熟語テスト：空欄の字と、となりの漢字（ふりがな付きの字）をつなげて、2〜4字をまとめて書く問題にする
  function wordRun(q) {
    var T = q.tokens, bi = -1;
    for (var i = 0; i < T.length; i++) if (T[i].b !== undefined) { bi = i; break; }
    if (bi < 0) return null;
    var okTok = function (t) { return t && t.k !== undefined && Array.from(t.k).every(function (c) { return GRADE_OF[c]; }); };
    var lo = bi, hi = bi, len = 1, grew = true;
    while (grew) {
      grew = false;
      if (okTok(T[hi + 1]) && len + Array.from(T[hi + 1].k).length <= 4) { hi++; len += Array.from(T[hi].k).length; grew = true; }
      if (okTok(T[lo - 1]) && len + Array.from(T[lo - 1].k).length <= 4) { lo--; len += Array.from(T[lo].k).length; grew = true; }
    }
    return len >= 2 ? { lo: lo, hi: hi, bi: bi } : null;
  }
  function makeWordItem(it) {
    var run = wordRun(it.q);
    if (!run) return it;
    var parts = [], toks = it.q.tokens.map(function (t, i) {
      if (i < run.lo || i > run.hi) return t;
      var chars = t.b !== undefined ? t.b : t.k, base = parts.length;
      Array.from(chars).forEach(function (c) { parts.push({ ch: c, main: i === run.bi, strokes: null, size: 0, res: null, thumb: '' }); });
      return { mb: chars, r: t.r, base: base };
    });
    it.parts = parts; it.pi = 0;
    it.mq = { id: it.q.id, kanji: it.q.kanji, tokens: toks, state: { cur: 0, parts: parts } };
    it.word = parts.map(function (x) { return x.ch; }).join('');
    return it;
  }
  function pickWordQuestion(ch) {
    var qs = QUESTIONS[ch].filter(wordRun), r = Store.get(ch);
    if (!qs.length) return pickQuestion(ch);
    var pool = qs.filter(function (q) { return !r || q.id !== r.lastQ; });
    return (pool.length ? pool : qs)[Math.floor(Math.random() * (pool.length || qs.length))];
  }
  function newItem(ch, again) {
    var word = session ? session.kind === 'word' : pickKind === 'word' && appMode() === 'kanken';
    var it = { ch: ch, q: word ? pickWordQuestion(ch) : pickQuestion(ch), result: null, tries: 0 };
    if (again) it.again = true;
    return word ? makeWordItem(it) : it;
  }
  function curCh() { var it = cur(); return it.parts ? it.parts[it.pi].ch : it.ch; }
  // 熟語テスト：四角を選びなおして前の字に戻る。書いた線は四角ごとに覚えておき、戻ると続きから直せる
  function keepStrokes() {
    var it = cur(), p = it.parts[it.pi];
    if (!pad.strokes().length) return;
    p.strokes = pad.strokes().map(function (st) { return st.map(function (q) { return q.slice(); }); });
    p.size = pad.size(); p.thumb = thumbSvg(p.strokes, p.size);
  }
  function paintWord() {
    var it = cur();
    it.mq.state.pick = !answered;
    $('tQ').innerHTML = renderQ(it.mq, 'test');
    if (answered) { $('tWordNav').hidden = true; return; }
    Array.prototype.forEach.call($('tQ').querySelectorAll('.qk.mb .blank'), function (el) {
      el.onclick = function () { gotoPart(+el.dataset.i); };
    });
    $('tWordNav').hidden = false;
    $('tPrev').disabled = it.pi === 0;
    $('tWordPos').textContent = (it.pi + 1) + ' / ' + it.parts.length + K('[字:じ][目:め]');
  }
  function gotoPart(i) {
    var it = cur();
    if (!it.parts || answered || i < 0 || i >= it.parts.length || i === it.pi) return;
    keepStrokes();
    it.pi = i; it.mq.state.cur = i;
    paintWord();
    var q = it.parts[i], k = pad.size() / (q.size || pad.size());
    pad.setStrokes(q.strokes ? q.strokes.map(function (st) { return st.map(function (pt) { return [pt[0] * k, pt[1] * k]; }); }) : []);
    showCount(pad.strokes().length); updateAnswerBtn();
  }
  $('tPrev').onclick = function () { gotoPart(cur().pi - 1); };
  // 書いた線を小さな絵にして、四角の中に見せる
  function thumbSvg(strokes, size) {
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' + strokes.map(function (st) {
      return '<path d="M' + st.map(function (p) { return p[0].toFixed(0) + ' ' + p[1].toFixed(0); }).join('L') + (st.length === 1 ? 'l1 1' : '') + '"/>';
    }).join('') + '</svg>';
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
    var qwait = needChars(chars);
    if (qwait) { waitData(qwait, function () { startTest(mode, grade, chars); }, ['gStart', 'hReviewBtn', 'wTest', 'rAgain']); return; }
    var kind = pickKind === 'word' && appMode() === 'kanken' ? 'word' : 'single';
    var items = chars.map(function (ch) { return newItem(ch); });
    var need = chars.slice();
    items.forEach(function (it) { (it.parts || []).forEach(function (p) { need.push(p.ch); }); });
    var wait = ensureRefs(need);
    if (wait) {
      $('loadstate').textContent = K('[漢字:かんじ]の [手本:てほん]を [読:よ]み[込:こ]み[中:ちゅう]…（[初:はじ]めてのときは [少:すこ]し [時間:じかん]が かかります）');
      $('gStart').disabled = true;
      wait.then(function () { $('loadstate').textContent = ''; $('gStart').disabled = false; startTest(mode, grade, chars); },
        function () { $('loadstate').textContent = K('[手本:てほん]を [読:よ]み[込:こ]めませんでした'); $('gStart').disabled = false; });
      return;
    }
    quitArmed = false; $('tQuit').textContent = K('やめる');   // 前のテストの「本当に やめる？」を持ちこさない
    session = { id: 's' + Date.now(), at: Date.now(), mode: mode, grade: grade, idx: 0, kind: kind, items: items };
    if (!pad) pad = new window.PopKanjiPad($('tPad'), { onChange: function (n) {
      $('tPadHint').hidden = n > 0;
      showCount(n);
      updateAnswerBtn();
    } });
    go('test');
    showItem();
  }
  function cur() { return session.items[session.idx]; }
  function testGrade(k) { return session && +session.grade === SHO_ALL ? SHO_ALL : k.grade; }
  // 書く枠の左上：いまの画数 / その字の画数（ヒント）。ちょうどなら緑、多すぎたら黄色
  function showCount(n) {
    var el = $('tCount'), std = session && STD_STROKES[curCh()];
    el.hidden = !n && !std;
    el.textContent = std ? n + ' / ' + std + K('[画:かく]') : n + K('[画:かく]');
    el.className = 'padcount' + (std && n === std ? ' ok' : std && n > std ? ' over' : '');
  }
  function updateAnswerBtn() {
    if (drill) dUpdateBtns();
    if (!pad || !session) return;
    var n = pad.strokes().length;
    var busy = answered && !practicing;
    $('tAnswer').disabled = !ready || !n || busy;
    var it0 = cur(), more = it0.parts && !answered && it0.parts.some(function (p, i) { return i !== it0.pi && !p.ok && !p.strokes; });
    $('tAnswer').textContent = !ready ? K('[準備中:じゅんびちゅう]…') : practicing ? K('[書:か]けた！') : more ? K('[次:つぎ]の [字:じ]へ') : K('[答:こた]える');
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
      session.mode === 'review' ? K('[復習:ふくしゅう]：[四角:しかく]に [入:はい]る [漢字:かんじ]を [書:か]こう') : K(GRADE_NAME[testGrade(k)]) + K('：[四角:しかく]に [入:はい]る [漢字:かんじ]を [書:か]こう');
    $('tLabel').classList.toggle('again', !!it.again);
    if (it.parts) {
      it.pi = 0; it.parts.forEach(function (p) { p.strokes = null; p.res = null; p.ok = false; p.thumb = ''; }); it.mq.state.cur = 0;
      if (!it.again && session.mode !== 'review') $('tLabel').textContent = K(GRADE_NAME[testGrade(k)]) + K('：[四角:しかく]に [入:はい]る [言葉:ことば]を [書:か]こう（') + it.parts.length + K('[字:じ]）');
    }
    $('tWordNav').hidden = true;
    if (it.parts) paintWord(); else $('tQ').innerHTML = renderQ(it.q, 'test');
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
  // 書いているあいだ（1回め・書き直し・練習）は、いつも同じ大きさ（はじめに書くときの画面で決めた大きさ）にする。
  // 書き直しの知らせ（#tFb）が出ても枠は小さくしない。小さくするのは 答えが決まって 結果を見せるときだけ
  function fitPad() {
    var w = $('tPad').parentNode;
    w.style.width = '';
    if (!session || !narrowMq.matches || $('v-test').hidden) return;
    var writing = !answered || practicing;
    var fb = $('tFb'), fbHidden = fb.hidden, bodyPr = document.body.classList.contains('practicing');
    var y0 = window.scrollY;
    if (writing) { fb.hidden = true; document.body.classList.remove('practicing'); }
    var full = w.getBoundingClientRect().width;
    var top = $('tPad').getBoundingClientRect().top + window.scrollY;
    var below = 0;
    Array.prototype.forEach.call(w.children, function (c) { if (c.id !== 'tPad' && !c.hidden) below += c.getBoundingClientRect().height + 10; });
    if (writing) { fb.hidden = fbHidden; document.body.classList.toggle('practicing', bodyPr); if (window.scrollY !== y0) window.scrollTo(0, y0); }
    var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var avail = Math.floor(vh - top - below - 12);
    var min = writing ? 230 : 150;
    var size = Math.max(min, Math.min(full, avail));
    if (size < full) w.style.width = size + 'px';
    // 書き直しの知らせで ボタンが画面の下に出たときは、答えるボタンまで見えるように少しだけ動かす
    if (writing && !fb.hidden && !answered) {
      var b = $('tControls').getBoundingClientRect().bottom;
      if (b > vh - 8) window.scrollBy(0, Math.ceil(b - vh + 8));
    }
  }
  window.addEventListener('resize', function () { if (session) fitPad(); });
  function infoDl(ch) {
    var k = KANJI[ch];
    var yomi = [].concat(k.on, k.kun).filter(Boolean).join('・') || '—';
    var hasK = k.meaningTokens && k.meaningTokens.some(function (t) { return t.k !== undefined; });
    var mean = hasK ? '<span class="qline mline">' + renderQ({ tokens: k.meaningTokens, kanji: ch }, 'answer') + '</span>' : esc(k.meaning);
    return '<dl><dt>' + K('[読:よ]み') + '</dt><dd>' + esc(yomi) + '</dd><dt>' + K('[意味:いみ]') + '</dt><dd>' + mean + '</dd>' +
      (k.words && k.words.length ? '<dt class="dw">' + K('[言葉:ことば]') + '</dt><dd class="kj dw">' + esc(k.words.slice(0, 4).join('　')) + '</dd>' : '') + '</dl>';
  }
  // order: 画数のヒントのとき、書き順を見られる字（「かきじゅんを みる」）
  function feedback(kind, verdict, detail, withInfo, misjudge, order) {
    var it = cur();
    var showAns = kind !== 'retry';   // 書き直しのときは答えを見せない
    var html = '<div class="fb ' + kind + '" role="status"><div class="head">' + (showAns ? '<span class="ans' + (it.parts ? ' word' : '') + '">' + esc(it.parts ? it.word : it.ch) + '</span>' : '') + '<div><div class="verdict">' + verdict + '</div>' +
      (detail || order ? '<div>' + (detail || '') + (order ? ' <button type="button" class="orderbtn" id="tOrderBtn">▶ ' + K('[書:か]き[順:じゅん]を [見:み]る') + '</button>' : '') + '</div>' : '') + '</div></div>' + (withInfo ? infoDl(it.ch) : '') +
      (kind === 'wrong' || kind === 'recog' ? '<button class="btn practice" id="tPractice">✏️ ' + K('お[手本:てほん]を [見:み]て [練習:れんしゅう]する') + '</button><div class="pmsg" id="tPmsg" aria-live="polite"></div>' : '') +
      (misjudge ? '<button class="misjudge" id="tMis">' + K('[正:ただ]しく [書:か]いたのに [間違:まちが]いに なった') + '</button>' : '') +
      (kind === 'correct' ? '<button class="misjudge" id="tMisOk">' + K('[間違:まちが]えて [書:か]いたのに [正解:せいかい]に なった') + '</button>' : '') +
      '<div class="rmsg" id="tRmsg" aria-live="polite" hidden></div></div>' +
      (order ? '<div class="orderpop" id="tOrderPop" role="dialog" aria-modal="true" aria-label="' + esc(K('[書:か]き[順:じゅん]')) + '" hidden></div>' : '');
    $('tFb').innerHTML = html; $('tFb').hidden = false;
    if (order) $('tOrderBtn').onclick = function () { showOrderPop(it, order); };
    setTimeout(fitPad, 0);
    // 間違えたときの練習は、練習モードと同じ画面（大きな書く枠）で1字だけ。終わったらテストに戻る
    if ($('tPractice')) $('tPractice').onclick = function () {
      // 熟語のときは、書けなかった字だけ（なければ出題の字）を練習する
      var c = cur(), list = [c.ch];
      if (c.parts) { var bad = c.parts.filter(function (p) { return p.res !== 'correct' && QG[p.ch]; }).map(function (p) { return p.ch; }); if (bad.length) list = bad.filter(function (x, i) { return bad.indexOf(x) === i; }); }
      startDrill(list, { back: 'test', word: c.word });
    };
    // 判定ミスの報告：まちがえて おさないように、1回めは「ほんとうに？」と聞く（4びょうで もとに もどる）。
    // 2回めで 記録を直し（まちがい・正解のどちらにもしない）、REPORT_URL があれば分析用に送る
    function onMisjudge(type, label) {
      return function () {
        var btn = this;
        if (btn.disabled) return;
        if (!btn.dataset.marked && !btn.dataset.armed) {
          btn.dataset.armed = '1'; btn.dataset.label = btn.innerHTML;
          btn.classList.add('armed');
          btn.textContent = K('ほんとうに？ もう[一度:いちど] おすと [直:なお]します');
          setTimeout(function () {
            if (!btn.isConnected || !btn.dataset.armed || btn.dataset.marked) return;
            delete btn.dataset.armed; btn.classList.remove('armed'); btn.innerHTML = btn.dataset.label;
          }, 4000);
          return;
        }
        if (!btn.dataset.marked) {
          delete btn.dataset.armed; btn.classList.remove('armed'); btn.innerHTML = btn.dataset.label;
          btn.dataset.marked = '1';
          pending = 'recog';
          $('tFb').firstChild.className = 'fb recog';
          $('tFb').querySelector('.verdict').textContent = label;
          var other = $(btn.id === 'tMis' ? 'tMisOk' : 'tMis'); if (other) other.remove();
        }
        if (!REPORT_URL) { btn.remove(); return; }
        sendReport(btn, type, it);
      };
    }
    if (misjudge) $('tMis').onclick = onMisjudge('false_negative', K('[間違:まちが]いに しませんでした'));
    if ($('tMisOk')) $('tMisOk').onclick = onMisjudge('false_positive', K('[正解:せいかい]に しませんでした'));
  }
  // テスト中に書き順を見る（画数のヒントのあと）。見たら その問題は 正解でも 記録に入れない（'recog' あつかい）
  function peekNote() { return K('[書:か]き[順:じゅん]を [見:み]たので、[記録:きろく]には [入:い]れないよ。'); }
  function showOrderPop(it, chars) {
    var pop = $('tOrderPop');
    if (!pop) return;
    it.peeked = true;
    function paint() {
      pop.innerHTML = '<div class="box"><div class="svgs' + (chars.length > 1 ? ' many' : '') + '">' + chars.map(function (ch) { return orderSvg(ch, true); }).join('') + '</div>' +
        '<p class="note">' + K('[見:み]たときは [記録:きろく]に [入:い]れないよ') + '</p>' +
        '<div class="row"><button type="button" class="btn" id="tOrderAgain">▶ ' + K('もう[一度:いちど]') + '</button><button type="button" class="btn primary" id="tOrderClose">' + K('とじる') + '</button></div></div>';
      $('tOrderAgain').onclick = paint;
      $('tOrderClose').onclick = function () { pop.hidden = true; pop.innerHTML = ''; try { $('tOrderBtn').focus({ preventScroll: true }); } catch (e) {} };
      try { $('tOrderClose').focus({ preventScroll: true }); } catch (e) {}
    }
    pop.hidden = false;
    paint();
    pop.onclick = function (e) { if (e.target === pop) $('tOrderClose').onclick(); };
    pop.onkeydown = function (e) { if (e.key === 'Escape') $('tOrderClose').onclick(); };
  }
  // 報告用の画像：書いた線だけを 白地に黒で 256×256 にかく（枠の点線・お手本・画面の色は入れない）
  function strokesImage(strokes) {
    var cv = document.createElement('canvas'); cv.width = cv.height = 256;
    var c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#000'; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 8;
    (strokes || []).forEach(function (st) {
      if (!st.length) return;
      c.beginPath(); c.moveTo(st[0][0], st[0][1]);
      if (st.length === 1) c.lineTo(st[0][0] + 0.1, st[0][1] + 0.1);
      for (var i = 1; i < st.length; i++) c.lineTo(st[i][0], st[i][1]);
      c.stroke();
    });
    return cv.toDataURL('image/png');
  }
  function reportPayload(type, it) {
    var strokes = it.strokes || [];   // finishItem で 256 座標にしたもの（熟語は出題の字）
    var cands = [], judged = null;
    try {
      if (strokes.length) {
        cands = R.recognize(strokes, { width: 256, height: 256 }, 10);
        judged = R.judge(cands, it.ch);
      }
    } catch (e) {}
    var mp = it.parts ? it.parts.filter(function (p) { return p.main; })[0] : null;
    return {
      targetKanji: it.ch,
      imageData: strokesImage(strokes),
      strokeData: {
        reportType: type,   // false_negative: 正しく書いたのに まちがい / false_positive: まちがえたのに 正解
        appVersion: ($('aVer') || {}).textContent || null,
        questionId: it.q ? it.q.id : null,
        word: it.parts ? it.word : null,
        tries: it.tries,
        strokeCount: strokes.length,
        standardStrokes: STD_STROKES[it.ch] || null,
        verdict: judged ? judged.result : null,
        seenAs: it.seenAs || (mp && mp.seenAs) || null,
        candidates: cands.map(function (c) { return { char: c.char, score: Math.round(c.score * 1000) / 1000 }; }),
        strokes: strokes   // 256×256 の座標。[[ [x,y], ... ], ...]
      }
    };
  }
  function sendReport(btn, type, it) {
    var msg = $('tRmsg'), orig = btn.dataset.label || (btn.dataset.label = btn.innerHTML);
    btn.disabled = true; btn.textContent = K('[送信中:そうしんちゅう]…');
    msg.hidden = true; msg.className = 'rmsg';
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl && setTimeout(function () { ctl.abort(); }, REPORT_TIMEOUT);
    // text/plain で送ると プリフライトが起きず、GAS でも CORS エラーにならない（GAS 側は e.postData.contents を JSON.parse する）
    fetch(REPORT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(reportPayload(type, it)), redirect: 'follow', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (res) {
        if (!res || res.status !== 'success') throw new Error((res && res.message) || 'error');
        if (!btn.isConnected) return;
        btn.remove();
        msg.textContent = K('[送:おく]りました。ありがとう！'); msg.className = 'rmsg ok'; msg.hidden = false;
      })
      .catch(function () {
        if (!btn.isConnected) return;
        btn.disabled = false; btn.innerHTML = orig;
        msg.textContent = K('[送:おく]れませんでした。[記録:きろく]は [直:なお]したよ。もう[一度:いちど] おすと [送:おく]りなおせます'); msg.className = 'rmsg ng'; msg.hidden = false;
      })
      .then(function () { if (timer) clearTimeout(timer); });
  }
  function finishItem(result, seenAs) {
    var it = cur();
    answered = true; pending = result; it.seenAs = seenAs || null;
    if (it.parts) {
      var mp = it.parts.filter(function (p) { return p.main; })[0];
      it.strokes = mp && mp.strokes ? mp.strokes.map(function (st) { return st.map(function (q) { return [Math.round(q[0] * 256 / mp.size), Math.round(q[1] * 256 / mp.size)]; }); }) : [];
      // おぼえぐあいの記録は、出題の字そのものが書けたかどうかで決める（となりの字のまちがいでは「にがて」にしない）
      it.rec = result === 'correct' ? 'correct' : !mp || !mp.res ? 'wrong' : mp.res === 'correct' ? null : mp.res === 'retry' ? 'recog' : 'wrong';
    } else it.strokes = pad.strokes256();
    pad.lock(true);
    $('tControls').hidden = true; $('tSkip').hidden = true; $('tNextRow').hidden = false; $('tWordNav').hidden = true;
    $('tQ').innerHTML = renderQ(it.parts ? it.mq : it.q, result === 'correct' ? 'answer' : 'wrong');
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
    if (!session) return;   // 最後の問題で2回おしたときなど（テストはもう終わっている）
    if (practicing) { if (pad.strokes().length) practiceCheck(); return; }
    if (!ready || answered || !pad.strokes().length) return;
    var it = cur();
    if (it.parts) { answerWord(it); return; }
    var cands = R.recognize(pad.strokes(), { width: pad.size(), height: pad.size() }, 10);
    var j = R.judge(cands, it.ch);
    it.tries++;
    // 画数がちがうと読み取れないことが多い（例: 五の2画目と3画目をつなげる）。
    // 1回めは画数のヒントを出して書き直し、2回めも画数がちがえば理由を伝えてまちがいにする。
    var std = STD_STROKES[it.ch], n = pad.strokes().length, mismatch = !!std && n !== std;
    if (j.result === 'correct') {
      feedback('correct', K('[正解:せいかい]！'), it.peeked ? peekNote() : it.again ? K('[今度:こんど]は [書:か]けたね。[別:べつ]の [日:ひ]にも [書:か]けたら「[覚:おぼ]えた」に なるよ。') : '', true, false);
      finishItem('correct');
      if (it.peeked) pending = 'recog';   // 書き順を見たあとの正解は 記録に入れない
    } else if (mismatch && !it.strokeHinted) {
      it.strokeHinted = true;
      feedback('retry', std + K('[画:かく]で [書:か]いてみよう'), K('[今:いま]は ') + n + K('[画:かく] だったよ。1[画:かく]ずつ [離:はな]して [書:か]こう。'), false, false, [it.ch]);
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
  // 熟語テスト：1字ずつ書いて「次の字へ」、最後の字で まとめて判定する
  function answerWord(it) {
    keepStrokes();
    var next = -1, i;
    for (i = it.pi + 1; i < it.parts.length; i++) if (!it.parts[i].ok && !it.parts[i].strokes) { next = i; break; }
    if (next < 0) for (i = 0; i < it.parts.length; i++) if (!it.parts[i].ok && !it.parts[i].strokes) { next = i; break; }
    if (next >= 0) {
      it.pi = next; it.mq.state.cur = next;
      paintWord();
      $('tFb').hidden = true;
      pad.clear(); showCount(0); updateAnswerBtn();
      return;
    }
    it.tries++;
    var tops = [];
    it.parts.forEach(function (q) {
      if (q.ok) return;
      var c = R.recognize(q.strokes, { width: q.size, height: q.size }, 10), j = R.judge(c, q.ch);
      q.res = j.result; q.seenAs = j.seenAs; q.ok = j.result === 'correct';
      var std = STD_STROKES[q.ch]; q.mismatch = !!std && q.strokes.length !== std;
      if (q.main) it.top = c.slice(0, 5).map(function (x) { return x.char; }).join('');
    });
    var bad = it.parts.filter(function (q) { return !q.ok; });
    var names = function (l) { return l.map(function (q) { return (it.parts.indexOf(q) + 1) + K('[字:じ][目:め]'); }).join('・'); };
    if (!bad.length) {
      feedback('correct', K('[正解:せいかい]！'), it.peeked ? peekNote() : '', true, false);
      finishItem('correct');
      if (it.peeked) pending = 'recog';   // applyRec で 出題の字も 'recog' になる
    } else if (it.tries < MAX_RETRY && bad.every(function (q) { return q.res === 'retry' || (q.mismatch && !q.hinted); })) {
      // 読み取りにくかった字・画数がちがった字だけ、もう一度書く（書けた字はそのまま）
      bad.forEach(function (q) { if (q.mismatch) q.hinted = true; q.thumb = ''; q.strokes = null; });
      it.pi = it.parts.indexOf(bad[0]); it.mq.state.cur = it.pi;
      paintWord();
      var hinted = bad.filter(function (q) { return q.mismatch; });
      var hint = hinted.map(function (q) { return (it.parts.indexOf(q) + 1) + K('[字:じ][目:め]は ') + STD_STROKES[q.ch] + K('[画:かく]'); }).join('、');
      var orderChars = hinted.map(function (q) { return q.ch; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
      feedback('retry', names(bad) + K('を もう[一度:いちど] ていねいに [書:か]いてね'), hint ? hint + K('で [書:か]いてみよう') : K('うまく [読:よ]み[取:と]れなかったよ（') + it.tries + ' / ' + MAX_RETRY + '）', false, false, orderChars.length ? orderChars : null);
      pad.clear(); showCount(0); updateAnswerBtn();
    } else if (bad.every(function (q) { return q.res === 'retry'; })) {
      feedback('recog', K('[読:よ]み[取:と]れませんでした'), K('[間違:まちが]いには しません。[答:こた]えは この [言葉:ことば]です。'), true, false);
      finishItem('recog');
    } else {
      var wrong = bad.filter(function (q) { return q.res !== 'retry'; });
      feedback('wrong', K('[残念:ざんねん]'), names(wrong) + K('が [違:ちが]ったよ。[答:こた]えは この [言葉:ことば]。'), true, true);
      finishItem('wrong', (it.parts.filter(function (q) { return q.main; })[0] || {}).seenAs);
    }
  }
  $('tSkip').onclick = function () {
    if (!session) return;   // 最後の問題で2回おしたときなど（テストはもう終わっている）
    if (answered) return;
    cur().tries++;
    feedback('wrong', cur().parts ? K('[答:こた]えは この [言葉:ことば]') : K('[答:こた]えは この [漢字:かんじ]'), K('[次:つぎ]は [書:か]けるように [練習:れんしゅう] しよう。'), true, false);
    finishItem('wrong', null);
  };
  $('tNext').onclick = function () {
    if (!session) return;   // 最後の問題で2回おしたときなど（テストはもう終わっている）
    var it = cur();
    it.result = pending;
    // 「もういちど」は答えを見た直後なので、記録（にがて・おぼえた）は変えない
    if (!it.again) applyRec(it, pending);
    saveSession(session.items.filter(function (x) { return x.result; }));   // 1問ごとに保存（とちゅうで とじても のこる）
    if (session.idx + 1 >= session.items.length && !session.againAdded) {
      // さいごに、このテストで まちがえた字を もういちど出す（ちがう問題で、1回だけ）
      session.againAdded = true;
      session.items.forEach(function (x) {
        if (!x.again && x.result === 'wrong') session.items.push(newItem(x.ch, true));
      });
    }
    if (session.idx + 1 < session.items.length) { session.idx++; showItem(); }
    else endTest();
  };
  // 熟語テストでは it.rec（出題の字そのものの結果。null = 書けていたが、となりの字がちがった → 記録を変えない）
  function applyRec(it, pending) {
    if (!it.parts) { applyResult(it.ch, it.q.id, pending); return; }
    var r = pending === 'recog' && (it.rec === 'wrong' || it.rec === 'correct') ? 'recog' : it.rec;   // 判定ミスの報告を押したとき
    if (r) applyResult(it.ch, it.q.id, r);
  }
  // こたえた ところまでの問題（「つぎへ」を おす前の 問題も ふくめる。記録もここで つける）
  function answeredItems() {
    var it = cur();
    if (answered && !it.result) { it.result = pending; if (!it.again) applyRec(it, pending); }
    return session.items.filter(function (x) { return x.result; });
  }
  // 「やめる」を おさずに テストの画面から はなれたとき（ブラウザの もどる・ロゴ・下のリンクなど）。
  // こたえた ところまでを保存して テストを おわりにする（のこったままだと モードを切りかえられなくなる）
  function leaveTest() {
    var done = answeredItems();
    if (done.length) saveSession(done);
    session = null;
  }
  var quitArmed = false;
  $('tQuit').onclick = function () {
    if (!session) return;   // 最後の問題で2回おしたときなど（テストはもう終わっている）
    if (!quitArmed) { quitArmed = true; this.textContent = K('[本当:ほんとう]に やめる？'); var b = this; setTimeout(function () { quitArmed = false; b.textContent = K('やめる'); }, 3000); return; }
    quitArmed = false; this.textContent = 'やめる';
    var done = answeredItems();
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
        if (x.word) o.word = x.word;
        if (x.again) o.again = true;
        if (x.peeked) o.peeked = true;   // テスト中に書き順を見た（正解でも記録に入れない）
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

  // ---------- 漢字の練習 ----------
  // 1字ずつ「なぞる → 見て書く → 見ないで書く」。どの段階にもタップでいつでも切りかえられる
  // 記録（おぼえぐあい）は変えない。覚えたかどうかはテストで決める
  var DSTEPS = [
    { key: 'trace', label: 'なぞる', times: 1 },
    { key: 'copy', label: '[見:み]て [書:か]く', times: 1 },
    { key: 'recall', label: '[見:み]ないで [書:か]く', times: 1 }
  ];
  var drill = null, dpad = null, dBusy = false, dPickGrade = null, dPickN = 5;
  function renderDrill() {
    if (dPickGrade === null || levels().indexOf(dPickGrade) < 0) dPickGrade = levels().indexOf(pickGrade) >= 0 ? pickGrade : levels()[0];
    $('dTitle').textContent = mode === 'kanken' ? K('どの [級:きゅう]を [練習:れんしゅう]する？') : K('[何年生:なんねんせい]の [漢字:かんじ]を [練習:れんしゅう]する？');
    var html = '';
    levels().forEach(function (g) {
      var ok = hasGrade(g);
      html += '<button class="grade' + (ok && g === dPickGrade ? ' on' : '') + '" data-g="' + g + '"' + (ok ? '' : ' disabled') + '><b>' + K(GRADE_NAME[g]) + '</b>' +
        (ok ? '<span class="sample">' + esc(gradeChars(g).slice(0, 4).join('')) + '…</span>' : '<small>' + K('[準備中:じゅんびちゅう]') + '</small>') + '</button>';
    });
    $('dList').innerHTML = html;
    Array.prototype.forEach.call($('dList').querySelectorAll('.grade'), function (b) {
      b.onclick = function () { dPickGrade = +b.dataset.g; renderDrill(); };
    });
    $('dStart').disabled = !hasGrade(dPickGrade);
  }
  Array.prototype.forEach.call($('dCount').querySelectorAll('button'), function (b) {
    b.onclick = function () {
      dPickN = +b.dataset.n;
      Array.prototype.forEach.call($('dCount').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x === b); });
    };
  });
  $('dStart').onclick = function () { startDrill(chooseForGrade(dPickGrade, dPickN)); };
  function startDrill(chars, opt) {
    var qwait = needChars(chars);
    if (qwait) { waitData(qwait, function () { startDrill(chars, opt); }, ['dStart', 'tPractice', 'qdDrill']); return; }
    var wait = ensureRefs(chars);
    if (wait) {
      $('loadstate').textContent = K('[漢字:かんじ]の [手本:てほん]を [読:よ]み[込:こ]み[中:ちゅう]…');
      $('dStart').disabled = true;
      wait.then(function () { $('loadstate').textContent = ''; $('dStart').disabled = false; startDrill(chars, opt); },
        function () { $('loadstate').textContent = K('[手本:てほん]を [読:よ]み[込:こ]めませんでした'); $('dStart').disabled = false; });
      return;
    }
    drill = { items: chars.map(function (ch) { return { ch: ch, done: false, misses: 0, step: 0, count: 0, peek: false }; }), idx: 0, back: opt && opt.back, word: opt && opt.word };
    $('dQuit').textContent = drill.back ? K('テストに [戻:もど]る') : K('やめる');
    if (!dpad) dpad = new window.PopKanjiPad($('dPad'), { onChange: function (n) { dShowCount(n); dUpdateBtns(); } });
    go('drillrun');
    dShowChar();
  }
  function dCur() { return drill.items[drill.idx]; }
  function dShowCount(n) {
    var el = $('dCountN'), std = drill && STD_STROKES[dCur().ch];
    el.hidden = !n && !std;
    el.textContent = std ? n + ' / ' + std + K('[画:かく]') : n + K('[画:かく]');
    el.className = 'padcount' + (std && n === std ? ' ok' : std && n > std ? ' over' : '');
  }
  function dUpdateBtns() {
    if (!dpad || !drill) return;
    var n = dpad.strokes().length;
    $('dCheck').disabled = !ready || !n || dBusy;
    $('dCheck').textContent = ready ? K('[書:か]けた！') : K('[準備中:じゅんびちゅう]…');
    $('dUndo').disabled = !n || dBusy; $('dClear').disabled = !n || dBusy;
  }
  // 書き順：KanjiVG から作った手本（1つ目はそのままの形）の筆画を、順に描いて見せる
  var kvgFirst = null;
  function orderStrokes(ch) {
    var lists = ['POPKANJI_KVG_REFS', 'POPKANJI_KVG_REFS_MID', 'POPKANJI_KVG_REFS_11', 'POPKANJI_KVG_REFS_12'];
    if (!kvgFirst) kvgFirst = {};
    if (kvgFirst[ch] !== undefined) return kvgFirst[ch];
    var found = null;
    lists.forEach(function (n) { if (found) return; var l = window[n] || []; for (var i = 0; i < l.length; i++) if (l[i][0] === ch) { found = l[i][2]; break; } });
    kvgFirst[ch] = found;
    return found;
  }
  function orderSvg(ch, animate) {
    var st = orderStrokes(ch);
    if (!st || st.length !== STD_STROKES[ch] && STD_STROKES[ch]) return '<div class="bigch" aria-label="' + esc(ch) + '">' + esc(ch) + '</div>';
    var xs = [], ys = [];
    st.forEach(function (s) { s.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var w = Math.max(x1 - x0, y1 - y0, 1), pad = w * 0.14, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var sc = 200 / (w + 2 * pad), tx = function (x) { return (100 + (x - cx) * sc).toFixed(1); }, ty = function (y) { return (100 + (y - cy) * sc).toFixed(1); };
    // 点と点のあいだを なめらかにつなぐ
    var paths = st.map(function (s) {
      if (s.length === 1) return 'M' + tx(s[0][0]) + ' ' + ty(s[0][1]) + 'l0.1 0.1';
      var d = 'M' + tx(s[0][0]) + ' ' + ty(s[0][1]);
      for (var i = 1; i < s.length - 1; i++) d += ' Q' + tx(s[i][0]) + ' ' + ty(s[i][1]) + ' ' + tx((s[i][0] + s[i + 1][0]) / 2) + ' ' + ty((s[i][1] + s[i + 1][1]) / 2);
      d += ' L' + tx(s[s.length - 1][0]) + ' ' + ty(s[s.length - 1][1]);
      return d;
    });
    var dur = 0.55, html = '<svg class="order" viewBox="0 0 200 200" role="img" aria-label="' + esc(ch) + K(' の [書:か]き[順:じゅん]') + '">';
    paths.forEach(function (d) { html += '<path class="ghost" d="' + d + '"/>'; });
    paths.forEach(function (d, i) {
      html += '<path d="' + d + '" pathLength="1"' + (animate ? ' style="stroke-dasharray:1;stroke-dashoffset:1;animation:dwrite ' + dur + 's ' + (i * (dur + 0.15)).toFixed(2) + 's linear forwards"' : '') + '/>';
    });
    var placed = [];
    st.forEach(function (s, i) {
      var p = s[0], x = +tx(p[0]) - 10, y = +ty(p[1]) - 6;
      // 番号どうしが重ならないように少しずらす
      for (var t = 0; t < 6 && placed.some(function (q) { return Math.abs(q[0] - x) < 13 && Math.abs(q[1] - y) < 14; }); t++) x -= 12;
      placed.push([x, y]);
      html += '<text x="' + Math.max(2, Math.min(186, x)).toFixed(0) + '" y="' + Math.max(14, Math.min(196, y)).toFixed(0) + '"' + (animate ? ' style="opacity:0;animation:dnum .01s ' + (i * (dur + 0.15)).toFixed(2) + 's forwards"' : '') + '>' + (i + 1) + '</text>';
    });
    return html + '</svg>';
  }
  function dShowChar() {
    var n = drill.items.length;
    dBusy = false;
    $('dNum').textContent = (drill.idx + 1) + ' / ' + n;
    $('dProg').style.width = (100 * drill.idx / n) + '%';
    // テストの熟語から来たときは、その言葉ぜんたいを上に出す
    $('dTarget').hidden = !drill.word;
    if (drill.word) $('dTarget').innerHTML = '<span class="lb">' + K('この [言葉:ことば]') + '</span><b>' +
      Array.from(drill.word).map(function (c) { return c === dCur().ch ? '<i>' + esc(c) + '</i>' : esc(c); }).join('') + '</b>';
    $('dNav').hidden = n < 2;
    $('dPrev').disabled = drill.idx === 0;
    $('dNext').textContent = drill.idx + 1 < n ? K('[次:つぎ]の [字:じ] ▶') : K('おわる ▶');
    $('dPos').textContent = (drill.idx + 1) + ' / ' + n + K('[字:じ]');
    dShowStep();
    dFitPad();
  }
  $('dPrev').onclick = function () { if (!drill || dBusy || drill.idx === 0) return; drill.idx--; dShowChar(); };
  $('dNext').onclick = function () { if (!drill || dBusy) return; dNextChar(); };
  function dShowStep() {
    var it = dCur(), step = DSTEPS[it.step];
    $('dSteps').innerHTML = DSTEPS.map(function (s, i) {
      return '<li class="' + (i < it.step ? 'done' : i === it.step ? 'now' : '') + '"><button type="button" data-s="' + i + '" aria-pressed="' + (i === it.step) + '">' + (i + 1) + '. ' + K(s.label) + (s.times > 1 && i === it.step ? '（' + (it.count + 1) + '/' + s.times + '）' : '') + '</button></li>';
    }).join('');
    // いつでも段階を選びなおせる
    Array.prototype.forEach.call($('dSteps').querySelectorAll('button'), function (b) {
      b.onclick = function () { dGoStep(+b.dataset.s); };
    });
    var c = dCard(it, it.step, it.peek, it.step === 0 && it.count === 0);
    $('dModel').innerHTML = c.model;
    $('dInfo').innerHTML = c.info;
    dBindReplay();
    $('dMsg').textContent = step.key === 'trace' ? K('うすい [字:じ]を なぞって [書:か]こう。[書:か]き[順:じゅん]に [気:き]を つけてね') :
      step.key === 'copy' ? K('[左:ひだり]の お[手本:てほん]を [見:み]ながら [書:か]こう') : K('お[手本:てほん]を [見:み]ないで [書:か]けるかな？');
    $('dMsg').className = 'dmsg';
    dpad.setGuide(step.key === 'trace' ? it.ch : null); dpad.setInk(null); dpad.lock(false); dpad.clear();
    $('dPad').classList.remove('ok', 'ng');
    dShowCount(0); dUpdateBtns();
  }
  // お手本（書き順）と 読み・画数・言葉の HTML。s = 段階、peek = 見ないで書くときに お手本を見せるか
  function dCard(it, s, peek, animate) {
    var k = KANJI[it.ch];
    var hide = DSTEPS[s].key === 'recall' && !peek;
    var model = hide ? '<div class="hidden-ch" aria-label="' + K('かくれて いるよ') + '">？</div>' :
      orderSvg(it.ch, animate) + '<div class="bigch" aria-hidden="true">' + esc(it.ch) + '</div><button class="btn replay" id="dReplay">▶ ' + K('[書:か]き[順:じゅん]') + '</button>';
    // 読み・画数・言葉。見ないで書くときは、問題の文（空欄つき）で思い出す
    var yomi = [].concat(k.on, k.kun).filter(Boolean).join('・') || '—';
    var info = '<dl><dt>' + K('[読:よ]み') + '</dt><dd>' + esc(yomi) + '</dd><dt>' + K('[画数:かくすう]') + '</dt><dd>' + (STD_STROKES[it.ch] || '—') + K('[画:かく]') + '</dd></dl>';
    // その字を使う言葉（熟語）を、字を目立たせて見せる。見ないで書くときも ヒントとして出す
    var ws = (k.words || []).slice(0, 2).map(function (w) {
      var m = /^([^（]+)（([^）]*)）?$/.exec(w) || [null, w, ''];
      return '<span class="w"><b>' + Array.from(m[1]).map(function (c) { return c === it.ch ? '<i>' + esc(c) + '</i>' : esc(c); }).join('') + '</b><small>' + esc(m[2] || '') + '</small></span>';
    });
    if (ws.length) info += '<div class="dword"><span class="lb">' + K('この [字:じ]を つかう [言葉:ことば]') + '</span>' + ws.join('') + '</div>';
    if (hide && QUESTIONS[it.ch]) { var q = QUESTIONS[it.ch][0]; info += '<p class="sub" style="margin:.6em 0 .2em">' + K('[四角:しかく]に [入:はい]る [漢字:かんじ]を [書:か]こう') + '</p><div class="qtext qline">' + renderQ(q, 'test') + '</div>'; }
    return { model: model, info: info };
  }
  function dBindReplay() {
    var it = dCur();
    if ($('dReplay')) $('dReplay').onclick = function () { var svg = $('dModel').querySelector('.order'); if (svg) svg.outerHTML = orderSvg(it.ch, true); };
  }
  // 書く枠の大きさ：お手本・知らせ・ボタン・前後の字まで 1画面に収まるように決める（テストの fitPad と同じ考え方）。
  // 1字のあいだは大きさを変えない：説明の長さは段階で変わるので、いちばん長い段階に合わせて 字ごとに決める
  function dFitPad() {
    if (!drill || $('v-drillrun').hidden) return;
    var it = dCur(), padEl = $('dPad'), w = padEl.parentNode, card = $('dModel').parentNode;
    padEl.style.width = ''; padEl.style.alignSelf = ''; w.style.gridTemplateColumns = '';
    var cr = card.getBoundingClientRect(), pr = padEl.getBoundingClientRect();
    if (!pr.width) return;
    var top = pr.top + window.scrollY;
    if (pr.top >= cr.bottom - 1) {
      // 枠が説明の下にあるとき：どの段階でも 枠が下がりすぎないように、写しを作って いちばん高い説明の高さを はかる
      var cl = card.cloneNode(true);
      Array.prototype.forEach.call(cl.querySelectorAll('[id]'), function (e) { e.removeAttribute('id'); });
      cl.removeAttribute('id');
      cl.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;box-sizing:border-box;width:' + cr.width + 'px';
      card.parentNode.appendChild(cl);
      var maxH = cr.height;
      [[0, false], [1, false], [2, false], [2, true]].forEach(function (v) {
        var c = dCard(it, v[0], v[1], false);
        cl.querySelector('.dmodel').innerHTML = c.model; cl.querySelector('.dinfo').innerHTML = c.info;
        maxH = Math.max(maxH, cl.getBoundingClientRect().height);
      });
      cl.remove();
      top += maxH - cr.height;
    }
    var below = 0, grid = getComputedStyle(w).display === 'grid';
    if (!grid) Array.prototype.forEach.call(w.children, function (c) { if (c !== padEl && !c.hidden) below += c.getBoundingClientRect().height + 8; });
    var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var size = Math.floor(Math.max(180, Math.min(pr.width, vh - top - below - 10)));
    if (size >= pr.width) return;
    // 小さくするのは枠だけ（ボタンの列は はばを そのままにして、字が はみ出さないように）
    if (grid) { var cols = getComputedStyle(w).gridTemplateColumns.split(' '); cols[0] = size + 'px'; w.style.gridTemplateColumns = cols.join(' '); }
    else { padEl.style.width = (size - (pr.width - padEl.clientWidth)) + 'px'; padEl.style.alignSelf = 'center'; }
  }
  window.addEventListener('resize', function () { if (drill) dFitPad(); });
  function dGoStep(i) {
    if (!drill || dBusy || i === dCur().step) return;
    var it = dCur();
    it.step = i; it.count = 0; it.peek = false; it.misses = 0;
    dShowStep();
  }
  $('dUndo').onclick = function () { dpad.undo(); };
  $('dClear').onclick = function () { dpad.clear(); };
  $('dCheck').onclick = function () {
    if (dBusy || !ready || !dpad.strokes().length) return;
    var it = dCur(), step = DSTEPS[it.step], padEl = $('dPad');
    var cands = R.recognize(dpad.strokes(), { width: dpad.size(), height: dpad.size() }, 10);
    var ok = R.judge(cands, it.ch).result === 'correct';
    var std = STD_STROKES[it.ch], n = dpad.strokes().length;
    padEl.classList.remove('ok', 'ng'); void padEl.offsetWidth;
    if (ok) {
      dBusy = true; dpad.setInk('--ok'); dpad.lock(true); padEl.classList.add('ok');
      $('dStamp').innerHTML = '<span class="mark">◎</span><span class="word">' + esc(K('よく [書:か]けたね！')) + '</span>';
      $('dMsg').textContent = K('よく [書:か]けたね！'); $('dMsg').className = 'dmsg ok';
      dUpdateBtns();
      setTimeout(function () {
        if (!drill) return;
        padEl.classList.remove('ok');
        it.count++;
        if (it.count >= step.times) { it.step++; it.count = 0; it.peek = false; }
        if (it.step >= DSTEPS.length) { it.done = true; it.step = DSTEPS.length - 1; it.count = step.times - 1; dNextChar(); return; }
        dBusy = false; dShowStep();
      }, 1200);
    } else {
      it.misses++;
      padEl.classList.add('ng');
      setTimeout(function () { padEl.classList.remove('ng'); }, 600);
      var msg = std && n !== std ? std + K('[画:かく]で [書:か]いてみよう（[今:いま]は ') + n + K('[画:かく]）') : K('おしい！ もう[一度:いちど] [書:か]いてみよう');
      // 見ないで書くとき、2回うまくいかなかったら お手本を見せる（見たあとも、見ないで書けるまで続ける）
      if (step.key === 'recall' && !it.peek && it.misses >= 2) { it.peek = true; dShowStep(); msg = K('お[手本:てほん]を [見:み]て、もう[一度:いちど] [書:か]いてみよう'); }
      else dpad.clear();
      $('dMsg').textContent = msg; $('dMsg').className = 'dmsg ng';
      dUpdateBtns();
    }
  };
  function dNextChar() {
    dBusy = false;
    if (drill.idx + 1 < drill.items.length) { drill.idx++; dShowChar(); return; }
    if (drill.back) { backToTest(); return; }
    renderDrillDone(); go('drilldone');
  }
  $('dQuit').onclick = function () { if (!drill) return; if (drill.back) { backToTest(); return; } renderDrillDone(); go('drilldone'); };
  function backToTest() {
    drill = null; dBusy = false;
    $('dQuit').textContent = K('やめる');
    if ($('tPmsg')) { $('tPmsg').textContent = K('[練習:れんしゅう]したね！ [次:つぎ]へ [進:すす]もう'); $('tPmsg').className = 'pmsg ok'; }
    go('test');
    setTimeout(function () { try { $('tNext').focus({ preventScroll: true }); } catch (e) {} }, 50);
  }
  function renderDrillDone() {
    var done = drill.items.filter(function (x) { return x.done; });
    $('ddNote').textContent = done.length ? done.length + K('[字:じ] [練習:れんしゅう]したよ。テストで [書:か]けたら「[覚:おぼ]えかけ」→「[覚:おぼ]えた」に なるよ。') : K('[練習:れんしゅう]した [字:じ]は ありません。');
    $('ddList').innerHTML = drill.items.map(function (x) {
      return '<div class="it"><b>' + esc(x.ch) + '</b><small>' + (x.done ? K('[書:か]けた') : K('まだ')) + '</small></div>';
    }).join('');
    $('ddTest').disabled = !done.length;
    $('ddTest').onclick = function () { var chars = done.map(function (x) { return x.ch; }); drill = null; startTest('review', 0, shuffle(chars)); };
  }

  // ---------- 読みの問題 ----------
  // 書くテストとは別の遊び。おぼえぐあい（覚えた・苦手）は変えない
  var quiz = null, qPickGrade = null, qPickN = 10;
  // 文の中の漢字の読みを4つから選ぶ
  var readPool = {};
  function readingsOf(g) {
    if (readPool[g]) return readPool[g];
    var a = [];
    gradeChars(g).forEach(function (ch) { (QUESTIONS[ch] || []).forEach(function (q) { q.tokens.forEach(function (t) { if (t.b !== undefined && t.r) a.push(t.r); }); }); });
    readPool[g] = a;
    return a;
  }
  function quizRead(ch, g) {
    var qs = (QUESTIONS[ch] || []).filter(function (q) { return q.tokens.some(function (t) { return t.b !== undefined && t.r; }); });
    if (!qs.length) return null;
    var q = qs[Math.floor(Math.random() * qs.length)];
    var tok = null;
    q.tokens.forEach(function (t) { if (!tok && t.b !== undefined) tok = t; });
    var k = KANJI[ch], mine = {}; [].concat(k.on, k.kun).filter(Boolean).forEach(function (r) { mine[r] = true; });
    var pool = readingsOf(g).filter(function (r) { return r !== tok.r && !mine[r]; });
    var near = pool.filter(function (r) { return Math.abs(Array.from(r).length - Array.from(tok.r).length) <= 1; });
    var src = shuffle((near.length >= 6 ? near : pool).slice()), pick = [], seen = {};
    for (var i = 0; i < src.length && pick.length < 3; i++) if (!seen[src[i]]) { seen[src[i]] = true; pick.push(src[i]); }
    if (pick.length < 3) return null;
    var opts = [{ ok: true, text: tok.r }].concat(pick.map(function (r) { return { ok: false, text: r }; }));
    return { type: 'read', ch: ch, ask: K('[赤:あか]い [漢字:かんじ]の [読:よ]みは どれ？'), q: q, opts: shuffle(opts) };
  }
  function makeQuiz(g, n) {
    var chars = shuffle(gradeChars(g).slice()), out = [];
    for (var i = 0; i < chars.length && out.length < n; i++) {
      var item = quizRead(chars[i], g);
      if (item) out.push(item);
    }
    return out;
  }
  function renderQuizPick() {
    if (qPickGrade === null || levels().indexOf(qPickGrade) < 0) qPickGrade = levels().indexOf(pickGrade) >= 0 ? pickGrade : levels()[0];
    $('qTitle').textContent = mode === 'kanken' ? K('どの [級:きゅう]の [読:よ]みの [問題:もんだい]？') : K('[何年生:なんねんせい]の [読:よ]みの [問題:もんだい]？');
    var html = '';
    levels().forEach(function (g) {
      var ok = hasGrade(g);
      html += '<button class="grade' + (ok && g === qPickGrade ? ' on' : '') + '" data-g="' + g + '"' + (ok ? '' : ' disabled') + '><b>' + K(GRADE_NAME[g]) + '</b>' +
        (ok ? '<span class="sample">' + esc(gradeChars(g).slice(0, 4).join('')) + '…</span>' : '<small>' + K('[準備中:じゅんびちゅう]') + '</small>') + '</button>';
    });
    $('qList').innerHTML = html;
    Array.prototype.forEach.call($('qList').querySelectorAll('.grade'), function (b) { b.onclick = function () { qPickGrade = +b.dataset.g; renderQuizPick(); }; });
    Array.prototype.forEach.call($('qCount').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', +x.dataset.n === qPickN); });
    $('qStart').disabled = !hasGrade(qPickGrade);
  }
  Array.prototype.forEach.call($('qCount').querySelectorAll('button'), function (b) {
    b.onclick = function () { qPickN = +b.dataset.n; renderQuizPick(); };
  });
  function startQuiz() {
    var qwait = needGrade(qPickGrade);
    if (qwait) { waitData(qwait, startQuiz, ['qStart']); return; }
    var items = makeQuiz(qPickGrade, qPickN);
    if (!items.length) { $('qNote').textContent = K('この [級:きゅう]では [問題:もんだい]を [作:つく]れませんでした'); return; }
    $('qNote').textContent = '';
    quiz = { grade: qPickGrade, items: items, idx: 0, ok: 0, answered: false };
    go('quizrun'); showQuizItem();
  }
  $('qStart').onclick = startQuiz;
  function showQuizItem() {
    var it = quiz.items[quiz.idx], n = quiz.items.length;
    quiz.answered = false;
    $('qNum').textContent = (quiz.idx + 1) + ' / ' + n;
    $('qProg').style.width = (100 * quiz.idx / n) + '%';
    $('qAsk').textContent = it.ask;
    $('qBody').innerHTML = '<div class="qtext qline">' + renderQ(it.q, 'read') + '</div>';
    $('qChoices').className = 'choices ' + it.type;
    $('qChoices').innerHTML = it.opts.map(function (o, i) {
      return '<button class="choice" data-i="' + i + '"><span class="rd">' + esc(o.text) + '</span></button>';
    }).join('');
    Array.prototype.forEach.call($('qChoices').querySelectorAll('.choice'), function (b) { b.onclick = function () { answerQuiz(+b.dataset.i); }; });
    $('qFb').hidden = true; $('qFb').innerHTML = '';
    $('qNextRow').hidden = true;
    window.scrollTo(0, 0);
  }
  function answerQuiz(i) {
    if (quiz.answered) return;
    quiz.answered = true;
    var it = quiz.items[quiz.idx], ok = it.opts[i].ok;
    it.got = ok;
    if (ok) quiz.ok++;
    Array.prototype.forEach.call($('qChoices').querySelectorAll('.choice'), function (b, j) {
      b.disabled = true;
      if (it.opts[j].ok) b.classList.add('right');
      if (j === i && !ok) b.classList.add('bad');
    });
    var k = KANJI[it.ch];
    $('qFb').className = 'fb ' + (ok ? 'correct' : 'wrong');
    $('qFb').innerHTML = '<div class="head"><span class="ans">' + esc(it.ch) + '</span><div><div class="verdict">' + (ok ? K('[正解:せいかい]！') : K('[残念:ざんねん]')) + '</div>' +
      '<div>' + K('[読:よ]み：') + esc(it.opts.filter(function (o) { return o.ok; })[0].text) + '</div></div></div>' +
      (k && k.words && k.words.length ? '<div class="qwords">' + esc(k.words.slice(0, 3).join('　')) + '</div>' : '');
    $('qFb').hidden = false;
    $('qNextRow').hidden = false;
    $('qNext').textContent = quiz.idx + 1 < quiz.items.length ? K('[次:つぎ]へ') : K('けっか を [見:み]る');
    $('qNext').focus({ preventScroll: true });
    if (ok) quizTimer = setTimeout(function () { if (quiz && quiz.answered) nextQuiz(); }, 900);
  }
  var quizTimer = null;
  function nextQuiz() {
    clearTimeout(quizTimer);
    if (quiz.idx + 1 < quiz.items.length) { quiz.idx++; showQuizItem(); return; }
    renderQuizDone(); go('quizdone');
  }
  $('qNext').onclick = nextQuiz;
  $('qQuit').onclick = function () { clearTimeout(quizTimer); if (quiz && quiz.idx) { renderQuizDone(); go('quizdone'); } else { quiz = null; go('home'); } };
  function renderQuizDone() {
    var done = quiz.items.filter(function (x) { return x.got !== undefined; });
    $('qdScore').textContent = quiz.ok;
    $('qdOf').textContent = '/ ' + done.length + K('[問:もん] [正解:せいかい]');
    var bad = done.filter(function (x) { return !x.got; });
    $('qdNote').textContent = bad.length ? K('[間違:まちが]えた [漢字:かんじ]：') + bad.map(function (x) { return x.ch; }).join('　') : K('ぜんぶ [正解:せいかい]！');
    $('qdList').innerHTML = done.map(function (x) {
      return '<div class="it' + (x.got ? '' : ' ng') + '"><b>' + esc(x.ch) + '</b><small>' + K('[読:よ]み') + '</small></div>';
    }).join('');
    $('qdPractice').disabled = !bad.length;
    $('qdPractice').onclick = function () {
      var list = bad.map(function (x) { return x.ch; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
      quiz = null; startDrill(list);
    };
  }

  // ---------- 結果 ----------
  var PILL = { correct: '[正解:せいかい]', wrong: '[間違:まちが]い', recog: '[読:よ]み[取:と]れず' };
  function renderResult() {
    var all = lastResult.items;
    var items = all.filter(function (x) { return !x.again; }), again = all.filter(function (x) { return x.again; });
    var ok = items.filter(function (x) { return x.result === 'correct'; }).length;
    var wrong = items.filter(function (x) { return x.result === 'wrong'; });
    var recog = items.filter(function (x) { return x.result === 'recog' && !x.peeked; }).length;
    var peeked = items.filter(function (x) { return x.result === 'recog' && x.peeked; }).length;
    $('rScore').textContent = ok;
    $('rOf').textContent = '/ ' + items.length + K(' [問:もん] [正解:せいかい]') + (lastResult.partial ? K('（[途中:とちゅう]で やめた ところまで）') : '');
    $('rNote').textContent = (wrong.length ? K('[間違:まちが]えた ') + wrong.length + K('字は [苦手:にがて]リストに [入:はい]りました。') : K('[間違:まちが]いは ありませんでした。')) +
      (recog ? K(' [読:よ]み[取:と]れなかった ') + recog + K('字は [間違:まちが]いに していません。') : '') +
      (peeked ? K(' [書:か]き[順:じゅん]を [見:み]た ') + peeked + K('字は [記録:きろく]に [入:い]れていません。') : '') +
      (again.length ? K(' もう[一度:いちど]：') + again.filter(function (x) { return x.result === 'correct'; }).length + ' / ' + again.length + K('字 [書:か]けました。') : '');
    function row(x) {
      return '<div class="ritem' + (x.again ? ' again' : '') + '"><span class="k">' + esc(x.word || x.ch) + '</span><span class="q qline">' + renderQ(x.parts ? x.mq : x.q, x.result === 'correct' ? 'answer' : 'wrong') +
        '</span><span class="pill ' + x.result + '">' + (x.again ? K('もう[一度:いちど] ') : '') + K(x.peeked && x.result === 'recog' ? '[書:か]き[順:じゅん]を [見:み]た' : PILL[x.result]) + '</span></div>';
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
    else startTest('review', 0, uniq(lastResult.items.filter(function (x) { return !x.again; }).map(function (x) { return x.ch; })));   // さっきと同じ字で
  };
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  // ---------- 新しいバージョンの読みこみ ----------
  // ブラウザに残っている古いページを取りなおしてから開きなおす（学習の記録 IndexedDB はそのまま）
  // Service Worker があるときは、新しい sw.js を取りにいき、入ったら すぐ切りかえてから開きなおす
  $('aUpdate').onclick = function () {
    var btn = this; btn.disabled = true; $('aUpMsg').textContent = K('[読:よ]み[込:こ]み[中:ちゅう]…');
    var url = location.pathname + '?t=' + Date.now() + '#home', done = false;
    function reload() { if (done) return; done = true; location.replace(url); }
    function fail() {
      if (done) return; done = true; btn.disabled = false;
      $('aUpMsg').textContent = K('[通信:つうしん]できないので、あたらしい バージョンを [調:しら]べられませんでした。インターネットに つないでから おしてね');
    }
    if (!swReg) { fetch(location.pathname, { cache: 'reload' }).catch(function () {}).then(reload); return; }
    if (navigator.onLine === false) { fail(); return; }
    navigator.serviceWorker.addEventListener('controllerchange', reload);
    swReg.update().then(function () {
      var w = swReg.installing || swReg.waiting;
      if (!w) { reload(); return; }   // 新しい版の sw.js はない → ページだけ取りなおす（ページは いつも通信を先に使う）
      function step() {
        if (w.state === 'installed') w.postMessage({ type: 'skipWaiting' });
        else if (w.state === 'activated' || w.state === 'redundant') reload();
      }
      w.addEventListener('statechange', step); step();
      setTimeout(reload, 20000);   // 何かで止まっても 開きなおす
    }, function () {
      // sw.js を取れない: つながっていなければ知らせる（sw.js は Service Worker が とっておかないので、いつも通信になる）
      fetch('sw.js?check=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (r.ok) reload(); else fail(); }, fail);
    });
  };

  // ---------- オフライン（Service Worker、sw.js） ----------
  // 1回開いたら 通信がなくても使えるように、アプリのファイルを この端末に とっておく。
  // 新しい版の sw.js が入っても 開いているページは そのまま。このページが その版のときだけ すぐ切りかえる
  // （ふつうは次に開いたとき。上の「あたらしい バージョンを よみこむ」で すぐ切りかえることもできる）
  var swReg = null;
  function registerSW() {
    if (!APP_VER || !('serviceWorker' in navigator) || !window.isSecureContext || !/^https?:$/.test(location.protocol)) return;   // APP_VER なし = build.sh を通していない
    try {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        swReg = reg;
        function offer() { if (reg.waiting) reg.waiting.postMessage({ type: 'skipWaiting', ifVersion: APP_VER }); }
        offer();
        reg.addEventListener('updatefound', function () {
          var w = reg.installing;
          if (w) w.addEventListener('statechange', function () { if (w.state === 'installed') offer(); });
        });
      }, function () {});
    } catch (e) {}
  }

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
  function selList() { return Object.keys(selected || {}).filter(function (ch) { return selected[ch] && QG[ch]; }); }
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
    // ほかの学年の字も 入っていることがある（苦手リスト・復習）。問題データがまだの学年は 先に読む
    var pw = needChars(printChars);
    if (pw) {
      $('pSheets').innerHTML = '<p class="sub">' + K('[問題:もんだい]を [読:よ]み[込:こ]み[中:ちゅう]…') + '</p>'; $('pNote').textContent = '';
      $('pPrintBtn').disabled = true;
      pw.then(function () { if (location.hash === '#print') renderPrint(); },
        function () { if (location.hash === '#print') $('pSheets').innerHTML = '<p class="msg" role="alert">' + esc(netFailText()) + '</p>'; });
      return;
    }
    $('pPrintBtn').disabled = false;
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
  /*
   * 保存の保護: Safari などは しばらく開かないと サイトの保存データを消すことがある。
   *  - navigator.storage.persist() で「消さないで」とお願いする（起動時に1回）
   *  - 最後に書き出した日を覚えておき、14日以上たっていたら 書き出しをすすめる
   */
  var persistState = null;   // true = 消されない設定 / false = 消されることがある / null = 調べられない
  var EXPORT_REMIND = 14 * 86400000;
  function askPersist() {
    try {
      var st = navigator.storage;
      if (!st || !st.persisted) return Promise.resolve();
      return st.persisted().then(function (p) {
        if (p || !st.persist) return p;
        return st.persist();
      }).then(function (p) { persistState = !!p; }, function () {});
    } catch (e) { return Promise.resolve(); }
  }
  function lastExport() {
    try { var v = +localStorage.getItem('kt-last-export'); return v > 0 ? v : 0; } catch (e) { return 0; }
  }
  function needExport() {
    var n = Object.keys(Store.all()).length + Store.sessions().length;
    return n > 0 && Store.persistent() && Date.now() - lastExport() > EXPORT_REMIND;
  }
  function updateExportHint(h) {
    var el = $('fExpHint'); if (!el) return;
    var on = h === 'home' && needExport();
    el.hidden = !on;
    if (on) el.textContent = K('[記録:きろく]の ひかえを [作:つく]ろう');
  }
  function fmtDate(t) { var d = new Date(t); return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  // 保存に失敗したとき（容量がいっぱい など）。じゃまにならないように しばらく出して消す
  var saveErrTimer = null, saveErrAt = 0;
  Store.onError = function () {
    var el = $('saveErr'); if (!el) return;
    if (Date.now() - saveErrAt < 3000 && !el.hidden) return;
    saveErrAt = Date.now();
    el.textContent = K('きろくを ほぞん できませんでした（ようりょうが いっぱいかも）');
    el.hidden = false;
    clearTimeout(saveErrTimer);
    saveErrTimer = setTimeout(function () { el.hidden = true; }, 6000);
  };
  function escH(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function renderData() {
    var n = Object.keys(Store.all()).length, s = Store.sessions().length;
    $('dState').textContent = (Store.persistent() ? 'この端末に保存しています。' : 'この端末に保存できない設定のため、ページを閉じると記録は消えます。') +
      ' 記録のある字: ' + n + '字 ・ テストの回数: ' + s + '回';
    var ps = $('dPersist');
    ps.hidden = !Store.persistent();
    ps.textContent = persistState ? 'この端末に ずっと保存する設定に なっています。' :
      'ブラウザによっては、長い間このアプリを開かないと 記録が消えることがあります。ときどき ファイルに書き出しておくと安心です。';
    var le = lastExport();
    $('dLastExp').textContent = le ? '最後に書き出した日: ' + fmtDate(le) : 'まだ書き出していません。';
    $('dRemind').hidden = !needExport();
    renderReport();
  }
  // 保護者・先生向け: 最近14日間の日ごとの回数・正答数と、よくまちがえる字
  function renderReport() {
    var ss = Store.sessions(), DAYS = 14, today = new Date(); today.setHours(0, 0, 0, 0);
    var days = [], byDay = {};
    for (var i = 0; i < DAYS; i++) {
      var d = new Date(today.getTime()); d.setDate(d.getDate() - i);
      var o = { t: d.getTime(), n: 0, q: 0, ok: 0 }; days.push(o); byDay[o.t] = o;
    }
    var wrong = {};
    ss.forEach(function (x) {
      var items = (x.items || []).filter(function (it) { return it && !it.again; });
      var d0 = new Date(x.at); d0.setHours(0, 0, 0, 0);
      var day = byDay[d0.getTime()];
      if (day) {
        day.n++; day.q += items.length;
        day.ok += items.filter(function (it) { return it.result === 'correct'; }).length;
      }
      (x.items || []).forEach(function (it) {
        if (!it || it.result !== 'wrong' || !it.ch) return;
        var w = wrong[it.ch] || (wrong[it.ch] = { ch: it.ch, n: 0, seen: {} });
        w.n++;
        if (it.seenAs && it.seenAs !== it.ch) w.seen[it.seenAs] = (w.seen[it.seenAs] || 0) + 1;
      });
    });
    var WD = '日月火水木金土', maxQ = Math.max.apply(null, days.map(function (d) { return d.q; }).concat([1]));
    var cap = function (t) { return '<caption class="sub" style="text-align:left;caption-side:bottom;padding-top:6px">' + t + '</caption>'; };
    if (!days.some(function (d) { return d.n; })) $('dDays').innerHTML = '<p class="sub">この14日間のテストの記録はありません。</p>';
    else {
      var rows = days.map(function (d) {
        var dt = new Date(d.t), lab = (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + WD[dt.getDay()];
        return '<tr' + (d.n ? '' : ' class="zero"') + '><td class="nw">' + lab + '</td><td class="num">' + d.n + '回</td>' +
          '<td class="num">' + (d.q ? d.ok + ' / ' + d.q : '—') + '</td>' +
          '<td aria-hidden="true">' + (d.q ? '<span class="dbar"><i style="width:' + (100 * d.ok / maxQ).toFixed(1) + '%"></i></span>' : '') + '</td>' +
          '<td class="num">' + (d.q ? Math.round(100 * d.ok / d.q) + '%' : '') + '</td></tr>';
      }).join('');
      $('dDays').innerHTML = '<table class="dtab">' + cap('正答 = 正答数 / 出題数。テストの最後に出る「もういちど」の問題はふくめません。') +
        '<colgroup><col style="width:27%"><col style="width:15%"><col style="width:21%"><col><col style="width:14%"></colgroup>' +
        '<thead><tr><th scope="col">日付</th><th scope="col" class="num">回数</th><th scope="col" class="num">正答</th><th scope="col" aria-hidden="true"></th><th scope="col" class="num">正答率</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>';
    }
    var list = Object.keys(wrong).map(function (k) { return wrong[k]; })
      .sort(function (a, b) { return b.n - a.n || (a.ch < b.ch ? -1 : 1); }).slice(0, 10);
    if (!list.length) $('dWrong').innerHTML = '<p class="sub">まちがえた字の記録はありません。</p>';
    else $('dWrong').innerHTML = '<table class="dtab">' + cap('これまでのすべてのテストから数えています（多い順に10字）。「読み取った字」は、まちがえたときに いちばん多く読み取られた字です。') +
      '<colgroup><col style="width:16%"><col style="width:24%"><col></colgroup>' +
      '<thead><tr><th scope="col">字</th><th scope="col" class="num">まちがい</th><th scope="col">読み取った字</th></tr></thead><tbody>' +
      list.map(function (w) {
        var top = Object.keys(w.seen).sort(function (a, b) { return w.seen[b] - w.seen[a]; })[0];
        return '<tr><td class="kj">' + escH(w.ch) + '</td><td class="num">' + w.n + '回</td><td class="seen">' +
          (top ? '「<span class="kj">' + escH(top) + '</span>」に見えた（' + w.seen[top] + '回）' : '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  $('dExport').onclick = function () {
    try {
      var blob = new Blob([JSON.stringify(Store.exportData())], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kanji-tane-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      try { localStorage.setItem('kt-last-export', String(Date.now())); } catch (e) {}
      renderData();
      $('dataMsg').textContent = '書き出しました。';
    } catch (e) { $('dataMsg').textContent = '書き出せませんでした。'; }
  };
  $('dImport').onchange = function () {
    var f = this.files && this.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var data;
      try { data = JSON.parse(rd.result); } catch (e) { $('dataMsg').textContent = 'ファイルを読めませんでした。かんじのたね で書き出したファイルを選んでください。'; return; }
      Store.importData(data).then(function () { selected = null; $('dataMsg').textContent = '読み込みました。'; renderData(); },
        function (e) { $('dataMsg').textContent = e.message + '。かんじのたね で書き出したファイルを選んでください。'; });
    };
    rd.readAsText(f);
    this.value = '';
  };
  var resetArmed = false;
  $('dReset').onclick = function () {
    if (!resetArmed) { resetArmed = true; this.textContent = '本当に消す（元に戻せません）'; var b = this; setTimeout(function () { resetArmed = false; b.textContent = '学習の記録をすべて消す'; }, 4000); return; }
    resetArmed = false; this.textContent = '学習の記録をすべて消す';
    Store.reset().then(function () { selected = null; $('dataMsg').textContent = '学習の記録を消しました。'; renderData(); });
  };

  function renderAbout() {
    var ok = [], soon = [];
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach(function (g) { (hasGrade(g) ? ok : soon).push(g); });
    var nm = function (g) { return g <= 6 ? '小' + g : GRADE_NAME[g]; };
    if ($('aReport')) $('aReport').hidden = !REPORT_URL;
    $('aRange').textContent = '問題があるのは ' + ok.map(function (g) { return nm(g) + '（' + GRADE_TOTAL[g] + '字）'; }).join('・') + ' です。' +
      (soon.length ? soon.map(nm).join('・') + ' は準備中です。' : '') +
      ' 手書きの読み取りは、小学校の1026字、中学・高校の1110字（漢検4級〜2級）、JIS第1・第2水準の常用外の4223字（漢検準1級・1級の目安）に対応しています。中学からの字の手本は漢検モードにしたときに、準1級・1級の手本はその字をテストするときに読みこみます。' +
      ' 漢検の準1級・1級は字の一覧が公開されていないため、協会の示す目安（JIS第1水準・第2水準）で分けています。実際の出題範囲とは一部ちがいます。';
  }

  // ---------- はじめ ----------
  Store.init().then(function () {
    if (Store.persistent()) askPersist().then(function () { if (location.hash === '#data') renderData(); });
    window.addEventListener('hashchange', route);
    route();
  });
})();
