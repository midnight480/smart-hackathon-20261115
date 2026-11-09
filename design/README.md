# design — UI の参考資料

UI を作るときにすぐ参照できるよう、デザインの決めごとと部品の見本をまとめています。

| ファイル | 中身 |
| --- | --- |
| [DESIGN.md](./DESIGN.md) | デザインシステム定義。Google Stitch の [DESIGN.md 形式](https://stitch.withgoogle.com/docs/design-md/specification)（YAML のトークン＋説明文） |
| [tokens.css](./tokens.css) | DESIGN.md のトークンを CSS 変数にしたもの。ダークモード込み |
| [components.css](./components.css) | 部品の最小スタイル（tokens.css の後に読み込む） |
| [components/](./components/) | 部品ごとの仕様（いつ使うか、状態、アクセシビリティ、HTML の見本） |
| [gallery/index.html](./gallery/index.html) | 全部品をブラウザで一覧できるページ |

## 使い方

- **人が見るとき:** `open design/gallery/index.html` でブラウザ表示。ライト／ダーク切替ボタンあり
- **AI に作らせるとき:** 「`design/DESIGN.md` と `design/components/button.md` に従ってボタンを作って」のように指示する。AGENTS.md にも同じルールを書いてある
- **Stitch を使うとき:** `DESIGN.md` をそのまま Stitch に読み込ませれば同じトークンでデザイン案を作れる。逆に Stitch から出力した DESIGN.md で置き換えてもよい（その場合 `tokens.css` も更新）

## 部品一覧

| 部品 | ファイル |
| --- | --- |
| ボタン | [button.md](./components/button.md) |
| テキスト入力 | [text-input.md](./components/text-input.md) |
| セレクト | [select.md](./components/select.md) |
| チェックボックス | [checkbox.md](./components/checkbox.md) |
| ラジオボタン | [radio.md](./components/radio.md) |
| トグルスイッチ | [toggle.md](./components/toggle.md) |
| カード | [card.md](./components/card.md) |
| タブ | [tabs.md](./components/tabs.md) |
| モーダル（ダイアログ） | [modal.md](./components/modal.md) |
| アラート / トースト | [alert-toast.md](./components/alert-toast.md) |

新しい部品を足すときは [`components/_template.md`](./components/_template.md) をコピーして書き、ギャラリーにも追加します。

## 外部の参考資料

- Google DESIGN.md 仕様: https://stitch.withgoogle.com/docs/design-md/specification
- Material Design 3（部品の振る舞いの参考）: https://m3.material.io/components
- WAI-ARIA Authoring Practices（キーボード操作・ARIA の正解集）: https://www.w3.org/WAI/ARIA/apg/patterns/
- デジタル庁デザインシステム（日本語 UI の参考）: https://design.digital.go.jp/
- shadcn/ui（React で部品を使うなら）: https://ui.shadcn.com/
