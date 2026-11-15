// 案内人との知恵くらべ（佐賀クイズ）
// count 問を出して need 問当てたら勝ち。勝てば +win pt、負けたら使えるポイントから −lose pt（累積は減らない）。
// 問題にゆかりのある七賢人がパーティーにいれば、1回の勝負につき1度だけヒント（間違いを2つ消す）をもらえる。

import * as progress from './progress.js';

const $ = (id) => document.getElementById(id);

const ctx = {
  quiz: null, // data/quiz.json
  sages: new Map(), // id → 七賢人
  onEnd: () => {},
};

let game = null; // { guide, questions, i, correct, hintUsed, answered }

export function initQuiz({ quiz, sages, onEnd }) {
  ctx.quiz = quiz;
  for (const s of sages) ctx.sages.set(s.id, s);
  ctx.onEnd = onEnd;
  $('quiz-next').addEventListener('click', next);
  $('quiz-hint').addEventListener('click', useHint);
  // Esc で閉じたら、その勝負は負け（途中でやめてもポイントは引く）
  $('quiz-dialog').addEventListener('cancel', (e) => {
    if (game && !game.over) { e.preventDefault(); toResult(true); }
  });
}

export const rule = () => ctx.quiz.rule;
export const challengeId = (guide) => `quiz-${guide.id}`;

// 勝負を始める
export function startQuiz(guide) {
  const { count } = ctx.quiz.rule;
  const pool = [...ctx.quiz.questions].sort(() => Math.random() - 0.5);
  game = { guide, questions: pool.slice(0, count), i: 0, correct: 0, hintUsed: false, answered: false, over: false };
  $('quiz-title').textContent = `${guide.name}との知恵くらべ`;
  render();
  $('quiz-dialog').showModal();
}

function render() {
  const { questions, i } = game;
  const q = questions[i];
  const { count, need } = ctx.quiz.rule;
  game.answered = false;
  $('quiz-count').textContent = `第${i + 1}問／${count}問（${need}問当てたら勝ち。いま ${game.correct}問正解）`;
  $('quiz-question').textContent = q.q;
  $('quiz-feedback').textContent = '';
  $('quiz-next').hidden = true;

  const box = $('quiz-choices');
  box.replaceChildren();
  q.choices.forEach((c, n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-secondary';
    b.textContent = c;
    b.dataset.n = String(n);
    b.addEventListener('click', () => answer(n));
    box.append(b);
  });
  box.firstElementChild?.focus();

  // ゆかりの七賢人がパーティーにいれば、ヒントのボタンを出す
  const helper = q.sage && progress.get().party.includes(q.sage) ? ctx.sages.get(q.sage) : null;
  const hint = $('quiz-hint');
  hint.hidden = !helper || game.hintUsed;
  if (helper) hint.textContent = `${helper.name}に聞く（間違いを2つ消す。1回だけ）`;
}

function useHint() {
  const q = game.questions[game.i];
  game.hintUsed = true;
  const wrong = [...$('quiz-choices').children].filter((b) => Number(b.dataset.n) !== q.answer);
  for (const b of wrong.sort(() => Math.random() - 0.5).slice(0, 2)) {
    b.disabled = true;
    b.classList.add('is-removed');
  }
  const helper = ctx.sages.get(q.sage);
  $('quiz-hint').hidden = true;
  $('quiz-feedback').textContent = `${helper.name}「これは分かる。残りの2つのどちらかだ」`;
  $('quiz-choices').querySelector('button:not(:disabled)')?.focus();
}

function answer(n) {
  if (game.answered) return;
  game.answered = true;
  const q = game.questions[game.i];
  const ok = n === q.answer;
  if (ok) game.correct++;
  for (const b of $('quiz-choices').children) {
    b.disabled = true;
    const m = Number(b.dataset.n);
    if (m === q.answer) b.classList.add('is-correct');
    else if (m === n) b.classList.add('is-wrong');
  }
  $('quiz-hint').hidden = true;
  $('quiz-feedback').textContent = `${ok ? '正解！' : `ざんねん。正解は「${q.choices[q.answer]}」。`}${q.note}`;
  const last = game.i === game.questions.length - 1;
  $('quiz-next').textContent = last ? '結果を見る' : '次へ';
  $('quiz-next').hidden = false;
  $('quiz-next').focus();
}

function next() {
  if (game.over) { $('quiz-dialog').close(); return; }
  if (game.i < game.questions.length - 1) { game.i++; render(); return; }
  toResult(false);
}

// 結果。quit = 途中でやめた
function toResult(quit) {
  const { win, lose, need } = ctx.quiz.rule;
  const won = !quit && game.correct >= need;
  game.over = true;
  const { guide } = game;
  let text;
  if (won) {
    progress.winChallenge(challengeId(guide), `${guide.name}との知恵くらべ`, win);
    text = `${game.correct}問正解で勝ち！ +${win}pt。${guide.name}「よう知っとるねえ。たいしたもんたい」`;
  } else {
    const taken = progress.takePoints(lose, `${guide.name}との知恵くらべに負けた`);
    text = `${quit ? '途中でやめたので負け。' : `${game.correct}問正解で負け。`}`
      + `使えるポイントから −${taken}pt。${guide.name}「また勉強してから来んしゃい」`;
  }
  $('quiz-count').textContent = '結果';
  $('quiz-question').textContent = '';
  $('quiz-choices').replaceChildren();
  $('quiz-hint').hidden = true;
  $('quiz-feedback').textContent = text;
  $('quiz-next').textContent = '閉じる';
  $('quiz-next').hidden = false;
  $('quiz-next').focus();
  ctx.onEnd(won);
}
