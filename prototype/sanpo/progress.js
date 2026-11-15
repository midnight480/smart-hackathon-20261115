// 集めたもの・ポイント・クエストの記録（デモ版）
// 記録はこの端末のブラウザ（localStorage）にだけ保存する。書き換えられるので、本番では Worker + D1 に置く。
// localStorage が使えない環境（プライベートモードなど）でも動くよう、読み書きの失敗は無視してメモリに持つ。

import { pointsMultiplier, currentEvent } from './events.js';

const KEY = 'ebisu-walk-progress-v1';

// ポイントの配り方
export const POINTS = {
  ebisu: 10, // えびす像に着いた
  sage: 30, // 七賢人に出会った
  sageRare: 50, // すごくレアな七賢人
  guide: 20, // 案内人から話を聞いた
};

// 累積ポイントの段位（使っても累積は減らない）
export const RANKS = [
  { min: 0, name: 'えびす見習い' },
  { min: 100, name: 'えびす通' },
  { min: 300, name: 'えびす名人' },
];

// パーティーに入れる人数
export const PARTY_MAX = 3;

const empty = () => ({
  collected: {}, // { 'ebisu:mojitai': 日時, 'sage:naomasa': 日時, ... }
  guides: {}, // { yanagimachi: 日時 }
  quests: {}, // { 'q-mojitai': { status: 'active' | 'done', at } }
  walkM: 0, // これまでに歩いた距離（m）
  gacha: { draws: 0, spentYen: 0 }, // ガチャを回した回数と、払った金額（デモ）
  laps: {}, // 弾ごとの周回 { ch1: { lap: 1, got: { houtomi: 日時 }, start: 日時, clears: [{ lap, ms, at }] } }
  party: [], // パーティーにいる七賢人の ID（新しい順、最大 PARTY_MAX 人）
  balance: 0, // 使えるポイント
  total: 0, // 累積ポイント
  log: [], // [{ at, text, points }]
});

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* 保存できなくても続ける */ }
}

// 歩いたり話したりして貯まるポイント。イベント期間中は倍になる（boost: false なら倍にしない）。足した分を返す
function addPoints(points, text, { boost = true } = {}) {
  const m = boost ? pointsMultiplier() : 1;
  const got = points * m;
  data.balance += got;
  data.total += got;
  log(m > 1 ? `${text}（${currentEvent().name} ${m}倍）` : text, got);
  return got;
}

function log(text, points) {
  data.log.unshift({ at: new Date().toISOString(), text, points });
  data.log = data.log.slice(0, 50);
}

// 使えるポイントを減らす（累積は減らさない）。残高より多くは引かない。実際に引いた分を返す
export function takePoints(points, text) {
  const taken = Math.min(points, data.balance);
  data.balance -= taken;
  log(text, -taken);
  save();
  return taken;
}

// 七賢人をパーティーに入れる（すでにいれば先頭へ）。あふれた人は抜ける
export function joinParty(id) {
  const before = [...data.party];
  data.party = [id, ...data.party.filter((p) => p !== id)].slice(0, PARTY_MAX);
  save();
  return before.find((p) => !data.party.includes(p)) ?? null; // 抜けた人
}

// 知恵くらべに勝った（クエスト達成として数える）
export function winChallenge(id, title, points) {
  if (data.quests[id]?.status === 'done') return false;
  data.quests[id] = { status: 'done', at: new Date().toISOString(), doneAt: new Date().toISOString() };
  addPoints(points, `${title}に勝った`);
  save();
  return true;
}

export const challengeWon = (id) => data.quests[id]?.status === 'done';

// ---------- 弾（エリア）と周回 ----------

const lapOf = (chId) => {
  data.laps[chId] ??= { lap: 1, got: {}, start: null, walkM: 0, clears: [] };
  return data.laps[chId];
};

// 日本時間の日付（「1日1回まで」の判定に使う）
const jstDay = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 歩いた距離を足す。計測中の周回にも足す
export function addWalk(m) {
  data.walkM += m;
  for (const l of Object.values(data.laps)) if (l.start) l.walkM = (l.walkM ?? 0) + m;
  save();
}

export const lapInfo = (chId) => lapOf(chId);
export const clearCount = (chId) => lapOf(chId).clears.length;
export const bestMs = (chId) => {
  const c = lapOf(chId).clears;
  return c.length ? Math.min(...c.map((x) => x.ms)) : null;
};
// 開いている弾：最初の弾と、前の弾を一度コンプリートした弾
export function unlocked(chapters, i) {
  return i === 0 || clearCount(chapters[i - 1].id) > 0;
}

