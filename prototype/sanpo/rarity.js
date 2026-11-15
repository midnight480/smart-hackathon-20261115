// レア度（N・R・SR・SSR）。七賢人とえびす像に、デモ用に勝手に付けたもの（data/characters.json の grade）
// spawn：歩いていて出会う出やすさ／points：出会った・着いたときのポイント。ガチャの演出は gacha-fx.js の FX

export const GRADES = {
  N: { name: 'ノーマル', spawn: 4, sagePoints: 20, statuePoints: 10 },
  R: { name: 'レア', spawn: 3, sagePoints: 30, statuePoints: 15 },
  SR: { name: 'スーパーレア', spawn: 2, sagePoints: 40, statuePoints: 20 },
  SSR: { name: 'スーパースペシャルレア', spawn: 1, sagePoints: 60, statuePoints: 30 },
};

export const ORDER = ['SSR', 'SR', 'R', 'N'];
export const gradeOf = (g) => GRADES[g] ?? GRADES.N;
// SR 以上は「レア枠」（イベントで出やすくなる）
export const isHigh = (g) => g === 'SR' || g === 'SSR';
