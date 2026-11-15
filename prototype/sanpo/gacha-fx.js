// えびすガチャの演出（ガチャガチャ → カプセルが出る → 開けるとクラッカーでパーン）
// 絵は canvas に描き、音は Web Audio でその場で作る（音声ファイルは使わない）。
// 動きを減らす設定（prefers-reduced-motion）のときは、揺れや紙吹雪を省いて結果だけ出す。

const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const rand = (a, b) => a + Math.random() * (b - a);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// 舞台（ガチャの機械）の大きさ（CSS px）
const W = 320;
const H = 280;
const GLOBE = { x: 160, y: 98, r: 78 };
const HANDLE = { x: 160, y: 212 };
const OUTLET = { x: 236, y: 250 };

// カプセルの色。N はふつうの色、R は銀、SR は金、SSR は虹
const PLAIN = ['--gacha-cap-red', '--gacha-cap-blue', '--gacha-cap-green', '--gacha-cap-pink'];
const RAINBOW = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

// レア度ごとの演出
// cap：カプセル／rays：うしろの光の強さ／confetti・stars：紙吹雪ときらきらの数／
// word：開けたときの文字／shake：画面が揺れる／hint：回しているあいだ機械が光る確率（予告）／
// fake：ひとつ下の色のカプセルから化ける確率（昇格演出）／
// reversal：N のふりをして開いたあと、ゴゴゴ…と化ける確率（どんでん返し。SR・SSR だけ）
const FX = {
  N: { cap: 'plain', rays: 0, confetti: 50, stars: 8, word: 'パン！', size: 30, shake: 0, hint: 0, fake: 0 },
  R: { cap: 'silver', rays: 0.35, confetti: 100, stars: 18, word: 'パーン！', size: 36, shake: 0, hint: 0, fake: 0.3 },
  SR: { cap: 'gold', rays: 0.7, confetti: 170, stars: 32, word: 'パーーン！！', size: 40, shake: 4, hint: 0.5, fake: 0.4, reversal: 0.25 },
  SSR: { cap: 'rainbow', rays: 1, confetti: 280, stars: 50, word: 'パパーーン！！！', size: 44, shake: 10, hint: 0.8, fake: 0.6, reversal: 0.4 },
};
const BELOW = { R: 'plain', SR: 'silver', SSR: 'gold' };

const stage = { ctx: null, dpr: 1, balls: [], handle: 0, quake: 0, words: [], phase: 'idle', cap: null, flash: 0, rays: 0, glow: null, dim: 0, bolts: [], t0: 0 };
const fx = { ctx: null, parts: [], running: false };

export function initGachaFx() {
  const c = $('gacha-stage');
  stage.dpr = Math.min(2, devicePixelRatio || 1);
  c.width = W * stage.dpr; c.height = H * stage.dpr;
  stage.ctx = c.getContext('2d');
  // 機械の中のカプセル
  stage.balls = Array.from({ length: 16 }, (_, i) => ({
    x: GLOBE.x + rand(-50, 50), y: GLOBE.y + rand(0, 50), vx: 0, vy: 0, r: 13,
    color: i % 7 === 0 ? 'gold' : css(PLAIN[i % PLAIN.length]),
  }));
  fx.ctx = $('gacha-fx').getContext('2d');
  c.addEventListener('click', () => stage.onTap?.());
  requestAnimationFrame(loop);
}

// ---------- 音 ----------

