// ゲームの中核ロジック（DOM に依存しない純粋関数。tests/ から直接テストする）

// 1周の問題数（20回目に20問から5問へ。持ち主「1周が長い」）
export const SESSION_LENGTH = 5;

// 盛り上がりの段階。min = その段階に入るのに必要な正解数の累計
// 20回目：5問で8つの段階を進むため、しきい値は同じ数を2回まで使う（1問の正解で段階が2つ上がることがある）。
// 祭りは 20問のころと同じ正解率（ふつう 16/20＝80% → 4/5）
export const STAGES = [
  { min: 0, name: 'しずか', bpm: 100 },
  { min: 1, name: 'ひとつ灯る', bpm: 100 },
  { min: 2, name: 'ざわざわ', bpm: 100 },
  { min: 2, name: 'ノってきた', bpm: 100 },
  { min: 3, name: '提灯ともる', bpm: 100 },
  { min: 3, name: '太鼓どーん', bpm: 112 },
  { min: 4, name: '大にぎわい', bpm: 122 },
  { min: 4, name: '大江戸祭り', bpm: 132 },
];
export const MAX_STAGE = STAGES.length - 1;

// 難易度ごとの段階のしきい値（祭りまでの距離）。normal は STAGES の min と同じ。
// 20回目：かんたん 3問・ふつう 4問・むずかしい 5問（全問正解）の正解で祭り
export const STAGE_MINS = {
  easy: [0, 1, 1, 2, 2, 3, 3, 3],
  normal: STAGES.map((s) => s.min),
  hard: [0, 1, 2, 3, 3, 4, 4, 5],
};

export function stageFor(correct, difficulty = 'normal') {
  const mins = STAGE_MINS[difficulty] || STAGE_MINS.normal;
  let s = 0;
  for (let i = 0; i < mins.length; i++) {
    if (correct >= mins[i]) s = i;
  }
  return s;
}

// 次の段階までの進み具合（0〜1）。最終段階では 1
export function stageProgress(correct, difficulty = 'normal') {
  const mins = STAGE_MINS[difficulty] || STAGE_MINS.normal;
  const s = stageFor(correct, difficulty);
  if (s === MAX_STAGE) return 1;
  const lo = mins[s];
  const hi = mins[s + 1];
  return (correct - lo) / (hi - lo);
}

export function scoreFor(stage, combo) {
  return 100 + stage * 20 + Math.min(combo, 10) * 10;
}

// ---- 採点 ----

export function gradeChoice(q, selectedIndex) {
  return selectedIndex === q.answer;
}

// order: 並べた順の item テキスト配列
export function gradeOrder(q, orderedTexts) {
  if (!Array.isArray(orderedTexts) || orderedTexts.length !== q.items.length) return false;
  return q.items.every((it, i) => it.text === orderedTexts[i]);
}

// match: { 左の文字列: 右の文字列 }
export function gradeMatch(q, mapping) {
  if (!mapping) return false;
  return q.pairs.every((p) => mapping[p.left] === p.right);
}

// 並べ替え：枠ごとの正誤（true＝その位置が正しい）
export function orderMarks(q, orderedTexts) {
  return q.items.map((it, i) => Array.isArray(orderedTexts) && orderedTexts[i] === it.text);
}

// 組み合わせ：行（pairs の順）ごとの正誤
export function matchMarks(q, mapping) {
  return q.pairs.map((p) => !!mapping && mapping[p.left] === p.right);
}

export function grade(q, response) {
  switch (q.type) {
    case 'choice': return gradeChoice(q, response);
    case 'order': return gradeOrder(q, response);
    case 'match': return gradeMatch(q, response);
    case 'reason': return response === 'done'; // 自己採点の「できた」だけを正解として数える
    default: return false;
  }
}

// 理由・目的の問いの自己採点（10回目）。'done' できた／'close' おしい／'notyet' まだ
export const SELF_CHECKS = [
  { value: 'done', label: 'できた' },
  { value: 'close', label: 'おしい' },
  { value: 'notyet', label: 'まだ' },
];

// ---- 進行状態 ----

export function newRun() {
  return { correct: 0, answered: 0, combo: 0, maxCombo: 0, score: 0, stage: 0 };
}

// 1問の結果を反映した新しい状態と、得点・段階変化を返す（まちがえても段階は下がらない）
export function applyAnswer(run, isCorrect, difficulty = 'normal') {
  const next = { ...run, answered: run.answered + 1 };
  let gained = 0;
  if (isCorrect) {
    next.correct = run.correct + 1;
    next.combo = run.combo + 1;
    next.maxCombo = Math.max(run.maxCombo, next.combo);
    next.stage = stageFor(next.correct, difficulty);
    gained = scoreFor(next.stage, next.combo);
    next.score = run.score + gained;
  } else {
    next.combo = 0;
  }
  return { run: next, gained, stageUp: next.stage > run.stage };
}

