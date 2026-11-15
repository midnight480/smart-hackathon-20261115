// パーティーの七賢人と記念撮影（セルフィー）
// 前のカメラの映像に、パーティーの七賢人（とえびすさん）の板を重ねて1枚の写真にする。
// 板は指でドラッグして動かせる。選んだ板は「小さく／大きく」で大きさを変えられる。
// 写真は端末の中だけで作り、どこにも送らない（保存・共有は本人が選んだときだけ）。

import * as progress from './progress.js';
import { toast, updateHud } from './book.js';

const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// はじめての記念撮影のおまけ（pt）
const FIRST_BONUS = 20;
// 並べる位置（画面に対する割合）。x・y は足元、h は背の高さ
const SLOTS = [
  { x: 0.17, y: 1.0, h: 0.78 },
  { x: 0.83, y: 1.0, h: 0.78 },
  { x: 0.3, y: 0.93, h: 0.62 },
];
const EBISU_SLOT = { x: 0.62, y: 1.0, h: 0.36 };

const ctx = { sages: [], ebisuBoard: null };
const shot = {
  stream: null, video: null, items: [], selected: null, drag: null, raf: 0, photoUrl: null, withEbisu: true, cameraOk: false,
};

export function initSelfie({ sages, ebisuBoard }) {
  ctx.sages = sages;
  ctx.ebisuBoard = ebisuBoard;
  shot.video = $('selfie-video');
  $('btn-selfie').addEventListener('click', open);
  $('selfie-close').addEventListener('click', () => $('selfie-dialog').close());
  $('selfie-dialog').addEventListener('close', stop);
  $('selfie-shoot').addEventListener('click', shoot);
  $('selfie-retake').addEventListener('click', retake);
  $('selfie-share').addEventListener('click', share);
  $('selfie-bigger').addEventListener('click', () => resize(1.12));
  $('selfie-smaller').addEventListener('click', () => resize(1 / 1.12));
  $('selfie-ebisu').addEventListener('change', (e) => { shot.withEbisu = e.target.checked; layout(); });
  const c = $('selfie-canvas');
  c.addEventListener('pointerdown', down);
  c.addEventListener('pointermove', move);
  c.addEventListener('pointerup', up);
  c.addEventListener('pointercancel', up);
}

// ---------- 開く・閉じる ----------

async function open() {
  retake();
  layout();
  $('selfie-dialog').showModal();
  const party = progress.get().party;
  $('selfie-hint').textContent = party.length
    ? '七賢人を指で動かして、いい位置に。選んだ人は「小さく／大きく」で大きさを変えられます'
    : 'まだパーティーに七賢人がいません。歩いて出会うと一緒に写れます（今はえびすさんだけ）';
  try {
    shot.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    shot.video.srcObject = shot.stream;
    await shot.video.play();
    shot.cameraOk = true;
  } catch {
    shot.cameraOk = false;
    toast('カメラが使えないので、背景だけで撮ります');
  }
  fit();
  loop();
}

function stop() {
  cancelAnimationFrame(shot.raf);
  shot.stream?.getTracks().forEach((t) => t.stop());
  shot.stream = null;
  shot.cameraOk = false;
}

function fit() {
  const c = $('selfie-canvas');
  const box = c.getBoundingClientRect();
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = Math.round(box.width * dpr);
  c.height = Math.round(box.height * dpr);
}

// パーティーの順に並べる。左にいる人は右（まん中）を向き、右にいる人は左を向く
function layout() {
  const party = progress.get().party.map((id) => ctx.sages.find((s) => s.id === id)).filter(Boolean);
  shot.items = party.map((s, i) => ({ ...SLOTS[i % SLOTS.length], sage: s, label: `【${s.grade}】${s.name}` }));
  if (shot.withEbisu && ctx.ebisuBoard) shot.items.push({ ...EBISU_SLOT, ebisu: true, label: 'えびすさん' });
  // 奥（小さい人）から描く
  shot.items.sort((a, b) => a.h - b.h);
  shot.selected = null;
  syncButtons();
}

function boardOf(it) {
  if (it.ebisu) return { board: ctx.ebisuBoard, mirror: it.x > 0.5 };
  const v = it.sage.views;
  if (v.front) return { board: v.front.board, mirror: false };
  // 横向きの絵：まん中を向くように
  return it.x < 0.5 ? { board: v.right.board, mirror: v.right.mirror } : { board: v.left.board, mirror: v.left.mirror };
}

// ---------- 描く ----------

function loop() {
  draw($('selfie-canvas'), true);
  shot.raf = requestAnimationFrame(loop);
}

function draw(c, live) {
  const g = c.getContext('2d');
  const W = c.width; const H = c.height;
  // 背景：前のカメラは鏡のように左右反転して見せる（撮った写真も同じ向き）
  const v = shot.video;
  if (shot.cameraOk && v.videoWidth) {
    const s = Math.max(W / v.videoWidth, H / v.videoHeight);
    const vw = v.videoWidth * s; const vh = v.videoHeight * s;
    g.save();
    g.translate(W, 0); g.scale(-1, 1);
    g.drawImage(v, (W - vw) / 2, (H - vh) / 2, vw, vh);
    g.restore();
  } else {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#93c5fd'); grad.addColorStop(0.65, '#fde68a'); grad.addColorStop(1, '#a3a3a3');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
  }
  // 七賢人とえびすさん
  shot.boxes = [];
  for (const it of shot.items) {
    const { board, mirror } = boardOf(it);
    const hPx = it.h * H;
    const s = hPx / board.figureH;
    const fx = it.x * W; const fy = it.y * H;
    g.save();
    g.translate(fx, fy);
    if (mirror) g.scale(-1, 1);
    g.drawImage(board.face, board.x0 * s, (board.y0 - board.bottom) * s, board.w * s, board.h * s);
    g.restore();
    const box = { it, x0: fx - (board.w * s) / 2, x1: fx + (board.w * s) / 2, y0: fy - hPx, y1: fy };
    shot.boxes.push(box);
    if (live && shot.selected === it) {
      g.strokeStyle = css('--color-primary'); g.lineWidth = 3 * (W / 400); g.setLineDash([10, 6]);
      g.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0); g.setLineDash([]);
    }
  }
  frame(g, W, H);
}

