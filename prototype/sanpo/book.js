// 図鑑・ランキング・案内人の画面と、画面下のポイント表示（デモ版）
// 記録の読み書きは progress.js に任せ、ここは見せ方だけを受け持つ。

import * as progress from './progress.js';
import { pointsMultiplier } from './events.js';

const $ = (id) => document.getElementById(id);

const ctx = {
  entries: [], // 図鑑に並べるもの [{ key, name, sub, grade, board }]
  chapters: [], // 弾（エリア）
  ranking: [], // 架空の参加者
  guides: [],
  metric: 'collected',
  questText: () => '', // 受けているクエストの進み具合の文
};

// ---------- 準備 ----------

export function initBook({ entries, catalog, chapters, ranking, guides, questText, onDemoGuide }) {
  ctx.entries = entries;
  ctx.chapters = chapters;
  ctx.ranking = ranking;
  ctx.guides = guides;
  ctx.questText = questText;
  ctx.catalog = catalog;
  setupCatalog();

  $('btn-book').addEventListener('click', openBook);
  $('book-close').addEventListener('click', () => $('book-dialog').close());
  setupTabs();
  document.querySelectorAll('.walk-segment [data-metric]').forEach((b) => {
    b.addEventListener('click', () => { ctx.metric = b.dataset.metric; renderRanking(); });
  });

  const demo = $('demo-guides');
  for (const g of guides) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-secondary btn-sm';
    b.textContent = `${g.name}の QR を読んだことにする`;
    b.addEventListener('click', () => { $('book-dialog').close(); onDemoGuide(g); });
    demo.append(b);
  }
  $('btn-reset').addEventListener('click', () => {
    progress.reset();
    renderBook();
    updateHud();
    toast('記録を消しました');
  });
  updateHud();
}

// ---------- 画面下のポイントとクエスト ----------

export function updateHud() {
  const d = progress.get();
  const rank = progress.rankOf(d.total);
  $('hud-rank').textContent = rank.name;
  $('hud-balance').textContent = String(d.balance);
  $('hud-total').textContent = String(d.total);

  const active = progress.activeQuests();
  const box = $('hud-quest');
  if (!active.length) { box.hidden = true; return; }
  box.hidden = false;
  box.textContent = active.map((rec) => `クエスト：${ctx.questText(rec)}`).join('\n');
}

// ---------- お知らせ ----------

let toastTimer = null;
export function toast(text) {
  const t = $('walk-toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

// ---------- 案内人 ----------

// quest: 受けたクエスト（好みに合わせて作ったもの）。fit: どの好みに合わせたかの説明
// challenge: { rule, won } 知恵くらべの決まり。勝ったあとは申し込まれない
// onChallenge: 「知恵くらべを受ける」を選んだときに呼ぶ
export function showGuide(guide, quest, fit, giftText, challenge, onChallenge) {
  $('guide-title').textContent = guide.name;
  $('guide-talk').textContent = guide.talk;
  $('guide-gift').textContent = giftText;
  const q = quest;
  $('guide-quest').hidden = !q;
  if (q) {
    $('guide-quest-title').textContent = `${q.title}（${q.points * pointsMultiplier()}pt）`;
    $('guide-quest-body').textContent = q.body;
    $('guide-quest-fit').textContent = fit;
  }
  const canChallenge = challenge && !challenge.won;
  $('guide-challenge').hidden = !canChallenge;
  $('guide-quiz-btn').hidden = !canChallenge;
  if (canChallenge) {
    const { count, need, win, lose } = challenge.rule;
    $('guide-challenge-body').textContent =
      `「佐賀のこと、どれだけ知っとるね？」${count}問のうち${need}問当てたら勝ちで +${win * pointsMultiplier()}pt。`
      + `負けたら使えるポイントから −${lose}pt（累積は減らない）。パーティーの七賢人がヒントをくれることもある。`;
  }
  const dialog = $('guide-dialog');
  dialog.returnValue = '';
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'quiz') onChallenge?.();
  }, { once: true });
  dialog.showModal();
}

// ---------- 周回のコンプリート ----------

