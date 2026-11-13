// 恵比寿さんから見た夜空
// 恵比寿さんの位置と「建った年 / 今年」の 11月15日の空を、Astronomy Engine で計算して描く。
// app.js から initSky() で一度だけ準備し、showSky() で恵比寿さんを切り替える。

const A = window.Astronomy;
const STARS_URL = './data/stars.json';

// 佐賀の磁気偏角（西偏約7.5°、推定）。方位センサーは磁北基準なので真北に直す
const MAG_DECLINATION = -7.5;
// 見える星の限界等級。昔は街明かりがない、今は市街地の想定（推定値）
const LIMIT_MAG = { past: 6.0, now: 3.5 };
// 画面の長い辺に映る角度。ふだんは広めに見せる
const VIEW_FOV_DEG = 100;
// かざすモードでは、カメラの映像と星の位置が合うように、スマホの背面カメラの画角に合わせる
// （iPhone の広角カメラの長辺がおよそ 63°。機種で違うので実機で調整する）
const AR_FOV_DEG = 63;
// かざすモードで空を計算し直す間隔（ミリ秒）
const AR_REFRESH_MS = 30000;
const BODIES = [
  ['Moon', '月', '#f4f1e6'],
  ['Mercury', '水星', '#d9d9d9'],
  ['Venus', '金星', '#fffbe8'],
  ['Mars', '火星', '#ff9b73'],
  ['Jupiter', '木星', '#ffe9c4'],
  ['Saturn', '土星', '#f3dca0'],
];
const DIR16 = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東',
  '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];

const $ = (id) => document.getElementById(id);
const canvas = $('sky');
const ctx = canvas.getContext('2d');

const state = {
  ebisu: null,
  era: 'past', // 'past' = 建った年, 'now' = 今年
  hour: 20,
  mode: 'view', // 'view' = 方角を見る, 'all' = 全天
  az: 90,
  alt: 20,
  catalog: [],
  stars: [],
  bodies: [],
  sunAlt: -90,
  limit: LIMIT_MAG.past,
  orientOn: false,
  orientLive: false, // センサーの値が実際に届いているか
  ar: false, // かざすモード（カメラの映像に重ねる）
  night: true, // 夜モード（カメラを明るく、操作ボタンを暗く）
  fov: VIEW_FOV_DEG,
  stream: null,
  arTimer: null,
  eraBeforeAr: 'past',
  time: null,
};

// ---------- 計算 ----------

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const dirName = (az) => DIR16[Math.round(((az % 360) + 360) % 360 / 22.5) % 16];

// 高度・方位 → 単位ベクトル（x: 北, y: 東, z: 天頂）
function hvec(alt, az) {
  const ca = Math.cos(rad(alt));
  return [ca * Math.cos(rad(az)), ca * Math.sin(rad(az)), Math.sin(rad(alt))];
}

function currentYear() {
  return state.era === 'past' ? state.ebisu.builtYear : new Date().getFullYear();
}

// 街明かりがある時代か（電灯が広まった後を「今」とみなす）
const LIGHT_POLLUTION_FROM = 1900;
const isLitSky = () => currentYear() >= LIGHT_POLLUTION_FROM;

// 日本時間の 11月15日 hour 時（24 以上は翌日）
function jstDate(year, hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return new Date(Date.UTC(year, 10, 15, h - 9, m));
}

// かざすモードの時刻：今この瞬間。「建った年の空」は、建った年の同じ日付・同じ時刻
function arTime() {
  const now = new Date();
  if (state.era === 'now') return now;
  const d = new Date(now);
  d.setFullYear(state.ebisu.builtYear);
  return d;
}

function compute() {
  const { ebisu } = state;
  const time = state.ar ? arTime() : jstDate(currentYear(), state.hour);
  const obs = new A.Observer(ebisu.lat, ebisu.lng, 5);

  const sunEq = A.Equator('Sun', time, obs, true, true);
  state.sunAlt = A.Horizon(time, obs, sunEq.ra, sunEq.dec, 'normal').altitude;
  // 薄明（太陽高度 -18°〜-6°）のあいだは、暗い星が見えなくなる
  const twilight = Math.min(1, Math.max(0, (state.sunAlt + 18) / 12));
  state.limit = (isLitSky() ? LIMIT_MAG.now : LIMIT_MAG.past) - twilight * 3;

  const rot = A.Rotation_EQJ_HOR(time, obs);
  state.stars = [];
  for (const [ra, dec, mag, kelvin, name] of state.catalog) {
    if (mag > state.limit) continue;
    const v = A.VectorFromSphere(new A.Spherical(dec, ra, 1), time);
    const s = A.HorizonFromVector(A.RotateVector(rot, v), 'normal');
    if (s.lat < -2) continue;
    state.stars.push({ vec: hvec(s.lat, s.lon), alt: s.lat, mag, kelvin, name });
  }

  state.bodies = BODIES.map(([body, label, color]) => {
    const eq = A.Equator(body, time, obs, true, true);
    const h = A.Horizon(time, obs, eq.ra, eq.dec, 'normal');
    const illum = A.Illumination(body, time);
    return {
      body, label, color,
      alt: h.altitude, az: h.azimuth,
      vec: hvec(h.altitude, h.azimuth),
      mag: illum.mag,
      phase: illum.phase_fraction,
    };
  });

  state.time = time;
  updateText();
}

