# テキスト入力

## いつ使うか
- 1 行の自由入力（名前、メール、検索）。複数行は `<textarea>`

## 状態
default / focus / disabled / readonly / error

## アクセシビリティ
- 必ず `<label for>` を付ける。placeholder はラベルの代わりにならない
- 補足は `aria-describedby` で入力欄に紐付ける
- エラー時は `aria-invalid="true"` ＋ エラーメッセージを `aria-describedby` に追加
- 入力の種類に合わせて `type`（email / tel / url / number）と `autocomplete` を付ける

## HTML 見本
```html
<div class="field">
  <label for="email" class="field-label">メールアドレス <span class="required">必須</span></label>
  <input id="email" type="email" class="input" autocomplete="email" required aria-describedby="email-hint">
  <p id="email-hint" class="field-hint">確認メールを送ります</p>
</div>

<div class="field">
  <label for="team" class="field-label">チーム名</label>
  <input id="team" class="input" aria-invalid="true" aria-describedby="team-error">
  <p id="team-error" class="field-error">チーム名を入力してください</p>
</div>
```

## トークン
`--color-border` `--color-focus-ring` `--color-danger` `--radius-md` `--space-3`
