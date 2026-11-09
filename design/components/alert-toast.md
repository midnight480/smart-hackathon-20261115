# アラート / トースト

## 使い分け
| 部品 | 置き場所 | 消え方 | 用途 |
| --- | --- | --- | --- |
| アラート | 本文中 | 消えない（閉じるボタン任意） | フォームのエラー一覧、注意書き |
| トースト | 画面の端に浮く | 数秒で自動で消える | 「保存しました」などの完了通知 |

エラーをトーストだけで伝えない（読む前に消える）。

## 種類
info / success / warning / danger。色だけでなくアイコンと見出しでも区別する。

## アクセシビリティ
- 重要なエラー: `role="alert"`（すぐ読み上げ）
- 完了通知: `role="status"`（区切りのいいところで読み上げ）
- トーストに操作（「元に戻す」）を入れるなら、自動で消えるまでの時間を長めにする（目安 8 秒以上）

## HTML 見本
```html
<div class="alert alert-danger" role="alert">
  <strong>送信できませんでした</strong>
  <p>チーム名を入力してください。</p>
</div>

<div class="toast" role="status">保存しました</div>
```

## トークン
`--color-success` `--color-warning` `--color-danger` `--radius-md` `--elevation-2`
