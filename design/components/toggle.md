# トグルスイッチ

## いつ使うか
- ON/OFF が**即時に反映される**設定（通知、ダークモード）
- 「保存」ボタンを押して確定するフォームの中ではチェックボックスを使う

## アクセシビリティ
- `<button role="switch" aria-checked="true|false">` で作る。クリックとスペースキーで切り替え
- ラベルは状態ではなく対象を書く（「通知」。「ON」「OFF」は aria-checked が伝える）

## HTML 見本
```html
<button type="button" class="switch" role="switch" aria-checked="false" id="notify">
  <span class="switch-thumb"></span>
</button>
<label for="notify">通知を受け取る</label>

<script>
  document.querySelectorAll('[role="switch"]').forEach((el) =>
    el.addEventListener("click", () =>
      el.setAttribute("aria-checked", String(el.getAttribute("aria-checked") !== "true"))
    )
  );
</script>
```

## トークン
`--color-primary`（ON）、`--color-border`（OFF）、`--radius-full`、`--duration-base`
