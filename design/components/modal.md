# モーダル（ダイアログ）

## いつ使うか
- 作業を止めてでも確認が必要なとき（削除確認、未保存での離脱）
- 単なるお知らせはトーストやアラートで済ませる

## アクセシビリティ
- ネイティブの `<dialog>` を `showModal()` で開く。フォーカス閉じ込めと Esc で閉じる動作が標準で付く
- `aria-labelledby` で見出しを紐付ける
- 閉じたら、開いたボタンにフォーカスを戻す（`<dialog>` は自動で戻す）
- 破壊的な操作では、初期フォーカスをキャンセル側に置く

## HTML 見本
```html
<button type="button" class="btn btn-danger" onclick="document.getElementById('confirm').showModal()">削除する</button>

<dialog id="confirm" class="modal" aria-labelledby="confirm-title">
  <form method="dialog">
    <h2 id="confirm-title" class="modal-title">作品を削除しますか？</h2>
    <p>この操作は取り消せません。</p>
    <div class="modal-actions">
      <button value="cancel" class="btn btn-secondary" autofocus>キャンセル</button>
      <button value="ok" class="btn btn-danger">削除する</button>
    </div>
  </form>
</dialog>
```

## トークン
`--color-surface` `--radius-lg` `--elevation-3` `--space-5`
