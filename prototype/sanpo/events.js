// 期間限定のブースト（十日恵比須大祭など）。data/events.json の期間中は、
// 歩いたり話したりして貯まるポイントを pointsMultiplier 倍に、ガチャのレアを rareMultiplier 倍に出やすくする。
// 確かめ用：URL に ?date=2027-01-09 を付けると、その日として扱う。

let events = [];

// 日本時間の「YYYY-MM-DD」
function today() {
  const forced = new URLSearchParams(location.search).get('date');
  if (forced && /^\d{4}-\d{2}-\d{2}$/.test(forced)) return forced;
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function initEvents(data) {
  events = data.events ?? [];
}

// いま開催中のイベント（なければ null）
export function currentEvent() {
  const d = today();
  return events.find((e) => e.start <= d && d <= e.end) ?? null;
}

export const pointsMultiplier = () => currentEvent()?.pointsMultiplier ?? 1;
export const rareMultiplier = () => currentEvent()?.rareMultiplier ?? 1;