// 理由・目的の問いの自己採点を反映する（10回目）。
// できた＝正解と同じ（得点・コンボ・段階が進む）、まだ＝不正解と同じ（コンボが切れる）、
// おしい＝正解には数えないが、コンボは切らない（正直に「おしい」を選んでも損をしすぎないように）
export function applySelfCheck(run, value, difficulty = 'normal') {
  if (value === 'close') return { run: { ...run, answered: run.answered + 1 }, gained: 0, stageUp: false };
  return applyAnswer(run, value === 'done', difficulty);
}

// ---- 乱数・出題 ----

// 再現可能な乱数（テスト用）。seed は整数
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 並べ替え用のシャッフル。正解順のままにならないようにする
export function shuffleNotIdentity(arr, rng = Math.random) {
  if (arr.length < 2) return arr.slice();
  for (let k = 0; k < 20; k++) {
    const a = shuffle(arr, rng);
    if (a.some((x, i) => x !== arr[i])) return a;
  }
  return arr.slice(1).concat(arr[0]);
}

// 出題リストを作る。同じ形式が3問以上続かないよう軽く並べ直す
export function buildSession(questions, n = SESSION_LENGTH, rng = Math.random) {
  const picked = shuffle(questions, rng).slice(0, Math.min(n, questions.length));
  for (let i = 2; i < picked.length; i++) {
    if (picked[i].type === picked[i - 1].type && picked[i].type === picked[i - 2].type) {
      const j = picked.findIndex((q, k) => k > i && q.type !== picked[i].type);
      if (j !== -1) [picked[i], picked[j]] = [picked[j], picked[i]];
    }
  }
  return placeReasonsAfterAnswers(placeFiguresLast(picked));
}

// 資料つきの問題（20回目②）は、その回のほかの問題のあとに出す。
// 資料（年表・表・史料）には、ほかの問題の答え（人物・年・できごと）が書いてあることが多いので、先に見せないため
function placeFiguresLast(list) {
  return list.filter((q) => !q.figure).concat(list.filter((q) => q.figure));
}

// 理由・目的の問いの問題文が、4択の正解の語を言ってしまう組（例：「徴兵令を出した目的」と「…法令は？」の答え「徴兵令」）。
// 答えの語の全体、かっこを除いた部分、「・」やかっこで区切った2文字以上の部分のどれかが問題文にあれば「言ってしまう」とみなす
export function revealsAnswer(reasonQ, choiceQ) {
  if (reasonQ.type !== 'reason' || choiceQ.type !== 'choice') return false;
  const a = choiceQ.choices[choiceQ.answer];
  const parts = [a, a.replace(/[（(].*?[）)]/g, ''), ...a.split(/[（）()・]/)].filter((x) => x.length >= 2);
  return parts.some((x) => reasonQ.prompt.includes(x));
}

// 同じ回に両方が出るときは、理由・目的の問いを、答えを言ってしまう4択のあとに回す（11回目）。
// 「何か」を答えてから「なぜか」を考える順になり、4択の答えが先に見えてしまうこともない
function placeReasonsAfterAnswers(list) {
  const out = list.slice();
  for (const r of list.filter((q) => q.type === 'reason')) {
    const i = out.indexOf(r);
    let last = -1;
    out.forEach((c, k) => { if (k > i && revealsAnswer(r, c)) last = k; });
    if (last === -1) continue;
    out.splice(i, 1);
    out.splice(last, 0, r); // 取り除いたぶん1つ前にずれるので、last の位置＝その4択のすぐあと
  }
  return out;
}

// にがて問題の出題リスト。記録に残っている id の問題だけから作る（データから消えた id は無視）
export function buildReviewSession(questions, weakIds, n = SESSION_LENGTH, rng = Math.random) {
  const ids = new Set(weakIds || []);
  return buildSession(questions.filter((q) => ids.has(q.id)), n, rng);
}

// ---- 演出の判定（5回目） ----

// ハッピーの表情。答えた直後と、つぎの問題を待つとき（answered=false）
export function moodFor({ answered = true, correct = false, combo = 0, stage = 0 } = {}) {
  if (!answered) return stage >= MAX_STAGE ? 'festival' : 'normal';
  if (!correct) return 'oops';
  if (stage >= MAX_STAGE) return 'festival';
  return combo >= 3 ? 'combo' : 'happy';
}

