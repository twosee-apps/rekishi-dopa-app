// 画面と入力のつなぎこみ
import {
  STAGES, MAX_STAGE, SESSION_LENGTH, stageProgress, grade, newRun, applyAnswer, applySelfCheck, SELF_CHECKS,
  buildSession, buildReviewSession, shuffle, shuffleNotIdentity, orderMarks, matchMarks,
  moodFor, comboTier, comboShout, rankFor,
  DIFFICULTIES, sessionFor, pickRevenge, REVENGE_POINTS, reduceChoices, hintFor, timeBonus, TIME_LIMIT_MS, recordKey,
} from './game.js';
import { OUTFITS, emptyStats, addPlay, unlockedOutfits, newOutfits, titleFor, evolutionFor, EVOLUTIONS } from './rewards.js';
import { validateUnit } from './validate.js';
import { load, save, mergeRecord, emptyRecord, updateWeak, weakKept, bestStatus, currentBest, oldBest, importRecords, IMPORT_PREFIX } from './storage.js';
import { AudioEngine } from './audio.js';
import { Effects } from './effects.js';
import { mascotSVG } from './mascot.js';

const $ = (id) => document.getElementById(id);
const TYPE_LABEL = { choice: '4択', order: '年代順に並べかえ', match: '組み合わせ', reason: '理由・目的を考える' };

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// 24回目：古い URL の転送ページから「#import=…」で来たら、記録を引き継ぐ（storage.js の importRecords。
// 25回目から、この端末にまだ記録が無いときだけ）。読めなくても何もしないだけ。
// 記録の文字列が URL・履歴に残らないよう hash を消す：history.replaceState で消し、それができないブラウザでは
// location.hash を空にする（このときは URL の最後に「#」だけ残り、履歴にも1つ残る。どちらもできなければ残る）
function consumeImport() {
  if (!location.hash.startsWith(IMPORT_PREFIX)) return false;
  let ok = false;
  try {
    ok = importRecords(location.hash.slice(IMPORT_PREFIX.length), undefined, reduced);
  } catch {
    ok = false;
  }
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    try {
      location.hash = '';
    } catch {
      // 消せなくても遊べる
    }
  }
  return ok;
}
let importNotice = consumeImport(); // 引き継いだら、はじめのタイトル画面で1回だけ知らせる
const store = load(undefined, reduced);
const audio = new AudioEngine();
const fx = new Effects($('fx'));

let units = [];
let unit = null; // { id, title, festival, questions }
let review = false; // にがて問題モードか
let lastGained = 0;
let qStart = 0;
let lastBonus = 0;
let timebarTimer = 0; // むずかしい：問題を出した時刻（タイムボーナス用）
const difficulty = () => (DIFFICULTIES[store.settings.difficulty] ? store.settings.difficulty : 'normal');
// 「全時代を統べる神」モード：全単元から1周ぶん（単元一覧の最後に置く）
const MIX = { id: 'mix', title: '全時代を統べる神', era: `全単元から ランダムに${SESSION_LENGTH}問`, festival: '全時代祭り', mix: true };
let session = [];
let qIndex = 0;
// リベンジ問題（16回目）：wrongs＝その回でまちがえた問題、revenge＝1周（5問）のあとのリベンジの状態（なければ null）
let wrongs = [];
let revenge = null;
let pausedAt = 0; // 17回目：確認を出している間はタイムボーナスの時間を止める
const curQ = () => (revenge ? revenge.list[revenge.i] : session[qIndex]);
let run = newRun();
let current = null; // 表示中の問題の状態
let answered = false;

// ---------- 初期化 ----------

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
}

function applySettings() {
  const s = store.settings;
  document.body.dataset.motion = s.motion;
  fx.motion = s.motion;
  audio.setMuted(s.muted);
  audio.setBgm(s.bgm);
  $('btn-mute').textContent = s.muted ? '🔇' : '🔊';
  save(store);
}

function setStage(stage) {
  document.body.dataset.stage = String(stage);
  audio.setStage(stage);
}

async function init() {
  $('mascot').innerHTML = mascotSVG();
  const lanterns = $('lanterns');
  for (let i = 0; i < 7; i++) lanterns.appendChild(el('div', 'lantern'));
  applySettings();
  try {
    units = await (await fetch('data/units.json')).json();
  } catch {
    $('unit-list').textContent = '問題データを読み込めませんでした。README の方法でサーバーを起動してください。';
    return;
  }
  renderTitle();
}

function renderTitle() {
  $('import-note').hidden = !importNotice;
  importNotice = false;
  clearEffects();
  setStage(0);
  audio.stop();
  renderDifficulty();
  const list = $('unit-list');
  list.replaceChildren();
  const lastId = store.lastUnit;
  MIX.era = `全${units.length}単元から ランダムに${SESSION_LENGTH}問`; // 単元を足しても数が合うように（13回目）
  [...units, MIX].forEach((u, i) => {
    const item = el('div', 'unit-item');
    const b = el('button', 'unit-btn');
    b.type = 'button';
    b.setAttribute('aria-label', `${u.title}をはじめる`);
    const head = el('span', 'unit-head');
    head.append(el('span', 'unit-name', u.title), el('span', 'unit-go', 'はじめる ▶'));
    b.append(head);
    if (u.era) b.append(el('span', 'unit-era', u.era));
    const rec = store.records[recordKey(u.id, difficulty())];
    // 20回目：ベストは今の1周（5問）の記録だけ。20問のころの記録しかなければ、それとわかるように出す（比べない）
    const cur = currentBest(rec);
    const old = oldBest(rec);
    b.append(el('span', 'unit-rec', cur
      ? `ベスト ${cur.bestScore}点・${cur.bestCorrect}問正解（${rec.plays}回プレイ）`
      : old ? `${old.len}問のころのベスト ${old.bestScore}点（${rec.plays}回プレイ）`
        : 'まだ遊んでいません'));
    b.addEventListener('click', () => startUnit(u));
    item.appendChild(b);
    const weakCount = u.mix ? 0 : (store.weak[u.id] || []).length;
    if (weakCount) {
      const w = el('button', 'btn weak-btn');
      w.type = 'button';
      w.setAttribute('aria-label', `${u.title}のにがて問題をはじめる（${weakCount}問）`);
      w.textContent = `にがて問題 ${weakCount}問`;
      w.addEventListener('click', () => startUnit(u, true));
      item.appendChild(w);
    }
    list.appendChild(item);
    if (u.id === lastId || (i === 0 && !units.some((x) => x.id === lastId))) setTimeout(() => b.focus(), 0);
  });
  renderProfile();
  setMood('normal');
  show('screen-title');
}

