// 佐賀のえびす像（828体）を、本当の場所に立たせる
// ・その場所まで行くと（ARRIVE_M 以内）図鑑に登録し、現地ボーナスのポイント
// ・その場で写真を撮ると、撮った写真が板になって、えびす像が動き出す（像のまわりを歩き回る）
// 撮った写真はこの端末（localStorage）にだけ置き、どこにも送らない。

import * as progress from './progress.js';
import { gradeOf } from './rarity.js';
import { toast, updateHud } from './book.js';

const $ = (id) => document.getElementById(id);

// 現地に行ったおまけと、動き出させたおまけ（pt）
export const VISIT_BONUS = 20;
export const AWAKE_BONUS = 20;
// AR に立たせる範囲と数
const SHOW_M = 150;
const SHOW_MAX = 12;
// 動き出した像が歩き回る輪の半径（m）と速さ（m/秒）
const WANDER_R = 6;
const WANDER_SPEED = 0.5;
// 写真を保存するときの高さ（px）。小さくして localStorage に収める
const PHOTO_H = 320;
const PHOTO_KEY = 'ebisu-walk-photos-v1';

const ctx = {
  items: [], // [{ fid, key, name, grade, address, url, n, e }]
  toLocal: null, distTo: null, makeViews: null, boost: (n) => n, arriveM: 30,
  current: null, // 着いている像（写真を撮る画面に出している像）
};

export function initStatues({ catalog, skipFids, toLocal, distTo, makeViews, boost, arriveM, map, css }) {
  Object.assign(ctx, { toLocal, distTo, makeViews, boost, arriveM });
  ctx.items = catalog.items
    .filter((it) => it.lat && !skipFids.includes(it.fid))
    .map((it) => ({ ...it, key: `cat:${it.fid}`, ...toLocal(it.lat, it.lng) }));
  $('arrive-photo-input').addEventListener('change', onPhoto);
  if (map) addMapMarkers(map, css);
}

export const located = () => ctx.items;

// ---------- 地図 ----------

function addMapMarkers(map, css) {
  const renderer = L.canvas({ padding: 0.3 });
  const color = { N: '#9ca3af', R: '#60a5fa', SR: css('--gacha-gold') || '#fbbf24', SSR: '#c084fc' };
  for (const it of ctx.items) {
    it.marker = L.circleMarker([it.lat, it.lng], {
      renderer, radius: it.grade === 'SSR' ? 6 : 4, color: '#111827', weight: 1,
      fillColor: color[it.grade], fillOpacity: progress.has(it.key) ? 1 : 0.45,
    }).bindTooltip(`【${it.grade}】${it.name}`, { direction: 'top' }).addTo(map);
  }
}

function refreshMarker(it) {
  it.marker?.setStyle({ fillOpacity: 1, weight: 2, color: '#ffffff' });
}

// ---------- 着いたか確かめる ----------

// 近くの像を返す（AR に立たせる。動き出した像は除く）
export function nearby(user) {
  const list = [];
  for (const it of ctx.items) {
    const d = Math.hypot(it.n - user.n, it.e - user.e);
    if (d <= SHOW_M) list.push({ it, d });
  }
  return list.sort((a, b) => a.d - b.d).slice(0, SHOW_MAX).map((x) => x.it);
}

// 着いた像があれば、図鑑に登録して、写真を撮る画面を出す
export function checkArrive(user) {
  for (const it of nearby(user)) {
    if (Math.hypot(it.n - user.n, it.e - user.e) > ctx.arriveM) continue;
    const g = gradeOf(it.grade);
    const got = progress.collect(it.key, it.name, g.statuePoints);
    const first = progress.visit(it.key, it.name, VISIT_BONUS);
    if (first) {
      refreshMarker(it);
      toast(`【${it.grade}】${it.name}に着きました！ ${got ? `図鑑に登録 +${ctx.boost(g.statuePoints)}pt・` : ''}現地ボーナス +${ctx.boost(VISIT_BONUS)}pt`);
      updateHud();
      if (!progress.isAwake(it.key)) openArrive(it);
    }
  }
}

