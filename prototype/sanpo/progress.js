// 集めたもの・ポイント・クエストの記録（デモ版）
// 記録はこの端末のブラウザ（localStorage）にだけ保存する。書き換えられるので、本番では Worker + D1 に置く。
// localStorage が使えない環境（プライベートモードなど）でも動くよう、読み書きの失敗は無視してメモリに持つ。

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

const empty = () => ({
  collected: {}, // { 'ebisu:mojitai': 日時, 'sage:naomasa': 日時, ... }
  guides: {}, // { yanagimachi: 日時 }
  quests: {}, // { 'q-mojitai': { status: 'active' | 'done', at } }
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

function addPoints(points, text) {
  data.balance += points;
  data.total += points;
  data.log.unshift({ at: new Date().toISOString(), text, points });
  data.log = data.log.slice(0, 50);
}

export const get = () => data;
export const has = (key) => Boolean(data.collected[key]);
export const collectedCount = () => Object.keys(data.collected).length;
export const questsDone = () => Object.values(data.quests).filter((q) => q.status === 'done').length;

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
export function meetGuide(guide) {
  const first = !data.guides[guide.id];
  if (first) {
    data.guides[guide.id] = new Date().toISOString();
    addPoints(POINTS.guide, `${guide.name}から話を聞いた`);
  }
  if (guide.quest && !data.quests[guide.quest.id]) {
    data.quests[guide.quest.id] = { status: 'active', at: new Date().toISOString() };
  }
  save();
  return first;
}

export function activeQuests() {
  return Object.entries(data.quests).filter(([, q]) => q.status === 'active').map(([id]) => id);
}

export function completeQuest(quest) {
  const q = data.quests[quest.id];
  if (!q || q.status === 'done') return false;
  q.status = 'done';
  q.doneAt = new Date().toISOString();
  addPoints(quest.points, `クエスト「${quest.title}」を達成`);
  save();
  return true;
}

// デモの見せ直し用：記録を消す
export function reset() {
  data = empty();
  save();
}
