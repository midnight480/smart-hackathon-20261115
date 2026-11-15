// えびすさんが歩く（試作）
// OpenStreetMap の徒歩ルートに沿って、えびす像と、ときどき現れるレアキャラ（佐賀七賢人）を歩かせる。
// 自分の位置（GPS か、地図で選んだ場所）とスマホの向きから、キャラクターがどこに見えるかを計算し、カメラの映像に重ねて描く。
// 地面は認識していない。目の高さを EYE_HEIGHT_M と決めて、足元の位置を出している。
// 確かめ用：URL に ?sages=all を付けると、七賢人がはじめから全員出る。
// キャラクターは「板ポリゴン調」で出す：絵や写真を白い縁取り付きの板にし、いつもこちらを向かせる。
// 歩くときは板を弾ませて揺らし、向きを変えるときは板がくるっと回る。
// キャラクターに写真（data/characters.json の image）があれば、いつもこちらを向く板（板ポリゴン）に貼って歩かせる。
// 写真がなければ、canvas で描いた絵で代わりに出す。

import * as progress from './progress.js';
import { initBook, updateHud, toast, showGuide, questOf, showLapClear } from './book.js';
import { initQuiz, startQuiz, rule as quizRule, challengeId } from './quiz.js';

const ROUTE_URL = './data/walk-route.json';
const EBISU_URL = '../../planning/data/ebisu-demo.json';
const GUIDES_URL = './data/guides.json';
const RANKING_URL = './data/ranking-demo.json';
const QUIZ_URL = './data/quiz.json';
const CHAPTERS_URL = './data/chapters.json';
// 1回の位置の更新でこれより大きく動いたら、GPS の飛びとみなして歩いた距離に数えない（m）
const WALK_JUMP_M = 500;
// 同じクエストに挑戦中のほかの参加者（デモでは架空）が、地図の上を歩く速さ（m/秒）
const OTHERS_SPEED = 0.7;
// パーティー：先頭の仲間が自分の何 m 後ろを歩くか、仲間どうしの間隔、横のずれ（m）
const PARTY_BACK_M = 2;
const PARTY_GAP_M = 1.6;
const PARTY_SIDE_M = 0.6;
// 仲間が追いつく速さ（m/秒）
const PARTY_SPEED = 1.6;
// この距離（m）まで近づいたら、えびす像やクエストの目的地に「着いた」とみなす
const ARRIVE_M = 30;
const CHARACTERS_URL = './data/characters.json';
// 目の高さ（m）。スマホを顔の前に構えたときの目安
const EYE_HEIGHT_M = 1.5;
// えびす像の背の高さ（m）。実物は 50cm〜1m 前後
const STATUE_HEIGHT_M = 1.0;
// 人（七賢人）の背の高さ（m）
const PERSON_HEIGHT_M = 1.65;
// 歩く速さ（m/秒）
const WALK_SPEED = 0.9;
// えびすさんが歩き始める位置：自分にいちばん近い道の上から、この距離だけ先
const START_AHEAD_M = 5;
// 七賢人が現れる間隔（秒）と、現れてから去るまで（秒）
const SAGE_INTERVAL_S = [20, 40];
const SAGE_STAY_S = 45;
// 七賢人が現れる位置：自分に近い道の上から、この範囲だけ先か後ろ
const SAGE_SPAWN_M = [8, 20];
// 現れるとき・去るときに、ふわっと出入りする時間（秒）
const FADE_S = 1.5;
// 画角：カメラを使うときは背面カメラの長辺（iPhone の広角でおよそ 63°）
const FOV_CAMERA = 63;
const FOV_PLAIN = 70;
// 道を描く範囲（m）
const ROAD_DRAW_M = 80;
// GPS がルートからこれ以上離れていたら、会場外とみなして地図で選んだ場所を使う
const GPS_MAX_M = 1500;
// 佐賀の磁気偏角（西偏約7.5°、推定）
const MAG_DECLINATION = -7.5;

const $ = (id) => document.getElementById(id);
const canvas = $('walk-canvas');
const screenCtx = canvas.getContext('2d');
// 描く先。ふだんは画面、板を作るあいだだけ板用の canvas に切り替える
let ctx = screenCtx;
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const rand = ([a, b]) => a + Math.random() * (b - a);
const nowS = () => performance.now() / 1000;

const DIR16 = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東',
  '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
const dirName = (az) => DIR16[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];

const state = {
  origin: null, // { lat, lng }：ローカル座標の原点
  path: [], // [{ n, e, s }]：北・東（m）と、始点からの道のり（m）
  total: 0,
  user: { n: 0, e: 0 },
  walkHeading: 90, // 自分の進む向き（北から時計回り）
  gps: false,
  ebisu: null, // いつも歩いているえびすさん
  walkers: [], // 道を歩くキャラクター。{ kind, s, dir, height, born, until, sage? }
  sages: [],
  nextSageAt: 0,
  statues: [], // 実在のえびす像 [{ id, name, n, e }]
  chapters: [], // 図鑑の弾（エリア）
  others: [], // 同じクエストに挑戦中のほかの参加者（デモでは架空）{ name, quest, s, dir, marker }
  guides: [],
  hits: [], // 押せる範囲（描いたときの外枠）
  labels: [], // 描いた名前の位置（重ならないようにずらすため）
  az: 90,
  alt: -8,
  follow: true, // センサーもドラッグもないときは、えびすさんの方を向き続ける
  orientLive: false,
  camera: false,
  stream: null,
  map: null,
  userMarker: null,
  lastT: 0,
};

// ---------- 座標 ----------

function toLocal(lat, lng) {
  const R = 6371000;
  return {
    n: rad(lat - state.origin.lat) * R,
    e: rad(lng - state.origin.lng) * R * Math.cos(rad(state.origin.lat)),
  };
}