// コンボの見た目の段階（0＝出さない、1〜4 でだんだん派手に）。
// 20回目：1周5問なので 2・3・4・5コンボ（5＝1周ぜんぶ正解）で1段ずつ上がる（20問のころは 2・5・10・15）
export function comboTier(combo) {
  if (combo >= 5) return 4;
  if (combo >= 4) return 3;
  if (combo >= 3) return 2;
  if (combo >= 2) return 1;
  return 0;
}

// コンボの節目で出す大きな文字（節目でなければ null）。20回目：2・3・4・5コンボ（20問のころは 3・5・10・15・20）
const COMBO_SHOUTS = { 2: 'いいね！', 3: 'すごい！', 4: '天才！', 5: 'パーフェクト！' };
export function comboShout(combo) {
  return COMBO_SHOUTS[combo] || null;
}

// 結果のランク。正解率で決める（全問正解だけが S）
export function rankFor(correct, total) {
  if (!total) return 'C';
  if (correct === total) return 'S';
  const r = correct / total;
  if (r >= 0.8) return 'A';
  if (r >= 0.6) return 'B';
  return 'C';
}

// ---- 難易度（7回目） ----

export const DIFFICULTIES = {
  easy: { name: 'かんたん', note: '3択・ヒントあり・4択が多め・祭りに届きやすい', choices: 3, hint: true,
    mix: { choice: 0.65, order: 0.15, match: 0.15, reason: 0.05 }, timeBonus: false },
  normal: { name: 'ふつう', note: '4択・いろいろな形式', choices: 4, hint: false, mix: null, timeBonus: false },
  // むずかしい（15回目に変更）：形式の数を先に決める割合（mix）をやめ、形式の重み（typeWeight）で選ぶ。
  // 割合で決めると、組み合わせ（単元に5〜6問）が毎回ぜんぶ出てしまい、重要度の順も逆転したため
  hard: { name: 'むずかしい', note: '並べ替え・組み合わせ・理由を考える問いが多め・早く答えるとタイムボーナス', choices: 4, hint: false,
    mix: null, typeWeight: { choice: 1, order: 1.8, match: 1.8, reason: 1.8 }, timeBonus: true },
};

// 出題頻度の重要度（9回目に「1問ごとの重み」に変更）。A の問題ほど1問あたり出やすくする（docs/IMPORTANCE.md）
export const IMPORTANCE_WEIGHT = { A: 2, B: 1, C: 0.5 };

// 割合から n 問の目安の数を出す（合計がちょうど n になるよう、端数の大きい順に1ずつ足す）
// 端数は、端数の大きさに比例した確率でくじ引きして配る（10回目）。
// 端数の大きい順に配ると、問題の少ない形式（例：明治維新の理由・目的 1問＝20問中 0.5問ぶん。5問なら 0.13問ぶん）が
// いつも負けて一度も出なくなるため。平均すると形式の比率どおりになり、1回ごとのずれは ±1問まで
function quotas(share, n, rng = Math.random) {
  const raw = Object.entries(share).map(([k, w]) => [k, w * n]);
  const q = Object.fromEntries(raw.map(([k, v]) => [k, Math.floor(v)]));
  let left = n - Object.values(q).reduce((a, b) => a + b, 0);
  const frac = raw.map(([k, v]) => [k, v - Math.floor(v)]).filter(([, f]) => f > 1e-9);
  while (left > 0 && frac.length) {
    const sum = frac.reduce((a, [, f]) => a + f, 0);
    let r = rng() * sum;
    let i = 0;
    while (i < frac.length - 1 && r >= frac[i][1]) r -= frac[i++][1];
    q[frac[i][0]]++;
    frac.splice(i, 1);
    left--;
  }
  return q;
}

