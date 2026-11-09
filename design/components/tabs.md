# タブ

## いつ使うか
- 同じ階層の内容を切り替えて見せるとき（概要 / 詳細 / 設定）
- 内容が順番に進むものならステップ表示、ページ移動ならナビゲーションリンクにする

## アクセシビリティ（WAI-ARIA Tabs パターン）
- `role="tablist"` / `role="tab"` / `role="tabpanel"`、`aria-selected`、`aria-controls`
- 左右キーでタブ移動、選択中のタブだけ `tabindex="0"`、他は `-1`

## HTML 見本
```html
<div role="tablist" aria-label="作品情報" class="tabs">
  <button role="tab" id="tab-1" aria-selected="true" aria-controls="panel-1" tabindex="0">概要</button>
  <button role="tab" id="tab-2" aria-selected="false" aria-controls="panel-2" tabindex="-1">技術</button>
</div>
<div role="tabpanel" id="panel-1" aria-labelledby="tab-1">…</div>
<div role="tabpanel" id="panel-2" aria-labelledby="tab-2" hidden>…</div>
```

キーボード操作込みの実装は `../gallery/index.html` の script を参照。

## トークン
`--color-primary`（選択中の下線）、`--color-on-surface-muted`（非選択）