function toLatLng(p) {
  const R = 6371000;
  return [
    state.origin.lat + deg(p.n / R),
    state.origin.lng + deg(p.e / (R * Math.cos(rad(state.origin.lat)))),
  ];
}

// 道のり s の位置と、進む向き（北から時計回りの角度）
function pointAt(s) {
  const p = state.path;
  s = Math.max(0, Math.min(state.total, s));
  let i = 1;
  while (i < p.length - 1 && p[i].s < s) i++;
  const a = p[i - 1];
  const b = p[i];
  const t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return {
    n: a.n + (b.n - a.n) * t,
    e: a.e + (b.e - a.e) * t,
    heading: (deg(Math.atan2(b.e - a.e, b.n - a.n)) + 360) % 360,
  };
}

// 自分にいちばん近い道の上の点（道のりと距離）
function nearestS(q) {
  let best = { d: Infinity, s: 0 };
  const p = state.path;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1];
    const b = p[i];
    const dn = b.n - a.n;
    const de = b.e - a.e;
    const len2 = dn * dn + de * de || 1;
    const t = Math.max(0, Math.min(1, ((q.n - a.n) * dn + (q.e - a.e) * de) / len2));
    const d = Math.hypot(a.n + dn * t - q.n, a.e + de * t - q.e);
    if (d < best.d) best = { d, s: a.s + (b.s - a.s) * t };
  }
  return best;
}

// キャラクターの位置。道を歩くものは道のりから、パーティーの仲間は自分の位置（pos）から
function posOf(wk) {
  if (wk.pos) return { ...wk.pos, heading: wk.heading ?? 0 };
  return pointAt(wk.s);
}

const bearing = (from, to) => (deg(Math.atan2(to.e - from.e, to.n - from.n)) + 360) % 360;
const distTo = (p) => Math.hypot(p.n - state.user.n, p.e - state.user.e);

// ---------- 投影（透視投影。カメラの映像と同じ写り方） ----------

function projector(w, h) {
  const f = [Math.cos(rad(state.alt)) * Math.cos(rad(state.az)),
    Math.cos(rad(state.alt)) * Math.sin(rad(state.az)), Math.sin(rad(state.alt))];
  const r = [-Math.sin(rad(state.az)), Math.cos(rad(state.az)), 0];
  const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  const fov = state.camera ? FOV_CAMERA : FOV_PLAIN;
  const focal = (Math.max(w, h) / 2) / Math.tan(rad(fov / 2));
  // v: 目から見たベクトル [北, 東, 上]（m）。返すのは [x, y, 1m が何 px か]
  return (v) => {
    const d = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
    if (d < 0.3) return null;
    const px = v[0] * r[0] + v[1] * r[1] + v[2] * r[2];
    const py = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
    return [w / 2 + (px / d) * focal, h / 2 - (py / d) * focal, focal / d];
  };
}

// 地面の点（目の高さぶん下）
const groundVec = (p) => [p.n - state.user.n, p.e - state.user.e, -EYE_HEIGHT_M];

// ---------- 描画 ----------

function draw(time) {
  const dpr = devicePixelRatio;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const project = projector(w, h);
  ctx.clearRect(0, 0, w, h);

  // カメラがないときは、空と地面を塗って地平線を見せる
  if (!state.camera) {
    const hz = project([Math.cos(rad(state.az)) * 1e4, Math.sin(rad(state.az)) * 1e4, 0]);
    const y = hz ? hz[1] : (state.alt > 0 ? h : 0);
    ctx.fillStyle = css('--walk-sky');
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = css('--walk-ground');
    ctx.fillRect(0, Math.max(0, y), w, h);
  }

  drawRoad(project);

  // 遠いものから描く（近いものが手前に重なる）
  state.hits = [];
  state.labels = [];
  const sorted = [...state.walkers].sort((a, b) => distTo(posOf(b)) - distTo(posOf(a)));
  for (const wk of sorted) drawWalker(wk, project, time, dpr);
}

// 道：幅 ROAD_WIDTH_M の帯を、1m ごとの四角に分けて地面に描く（遠近で自然に細くなる）
const ROAD_WIDTH_M = 1.2;
function drawRoad(project) {
  ctx.fillStyle = css('--walk-road');
  ctx.globalAlpha = state.camera ? 0.4 : 0.6;
  ctx.beginPath();
  let prev = null;
  for (let s = 0; s <= state.total; s += 1) {
    const p = pointAt(s);
    let edge = null;
    if (distTo(p) <= ROAD_DRAW_M) {
      const side = rad(p.heading + 90);
      const dn = Math.cos(side) * ROAD_WIDTH_M / 2;
      const de = Math.sin(side) * ROAD_WIDTH_M / 2;
      const l = project(groundVec({ n: p.n - dn, e: p.e - de }));
      const r = project(groundVec({ n: p.n + dn, e: p.e + de }));
      if (l && r) edge = [l, r];
    }
    if (edge && prev) {
      ctx.moveTo(prev[0][0], prev[0][1]);
      ctx.lineTo(prev[1][0], prev[1][1]);
      ctx.lineTo(edge[1][0], edge[1][1]);
      ctx.lineTo(edge[0][0], edge[0][1]);
      ctx.closePath();
    }
    prev = edge;
  }
  // 四角どうしの継ぎ目が透けないよう、nonzero で一度に塗る
  ctx.fill('nonzero');
  ctx.globalAlpha = 1;
}

// ---------- 板ポリゴン ----------

// 板の解像度（絵の 1 単位を何 px で焼くか）と、縁取り・厚みの太さ（単位）
const BOARD_PX = 4;
const BOARD_OUTLINE = 3;
const BOARD_THICK = 2.5;
// 向きを変えるときの回る速さ（大きいほど速い）
const TURN_SPEED = 7;