// むずかしさ（かんたん・ふつう・むずかしい）。選んだものは設定に保存
function renderDifficulty() {
  const box = $('diff-btns');
  box.replaceChildren();
  for (const [id, d] of Object.entries(DIFFICULTIES)) {
    const b = el('button', 'diff-btn' + (difficulty() === id ? ' selected' : ''), d.name);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(difficulty() === id));
    b.addEventListener('click', () => {
      store.settings.difficulty = id;
      save(store);
      renderTitle();
      // 単元カードへの自動フォーカス（renderTitle の setTimeout）より後に、選んだボタンへ戻す
      setTimeout(() => $('diff-btns').querySelector('.selected')?.focus(), 0);
    });
    box.appendChild(b);
  }
  $('diff-note').textContent = DIFFICULTIES[difficulty()].note;
}

// 称号と着せ替え。まだのものは条件を出す（押せない）
function renderProfile() {
  const stats = store.stats || emptyStats();
  // ハッピーの進化（12回目）：遊んだ回数だけで進む
  const ev = evolutionFor(stats);
  $('mascot').dataset.evo = String(ev.level);
  $('profile-evo').textContent = `ハッピー：${ev.name}（進化 ${ev.level} / ${EVOLUTIONS.length - 1}）`;
  $('profile-evo-next').textContent = ev.next ? `次の進化まで あと${ev.next.left}回 遊ぶ（正解数は関係なし）` : 'いちばん上まで進化しました！';
  const t = titleFor(stats);
  $('profile-title').textContent = `称号：${t.name}`;
  $('profile-next').textContent = t.next ? `あと ${t.next.left}問 正解で「${t.next.name}」` : '最高の称号です！';
  const owned = unlockedOutfits(stats, store.records);
  if (!owned.includes(store.outfit)) store.outfit = 'none';
  $('mascot').dataset.outfit = store.outfit;
  const list = $('outfit-list');
  list.replaceChildren();
  for (const o of OUTFITS) {
    const has = owned.includes(o.id);
    const b = el('button', 'outfit-chip' + (store.outfit === o.id ? ' selected' : ''));
    b.type = 'button';
    b.disabled = !has;
    b.setAttribute('aria-pressed', String(store.outfit === o.id));
    // 16回目：着せ替えた姿の小さな絵。まだもらっていないものは黒いシルエットで「何がもらえるか」を見せる
    const icon = el('span', 'oc-icon' + (has ? '' : ' locked'));
    icon.setAttribute('aria-hidden', 'true');
    icon.dataset.mood = 'normal';
    icon.dataset.outfit = o.id;
    icon.innerHTML = mascotSVG();
    b.append(icon, el('span', 'oc-name', has ? o.name : '？？？'));
    if (!has) b.append(el('span', 'oc-hint', o.hint));
    b.addEventListener('click', () => {
      store.outfit = o.id;
      save(store);
      renderProfile();
    });
    list.appendChild(b);
  }
}

// ---------- 演出（5回目） ----------

const SAY = {
  happy: ['やったね！', '正解！', 'いい調子！'],
  combo: ['ノッてきた！', 'とまらない！', 'すごすぎる！'],
  oops: ['ドンマイ！ つぎいこう！', 'おしい！ 解説を読もう', 'だいじょうぶ、まだまだ！'],
  festival: ['わっしょい！', '祭りだー！', 'さいこう！'],
};
// 演出が見えている長さ（ms）。子どもが「何が起きたか」を読み取れる長さ（6回目に延長）
export const FX_MS = { shout: 1900, stageBand: 2300, scorePop: 1800, say: 2200 };
let sayTimer = 0;
let shoutTimer = 0;
let burstTimer = 0; // 16回目：正解の「溜め」のあとに出す演出のタイマー
const HITSTOP_MS = 60; // 正解の瞬間の一瞬の溜め（20〜80ms の間）
const lowMotion = () => store.settings.motion === 'low';

// 「つぎへ」・画面の切り替えで、残っている演出をすぐに消す（つぎの問題に重ねない）
function clearEffects() {
  clearTimeout(burstTimer);
  clearTimeout(shoutTimer);
  clearTimeout(sayTimer);
  const s = $('shout');
  s.classList.remove('on');
  s.textContent = '';
  $('mascot-say').classList.remove('show');
  for (const p of document.querySelectorAll('.score-pop')) p.remove();
}

function setMood(mood) {
  $('mascot').dataset.mood = mood;
}

function say(text) {
  const b = $('mascot-say');
  b.textContent = text;
  b.classList.add('show');
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => b.classList.remove('show'), FX_MS.say);
}

// 画面上部（HUD の位置）に大きな文字を短く出す。問題文には重ねない
function shout(text, kind = '') {
  const s = $('shout');
  const ms = kind.includes('stage') ? FX_MS.stageBand : FX_MS.shout;
  s.className = 'shout ' + kind;
  s.style.setProperty('--shout-ms', `${ms}ms`);
  s.textContent = text;
  void s.offsetWidth;
  s.classList.add('on');
  clearTimeout(shoutTimer);
  shoutTimer = setTimeout(() => s.classList.remove('on'), ms);
}

// 白く光る（ひかえめでは出さない）
function flash() {
  if (lowMotion()) return;
  restartAnim($('flash'), 'on', 260);
}

function shake() {
  if (lowMotion()) return;
  restartAnim(document.body, 'shake', 400);
}

function showCombo(combo) {
  const box = $('combo-burst');
  const tier = comboTier(combo);
  box.hidden = tier === 0;
  if (!tier) return;
  box.dataset.tier = String(tier);
  $('cb-num').textContent = String(combo);
  restartAnim(box, 'pop', 500);
}

function scorePop(gained) {
  const p = el('span', 'score-pop', `+${gained}`);
  $('feedback').appendChild(p);
  setTimeout(() => p.remove(), FX_MS.scorePop);
}

