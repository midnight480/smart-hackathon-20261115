// 参加する人の好みと、好みに合わせたクエストづくり
// 最初に「好きなこと」と「歩く量」を聞いておき、案内人の QR を読むたびに、
// 好みに合う種類のクエストを1つ、その場で作る（目的地・距離・制限時間・ポイントも好みで変える）。

import * as progress from './progress.js';

const $ = (id) => document.getElementById(id);

// 好きなこと → 出しやすくするクエストの種類
export const PREFS = {
  likes: [
    { id: 'history', label: '恵比寿さんの由来や歴史を知りたい', types: ['answer', 'visit'] },
    { id: 'walk', label: 'たくさん歩いて健康づくりをしたい', types: ['walk', 'tour'] },
    { id: 'challenge', label: '時間に挑戦するのが好き', types: ['timed'] },
    { id: 'sages', label: '佐賀の七賢人と一緒に回りたい', types: ['escort'] },
    { id: 'collect', label: 'いろんな恵比寿さんを集めたい', types: ['tour', 'visit'] },
  ],
  paces: [
    { id: 'easy', label: '少しだけ（300m くらい）', walkM: 300, speed: 0.8, tour: 2, scale: 0.8 },
    { id: 'normal', label: 'ふつう（500m くらい）', walkM: 500, speed: 1.1, tour: 3, scale: 1 },
    { id: 'hard', label: 'たっぷり（1km 以上）', walkM: 1000, speed: 1.4, tour: 3, scale: 1.5 },
  ],
};

export const TYPE_NAMES = {
  visit: '会いに行く', tour: 'めぐる', timed: '時間に挑戦', escort: '七賢人を案内', walk: '歩く', answer: '見て答える',
};

const ctx = {
  statues: [], // [{ id, name, quiz }]
  sages: [],
  distTo: () => Infinity, // えびす像 ID → 今いる場所からの距離（m）
  arriveM: 30,
};

export function initQuests({ statues, sages, distTo, arriveM }) {
  Object.assign(ctx, { statues, sages, distTo, arriveM });
  buildPrefsForm();
  $('btn-prefs').addEventListener('click', () => { $('book-dialog').close(); openPrefs(); });
}

// ---------- 好みを聞く ----------

function buildPrefsForm() {
  const likes = $('prefs-likes');
  for (const l of PREFS.likes) {
    const label = document.createElement('label');
    label.className = 'check';
    label.innerHTML = `<input type="checkbox" name="likes" value="${l.id}"> ${l.label}`;
    likes.append(label);
  }
  const paces = $('prefs-paces');
  for (const p of PREFS.paces) {
    const label = document.createElement('label');
    label.className = 'check';
    label.innerHTML = `<input type="radio" name="pace" value="${p.id}"${p.id === 'normal' ? ' checked' : ''}> ${p.label}`;
    paces.append(label);
  }
}

// 好みを聞く。閉じたら onDone を呼ぶ（まだ選んでいなければ「ふつう・好みなし」で始める）
export function openPrefs(onDone) {
  const form = $('prefs-form');
  const now = progress.prefs();
  for (const box of form.querySelectorAll('[name="likes"]')) box.checked = !!now?.likes.includes(box.value);
  for (const r of form.querySelectorAll('[name="pace"]')) r.checked = r.value === (now?.pace ?? 'normal');
  const dialog = $('prefs-dialog');
  dialog.addEventListener('close', () => {
    const likes = [...form.querySelectorAll('[name="likes"]:checked')].map((b) => b.value);
    const pace = form.querySelector('[name="pace"]:checked')?.value ?? 'normal';
    progress.setPrefs({ likes, pace });
    onDone?.();
  }, { once: true });
  dialog.showModal();
}

export function prefsText() {
  const p = progress.prefs();
  if (!p) return '';
  const likes = p.likes.map((id) => PREFS.likes.find((l) => l.id === id)?.label).filter(Boolean);
  const pace = PREFS.paces.find((x) => x.id === p.pace)?.label.split('（')[0];
  return `${likes.length ? likes.join('・') : '好みはおまかせ'}／歩く量：${pace}`;
}

// ---------- クエストを作る ----------

const paceOf = () => PREFS.paces.find((p) => p.id === (progress.prefs()?.pace ?? 'normal'));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const nameOf = (id) => ctx.statues.find((s) => s.id === id)?.name ?? id;

// 着いたばかりの像は外す。集めていない像を先に選ぶ
function targets(filter = () => true) {
  const list = ctx.statues.filter((s) => filter(s) && ctx.distTo(s.id) > ctx.arriveM);
  const fresh = list.filter((s) => !progress.has(`ebisu:${s.id}`));
  return fresh.length ? fresh : list;
}

// 種類ごとに、作れるかどうか（作れないものは選ばない）
const CAN = {
  visit: () => targets().length > 0,
  tour: () => ctx.statues.length >= 2,
  timed: () => targets().length > 0,
  escort: () => targets().length > 0 && ctx.sages.length > 0,
  walk: () => true,
  answer: () => targets((s) => s.quiz).length > 0,
};

