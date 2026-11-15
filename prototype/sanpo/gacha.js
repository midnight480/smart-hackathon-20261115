// えびすガチャ（デモ決済）
// 図鑑がそろわない人向け。払った金額と同じだけ「お店で使えるポイント」が付き、ガチャを1回引ける。
// 1回の値段は回すほど安くなる（PRICES の順、最後の値段が下限）。すでに持っているキャラも出る（かぶり）。
// 決済はデモで、実際の支払いは発生しない。本番は決済代行（Stripe など）を Worker 経由でつなぐ。

import * as progress from './progress.js';
import { drawThumb, toast, updateHud } from './book.js';
import { currentEvent, rareMultiplier } from './events.js';
import { GRADES, ORDER, isHigh } from './rarity.js';
import { initGachaFx, playGacha, resetStage } from './gacha-fx.js';

const $ = (id) => document.getElementById(id);

// n 回目の値段（円）。これより後は最後の値段のまま
const PRICES = [300, 250, 200, 150];
// まずレア度を RATE の割合で決め、そのレア度の中から1体を同じ確率で選ぶ
// （えびす像が 828体あるので、1体ずつの重みにすると N ばかりになるため）
const RATE = { N: 60, R: 25, SR: 12, SSR: 3 };
// かぶったときのおまけ（pt）
const DUP_BONUS = 10;

const ctx = { pool: [], credit: '' }; // [{ key, name, grade, board, photo? }]

export function initGacha({ entries, credit }) {
  ctx.pool = entries;
  ctx.credit = credit;
  initGachaFx();
  $('btn-gacha').addEventListener('click', open);
  $('gacha-pay').addEventListener('click', payAndDraw);
  $('gacha-close').addEventListener('click', () => $('gacha-dialog').close());
}

export const priceOf = (n) => PRICES[Math.min(n, PRICES.length - 1)];

function open() {
  render();
  resetStage();
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
  const rates = gradeRates();
  const count = (gr) => ctx.pool.filter((e) => e.grade === gr).length;
  $('gacha-odds').textContent = `出る確率：${ORDER.map((gr) => `${gr} ${Math.round(rates[gr] * 1000) / 10}%（${count(gr)}体）`).join('／')}。持っているものも出ます`;
  const ev = currentEvent();
  $('gacha-event').hidden = !ev || ev.rareMultiplier <= 1;
  if (ev) $('gacha-event').textContent = `${ev.name}の期間中：SR・SSR が${ev.rareMultiplier}倍出やすい`;
  $('gacha-history').textContent = g.draws
    ? `これまで ${g.draws}回・合計 ¥${g.spentYen}（デモ）`
    : 'まだ回していません';
}

// イベント期間中は SR・SSR が出やすい
function gradeRates() {
  const w = Object.fromEntries(ORDER.map((gr) => [gr, RATE[gr] * (isHigh(gr) ? rareMultiplier() : 1)]));
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  return Object.fromEntries(ORDER.map((gr) => [gr, w[gr] / sum]));
}

function pick() {
  // 発表用：?gacha=SSR などで、そのレア度を必ず出す
  const force = new URLSearchParams(location.search).get('gacha');
  const forced = ctx.pool.filter((e) => e.grade === force);
  if (forced.length) return forced[Math.floor(Math.random() * forced.length)];
  const rates = gradeRates();
  let r = Math.random();
  let grade = 'N';
  for (const gr of ORDER) { r -= rates[gr]; if (r <= 0) { grade = gr; break; } }
  const list = ctx.pool.filter((e) => e.grade === grade);
  return list[Math.floor(Math.random() * list.length)];
}

function payAndDraw() {
  const price = priceOf(progress.gachaInfo().draws);
  const btn = $('gacha-pay');
  btn.disabled = true;
  btn.textContent = '決済中…（デモ）';
  $('gacha-result').hidden = true;
  resetStage();
  // 決済の待ち時間をまねる
  setTimeout(async () => {
    progress.buyGacha(price);
    const e = pick();
    const isNew = progress.collect(e.key, e.name, 0);
    if (!isNew) progress.bonus(DUP_BONUS, `ガチャで${e.name}がかぶった`);
    btn.textContent = 'ガチャガチャ…';
    await playGacha(e.grade);
    showResult(e, isNew, price);
    btn.disabled = false;
    render();
    updateHud();
  }, 500);
}

function showResult(e, isNew, price) {
  const box = $('gacha-result');
  box.hidden = false;
  box.classList.remove('is-shown');
  // アニメーションをやり直すため、一度描き直しを挟む
  void box.offsetWidth;
  box.classList.add('is-shown');
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // 一覧のえびす像は写真（公式サイトから表示）、それ以外は板の絵
  const c = $('gacha-canvas');
  const photo = $('gacha-photo');
  c.hidden = !!e.photo;
  photo.hidden = !e.photo;
  $('gacha-credit').hidden = !e.photo;
  if (e.photo) {
    photo.src = e.photo;
    photo.alt = e.name;
    $('gacha-credit').textContent = `写真：${ctx.credit}`;
    $('gacha-credit').href = e.url;
  } else {
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    drawThumb(c, e.board, true);
  }
  box.dataset.grade = e.grade;
  $('gacha-rarity').textContent = `${e.grade}（${GRADES[e.grade].name}）`;
  $('gacha-name').textContent = e.name;
  $('gacha-new').textContent = isNew
    ? '新しく図鑑に登録しました'
    : `持っていたのでかぶり。おまけ +${DUP_BONUS}pt`;
  toast(`¥${price} をデモ決済。お店で使える ${price}pt が付きました`);
}
