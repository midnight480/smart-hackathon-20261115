# カード

## いつ使うか
- 一覧の 1 件（チーム、作品、イベント）をまとまりとして見せるとき

## ルール
- カード全体をリンクにするなら、見出しの `<a>` を広げる（`::after` で全面を覆う）。カードの中にさらにボタンを入れない
- 余白は `--space-5`(24px)、スマホでは `--space-4`

## HTML 見本
```html
<article class="card">
  <h3 class="card-title"><a href="/teams/1">チームさが</a></h3>
  <p class="card-body">佐賀の観光データを使ったおすすめルート提案アプリ</p>
  <p class="card-meta">AI トラック ・ 4 人</p>
</article>
```

## トークン
`--color-surface` `--color-border` `--radius-lg` `--elevation-1` `--space-5`