// 絵（drawFn）か写真（img）から板を作る。返す範囲は絵の単位（足元が原点、高さ 100）
function makeBoard({ drawFn, img }) {
  let x0; let y0; let w; let h;
  if (img) {
    w = (100 * img.naturalWidth) / img.naturalHeight; h = 100; x0 = -w / 2; y0 = -100;
  } else {
    x0 = -50; y0 = -122; w = 100; h = 124;
  }
  const pad = BOARD_OUTLINE + 1;
  x0 -= pad; y0 -= pad; w += pad * 2; h += pad * 2;
  const cw = Math.ceil(w * BOARD_PX);
  const ch = Math.ceil(h * BOARD_PX);
  const mk = () => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; };

  // 絵そのもの
  const art = mk();
  const a = art.getContext('2d');
  a.setTransform(BOARD_PX, 0, 0, BOARD_PX, -x0 * BOARD_PX, -y0 * BOARD_PX);
  if (img) {
    a.drawImage(img, x0 + pad, y0 + pad, w - pad * 2, h - pad * 2);
  } else {
    ctx = a; boardMode = true;
    drawFn();
    ctx = screenCtx; boardMode = false;
  }

  // 形を太らせた影絵（縁取りと厚みに使う）
  const silhouette = (color) => {
    const c = mk();
    const s = c.getContext('2d');
    const r = BOARD_OUTLINE * BOARD_PX;
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      s.drawImage(art, Math.cos(t) * r, Math.sin(t) * r);
    }
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = color;
    s.fillRect(0, 0, cw, ch);
    // 戻しておかないと、あとで重ねる絵が source-in で縁取りを消してしまう
    s.globalCompositeOperation = 'source-over';
    return c;
  };
  const face = silhouette(css('--walk-board-face'));
  face.getContext('2d').drawImage(art, 0, 0);
  const edge = silhouette(css('--walk-board-edge'));
  return { face, edge, x0, y0, w, h };
}

let boardMode = false; // 板を作っているあいだは、影や足の動きを描かない

// 板を描く。face は向き（-1〜1。0 のときは真横から見た薄い板）
function drawBoard(board, phase, face) {
  drawShadow(board.w * 0.3);
  ctx.save();
  // 歩く：上下に弾ませ、足元を軸に左右へ揺らす
  ctx.translate(0, -Math.abs(Math.sin(phase)) * 4);
  ctx.rotate(Math.sin(phase) * 0.06);
  // 厚み：回っている向きの反対側に、板の側面をのぞかせる
  const side = face >= 0 ? -1 : 1;
  ctx.save();
  ctx.scale(face, 1);
  ctx.drawImage(board.edge, board.x0 + BOARD_THICK * side * Math.sign(face || 1), board.y0, board.w, board.h);
  ctx.drawImage(board.face, board.x0, board.y0, board.w, board.h);
  ctx.restore();
  // 真横を向いた瞬間は、板の縁だけが見える
  if (Math.abs(face) < 0.15) {
    ctx.fillStyle = css('--walk-board-edge');
    ctx.fillRect(-BOARD_THICK / 2, board.y0 + BOARD_OUTLINE, BOARD_THICK, board.h - BOARD_OUTLINE * 2);
  }
  ctx.restore();
}

// 現れてすぐと、去る直前は薄くする
function opacity(wk) {
  if (!wk.until) return 1;
  const t = nowS();
  return Math.max(0, Math.min(1, (t - wk.born) / FADE_S, (wk.until - t) / FADE_S));
}

function drawWalker(wk, project, time, dpr) {
  const p = posOf(wk);
  const feet = project(groundVec(p));
  if (!feet) return;
  // 進む向きの 1m 先が画面の右なら、右を向いて描く
  const heading = wk.pos || wk.dir > 0 ? p.heading : (p.heading + 180) % 360;
  const ahead = project(groundVec({ n: p.n + Math.cos(rad(heading)), e: p.e + Math.sin(rad(heading)) }));
  const faceRight = ahead ? ahead[0] >= feet[0] : true;

  const k = (wk.height * feet[2]) / 100; // 絵は高さ 100 の単位で描く
  // 立ち止まっている仲間は弾まない
  const phase = wk.pos && !wk.moving ? 0 : (time / 1000) * Math.PI * 2 * 1.8 + (wk.s ?? wk.offset ?? 0); // 1秒に 1.8 歩。キャラごとに足並みをずらす

  // 向きを変えるときは、板がくるっと回る（写真で flip しないものは回さない）
  const target = faceRight || (wk.image && !wk.flip) ? 1 : -1;
  const dt = wk.lastT ? Math.min(0.1, (time - wk.lastT) / 1000) : 1;
  wk.lastT = time;
  wk.face = wk.face == null ? target : wk.face + (target - wk.face) * Math.min(1, dt * TURN_SPEED);

  ctx.save();
  ctx.globalAlpha = opacity(wk);
  ctx.translate(feet[0], feet[1]);
  ctx.scale(k, k);
  drawBoard(wk.board, phase, wk.face);
  ctx.restore();

  // 押せる範囲（指で押しやすいよう、最低 44px 角）
  const minHalf = 22 * dpr;
  const half = Math.max(minHalf, (wk.board.w / 2) * k);
  const top = feet[1] - Math.max(118 * k, 2 * minHalf);
  state.hits.push({ wk, x0: feet[0] - half, x1: feet[0] + half, y0: top, y1: feet[1] });

  // 名前と距離
  const label = wk.kind === 'party' ? `仲間：${wk.sage.name}` : wk.kind === 'ebisu'
    ? `えびすさん ${Math.round(distTo(p))}m`
    : `【${wk.sage.rarity}】${wk.sage.name} ${Math.round(distTo(p))}m`;
  ctx.font = `${14 * dpr}px ${css('--font-family')}`;
  ctx.textAlign = 'center';
  ctx.globalAlpha = opacity(wk);
  ctx.fillStyle = wk.kind === 'ebisu' ? css('--walk-label') : css('--walk-rare');
  ctx.shadowColor = css('--walk-shadow');
  ctx.shadowBlur = 4 * dpr;
  // ほかの名前と重なるなら、重ならなくなるまで上にずらす
  const lw = ctx.measureText(label).width;
  const lh = 18 * dpr;
  let ly = feet[1] - 118 * k - 6 * dpr;
  const overlaps = (y) => state.labels.some((b) =>
    Math.abs(b.x - feet[0]) < (b.w + lw) / 2 && Math.abs(b.y - y) < lh);
  for (let i = 0; i < 12 && overlaps(ly); i++) ly -= lh;
  state.labels.push({ x: feet[0], y: ly, w: lw });
  ctx.fillText(label, feet[0], ly);
  ctx.shadowColor = 'transparent';
  ctx.globalAlpha = 1;
  ctx.textAlign = 'start';
}