const formatKm = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)}km` : `${Math.round(m)}m`);

export function showLapClear(chapter, r, next) {
  $('lap-title').textContent = `${chapter.title}を${r.first ? 'コンプリート' : `${r.lap}周目でコンプリート`}！`;
  $('lap-time').textContent = `タイム ${formatMs(r.ms)}／歩いた距離 ${formatKm(r.walkM)}`;
  $('lap-points').textContent = r.points
    ? `+${r.points}pt`
    : '周回のポイントは1日1回まで。今日はもうもらっているので、タイムと距離だけ記録しました';
  $('lap-next').textContent = (r.first && next ? `${next.title}が開きました。` : '')
    + `${r.lap + 1}周目の計測が始まります。最初の像に着いたところから測ります。`;
  $('lap-dialog').showModal();
  updateHud();
}

// ---------- 図鑑とランキング ----------

function openBook() {
  renderBook();
  $('book-dialog').showModal();
}

function renderBook() {
  renderZukan();
  renderRanking();
  renderPoints();
}

// 図鑑は弾（エリア）ごとに並べる。開いていない弾は、開き方だけを出す。最後に七賢人（どの弾にも現れる）
function renderZukan() {
  const list = $('zukan-list');
  list.replaceChildren();
  let got = 0;
  let open = 0;
  const section = (title, sub) => {
    const h = document.createElement('li');
    h.className = 'zukan-section';
    const t = document.createElement('strong');
    t.textContent = title;
    h.append(t);
    if (sub) { const s = document.createElement('span'); s.textContent = sub; h.append(s); }
    list.append(h);
  };

  ctx.chapters.forEach((ch, i) => {
    if (!progress.unlocked(ctx.chapters, i)) {
      section(`${ch.title}（まだ開いていない）`, `${ctx.chapters[i - 1].title}をコンプリートすると開きます`);
      return;
    }
    if (!ch.statues.length) { section(ch.title, ch.note ?? '準備中'); return; }
    const lap = progress.lapInfo(ch.id);
    const best = progress.bestMs(ch.id);
    const done = ch.statues.filter((id) => lap.got[id]).length;
    section(ch.title, `${lap.lap}周目：${done}/${ch.statues.length}`
      + (lap.start ? `（${formatMs(Date.now() - lap.start)} 経過・${formatKm(lap.walkM ?? 0)}）` : '（最初の像に着くと計測開始）')
      + `／コンプリート ${progress.clearCount(ch.id)}回`
      + (best != null ? `／最速 ${formatMs(best)}` : ''));
    for (const id of ch.statues) {
      const e = ctx.entries.find((x) => x.key === `ebisu:${id}`);
      if (!e) continue;
      open++;
      if (addEntry(list, e)) got++;
    }
  });

  section('佐賀七賢人（えびす像を10体集めるごとに一人仲間になる）');
  for (const e of ctx.entries.filter((x) => x.key.startsWith('sage:'))) {
    open++;
    if (addEntry(list, e)) got++;
  }
  $('zukan-summary').textContent = `開いているエリアの ${open} のうち ${got} を集めました。`;
  renderCatalog();
}

// ---------- 佐賀のえびす像（828体。ガチャで集める） ----------

const CAT_PAGE = 60; // 一度に並べる数（「もっと見る」で増やす）
const cat = { filter: 'all', shown: CAT_PAGE };

function setupCatalog() {
  document.querySelectorAll('[data-cat-filter]').forEach((b) => {
    b.addEventListener('click', () => {
      cat.filter = b.dataset.catFilter;
      cat.shown = CAT_PAGE;
      renderCatalog();
    });
  });
  $('catalog-more').addEventListener('click', () => { cat.shown += CAT_PAGE; renderCatalog(); });
  $('catalog-credit').textContent = `写真：${ctx.catalog.credit}（公式サイト「佐賀恵比須」から表示しています）`;
}

function renderCatalog() {
  const all = ctx.catalog.entries;
  const got = all.filter((e) => progress.has(e.key)).length;
  $('catalog-summary').textContent = `${all.length}体のうち ${got}体を集めました（ガチャで出ます）`;
  document.querySelectorAll('[data-cat-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.catFilter === cat.filter)));
  const list = all.filter((e) => {
    if (cat.filter === 'mine') return progress.has(e.key);
    if (cat.filter === 'all') return true;
    return e.grade === cat.filter;
  });
  const ul = $('catalog-list');
  ul.replaceChildren();
  for (const e of list.slice(0, cat.shown)) {
    const has = progress.has(e.key);
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.src = e.photo;
    img.loading = 'lazy';
    img.alt = has ? e.name : 'まだ集めていない像';
    img.width = 96; img.height = 96;
    if (!has) img.className = 'is-silhouette';
    img.onerror = () => { img.replaceWith(Object.assign(document.createElement('span'), { className: 'catalog-noimg', textContent: '写真なし' })); };
    const badge = Object.assign(document.createElement('span'), { className: 'grade-badge', textContent: e.grade });
    badge.dataset.grade = e.grade;
    const name = document.createElement(has ? 'a' : 'span');
    name.textContent = has ? e.name : '？？？';
    if (has) { name.href = e.url; name.target = '_blank'; name.rel = 'noopener'; } else name.className = 'is-missing';
    li.append(img, badge, name);
    ul.append(li);
  }
  $('catalog-more').hidden = list.length <= cat.shown;
  $('catalog-more').textContent = `もっと見る（あと ${list.length - cat.shown}体）`;
}

function addEntry(list, e) {
  const has = progress.has(e.key);
  const li = document.createElement('li');
  const c = document.createElement('canvas');
  c.width = 128; c.height = 160;
  c.setAttribute('aria-hidden', 'true');
  drawThumb(c, e.board, has);
  const name = document.createElement('span');
  name.textContent = has ? e.name : '？？？';
  if (!has) name.className = 'is-missing';
  li.append(c, name);
  if (e.grade) {
    const r = document.createElement('span');
    r.className = 'grade-badge';
    r.dataset.grade = e.grade;
    r.textContent = e.grade;
    li.append(r);
  }
  const sub = document.createElement('span');
  sub.className = 'is-missing';
  sub.textContent = has ? e.sub : e.hint;
  li.append(sub);
  list.append(li);
  return has;
}

// 「12分05秒」の形
export function formatMs(ms) {
  const sec = Math.round(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h ? `${h}時間` : ''}${m}分${String(s).padStart(2, '0')}秒`;
}

