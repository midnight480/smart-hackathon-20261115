# AGENTS.md

このリポジトリで作業する AI エージェント（Claude Code / Kiro / Cursor / Codex など）向けの共通ルールです。
**エージェント設定の正本はこのファイルです。** `CLAUDE.md`・`.kiro/steering/`・`.cursor/rules/` はここを参照するだけにしてあり、ルールを変えるときはこのファイルを直します。

## プロジェクト概要

- SAGA スマートハッカソン（2026-11-15）用のリポジトリ
- ハッカソンで使うソースコード、デプロイ先ごとのナレッジ、UI 設計の参考資料をまとめて管理する
- ライセンスは MIT（`LICENSE`）

## ディレクトリ構成

```
.
├── AGENTS.md            # エージェント共通ルール（正本）
├── CLAUDE.md            # Claude Code 用。@AGENTS.md を読み込むだけ
├── .kiro/steering/      # Kiro 用 steering。AGENTS.md を参照
├── .cursor/rules/       # Cursor 用 rules。AGENTS.md を参照
├── docs/                # デプロイ先ごとのナレッジ
│   ├── cloudflare/
│   ├── netlify/
│   ├── vercel/
│   └── aws/
└── design/              # UI の参考資料
    ├── DESIGN.md        # デザインシステム定義（Google Stitch の DESIGN.md 形式）
    ├── tokens.css       # DESIGN.md のトークンを CSS 変数にしたもの
    ├── components.css   # 部品の最小スタイル
    ├── components/      # ボタン・ラジオなど部品ごとの仕様とサンプル
    └── gallery/         # 部品をブラウザで一覧できるページ
```

## 作業ルール

### 全般

- 回答・コメント・ドキュメントは日本語で書く。コード中の識別子は英語
- ハッカソンなので「動くものを早く」を優先する。ただし秘密情報の扱いだけは妥協しない
- 新しいディレクトリやツールを足したら、このファイルの「ディレクトリ構成」を更新する

### 秘密情報

- API キー、トークン、`.env*` はコミットしない（`.env.example` だけコミットする）
- 各プラットフォームのシークレットは CLI か管理画面の環境変数機能で設定する（手順は `docs/<platform>/README.md`）

### デプロイ・インフラ

- デプロイ先に関わる作業の前に、該当する `docs/<platform>/README.md` を読む
- ドキュメントの内容は変わりやすい。記載と公式ドキュメントが食い違ったら公式を優先し、`docs/` 側を直す
- 新しく分かったハマりどころは `docs/<platform>/` に追記する（ナレッジとして残す）

### UI 実装

- UI を作る前に `design/DESIGN.md` を読み、色・余白・角丸・文字サイズはトークンから使う。値を直書きしない
- 部品を作るときは `design/components/<部品名>.md` の仕様（状態・アクセシビリティ）に合わせる
- 該当する部品の資料がなければ、作ったあとに `design/components/` へ追加し、`design/gallery/index.html` にも載せる

### Git

- コミットはユーザーに頼まれたときだけ行う
- コミットメッセージは日本語でよい。1 コミット 1 目的