let audio = null;
function ac() {
  try { audio ??= new AudioContext(); } catch { return null; }
  if (audio.state === 'suspended') audio.resume();
  return audio;
}
function tone(freq, dur, { type = 'square', vol = 0.08, at = 0, slide = 0 } = {}) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(); const g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur);
}
function noise(dur, { vol = 0.3, at = 0, hp = 800 } = {}) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  const s = a.createBufferSource(); s.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = a.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}
const sound = {
  crank: (at) => { noise(0.06, { vol: 0.25, at, hp: 2000 }); tone(180, 0.05, { at, vol: 0.05 }); },
  drop: () => { tone(500, 0.12, { type: 'triangle', slide: 0.5, vol: 0.12 }); tone(300, 0.1, { type: 'triangle', at: 0.15, slide: 0.6, vol: 0.08 }); },
  pop: () => { noise(0.35, { vol: 0.6, hp: 300 }); tone(90, 0.25, { type: 'sine', slide: 0.4, vol: 0.3 }); },
  sparkle: (n) => { for (let i = 0; i < n; i++) tone(1200 + i * 180, 0.25, { type: 'sine', at: 0.08 * i + 0.15, vol: 0.05 }); },
  // 予告：機械が光るときの「キュイーン」
  hint: () => tone(300, 0.9, { type: 'sawtooth', slide: 4, vol: 0.05 }),
  // 化けるときの「シャキーン」
  upgrade: () => { tone(880, 0.4, { type: 'sine', slide: 2, vol: 0.1 }); noise(0.3, { vol: 0.15, hp: 5000 }); },
  // どんでん返しの「ゴゴゴゴ…」と、雷の「バリバリッ」
  rumble: (sec) => {
    tone(45, sec, { type: 'sawtooth', vol: 0.12, slide: 1.8 });
    for (let t = 0; t < sec; t += 0.12) noise(0.12, { vol: 0.05 + (t / sec) * 0.1, at: t, hp: 80 });
  },
  thunder: () => { noise(0.5, { vol: 0.5, hp: 200 }); noise(0.15, { vol: 0.4, hp: 3000 }); tone(70, 0.6, { type: 'sine', slide: 0.5, vol: 0.3 }); },
  // 開けるのを待つあいだのドラムロール（SR 以上）
  roll: (sec) => { for (let t = 0; t < sec; t += 0.07) noise(0.05, { vol: 0.08 + (t / sec) * 0.12, at: t, hp: 1500 }); },
  // レア度ごとのジングル
  jingle: {
    N: () => tone(660, 0.18, { type: 'triangle', at: 0.15, vol: 0.08 }),
    R: () => [659, 880].forEach((f, i) => tone(f, 0.22, { type: 'triangle', at: 0.15 + i * 0.12, vol: 0.09 })),
    SR: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 0.6 : 0.2, { type: 'triangle', at: 0.15 + i * 0.12, vol: 0.1 })),
    SSR: () => {
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: 'square', at: 0.15 + i * 0.1, vol: 0.06 }));
      [523, 659, 784].forEach((f) => tone(f * 2, 1.2, { type: 'triangle', at: 0.8, vol: 0.07 })); // 最後に和音
      tone(55, 0.8, { type: 'sine', vol: 0.3 }); // ドーン
    },
  },
};

// ---------- 回す ----------

