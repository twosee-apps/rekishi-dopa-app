// 問題データの形式検査。エラーメッセージの配列を返す（空なら OK）

const CHECK_VALUES = ['定説', '要確認'];
const IMPORTANCE_VALUES = ['A', 'B', 'C']; // 出題頻度の重要度（8回目。docs/IMPORTANCE.md）

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// 資料（20回目②）：4択の問題に付ける資料。kind は
//   text（史料の文章を作成者が短く現代語にしたもの。lines に1行ずつ）
//   table（作成者が作った表・年表。head と rows）
//   image（作成者が作った図。app/ の中の画像 src と、何が描いてあるかの alt）
// どれも出典・作り方の credit が必要。外の URL は使わない（CSP と、外部に通信しない約束）
export const FIGURE_KINDS = ['text', 'table', 'image'];
export function validateFigure(f, e, opts = {}) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return e('figure がオブジェクトではない');
  if (!FIGURE_KINDS.includes(f.kind)) return e(`figure.kind は ${FIGURE_KINDS.join(' / ')} のどれか`);
  if (!nonEmptyString(f.title)) e('figure.title がない');
  else if (f.title.length > 40) e('figure.title が長すぎる（40字まで）');
  if (!nonEmptyString(f.credit)) e('figure.credit（出典・作り方）がない');
  else if (f.credit.length > 120) e('figure.credit が長すぎる（120字まで）');
  if (f.kind === 'text') {
    if (!Array.isArray(f.lines) || f.lines.length < 1 || f.lines.length > 6) e('figure.lines は1〜6行');
    else if (!f.lines.every((l) => nonEmptyString(l) && l.length <= 90)) e('figure.lines に空の行か、90字をこえる行がある');
  } else if (f.kind === 'table') {
    if (!Array.isArray(f.head) || f.head.length < 2 || f.head.length > 4) e('figure.head は2〜4列');
    else if (!f.head.every((h) => typeof h === 'string')) e('figure.head は文字列');
    if (!Array.isArray(f.rows) || f.rows.length < 2 || f.rows.length > 6) e('figure.rows は2〜6行');
    else {
      f.rows.forEach((r, i) => {
        if (!Array.isArray(r) || !Array.isArray(f.head) || r.length !== f.head.length) e(`figure.rows[${i}] の列の数が head とちがう`);
        else if (!r.every((c) => nonEmptyString(c) && c.length <= 40)) e(`figure.rows[${i}] に空の欄か、40字をこえる欄がある`);
      });
    }
  } else if (f.kind === 'image') {
    // app/ からの相対パスだけ（絶対パス・外の URL・上の階層は不可。サブパスで動かすため）
    if (!nonEmptyString(f.src) || !/^img\/[a-z0-9-]+\.(svg|webp|png)$/.test(f.src)) e('figure.src は img/英小文字・数字・-.svg|webp|png');
    else if (opts.fileExists && !opts.fileExists(f.src)) e(`figure.src のファイルがない: ${f.src}`);
    if (!nonEmptyString(f.alt) || f.alt.length < 20) e('figure.alt（何が描いてあるか）は20字以上');
  }
}

export function validateQuestion(q, opts = {}) {
  const errs = [];
  const id = q && q.id ? q.id : '(id なし)';
  const e = (msg) => errs.push(`${id}: ${msg}`);
  if (!q || typeof q !== 'object') return ['問題がオブジェクトではない'];
  if (!nonEmptyString(q.id)) e('id がない');
  if (!nonEmptyString(q.prompt)) e('prompt がない');
  if (!nonEmptyString(q.explanation)) e('explanation がない');
  // 12回目：まちがえたときに読まれやすいよう、解説は60字まで（「超簡単な説明」）
  else if (q.explanation.length > 60) e('explanation が長すぎる（60字まで）');
  if (!CHECK_VALUES.includes(q.check)) e(`check は ${CHECK_VALUES.join(' / ')} のどちらか`);
  if (!IMPORTANCE_VALUES.includes(q.importance)) e(`importance は ${IMPORTANCE_VALUES.join(' / ')} のどれか`);

  if (q.type === 'choice') {
    if (!Array.isArray(q.choices) || q.choices.length !== 4) e('choices は4つ');
    else {
      if (!q.choices.every(nonEmptyString)) e('choices に空の要素がある');
      if (new Set(q.choices).size !== 4) e('choices が重複している');
    }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) e('answer は 0〜3 の整数');
    if (q.figure !== undefined) validateFigure(q.figure, e, opts);
  } else if (q.type === 'order') {
    if (!Array.isArray(q.items) || q.items.length < 3 || q.items.length > 4) e('items は3〜4個');
    else {
      q.items.forEach((it, i) => {
        if (!it || !nonEmptyString(it.text)) e(`items[${i}].text がない`);
        if (!it || !Number.isInteger(it.year)) e(`items[${i}].year が整数でない`);
        if (i > 0 && it && q.items[i - 1] && !(it.year > q.items[i - 1].year)) {
          e(`items[${i}] の年が前より新しくない（古い順・同じ年は不可）`);
        }
      });
      if (new Set(q.items.map((it) => it && it.text)).size !== q.items.length) e('items の text が重複');
    }
  } else if (q.type === 'match') {
    if (!Array.isArray(q.pairs) || q.pairs.length < 3 || q.pairs.length > 4) e('pairs は3〜4組');
    else {
      q.pairs.forEach((p, i) => {
        if (!p || !nonEmptyString(p.left) || !nonEmptyString(p.right)) e(`pairs[${i}] に空の欄`);
      });
      if (new Set(q.pairs.map((p) => p && p.left)).size !== q.pairs.length) e('pairs の left が重複');
      if (new Set(q.pairs.map((p) => p && p.right)).size !== q.pairs.length) e('pairs の right が重複');
    }
  } else if (q.type === 'reason') {
    // 理由・目的を考える問い（10回目）。自動採点はせず、模範解答と要点を見て本人が自己採点する
    if (!nonEmptyString(q.answerText)) e('answerText（模範解答）がない');
    else if (q.answerText.length > 80) e('answerText が長すぎる（80字まで）');
    if (!Array.isArray(q.points) || q.points.length < 1 || q.points.length > 3) e('points（要点）は1〜3個');
    else {
      if (!q.points.every(nonEmptyString)) e('points に空の要素がある');
      if (new Set(q.points).size !== q.points.length) e('points が重複している');
    }
  } else {
    e(`type が不明: ${q.type}`);
  }
  if (q.figure !== undefined && q.type !== 'choice') e('figure（資料）は4択（choice）にだけ付けられる');
  return errs;
}

// opts.fileExists(src)：資料の画像が app/ の中にあるか（テストで使う。ブラウザでは確かめない）
export function validateUnit(data, opts = {}) {
  const errs = [];
  if (!data || typeof data !== 'object') return ['データがオブジェクトではない'];
  if (!nonEmptyString(data.unit)) errs.push('unit がない');
  if (!nonEmptyString(data.title)) errs.push('title がない');
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    errs.push('questions がない');
    return errs;
  }
  const seen = new Set();
  for (const q of data.questions) {
    errs.push(...validateQuestion(q, opts));
    if (q && q.id) {
      if (seen.has(q.id)) errs.push(`${q.id}: id が重複`);
      seen.add(q.id);
    }
  }
  return errs;
}
