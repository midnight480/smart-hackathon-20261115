# Vercel

最終確認日: 2026-11-09 ／ 公式: https://vercel.com/docs

## 主な機能

| 用途 | 機能 | メモ |
| --- | --- | --- |
| フロント＋バックエンド | Vercel Functions（Fluid Compute） | Node.js 24 がデフォルト。Python / Bun / Rust も可。Express・FastAPI・Hono などもそのまま動く |
| AI 機能 | AI SDK（v7）/ AI Gateway | Gateway 経由なら `"anthropic/claude-sonnet-5-5"` のような文字列でモデル指定できる |
| ファイル保存 | Vercel Blob | public / private どちらも可 |
| 設定値 | Global Config（旧 Edge Config） | `@vercel/global-config` |
| DB | Marketplace（Neon Postgres、Upstash Redis など） | Vercel Postgres / KV はもう提供されていない |
| 定期実行 | Cron Jobs | `vercel.ts` の `crons` で設定 |
| コード実行環境 | Vercel Sandbox | AI が生成したコードを隔離して実行 |

## クイックスタート

```bash
npm i -g vercel@latest
vercel login
npx create-next-app@latest my-app --yes
cd my-app
vercel link            # プロジェクトと紐付け
vercel dev             # ローカル実行
vercel                 # Preview デプロイ
vercel --prod          # 本番デプロイ
```

GitHub 連携すれば push で自動デプロイ、PR ごとに Preview URL が出る。

## 設定ファイル（vercel.ts）

`vercel.json` より `vercel.ts` が推奨（`npm i -D @vercel/config`）。

```ts
import { routes, type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  rewrites: [routes.rewrite("/api/(.*)", "https://backend.example.com/$1")],
  crons: [{ path: "/api/cleanup", schedule: "0 0 * * *" }],
};
```

## 環境変数

```bash
vercel env add OPENAI_API_KEY   # 対話で環境（Production/Preview/Development）を選ぶ
vercel env pull .env.local      # ローカルに落とす
```

## AI SDK の最小例

```ts
// app/api/chat/route.ts
import { streamText } from "ai";

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const result = streamText({ model: "anthropic/claude-sonnet-5-5", prompt });
  return result.toTextStreamResponse();
}
```

AI SDK 7 は Node.js 22 以上・ESM 必須。API は `node_modules/ai/docs/` で確認する。

## ハマりどころ

- `export const runtime = 'edge'` は不要（Edge runtime は非推奨）。ストリーミングも Node.js runtime で動く
- 関数のリクエスト／レスポンスボディは 4.5 MB まで。大きいファイルは Blob のクライアントアップロードを使う
- 関数のデフォルトタイムアウトは 300 秒
- Preview デプロイには Deployment Protection がかかることがある。外部から叩くなら設定を確認

## 参考リンク

- Functions: https://vercel.com/docs/functions
- vercel.ts: https://vercel.com/docs/project-configuration/vercel-ts
- AI Gateway: https://vercel.com/docs/ai-gateway
- 制限: https://vercel.com/docs/limits