// ---------- 投影 ----------

// 方角を見るモード：見ている向きを中心にした立体射影
function viewProjector(w, h) {
  const f = hvec(state.alt, state.az);
  const right = [-Math.sin(rad(state.az)), Math.cos(rad(state.az)), 0];
  const up = [
    f[1] * right[2] - f[2] * right[1],
    f[2] * right[0] - f[0] * right[2],
    f[0] * right[1] - f[1] * right[0],
  ];
  const scale = (Math.max(w, h) / 2) / (2 * Math.tan(rad(state.fov / 4)));
  return (v) => {
    const d = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
    if (d < -0.2) return null;
    const k = 2 / (1 + d);
    const px = v[0] * right[0] + v[1] * right[1] + v[2] * right[2];
    const py = v[0] * up[0] + v[1] * up[1] + v[2] * up[2];
    return [w / 2 + k * px * scale, h / 2 - k * py * scale];
  };
}

// 全天モード：天頂が中心、北が上、東が左（空を見上げた向き）
function allSkyProjector(w, h) {
  const R = Math.min(w, h) / 2 - 24 * devicePixelRatio;
  return (v) => {
    const alt = deg(Math.asin(Math.max(-1, Math.min(1, v[2]))));
    if (alt < 0) return null;
    const az = Math.atan2(v[1], v[0]);
    const r = ((90 - alt) / 90) * R;
    return [w / 2 - r * Math.sin(az), h / 2 - r * Math.cos(az)];
  };
}

// ---------- 描画 ----------

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function starColor(k) {
  if (k < 3700) return '#ffb36b';
  if (k < 5200) return '#ffd9a0';
  if (k < 6000) return '#fff1d8';
  if (k < 7500) return '#ffffff';
  if (k < 10000) return '#dfe8ff';
  return '#c4d4ff';
}

const starRadius = (mag) => Math.max(0.6, 2.8 - 0.42 * mag) * devicePixelRatio;

let drawPending = false;
function requestDraw() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(() => { drawPending = false; draw(); });
}