// 好み・案内人の得意・前回と違う種類かどうかで点を付け、いちばん高い種類を選ぶ
function chooseType(guide) {
  const likes = progress.prefs()?.likes ?? [];
  const wanted = new Set(likes.flatMap((id) => PREFS.likes.find((l) => l.id === id)?.types ?? []));
  const last = progress.lastQuestType(guide.id);
  const scored = Object.keys(CAN).filter((t) => CAN[t]()).map((t) => ({
    t,
    score: (wanted.has(t) ? 4 : 0) + (guide.likes?.includes(t) ? 1.5 : 0) - (t === last ? 3 : 0) + Math.random(),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.t ?? 'walk';
}

// 今いる場所から近い順につなぐ
function route(n) {
  const left = [...ctx.statues];
  const out = [];
  let from = null;
  while (left.length && out.length < n) {
    left.sort((a, b) => (from ? 0 : ctx.distTo(a.id) - ctx.distTo(b.id)));
    // 2つ目からは、1つ前の像に近い順
    if (from) left.sort((a, b) => Math.hypot(a.n - from.n, a.e - from.e) - Math.hypot(b.n - from.n, b.e - from.e));
    from = left.shift();
    out.push(from.id);
  }
  return out;
}

const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

export function makeQuest(guide) {
  const type = chooseType(guide);
  const pace = paceOf();
  const party = progress.get().party;
  const q = { id: `${guide.id}-${type}-${Date.now().toString(36)}`, type, guide: guide.id };
  let target;
  switch (type) {
    case 'visit':
      target = pick(targets()).id;
      Object.assign(q, { target, points: Math.round(50 * pace.scale), title: `${nameOf(target)}に会いに行く` });
      q.body = `${nameOf(target)}まで行ってみよう。`;
      break;
    case 'tour':
      q.targets = route(pace.tour);
      Object.assign(q, { points: 30 * q.targets.length, title: `恵比寿さんを${q.targets.length}体、順にめぐる` });
      q.body = `${q.targets.map(nameOf).join(' → ')} の順にお参りしよう。順番を飛ばすと数えられない。`;
      break;
    case 'timed': {
      target = pick(targets()).id;
      // 道のりは直線の 1.3 倍とみて、好みの歩く速さで着ける時間 ＋ 2分
      const min = Math.max(3, Math.ceil((ctx.distTo(target) * 1.3) / pace.speed / 60) + 2);
      Object.assign(q, { target, limitMin: min, points: Math.round(90 * pace.scale), title: `${min}分以内に${nameOf(target)}へ` });
      q.body = `受けてから${min}分以内に${nameOf(target)}に着こう。過ぎたら失敗（ポイントは減らない）。`;
      break;
    }
    case 'escort': {
      target = pick(targets()).id;
      const sage = party.includes(guide.gift) ? guide.gift : (party[0] ?? guide.gift);
      q.sage = sage;
      const sageName = ctx.sages.find((s) => s.id === sage)?.name ?? sage;
      Object.assign(q, { target, points: Math.round(70 * pace.scale), title: `${sageName}を${nameOf(target)}に案内する` });
      q.body = `${sageName}をパーティーに入れたまま、${nameOf(target)}まで連れて行こう。`;
      break;
    }
    case 'walk':
      Object.assign(q, { meters: pace.walkM, points: Math.round(pace.walkM / 10), title: `${pace.walkM}m 歩く` });
      q.body = `受けてから${pace.walkM}m 歩こう。道はどこでもいい。`;
      break;
    case 'answer': {
      const st = pick(targets((s) => s.quiz));
      target = st.id;
      Object.assign(q, { target, quiz: st.quiz, points: Math.round(60 * pace.scale), title: `${st.name}をよく見て答える` });
      q.body = `${st.name}の前まで行くと、問題が出る。${st.quiz.checkOnSite ? '像をよく見て答えよう。' : ''}間違えたら、もう一度着いたときに答え直せる。`;
      break;
    }
    default:
  }
  const sageName = ctx.sages.find((s) => s.id === q.sage)?.name ?? '';
  const line = guide.lines?.[type];
  if (line) q.body = `「${fill(line, { target: nameOf(target ?? q.targets?.[0]), sage: sageName, meters: q.meters, min: q.limitMin })}」${q.body}`;
  return q;
}

// ---------- 画面下に出す、クエストの進み具合 ----------

export function questText(rec) {
  const q = rec.def;
  const far = (id) => `あと ${Math.round(ctx.distTo(id))}m`;
  switch (q.type) {
    case 'tour': {
      const next = q.targets[rec.step ?? 0];
      return `${q.title}（${rec.step ?? 0}/${q.targets.length}・次は${nameOf(next)} ${far(next)}）`;
    }
    case 'timed': {
      const left = Math.max(0, rec.deadline - Date.now());
      const mm = Math.floor(left / 60000);
      const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
      return `${q.title}（残り ${mm}:${ss}・${far(q.target)}）`;
    }
    case 'escort': {
      const ok = progress.get().party.includes(q.sage);
      return `${q.title}（${far(q.target)}${ok ? '' : '・パーティーにいない'}）`;
    }
    case 'walk': {
      const done = progress.get().walkM - (rec.startWalk ?? 0);
      return `${q.title}（あと ${Math.max(0, Math.round(q.meters - done))}m）`;
    }
    default:
      return `${q.title}（${far(q.target)}）`;
  }
}