async function startUnit(u, reviewMode = false) {
  clearEffects();
  audio.init();
  if (!unit || unit.id !== u.id) {
    const list = u.mix ? units : [u];
    const datas = await Promise.all(list.map(async (x) => (await fetch(`data/${x.file}`)).json()));
    const questions = [];
    for (const data of datas) {
      const errs = validateUnit(data);
      if (errs.length) console.warn('問題データの不備:', errs);
      // にがて問題はもとの単元に記録するので、単元 id を問題に持たせる
      for (const q of data.questions) questions.push({ ...q, unitId: data.unit });
    }
    unit = { id: u.id, mix: !!u.mix, title: u.mix ? u.title : datas[0].title, festival: u.festival || STAGES[MAX_STAGE].name, questions };
  }
  store.lastUnit = u.id;
  save(store);
  $('festival-banner').textContent = `${unit.festival}！`;
  review = reviewMode;
  session = review ? buildReviewSession(unit.questions, store.weak[unit.id], SESSION_LENGTH) : [];
  if (!session.length) {
    review = false;
    session = sessionFor(unit.questions, difficulty());
  }
  // かんたん：4択の誤答を1つ減らして3択に
  if (DIFFICULTIES[difficulty()].choices === 3) session = session.map((q) => reduceChoices(q));
  qIndex = 0;
  wrongs = [];
  revenge = null;
  run = newRun();
  setStage(0);
  audio.start();
  const dname = difficulty() === 'normal' ? '' : `・${DIFFICULTIES[difficulty()].name}`;
  $('hud-unit').textContent = review ? `${unit.title}・にがて` : `${unit.title}${dname}`;
  updateHud();
  show('screen-play');
  renderQuestion();
}

// ---------- HUD ----------

// 最終段階の名前は単元ごと（江戸＝大江戸祭り、明治＝文明開化祭り）
function stageName(s) {
  return s === MAX_STAGE && unit ? unit.festival : STAGES[s].name;
}

function updateHud() {
  $('hud-progress').textContent = revenge ? `リベンジ ${revenge.i + 1} / ${revenge.list.length}`
    : `${Math.min(qIndex + 1, session.length)} / ${session.length}`;
  $('hud-score').textContent = `${run.score + (revenge ? revenge.points : 0)}点`;
  $('meter-fill').style.width = `${Math.round(stageProgress(run.correct, difficulty()) * 100)}%`;
  const c = $('hud-combo');
  // 18回目：コンボの場所だと分かるよう、0〜1 のときも薄い色で「0コンボ」「1コンボ」を出す。2コンボ以上は今までどおり金色
  c.textContent = `${run.combo}コンボ`;
  c.classList.toggle('idle', run.combo < 2);
}

// ---------- 問題の表示 ----------

function optButton(num, text, onClick) {
  const b = el('button', 'opt');
  b.type = 'button';
  b.append(el('span', 'num', String(num)), el('span', 'txt', text));
  b.addEventListener('click', onClick);
  return b;
}

function renderQuestion() {
  answered = false;
  const q = curQ();
  // かんたんは「3択」。資料つき（20回目②）は「4択・資料」
  const label = q.type === 'choice' ? `${q.choices.length}択${q.figure ? '・資料' : ''}` : TYPE_LABEL[q.type];
  $('qtype').textContent = revenge ? `リベンジ ${revenge.i + 1}/${revenge.list.length}　${label}` : `第${qIndex + 1}問　${label}`;
  $('prompt').textContent = q.prompt;
  $('feedback').hidden = true;
  $('stamp').classList.remove('on');
  setMood(moodFor({ answered: false, stage: run.stage }));
  const area = $('answer-area');
  area.replaceChildren();
  const submit = $('btn-submit');
  submit.hidden = q.type === 'choice' || q.type === 'reason'; // 理由・目的の問いは自己採点のボタンで答える
  submit.disabled = true;
  if (q.figure) area.appendChild(renderFigure(q.figure));
  if (q.type === 'choice') renderChoice(q, area);
  else if (q.type === 'order') renderOrder(q, area);
  else if (q.type === 'reason') renderReason(q, area);
  else renderMatch(q, area);
  // かんたん：答える前に押せるヒント
  $('btn-hint').hidden = !DIFFICULTIES[difficulty()].hint;
  $('hint-text').hidden = true;
  $('hint-text').textContent = '';
  // むずかしい：タイムボーナスのバー（時間切れでも失敗にはしない）
  startTimebar(revenge ? null : q.type); // リベンジは時間を計らない
  updateHud();
  const first = area.querySelector('.opt:not(:disabled)');
  if (first) first.focus({ preventScroll: true });
  $('card').scrollIntoView({ block: 'nearest' });
}

function showHint() {
  if (answered || !current) return;
  const t = $('hint-text');
  t.textContent = `ヒント：${hintFor(current.q)}`;
  t.hidden = false;
  $('btn-hint').hidden = true;
}

function startTimebar(type) {
  const bar = $('timebar');
  const fill = $('timebar-fill');
  qStart = performance.now();
  bar.hidden = !DIFFICULTIES[difficulty()].timeBonus || !TIME_LIMIT_MS[type]; // 理由・目的の問いは時間を計らない
  if (bar.hidden) return;
  bar.classList.remove('over');
  fill.style.transition = 'none';
  fill.style.width = '100%';
  void fill.offsetWidth;
  fill.style.transition = `width ${TIME_LIMIT_MS[type]}ms linear`;
  fill.style.width = '0%';
  clearTimeout(timebarTimer);
  timebarTimer = setTimeout(() => bar.classList.add('over'), TIME_LIMIT_MS[type]);
}

// 17回目：ホームに戻る確認を出している間は、タイムボーナスの時間を止める（考える時間を取られないように）。
// つづけるを押すと、止めた所から残りの時間で再開する
function pauseTimebar() {
  pausedAt = 0;
  if ($('timebar').hidden || answered) return;
  pausedAt = performance.now();
  stopTimebar();
}
function resumeTimebar() {
  if (!pausedAt) return;
  const now = performance.now();
  qStart += now - pausedAt;
  pausedAt = 0;
  const limit = TIME_LIMIT_MS[curQ().type];
  const left = limit - (now - qStart);
  const bar = $('timebar');
  const fill = $('timebar-fill');
  if (left <= 0) {
    bar.classList.add('over');
    return;
  }
  void fill.offsetWidth;
  fill.style.transition = `width ${left}ms linear`;
  fill.style.width = '0%';
  clearTimeout(timebarTimer);
  timebarTimer = setTimeout(() => bar.classList.add('over'), left);
}

