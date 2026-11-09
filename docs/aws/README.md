# AWS

最終確認日: 2026-11-09 ／ 公式: https://docs.aws.amazon.com/

## ハッカソンでよく使うサービス

| 用途 | サービス | メモ |
| --- | --- | --- |
| フロントのホスティング | Amplify Hosting | Git 連携で自動デプロイ。Next.js の SSR にも対応 |
| フルスタック | Amplify Gen 2 | TypeScript で認証・データ・関数を定義できる |
| 静的サイト | S3 + CloudFront | 手堅いが設定が多い。急ぐなら Amplify |
| サーバー処理 | Lambda (+ API Gateway / Function URL) | Function URL なら API Gateway なしで HTTP 公開できる |
| DB | DynamoDB | サーバーレスの KVS。オンデマンド課金 |
| 認証 | Cognito | Amplify から使うと楽 |
| ファイル保存 | S3 | 署名付き URL でアップロード |
| 生成 AI | Amazon Bedrock | Claude などを利用可能。リージョンごとにモデルの有効化が必要 |
| IaC | CDK / SAM | 作り直しが多いハッカソンでも IaC にしておくと後片付けが楽 |

## 事前準備

```bash
# AWS CLI v2 をインストール後
aws configure sso          # SSO を使う場合（推奨）
aws sts get-caller-identity  # 認証確認
```

- ルートユーザーで作業しない。IAM Identity Center（SSO）か IAM ユーザーを使う
- **最初に Budgets で予算アラートを設定する**（例: 月 $20 でメール通知）

## クイックスタート: Amplify Hosting

1. コンソールで Amplify → 「新しいアプリを作成」→ GitHub リポジトリを選択
2. ビルド設定（`amplify.yml`）は自動検出される。必要なら修正
3. 環境変数はコンソールの「環境変数」で設定

## クイックスタート: Lambda（SAM）

```bash
sam init --runtime nodejs22.x --name my-api
cd my-api
sam build
sam local start-api      # ローカル実行
sam deploy --guided      # 初回デプロイ
```

## Bedrock の呼び出し例（Node.js）

```ts
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({ region: "us-east-1" });
const res = await client.send(new ConverseCommand({
  modelId: "<コンソールで確認したモデル ID / 推論プロファイル ID>",
  messages: [{ role: "user", content: [{ text: "こんにちは" }] }],
}));
```

## シークレット

- Lambda の環境変数か、Secrets Manager / SSM Parameter Store を使う
- アクセスキーをコードや `.env` に書いてコミットしない（漏れると数分で悪用される）

## ハマりどころ

- リージョンの選び間違い。Bedrock のモデルはリージョンで提供状況が違う
- Bedrock はモデルごとに「アクセスの有効化」が要る場合がある
- 作ったリソースの消し忘れ。終わったら CloudFormation スタックごと削除する
- Lambda のデフォルトタイムアウトは 3 秒。LLM を呼ぶなら延ばす

## 参考リンク

- Amplify: https://docs.amplify.aws/
- Lambda: https://docs.aws.amazon.com/lambda/
- Bedrock: https://docs.aws.amazon.com/bedrock/
- SAM: https://docs.aws.amazon.com/serverless-application-model/