// 歩く足（左右を交互に振る）
function drawLegs(color, phase, bob, hipY, width) {
  const swing = boardMode ? 0 : Math.sin(phase) * 7;
  ctx.fillStyle = color;
  for (const sx of [swing, -swing]) {
    ctx.beginPath();
    ctx.moveTo(-width + sx * 0.4, hipY + bob);
    ctx.lineTo(width + sx * 0.4, hipY + bob);
    ctx.lineTo(width + 1 + sx, 0);
    ctx.lineTo(-width - 1 + sx, 0);
    ctx.closePath(); ctx.fill();
  }
}

function drawShadow(rx = 24) {
  if (boardMode) return;
  ctx.fillStyle = css('--walk-shadow-ground');
  ctx.beginPath(); ctx.ellipse(0, 0, rx, 5, 0, 0, Math.PI * 2); ctx.fill();
}

// えびすさん（足元が原点、上がマイナス、高さ 100）。右向き
function drawEbisu(phase) {
  const bob = -Math.abs(Math.sin(phase)) * 3;
  drawShadow();
  drawLegs(css('--walk-hakama'), phase, bob, -30, 6);

  ctx.save();
  ctx.translate(0, bob);

  // 釣り竿（後ろの手）
  ctx.strokeStyle = css('--walk-rod');
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-16, -52); ctx.lineTo(-34, -112); ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-34, -112); ctx.quadraticCurveTo(-40, -90, -38, -70); ctx.stroke();

  // 胴（ふくよかな着物）
  ctx.fillStyle = css('--walk-robe');
  ctx.beginPath();
  ctx.moveTo(-14, -74);
  ctx.quadraticCurveTo(-30, -56, -24, -28);
  ctx.lineTo(24, -28);
  ctx.quadraticCurveTo(32, -56, 14, -74);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = css('--walk-robe-dark');
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -72); ctx.lineTo(4, -30); ctx.stroke();

  // 鯛（前の腕に抱える）
  ctx.fillStyle = css('--walk-tai');
  ctx.beginPath(); ctx.ellipse(16, -50, 15, 9, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2, -48); ctx.lineTo(-6, -56); ctx.lineTo(-5, -42); ctx.closePath(); ctx.fill();
  ctx.fillStyle = css('--walk-hat');
  ctx.beginPath(); ctx.arc(26, -53, 1.6, 0, Math.PI * 2); ctx.fill();

  // 顔
  drawFace(2, -86, 14, true);

  // 烏帽子
  ctx.fillStyle = css('--walk-hat');
  ctx.beginPath();
  ctx.moveTo(-12, -94);
  ctx.quadraticCurveTo(-8, -110, 4, -116);
  ctx.quadraticCurveTo(12, -106, 15, -95);
  ctx.closePath(); ctx.fill();

  ctx.restore();
}

