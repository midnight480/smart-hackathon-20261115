# セレクト

## いつ使うか
- 選択肢が 5 個以上あるとき。4 個以下ならラジオボタンの方が一目で分かる

## アクセシビリティ
- ネイティブの `<select>` を使う。自作ドロップダウンはキーボード操作と読み上げの実装が重いので、必要なときだけ（WAI-ARIA の Combobox / Listbox パターンに従う）
- 未選択を許さないなら、先頭に「選択してください」を `disabled` で置く

## HTML 見本
```html
<div class="field">
  <label for="track" class="field-label">参加トラック</label>
  <select id="track" class="input select" required>
    <option value="" disabled selected>選択してください</option>
    <option>AI</option>
    <option>IoT</option>
    <option>Web</option>
  </select>
</div>
```

## トークン
text-input と同じ
