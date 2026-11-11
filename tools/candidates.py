#!/usr/bin/env python3
"""問題を書くための下調べ: 学年の各字について、読み（参考）と、
その学年までに習う字だけでできた JMdict 共通語の熟語候補を表示する。
usage: python3 tools/candidates.py <学年> <jmdict-eng-common.json> <kanji-meta.json> [字...]"""
import json, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
g = sys.argv[1]; jm = json.load(open(sys.argv[2])); meta = json.load(open(sys.argv[3]))
G = json.load(open(os.path.join(ROOT, 'data/grade-kanji.json')))['grades']
known = set(''.join(G[str(x)] for x in range(1, int(g) + 1)))
only = sys.argv[4:] and set(''.join(sys.argv[4:]))
bad = {'arch','obs','rare','vulg','X','sens','derog','uk','surname','place','given','person'}
cand = {c: [] for c in G[g]}
for w in jm['words']:
    misc = set(t for s in w['sense'] for t in s['misc'])
    if misc & bad: continue
    for k in w['kanji']:
        t = k['text']
        if not k['common'] or set(k['tags']) & {'gikun','ateji','rK','iK','oK','sK','io'}: continue
        if not (2 <= len(t) <= 3) or not all(c in known for c in t) or len(set(t)) < len(t): continue
        rs = [r['text'] for r in w['kana'] if r['common'] and (r['appliesToKanji'] == ['*'] or t in r['appliesToKanji'])]
        if rs:
            for c in set(t):
                if c in cand: cand[c].append((len(t), t, rs[0]))
for c in G[g]:
    if only and c not in only: continue
    m = meta.get(c, {})
    ws = sorted(set(cand[c]))[:12]
    print(f"{c} | 音:{'・'.join(m.get('on_readings', []))} 訓:{'・'.join(m.get('kun_readings', []))} | " + ' '.join(f'{t}({r})' for _, t, r in ws))
