#!/bin/sh
# 静的ホスティング用の書き出し
#   docs/  : GitHub Pages 用（index.html = 学習アプリ、verify.html = 読み取り検証ページ）
#   build/ : ローカル確認用（docs と同じ内容）
set -e
cd "$(dirname "$0")"
# 問題データを1つの JS にまとめる
python3 - <<'PY'
import json, glob, os
out = {}
for f in sorted(glob.glob('data/questions/g*.json')):
    d = json.load(open(f)); out[str(d['grade'])] = d
g = json.load(open('data/grade-kanji.json'))['grades']
g.update(json.load(open('data/kanken-levels.json'))['kanji'])
open('js/grades.js', 'w').write('// 1〜6: 学年別漢字配当表（文部科学省、2020年度施行）、7〜10: 中学の字を漢検4級・3級・準2級・2級に分けたもの。build.sh が作成\nwindow.POPKANJI_GRADES = ' + json.dumps(g, ensure_ascii=False) + ';\n')
open('js/questions.js', 'w').write('// 問題データ（data/questions/*.json から build.sh が作成）\n// 熟語: JMdict (EDRDG, CC BY-SA 4.0) の共通語から選定 / 文: Pop-Kanji で作成\nwindow.POPKANJI_QUESTIONS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
PY
# バージョン（日時）。js の URL に ?v= を付け、更新したとき古いファイルがキャッシュから使われないようにする
VER=$(TZ=Asia/Tokyo date +%Y.%m.%d-%H%M)
page() { # $1 = 元ファイル, $2 = 出力
  {
    printf '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    sed -n '1,/<\/style>/p' "$1"
    printf '</head>\n<body>\n'
    sed -n '/<\/style>/,$p' "$1" | tail -n +2
    printf '</body>\n</html>\n'
  } | sed -E "s#(<script src=\"[^\"?]+\.js)\"#\1?v=$VER\"#; s#__APP_VERSION__#$VER#g" > "$2"
}
for out in build docs; do
  rm -rf "$out" && mkdir -p "$out/vendor"
  page app.html "$out/index.html"
  page index.html "$out/verify.html"
  cp -r js icons "$out/"
  cp -r vendor/kanjicanvas vendor/kanjivg-refs "$out/vendor/"
  # 手本の小数を1けたに丸めて 6.7MB → 2.2MB にする（認識の結果は変わらない: tools/minify_check.js）
  python3 tools/minify_refs.py vendor/kanjicanvas/ref-patterns.js "$out/vendor/kanjicanvas/ref-patterns.js"
  touch "$out/.nojekyll"
  # Google Search Console の確認用ファイル（リポジトリ直下に置いたもの）も公開する
  for f in google*.html; do [ -f "$f" ] && cp "$f" "$out/"; done
done