// この周回で像に着いた。最初の像に着いた時刻から計り始め、全部そろったらコンプリート。
// 返すもの：null（もう着いていた）／{ cleared: false }／{ cleared: true, lap, ms, points }
export function lapArrive(chapter, statueId) {
  const l = lapOf(chapter.id);
  if (l.got[statueId]) return null;
  const now = Date.now();
  l.got[statueId] = now;
  l.start ??= now;
  if (!chapter.statues.every((id) => l.got[id])) { save(); return { cleared: false }; }
  const ms = now - l.start;
  const walkM = Math.round(l.walkM ?? 0);
  const first = l.clears.length === 0;
  // 周回のポイントは 1日1回まで（同じ日に何周しても、2回目からはタイムと距離だけ残る）
  const today = jstDay(now);
  const lapToday = l.clears.some((c) => jstDay(Date.parse(c.at)) === today && c.points > 0 && !c.first);
  const points = first ? chapter.clearPoints : (lapToday ? 0 : chapter.lapPoints);
  l.clears.push({ lap: l.lap, ms, walkM, points, first, at: new Date(now).toISOString() });
  if (points) addPoints(points, `${chapter.title}を${first ? 'コンプリート' : `${l.lap}周目でコンプリート`}`);
  const result = { cleared: true, lap: l.lap, ms, walkM, points, first, capped: !first && lapToday };
  // 次の周回へ
  l.lap += 1;
  l.got = {};
  l.start = null;
  l.walkM = 0;
  save();
  return result;
}

// ---------- ガチャ（デモ決済） ----------

export const gachaInfo = () => { data.gacha ??= { draws: 0, spentYen: 0 }; return data.gacha; };

// 払った金額と同じだけ、お店で使えるポイントを足す。
// 累積（段位・ランキング）には入れない。お金で順位が上がらないようにする
export function buyGacha(yen) {
  const g = gachaInfo();
  g.draws += 1;
  g.spentYen += yen;
  data.balance += yen;
  log(`ガチャ ${g.draws}回目（¥${yen} デモ決済。累積には入らない）`, yen);
  save();
}

// 記念撮影をした。はじめてなら true
export function addSelfie() {
  data.selfies = (data.selfies ?? 0) + 1;
  save();
  return data.selfies === 1;
}

export function bonus(points, text) {
  addPoints(points, text);
  save();
}

export const get = () => data;
export const has = (key) => Boolean(data.collected[key]);
export const collectedCount = () => Object.keys(data.collected).length;
// クエストを達成した回数（同じクエストをやり直して達成した分も数える）
export const questsDone = () => Object.values(data.quests)
  .reduce((a, q) => a + (q.doneCount ?? (q.status === 'done' ? 1 : 0)), 0);

export function rankOf(total) {
  let rank = RANKS[0];
  for (const r of RANKS) if (total >= r.min) rank = r;
  const next = RANKS.find((r) => r.min > total);
  return { ...rank, next };
}

// 図鑑に載せる。初めてならポイントを足して true を返す
export function collect(key, label, points) {
  if (data.collected[key]) return false;
  data.collected[key] = new Date().toISOString();
  addPoints(points, `${label}を図鑑に登録`);
  save();
  return true;
}

// 案内人から話を聞いた。初めてならポイントを足し、クエストを受ける
// 案内人から話を聞く。make(guide) で、好みに合わせたクエストを1つ作って受ける。
// この案内人のクエストを受けている途中なら、新しくは作らず、それを返す。
export function meetGuide(guide, make) {
  const first = !data.guides[guide.id];
  if (first) {
    data.guides[guide.id] = new Date().toISOString();
    addPoints(POINTS.guide, `${guide.name}から話を聞いた`);
  }
  let rec = Object.values(data.quests).find((q) => q.status === 'active' && q.def?.guide === guide.id);
  if (!rec) {
    const def = make(guide);
    rec = {
      status: 'active',
      at: new Date().toISOString(),
      def,
      step: 0, // tour：いくつ目まで回ったか
      startWalk: data.walkM, // walk：受けたときの歩いた距離
      deadline: def.limitMin ? Date.now() + def.limitMin * 60 * 1000 : null, // timed
    };
    data.quests[def.id] = rec;
  }
  save();
  return { first, quest: rec.def };
}

// この案内人が前に出した種類（続けて同じ種類にしないため）
export function lastQuestType(guideId) {
  const list = Object.values(data.quests).filter((q) => q.def?.guide === guideId);
  return list.sort((a, b) => (a.at < b.at ? 1 : -1))[0]?.def.type ?? null;
}

// 参加する人の好み { likes: ['history', ...], pace: 'normal' }。まだなら null
export const prefs = () => data.prefs ?? null;
export function setPrefs(p) {
  data.prefs = p;
  save();
}

export const questState = (id) => data.quests[id] ?? null;

// tour を1つ進める
export function advanceQuest(id) {
  const q = data.quests[id];
  if (!q) return;
  q.step = (q.step ?? 0) + 1;
  save();
}

// timed の時間切れなど。ポイントは減らさない
export function failQuest(id) {
  const q = data.quests[id];
  if (!q || q.status !== 'active') return false;
  q.status = 'failed';
  save();
  return true;
}

// 受けている途中のクエスト [{ status, def, step, startWalk, deadline }]
export function activeQuests() {
  return Object.values(data.quests).filter((q) => q.status === 'active' && q.def);
}

export function completeQuest(quest) {
  const q = data.quests[quest.id];
  if (!q || q.status === 'done') return false;
  q.status = 'done';
  q.doneAt = new Date().toISOString();
  q.doneCount = (q.doneCount ?? 0) + 1;
  addPoints(quest.points, `クエスト「${quest.title}」を達成`);
  save();
  return true;
}

// デモの見せ直し用：記録を消す
export function reset() {
  data = empty();
  save();
}