// 1問ごとの重みで、重複なしに n 問を選ぶ（Efraimidis–Spirakis：rng^(1/重み) の大きい順）。
// 形式の数は、mix（難易度の割合）があればそれに、なければ問題全体の形式の比率に合わせて先に決め、
// 各形式の中で重みの大きい順に取る。足りない形式は、ほかの問題から重みの大きい順に埋める
export function buildWeightedSession(questions, n = SESSION_LENGTH, mix = null, rng = Math.random, typeWeight = null) {
  const total = Math.min(n, questions.length);
  // typeWeight（15回目・むずかしい）：形式の数は先に決めず、1問ごとの重み＝重要度の重み×形式の重みで選ぶ。
  // 形式の重みを2未満にしておくと、どの形式でも A の問題＞B の問題＞C の問題 の順に出やすい（重みが逆転しない）
  const w = (q) => (IMPORTANCE_WEIGHT[q.importance] || 1) * (typeWeight ? typeWeight[q.type] || 1 : 1);
  const keyed = questions
    .map((q) => ({ q, key: rng() ** (1 / w(q)) }))
    .sort((a, b) => b.key - a.key);
  if (typeWeight) return buildSession(keyed.slice(0, total).map((k) => k.q), total, rng);
  let share = mix;
  if (!share) {
    share = {};
    for (const q of questions) share[q.type] = (share[q.type] || 0) + 1 / questions.length;
  }
  const want = quotas(share, total, rng);
  const picked = [];
  const rest = [];
  for (const k of keyed) {
    if ((want[k.q.type] || 0) > 0) {
      picked.push(k.q);
      want[k.q.type]--;
    } else rest.push(k.q);
  }
  while (picked.length < total && rest.length) picked.push(rest.shift());
  return buildSession(picked.slice(0, total), total, rng);
}

// かんたん：4択の誤答を1つ減らして3択にする（正解の位置 answer も付けかえる）
export function reduceChoices(q, rng = Math.random) {
  if (q.type !== 'choice' || q.choices.length <= 3) return q;
  const wrong = q.choices.map((_, i) => i).filter((i) => i !== q.answer);
  const drop = wrong[Math.floor(rng() * wrong.length)];
  const keep = q.choices.map((_, i) => i).filter((i) => i !== drop);
  return { ...q, choices: keep.map((i) => q.choices[i]), answer: keep.indexOf(q.answer) };
}

// リベンジ問題（16回目）：その回でまちがえた問題から、重要度の高い順（A→B→C。同じ重要度ならまちがえた順）に最大2問
// （20回目に3問から2問へ。1周5問なので、全部まちがえても7問で終わる）。同じ問題は1回だけ。全問正解なら空
export const REVENGE_MAX = 2;
export const REVENGE_POINTS = 100; // リベンジに成功した1問の点（ベスト記録の比較には入れない）
export function pickRevenge(wrong, max = REVENGE_MAX) {
  const rank = { A: 0, B: 1, C: 2 };
  const seen = new Set();
  const uniq = (wrong || []).filter((q) => q && !seen.has(q.id) && seen.add(q.id));
  return uniq
    .map((q, i) => ({ q, i }))
    .sort((a, b) => (rank[a.q.importance] ?? 1) - (rank[b.q.importance] ?? 1) || a.i - b.i)
    .slice(0, max)
    .map((x) => x.q);
}

// 難易度に合わせた1周ぶん（SESSION_LENGTH 問。main.js とテストで同じ選び方を使う）
export function sessionFor(questions, difficulty = 'normal', rng = Math.random, n = SESSION_LENGTH) {
  const d = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  return buildWeightedSession(questions, n, d.mix, rng, d.typeWeight || null);
}

// かんたんのヒント。問題データの中身だけから作る（新しい事実は足さない）
export function hintFor(q, rng = Math.random) {
  if (q.type === 'choice') {
    const wrong = q.choices.filter((_, i) => i !== q.answer);
    return `「${wrong[Math.floor(rng() * wrong.length)]}」は ちがうよ。`;
  }
  if (q.type === 'order') {
    const first = q.items[0];
    return `いちばん古いのは「${first.text}」（${first.year}年）だよ。`;
  }
  if (q.type === 'match') {
    const p = q.pairs[Math.floor(rng() * q.pairs.length)];
    return `「${p.left}」は「${p.right}」だよ。`;
  }
  if (q.type === 'reason') {
    const p = q.points[Math.floor(rng() * q.points.length)];
    return `要点の一つは「${p}」だよ。`;
  }
  return '';
}

// むずかしいのタイムボーナス。時間内なら 20〜100点（早いほど多い）。時間切れは 0 点（失敗にはしない）
// 理由・目的の問い（reason）は自己採点なので、時間制限もタイムボーナスもない
export const TIME_LIMIT_MS = { choice: 15000, order: 30000, match: 30000 };
export function timeBonus(type, elapsedMs) {
  const limit = TIME_LIMIT_MS[type];
  if (!limit || !(elapsedMs >= 0) || elapsedMs > limit) return 0;
  return 20 + Math.floor(80 * (1 - elapsedMs / limit));
}

// 記録のキー。ふつうは単元 id のまま（今までの記録を引きつぐ）、ほかは「単元:難易度」
export function recordKey(unitId, difficulty = 'normal') {
  return difficulty === 'normal' ? unitId : `${unitId}:${difficulty}`;
}