function drawFace(x, y, r, smile) {
  ctx.fillStyle = css('--walk-face');
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = css('--walk-hat');
  ctx.lineWidth = 1.6;
  if (smile) {
    ctx.beginPath(); ctx.arc(x - 5, y - 2, 3, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 6, y - 2, 3, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 1, y + 4, 6, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  } else {
    ctx.fillStyle = css('--walk-hat');
    ctx.beginPath(); ctx.arc(x - 3, y - 1, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 6, y - 1, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 1, y + 6); ctx.lineTo(x + 5, y + 6); ctx.stroke();
  }
}

// 七賢人（足元が原点、高さ 100）。wa = 着物と髷、yo = 洋装
function drawSage(sage, phase) {
  const bob = -Math.abs(Math.sin(phase)) * 2.5;
  drawShadow();
  const wa = sage.style === 'wa';
  drawLegs(wa ? css('--walk-hakama-gray') : sage.color, phase, bob, -44, 5);

  ctx.save();
  ctx.translate(0, bob);

  // 胴
  ctx.fillStyle = sage.color;
  ctx.beginPath();
  ctx.moveTo(-11, -80);
  ctx.lineTo(11, -80);
  ctx.lineTo(wa ? 15 : 12, -42);
  ctx.lineTo(wa ? -15 : -12, -42);
  ctx.closePath(); ctx.fill();
  if (wa) {
    // 襟（白）
    ctx.strokeStyle = css('--walk-collar');
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-6, -80); ctx.lineTo(2, -64); ctx.lineTo(8, -80); ctx.stroke();
  } else {
    // シャツとネクタイ
    ctx.fillStyle = css('--walk-collar');
    ctx.beginPath(); ctx.moveTo(-4, -80); ctx.lineTo(6, -80); ctx.lineTo(1, -66); ctx.closePath(); ctx.fill();
    ctx.fillStyle = css('--walk-hat');
    ctx.fillRect(0, -78, 2, 10);
  }
  // 腕（歩くのに合わせて振る）
  ctx.save();
  ctx.translate(2, -76);
  ctx.rotate(-Math.sin(phase) * 0.35);
  ctx.fillStyle = sage.color;
  ctx.fillRect(-3, 0, 6, 28);
  ctx.fillStyle = css('--walk-face');
  ctx.beginPath(); ctx.arc(0, 30, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // 顔
  drawFace(2, -89, 10, false);
  if (sage.beard) {
    ctx.fillStyle = css('--walk-hair-gray');
    ctx.beginPath(); ctx.ellipse(3, -80, 8, 6, 0, 0, Math.PI); ctx.fill();
  }

  // 髪
  ctx.fillStyle = css('--walk-hat');
  if (wa) {
    // 髷
    ctx.beginPath(); ctx.arc(2, -95, 9, Math.PI, Math.PI * 1.75); ctx.lineTo(2, -95); ctx.fill();
    ctx.fillRect(-4, -103, 10, 3);
    ctx.fillRect(0, -106, 3, 4);
  } else {
    ctx.beginPath(); ctx.arc(2, -92, 10.5, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  }

  ctx.restore();
}

// ---------- 動き ----------

function spawnSage(sage, near) {
  const dir = Math.random() < 0.5 ? 1 : -1;
  const offset = rand(SAGE_SPAWN_M) * (Math.random() < 0.5 ? 1 : -1);
  const t = nowS();
  state.walkers.push({
    kind: 'sage', sage, dir, height: PERSON_HEIGHT_M, image: sage.img, flip: sage.flip, board: sage.board,
    s: Math.max(0, Math.min(state.total, near + offset)),
    born: t, until: t + SAGE_STAY_S,
  });
}

// 重み（weight）に合わせて、まだ出ていない七賢人を一人選ぶ
function pickSage() {
  const out = [...state.walkers.filter((w) => w.kind === 'sage').map((w) => w.sage.id), ...progress.get().party];
  const pool = state.sages.filter((s) => !out.includes(s.id));
  const total = pool.reduce((a, s) => a + s.weight, 0);
  let r = Math.random() * total;
  for (const s of pool) { r -= s.weight; if (r <= 0) return s; }
  return null;
}

function tick(time) {
  const dt = state.lastT ? Math.min(0.1, (time - state.lastT) / 1000) : 0;
  state.lastT = time;
  const t = nowS();

  for (const wk of state.walkers) {
    if (wk.pos) continue; // パーティーの仲間は updateParty で動かす
    wk.s += wk.dir * WALK_SPEED * dt;
    // 端まで行ったら折り返す
    if (wk.s >= state.total) { wk.s = state.total; wk.dir = -1; }
    if (wk.s <= 0) { wk.s = 0; wk.dir = 1; }
  }
  state.walkers = state.walkers.filter((wk) => !wk.until || wk.until > t);
  updateParty(dt);
  updateOthers(dt);

  // ときどき七賢人が現れる
  if (t >= state.nextSageAt && state.sages.length) {
    const sage = pickSage();
    if (sage) spawnSage(sage, nearestS(state.user).s);
    state.nextSageAt = t + rand(SAGE_INTERVAL_S);
  }

  const p = pointAt(state.ebisu.s);
  if (state.follow && !state.orientLive) {
    state.az = bearing(state.user, p);
    const dist = Math.max(1, distTo(p));
    // 像の真ん中あたりを見る
    state.alt = deg(Math.atan2(STATUE_HEIGHT_M / 2 - EYE_HEIGHT_M, dist));
  }

  draw(time);
  updateStatus();
  updateMarkers();
  requestAnimationFrame(tick);
}

let lastStatus = 0;
function updateStatus() {
  const now = performance.now();
  if (now - lastStatus < 500) return;
  lastStatus = now;
  const p = pointAt(state.ebisu.s);
  const where = state.gps ? 'GPS の現在地から' : '地図で選んだ場所から';
  const look = state.orientLive ? 'スマホの向きに連動中' : (state.follow ? 'えびすさんを追いかけて表示中' : 'ドラッグで見回せます');
  const sages = state.walkers.filter((w) => w.kind === 'sage');
  const rare = sages.length
    ? `／近くに${sages.map((w) => `${w.sage.name}（${dirName(bearing(state.user, posOf(w)))}）`).join('、')}`
    : '';
  $('walk-status').textContent =
    `${where}：えびすさんは${dirName(bearing(state.user, p))}に ${Math.round(distTo(p))}m／${look}${rare}`;
  checkArrivals();
  updateHud();
  const party = progress.get().party.map((id) => state.sages.find((s) => s.id === id)?.name).filter(Boolean);
  const others = othersOnQuest();
  $('hud-others').hidden = !others.length;
  $('hud-others').textContent = `同じクエストに挑戦中：${others.length}人（地図の緑の点）`;
  $('hud-party').hidden = !party.length;
  $('hud-party').textContent = `パーティー（後ろに付いてくる）：${party.join('、')}`;
}

// えびす像の近くに来たら図鑑へ。受けているクエストの目的地に着いたら達成
function checkArrivals() {
  for (const st of state.statues) {
    if (distTo(st) > ARRIVE_M) continue;
    if (progress.collect(`ebisu:${st.id}`, st.name, progress.POINTS.ebisu)) {
      toast(`${st.name}に着きました。図鑑に登録（+${progress.POINTS.ebisu}pt）`);
    }
    // 開いている弾の周回を進める
    state.chapters.forEach((ch, i) => {
      if (!ch.statues.includes(st.id) || !progress.unlocked(state.chapters, i)) return;
      const r = progress.lapArrive(ch, st.id);
      if (r?.cleared) showLapClear(ch, r, state.chapters[i + 1]);
    });
  }
  for (const id of progress.activeQuests()) {
    const q = questOf(id)?.quest;
    const d = q && questDistance(q);
    if (d != null && d <= ARRIVE_M && progress.completeQuest(q)) {
      toast(`クエスト「${q.title}」を達成（+${q.points}pt）`);
    }
  }
}

function questDistance(quest) {
  const st = state.statues.find((s) => s.id === quest.target);
  return st ? distTo(st) : null;
}

// 七賢人に出会った（押した）
function meetSage(sage) {
  const pts = sage.weight === 1 ? progress.POINTS.sageRare : progress.POINTS.sage;
  const first = progress.collect(`sage:${sage.id}`, sage.name, pts);
  joinParty(sage);
  toast(first
    ? `${sage.name}に出会いました。図鑑に登録（+${pts}pt）。パーティーに加わりました`
    : `${sage.name}がパーティーに加わりました`);
}

// ---------- 同じクエストに挑戦中のほかの参加者（デモでは架空） ----------

// 自分が受けているクエストと同じものに挑戦中の人だけを、地図の上に出す
function updateOthers(dt) {
  const active = progress.activeQuests();
  for (const o of state.others) {
    o.s += o.dir * OTHERS_SPEED * dt;
    if (o.s >= state.total) { o.s = state.total; o.dir = -1; }
    if (o.s <= 0) { o.s = 0; o.dir = 1; }
    const show = active.includes(o.quest);
    if (show && !o.marker && state.map) {
      o.marker = L.circleMarker(toLatLng(pointAt(o.s)), {
        radius: 5, color: '#ffffff', weight: 2, fillColor: css('--walk-other'), fillOpacity: 1,
      }).bindTooltip(o.name, { permanent: true, direction: 'top', className: 'walk-other-tip', offset: [0, -4] })
        .addTo(state.map);
    }
    if (!show && o.marker) { o.marker.remove(); o.marker = null; }
    o.marker?.setLatLng(toLatLng(pointAt(o.s)));
  }
}

function othersOnQuest() {
  const active = progress.activeQuests();
  return state.others.filter((o) => active.includes(o.quest));
}

// ---------- パーティー ----------

// 七賢人を仲間にする。道を歩いていた本人がいれば、その場から付いてくる
function joinParty(sage) {
  const left = progress.joinParty(sage.id);
  if (left) {
    state.walkers = state.walkers.filter((w) => !(w.kind === 'party' && w.sage.id === left));
    const name = state.sages.find((s) => s.id === left)?.name;
    if (name) setTimeout(() => toast(`パーティーは${progress.PARTY_MAX}人まで。${name}が抜けました`), 2500);
  }
  if (state.walkers.some((w) => w.kind === 'party' && w.sage.id === sage.id)) return;
  const onRoute = state.walkers.find((w) => w.kind === 'sage' && w.sage.id === sage.id);
  if (onRoute) {
    const p = pointAt(onRoute.s);
    Object.assign(onRoute, { kind: 'party', pos: { n: p.n, e: p.e }, heading: p.heading, until: null, offset: onRoute.s });
  } else {
    state.walkers.push(partyWalker(sage, partyTarget(state.walkers.filter((w) => w.kind === 'party').length)));
  }
}

function partyWalker(sage, pos) {
  return {
    kind: 'party', sage, height: PERSON_HEIGHT_M, image: sage.img, flip: sage.flip, board: sage.board,
    pos: { ...pos }, heading: state.walkHeading, offset: Math.random() * 10, born: nowS(),
  };
}

// i 番目の仲間が並ぶ場所：自分の進む向きの後ろに一列、左右に少しずらす
function partyTarget(i) {
  const back = rad(state.walkHeading + 180);
  const side = rad(state.walkHeading + 90);
  const d = PARTY_BACK_M + PARTY_GAP_M * i;
  const s = (i % 2 ? -1 : 1) * PARTY_SIDE_M;
  return {
    n: state.user.n + Math.cos(back) * d + Math.cos(side) * s,
    e: state.user.e + Math.sin(back) * d + Math.sin(side) * s,
  };
}

function updateParty(dt) {
  const order = progress.get().party;
  for (const wk of state.walkers) {
    if (wk.kind !== 'party') continue;
    const target = partyTarget(Math.max(0, order.indexOf(wk.sage.id)));
    const dn = target.n - wk.pos.n;
    const de = target.e - wk.pos.e;
    const d = Math.hypot(dn, de);
    wk.moving = d > 0.1;
    if (!wk.moving) continue;
    // 離れているほど急いで追いかける
    const step = Math.min(d, Math.max(PARTY_SPEED, d) * dt);
    wk.pos.n += (dn / d) * step;
    wk.pos.e += (de / d) * step;
    wk.heading = (deg(Math.atan2(de, dn)) + 360) % 360;
  }
}

// 案内人の QR（walk?guide=<id>.<code>）。合言葉が合えば、話・もらえるもの・クエストを出す
function handleGuide(guide) {
  progress.meetGuide(guide);
  let gift = '';
  const sage = state.sages.find((s) => s.id === guide.gift);
  if (sage) {
    const got = progress.collect(`sage:${sage.id}`, sage.name, 0);
    joinParty(sage);
    gift = got
      ? `お礼に「${sage.name}」のカードをもらいました。図鑑に登録し、パーティーに加わりました。`
      : `「${sage.name}」がパーティーに加わりました。`;
  }
  gift += `（話を聞いて +${progress.POINTS.guide}pt）`;
  showGuide(guide, gift, { rule: quizRule(), won: progress.challengeWon(challengeId(guide)) }, () => startQuiz(guide));
  updateHud();
}

function guideFromUrl() {
  const q = new URLSearchParams(location.search).get('guide');
  if (!q) return;
  const [id, code] = q.split('.');
  const guide = state.guides.find((g) => g.id === id);
  // 読み直しで何度も出ないよう、URL から外しておく
  const url = new URL(location.href);
  url.searchParams.delete('guide');
  history.replaceState(null, '', url);
  if (!guide || guide.code !== code) {
    toast('この QR コードは使えません');
    return;
  }
  handleGuide(guide);
}

// 地図の印を、歩いているキャラクターに合わせて足し引きする
function updateMarkers() {
  if (!state.map) return;
  for (const wk of state.walkers) {
    if (!wk.marker) {
      const color = wk.kind === 'ebisu' ? css('--walk-robe') : css('--walk-rare');
      wk.marker = L.circleMarker(toLatLng(posOf(wk)), {
        radius: wk.kind === 'ebisu' ? 7 : 5, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 1,
      }).addTo(state.map);
    }
    wk.marker.setLatLng(toLatLng(posOf(wk)));
  }
  for (const m of state.markersAlive ?? []) {
    if (!state.walkers.some((wk) => wk.marker === m)) m.remove();
  }
  state.markersAlive = state.walkers.map((wk) => wk.marker);
}

function restart() {
  const near = nearestS(state.user);
  const e = state.ebisu;
  e.dir = near.s + START_AHEAD_M <= state.total ? 1 : -1;
  e.s = Math.max(0, Math.min(state.total, near.s + e.dir * START_AHEAD_M));
  state.follow = true;
}

function setUser(p) {
  // 動いた向きを「進む向き」として覚える（パーティーはその後ろに並ぶ）
  const moved = Math.hypot(p.n - state.user.n, p.e - state.user.e);
  if (moved > 0.5) state.walkHeading = bearing(state.user, p);
  // 歩いた距離。GPS が大きく飛んだとき（WALK_JUMP_M 超）は数えない
  // 最初に立ち位置を決めたときは数えない
  if (state.userReady && moved > 0.5 && moved <= WALK_JUMP_M) progress.addWalk(moved);
  state.userReady = true;
  state.user = p;
  state.userMarker?.setLatLng(toLatLng(p));
}

// ---------- 人物の紹介 ----------

function showCard(sage) {
  $('card-rarity').textContent = sage.rarity;
  $('card-name').textContent = sage.name;
  $('card-years').textContent = sage.years;
  $('card-bio').textContent = sage.bio;
  $('walk-card').hidden = false;
  $('card-close').focus();
}

function hideCard() {
  $('walk-card').hidden = true;
}

// ---------- 操作 ----------

function setupInput() {
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, az: state.az, alt: state.alt, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || state.orientLive) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) { drag.moved = true; state.follow = false; }
    if (!drag.moved) return;
    const fov = state.camera ? FOV_CAMERA : FOV_PLAIN;
    const degPerPx = fov / Math.max(canvas.clientWidth, canvas.clientHeight);
    state.az = (drag.az - (e.clientX - drag.x) * degPerPx + 360) % 360;
    state.alt = Math.max(-80, Math.min(60, drag.alt + (e.clientY - drag.y) * degPerPx));
  });
  canvas.addEventListener('pointerup', (e) => {
    // 動かさずに離したら「押した」とみなし、七賢人なら紹介を出す（手前のものを優先）
    if (drag && !drag.moved) {
      const dpr = devicePixelRatio;
      const x = e.offsetX * dpr;
      const y = e.offsetY * dpr;
      const hit = [...state.hits].reverse().find((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
      if (hit?.wk.kind === 'sage') { showCard(hit.wk.sage); meetSage(hit.wk.sage); }
      if (hit?.wk.kind === 'party') showCard(hit.wk.sage);
    }
    drag = null;
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  $('card-close').addEventListener('click', hideCard);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCard(); });
}

function lerpAngle(from, to, t) {
  const d = ((to - from + 540) % 360) - 180;
  return (from + d * t + 360) % 360;
}

function onOrientation(e) {
  let heading = null;
  if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading;
  else if (e.absolute && e.alpha != null) heading = 360 - e.alpha;
  if (heading == null || e.beta == null) return;
  heading = (heading + MAG_DECLINATION + 360) % 360;
  state.orientLive = true;
  // 縦持ちで背面カメラを水平に向けると beta = 90
  const alt = Math.max(-80, Math.min(60, e.beta - 90));
  state.az = lerpAngle(state.az, heading, 0.2);
  state.alt += (alt - state.alt) * 0.2;
}

const orientEvent = () => ('ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation');

async function startCamera() {
  // iOS は、ボタンを押した直後に向きの許可を聞く必要がある
  let orientOk = false;
  try {
    if (typeof DeviceOrientationEvent !== 'undefined') {
      orientOk = typeof DeviceOrientationEvent.requestPermission === 'function'
        ? (await DeviceOrientationEvent.requestPermission()) === 'granted'
        : true;
    }
  } catch { orientOk = false; }
  if (orientOk) window.addEventListener(orientEvent(), onOrientation);

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }, audio: false,
    });
    const video = $('walk-video');
    video.srcObject = state.stream;
    video.hidden = false;
    video.play().catch(() => {});
    state.camera = true;
    $('btn-camera').hidden = true;
  } catch {
    $('walk-status').textContent = 'カメラを使えませんでした（HTTPS か localhost で開く必要があります）';
  }
}

