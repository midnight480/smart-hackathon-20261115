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

## 参考リンク

- Workers: https://developers.cloudflare.com/workers/
- Wrangler 設定: https://developers.cloudflare.com/workers/wrangler/configuration/
- 料金・制限: https://developers.cloudflare.com/workers/platform/limits/
