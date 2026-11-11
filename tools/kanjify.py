#!/usr/bin/env python3
"""問題文と意味の説明の、ひらがなで書いた言葉を、前の学年までに習った漢字（ふりがな付き）に置きかえる。
usage: python3 tools/kanjify.py <学年> [--write]
  data/src/g<学年>.txt を読み、置きかえた結果を表示する（--write で上書き）。
きまり:
  - 空白で区切ったまとまりが「言葉」か「言葉＋助詞」のときだけ置きかえる（言葉の途中は変えない）
  - 使う漢字は <学年-1> 年までに習う字だけ（小1の問題は変えない）
  - 読みが同じで別の意味がある言葉（はな＝花/鼻、かぜ＝風/風邪、かう＝買う/飼う など）は一覧に入れない
  - 意味の説明では、その字自身の読みと同じ言葉は変えない（皮の意味「かわ」を「川」にしないため）
"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = json.load(open(os.path.join(ROOT, 'data/grade-kanji.json')))['grades']

# ひらがな → 置きかえ（[漢字:よみ] と送りがな）。左の形と完全に一致したときだけ使う
WORDS = '''
ひと=[人:ひと] ひとびと=[人:ひと]びと こども=[子:こ]ども おとな=[大人:おとな] いえ=[家:いえ] みち=[道:みち] まち=[町:まち]
くに=[国:くに] やま=[山:やま] かわ=[川:かわ] うみ=[海:うみ] そら=[空:そら] ゆき=[雪:ゆき] ほん=[本:ほん] がっこう=[学校:がっこう]
ともだち=[友:とも]だち せんせい=[先生:せんせい] ちち=[父:ちち] はは=[母:はは] あに=[兄:あに] あね=[姉:あね] おとうと=[弟:おとうと]
いもうと=[妹:いもうと] いぬ=[犬:いぬ] うし=[牛:うし] うま=[馬:うま] とり=[鳥:とり] さかな=[魚:さかな] むし=[虫:むし] くるま=[車:くるま]
でんしゃ=[電車:でんしゃ] みせ=[店:みせ] おみせ=お[店:みせ] あさ=[朝:あさ] ひる=[昼:ひる] よる=[夜:よる] なつ=[夏:なつ] ふゆ=[冬:ふゆ]
はる=[春:はる] あき=[秋:あき] いま=[今:いま] なまえ=[名前:なまえ] こえ=[声:こえ] おと=[音:おと] いろ=[色:いろ] みず=[水:みず]
てがみ=[手紙:てがみ] うた=[歌:うた] ほし=[星:ほし] つき=[月:つき] ちず=[地図:ちず] こうえん=[公園:こうえん] じかん=[時間:じかん]
まいにち=[毎日:まいにち] いちにち=[一日:いちにち] おかね=お[金:かね] さんすう=[算数:さんすう] こくご=[国語:こくご] きょうしつ=[教室:きょうしつ]
なか=[中:なか] うえ=[上:うえ] した=[下:した] まえ=[前:まえ] うしろ=[後:うし]ろ そと=[外:そと] あいだ=[間:あいだ] みぎ=[右:みぎ] ひだり=[左:ひだり]
からだ=[体:からだ] あたま=[頭:あたま] かお=[顔:かお] くち=[口:くち] あし=[足:あし] こころ=[心:こころ] ちから=[力:ちから]
たかい=[高:たか]い おおきい=[大:おお]きい おおきな=[大:おお]きな ちいさい=[小:ちい]さい ちいさな=[小:ちい]さな ながい=[長:なが]い
あたらしい=[新:あたら]しい ふるい=[古:ふる]い おおい=[多:おお]い すくない=[少:すく]ない ちかい=[近:ちか]い とおい=[遠:とお]い
つよい=[強:つよ]い よわい=[弱:よわ]い あかるい=[明:あか]るい あかい=[赤:あか]い あおい=[青:あお]い しろい=[白:しろ]い くろい=[黒:くろ]い
たのしい=[楽:たの]しい まるい=[丸:まる]い ふとい=[太:ふと]い
いく=[行:い]く いった=[行:い]った いって=[行:い]って いこう=[行:い]こう くる=[来:く]る きて=[来:き]て
みる=[見:み]る みて=[見:み]て みた=[見:み]た よむ=[読:よ]む いう=[言:い]う はなす=[話:はな]す きく=[聞:き]く
たべる=[食:た]べる たべた=[食:た]べた あるく=[歩:ある]く はしる=[走:はし]る うる=[売:う]る おもう=[思:おも]う
かんがえる=[考:かんが]える しる=[知:し]る おしえる=[教:おし]える でる=[出:で]る はいる=[入:はい]る つくる=[作:つく]る
やすむ=[休:やす]む かぞえる=[数:かぞ]える わかる=[分:わ]かる わからない=[分:わ]からない ひく=[引:ひ]く
えき=[駅:えき] あそぶ=[遊:あそ]ぶ あそび=[遊:あそ]び のむ=[飲:の]む しごと=[仕事:しごと] ことば=[言葉:ことば] まつ=[待:ま]つ
つぎ=[次:つぎ] りょこう=[旅行:りょこう] べんきょう=[勉強:べんきょう] しゃしん=[写真:しゃしん] くすり=[薬:くすり] びょういん=[病院:びょういん]
としょかん=[図書館:としょかん] どうぶつ=[動物:どうぶつ] うんどうかい=[運動会:うんどうかい] みんな=みんな しあい=[試合:しあい]
はこ=[箱:はこ] はたけ=[畑:はたけ] にわ=[庭:にわ] ふく=[服:ふく] しま=[島:しま] さか=[坂:さか] はし=[橋:はし] ゆび=[指:ゆび]
やさい=[野菜:やさい] きもち=[気持:きも]ち ひこうき=[飛行機:ひこうき] ぎんこう=[銀行:ぎんこう] じてんしゃ=[自転車:じてんしゃ]
'''
ENTRIES = {}
for item in WORDS.split():
    k, v = item.split('=', 1)
    ENTRIES[k] = v
PARTICLES = ['', 'を', 'が', 'は', 'に', 'へ', 'で', 'と', 'の', 'も', 'や', 'から', 'まで', 'より', 'には', 'では', 'へは', 'とは', 'にも', 'でも', 'の。', 'です', 'でした', 'だ', 'さん', 'ちゃん']

def kanji_of(v):
    return ''.join(re.findall(r'\[([^:\]]+):', v))

def allowed(v, maxg):
    known = set(''.join(G[str(g)] for g in range(1, maxg + 1)))
    return all(c in known for c in kanji_of(v))

def convert_text(text, maxg, skip=()):
    # text は {}・[] を含まない、ふつうの文字列
    out = []
    for part in re.split(r'([ 　]+)', text):
        if not part or part.isspace():
            out.append(part); continue
        rep = None
        for w in sorted(ENTRIES, key=len, reverse=True):
            if w in skip: continue
            if part.startswith(w) and part[len(w):] in PARTICLES and allowed(ENTRIES[w], maxg):
                rep = ENTRIES[w] + part[len(w):]; break
        out.append(rep or part)
    return ''.join(out)

TOK = re.compile(r'(\{[^{}]*\}|\[[^\[\]]*\])')
def convert(field, maxg, skip=()):
    # 空欄や見せる字の部分はそのままにして、あいだの文字列だけ変える
    pieces = TOK.split(field)
    res = []
    for i, p in enumerate(pieces):
        if i % 2 == 1 or not p: res.append(p); continue
        # 字の直後の送りがな・助詞（先頭の空白より前）は変えない
        m = re.match(r'^([^ 　]*)(.*)$', p, re.S)
        head, rest = m.group(1), m.group(2)
        if i > 0 and head: res.append(head + convert_text(rest, maxg, skip))
        else: res.append(convert_text(p, maxg, skip))
    return ''.join(res)

def main():
    grade = int(sys.argv[1]); write = '--write' in sys.argv
    maxg = grade - 1
    if maxg < 1: print('小1は変えません'); return
    path = os.path.join(ROOT, f'data/src/g{grade}.txt')
    lines = open(path).read().split('\n'); out = []; changed = 0
    for ln in lines:
        if not ln.strip() or ln.startswith('#'): out.append(ln); continue
        parts = [x.strip() for x in ln.split('|')]
        kun = set(k.split('・')[0] if False else k for k in parts[2].split('・'))
        kun |= {re.sub(r'(い|る|う|く|す|つ|ぬ|ぶ|む|ぐ)$', '', k) for k in kun}
        parts[3] = convert(parts[3], maxg, skip=kun | {'かわ'})
        parts[4] = ' ; '.join(convert(q.strip(), maxg) for q in parts[4].split(';'))
        new = ' | '.join(parts)
        if new != ln: changed += 1; print(new)
        out.append(new)
    print(f'--- {changed} 行を変更', file=sys.stderr)
    if write: open(path, 'w').write('\n'.join(out))

if __name__ == '__main__':
    main()