function startGps() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition((pos) => {
    const p = toLocal(pos.coords.latitude, pos.coords.longitude);
    // 会場から遠いときは使わない（PC での確認時など）
    if (nearestS(p).d > GPS_MAX_M) return;
    const first = !state.gps;
    state.gps = true;
    setUser(p);
    if (first) restart();
  }, () => {}, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}

function setupMap(coords) {
  const map = L.map('walk-map', { zoomControl: false, attributionControl: false });
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
  const line = L.polyline(coords.map(([lng, lat]) => [lat, lng]), { className: 'walk-route' }).addTo(map);
  map.fitBounds(line.getBounds(), { padding: [12, 12] });
  state.userMarker = L.circleMarker(toLatLng(state.user), {
    radius: 6, color: '#ffffff', weight: 2, fillColor: css('--color-primary'), fillOpacity: 1,
  }).addTo(map);
  map.on('click', (e) => {
    state.gps = false;
    setUser(toLocal(e.latlng.lat, e.latlng.lng));
    restart();
  });
  state.map = map;
}

// ---------- はじめる ----------

function loadImage(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { console.warn(`写真を読めませんでした: ${url}`); resolve(null); };
    img.src = url;
  });
}

async function main() {
  const [route, chars, ebisuData, guides, ranking, quiz, chapters] = await Promise.all(
    [ROUTE_URL, CHARACTERS_URL, EBISU_URL, GUIDES_URL, RANKING_URL, QUIZ_URL, CHAPTERS_URL].map((u) => fetch(u).then((r) => r.json())),
  );
  // 写真を読み込む（読めなかったものは絵で代わりに出す）
  const [ebisuImg, ...sageImgs] = await Promise.all(
    [chars.ebisu, ...chars.sages].map((c) => loadImage(c.image)),
  );
  chars.sages.forEach((s, i) => {
    s.img = sageImgs[i];
    s.board = makeBoard(s.img ? { img: s.img } : { drawFn: () => drawSage(s, 0) });
  });
  const ebisuBoard = makeBoard(ebisuImg ? { img: ebisuImg } : { drawFn: () => drawEbisu(0) });
  const coords = route.coordinates;
  state.origin = { lat: coords[0][1], lng: coords[0][0] };
  let s = 0;
  state.path = coords.map(([lng, lat], i, all) => {
    const p = toLocal(lat, lng);
    if (i > 0) {
      const q = toLocal(all[i - 1][1], all[i - 1][0]);
      s += Math.hypot(p.n - q.n, p.e - q.e);
    }
    return { ...p, s };
  });
  state.total = s;
  state.sages = chars.sages;
  state.statues = ebisuData.ebisu.map((e) => ({ id: e.id, name: e.name, area: e.area, builtYear: e.builtYear, ...toLocal(e.lat, e.lng) }));
  state.guides = guides.guides;
  state.chapters = chapters.chapters;
  state.others = ranking.players.filter((p) => p.quest).map((p) => ({
    name: p.name, quest: p.quest, s: Math.min(p.s, state.total), dir: Math.random() < 0.5 ? 1 : -1, marker: null,
  }));

  state.ebisu = {
    kind: 'ebisu', s: 0, dir: 1, height: STATUE_HEIGHT_M, image: ebisuImg, flip: chars.ebisu.flip, board: ebisuBoard,
  };
  state.walkers.push(state.ebisu);

  // 最初は、道の始まり（宝富恵比須の近く）の道ばたに立ったことにする
  setUser({ n: state.path[0].n - 3, e: state.path[0].e - 2 });
  restart();

  // 最初の七賢人は少し待ってから。?sages=all なら全員すぐ出す
  const t = nowS();
  if (new URLSearchParams(location.search).get('sages') === 'all') {
    const near = nearestS(state.user).s;
    // 重ならないよう、道の上に 7m おきに並べる
    state.sages.filter((s) => !progress.get().party.includes(s.id)).forEach((sage, i) => {
      spawnSage(sage, near);
      state.walkers[state.walkers.length - 1].s = Math.min(state.total, near + 12 + i * 7);
    });
    for (const wk of state.walkers) if (wk.until) wk.until = Infinity;
    state.nextSageAt = Infinity;
  } else {
    state.nextSageAt = t + 5;
  }

  setupMap(coords);
  setupInput();
  initBook({
    entries: [
      ...state.statues.map((st) => ({
        key: `ebisu:${st.id}`, name: st.name, sub: `${st.builtYear}年・${st.area.split('（')[0]}`,
        hint: 'その場所まで行くと集まる', board: ebisuBoard,
      })),
      ...state.sages.map((s) => ({
        key: `sage:${s.id}`, name: s.name, sub: s.years, rarity: s.rarity,
        hint: state.guides.some((g) => g.gift === s.id) ? '歩いて出会うか、案内人からもらう' : '歩いていると出会える',
        board: s.board,
      })),
    ],
    chapters: state.chapters,
    ranking: ranking.players,
    guides: state.guides,
    questDistance,
    onDemoGuide: handleGuide,
  });
  initQuiz({ quiz, sages: state.sages, onEnd: () => updateHud() });

  // 前回までのパーティーを、自分の後ろに並べる。進む向きは、最初に見ているえびすさんの方
  state.walkHeading = bearing(state.user, pointAt(state.ebisu.s));
  progress.get().party.forEach((id, i) => {
    const sage = state.sages.find((s) => s.id === id);
    if (sage) state.walkers.push(partyWalker(sage, partyTarget(i)));
  });
  guideFromUrl();
  $('btn-camera').addEventListener('click', startCamera);
  $('btn-restart').addEventListener('click', restart);
  startGps();
  requestAnimationFrame(tick);
}

main();