function stopTimebar() {
  clearTimeout(timebarTimer);
  const fill = $('timebar-fill');
  fill.style.width = getComputedStyle(fill).width;
  fill.style.transition = 'none';
}

// 資料（20回目②）：問題文の下、選択肢の上に出す。史料の文章・表・図のどれか。下に出典
function renderFigure(f) {
  const fig = el('figure', `q-figure kind-${f.kind}`);
  fig.append(el('figcaption', 'fig-title', f.title));
  if (f.kind === 'text') {
    const box = el('div', 'fig-text');
    for (const line of f.lines) box.append(el('p', '', line));
    fig.append(box);
  } else if (f.kind === 'table') {
    const wrap = el('div', 'fig-table-wrap');
    const table = el('table', 'fig-table');
    const head = el('tr');
    for (const h of f.head) {
      const th = el('th', '', h);
      th.scope = 'col';
      head.append(th);
    }
    const tbody = el('tbody');
    for (const r of f.rows) {
      const tr = el('tr');
      r.forEach((c, i) => {
        const cell = el(i === 0 ? 'th' : 'td', '', c); // いちばん左の列は行の見出し
        if (i === 0) cell.scope = 'row';
        tr.append(cell);
      });
      tbody.append(tr);
    }
    const thead = el('thead');
    thead.append(head);
    table.append(thead, tbody);
    wrap.append(table);
    fig.append(wrap);
  } else {
    const img = el('img', 'fig-img');
    img.src = f.src; // app/ の中の相対パス（サブパスでも動く）
    img.alt = f.alt;
    img.decoding = 'async';
    fig.append(img);
  }
  fig.append(el('p', 'fig-credit', `出典：${f.credit}`));
  return fig;
}

function renderChoice(q, area) {
  const order = shuffle(q.choices.map((_, i) => i)); // かんたんは3択
  const box = el('div', 'opts');
  current = { q, order, buttons: [] };
  order.forEach((ci, i) => {
    const b = optButton(i + 1, q.choices[ci], () => submitAnswer(ci));
    current.buttons.push(b);
    box.appendChild(b);
  });
  area.appendChild(box);
}

function renderOrder(q, area) {
  const pool = shuffleNotIdentity(q.items.map((it) => it.text));
  current = { q, pool, picked: [] };
  area.append(el('p', 'hint', '古いものから順にタップ（上の枠ほど古い）。枠をタップすると取り消し。'));
  const slots = el('div', 'slots');
  const opts = el('div', 'opts');
  area.append(slots, opts);
  current.redraw = () => {
    slots.replaceChildren();
    q.items.forEach((_, i) => {
      const text = current.picked[i];
      const mark = current.marks ? (current.marks[i] ? ' right' : ' miss') : '';
      const s = el('button', 'slot' + (text ? ' filled' : '') + (!answered && i === current.picked.length ? ' current' : '') + mark);
      s.type = 'button';
      s.disabled = answered || !text;
      s.append(el('span', 'slot-no', `${i + 1}番目`), el('span', 'txt', text || '')); // 16回目：結果のランク札（.rank）とクラス名が重なっていたので変えた
      if (current.marks) s.append(markEl(current.marks[i]));
      s.addEventListener('click', () => {
        current.picked.splice(i, 1);
        current.redraw();
      });
      slots.appendChild(s);
    });
    opts.replaceChildren();
    pool.forEach((text, i) => {
      const used = current.picked.includes(text);
      const b = optButton(i + 1, text, () => pickOrder(text));
      b.disabled = used || answered;
      if (used) b.classList.add('used');
      opts.appendChild(b);
    });
    $('btn-submit').disabled = answered || current.picked.length !== q.items.length;
  };
  current.redraw();
}

// 採点後に枠・行につける○×（色だけに頼らないよう記号も出す）
function markEl(ok) {
  const m = el('span', 'mark', ok ? '○' : '×');
  m.setAttribute('aria-label', ok ? '正しい' : 'ちがう');
  return m;
}

function pickOrder(text) {
  if (answered || current.picked.includes(text)) return;
  current.picked.push(text);
  current.redraw();
  focusNextOpt();
}

function renderMatch(q, area) {
  const lefts = q.pairs.map((p) => p.left);
  const rights = shuffle(q.pairs.map((p) => p.right));
  current = { q, lefts, rights, map: {}, history: [], active: 0 };
  area.append(el('p', 'hint', '赤い枠の人物に合うものを下から選ぶ。行をタップすると選び直し。'));
  const rows = el('div', 'match-rows');
  const opts = el('div', 'opts');
  area.append(rows, opts);
  current.redraw = () => {
    rows.replaceChildren();
    lefts.forEach((l, i) => {
      const r = current.map[l];
      const mark = current.marks ? (current.marks[i] ? ' right' : ' miss') : '';
      const row = el('button', 'slot match-row' + (r ? ' filled' : '') + (!answered && i === current.active ? ' current' : '') + mark);
      row.type = 'button';
      row.disabled = answered;
      row.append(el('span', 'left', l), el('span', 'arrow', '→'), el('span', 'txt', r || '？'));
      if (current.marks) row.append(markEl(current.marks[i]));
      row.addEventListener('click', () => {
        delete current.map[l];
        current.history = current.history.filter((x) => x !== l);
        current.active = i;
        current.redraw();
      });
      rows.appendChild(row);
    });
    opts.replaceChildren();
    const usedR = new Set(Object.values(current.map));
    rights.forEach((r, i) => {
      const b = optButton(i + 1, r, () => pickMatch(r));
      b.disabled = usedR.has(r) || answered;
      if (usedR.has(r)) b.classList.add('used');
      opts.appendChild(b);
    });
    $('btn-submit').disabled = answered || Object.keys(current.map).length !== lefts.length;
  };
  current.redraw();
}

// 理由・目的を考える問い（10回目）。文字は入力させない（スマホで重いため）。
// 頭の中で考える →「答えを見る」→ 模範解答と要点 → 本人が「できた／おしい／まだ」を選ぶ
function renderReason(q, area) {
  current = { q, revealed: false };
  const before = el('p', 'hint', '答えを頭の中で（声に出してもOK）考えてから、「答えを見る」を押そう。');
  current.before = before;
  area.append(before);
  const box = el('div', 'opts');
  area.appendChild(box);
  box.appendChild(optButton(1, '答えを見る', () => revealReason(q, area, box)));
}

