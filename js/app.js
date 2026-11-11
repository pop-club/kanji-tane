/*
 * Pop-Kanji 学習アプリ
 * 画面: #home #grade #test #result #weak #print #data #about
 * 習得のきまり（指示書 7章）:
 *   はじめて正解 → おぼえかけ / まちがい → にがて / 2回つづけて正解 → おぼえた（1週間後に再確認）
 *   再確認でまちがい → にがてに戻す / 読み取れなかった・判定ミスは まちがいにしない
 */
(function () {
  'use strict';
  var R = window.PopKanjiRecognizer, Store = window.PopKanjiStore;
  var QD = window.POPKANJI_QUESTIONS || {};
  var GRADE_TOTAL = { 1: 80, 2: 160, 3: 200, 4: 202, 5: 193, 6: 191 };
  var GRADE_NAME = { 1: '1ねんせい', 2: '2ねんせい', 3: '3ねんせい', 4: '4ねんせい', 5: '5ねんせい', 6: '6ねんせい' };
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
  function hasGrade(g) { return !!QD[g]; }

  function renderQ(q, mode, extraClass) {
    // mode: 'test' 空欄 / 'answer' 答えを入れる / 'wrong' 答えを赤で
    return q.tokens.map(function (t) {
      if (t.t !== undefined) return esc(t.t);
      if (t.k !== undefined) return '<ruby>' + esc(t.k) + '<rt>' + esc(t.r) + '</rt></ruby>';
      var inner = mode === 'test' ? '<span class="blank" aria-label="しかく"></span>'
        : '<span class="blank filled' + (mode === 'wrong' ? ' ng' : '') + (extraClass || '') + '">' + esc(t.b) + '</span>';
      return '<ruby>' + inner + '<rt>' + esc(t.r) + '</rt></ruby>';
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
    return Object.keys(all).filter(function (ch) { return KANJI[ch] && (all[ch].status === 'weak' || isDue(all[ch], now)); })
      .sort(function (a, b) { return (all[a].lastAt || 0) - (all[b].lastAt || 0); });
  }

  // ---------- 読み取りの準備 ----------
  var ready = false;
  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.body.appendChild(s); });
  }
  loadScript('vendor/kanjicanvas/ref-patterns.js').then(function () {
    R.setCandidateSet(window.JOYO_KANJI);
    return loadScript('vendor/kanjivg-refs/kvg-refs.js').then(function () {
      R.setReplaced('衛臨熟数歌社馬鳥鳴島進駅健散験慣敬');
      R.setKvgRefs(window.POPKANJI_KVG_REFS);
    }, function () {});
  }).then(function () {
    ready = true;
    $('loadstate').textContent = '';
    updateAnswerBtn();
  }, function () {
    $('loadstate').textContent = 'よみとりの データを よみこめませんでした。ページを よみこみなおしてください。';
  });

  // ---------- 画面の切り替え ----------
  var views = ['home', 'grade', 'test', 'result', 'weak', 'print', 'data', 'about'];
  function show(name) {
    views.forEach(function (v) { $('v-' + v).hidden = v !== name; });
    window.scrollTo(0, 0);
    if (name === 'test' && pad) setTimeout(pad.redraw, 0);
  }
  function route() {
    var h = (location.hash || '#home').slice(1);
    if (views.indexOf(h) < 0) h = 'home';
    if (h === 'test' && !session) h = 'home';
    if (h === 'result' && !lastResult) h = 'home';
    if (h === 'print' && !printChars.length) h = 'weak';
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
    var weak = Object.keys(Store.all()).filter(function (ch) { return Store.get(ch).status === 'weak'; }).length;
    $('hReview').textContent = rv.length;
    $('hWeak').textContent = weak;
    $('hReviewBtn').disabled = !rv.length;
    $('hReviewBtn').textContent = rv.length ? 'にがてを ふくしゅう する（' + Math.min(rv.length, 10) + 'もん）' : 'ふくしゅうする かんじは ありません';
    var html = '';
    for (var g = 1; g <= 6; g++) {
      if (!hasGrade(g)) {
        html += '<div class="level soon"><span>' + g + 'ねん</span><span class="bar"></span><span class="n">じゅんびちゅう</span></div>';
        continue;
      }
      var chars = gradeChars(g), c = statusCounts(chars), t = chars.length;
      html += '<div class="level"><span>' + g + 'ねん</span><span class="bar" role="img" aria-label="' + g + 'ねん おぼえた ' + c.mastered + '字 / ' + t + '字">' +
        '<i class="m" style="width:' + (100 * c.mastered / t) + '%"></i><i class="c" style="width:' + (100 * c.candidate / t) + '%"></i><i class="w" style="width:' + (100 * c.weak / t) + '%"></i>' +
        '</span><span class="n">' + c.mastered + ' / ' + t + '字</span></div>';
    }
    $('hLevels').innerHTML = html;
  }
  $('hReviewBtn').onclick = function () { var l = reviewList(); if (l.length) startTest('review', 0, l.slice(0, 10)); };

  // ---------- 学年えらび ----------
  var pickGrade = 1, pickN = 10;
  function renderGrade() {
    var html = '';
    for (var g = 1; g <= 6; g++) {
      var ok = hasGrade(g);
      var sample = ok ? gradeChars(g).slice(0, 4).join('') : '';
      var c = ok ? statusCounts(gradeChars(g)) : null;
      html += '<button class="grade' + (ok && g === pickGrade ? ' on' : '') + '" data-g="' + g + '"' + (ok ? '' : ' disabled') + '>' +
        '<b>' + GRADE_NAME[g] + '</b>' +
        (ok ? '<span class="sample">' + esc(sample) + '…</span><small>' + GRADE_TOTAL[g] + '字 ・ おぼえた ' + c.mastered + '字</small>'
            : '<small>' + GRADE_TOTAL[g] + '字 ・ じゅんびちゅう</small>') + '</button>';
    }
    $('gList').innerHTML = html;
    Array.prototype.forEach.call($('gList').querySelectorAll('.grade'), function (b) {
      b.onclick = function () { pickGrade = +b.dataset.g; renderGrade(); };
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
    // まだ出ていない字 → にがて → 再確認 → おぼえかけ → おぼえた の順に
    var order = { new: 0, weak: 1, due: 2, candidate: 3, mastered: 4 }, now = Date.now();
    var chars = shuffle(gradeChars(g).slice());
    chars.sort(function (a, b) {
      var ra = Store.get(a), rb = Store.get(b);
      var ka = !ra ? 'new' : isDue(ra, now) ? 'due' : ra.status, kb = !rb ? 'new' : isDue(rb, now) ? 'due' : rb.status;
      return order[ka] - order[kb];
    });
    return chars.slice(0, n);
  }
  function startTest(mode, grade, chars) {
    if (!chars) chars = chooseForGrade(grade, pickN);
    session = { id: 's' + Date.now(), at: Date.now(), mode: mode, grade: grade, idx: 0,
      items: chars.map(function (ch) { return { ch: ch, q: pickQuestion(ch), result: null, tries: 0 }; }) };
    if (!pad) pad = new window.PopKanjiPad($('tPad'), { onChange: function (n) { $('tPadHint').hidden = n > 0; updateAnswerBtn(); } });
    go('test');
    showItem();
  }
  function cur() { return session.items[session.idx]; }
  function updateAnswerBtn() {
    if (!pad || !session) return;
    var n = pad.strokes().length;
    $('tAnswer').disabled = !ready || !n || answered;
    $('tAnswer').textContent = ready ? 'こたえる' : 'じゅんびちゅう…';
    $('tUndo').disabled = !n || answered; $('tClear').disabled = !n || answered;
  }
  var answered = false, pending = null;
  function showItem() {
    var it = cur(), n = session.items.length, k = KANJI[it.ch];
    answered = false; pending = null;
    $('tNum').textContent = (session.idx + 1) + ' / ' + n;
    $('tProg').style.width = (100 * session.idx / n) + '%';
    $('tLabel').textContent = session.mode === 'review' ? 'ふくしゅう：しかくに はいる かんじを かこう' : GRADE_NAME[k.grade] + '：しかくに はいる かんじを かこう';
    $('tQ').innerHTML = renderQ(it.q, 'test');
    $('tQ').dataset.qid = it.q.id;
    $('tHint').hidden = true;
    $('tFb').hidden = true; $('tFb').innerHTML = '';
    $('tControls').hidden = false; $('tNextRow').hidden = true; $('tSkip').hidden = false;
    pad.lock(false); pad.clear();
    updateAnswerBtn();
  }
  function infoDl(ch) {
    var k = KANJI[ch];
    var yomi = [].concat(k.on, k.kun).filter(Boolean).join('・') || '—';
    return '<dl><dt>よみ</dt><dd>' + esc(yomi) + '</dd><dt>いみ</dt><dd>' + esc(k.meaning) + '</dd>' +
      (k.words && k.words.length ? '<dt>ことば</dt><dd class="kj">' + esc(k.words.slice(0, 4).join('　')) + '</dd>' : '') + '</dl>';
  }
  function feedback(kind, verdict, detail, withInfo, misjudge) {
    var it = cur();
    var showAns = kind !== 'retry';   // 書き直しのときは答えを見せない
    var html = '<div class="fb ' + kind + '" role="status"><div class="head">' + (showAns ? '<span class="ans">' + esc(it.ch) + '</span>' : '') + '<div><div class="verdict">' + verdict + '</div>' +
      (detail ? '<div>' + detail + '</div>' : '') + '</div></div>' + (withInfo ? infoDl(it.ch) : '') +
      (misjudge ? '<button class="misjudge" id="tMis">ただしく かいたのに まちがいに なった</button>' : '') + '</div>';
    $('tFb').innerHTML = html; $('tFb').hidden = false;
    if (misjudge) $('tMis').onclick = function () {
      pending = 'recog';
      $('tFb').firstChild.className = 'fb recog';
      $('tFb').querySelector('.verdict').textContent = 'まちがいに しませんでした';
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
    $('tNext').focus();
    updateAnswerBtn();
  }
  $('tUndo').onclick = function () { pad.undo(); };
  $('tClear').onclick = function () { pad.clear(); };
  $('tAnswer').onclick = function () {
    if (!ready || answered || !pad.strokes().length) return;
    var it = cur();
    var cands = R.recognize(pad.strokes(), { width: pad.size(), height: pad.size() }, 10);
    var j = R.judge(cands, it.ch);
    it.tries++;
    if (j.result === 'correct') {
      feedback('correct', 'せいかい！', '', true, false);
      finishItem('correct');
    } else if (j.result === 'retry' && it.tries < MAX_RETRY) {
      feedback('retry', 'もういちど ていねいに かいてね', 'うまく よみとれなかったよ（' + it.tries + ' / ' + MAX_RETRY + '）', false, false);
      pad.clear();
      $('tHint').hidden = true;
    } else if (j.result === 'retry') {
      feedback('recog', 'よみとれませんでした', 'まちがいには しません。こたえは この かんじです。', true, false);
      finishItem('recog');
    } else {
      var seen = j.seenAs ? '「<span class="kj">' + esc(j.seenAs) + '</span>」に みえたよ。こたえは この かんじ。' : 'こたえは この かんじ。';
      feedback('wrong', 'ざんねん', seen, true, true);
      finishItem('wrong', j.seenAs);
    }
  };
  $('tSkip').onclick = function () {
    if (answered) return;
    cur().tries++;
    feedback('wrong', 'こたえは この かんじ', 'つぎは かけるように れんしゅう しよう。', true, false);
    finishItem('wrong', null);
  };
  $('tNext').onclick = function () {
    var it = cur();
    it.result = pending;
    applyResult(it.ch, it.q.id, pending);
    if (session.idx + 1 < session.items.length) { session.idx++; showItem(); }
    else endTest();
  };
  var quitArmed = false;
  $('tQuit').onclick = function () {
    if (!quitArmed) { quitArmed = true; this.textContent = 'ほんとうに やめる？'; var b = this; setTimeout(function () { quitArmed = false; b.textContent = 'やめる'; }, 3000); return; }
    quitArmed = false; this.textContent = 'やめる';
    var done = session.items.filter(function (x) { return x.result; });
    if (done.length) saveSession(done);
    session = null; go('home');
  };
  function saveSession(items) {
    Store.addSession({ id: session.id, at: session.at, mode: session.mode, grade: session.grade,
      items: items.map(function (x) {
        var o = { ch: x.ch, q: x.q.id, result: x.result, tries: x.tries, seenAs: x.seenAs };
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
  var PILL = { correct: 'せいかい', wrong: 'まちがい', recog: 'よみとれず' };
  function renderResult() {
    var items = lastResult.items;
    var ok = items.filter(function (x) { return x.result === 'correct'; }).length;
    var wrong = items.filter(function (x) { return x.result === 'wrong'; });
    var recog = items.filter(function (x) { return x.result === 'recog'; }).length;
    $('rScore').textContent = ok;
    $('rOf').textContent = '/ ' + items.length + ' もん せいかい';
    $('rNote').textContent = (wrong.length ? 'まちがえた ' + wrong.length + '字は にがてリストに はいりました。' : 'まちがいは ありませんでした。') +
      (recog ? ' よみとれなかった ' + recog + '字は まちがいに していません。' : '');
    $('rList').innerHTML = items.map(function (x) {
      return '<div class="ritem"><span class="k">' + esc(x.ch) + '</span><span class="q">' + renderQ(x.q, x.result === 'correct' ? 'answer' : 'wrong') +
        '</span><span class="pill ' + x.result + '">' + PILL[x.result] + '</span></div>';
    }).join('');
    $('rPrint').disabled = !wrong.length;
    $('rPrint').textContent = wrong.length ? 'まちがえた かんじの プリント（' + wrong.length + '字）' : 'まちがえた かんじは ありません';
  }
  $('rPrint').onclick = function () {
    printChars = uniq(lastResult.items.filter(function (x) { return x.result === 'wrong'; }).map(function (x) { return x.ch; }));
    printFrom = 'result'; go('print');
  };
  $('rAgain').onclick = function () {
    if (lastResult.mode === 'grade') startTest('grade', lastResult.grade);
    else { var l = reviewList(); if (l.length) startTest('review', 0, l.slice(0, 10)); else go('home'); }
  };
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  // ---------- 苦手リスト ----------
  var weakGrade = 1, selected = null;
  var GROUPS = [
    ['weak', 'にがて', 'wrong'], ['due', 'もういちど かくにん', 'recog'], ['candidate', 'おぼえかけ', ''], ['mastered', 'おぼえた', 'correct'], ['new', 'まだ テストして いない', '']
  ];
  function kindOf(ch, now) { var r = Store.get(ch); if (!r || r.status === 'new') return 'new'; if (isDue(r, now)) return 'due'; return r.status; }
  function renderWeak() {
    var now = Date.now();
    if (!selected) {
      selected = {};
      Object.keys(Store.all()).forEach(function (ch) { var k = kindOf(ch, now); if (k === 'weak' || k === 'due') selected[ch] = true; });
    }
    var tabs = '';
    for (var g = 1; g <= 6; g++) {
      if (!hasGrade(g)) continue;
      var c = statusCounts(gradeChars(g));
      tabs += '<button class="tab" role="tab" data-g="' + g + '" aria-selected="' + (g === weakGrade) + '">' + g + 'ねん（にがて ' + c.weak + '）</button>';
    }
    $('wTabs').innerHTML = tabs;
    Array.prototype.forEach.call($('wTabs').querySelectorAll('.tab'), function (b) { b.onclick = function () { weakGrade = +b.dataset.g; renderWeak(); }; });
    var chars = gradeChars(weakGrade), html = '';
    GROUPS.forEach(function (gr) {
      var list = chars.filter(function (ch) { return kindOf(ch, now) === gr[0]; });
      html += '<div class="group"><h3>' + gr[1] + ' <span class="pill ' + gr[2] + '">' + list.length + '字</span></h3>';
      if (!list.length) html += '<div class="empty">ありません</div>';
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
    $('wSel').textContent = n + '字 えらんで います';
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
  function sheetQ(q, answer) {
    return q.tokens.map(function (t) {
      if (t.t !== undefined) return esc(t.t);
      if (t.k !== undefined) return '<ruby>' + esc(t.k) + '<rt>' + esc(t.r) + '</rt></ruby>';
      return '<ruby><span class="box' + (answer ? ' ans' : '') + '">' + (answer ? esc(t.b) : '') + '</span><rt>' + esc(t.r) + '</rt></ruby>';
    }).join('');
  }
  function renderPrint() {
    var per = +$('pPer').value, trace = $('pTrace').checked, withAns = $('pAnswer').checked;
    var rows = [];
    printChars.forEach(function (ch) { questionsForPrint(ch, per).forEach(function (q) { rows.push({ ch: ch, q: q }); }); });
    var pages = [];
    for (var i = 0; i < rows.length; i += ROWS) pages.push(rows.slice(i, i + ROWS));
    var today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    var grades = uniq(printChars.map(function (ch) { return KANJI[ch].grade; })).sort().map(function (g) { return '小' + g; }).join('・');
    var total = pages.length * (withAns ? 2 : 1), pageNo = 0;
    function sheet(rowsOnPage, startNo, answer) {
      pageNo++;
      return '<div class="sheet-wrap"><div class="sheet">' +
        '<div class="sh-head"><div><h2>' + (answer ? 'こたえ' : 'かんじ れんしゅうプリント') + '</h2><p>' +
        (answer ? 'あかい 字が こたえです。' : 'しかくに はいる かんじを かいて、マスで れんしゅう しよう。') + '</p></div>' +
        '<div class="sh-meta"><span>ひづけ　' + esc(today) + '</span>' + (answer ? '' : '<span class="name">なまえ</span>') + '</div></div>' +
        rowsOnPage.map(function (row, k) {
          var cells = '';
          for (var c = 0; c < 7; c++) cells += '<span class="sh-cell">' + ((answer || trace) && c === 0 ? esc(row.ch) : '') + '</span>';
          return '<div class="sh-row"><span class="sh-no">' + (startNo + k + 1) + '.</span><span class="sh-q">' + sheetQ(row.q, answer) + '</span><span class="sh-grid">' + cells + '</span></div>';
        }).join('') +
        '<div class="sh-foot"><span>Pop-Kanji ・ ' + esc(grades) + '</span><span>' + pageNo + ' / ' + total + '</span></div></div></div>';
    }
    var html = '';
    pages.forEach(function (p, i) { html += sheet(p, i * ROWS, false); });
    if (withAns) pages.forEach(function (p, i) { html += sheet(p, i * ROWS, true); });
    $('pSheets').innerHTML = html;
    $('pNote').textContent = printChars.length + '字・' + rows.length + 'もん（A4 ' + total + 'まい）。いんさつの せっていで「余白なし」または「既定」、倍率100%を えらんでください。';
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
      a.download = 'pop-kanji-' + new Date().toISOString().slice(0, 10) + '.json';
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
      try { data = JSON.parse(rd.result); } catch (e) { $('dMsg').textContent = 'ファイルを読めませんでした。Pop-Kanji で書き出したファイルを選んでください。'; return; }
      Store.importData(data).then(function () { selected = null; $('dMsg').textContent = '読み込みました。'; renderData(); },
        function (e) { $('dMsg').textContent = e.message + '。Pop-Kanji で書き出したファイルを選んでください。'; });
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
    for (var g = 1; g <= 6; g++) (hasGrade(g) ? ok : soon).push(g + '年');
    $('aRange').textContent = '問題があるのは ' + ok.join('・') + '（' + ok.map(function (x) { return GRADE_TOTAL[parseInt(x, 10)] + '字'; }).join('・') + '）です。' +
      (soon.length ? soon.join('・') + ' は準備中です。' : '') + ' 手書きの読み取りは小1〜小6の1026字に対応しています。';
  }

  // ---------- はじめ ----------
  Store.init().then(function () {
    window.addEventListener('hashchange', route);
    route();
  });
})();
