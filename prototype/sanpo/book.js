// 図鑑・ランキング・案内人の画面と、画面下のポイント表示（デモ版）
// 記録の読み書きは progress.js に任せ、ここは見せ方だけを受け持つ。

import * as progress from './progress.js';

const $ = (id) => document.getElementById(id);

const ctx = {
  entries: [], // 図鑑に並べるもの [{ key, name, sub, rarity, board }]
  ranking: [], // 架空の参加者
  guides: [],
  quests: new Map(), // クエスト ID → { quest, guide }
  metric: 'collected',
  questDistance: () => null, // クエストの目的地までの距離（m）を返す関数
};

// ---------- 準備 ----------

export function initBook({ entries, ranking, guides, questDistance, onDemoGuide }) {
  ctx.entries = entries;
  ctx.ranking = ranking;
  ctx.guides = guides;
  ctx.questDistance = questDistance;
  for (const g of guides) if (g.quest) ctx.quests.set(g.quest.id, { quest: g.quest, guide: g });

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

export const questOf = (id) => ctx.quests.get(id);

// ---------- 画面下のポイントとクエスト ----------

export function updateHud() {
  const d = progress.get();
  const rank = progress.rankOf(d.total);
  $('hud-rank').textContent = rank.name;
  $('hud-balance').textContent = String(d.balance);
  $('hud-total').textContent = String(d.total);

  const active = progress.activeQuests().map((id) => ctx.quests.get(id)).filter(Boolean);
  const box = $('hud-quest');
  if (!active.length) { box.hidden = true; return; }
  box.hidden = false;
  box.textContent = active.map(({ quest }) => {
    const dist = ctx.questDistance(quest);
    return `クエスト：${quest.title}${dist != null ? `（あと ${Math.round(dist)}m）` : ''}`;
  }).join('\n');
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

export function showGuide(guide, giftText) {
  $('guide-title').textContent = guide.name;
  $('guide-talk').textContent = guide.talk;
  $('guide-gift').textContent = giftText;
  const q = guide.quest;
  $('guide-quest').hidden = !q;
  if (q) {
    $('guide-quest-title').textContent = `${q.title}（${q.points}pt）`;
    $('guide-quest-body').textContent = q.body;
  }
  $('guide-dialog').showModal();
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

function renderZukan() {
  const list = $('zukan-list');
  list.replaceChildren();
  let got = 0;
  for (const e of ctx.entries) {
    const has = progress.has(e.key);
    if (has) got++;
    const li = document.createElement('li');
    const c = document.createElement('canvas');
    c.width = 128; c.height = 160;
    c.setAttribute('aria-hidden', 'true');
    drawThumb(c, e.board, has);
    const name = document.createElement('span');
    name.textContent = has ? e.name : '？？？';
    if (!has) name.className = 'is-missing';
    li.append(c, name);
    if (e.rarity) {
      const r = document.createElement('span');
      r.className = 'zukan-rarity';
      r.textContent = e.rarity;
      li.append(r);
    }
    const sub = document.createElement('span');
    sub.className = 'is-missing';
    sub.textContent = has ? e.sub : e.hint;
    li.append(sub);
    list.append(li);
  }
  $('zukan-summary').textContent = `${ctx.entries.length}のうち ${got} を集めました。`;
}

// 図鑑の絵：集めたものは板の表、まだのものは影絵
function drawThumb(c, board, has) {
  const g = c.getContext('2d');
  const src = has ? board.face : board.edge;
  const s = Math.min(c.width / board.w, c.height / board.h);
  const w = board.w * s;
  const h = board.h * s;
  g.globalAlpha = has ? 1 : 0.5;
  g.drawImage(src, (c.width - w) / 2, c.height - h, w, h);
}

const METRIC_LABEL = { collected: '体', points: 'pt', quests: '件' };

function renderRanking() {
  document.querySelectorAll('.walk-segment [data-metric]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.metric === ctx.metric));
  });
  const d = progress.get();
  const me = {
    name: 'あなた', me: true,
    collected: progress.collectedCount(), points: d.total, quests: progress.questsDone(),
  };
  const rows = [...ctx.ranking, me].sort((a, b) => b[ctx.metric] - a[ctx.metric] || (a.me ? -1 : 0));
  const list = $('ranking-list');
  list.replaceChildren();
  for (const r of rows) {
    const li = document.createElement('li');
    if (r.me) li.className = 'is-me';
    const v = document.createElement('span');
    v.className = 'ranking-value';
    v.textContent = `${r[ctx.metric]}${METRIC_LABEL[ctx.metric]}`;
    li.append(r.name, v);
    list.append(li);
  }
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
    li.textContent = `${l.text}：+${l.points}pt`;
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