function revealReason(q, area, box) {
  if (answered || current.revealed) return;
  current.revealed = true;
  $('btn-hint').hidden = true;
  const model = el('div', 'model-answer');
  model.append(el('p', 'model-label', '模範解答'), el('p', 'model-text', q.answerText), el('p', 'model-label', '要点'));
  const ul = el('ul', 'points');
  for (const p of q.points) ul.appendChild(el('li', '', p));
  model.appendChild(ul);
  model.appendChild(el('p', 'hint', '自分の答えに要点が入っていたら「できた」。「まだ」はにがて問題に入るよ。'));
  current.before.remove(); // 「答えを見る」の案内は、押したあとは消す
  area.insertBefore(model, box);
  box.replaceChildren();
  box.classList.add('self-check');
  current.buttons = SELF_CHECKS.map((c, i) => {
    const b = optButton(i + 1, c.label, () => submitAnswer(c.value));
    b.dataset.value = c.value;
    box.appendChild(b);
    return b;
  });
  current.buttons[0].focus({ preventScroll: true });
  $('live').textContent = `模範解答：${q.answerText}`;
  model.scrollIntoView({ block: 'nearest', behavior: store.settings.motion === 'low' ? 'auto' : 'smooth' });
}

function pickMatch(r) {
  if (answered || Object.values(current.map).includes(r)) return;
  const l = current.lefts[current.active];
  if (l === undefined) return;
  current.map[l] = r;
  current.history.push(l);
  // 次の未割り当ての行へ
  const next = current.lefts.findIndex((x) => !current.map[x]);
  current.active = next === -1 ? current.lefts.length : next;
  current.redraw();
  focusNextOpt();
}

function undo() {
  if (answered || !current) return;
  if (current.q.type === 'order' && current.picked.length) {
    current.picked.pop();
    current.redraw();
  } else if (current.q.type === 'match' && current.history.length) {
    const l = current.history.pop();
    delete current.map[l];
    current.active = current.lefts.indexOf(l);
    current.redraw();
  }
  focusNextOpt();
}

function focusNextOpt() {
  const b = $('answer-area').querySelector('.opt:not(:disabled)');
  if (b) b.focus({ preventScroll: true });
  else if (!$('btn-submit').disabled) $('btn-submit').focus({ preventScroll: true });
}

// ---------- 採点と演出 ----------

function submitCurrent() {
  if (answered || !current) return;
  const q = current.q;
  if (q.type === 'order' && current.picked.length === q.items.length) submitAnswer(current.picked);
  if (q.type === 'match' && Object.keys(current.map).length === q.pairs.length) submitAnswer(current.map);
}

function submitAnswer(response) {
  if (answered) return;
  answered = true;
  const q = current.q;
  const ok = grade(q, response);
  const before = run;
  // 理由・目的の問いは自己採点：できた＝正解、おしい＝正解に数えないがコンボは切らない、まだ＝不正解
  const close = q.type === 'reason' && response === 'close';
  // リベンジ（16回目）は正解数・コンボ・段階を動かさない（「正解 ○/5」とベスト記録の比較は1周の5問のまま）
  const res = revenge ? { run, gained: 0, stageUp: false }
    : q.type === 'reason' ? applySelfCheck(run, response, difficulty()) : applyAnswer(run, ok, difficulty());
  // むずかしい：時間内に正解したらタイムボーナス（時間切れでも失敗にはしない）
  const bonus = !revenge && ok && DIFFICULTIES[difficulty()].timeBonus ? timeBonus(q.type, performance.now() - qStart) : 0;
  stopTimebar();
  if (bonus) res.run = { ...res.run, score: res.run.score + bonus };
  run = res.run;
  // にがて問題：できた・正解は外し、まだ・不正解は入れる。おしいは今の状態のまま
  // リベンジでは、にがて問題の記録は変えない（答えを見た直後の正解なので、克服とは数えない。にがて問題モードで確かめる）
  if (!revenge) {
    if (!close) store.weak = updateWeak(store.weak, q.unitId || unit.id, q.id, ok);
    if (!ok) wrongs.push(q);
  }
  save(store);

  // 選択肢の色づけ
  if (q.type === 'choice') {
    current.order.forEach((ci, i) => {
      const b = current.buttons[i];
      b.disabled = true;
      if (ci === q.answer) {
        b.classList.add('correct');
        if (ok) restartAnim(b, 'charge', 120); // 正解の瞬間の溜め（16回目）
      }
      else if (ci === response) b.classList.add('wrong');
    });
  } else if (q.type === 'reason') {
    for (const b of current.buttons) {
      b.disabled = true;
      if (b.dataset.value === response) {
        b.classList.add('picked');
        if (ok) restartAnim(b, 'charge', 120);
      }
    }
  } else {
    // 並べ替えは枠ごと、組み合わせは行ごと（lefts は pairs と同じ順）に正誤をつける
    current.marks = q.type === 'order' ? orderMarks(q, response) : matchMarks(q, response);
    current.redraw();
  }
  lastGained = res.gained + bonus;
  lastBonus = bonus;
  if (revenge && ok) {
    lastGained = REVENGE_POINTS;
    revenge.points += REVENGE_POINTS;
    revenge.success++;
    revenge.won.push({ unitId: q.unitId || unit.id, id: q.id });
  }
  showFeedback(q, ok, lastGained, response);
  if (revenge) {
    if (ok) celebrateRevenge();
    else revengeMiss();
  } else if (ok) celebrate(res.stageUp, before.stage);
  else if (close) almost();
  else oops(before.combo);
  updateHud();
}

