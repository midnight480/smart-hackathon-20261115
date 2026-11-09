# Netlify

最終確認日: 2026-11-09 ／ 公式: https://docs.netlify.com/

## 主な機能

| 用途 | 機能 | メモ |
| --- | --- | --- |
| 静的サイト / SPA | Deploys（Git 連携） | push で自動デプロイ、PR ごとに Deploy Preview |
| サーバー処理 | Functions | `netlify/functions/` に置く。Node.js |
| エッジ処理 | Edge Functions | Deno ベース。リダイレクトや軽い加工向き |
| ストレージ | Netlify Blobs | KV 的に使える簡易ストア |
| フォーム | Netlify Forms | HTML に `data-netlify="true"` を付けるだけで送信を受け取れる |

## クイックスタート

```bash
npm i -g netlify-cli
netlify login
netlify init          # Git リポジトリとサイトを紐付け
netlify dev           # ローカル実行（Functions 含む）
netlify deploy        # ドラフト URL にデプロイ
netlify deploy --prod # 本番デプロイ
```

管理画面から GitHub リポジトリを選ぶだけでも公開できる。ハッカソンではこれが一番早い。

## 設定ファイル（netlify.toml）

```toml
[build]
  command = "npm run build"
  publish = "dist"

[functions]
  directory = "netlify/functions"

# SPA のルーティング
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

## Functions の例

```ts
// netlify/functions/hello.ts → /.netlify/functions/hello
export default async (req: Request) => {
  return Response.json({ message: "hello" });
};
```

## 環境変数

```bash
netlify env:set API_KEY xxxx
netlify env:list
```

## ハマりどころ

- SPA で直リンクが 404 になる → 上の `redirects` を入れる
- ビルド時と実行時で環境変数のスコープが分かれている。管理画面の「Scopes」を確認
- Functions には実行時間の上限がある。長い処理はバックグラウンド関数（ファイル名末尾 `-background`）を検討

## 参考リンク

- Functions: https://docs.netlify.com/functions/overview/
- netlify.toml: https://docs.netlify.com/configure-builds/file-based-configuration/
- CLI: https://cli.netlify.com/