function draw() {
  const dpr = devicePixelRatio;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  if (!state.ebisu) return;

  const project = state.mode === 'view' ? viewProjector(w, h) : allSkyProjector(w, h);

  // 空。かざすモードでは塗らずに、後ろのカメラの映像を透かす
  ctx.clearRect(0, 0, w, h);
  ctx.shadowColor = 'transparent';
  if (!state.ar) {
    ctx.fillStyle = css('--sky-ground');
    ctx.fillRect(0, 0, w, h);
    if (isLitSky()) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, css('--sky-now'));
      g.addColorStop(1, css('--sky-now-horizon'));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = css('--sky-past');
    }
    if (state.mode === 'all') {
      const R = Math.min(w, h) / 2 - 24 * dpr;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, R, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillRect(0, 0, w, h);
    }
  }

  // 星
  for (const s of state.stars) {
    const p = project(s.vec);
    if (!p || p[0] < -10 || p[0] > w + 10 || p[1] < -10 || p[1] > h + 10) continue;
    ctx.globalAlpha = s.mag > 4 ? 0.65 : 1;
    ctx.fillStyle = starColor(s.kelvin);
    ctx.beginPath(); ctx.arc(p[0], p[1], starRadius(s.mag), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 映像の上でも文字が読めるように、かざすモードでは名前と月・惑星に黒い影を付ける
  // （星の点すべてに付けると、スマホでは描画が重くなる）
  if (state.ar) {
    ctx.shadowColor = css('--sky-past');
    ctx.shadowBlur = 4 * dpr;
  }

  // 星の名前（月や惑星のすぐ近くの名前は、重なるので省く）
  const bodyPoints = state.bodies.filter((b) => b.alt > -1).map((b) => project(b.vec)).filter(Boolean);
  const nearBody = (p) => bodyPoints.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 36 * dpr);
  ctx.font = `${12 * dpr}px ${css('--font-family')}`;
  ctx.fillStyle = css('--sky-label');
  for (const s of state.stars) {
    if (!s.name || s.alt < 0) continue;
    const p = project(s.vec);
    if (p && !nearBody(p)) ctx.fillText(s.name, p[0] + 6 * dpr, p[1] - 6 * dpr);
  }

  // 月と惑星
  const highlightJupiter = state.era === 'past' && state.ebisu.sky?.isHighlight;
  for (const b of state.bodies) {
    if (b.alt < -1) continue;
    const p = project(b.vec);
    if (!p) continue;
    const r = (b.body === 'Moon' ? 9 : Math.max(2.5, 3.6 - 0.4 * b.mag)) * dpr;
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
    if (highlightJupiter && b.body === 'Jupiter') {
      ctx.strokeStyle = css('--sky-highlight');
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath(); ctx.arc(p[0], p[1], r + 8 * dpr, 0, Math.PI * 2); ctx.stroke();
    }
    const ringed = highlightJupiter && b.body === 'Jupiter';
    ctx.font = `${14 * dpr}px ${css('--font-family')}`;
    ctx.fillStyle = ringed ? css('--sky-highlight') : css('--sky-label');
    ctx.fillText(b.label, p[0] + r + (ringed ? 14 : 6) * dpr, p[1] + 5 * dpr);
  }

  // 地面と方角
  if (state.mode === 'view') drawGroundView(project, w, h);
  else drawAllSkyFrame(w, h);
}

function drawGroundView(project, w, h) {
  const dpr = devicePixelRatio;
  const pts = [];
  for (let d = -120; d <= 120; d += 2) {
    const p = project(hvec(0, state.az + d));
    if (p) pts.push(p);
  }
  if (pts.length > 1) {
    ctx.fillStyle = css('--sky-ground');
    // かざすモードでは、地面を薄く塗って地平線の下だと分かるようにする
    ctx.globalAlpha = state.ar ? 0.35 : 1;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], h + 10);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(pts[pts.length - 1][0], h + 10);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css('--sky-line');
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
  }
  ctx.fillStyle = css('--sky-label');
  ctx.textAlign = 'center';
  for (let i = 0; i < 16; i++) {
    const p = project(hvec(0, i * 22.5));
    if (!p || p[0] < 0 || p[0] > w || p[1] > h) continue;
    const major = i % 4 === 0;
    ctx.font = `${(major ? 16 : 12) * dpr}px ${css('--font-family')}`;
    ctx.fillText(DIR16[i], p[0], Math.min(h - 8 * dpr, p[1] + (major ? 22 : 18) * dpr));
  }
  ctx.textAlign = 'start';
}

