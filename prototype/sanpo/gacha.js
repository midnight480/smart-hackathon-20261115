// えびすガチャ（デモ決済）
// 図鑑がそろわない人向け。払った金額と同じだけ「お店で使えるポイント」が付き、ガチャを1回引ける。
// 1回の値段は回すほど安くなる（PRICES の順、最後の値段が下限）。すでに持っているキャラも出る（かぶり）。
// 決済はデモで、実際の支払いは発生しない。本番は決済代行（Stripe など）を Worker 経由でつなぐ。

import * as progress from './progress.js';
import { drawThumb, toast, updateHud } from './book.js';
import { currentEvent, rareMultiplier } from './events.js';

const $ = (id) => document.getElementById(id);

// n 回目の値段（円）。これより後は最後の値段のまま
const PRICES = [300, 250, 200, 150];
// 出やすさ。えびす像はふつう、七賢人はレア、すごくレアはさらに出にくい
const WEIGHT = { ebisu: 10, rare: 3, superRare: 1 };
// かぶったときのおまけ（pt）
const DUP_BONUS = 10;

const ctx = { pool: [] }; // [{ key, name, rarity, board, weight }]

export function initGacha({ entries }) {
  ctx.pool = entries.map((e) => ({
    ...e,
    baseWeight: !e.rarity ? WEIGHT.ebisu : e.rarity === 'すごくレア' ? WEIGHT.superRare : WEIGHT.rare,
  }));
  // イベント期間中はレアが出やすい
  for (const e of ctx.pool) {
    Object.defineProperty(e, 'weight', { get: () => e.baseWeight * (e.rarity ? rareMultiplier() : 1) });
  }
  $('btn-gacha').addEventListener('click', open);
  $('gacha-pay').addEventListener('click', payAndDraw);
  $('gacha-close').addEventListener('click', () => $('gacha-dialog').close());
}

export const priceOf = (n) => PRICES[Math.min(n, PRICES.length - 1)];

function open() {
  render();
  $('gacha-result').hidden = true;
  $('gacha-dialog').showModal();
}

function render() {
  const g = progress.gachaInfo();
  const price = priceOf(g.draws);
  const next = priceOf(g.draws + 1);
  $('gacha-price').textContent = `次の1回 ¥${price}`;
  $('gacha-price-note').textContent = next < price
    ? `その次は ¥${next}。回すほど安くなります（最低 ¥${PRICES[PRICES.length - 1]}）`
    : `いちばん安い値段です`;
  $('gacha-pay').textContent = `デモ決済で ¥${price} 払って回す（+${price}pt）`;
  const total = ctx.pool.reduce((a, e) => a + e.weight, 0);
  const pct = (w) => `${Math.round((w / total) * 1000) / 10}%`;
  const sum = (r) => ctx.pool.filter((e) => e.rarity === r).reduce((a, e) => a + e.weight, 0);
  $('gacha-odds').textContent = `出る確率：えびす像 ${pct(ctx.pool.filter((e) => !e.rarity).reduce((a, e) => a + e.weight, 0))}`
    + `／レア ${pct(sum('レア'))}／すごくレア ${pct(sum('すごくレア'))}（持っているものも出ます）`;
  const ev = currentEvent();
  $('gacha-event').hidden = !ev || ev.rareMultiplier <= 1;
  if (ev) $('gacha-event').textContent = `${ev.name}の期間中：レアが${ev.rareMultiplier}倍出やすい`;
  $('gacha-history').textContent = g.draws
    ? `これまで ${g.draws}回・合計 ¥${g.spentYen}（デモ）`
    : 'まだ回していません';
}

function pick() {
  const total = ctx.pool.reduce((a, e) => a + e.weight, 0);
  let r = Math.random() * total;
  for (const e of ctx.pool) { r -= e.weight; if (r <= 0) return e; }
  return ctx.pool[ctx.pool.length - 1];
}

function payAndDraw() {
  const price = priceOf(progress.gachaInfo().draws);
  const btn = $('gacha-pay');
  btn.disabled = true;
  btn.textContent = '決済中…（デモ）';
  // 決済の待ち時間をまねる
  setTimeout(() => {
    progress.buyGacha(price);
    const e = pick();
    const isNew = progress.collect(e.key, e.name, 0);
    if (!isNew) progress.bonus(DUP_BONUS, `ガチャで${e.name}がかぶった`);
    showResult(e, isNew, price);
    btn.disabled = false;
    render();
    updateHud();
  }, 700);
}

function showResult(e, isNew, price) {
  const box = $('gacha-result');
  box.hidden = false;
  box.classList.remove('is-shown');
  // アニメーションをやり直すため、一度描き直しを挟む
  void box.offsetWidth;
  box.classList.add('is-shown');
  const c = $('gacha-canvas');
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
  drawThumb(c, e.board, true);
  $('gacha-rarity').textContent = e.rarity ?? 'えびす像';
  $('gacha-name').textContent = e.name;
  $('gacha-new').textContent = isNew
    ? '新しく図鑑に登録しました'
    : `持っていたのでかぶり。おまけ +${DUP_BONUS}pt`;
  toast(`¥${price} をデモ決済。お店で使える ${price}pt が付きました`);
}
