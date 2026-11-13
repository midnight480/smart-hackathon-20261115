# Cloudflare

最終確認日: 2026-11-09 ／ 公式: https://developers.cloudflare.com/

## 主なプロダクト

| 用途 | プロダクト | メモ |
| --- | --- | --- |
| サーバー処理 / API | Workers | V8 isolate で動く。コールドスタートがほぼない |
| 静的サイト / SPA | Workers（Static Assets） | 新規は Pages より Workers + Static Assets が推奨されている |
| KV ストア | Workers KV | 読み取り中心・結果整合。セッションや設定向き |
| SQL DB | D1 | SQLite 互換 |
| オブジェクトストレージ | R2 | S3 互換 API、エグレス料金なし |
| 状態を持つ処理 / リアルタイム | Durable Objects | WebSocket、チャット、排他制御 |
| AI 推論 | Workers AI / AI Gateway | Workers からモデルを呼べる |
| AI エージェント | Agents SDK（`agents` パッケージ） | Durable Objects ベース |

## クイックスタート

```bash
# プロジェクト作成（対話形式。テンプレートを選ぶ）
npm create cloudflare@latest my-app

cd my-app
npx wrangler login     # 初回のみ
npx wrangler dev       # ローカル実行
npx wrangler deploy    # デプロイ（*.workers.dev に公開）
```

## 設定ファイル（wrangler.jsonc）

```jsonc
{
  "name": "my-app",
  "main": "src/index.ts",
  "compatibility_date": "2026-11-01",
  "assets": { "directory": "./public" },
  "kv_namespaces": [{ "binding": "KV", "id": "<id>" }],
  "d1_databases": [{ "binding": "DB", "database_name": "my-db", "database_id": "<id>" }],
  "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "my-bucket" }]
}
```

リソース作成:

```bash
npx wrangler kv namespace create KV
npx wrangler d1 create my-db
npx wrangler r2 bucket create my-bucket
npx wrangler d1 execute my-db --remote --file=./schema.sql
```

## シークレット

```bash
npx wrangler secret put OPENAI_API_KEY   # 本番
# ローカルは .dev.vars に書く（.gitignore 済み）
```

## ハマりどころ

- Workers は Node.js そのものではない。Node API を使うなら `"compatibility_flags": ["nodejs_compat"]` を付ける
- KV は書き込みの反映に最大 60 秒ほどかかることがある。即時整合が必要なら D1 か Durable Objects
- `wrangler dev` はデフォルトでローカルのシミュレーション。本番リソースに繋ぐなら `--remote`
- Next.js を載せるなら OpenNext（`@opennextjs/cloudflare`）か vinext を使う

## このリポジトリでの使い方（試作「えびす時空さんぽ」）

ルートの `wrangler.jsonc` で、`dist/` を Workers の Static Assets として公開する。Worker のコードはない。

**2026-11-13 に一度公開したあと、Worker（`ebisu-sanpo`）は削除した。** 公開し直すときは、デプロイのあとに下の手順で Access を掛け直す。

```bash
./scripts/build-sanpo.sh     # 公開するファイルだけを dist/ に集める
npx wrangler dev             # http://localhost:8787/ で確認
npx wrangler login           # 初回のみ。ブラウザで Cloudflare にログイン
./scripts/deploy-sanpo.sh    # ビルド → デプロイ → Access が掛かっているかの確認まで
```

デプロイは `npx wrangler deploy` を直接打たず、`scripts/deploy-sanpo.sh` を使う（下の「Access が外れる」を参照）。

- `assets.directory` にリポジトリの直下を指定しない。AGENTS.md や企画資料まで公開されてしまう。公開するファイルは `scripts/build-sanpo.sh` で列挙する
- `/` から `/prototype/sanpo/` への転送は `dist/_redirects` に書いている（Static Assets は `_redirects` を読む）
- workers.dev は HTTPS なので、iPhone の向きセンサーの許可を実機で試せる

### Cloudflare Access でチームだけに絞る

wrangler からは設定できないので、ダッシュボードで行う（2026-11-13 に設定。画面は日本語表示）。

1. Workers & Pages → `ebisu-sanpo` → 上のタブの **Access**
2. **この Worker を Access で保護する** を押す
3. スコープは **すべての Traffic**（本番とプレビューの両方）を選ぶ。既定の「プレビューのみ」だと本番の URL は誰でも見られる
4. 認証ポリシーで **Cloudflare アカウント**（このアカウントのメンバーだけ）を選び、**Access を適用**

- チームの人を入れるには、Cloudflare アカウントに招待する（右上の「招待」）か、メールアドレスで許可するポリシーを足す
- ログインしていないアクセスは `https://<チーム名>.cloudflareaccess.com/cdn-cgi/access/login/...` に 302 で飛ばされる。`curl -s -o /dev/null -w '%{http_code}' <URL>` で確かめられる
- 初めて Access を使うアカウントでは、Zero Trust の組織（チーム名）の作成を求められる。50人まで無料
- Version URLs は workers.dev とは別の URL で、Access の設定も別。`wrangler.jsonc` で `"preview_urls": false` にして使わない
- **`wrangler deploy` のあとに Worker の Access が外れていたことがある**（2026-11-13、wrangler 4.161.0。2回目のデプロイ後に Access タブが「保護されていません」に戻り、ログインなしで 200 が返った）。原因は分かっていない。`scripts/deploy-sanpo.sh` はデプロイ後にログインなしで開けるかを確かめ、外れていたら警告して止まる。外れたら同じ手順で掛け直す
- 外れないようにするなら、Worker ではなくホスト名（`ebisu-sanpo.<サブドメイン>.workers.dev`）に Access のアプリを作る方法もある（Zero Trust → Access controls → Applications → Self-hosted）。ホスト名のポリシーは Worker のポリシーより先に効く。まだ試していない
- 初回の `wrangler deploy` から Access を有効にするまでの数分は、URL を知っていれば誰でも見られる（Worker ができてからでないと Access を掛けられない）
- Access は入口で止めるだけ。Worker のコードで `Cf-Access-Jwt-Assertion` を検証すると、より固くなる（静的ファイルだけの今は不要）

## 参考リンク

- Workers: https://developers.cloudflare.com/workers/
- Wrangler 設定: https://developers.cloudflare.com/workers/wrangler/configuration/
- 料金・制限: https://developers.cloudflare.com/workers/platform/limits/