// grade: 'N' | 'R' | 'SR' | 'SSR'。カプセルを開けたら resolve する
export function playGacha(grade) {
  const f = FX[grade] ?? FX.N;
  if (reduced()) { sound.jingle[grade]?.(); return Promise.resolve(); }
  return new Promise((resolve) => {
    stage.phase = 'crank';
    stage.t0 = performance.now();
    stage.words = [];
    // どんでん返し：N のふりをする（発表用に ?reversal=1 で必ず起こす）
    const forced = new URLSearchParams(location.search).get('reversal') === '1';
    const reversal = (grade === 'SR' || grade === 'SSR') && (forced || Math.random() < (f.reversal ?? 0));
    // 予告：SR 以上は、ときどき回しているあいだに機械が光る（どんでん返しのときは、ばれないよう光らせない）
    stage.glow = !reversal && Math.random() < f.hint ? (grade === 'SSR' ? 'rainbow' : 'gold') : null;
    if (stage.glow) setTimeout(() => sound.hint(), 500);
    // 3回ガチャッ
    [0, 0.45, 0.9].forEach((at, i) => {
      sound.crank(at);
      setTimeout(() => stage.words.push({ text: 'ガチャ', x: HANDLE.x + (i % 2 ? -70 : 70), y: HANDLE.y - 30, t: performance.now() }), at * 1000);
    });
    setTimeout(() => {
      // ひとつ下の色のカプセルから化けることがある
      const fake = !reversal && Math.random() < f.fake;
      const plain = css(PLAIN[Math.floor(Math.random() * PLAIN.length)]);
      const colorOf = (c) => (c === 'plain' ? plain : c);
      stage.cap = {
        grade, fake, reversal, x: OUTLET.x, y: OUTLET.y - 30, vy: 0, t: performance.now(),
        color: colorOf(reversal ? 'plain' : fake ? BELOW[grade] : f.cap), real: colorOf(f.cap),
      };
      stage.phase = 'drop';
      sound.drop();
      setTimeout(() => {
        stage.phase = 'ready';
        $('gacha-tap').hidden = false;
        if ((grade === 'SR' || grade === 'SSR') && !reversal) sound.roll(1.2);
        let opened = false;
        const open = () => {
          if (opened) return; opened = true;
          $('gacha-tap').hidden = true;
          stage.onTap = null;
          if (stage.cap.reversal) { reversalSeq(resolve); return; }
          // 化ける演出：一度ぴかっとして虹になってから開く
          if (stage.cap.fake) {
            stage.cap.fake = false; stage.cap.color = stage.cap.real; stage.flash = 0.8; stage.quake = 0.4;
            sound.upgrade();
            stage.words.push({ text: '！？', x: W / 2, y: 150, t: performance.now() });
            setTimeout(() => openCap(resolve), 800);
          } else openCap(resolve);
        };
        stage.onTap = open;
        $('gacha-tap').onclick = open;
        setTimeout(open, 4000); // 押さなくても開く
      }, 700);
    }, 1400);
  });
}

// どんでん返し：N っぽく小さく開く → 暗くなってゴゴゴ… → 雷 → 本当の色になって開く
function reversalSeq(resolve) {
  const cap = stage.cap;
  const now = () => performance.now();
  const at = (ms, fn) => setTimeout(fn, ms);
  // 1. N のふり
  stage.phase = 'half';
  cap.openT = now();
  sound.pop(); sound.jingle.N();
  stage.words.push({ text: 'パン！', x: W / 2, y: 70, t: now(), big: 26 });
  stage.words.push({ text: 'N', x: W / 2, y: 150, t: now() + 200, big: 48, color: '#9ca3af', life: 1300 });
  // 2. …ん？ 暗くなって、カプセルが閉じてゴゴゴ…
  at(1300, () => {
    stage.phase = 'rumble';
    cap.rumbleT = now();
    stage.dimTarget = 0.75;
    sound.rumble(1.8);
    stage.words.push({ text: '…ん？', x: W / 2, y: 120, t: now(), color: '#ffffff', life: 900 });
    stage.words.push({ text: 'ゴゴゴゴ…', x: W / 2 - 70, y: 60, t: now() + 600, color: '#c4b5fd', life: 1400 });
    stage.words.push({ text: 'ゴゴゴゴ…', x: W / 2 + 70, y: 200, t: now() + 900, color: '#c4b5fd', life: 1300 });
  });
  // 3. 雷が落ちて、本当の色に
  [2600, 2850, 3050].forEach((ms, i) => at(ms, () => {
    stage.flash = 0.9; stage.quake = 0.6;
    stage.bolts.push({ x: rand(60, W - 60), t: now() });
    if (i === 0) sound.thunder();
    if (i === 2) {
      cap.color = cap.real;
      sound.upgrade();
      stage.words.push({ text: 'まだ終わらない！', x: W / 2, y: 110, t: now(), big: 26, color: '#fde68a', life: 1100 });
    }
  }));
  // 4. 本当に開く
  at(3900, () => { stage.dimTarget = 0; openCap(resolve); });
}

