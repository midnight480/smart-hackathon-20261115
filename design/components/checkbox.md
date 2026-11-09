# チェックボックス

## いつ使うか
- 複数選択できる選択肢、または単独の同意（「規約に同意する」）
- 即時に設定が切り替わるならトグルスイッチを使う

## 状態
unchecked / checked / indeterminate（JS で `el.indeterminate = true`）/ disabled / focus-visible

## アクセシビリティ
- `<input type="checkbox">` ＋ `<label>` で包む（ラベルをクリックしても切り替わる）
- グループは `<fieldset>` と `<legend>` で囲む

## HTML 見本
```html
<fieldset class="fieldset">
  <legend class="field-label">使う技術（複数選択可）</legend>
  <label class="check"><input type="checkbox" name="tech" value="ai" checked> 生成 AI</label>
  <label class="check"><input type="checkbox" name="tech" value="iot"> IoT</label>
  <label class="check"><input type="checkbox" name="tech" value="map" disabled> 地図（準備中）</label>
</fieldset>
```

## トークン
`accent-color: var(--color-primary)` を使うとネイティブ部品の色を合わせられる