function showFeedback(q, ok, gained, response) {
  const v = $('verdict');
  v.className = 'verdict ' + (ok ? 'ok' : 'ng');
  // 1行目＝判定、2行目＝点数やひとこと（15回目：変な位置で改行されないよう2行に分けた）
  let [main, sub] = ok ? ['○ 正解！', `+${gained}点`] : ['△ おしい！', '勢いはそのまま、つぎいこう'];
  if (q.type === 'reason') {
    [main, sub] = ok ? ['○ できた！', `+${gained}点`]
      : response === 'close' ? ['△ おしい！', 'コンボはそのまま。要点をもう一度読んでおこう']
        : ['△ まだ', 'にがて問題に入れたよ。つぎいこう'];
  }
  if (revenge) {
    [main, sub] = ok ? ['◎ リベンジ成功！', `+${gained}点`] : ['△ おしい！', '解説を読んで、にがて問題でまた挑戦しよう'];
    $('combo-burst').hidden = true; // リベンジはコンボに数えない
  }
  v.replaceChildren(el('span', 'v-main', main), el('span', 'v-sub', sub));
  if (ok && lastBonus) v.append(el('span', 'bonus', `（タイムボーナス +${lastBonus}）`));
  $('btn-hint').hidden = true;
  const sol = $('solution');
  sol.replaceChildren();
  if (q.type === 'choice') {
    sol.textContent = `正解：${q.choices[q.answer]}`;
  } else if (q.type === 'order') {
    sol.append('正解の順：');
    const ol = el('ol');
    for (const it of q.items) ol.appendChild(el('li', '', `${it.text}（${it.year}年）`));
    sol.appendChild(ol);
  } else if (q.type === 'reason') {
    // 模範解答と要点は答えの欄に出ているので、ここでは要点だけをもう一度まとめる
    sol.textContent = `要点：${q.points.join('／')}`;
  } else {
    sol.append('正解：');
    const ul = el('ol');
    for (const p of q.pairs) ul.appendChild(el('li', '', `${p.left} → ${p.right}`));
    sol.appendChild(ul);
  }
  // 15回目：要点だけの短い説明であることを、解説の頭の小さな札で示す
  $('explanation').replaceChildren(el('span', 'expl-tag', '簡単解説'), q.explanation);
  $('btn-submit').hidden = true;
  const fb = $('feedback');
  fb.hidden = false;
  const lastMain = !revenge && qIndex + 1 >= session.length;
  const lastRevenge = revenge && revenge.i + 1 >= revenge.list.length;
  $('btn-next').textContent = revenge ? (lastRevenge ? '結果を見る' : 'つぎへ')
    : lastMain ? (!review && wrongs.length ? 'リベンジ問題へ' : '結果を見る') : 'つぎへ';
  $('btn-next').append(el('kbd', '', 'Enter'));
  $('btn-next').focus({ preventScroll: true });
  fb.scrollIntoView({ block: 'nearest', behavior: store.settings.motion === 'low' ? 'auto' : 'smooth' });
  $('live').textContent = `${main} ${sub}${ok && lastBonus ? `（タイムボーナス +${lastBonus}）` : ''}。${sol.textContent}。${q.explanation}`;
}

function restartAnim(node, cls, ms) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
  setTimeout(() => node.classList.remove(cls), ms);
}

function celebrate(stageUp, prevStage) {
  const s = run.stage;
  setStage(s);
  const m = $('mascot');
  const mood = moodFor({ correct: true, combo: run.combo, stage: s });
  setMood(mood);
  say(SAY[mood][run.correct % SAY[mood].length]);
  restartAnim($('stamp'), 'on', 100000);
  if (run.combo >= 2) restartAnim($('hud-combo'), 'pop', 350);
  showCombo(run.combo);
  // 16回目：正解の瞬間に一瞬だけ溜めて（正解の選択肢がぐっとふくらむ）から、音・紙吹雪・大きな文字をはじけさせる。
  // 演出の量・種類は同じで、出す時刻が 60ms あとになるだけ。ひかえめでは溜めない
  const burst = () => celebrateBurst(stageUp, prevStage, m, mood);
  clearTimeout(burstTimer);
  if (lowMotion()) burst();
  else burstTimer = setTimeout(burst, HITSTOP_MS);
}

function celebrateBurst(stageUp, prevStage, m, mood) {
  const s = run.stage;
  audio.correct(run.combo);
  restartAnim(m, mood === 'happy' ? 'jump' : 'spin', 700);
  restartAnim($('card'), 'bump', 350);
  scorePop(lastGained);
  const sh = comboShout(run.combo);
  // 段階が上がった瞬間はそちらを優先して帯で出す（コンボの文字は帯の1行目に入れる）
  const stageUpNow = stageUp && s > prevStage;
  if (sh && !stageUpNow) shout(sh, `tier${comboTier(run.combo)}`);
  if (sh) {
    // 20回目：節目は 2・3・4・5コンボになった。音・揺れ・フラッシュは20問のころの 3・5・10・20コンボと同じ強さで出す
    const tier = comboTier(run.combo);
    audio.comboMilestone([0, 3, 5, 10, 20][tier]);
    if (tier >= 2) shake();
    if (tier >= 3) flash();
  }
  const rect = $('card').getBoundingClientRect();
  fx.confetti(10 + s * 8, rect.left + rect.width / 2, rect.top + 40);
  if (s >= 4) shake();
  if (s >= 5) fx.firework();
  if (s >= 7) setTimeout(() => fx.firework(), 250);
  if (stageUp && s > prevStage) {
    audio.stageUp(s);
    setTimeout(() => fx.confetti(30 + s * 10), 200);
    if (s >= 5) setTimeout(() => fx.firework(), 450);
    $('live').textContent = `盛り上がり段階 ${s}「${stageName(s)}」`;
    // 段階が上がる瞬間：画面上部に段階名の帯、フラッシュ（コンボの文字と重なるときは段階を優先）
    shout(`${sh ? `${sh}\n` : ''}段階${s}　${stageName(s)}！`, `stage stage${s}`);
    if (s >= 5) flash();
  }
}

// 理由・目的の問いで「おしい」を選んだとき。正解の演出はしないが、コンボは切れない
function almost() {
  setMood('normal');
  say('おしい！ 要点をおさえれば次はできるよ');
}

function oops(lostCombo) {
  audio.wrong();
  setMood('oops');
  restartAnim($('mascot'), 'slump', 700);
  $('combo-burst').hidden = true;
  say(lostCombo >= 3 ? `${lostCombo}コンボ、すごかった！ つぎいこう！` : SAY.oops[run.answered % SAY.oops.length]);
}

function next() {
  if (!answered) return;
  clearEffects();
  if (revenge) {
    revenge.i++;
    if (revenge.i >= revenge.list.length) finish();
    else renderQuestion();
    return;
  }
  qIndex++;
  // 1周（5問）のあと、まちがえた問題があればリベンジ問題（にがて問題モードは、それ自体がやり直しなので出さない）
  if (qIndex >= session.length) {
    if (!review && wrongs.length) startRevenge();
    else finish();
  } else renderQuestion();
}

