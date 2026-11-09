# ボタン

## いつ使うか
- 操作を実行するとき（送信、保存、開く）。ページ移動はリンク `<a>` を使う

## バリエーション
| 種類 | クラス | 用途 |
| --- | --- | --- |
| Primary | `.btn .btn-primary` | 画面で一番やってほしい操作。1 画面に 1 つが目安 |
| Secondary | `.btn .btn-secondary` | 補助的な操作（キャンセル、戻る） |
| Ghost | `.btn .btn-ghost` | ツールバーなど目立たせたくない操作 |
| Danger | `.btn .btn-danger` | 削除など取り消せない操作 |

サイズ: 標準 40px、小 32px（`.btn-sm`）。タッチ前提の画面では 44px 以上を推奨。

## 状態
default / hover / focus-visible / active / disabled / loading（`aria-busy="true"` を付け、二重送信を防ぐ）

## アクセシビリティ
- `<button type="button">` を使う（`<div onclick>` にしない）。フォーム送信は `type="submit"`
- アイコンだけのボタンは `aria-label` を付ける
- ラベルは動詞で具体的に（「OK」より「保存する」）

## HTML 見本
```html
<button type="button" class="btn btn-primary">保存する</button>
<button type="button" class="btn btn-secondary">キャンセル</button>
<button type="button" class="btn btn-danger">削除する</button>
<button type="button" class="btn btn-ghost" aria-label="閉じる">✕</button>
<button type="submit" class="btn btn-primary" disabled>送信中…</button>
```

## トークン
`--color-primary` `--color-primary-hover` `--color-on-primary` `--radius-md` `--space-4` `--font-weight-medium`
