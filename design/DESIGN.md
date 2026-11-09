---
# DESIGN.md — Google Stitch の DESIGN.md 形式（YAML のトークン ＋ Markdown の説明）
# 仕様: https://stitch.withgoogle.com/docs/design-md/specification （alpha のため変更されうる）
# この値は叩き台。チームのテーマが決まったら書き換え、tokens.css も合わせて更新する。
name: Smart Hackathon UI
version: 0.1.0
colors:
  primary: "#2563EB"
  primary-hover: "#1D4ED8"
  on-primary: "#FFFFFF"
  secondary: "#0F766E"
  surface: "#FFFFFF"
  surface-muted: "#F4F5F7"
  on-surface: "#1F2328"
  on-surface-muted: "#5B6370"
  border: "#D0D5DD"
  success: "#15803D"
  warning: "#B45309"
  danger: "#B91C1C"
  focus-ring: "#2563EB"
typography:
  font-family: '"Noto Sans JP", system-ui, -apple-system, "Hiragino Sans", sans-serif'
  font-family-mono: '"JetBrains Mono", ui-monospace, monospace'
  scale:
    xs: 12px
    sm: 14px
    md: 16px
    lg: 18px
    xl: 24px
    2xl: 32px
  line-height:
    body: 1.7
    heading: 1.3
  weight:
    regular: 400
    medium: 500
    bold: 700
spacing:
  unit: 4px
  scale: [0, 4, 8, 12, 16, 24, 32, 48, 64]
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px
elevation:
  1: "0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.10)"
  2: "0 4px 8px rgba(16, 24, 40, 0.08), 0 2px 4px rgba(16, 24, 40, 0.06)"
  3: "0 12px 24px rgba(16, 24, 40, 0.12)"
motion:
  duration-fast: 120ms
  duration-base: 200ms
  easing: cubic-bezier(0.2, 0, 0, 1)
breakpoints:
  sm: 640px
  md: 768px
  lg: 1024px
components:
  button:
    height: 40px
    padding-x: 16px
    rounded: md
    font-weight: medium
  input:
    height: 40px
    padding-x: 12px
    rounded: md
    border: border
  card:
    padding: 24px
    rounded: lg
    elevation: 1
---

# Smart Hackathon UI

## 方針

- **読みやすさ優先。** 本文 16px・行間 1.7。日本語の長文でも詰まって見えないようにする
- **色は意味で使う。** primary は「次にやる操作」1 つだけに使う。危険な操作は danger
- **余白は 4px 刻み。** `spacing.scale` の値だけを使う。迷ったら 16px
- **ダークモード対応。** `tokens.css` で `prefers-color-scheme: dark` 用の値を定義済み

## 色

| トークン | 用途 |
| --- | --- |
| primary / on-primary | 主ボタン、リンク、選択状態 |
| secondary | 補助的な強調（タグ、グラフの 2 系列目など） |
| surface / surface-muted | 背景、カード、入力欄の無効状態 |
| on-surface / on-surface-muted | 本文、補足テキスト |
| border | 入力欄やカードの境界 |
| success / warning / danger | 状態の通知。色だけでなくアイコンや文言でも伝える |

文字と背景のコントラストは WCAG AA（本文 4.5:1、大きい文字 3:1）以上を守る。

## タイポグラフィ

- 見出し: `xl`(24px) / `2xl`(32px)、bold、行間 1.3
- 本文: `md`(16px)、regular
- 補足・ラベル: `sm`(14px)。12px は注釈だけに使う

## レイアウト

- コンテンツ幅は最大 1120px、左右の余白はスマホで 16px、PC で 24px 以上
- スマホ幅（〜640px）で横スクロールが出ないこと

## コンポーネント

部品ごとの仕様は [`components/`](./components/) にある。実物は [`gallery/index.html`](./gallery/index.html) をブラウザで開くと一覧できる。

## インタラクション

- フォーカスは必ず見えるようにする（`focus-ring` の 2px アウトライン）
- ホバーだけに頼る操作を作らない（タッチ端末で使えないため）
- アニメーションは `duration-base` 以下。`prefers-reduced-motion` では止める