// リベンジ問題（16回目）：その回でまちがえた問題から、重要度の高い順に最大2問（20回目から）をもう一度
function startRevenge() {
  revenge = { list: pickRevenge(wrongs), i: 0, success: 0, points: 0, won: [] };
  renderQuestion();
  updateHud();
  shout('リベンジ問題！', 'tier3');
  say('まちがえた問題に もう一度挑戦！');
  $('live').textContent = `リベンジ問題 ${revenge.list.length}問`;
}

// リベンジ成功：派手に（大きな文字・花火・紙吹雪・揺れ）。正解と同じく一瞬溜めてからはじける。ひかえめでは揺れ・花火なし
function celebrateRevenge() {
  setMood('combo');
  say('リベンジ成功！');
  restartAnim($('stamp'), 'on', 100000);
  const burst = () => {
    audio.comboMilestone(10);
    restartAnim($('mascot'), 'spin', 700);
    restartAnim($('card'), 'bump', 350);
    scorePop(lastGained);
    shout('リベンジ成功！', 'tier4');
    shake();
    const rect = $('card').getBoundingClientRect();
    fx.confetti(lowMotion() ? 20 : 70, rect.left + rect.width / 2, rect.top + 40);
    if (!lowMotion()) [0, 250, 500].forEach((d) => setTimeout(() => fx.firework(), d));
  };
  clearTimeout(burstTimer);
  if (lowMotion()) burst();
  else burstTimer = setTimeout(burst, HITSTOP_MS);
}

function revengeMiss() {
  audio.wrong();
  setMood('oops');
  restartAnim($('mascot'), 'slump', 700);
  say('だいじょうぶ、にがて問題でまた会おう！');
}

// ---------- 結果 ----------

function finish() {
  // にがて問題モードは問題数が少ないので、ベスト記録には入れない
  const rkey = recordKey(unit.id, difficulty());
  const prev = store.records[rkey] || emptyRecord();
  const best = review ? null : bestStatus(prev, run);
  const ownedBefore = unlockedOutfits(store.stats || emptyStats(), store.records);
  const titleBefore = titleFor(store.stats || emptyStats());
  const evoBefore = evolutionFor(store.stats || emptyStats());
  if (!review) store.records[rkey] = mergeRecord(prev, run);
  store.stats = addPlay(store.stats, run, { total: session.length, review });
  const gotOutfits = newOutfits(ownedBefore, unlockedOutfits(store.stats, store.records));
  const titleAfter = titleFor(store.stats);
  const evoAfter = evolutionFor(store.stats);
  save(store);
  const weakLeft = unit.mix ? 0 : (store.weak[unit.id] || []).length;
  audio.finish();
  const list = $('result-list');
  list.replaceChildren();
  const rows = [
    ['正解', `${run.correct} / ${session.length}問`],
    ['得点', `${run.score + (revenge ? revenge.points : 0)}点`], // リベンジの点も足す（ベスト記録の比較は1周の5問の点）
    ['最大コンボ', `${run.maxCombo}`],
    ['盛り上がり', `${run.stage}. ${stageName(run.stage)}`],
  ];
  if (revenge) rows.push(['リベンジ', `${revenge.success} / ${revenge.list.length}問 成功（+${revenge.points}点）`]);
  for (const [k, v] of rows) list.append(el('dt', '', k), el('dd', '', v));
  $('result-title').textContent = run.stage === MAX_STAGE ? `${unit.festival}達成！` : 'おつかれさま！';
  // 到達した段階のバッジ
  const badge = $('result-badge');
  badge.dataset.stage = String(run.stage);
  $('badge-num').textContent = String(run.stage);
  $('badge-name').textContent = stageName(run.stage);
  badge.setAttribute('aria-label', `到達した段階 ${run.stage}「${stageName(run.stage)}」`);
  const rb = $('result-best');
  rb.classList.toggle('new-best', !!best);
  if (review) {
    rb.textContent = weakLeft ? `にがて問題 のこり ${weakLeft}問` : '★ にがて問題をぜんぶ克服！';
  } else if (best) {
    rb.textContent = best.kind === 'update' ? '★ ベスト記録こうしん！' : '★ はじめての記録！';
    rb.append(el('span', 'best-diff', best.kind === 'update' ? `${best.before}点 → ${best.after}点` : `${best.after}点`));
  } else {
    rb.textContent = '';
  }
  // ランク（S・A・B・C）
  const rank = rankFor(run.correct, session.length);
  const rk = $('result-rank');
  rk.textContent = rank;
  rk.dataset.rank = rank;
  rk.setAttribute('aria-label', `ランク ${rank}`);
  // 新しく手に入れたごほうび
  const ul = $('result-unlocks');
  ul.replaceChildren();
  for (const id of gotOutfits) {
    ul.appendChild(el('li', 'unlock', `NEW！ きせかえ「${OUTFITS.find((o) => o.id === id).name}」をゲット！`));
  }
  if (titleAfter.level > titleBefore.level) ul.appendChild(el('li', 'unlock', `称号アップ！「${titleAfter.name}」`));
  const evolved = evoAfter.level > evoBefore.level;
  if (evolved) ul.appendChild(el('li', 'unlock evo', `ハッピーが進化！「${evoAfter.name}」（${EVOLUTIONS[evoAfter.level].look}）`));
  $('mascot').dataset.evo = String(evoAfter.level);
  // 進化の進み具合（16回目）：遊ぶたびに進むゲージ。進化した回はゲージが光る
  const evoText = evolved
    ? `ハッピーが「${evoAfter.name}」に進化！${evoAfter.next ? `　次の進化まで あと${evoAfter.next.left}回` : ''}`
    : evoAfter.next ? `「${evoAfter.next.name}」に進化まで あと${evoAfter.next.left}回！` : `「${evoAfter.name}」（いちばん上まで進化）`;
  $('result-evo-text').textContent = evoText;
  $('result-evo-fill').style.width = `${Math.round((evoAfter.next ? evoAfter.frac : 1) * 100)}%`;
  $('result-evo').classList.toggle('just', evolved);
  // まちがえた問題があった回は、にがて問題をワンタップで（全時代は単元ごとに記録するので出さない）
  const weakNow = !review && !unit.mix && wrongs.length ? (store.weak[unit.id] || []).length : 0;
  const rn = $('btn-review-now');
  rn.hidden = !weakNow;
  rn.textContent = `にがて問題をすぐやる（${weakNow}問）`;
  // 28回目：リベンジで正解しても、にがて問題には残る（答えを見た直後の正解なので）。残るわけを一言
  const kept = revenge ? weakKept(store.weak, revenge.won) : 0;
  const wn = $('result-weak-note');
  wn.hidden = !kept;
  wn.textContent = `リベンジで正解した${kept}問は、にがて問題に残るよ。次にまた正解できたら外れるよ。`;
  if (rank === 'S') shout('パーフェクト！', 'tier4');
  setMood(rank === 'C' && run.stage < MAX_STAGE ? 'happy' : 'festival');
  $('btn-again').textContent = review && weakLeft ? 'にがて問題をもう一度' : 'もう一度';
  $('btn-again').dataset.review = review && weakLeft ? '1' : '';
  show('screen-result');
  restartAnim(badge, 'stamp', 700);
  restartAnim(rk, 'stamp', 700);
  fx.confetti(60);
  if (run.stage >= 5) [0, 300, 600].forEach((d) => setTimeout(() => fx.firework(), d));
  if (best) celebrateBest();
  if (evolved) celebrateEvolution(evoAfter);
  $('btn-again').focus();
}

