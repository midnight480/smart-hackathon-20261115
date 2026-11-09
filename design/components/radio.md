# ラジオボタン

## いつ使うか
- 2〜4 個の選択肢から 1 つだけ選ぶとき。全部の選択肢が見えるのが利点
- 5 個以上ならセレクトを検討

## 状態
unchecked / checked / disabled / focus-visible / error（グループ単位）

## アクセシビリティ
- 同じグループは同じ `name` を付ける。これで矢印キーで選択が移動する
- `<fieldset>` ＋ `<legend>` で「何を選ぶか」を伝える
- 初期値をどれか選んでおくのが基本（未選択に戻せないため）

## HTML 見本
```html
<fieldset class="fieldset">
  <legend class="field-label">参加形式</legend>
  <label class="check"><input type="radio" name="style" value="onsite" checked> 会場参加</label>
  <label class="check"><input type="radio" name="style" value="online"> オンライン参加</label>
  <label class="check"><input type="radio" name="style" value="hybrid"> 両方</label>
</fieldset>
```

## トークン
`accent-color: var(--color-primary)`、項目間は `--space-2`
