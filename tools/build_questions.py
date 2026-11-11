#!/usr/bin/env python3
"""問題データの作成と検査
usage: python3 tools/build_questions.py <学年> <jmdict-eng-common.json> <kanji-meta.json>
  data/src/g<学年>.txt を読み、検査して data/questions/g<学年>.json を書き出す。
検査:
  1. その学年の配当漢字がすべて・重複なくあるか
  2. 各問題の空欄が1つで、その字が出題する字か
  3. 見せる漢字が、その学年までに習う字だけか（ふりがな付き）／漢字がふりがななしで混じっていないか
  4. 熟語の問題が JMdict の共通語に、その読みで載っているか
  5. 同じ読みで別の字が入ってしまわないか（熟語: JMdict で確認／文: 同じ訓読みの字を一覧にして目で確認）
"""
import json, re, sys, os, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
grade = sys.argv[1]
jm = json.load(open(sys.argv[2]))
meta = json.load(open(sys.argv[3]))
G = json.load(open(os.path.join(ROOT, 'data/grade-kanji.json')))['grades']
G.update(json.load(open(os.path.join(ROOT, 'data/kanken-levels.json')))['kanji'])   # 7〜10 = 漢検4級・3級・準2級・2級（中学の字）
known = set(''.join(G[str(g)] for g in range(1, int(grade) + 1)))
# 漢検（中学の字）では、見せる字は常用漢字ならよい（小学校の字いがいは ふりがなを出す）
if int(grade) >= 7:
    known = set(c for c in open(os.path.join(ROOT, 'data/joyo-kanji.txt')).read() if ord(c) > 0x3000) | {'々'}
    for g in range(11, int(grade) + 1): known |= set(G[str(g)])   # 準1級・1級は その級までの常用外の字も見せてよい
target_set = list(G[grade])
L = {'7': '漢検4級', '8': '漢検3級', '9': '漢検準2級', '10': '漢検2級', '11': '漢検準1級', '12': '漢検1級'}.get(grade, f'小{grade}')

# JMdict: 表記 → 読みの集合
words = collections.defaultdict(set)        # 表記 → 読み（すべての表記）
common = collections.defaultdict(set)       # 表記 → 読み（よく使われる表記だけ。別の字が入る検査に使う）
for w in jm['words']:
    for k in w['kanji']:
        for r in w['kana']:
            if r['appliesToKanji'] == ['*'] or k['text'] in r['appliesToKanji']:
                words[k['text']].add(r['text'])
                if k['common'] and r['common']: common[k['text']].add(r['text'])

def kun_of(c):
    out = set()
    for r in meta.get(c, {}).get('kun_readings', []):
        r = r.strip('-').split('.')[0]
        out.add(r)
    return out