// ---------- 写真を撮って動き出させる ----------

export function openArrive(it) {
  ctx.current = it;
  $('arrive-grade').textContent = `${it.grade}（${gradeOf(it.grade).name}）`;
  $('arrive-grade').dataset.grade = it.grade;
  $('arrive-name').textContent = it.name;
  $('arrive-address').textContent = it.address ?? '';
  $('arrive-link').href = it.url;
  $('arrive-ref').src = it.img;
  $('arrive-ref').alt = `${it.name}（公式サイトの写真）`;
  const awake = progress.isAwake(it.key);
  $('arrive-lead').textContent = awake
    ? 'この像はもう動き出しています。撮り直すと、新しい写真で歩きます'
    : `像を正面から写真に撮ると、えびすさんが動き出す！（+${ctx.boost(AWAKE_BONUS)}pt）`;
  if (!$('arrive-dialog').open) $('arrive-dialog').showModal();
}

export const isNear = (it, user) => Math.hypot(it.n - user.n, it.e - user.e) <= ctx.arriveM;

async function onPhoto(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  const it = ctx.current;
  if (!file || !it) return;
  const url = await shrink(file);
  savePhoto(it.fid, url);
  $('arrive-dialog').close();
  const first = progress.awaken(it.key, it.name, AWAKE_BONUS);
  await wake(it, url);
  toast(first ? `${it.name}が動き出した！ +${ctx.boost(AWAKE_BONUS)}pt` : `${it.name}が新しい写真で歩き出しました`);
  updateHud();
}

// 写真を小さくして、JPEG の data URL にする
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, PHOTO_H / img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function photos() {
  try { return JSON.parse(localStorage.getItem(PHOTO_KEY) || '{}'); } catch { return {}; }
}
function savePhoto(fid, url) {
  const all = photos();
  all[fid] = url;
  try { localStorage.setItem(PHOTO_KEY, JSON.stringify(all)); } catch { toast('端末に写真を残せませんでした（この場だけ動きます）'); }
}

// ---------- 動き出した像 ----------

const awake = new Map(); // fid → walker

function loadImg(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// 動き出した像の歩く人（walk.js の walkers に入れる）
async function wake(it, url) {
  const img = await loadImg(url);
  if (!img) return null;
  const old = awake.get(it.fid);
  const wk = old ?? {
    kind: 'awake', statue: it, height: 0.6, moving: true, theta: Math.random() * Math.PI * 2,
    pos: { n: it.n, e: it.e, heading: 0 }, offset: Math.random() * 10,
  };
  wk.views = ctx.makeViews({ imgs: { front: img } });
  wk.board = wk.views.front.board;
  wk.view = null;
  awake.set(it.fid, wk);
  if (!old) ctx.onWake?.(wk);
  return wk;
}

export function setOnWake(fn) { ctx.onWake = fn; }

// 近くにある「動き出した像」を起こす（前に撮った写真を使う）
export function wakeNearby(user) {
  const saved = photos();
  for (const it of nearby(user)) {
    if (!progress.isAwake(it.key) || awake.has(it.fid) || !saved[it.fid]) continue;
    awake.set(it.fid, null); // 読み込み中
    wake(it, saved[it.fid]);
  }
}

// 像のまわりを、輪を描いて歩き回る
export function updateAwake(dt) {
  for (const wk of awake.values()) {
    if (!wk) continue;
    wk.theta += (WANDER_SPEED / WANDER_R) * dt;
    const { n, e } = wk.statue;
    wk.pos = {
      n: n + Math.cos(wk.theta) * WANDER_R,
      e: e + Math.sin(wk.theta) * WANDER_R,
      // 進む向きは輪の接線（北から時計回りの度）
      heading: ((Math.atan2(Math.cos(wk.theta), -Math.sin(wk.theta)) * 180) / Math.PI + 360) % 360,
    };
  }
}

export const awakeFids = () => new Set([...awake.keys()]);
