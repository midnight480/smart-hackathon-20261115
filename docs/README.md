# docs — デプロイ先ナレッジ

ハッカソンで使う可能性があるホスティング／クラウドごとに、すぐ使える手順とハマりどころを置いていく場所です。

| ディレクトリ | 向いている用途 |
| --- | --- |
| [cloudflare/](./cloudflare/README.md) | エッジで動く API、静的サイト＋Workers、KV/D1/R2 を使った軽量バックエンド、Workers AI |
| [netlify/](./netlify/README.md) | 静的サイト・SPA を Git 連携で即公開、フォーム、簡単な Functions |
| [vercel/](./vercel/README.md) | Next.js などのフロント＋バックエンド、AI SDK / AI Gateway を使った AI 機能 |
| [aws/](./aws/README.md) | 本格的なバックエンド、Bedrock、既存 AWS 資産との連携 |

## 迷ったときの選び方

1. **Next.js で AI 機能を作る** → Vercel
2. **API だけ速く安く立てたい / エッジで動かしたい** → Cloudflare Workers
3. **静的サイトをとにかく早く公開したい** → Netlify か Cloudflare（どちらも Git 連携で数分）
4. **主催・スポンサーの指定が AWS、または Bedrock を使いたい** → AWS（Amplify Hosting から始めると早い）

## 書き方のルール

- 1 プラットフォーム 1 ディレクトリ。入口は `README.md`。長くなったらトピックごとにファイルを分ける（例: `cloudflare/d1.md`）
- 各ファイルの先頭に「最終確認日」を書く。サービス仕様は変わるので、古い記載は公式を確認して更新する
- 「やってみて詰まったこと」は `## ハマりどころ` に追記する。これが一番価値がある