HIRA = re.compile(r'^[ぁ-ゖー]+$')
TOK = re.compile(r'\{([^:{}]+):([^{}]*)\}|\[([^:\[\]]+):([^\[\]]*)\]|([^{}\[\]]+)')
errors, warns = [], []
out_kanji, out_q, seen = {}, [], set()
for ln, line in enumerate(open(os.path.join(ROOT, f'data/src/g{grade}.txt')), 1):
    line = line.rstrip('\n')
    if not line.strip() or line.startswith('#'):
        continue
    parts = [p.strip() for p in line.split('|')]
    if len(parts) != 5:
        errors.append(f'{ln}行: 区切りが5つでない'); continue
    ch, on, kun, mean, qs = parts
    if ch in seen: errors.append(f'{ln}行: {ch} が重複')
    seen.add(ch)
    if ch not in target_set: errors.append(f'{ln}行: {ch} は{L}の字でない')
    qlist = [q.strip() for q in qs.split(';') if q.strip()]
    # 末尾の ※ は「同じ読みの別の熟語もあるが、文の意味で答えが決まることを目で確認した」しるし
    if len(qlist) < 3: warns.append(f'{ch}: 問題が{len(qlist)}問')
    words_of_ch = []
    for qi, q in enumerate(qlist):
        reviewed = q.endswith('※')
        q = q.rstrip('※').strip()
        toks, blanks = [], 0
        for m in TOK.finditer(q):
            if m.group(1) is not None:
                c, r = m.group(1), m.group(2)
                blanks += 1
                if c != ch: errors.append(f'{ch}: 「{q}」の空欄の字が {c}')
                if not HIRA.match(r): errors.append(f'{ch}: 「{q}」の空欄の読み「{r}」がひらがなでない')
                toks.append({'b': c, 'r': r})
            elif m.group(3) is not None:
                c, r = m.group(3), m.group(4)
                if any(x not in known for x in c): errors.append(f'{ch}: 「{q}」の [{c}] に{L}までに習わない字がある')
                if not HIRA.match(r or ''): errors.append(f'{ch}: 「{q}」の [{c}] の読み「{r}」がひらがなでない')
                toks.append({'k': c, 'r': r})
            else:
                t = m.group(5)
                if re.search(r'[一-鿿]', t): errors.append(f'{ch}: 「{q}」にふりがなのない漢字「{t}」')
                toks.append({'t': t})
        if blanks != 1: errors.append(f'{ch}: 「{q}」の空欄が{blanks}個')
        # 空欄を含む漢字の並び（文の中の熟語）を取り出す
        bi = next((i for i, t in enumerate(toks) if 'b' in t), 0)
        lo = bi
        while lo > 0 and 't' not in toks[lo - 1]: lo -= 1
        hi = bi
        while hi + 1 < len(toks) and 't' not in toks[hi + 1]: hi += 1
        run = toks[lo:hi + 1]
        is_word = len(run) >= 2
        surface = ''.join(t.get('b') or t.get('k') for t in run)
        reading = ''.join(t['r'] for t in run)
        sentence = ''.join(t.get('b') or t.get('k') or t.get('t') for t in toks)
        if is_word:
            if reading not in words.get(surface, set()):
                warns.append(f'{ch}: 文「{sentence}」の熟語「{surface}（{reading}）」が JMdict にない')
            else:
                words_of_ch.append(f'{surface}（{reading}）')
            for c2 in known:
                if c2 == ch: continue
                alt = surface.replace(ch, c2, 1)
                if reading in common.get(alt, set()):
                    if reviewed: warns.append(f'{ch}: 「{surface}」の空欄に {c2} で「{alt}」— 文の意味で決まる（確認済み）')
                    else: errors.append(f'{ch}: 「{surface}（{reading}）」の空欄に {c2} を入れても「{alt}」になる（文: {sentence}）')
        else:
            br = toks[bi]['r']
            same = sorted(c2 for c2 in known if c2 != ch and br in kun_of(c2))
            if same:
                warns.append(f'{ch}: 文「{sentence}」の読み「{br}」は {"".join(same)} にもある（文脈で決まるか確認）')
        out_q.append({'id': f'g{grade}-{ch}-{qi+1}', 'kanji': ch, 'type': 'word' if is_word else 'sentence', 'tokens': toks})
    mtoks = []
    for m in TOK.finditer(mean):
        if m.group(3) is not None:
            c, r = m.group(3), m.group(4)
            if any(x not in known for x in c): errors.append(f'{ch}: 意味の [{c}] に{L}までに習わない字がある')
            if not HIRA.match(r or ''): errors.append(f'{ch}: 意味の [{c}] の読み「{r}」がひらがなでない')
            mtoks.append({'k': c, 'r': r})
        elif m.group(1) is not None:
            errors.append(f'{ch}: 意味に空欄 {{}} は使えない')
        else:
            if re.search(r'[\u4e00-\u9fff]', m.group(5)): errors.append(f'{ch}: 意味にふりがなのない漢字「{m.group(5)}」')
            mtoks.append({'t': m.group(5)})
    plain_mean = ''.join(t.get('k') or t.get('t') for t in mtoks)
    out_kanji[ch] = {'grade': int(grade), 'on': [] if on == '—' else on.split('・'), 'kun': [] if kun == '—' else kun.split('・'),
                     'meaning': plain_mean, 'meaningTokens': mtoks, 'words': list(dict.fromkeys(words_of_ch))}
missing = [c for c in target_set if c not in seen]
# --partial: 字が多い級（準1級・1級）は、できた字から順に公開する
if missing and '--partial' in sys.argv: warns.append(f'まだ問題のない字: {len(missing)}字')
elif missing: errors.append('配当漢字の抜け: ' + ''.join(missing))
print(f'{L}: {len(out_kanji)}字 / {len(out_q)}問（熟語を含む文 {sum(q["type"]=="word" for q in out_q)}・そのほかの文 {sum(q["type"]=="sentence" for q in out_q)}）')
nontext = [q['id'] for q in out_q if all('t' not in t for t in q['tokens'])]
if nontext: errors.append('文になっていない問題: ' + ' '.join(nontext))
for w in warns: print('確認:', w)
for e in errors: print('エラー:', e)
if errors: sys.exit(1)
json.dump({'grade': int(grade), 'count': len(out_kanji),
           'sources': {'words': 'JMdict (EDRDG, CC BY-SA 4.0) の共通語から選定', 'sentences': 'Pop-Kanji で作成'},
           'kanji': out_kanji, 'questions': out_q},
          open(os.path.join(ROOT, f'data/questions/g{grade}.json'), 'w'), ensure_ascii=False, indent=0)
print('書き出し: data/questions/g%s.json' % grade)