function openCap(resolve) {
  const { grade } = stage.cap;
  const f = FX[grade];
  stage.phase = 'open';
  stage.cap.openT = performance.now();
  stage.flash = 1;
  stage.rays = f.rays;
  stage.quake = f.shake ? 0.8 : 0;
  stage.words.push({ text: f.word, x: W / 2, y: 60, t: performance.now(), big: f.size });
  if (grade === 'SSR') stage.words.push({ text: 'SSR！！', x: W / 2, y: 115, t: performance.now() + 250, big: 34 });
  sound.pop();
  sound.jingle[grade]();
  sound.sparkle({ N: 2, R: 4, SR: 6, SSR: 9 }[grade]);
  navigator.vibrate?.({ N: 30, R: [30, 40, 30], SR: [40, 60, 80], SSR: [60, 40, 60, 40, 200] }[grade]);
  cracker(grade);
  // SSR は少し遅れてもう一発
  if (grade === 'SSR') setTimeout(() => { cracker(grade); sound.pop(); }, 600);
  setTimeout(resolve, 350);
}

// ---------- クラッカー（画面いっぱいの紙吹雪ときらきら） ----------

export function cracker(grade) {
  if (reduced()) return;
  const f = FX[grade] ?? FX.N;
  const c = $('gacha-fx');
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  fx.dpr = dpr;
  const colors = {
    N: PLAIN.map(css),
    R: ['#e5e7eb', '#93c5fd', '#ffffff', '#9ca3af'].concat(PLAIN.map(css)),
    SR: [css('--gacha-gold'), '#fde68a', '#ffffff', '#f59e0b'],
    SSR: RAINBOW.concat(['#ffffff', css('--gacha-gold')]),
  }[grade];
  const n = f.confetti;
  // 左下と右下から、内側の上に向けて打ち上げる
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0;
    const ang = (left ? -60 : -120) + rand(-22, 22);
    const sp = rand(9, 19);
    fx.parts.push({
      kind: Math.random() < 0.15 ? 'streamer' : 'paper',
      x: left ? 0 : innerWidth, y: innerHeight * 0.92,
      vx: Math.cos((ang * Math.PI) / 180) * sp, vy: Math.sin((ang * Math.PI) / 180) * sp,
      rot: rand(0, Math.PI * 2), vr: rand(-0.3, 0.3), w: rand(6, 11), h: rand(10, 16),
      color: colors[Math.floor(Math.random() * colors.length)], life: rand(2.5, 4),
    });
  }
  // きらきら（カードのまわりに星）
  const box = $('gacha-result').getBoundingClientRect();
  const cx = box.width ? box.left + box.width / 2 : innerWidth / 2;
  const cy = box.width ? box.top + 80 : innerHeight / 2;
  for (let i = 0; i < f.stars; i++) {
    fx.parts.push({
      kind: 'star', x: cx + rand(-150, 150), y: cy + rand(-110, 110), vx: rand(-0.3, 0.3), vy: rand(-0.6, 0),
      size: rand(5, grade === 'N' ? 9 : 15), delay: rand(0, 1.2), life: rand(1.6, 2.6),
      color: grade === 'SSR' ? RAINBOW[i % RAINBOW.length] : grade === 'SR' ? css('--gacha-gold') : '#ffffff',
    });
  }
}

function star(ctx, x, y, r, color, a) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = color;
  ctx.shadowColor = color; ctx.shadowBlur = r;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.25 : r;
    const t = (i / 8) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawFx(dt) {
  const ctx = fx.ctx;
  if (!fx.parts.length) { if (fx.running) { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); fx.running = false; } return; }
  fx.running = true;
  ctx.setTransform(fx.dpr, 0, 0, fx.dpr, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const p of fx.parts) {
    p.age = (p.age ?? 0) + dt;
    if (p.kind === 'star') {
      const t = p.age - p.delay;
      if (t < 0) continue;
      p.x += p.vx; p.y += p.vy;
      const a = Math.sin((t / p.life) * Math.PI);
      star(ctx, p.x, p.y, p.size * (0.6 + 0.4 * Math.sin(t * 12)), p.color, Math.max(0, a));
      continue;
    }
    p.vy += 0.35; p.vx *= 0.985; p.vy *= 0.985;
    if (p.vy > 3) { p.vy = 3 + (p.vy - 3) * 0.9; p.vx += Math.sin(p.age * 6 + p.rot) * 0.15; } // ひらひら落ちる
    p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    const a = Math.min(1, (p.life - p.age) / 0.6);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    if (p.kind === 'streamer') {
      ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 0; i < 6; i++) ctx.lineTo(Math.sin(i + p.age * 8) * 5, i * 6);
      ctx.stroke();
    } else {
      ctx.scale(1, Math.abs(Math.cos(p.age * 9 + p.rot))); // くるくる回る紙
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    ctx.restore();
  }
  fx.parts = fx.parts.filter((p) => p.age < (p.delay ?? 0) + p.life && p.y < innerHeight + 40);
}