// 進化した瞬間。ハッピーが光って1回ふくらみ、紙吹雪。知らせの文は結果の一覧に出す
// （吹き出しは一覧の文に重なって読みにくいので使わない）。
// ひかえめ（data-motion=low）では動かさず（CSS で止まる）、紙吹雪を少しだけ。揺れ・フラッシュは使わない
function celebrateEvolution(ev) {
  setTimeout(() => {
    restartAnim($('mascot'), 'evolve', 1300);
    fx.confetti(store.settings.motion === 'low' ? 15 : 40, fx.w - 60, fx.h - 120);
    $('live').textContent = `ハッピーが進化しました。${ev.name}`;
  }, 900);
}

// ベスト更新の特別演出。音はミュートに、動きは「動きの強さ」に従う
function celebrateBest() {
  audio.newBest();
  restartAnim($('result-best'), 'pop-in', 900);
  if (store.settings.motion === 'low') {
    setTimeout(() => fx.confetti(40), 700);
    return;
  }
  [700, 950, 1200, 1450, 1700].forEach((d) => setTimeout(() => fx.firework(), d));
  setTimeout(() => fx.confetti(80, fx.w / 2, fx.h * 0.25), 800);
}

// ---------- 入力 ----------

$('btn-submit').addEventListener('click', submitCurrent);
$('btn-hint').addEventListener('click', showHint);
$('btn-next').addEventListener('click', next);
$('btn-again').addEventListener('click', () => startUnit(units.find((u) => u.id === unit.id), $('btn-again').dataset.review === '1'));
$('btn-home').addEventListener('click', renderTitle);

// 17回目：問題画面の「ホームに戻る」。確認してから戻る。戻ったら点数・ベスト記録・累計は記録しない（結果画面でしか記録しないので何もしない）。
// 18回目：にがて問題は、答えるたびに記録したとおり残す（持ち主「残したい」）。まちがえた問題は にがて問題 に入ったまま
const quitDlg = $('quit-dialog');
function resumePlay() {
  if (quitDlg.open) quitDlg.close();
  resumeTimebar();
}
$('btn-quit').addEventListener('click', () => {
  if (quitDlg.open) return;
  pauseTimebar();
  quitDlg.showModal();
  $('btn-quit-no').focus();
});
$('btn-quit-no').addEventListener('click', resumePlay);
quitDlg.addEventListener('cancel', (e) => {
  e.preventDefault();
  resumePlay();
});
$('btn-quit-yes').addEventListener('click', () => {
  quitDlg.close();
  pausedAt = 0;
  clearTimeout(timebarTimer);
  save(store);
  revenge = null;
  renderTitle();
});
$('btn-review-now').addEventListener('click', () => startUnit(units.find((u) => u.id === unit.id), true));
$('btn-mute').addEventListener('click', () => {
  store.settings.muted = !store.settings.muted;
  applySettings();
});

const dlg = $('settings');
$('btn-settings').addEventListener('click', () => {
  const f = dlg.querySelector('form');
  f.motion.value = store.settings.motion;
  f.muted.checked = store.settings.muted;
  f.bgm.checked = store.settings.bgm;
  dlg.showModal();
});
dlg.addEventListener('change', () => {
  const f = dlg.querySelector('form');
  store.settings.motion = f.motion.value;
  store.settings.muted = f.muted.checked;
  store.settings.bgm = f.bgm.checked;
  applySettings();
});

document.addEventListener('keydown', (e) => {
  if (dlg.open || $('quit-dialog').open || e.ctrlKey || e.metaKey || e.altKey) return;
  const playing = $('screen-play').classList.contains('active');
  if (e.key === 'm' || e.key === 'M') {
    store.settings.muted = !store.settings.muted;
    applySettings();
    return;
  }
  if (!playing) return;

  if (answered) {
    if (e.key === 'Enter') {
      e.preventDefault();
      next();
    }
    return;
  }
  if (/^[1-9]$/.test(e.key)) {
    const opts = [...$('answer-area').querySelectorAll('.opt')];
    const b = opts[Number(e.key) - 1];
    if (b && !b.disabled) {
      e.preventDefault();
      b.click();
    }
    return;
  }
  if (e.key === 'Backspace') {
    e.preventDefault();
    undo();
    return;
  }
  if (e.key === 'Enter' && !$('btn-submit').hidden && document.activeElement !== $('btn-submit')) {
    if (!(document.activeElement && document.activeElement.classList.contains('opt'))) {
      e.preventDefault();
      submitCurrent();
    }
    return;
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    const items = [...document.querySelectorAll('#answer-area .opt:not(:disabled), #answer-area .slot:not(:disabled), #btn-submit:not([hidden]):not(:disabled)')];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    const d = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1;
    const j = i === -1 ? 0 : (i + d + items.length) % items.length;
    items[j].focus();
  }
});

// オフラインで遊べるように Service Worker を登録する（app/ の中のファイルだけをキャッシュ）
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