function drawAllSkyFrame(w, h) {
  const dpr = devicePixelRatio;
  const R = Math.min(w, h) / 2 - 24 * dpr;
  ctx.strokeStyle = css('--sky-line');
  ctx.lineWidth = 1 * dpr;
  ctx.beginPath(); ctx.arc(w / 2, h / 2, R, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = css('--sky-label');
  ctx.font = `${16 * dpr}px ${css('--font-family')}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const pad = 12 * dpr;
  ctx.fillText('北', w / 2, h / 2 - R - pad);
  ctx.fillText('南', w / 2, h / 2 + R + pad);
  ctx.fillText('東', w / 2 - R - pad, h / 2);
  ctx.fillText('西', w / 2 + R + pad, h / 2);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// ---------- 文字の更新 ----------

function formatTime(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

// 日本時間の「YYYY年M月D日 H:MM」
function formatJst(date) {
  const j = new Date(date.getTime() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}年${j.getUTCMonth() + 1}月${j.getUTCDate()}日 `
    + `${j.getUTCHours()}:${String(j.getUTCMinutes()).padStart(2, '0')}`;
}

function updateText() {
  const { ebisu } = state;
  const dateLabel = formatJst(state.time);

  $('tab-built').textContent = `建った年（${ebisu.builtYear}年）`;
  $('tab-now').textContent = `今年（${new Date().getFullYear()}年）`;

  $('story-title').textContent = `${ebisu.name}・${ebisu.builtLabel}`;
  if (state.ar) {
    $('story-body').textContent = state.era === 'past'
      ? `今の空に、${ebisu.builtYear}年の同じ日・同じ時刻の星を重ねている。恵比寿さんが建った年は、ここにこう見えていた。`
      : '今この瞬間の空を、カメラの映像に重ねている。';
  } else {
    $('story-body').textContent = state.era === 'past'
      ? ebisu.sky.story
      : `今年の同じ日の空。街明かりがあるので、${LIMIT_MAG.now}等より暗い星はほとんど見えない。`;
  }

  const list = $('visible-list');
  list.replaceChildren();
  const visible = state.bodies.filter((b) => b.alt > 0).sort((a, b) => b.alt - a.alt);
  for (const b of visible) {
    const li = document.createElement('li');
    const mag = b.body === 'Moon' ? `満ち具合 ${Math.round(b.phase * 100)}%` : `${b.mag.toFixed(1)}等`;
    li.textContent = `${b.label}：${dirName(b.az)}、高さ${Math.round(b.alt)}°（${mag}）`;
    list.append(li);
  }
  if (!visible.length) {
    const li = document.createElement('li');
    li.textContent = '月と明るい惑星は、地平線の下にある';
    list.append(li);
  }

  $('story-meta').textContent =
    `${dateLabel}（日本時間）／佐賀市${ebisu.area}付近から／見えている星 ${state.stars.length}個（${state.limit.toFixed(1)}等まで）`;

  canvas.setAttribute('aria-label',
    `${dateLabel}の星空。${visible.map((b) => `${b.label}が${dirName(b.az)}の空`).join('、') || '月と明るい惑星は見えない'}`);
  updateCaption();
}

function updateCaption() {
  $('sky-caption').textContent = state.mode === 'view'
    ? `${dirName(state.az)}を向いて、高さ${Math.round(state.alt)}°${state.orientLive ? '（スマホの向きに連動中）' : ''}`
    : '全天（真ん中が真上）';
}

// ---------- 操作 ----------

function setEra(era) {
  state.era = era;
  for (const [id, e] of [['tab-built', 'past'], ['tab-now', 'now']]) {
    const t = $(id);
    t.setAttribute('aria-selected', String(e === era));
    t.tabIndex = e === era ? 0 : -1;
  }
  $('sky-panel').setAttribute('aria-labelledby', era === 'past' ? 'tab-built' : 'tab-now');
  $('ar-now').setAttribute('aria-pressed', String(era === 'now'));
  $('ar-past').setAttribute('aria-pressed', String(era === 'past'));
  compute(); requestDraw();
}

function setupTabs() {
  const tabs = [$('tab-built'), $('tab-now')];
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => setEra(i === 0 ? 'past' : 'now'));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus(); next.click();
    });
  });
}

function setMode(mode) {
  state.mode = mode;
  const btn = $('btn-mode');
  btn.textContent = mode === 'view' ? '全天を見る' : '方角を見る';
  btn.setAttribute('aria-pressed', String(mode === 'all'));
  updateCaption(); requestDraw();
}

function setupControls() {
  $('btn-mode').addEventListener('click', () => setMode(state.mode === 'view' ? 'all' : 'view'));
  document.querySelectorAll('.dir-buttons [data-az]').forEach((b) => {
    b.addEventListener('click', () => {
      state.az = Number(b.dataset.az); state.alt = 20;
      setMode('view');
    });
  });
  const time = $('time');
  time.addEventListener('input', () => {
    state.hour = Number(time.value);
    $('time-out').textContent = formatTime(state.hour);
    compute(); requestDraw();
  });

  // ドラッグで見回す（方角を見るモード、センサー未使用時）
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (state.mode !== 'view' || state.orientLive) return;
    drag = { x: e.clientX, y: e.clientY, az: state.az, alt: state.alt };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const degPerPx = state.fov / Math.max(canvas.clientWidth, canvas.clientHeight);
    state.az = (drag.az - (e.clientX - drag.x) * degPerPx + 360) % 360;
    state.alt = Math.max(-10, Math.min(90, drag.alt + (e.clientY - drag.y) * degPerPx));
    updateCaption(); requestDraw();
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  $('btn-orient').addEventListener('click', startAr);
  $('ar-close').addEventListener('click', stopAr);
  $('ar-now').addEventListener('click', () => setEra('now'));
  $('ar-past').addEventListener('click', () => setEra('past'));
  $('ar-night').addEventListener('click', () => { state.night = !state.night; applyNight(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.ar) stopAr(); });
  new ResizeObserver(requestDraw).observe(canvas);
}

