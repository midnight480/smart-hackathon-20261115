#!/bin/sh
# 試作「さがもん！Go！」を Cloudflare Workers（Static Assets）に載せるため、必要なファイルだけを dist/ に集める。
# リポジトリ全体を公開しないよう、置く場所はここで列挙したものに限る。
set -eu
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist/prototype dist/design dist/planning/data

cp -R prototype/sanpo dist/prototype/sanpo
rm -f dist/prototype/sanpo/README.md
cp design/tokens.css design/components.css dist/design/
cp planning/data/ebisu-demo.json dist/planning/data/

# トップ（/）は試作のページへ
printf '/ /prototype/sanpo/ 302\n' > dist/_redirects

echo "dist/ を作りました"
find dist -type f | sort