// 写真の下の帯（題名・日付・一緒に写った人）
function frame(g, W, H) {
  const u = W / 400;
  const band = 54 * u;
  g.fillStyle = 'rgba(17, 24, 39, 0.72)';
  g.fillRect(0, H - band, W, band);
  g.fillStyle = '#fbbf24';
  g.font = `900 ${17 * u}px ${css('--font-family')}`;
  g.textBaseline = 'middle';
  g.fillText('えびすさんが歩く', 12 * u, H - band + 18 * u);
  const d = new Date();
  g.fillStyle = '#ffffff';
  g.font = `${11 * u}px ${css('--font-family')}`;
  g.textAlign = 'right';
  g.fillText(`佐賀市 ${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`, W - 12 * u, H - band + 18 * u);
  g.textAlign = 'left';
  const names = shot.items.filter((it) => it.sage).map((it) => it.sage.name.replace(/（.*）/, ''));
  g.fillText(names.length ? `with ${names.join('・')}` : 'with えびすさん', 12 * u, H - band + 40 * u);
  g.textBaseline = 'alphabetic';
}

// ---------- 動かす ----------

function at(e) {
  const c = $('selfie-canvas');
  const r = c.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
}

function down(e) {
  const p = at(e);
  // 手前（あとに描いたもの）から当たりを探す
  const hit = [...(shot.boxes ?? [])].reverse().find((b) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1);
  shot.selected = hit?.it ?? null;
  syncButtons();
  if (!hit) return;
  const c = $('selfie-canvas');
  shot.drag = { id: e.pointerId, dx: p.x / c.width - hit.it.x, dy: p.y / c.height - hit.it.y };
  c.setPointerCapture(e.pointerId);
}

function move(e) {
  if (!shot.drag || shot.drag.id !== e.pointerId || !shot.selected) return;
  const c = $('selfie-canvas');
  const p = at(e);
  shot.selected.x = Math.min(1, Math.max(0, p.x / c.width - shot.drag.dx));
  shot.selected.y = Math.min(1.3, Math.max(0.2, p.y / c.height - shot.drag.dy));
}

function up() { shot.drag = null; }

function resize(k) {
  if (!shot.selected) return;
  shot.selected.h = Math.min(1.4, Math.max(0.15, shot.selected.h * k));
}

function syncButtons() {
  const on = !!shot.selected;
  $('selfie-bigger').disabled = !on;
  $('selfie-smaller').disabled = !on;
  $('selfie-selected').textContent = on ? `選択中：${shot.selected.label}` : '人を押すと選べます';
}

// ---------- 撮る ----------

async function shoot() {
  const c = $('selfie-canvas');
  shot.selected = null;
  syncButtons();
  // パシャッ
  $('selfie-flash').classList.remove('is-on'); void $('selfie-flash').offsetWidth; $('selfie-flash').classList.add('is-on');
  click();
  draw(c, false);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
  if (shot.photoUrl) URL.revokeObjectURL(shot.photoUrl);
  shot.photoUrl = URL.createObjectURL(blob);
  shot.blob = blob;
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `ebisu-selfie-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
  shot.fileName = name;
  $('selfie-photo').src = shot.photoUrl;
  $('selfie-save').href = shot.photoUrl;
  $('selfie-save').download = name;
  $('selfie-live').hidden = true;
  $('selfie-result').hidden = false;
  $('selfie-share').hidden = !canShare();
  cancelAnimationFrame(shot.raf);

  if (progress.addSelfie()) {
    progress.bonus(FIRST_BONUS, 'はじめての記念撮影');
    toast(`はじめての記念撮影！ +${FIRST_BONUS}pt`);
    updateHud();
  }
}

function retake() {
  $('selfie-live').hidden = false;
  $('selfie-result').hidden = true;
  if ($('selfie-dialog').open) { cancelAnimationFrame(shot.raf); loop(); }
}

function canShare() {
  try {
    return !!(navigator.canShare && shot.blob && navigator.canShare({ files: [new File([shot.blob], 'a.jpg', { type: 'image/jpeg' })] }));
  } catch { return false; }
}

async function share() {
  try {
    await navigator.share({
      files: [new File([shot.blob], shot.fileName, { type: 'image/jpeg' })],
      title: 'えびすさんが歩く',
      text: '佐賀の七賢人と記念撮影しました',
    });
  } catch { /* やめたときは何もしない */ }
}

// シャッター音（Web Audio でその場で作る）
function click() {
  try {
    const a = new AudioContext();
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * 0.08), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const s = a.createBufferSource(); s.buffer = buf;
    const g = a.createGain(); g.gain.value = 0.4;
    s.connect(g).connect(a.destination); s.start();
    s.onended = () => a.close();
  } catch { /* 音が出せなくても撮る */ }
}
