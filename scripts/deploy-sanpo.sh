#!/bin/sh
# 試作をビルドして Cloudflare にデプロイし、最後に Access が掛かっているかを確かめる。
# wrangler deploy のあと、Worker に掛けた Access が外れていたことがある（2026-11-13）。
# 外れていたら、ダッシュボードで掛け直すまで誰でも見られるので、大きく警告を出す。
set -eu
cd "$(dirname "$0")/.."

URL="https://ebisu-sanpo.midnight480.workers.dev/prototype/sanpo/"

./scripts/build-sanpo.sh > /dev/null
npx wrangler deploy

# 反映を少し待ってから、ログインなしで開けるかを見る
sleep 5
code=$(curl -s -o /dev/null -w '%{http_code}' "$URL")
location=$(curl -s -o /dev/null -w '%{redirect_url}' "$URL")

case "$location" in
  *cloudflareaccess.com*)
    echo "OK: Access が掛かっています（ログインなしは ${code} でログイン画面へ）"
    ;;
  *)
    echo ""
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo "!! Access が外れています（ログインなしで ${code}）。誰でも見られる状態です"
    echo "!! ダッシュボードの Workers & Pages → ebisu-sanpo → Access で掛け直してください"
    echo "!! 手順: docs/cloudflare/README.md の「Cloudflare Access でチームだけに絞る」"
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    exit 1
    ;;
esac