// ---------- 舞台を描く ----------

function capFill(ctx, color, x, y, r) {
  if (color === 'gold') {
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, '#fff7cc'); g.addColorStop(0.5, css('--gacha-gold')); g.addColorStop(1, '#b45309');
    return g;
  }
  if (color === 'silver') {
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#cbd5e1'); g.addColorStop(1, '#64748b');
    return g;
  }
  if (color === 'rainbow') {
    const g = ctx.createLinearGradient(x - r, y, x + r, y);
    RAINBOW.forEach((c, i) => g.addColorStop(i / (RAINBOW.length - 1), c));
    return g;
  }
  return color;
}

function drawCapsule(ctx, x, y, r, color, spin = 0, open = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(spin);
  // 下半分（白）
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath(); ctx.arc(0, open * 18, r, 0, Math.PI); ctx.fill();
  // 上半分（色）
  ctx.fillStyle = capFill(ctx, color, 0, 0, r);
  ctx.beginPath(); ctx.arc(0, -open * 18, r, Math.PI, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, -open * 18, r, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, open * 18, r, 0, Math.PI); ctx.stroke();
  // つや
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.45 - open * 18, r * 0.25, r * 0.15, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function physics(dt) {
  const shaking = stage.phase === 'crank';
  for (const b of stage.balls) {
    if (shaking && Math.random() < 0.25) { b.vx += rand(-260, 260) * dt * 4; b.vy -= rand(100, 420) * dt * 4; }
    b.vy += 600 * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    // 球の内側で跳ね返る
    const dx = b.x - GLOBE.x; const dy = b.y - GLOBE.y;
    const d = Math.hypot(dx, dy); const lim = GLOBE.r - b.r - 3;
    if (d > lim) {
      const nx = dx / d; const ny = dy / d;
      b.x = GLOBE.x + nx * lim; b.y = GLOBE.y + ny * lim;
      const dot = b.vx * nx + b.vy * ny;
      b.vx -= 1.6 * dot * nx; b.vy -= 1.6 * dot * ny;
      b.vx *= 0.92; b.vy *= 0.92;
    }
  }
  // カプセルどうしが重ならないよう押し分ける
  for (let i = 0; i < stage.balls.length; i++) {
    for (let j = i + 1; j < stage.balls.length; j++) {
      const a = stage.balls[i]; const b = stage.balls[j];
      const dx = b.x - a.x; const dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1;
      const over = a.r + b.r - d;
      if (over > 0) { const nx = dx / d; const ny = dy / d; a.x -= nx * over / 2; a.y -= ny * over / 2; b.x += nx * over / 2; b.y += ny * over / 2; }
    }
  }
}

function drawStage(now, dt) {
  const ctx = stage.ctx;
  if (!ctx) return;
  physics(dt);
  ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const crank = stage.phase === 'crank';
  if (crank) stage.handle += dt * 6;
  let shakeX = crank ? Math.sin(now / 30) * 3 : 0;
  let shakeY = 0;
  // 画面ごと揺れる（SR・SSR）
  if (stage.quake > 0) {
    const amp = (FX[stage.cap?.grade]?.shake || 6) * stage.quake;
    shakeX += rand(-amp, amp); shakeY = rand(-amp, amp);
    stage.quake = Math.max(0, stage.quake - dt * 1.2);
  }
  ctx.save();
  ctx.translate(0, shakeY);

  // うしろの光（レア以上）
  if (stage.rays > 0) {
    ctx.save();
    ctx.translate(W / 2, H / 2 + 10);
    ctx.rotate(now / 1500);
    for (let i = 0; i < 16; i++) {
      ctx.rotate((Math.PI * 2) / 16);
      const g = stage.cap?.grade;
      ctx.fillStyle = g === 'SSR' ? RAINBOW[i % RAINBOW.length] : g === 'SR' ? css('--gacha-gold') : '#e2e8f0';
      ctx.globalAlpha = 0.25 * stage.rays;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-18, -260); ctx.lineTo(18, -260); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(shakeX, 0);
  // 予告で光る機械
  if (stage.glow && (crank || stage.phase === 'drop')) {
    ctx.save();
    const pulse = 0.5 + 0.5 * Math.sin(now / 80);
    ctx.shadowColor = stage.glow === 'rainbow' ? RAINBOW[Math.floor(now / 100) % RAINBOW.length] : css('--gacha-gold');
    ctx.shadowBlur = 30 * pulse;
    ctx.strokeStyle = ctx.shadowColor; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(GLOBE.x, GLOBE.y, GLOBE.r + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(68, 158, 184, 116, 16); ctx.stroke();
    ctx.restore();
  }
  // 台
  ctx.fillStyle = css('--gacha-body');
  ctx.beginPath(); ctx.roundRect(70, 160, 180, 112, 14); ctx.fill();
  ctx.fillStyle = css('--gacha-body-dark');
  ctx.fillRect(70, 160, 180, 10);
  // 取り出し口
  ctx.fillStyle = '#111827';
  ctx.beginPath(); ctx.roundRect(OUTLET.x - 26, OUTLET.y - 18, 52, 30, 8); ctx.fill();
  // 球（ガラス）
  ctx.fillStyle = 'rgba(219, 234, 254, 0.18)';
  ctx.beginPath(); ctx.arc(GLOBE.x, GLOBE.y, GLOBE.r, 0, Math.PI * 2); ctx.fill();
  for (const b of stage.balls) drawCapsule(ctx, b.x, b.y, b.r, b.color, b.x / 20);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(GLOBE.x, GLOBE.y, GLOBE.r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(GLOBE.x, GLOBE.y, GLOBE.r - 12, Math.PI * 1.1, Math.PI * 1.4); ctx.stroke();
  // 看板
  ctx.fillStyle = css('--gacha-gold');
  ctx.font = `bold 15px ${css('--font-family')}`;
  ctx.textAlign = 'center';
  ctx.fillText('えびすガチャ', GLOBE.x, 192);
  // ハンドル
  ctx.save();
  ctx.translate(HANDLE.x, HANDLE.y + 10);
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(stage.handle);
  ctx.fillStyle = css('--gacha-body-dark');
  ctx.fillRect(-18, -5, 36, 10);
  ctx.restore();
  ctx.restore();

  // どんでん返しで暗くなる
  stage.dim += ((stage.dimTarget ?? 0) - stage.dim) * Math.min(1, dt * 4);
  if (stage.dim > 0.01) {
    ctx.fillStyle = `rgba(10, 6, 30, ${stage.dim})`;
    ctx.fillRect(-20, -20, W + 40, H + 40);
  }
  // 雷
  stage.bolts = stage.bolts.filter((b) => now - b.t < 250);
  for (const b of stage.bolts) {
    ctx.save();
    ctx.strokeStyle = '#fef9c3'; ctx.lineWidth = 4; ctx.shadowColor = '#fde047'; ctx.shadowBlur = 20;
    ctx.beginPath();
    let bx = b.x; ctx.moveTo(bx, 0);
    for (let yy = 0; yy < OUTLET.y - 20; yy += 24) { bx += rand(-22, 22); ctx.lineTo(bx, yy); }
    ctx.lineTo(W / 2, OUTLET.y - 10);
    ctx.stroke();
    ctx.restore();
  }

  // 出てきたカプセル
  const cap = stage.cap;
  if (cap && stage.phase !== 'idle') {
    const t = (now - cap.t) / 1000;
    let x = OUTLET.x; let y = OUTLET.y; let spin = 0; let open = 0; let scale = 1;
    if (stage.phase === 'drop') {
      // 取り出し口から転がって、手前に出てくる
      const k = Math.min(1, t / 0.6);
      x = OUTLET.x + (W / 2 - OUTLET.x) * k; y = OUTLET.y - 6 + Math.abs(Math.sin(k * Math.PI * 2)) * -20 * (1 - k);
      spin = -k * Math.PI * 3; scale = 1 + k * 0.6;
    } else {
      x = W / 2; y = OUTLET.y - 6; scale = 1.6;
      if (stage.phase === 'ready') { spin = Math.sin(now / 90) * 0.25 * (1 + Math.sin(now / 400)); }
      if (stage.phase === 'half') open = Math.min(0.3, (now - cap.openT) / 600);
      if (stage.phase === 'rumble') {
        const k = Math.min(1, (now - cap.rumbleT) / 1500);
        open = 0.3 * (1 - Math.min(1, k * 3)); // いったん閉じる
        x += rand(-3, 3) * (1 + k * 3); y += rand(-2, 2) * (1 + k * 3);
        scale = 1.6 + k * 0.3;
        spin = rand(-0.1, 0.1) * k;
      }
      if (stage.phase === 'open') {
        const k = Math.min(1, (now - cap.openT) / 300);
        open = k; scale = 1.6 + k * 0.4;
      }
    }
    const { color } = cap;
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    if (color === 'rainbow' || color === 'gold' || color === 'silver') {
      ctx.shadowColor = color === 'gold' ? css('--gacha-gold') : '#ffffff';
      ctx.shadowBlur = color === 'rainbow' ? 30 : 18;
    }
    drawCapsule(ctx, 0, 0, 15, color, spin, open);
    ctx.restore();
  }

  // 「ガチャ」「パーン！」の文字
  stage.words = stage.words.filter((w) => now - w.t < (w.life ?? 1100));
  for (const w of stage.words) {
    if (now < w.t) continue;
    const k = (now - w.t) / (w.life ?? 1100);
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.translate(w.x, w.y - k * 20);
    ctx.rotate(w.big ? Math.sin(now / 50) * 0.05 : -0.15);
    ctx.scale(w.big ? 1 + (1 - k) * 0.6 : 1, w.big ? 1 + (1 - k) * 0.6 : 1);
    ctx.font = `900 ${w.big || 22}px ${css('--font-family')}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 6; ctx.strokeStyle = '#111827'; ctx.strokeText(w.text, 0, 0);
    ctx.fillStyle = w.color ?? (w.big ? css('--gacha-gold') : '#ffffff'); ctx.fillText(w.text, 0, 0);
    ctx.restore();
  }

  ctx.restore(); // 揺れ
  // ぴかっ
  if (stage.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${stage.flash})`;
    ctx.fillRect(0, 0, W, H);
    stage.flash = Math.max(0, stage.flash - dt * 2.5);
  }
  if (stage.rays > 0 && stage.phase === 'idle') stage.rays = Math.max(0, stage.rays - dt * 0.5);
}

let last = 0;
function loop(now) {
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
  last = now;
  if ($('gacha-dialog').open) drawStage(now, dt);
  drawFx(dt);
  requestAnimationFrame(loop);
}

// 結果を見せたあと、次に回すまで機械を元に戻す（光はゆっくり消える）
export function resetStage() {
  stage.phase = 'idle';
  stage.cap = null;
  stage.glow = null;
  stage.quake = 0;
  stage.dim = 0;
  stage.dimTarget = 0;
  stage.bolts = [];
  $('gacha-tap').hidden = true;
}