// ---------- スマホの向き ----------

function lerpAngle(from, to, t) {
  const d = ((to - from + 540) % 360) - 180;
  return (from + d * t + 360) % 360;
}

function onOrientation(e) {
  let heading = null;
  if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading; // iOS（磁北基準）
  else if (e.absolute && e.alpha != null) heading = 360 - e.alpha; // Android の絶対方位
  if (heading == null || e.beta == null) return;
  heading = (heading + MAG_DECLINATION + 360) % 360;
  // 値が届いて初めて「連動中」にする（PC では許可が出ても値が来ないことがある）
  state.orientLive = true;
  // 縦持ちで背面カメラを水平に向けると beta = 90。そこから上に傾けるほど高度が上がる
  const alt = Math.max(-10, Math.min(90, e.beta - 90));
  state.az = lerpAngle(state.az, heading, 0.2);
  state.alt += (alt - state.alt) * 0.2;
  updateCaption(); requestDraw();
}

const orientEvent = () => ('ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation');

// 向きのセンサーの許可を取る。iOS はボタンを押した直後に聞く必要があるので、最初に呼ぶ
async function requestOrientation() {
  try {
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      return (await DeviceOrientationEvent.requestPermission()) === 'granted';
    }
    return true;
  } catch {
    return false;
  }
}

async function requestCamera() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
  } catch {
    return null;
  }
}

// 夜モード：カメラを明るくし（できる端末では露出を上げる）、操作ボタンを暗くする
function applyNight() {
  $('ar-night').setAttribute('aria-checked', String(state.night));
  $('sky-wrap').classList.toggle('is-night', state.night);
  const track = state.stream?.getVideoTracks()[0];
  const caps = track?.getCapabilities?.();
  if (caps?.exposureCompensation) {
    track.applyConstraints({
      advanced: [{ exposureCompensation: state.night ? caps.exposureCompensation.max : 0 }],
    }).catch(() => {});
  }
}

// かざすモードを始める：カメラの映像の上に、今の空を透かして重ねる
async function startAr() {
  if (state.ar) return;
  const orientOk = await requestOrientation();
  const stream = await requestCamera();

  state.ar = true;
  state.eraBeforeAr = state.era;
  state.stream = stream;
  state.fov = stream ? AR_FOV_DEG : VIEW_FOV_DEG;
  document.body.classList.add('is-ar');
  $('ar-bar').hidden = false;

  const video = $('sky-video');
  if (stream) {
    video.srcObject = stream;
    video.hidden = false;
    video.play().catch(() => {});
  }
  applyNight();

  if (orientOk) {
    window.addEventListener(orientEvent(), onOrientation);
    state.orientOn = true;
  }
  state.arTimer = setInterval(() => { compute(); requestDraw(); }, AR_REFRESH_MS);
  setMode('view');
  setEra('now');
  $('ar-close').focus();

  const notes = [];
  if (!stream) notes.push('カメラを使えないので、星だけを出しています');
  if (!orientOk) notes.push('向きのセンサーを使えないので、ドラッグで見回してください');
  if (notes.length) $('sky-caption').textContent = notes.join('。');
}

function stopAr() {
  if (!state.ar) return;
  window.removeEventListener(orientEvent(), onOrientation);
  state.orientOn = false;
  state.orientLive = false;
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
  clearInterval(state.arTimer);

  const video = $('sky-video');
  video.pause();
  video.srcObject = null;
  video.hidden = true;
  $('ar-bar').hidden = true;
  document.body.classList.remove('is-ar');

  state.ar = false;
  state.fov = VIEW_FOV_DEG;
  state.alt = 20;
  setEra(state.eraBeforeAr);
  $('btn-orient').focus();
}

// ---------- 外から呼ぶ ----------

let ready = null;

// 星のカタログを読み、操作を準備する（一度だけ）
export function initSky() {
  ready ??= fetch(STARS_URL)
    .then((r) => r.json())
    .then((stars) => {
      state.catalog = stars.stars;
      setupTabs();
      setupControls();
    });
  return ready;
}

// 恵比寿さんを切り替える。最初は「建った年」の 20:00、東を向いた空
export async function showSky(ebisu) {
  await initSky();
  state.ebisu = ebisu;
  state.hour = 20;
  $('time').value = '20';
  $('time-out').textContent = formatTime(20);
  state.az = 90; state.alt = 20;
  setMode('view');
  setEra('past');
}

// 画面を離れるときは、向きのセンサーを止める
export function stopSky() {
  stopAr();
}