// 図鑑の絵：集めたものは板の表、まだのものは影絵
export function drawThumb(c, board, has) {
  const g = c.getContext('2d');
  const src = has ? board.face : board.edge;
  const s = Math.min(c.width / board.w, c.height / board.h);
  const w = board.w * s;
  const h = board.h * s;
  g.globalAlpha = has ? 1 : 0.5;
  g.drawImage(src, (c.width - w) / 2, c.height - h, w, h);
}

// ランキングの並べ方。asc は小さいほど上（タイム）。値がない人は下に回す
const METRICS = {
  collected: { label: (v) => `${v}体` },
  points: { label: (v) => `${v}pt` },
  quests: { label: (v) => `${v}件` },
  bestSec: { asc: true, label: (v) => (v == null ? '記録なし' : formatMs(v * 1000)) },
  laps: { label: (v) => `${v}周` },
  walkM: { label: (v) => formatKm(v) },
};

function renderRanking() {
  document.querySelectorAll('.walk-segment [data-metric]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.metric === ctx.metric));
  });
  const d = progress.get();
  const first = ctx.chapters[0];
  const best = progress.bestMs(first.id);
  const me = {
    name: 'あなた', me: true,
    collected: progress.collectedCount(), points: d.total, quests: progress.questsDone(),
    bestSec: best == null ? null : Math.round(best / 1000), laps: progress.clearCount(first.id),
    walkM: Math.round(d.walkM ?? 0),
  };
  const m = METRICS[ctx.metric];
  const key = ctx.metric;
  const rows = [...ctx.ranking, me].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va == null || vb == null) return (va == null) - (vb == null) || (a.me ? -1 : 0);
    return (m.asc ? va - vb : vb - va) || (a.me ? -1 : 0);
  });
  const list = $('ranking-list');
  list.replaceChildren();
  for (const r of rows) {
    const li = document.createElement('li');
    if (r.me) li.className = 'is-me';
    const v = document.createElement('span');
    v.className = 'ranking-value';
    v.textContent = m.label(r[key]);
    li.append(r.name, v);
    list.append(li);
  }
  $('ranking-note').textContent = key === 'bestSec' || key === 'laps'
    ? `${first.title}。タイムは、その周回で最初の像に着いてから全部そろうまで。コンプリートすると次の周回が始まります`
    : key === 'walkM' ? 'この画面を開いて歩いた距離の合計（GPS が大きく飛んだ分は数えない）' : '';
}

function renderPoints() {
  const d = progress.get();
  const rank = progress.rankOf(d.total);
  $('points-summary').textContent = `使えるポイント ${d.balance}pt／累積 ${d.total}pt。段位は「${rank.name}」`
    + (rank.next ? `（あと ${rank.next.min - d.total}pt で「${rank.next.name}」）` : '（最高の段位です）');
  const log = $('points-log');
  log.replaceChildren();
  for (const l of d.log.slice(0, 10)) {
    const li = document.createElement('li');
    li.textContent = `${l.text}：${l.points >= 0 ? "+" : "−"}${Math.abs(l.points)}pt`;
    log.append(li);
  }
  if (!d.log.length) {
    const li = document.createElement('li');
    li.textContent = 'まだポイントはありません';
    log.append(li);
  }
}

function setupTabs() {
  const tabs = [...document.querySelectorAll('#book-tabs [role="tab"]')];
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    }
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus(); select(next);
    });
  });
}
