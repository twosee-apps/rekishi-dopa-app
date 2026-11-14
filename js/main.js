// 画面と入力のつなぎこみ
import {
  STAGES, MAX_STAGE, SESSION_LENGTH, stageProgress, grade, newRun, applyAnswer, applySelfCheck, SELF_CHECKS,
  buildSession, buildReviewSession, shuffle, shuffleNotIdentity, orderMarks, matchMarks,
  moodFor, comboTier, comboShout, rankFor, isQuiet, timerGroup,
  DIFFICULTIES, sessionFor, pickRevenge, REVENGE_POINTS, reduceChoices, hintFor, yearLabel, timeBonus, TIME_LIMIT_MS, recordKey,
} from './game.js';
import { OUTFITS, emptyStats, addPlay, unlockedOutfits, newOutfits, titleFor, evolutionFor, EVOLUTIONS, festivalUnits } from './rewards.js';
import { validateUnit } from './validate.js';
import { load, save, mergeRecord, emptyRecord, updateWeak, weakKept, bestStatus, currentBest, oldBest, importRecords, IMPORT_PREFIX, cleanRange } from './storage.js';
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
// 考えている間の問題カード（問題文・選択肢）と、答えたあとの解説の箱には、紙吹雪・花火を重ねない。
// 粒子は箱の奥を通り、箱の外（まわり・上の帯・下の帯のハッピー）では今までどおり手前を飛ぶ。
// 下の帯に隠れている所は箱から外す（帯の上は粒子が手前）
// 答えたあとも、問題カード（選択肢）の上には重ねない（紙吹雪はカードの後ろを通る・量はそのまま）。
// 上の HUD の文字（単元名・何問目・点数・コンボ）も、文字の所だけ奥を通す。
// 文字の範囲は、要素の見えている範囲で切る（長い単元名は「…」で切ってあり、隠れた文字の分まで広げない）
const textRect = (e) => {
  const r = document.createRange();
  r.selectNodeContents(e);
  const t = r.getBoundingClientRect();
  const b = e.getBoundingClientRect();
  return { left: Math.max(t.left, b.left), top: Math.max(t.top, b.top), right: Math.min(t.right, b.right), bottom: Math.min(t.bottom, b.bottom) };
};
// 結果画面も同じ：成績の表・ベスト・ごほうびの知らせ・進化のゲージ・ボタンと、見出しの文字の所は奥を通す。
// ランクの札と段階のバッジ（飾り）の上は今までどおり手前を飛ぶ。隠れている要素は大きさ0なので外れる
const resultRects = () => [
  textRect($('result-title')),
  $('result-list').getBoundingClientRect(),
  // ベストの所は高さが空でも残るので、文があるときだけ箱ごと（ベスト更新の金の箱も含めて）
  $('result-best').textContent ? $('result-best').getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0 },
  ...[...document.querySelectorAll('#result-unlocks .unlock')].map((e) => e.getBoundingClientRect()),
  $('result-evo').getBoundingClientRect(),
  textRect($('result-weak-note')),
  ...['btn-review-now', 'btn-again', 'btn-home'].map((id) => $(id).getBoundingClientRect()),
];
fx.shield = () => {
  let rects;
  if ($('screen-play').classList.contains('active')) {
    rects = [$('card').getBoundingClientRect()];
    if (!$('feedback').hidden) rects.push($('feedback').getBoundingClientRect());
    for (const id of ['hud-unit', 'hud-progress', 'hud-score', 'hud-combo']) if ($(id).textContent) rects.push(textRect($(id)));
  } else if ($('screen-result').classList.contains('active')) {
    rects = resultRects();
  } else return [];
  const dockTop = $('dock').getBoundingClientRect().top;
  return rects
    .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: Math.min(r.bottom, dockTop) }))
    .filter((r) => r.bottom > r.top && r.right > r.left);
};

// ことばの途中で折り返さない。CSS の word-break: auto-phrase が使えるブラウザ（Chrome・Edge など）は CSS に任せ、
// 使えないブラウザ（Safari・Firefox など）では Intl.Segmenter で語に分け、助詞（短いひらがな＝attachTo）と記号を前の語に、
// 開きかっこを次の語につけた まとまりを .ph にする（ひとまとまりで次の行へ送る。長すぎる まとまりは、はみ出さないよう折れるまま）
const AUTO_PHRASE = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('word-break', 'auto-phrase');
const SEG = !AUTO_PHRASE && typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;
// 68回目：前の語につける決まりを足した（Safari で「確かめま／しょう」「5／回」「段階／7」が折れていた）。
//  記号＝いつも／1〜2字のひらがな＝つけたあと10字まで／3〜4字のひらがな（しょう・しよう）と、数字の前後＝8字まで。
//  前は1〜2字のひらがなを字数に関係なくつけていたので「だいじょうぶ、まだまだ！」「公地公民のしくみが…」のような
//  12字をこえる まとまり（＝.ph にならず どこでも折れる）ができた＝字数の上限で次の まとまりへ分ける
const PUNCT = /^[^\p{L}\p{N}\s（「『【〔\(\[]+$/u;
const OPENER = /^[（「『【〔\(\[]+$/u;
const PHRASED = new WeakSet();
function attachTo(last, s) {
  const len = (last + s).length;
  if (PUNCT.test(s)) return true;
  if (/^[ぁ-ゖー]{1,2}$/.test(s)) return len <= 10;
  if (/^[ぁ-ゖー]{3,4}$/.test(s)) return len <= 8;
  if (/[0-9０-９]$/.test(last) && !/^\s/.test(s)) return len <= 8; // 「5回」「752年」
  if (/^[0-9０-９]+$/.test(s) && /\p{Script=Han}$/u.test(last)) return len <= 8; // 「段階7」
  return false;
}
function phrase(text) {
  const frag = document.createDocumentFragment();
  if (!SEG || !text) {
    frag.append(text || '');
    return frag;
  }
  const groups = [];
  let open = '';
  for (const { segment: s } of SEG.segment(text)) {
    if (OPENER.test(s)) open += s;
    else if (!open && groups.length && attachTo(groups[groups.length - 1], s)) groups[groups.length - 1] += s;
    else {
      groups.push(open + s);
      open = '';
    }
  }
  if (open) groups.push(open);
  // .nw（折れない）ではなく .ph（ひとまとまりで次の行へ送る・行より長いときだけ中で折る）。
  // .nw だと「民撰議院設立建白書を」のような長い語が組み合わせの狭い行からはみ出す
  // 70回目：12字は末尾の記号（。、！？」など）を数えない（記号はいつも前の語につくので、12字の語＋「。」が 13字になって
  // .ph から落ち、語の途中で折れることがあった）
  for (const g of groups) {
    if (g.length > 1 && g.replace(/[^\p{L}\p{N}\s]+$/u, '').length <= 12 && !/\s/.test(g)) frag.append(el('span', 'ph', g));
    else {
      const t = document.createTextNode(g);
      PHRASED.add(t); // 68回目：phrase を通したあとの残り（phraseAll で もう一度 通さない）
      frag.append(t);
    }
  }
  return frag;
}
// 文を語のまとまりで折る要素（el と同じ形で、中身を phrase に通す）
function elp(tag, cls, text) {
  const e = el(tag, cls);
  e.append(phrase(text));
  return e;
}
// 68回目：auto-phrase の無いブラウザ（Safari など）でも、画面のどの文も語の途中で折らない。
// index.html に書いた文（一番下の説明など）と textContent で入れた文を、出たときに phrase に通す。
// 通したあとの文（.ph の中・.ph と並んだ残り）と、折らない所（.nw・読み上げ用・キー）は通さない。
// 自分の書き換えで起きた変化は takeRecords で捨てる（同じ文を何度も通さない）。
// 1行に収める所（white-space: nowrap＝上の段の単元名の「…」など）も通さない（.ph にすると「…」が出なくなる）
const SKIP_PHRASE = '.ph, .nw, .tl, .sr-only, kbd, script, style, svg, canvas, #live';
function phraseText(n) {
  const p = n.parentElement;
  if (!p || !n.isConnected || PHRASED.has(n) || n.data.trim().length < 2 || p.closest(SKIP_PHRASE)) return;
  if (/^(?:nowrap|pre)/.test(getComputedStyle(p).whiteSpace)) return;
  n.replaceWith(phrase(n.data));
}
function phraseAll(root) {
  if (root.nodeType === Node.TEXT_NODE) return phraseText(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const todo = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) todo.push(n);
  todo.forEach(phraseText);
}
if (SEG && typeof MutationObserver !== 'undefined') {
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') phraseAll(r.target);
      else r.addedNodes.forEach(phraseAll);
    }
    mo.takeRecords();
  });
  const start = () => {
    phraseAll(document.body);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.body) start();
  else addEventListener('DOMContentLoaded', start);
}

// 問題を考えている間だけ、下の帯を低くする（style.css の :root.thinking）
function setThinking(on) {
  document.documentElement.classList.toggle('thinking', on);
  // 正解のジャンプ・回転（0.5〜0.7秒）の途中で「つぎへ」を押すと、低い帯（100px）の上へ数px 出る＝低くするときに止める。
  // ジャンプと回転は答えたあと（帯が元の大きさ）にしか始まらないので、止まるのは次の問題へ素早く進んだときの残りだけ
  if (on) $('mascot').classList.remove('jump', 'spin');
}

// 下の帯に隠れている続きがあることを、帯の上の端に小さく出す。
// 考えている間＝帯に隠れている選択肢の数（選び終えたら「こたえる」）、答えたあと＝「つぎへ」、結果画面＝「タイトルへ」が隠れているか。
// 大きな文字（帯の中の上）が出ている間は出さない
let moreRaf = 0;
let moreTarget = null; // 68回目：目印を押したときに、帯の上まで出す要素
function updateMoreHint() {
  const h = $('more-hint');
  let text = '';
  moreTarget = null;
  const play = $('screen-play').classList.contains('active');
  const result = $('screen-result').classList.contains('active');
  if ((play || result) && !$('shout').classList.contains('on')) {
    const dockTop = $('dock').getBoundingClientRect().top;
    const below = (e) => e && !e.hidden && e.getClientRects().length > 0 && e.getBoundingClientRect().bottom > dockTop + 4;
    if (play && !answered) {
      const hidden = [...$('answer-area').querySelectorAll('.opt:not(:disabled)')].filter(below);
      if (hidden.length) {
        text = `▼ 下に 選択肢 あと${hidden.length}こ`;
        moreTarget = hidden[hidden.length - 1];
      } else if (!$('btn-submit').disabled && below($('btn-submit'))) {
        text = '▼ 下に「こたえる」ボタン';
        moreTarget = $('btn-submit');
      }
    } else if (below(play ? $('btn-next') : $('btn-home'))) {
      text = '▼ 下に つづきがあるよ';
      moreTarget = play ? $('btn-next') : $('btn-home');
    }
  }
  if (h.textContent !== text) h.textContent = text;
  h.classList.toggle('show', !!text);
}
// 68回目：目印を押すと、隠れている所を帯の上まで出す（指で動かすことに気づかなくても先へ進める）
$('more-hint').addEventListener('click', () => {
  // 70回目：出ていない目印・画面を切り替えたあとの古い行き先では動かさない
  if (!moreTarget || !moreTarget.isConnected || !$('more-hint').classList.contains('show')) return;
  const over = moreTarget.getBoundingClientRect().bottom + 12 - $('dock').getBoundingClientRect().top;
  if (over > 0) window.scrollTo({ top: window.scrollY + over, behavior: store.settings.motion === 'low' ? 'auto' : 'smooth' });
});
const scheduleMoreHint = () => {
  if (moreRaf) return;
  moreRaf = requestAnimationFrame(() => {
    moreRaf = 0;
    updateMoreHint();
  });
};
addEventListener('scroll', scheduleMoreHint, { passive: true });
addEventListener('resize', scheduleMoreHint);

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
// 69回目：出題の範囲（テスト範囲の単元だけ）。store.godRange が null なら全単元
const godUnits = () => (store.godRange ? units.filter((x) => store.godRange.includes(x.id)) : units);
// 範囲の短い言い方（続いていれば「江戸時代〜立憲国家の成立」、とびとびなら「えらんだ4単元」）
function rangeText(list) {
  if (list.length === 1) return list[0].title;
  const idx = list.map((x) => units.indexOf(x));
  const joined = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  return joined ? `${list[0].title}〜${list[list.length - 1].title}` : `えらんだ${list.length}単元`;
}
// 範囲のまとまり（中学の歴史の教科書の章の分け方に合わせた目安）。押すとまとめて入る／外れる
const RANGE_GROUPS = [
  { name: '古代まで', ids: ['kyusekki', 'jomon', 'yayoi', 'kofun', 'asuka', 'nara', 'heian'] },
  { name: '中世', ids: ['kamakura', 'muromachi'] },
  { name: '近世', ids: ['azuchi', 'edo'] },
  { name: '近代', ids: ['meiji', 'rikken', 'nisshin', 'taisho', 'showa'] },
  { name: '現代', ids: ['sengo', 'kodo', 'heisei'] },
];
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

// タイトル画面では、ハッピーと吹き出しを説明の2行の右へ移し、下の帯は出さない（単元の一覧を広く見せる）。
// ほかの画面へ行くときは帯へ戻す（順番は ハッピー → 吹き出し → 大きな文字 → 帯の上の知らせ のまま）
function placeMascot(onTitle) {
  document.documentElement.classList.toggle('on-title', onTitle);
  const m = $('mascot');
  const s = $('mascot-say');
  if (onTitle) {
    if (m.parentElement.id !== 'hero-mascot') {
      $('hero-mascot').append(m);
      $('hero-say').append(s);
    }
  } else if (m.parentElement.id === 'hero-mascot') {
    s.classList.remove('show'); // タイトルのひとことを、遊ぶ画面の帯へ持ちこまない
    document.querySelector('#dock .dock-inner').prepend(m, s);
  }
}

function show(id) {
  if (id !== 'screen-play') setThinking(false);
  placeMascot(id === 'screen-title');
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  scheduleMoreHint();
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
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; // 開き直したときも前の位置に戻さない
  renderTitle();
}

// 開いたとき・ホームに戻ったときは一番上から。
// むずかしさを選び直したときは、いまの位置のまま（toTop: false）
function renderTitle({ toTop = true } = {}) {
  $('import-note').hidden = !importNotice;
  importNotice = false;
  clearEffects();
  setStage(0);
  audio.stop();
  renderDifficulty();
  const list = $('unit-list');
  list.replaceChildren();
  const lastId = store.lastUnit;
  // 単元を足しても数が合うように（13回目）。69回目：範囲をしぼっているときは、その範囲を出す
  const godList = godUnits();
  MIX.era = godList.length === units.length ? `全${units.length}単元から ランダムに${SESSION_LENGTH}問`
    : `範囲：${rangeText(godList)}（${godList.length}単元）から ランダムに${SESSION_LENGTH}問`;
  [...units, MIX].forEach((u, i) => {
    const item = el('div', 'unit-item');
    const b = el('button', 'unit-btn');
    b.type = 'button';
    b.setAttribute('aria-label', `${u.title}をはじめる`);
    const head = el('span', 'unit-head');
    const nameEl = el('span', 'unit-name');
    nameEl.append(phrase(u.title));
    head.append(nameEl, el('span', 'unit-go', 'はじめる ▶'));
    b.append(head);
    if (u.era) b.append(el('span', 'unit-era', u.era));
    const rec = store.records[recordKey(u.id, difficulty())];
    // 20回目：ベストは今の1周（5問）の記録だけ。20問のころの記録しかなければ、それとわかるように出す（比べない）
    const cur = currentBest(rec);
    const old = oldBest(rec);
    // 5問ぜんぶ正解（いまのむずかしさ）と、祭り（段階7）に届いた単元（どのむずかしさでも）の印
    const fest = !u.mix && Object.entries(store.records).some(([k, r]) => k.split(':')[0] === u.id && r && r.bestStage >= MAX_STAGE);
    if ((cur && cur.bestCorrect >= SESSION_LENGTH) || fest) {
      const badges = el('span', 'unit-badges');
      if (fest) badges.append(el('span', 'unit-badge fest', '祭り達成'));
      if (cur && cur.bestCorrect >= SESSION_LENGTH) badges.append(el('span', 'unit-badge', `★ ${SESSION_LENGTH}問ぜんぶ正解`));
      b.append(badges);
    }
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
    if (u.mix) {
      const r = el('button', 'btn range-btn', '🎯 範囲をえらぶ');
      r.type = 'button';
      r.id = 'btn-range';
      r.setAttribute('aria-label', `${u.title}の出題の範囲をえらぶ`);
      r.addEventListener('click', openRange);
      item.appendChild(r);
    }
    list.appendChild(item);
    if (u.id === lastId || (i === 0 && !units.some((x) => x.id === lastId))) setTimeout(() => b.focus({ preventScroll: true }), 0); // フォーカスは残す（キーボードで遊ぶ人のため）が、その単元までスクロールはしない
  });
  // 祭り（段階7）に届いた単元の数（全時代は数えない）
  const fc = $('fest-count');
  fc.textContent = `祭り達成 ${festivalUnits(store.records)} / ${units.length} 単元`;
  fc.hidden = false;
  renderProfile();
  setMood('normal');
  show('screen-title');
  if (toTop) window.scrollTo(0, 0);
  titleSay();
}

// タイトル画面の帯の吹き出しに、次の一手のひとこと（消えずに出たまま）
function titleSay() {
  const played = (store.stats && store.stats.plays) || 0;
  const weak = Object.values(store.weak || {}).some((a) => Array.isArray(a) && a.length);
  const b = $('mascot-say');
  clearTimeout(sayTimer);
  // 狭い画面で語の途中で折れないよう、ほかの文と同じ phrase で文節ごとに折る
  const left = Math.max(0, units.length - festivalUnits(store.records));
  // 遊んだ回数が0でも、記録やまちがえた問題がある人（はじめての1周の途中でやめた人など）は「はじめて」にしない
  const fresh = !played && !weak && !Object.keys(store.records || {}).length;
  b.replaceChildren(sayFrag(fresh ? TITLE_SAY.first : weak ? TITLE_SAY.weak : left ? TITLE_SAY.next(left) : TITLE_SAY.all));
  b.classList.add('show');
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
      renderTitle({ toTop: false });
      // 単元カードへの自動フォーカス（renderTitle の setTimeout）より後に、選んだボタンへ戻す
      setTimeout(() => $('diff-btns').querySelector('.selected')?.focus(), 0);
    });
    box.appendChild(b);
  }
  // 68回目：説明は「・」の区切りでだけ折り返す（項目ごとに .ph＝ひとまとまりで次の行へ送る。
  // 「早く答え／るとタイムボーナス」のように語の途中で折れていた＝持ち主の家族の指摘）
  const parts = DIFFICULTIES[difficulty()].note.split('・');
  $('diff-note').replaceChildren(...parts.map((p, i) => el('span', 'ph', i < parts.length - 1 ? `${p}・` : p)));
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
  // 理由・目的の問いで「まだ」を選んだとき（「おしい」と言わない）
  notyet: ['ドンマイ！ つぎいこう！', 'だいじょうぶ、まだまだ！', '要点を読めば だいじょうぶ！'],
  festival: ['わっしょい！', '祭りだー！', 'さいこう！'],
};
// タイトル画面のひとこと（はじめて・まちがえた問題がたまっている・ふだん＝祭り達成まで あと何単元・全部達成）
const TITLE_SAY = { first: 'すきな時代から はじめよう！', weak: 'まちがえた問題に 再チャレンジ！', next: (left) => `祭り達成 あと${left}単元！`, all: '全時代 祭り達成！ すごい！' };
// 演出が見えている長さ（ms）。子どもが「何が起きたか」を読み取れる長さ（6回目に延長）
export const FX_MS = { shout: 1900, stageBand: 2300, scorePop: 1800, say: 2200 };
let sayTimer = 0;
let shoutTimer = 0;
let burstTimer = 0; // 16回目：正解の「溜め」のあとに出す演出のタイマー
let nextVisTimer = 0; // 解説を出したあと「つぎへ」が帯にかかっていないかを見るタイマー
let nextVisAbort = null; // そのあいだ「自分で画面を動かしたか」を見る見張り（70回目）
function stopNextVisWatch() {
  if (nextVisAbort) nextVisAbort.abort();
  nextVisAbort = null;
}
// 44回目：遅らせて出す紙吹雪・花火のタイマー。clearEffects で全部止める（前の正解の花火を次の問題に持ちこさない）
const fxLater = timerGroup();
const HITSTOP_MS = 60; // 正解の瞬間の一瞬の溜め（20〜80ms の間）
const lowMotion = () => store.settings.motion === 'low';

// 「つぎへ」・画面の切り替えで、残っている演出をすぐに消す（つぎの問題に重ねない）
function clearEffects() {
  clearTimeout(burstTimer);
  clearTimeout(shoutTimer);
  clearTimeout(sayTimer);
  fxLater.clear();
  const s = $('shout');
  s.classList.remove('on');
  s.textContent = '';
  $('mascot-say').classList.remove('show');
  for (const p of document.querySelectorAll('.score-pop')) p.remove();
}

function setMood(mood) {
  $('mascot').dataset.mood = mood;
}

// 68回目：吹き出しの文は、半角の空白（「ドンマイ！ つぎいこう！」）を折る所として先に使う。
// 空白で分けた まとまりは .ph（ひとまとまりで次の行へ送る）。auto-phrase だけだと「つぎい／こう！」と折れた
function sayFrag(text) {
  const frag = document.createDocumentFragment();
  text.split(' ').forEach((chunk, i) => {
    if (i) frag.append(' ');
    const s = el('span', 'ph');
    s.append(phrase(chunk));
    frag.append(s);
  });
  return frag;
}

function say(text) {
  const b = $('mascot-say');
  b.replaceChildren(sayFrag(text));
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
  // 「\n」で行を分け、全角の空白で区切った語のまとまり（「段階7」「打製石器祭り！」）は折れない .nw に。
  // それでも帯の幅に入らない長い名前は、字を少し縮める（大きな文字の上限はそのまま）
  s.style.fontSize = '';
  s.replaceChildren();
  text.split('\n').forEach((line, i) => {
    if (i) s.append(el('br'));
    line.split('　').forEach((seg, j) => {
      if (j) s.append('　');
      s.append(el('span', 'nw', seg));
    });
  });
  const widest = Math.max(...[...s.querySelectorAll('.nw')].map((x) => x.offsetWidth));
  if (widest > s.clientWidth && s.clientWidth > 0) s.style.fontSize = `${(parseFloat(getComputedStyle(s).fontSize) * s.clientWidth / widest) * 0.97}px`;
  void s.offsetWidth;
  s.classList.add('on');
  updateMoreHint();
  clearTimeout(shoutTimer);
  shoutTimer = setTimeout(() => {
    s.classList.remove('on');
    updateMoreHint();
  }, ms);
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
  const list = u.mix ? godUnits() : [u];
  const key = u.mix ? `mix:${list.map((x) => x.id).join(',')}` : u.id; // 範囲を変えたら読み直す
  if (!unit || unit.key !== key) {
    const datas = await Promise.all(list.map(async (x) => (await fetch(`data/${x.file}`)).json()));
    const questions = [];
    for (const data of datas) {
      const errs = validateUnit(data);
      if (errs.length) console.warn('問題データの不備:', errs);
      // にがて問題はもとの単元に記録するので、単元 id を問題に持たせる
      for (const q of data.questions) questions.push({ ...q, unitId: data.unit });
    }
    unit = { id: u.id, key, mix: !!u.mix, full: list.length === units.length, title: u.mix ? u.title : datas[0].title, festival: u.festival || STAGES[MAX_STAGE].name, questions };
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
  $('hud-progress').classList.toggle('rev', !!revenge); // リベンジの表示は2段目
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
  const t = el('span', 'txt');
  t.append(phrase(text));
  b.append(el('span', 'num', String(num)), t);
  b.addEventListener('click', onClick);
  return b;
}

function renderQuestion() {
  answered = false;
  setThinking(true);
  const q = curQ();
  // かんたんは「3択」。資料つき（20回目②）は「4択・資料」
  const label = q.type === 'choice' ? `${q.choices.length}択${q.figure ? '・資料' : ''}` : TYPE_LABEL[q.type];
  $('qtype').textContent = revenge ? `リベンジ ${revenge.i + 1}/${revenge.list.length}　${label}` : `第${qIndex + 1}問　${label}`;
  $('prompt').replaceChildren(phrase(q.prompt));
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
  // 新しい問題は問題文から読めるように、一番上から出す。最初の選択肢が下の帯に隠れるときだけ、問題文が
  // 上で切れない範囲で下げる。前は 'nearest' で、解説までスクロールしたあとに背の高い問題（並べかえ・組み合わせ）が
  // 来ると、カードの下の端に合わせて問題文が上で切れていた
  // 1つめの選択肢ではなく、最後の選択肢（並べかえ・組み合わせは候補の最後）まで見える所まで下げる。
  // 問題文が上で切れる所までは下げない＝それでも入らないときは、帯の上の端に「▼ 下に あと N こ」
  window.scrollTo(0, 0);
  const opts = area.querySelectorAll('.opt');
  if (opts.length) {
    const need = opts[opts.length - 1].getBoundingClientRect().bottom + 12 - $('dock').getBoundingClientRect().top;
    const room = $('qtype').getBoundingClientRect().top - 8;
    if (need > 0 && room > 0) window.scrollTo(0, Math.min(need, room));
  }
  fx.cut(); // 新しい問題カードの中に残っている前の問題の粒子をすぐ消す
  updateMoreHint();
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
  area.append(elp('p', 'hint', '古いものから順にタップ（上の枠ほど古い）。枠をタップすると取り消し。'));
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
      s.append(el('span', 'slot-no', `${i + 1}番目`), elp('span', 'txt', text || '')); // 結果のランク札（.rank）とクラス名が重ならないよう txt
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
    scheduleMoreHint();
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
  // 赤い枠は人物でないことが多い（縄文土器・学制など）ので「ことば」に
  area.append(elp('p', 'hint', '赤い枠のことばに合うものを下から選ぶ。行をタップすると選び直し。'));
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
      row.append(el('span', 'left', l), el('span', 'arrow', '→'), elp('span', 'txt', r || '？'));
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
    scheduleMoreHint();
  };
  current.redraw();
}

// 理由・目的を考える問い（10回目）。文字は入力させない（スマホで重いため）。
// 頭の中で考える →「答えを見る」→ 模範解答と要点 → 本人が「できた／おしい／まだ」を選ぶ
function renderReason(q, area) {
  current = { q, revealed: false };
  const before = elp('p', 'hint', '答えを頭の中で（声に出してもOK）考えてから、「答えを見る」を押そう。');
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
  model.append(el('p', 'model-label', '模範解答'), elp('p', 'model-text', q.answerText), el('p', 'model-label', '要点'));
  const ul = el('ul', 'points');
  for (const p of q.points) ul.appendChild(elp('li', '', p));
  model.appendChild(ul);
  model.appendChild(elp('p', 'hint', '自分の答えに要点が入っていたら「できた」。「まだ」はにがて問題に入るよ。'));
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
  setThinking(false); // 答えた瞬間に帯を今の大きさへ戻す（正解・祭りの演出は大きいまま）
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
      // 色だけでなく ○（正解）・×（選んだまちがい）の印も
      if (ci === q.answer) {
        b.classList.add('correct');
        b.append(markEl(true));
        if (ok) restartAnim(b, 'charge', 120); // 正解の瞬間の溜め（16回目）
      } else if (ci === response) {
        b.classList.add('wrong');
        b.append(markEl(false));
      }
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
    if (ok) celebrateRevenge(isQuiet(q));
    else revengeMiss();
  } else if (ok) celebrate(res.stageUp, before.stage, isQuiet(q));
  else if (close) almost();
  else oops(before.combo, q.type === 'reason');
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
  v.replaceChildren(elp('span', 'v-main', main), elp('span', 'v-sub', sub));
  if (ok && lastBonus) v.append(elp('span', 'bonus', `（タイムボーナス +${lastBonus}）`));
  $('btn-hint').hidden = true;
  const sol = $('solution');
  sol.replaceChildren();
  if (q.type === 'choice') {
    sol.append(phrase(`正解：${q.choices[q.answer]}`));
  } else if (q.type === 'order' || q.type === 'match') {
    // まちがえたときは、行ごとに ○／× と「あなたの答え」も並べる（正解の一覧だけにしない）。
    // 年のかっこ「（1967年）」は折れない1かたまり
    const marks = !ok && current.marks ? current.marks : null;
    sol.append(phrase(q.type === 'order' ? '正解の順：' : '正解：'));
    const ol = el('ol');
    const rows = q.type === 'order'
      ? q.items.map((it, i) => [[phrase(it.text), el('span', 'nw', `（${yearLabel(it)}）`)], Array.isArray(response) ? response[i] : ''])
      : q.pairs.map((p) => [[phrase(`${p.left} → ${p.right}`)], response ? response[p.left] : '']);
    rows.forEach(([parts, yours], i) => {
      const li = el('li', marks ? (marks[i] ? 'ok' : 'ng') : '');
      if (marks) li.append(el('span', 'sol-mark', marks[i] ? '○' : '×'));
      li.append(...parts);
      if (marks && !marks[i]) li.append(elp('span', 'yours', `あなたの答え：${yours || '？'}`));
      ol.appendChild(li);
    });
    sol.appendChild(ol);
  } else if (q.type === 'reason') {
    // 模範解答と要点は答えの欄に出ているので、ここでは要点だけをもう一度まとめる
    sol.append(phrase(`要点：${q.points.join('／')}`));
  }
  // 15回目：要点だけの短い説明であることを、解説の頭の小さな札で示す
  $('explanation').replaceChildren(elp('span', 'expl-tag', '簡単解説'), phrase(q.explanation));
  $('btn-submit').hidden = true;
  const fb = $('feedback');
  fb.hidden = false;
  fx.cut(); // 解説の箱の中に残っている粒子をすぐ消す
  const lastMain = !revenge && qIndex + 1 >= session.length;
  const lastRevenge = revenge && revenge.i + 1 >= revenge.list.length;
  $('btn-next').textContent = revenge ? (lastRevenge ? '結果を見る' : 'つぎへ')
    : lastMain ? (!review && wrongs.length ? 'リベンジ問題へ' : '結果を見る') : 'つぎへ';
  $('btn-next').append(el('kbd', '', 'Enter'));
  $('btn-next').focus({ preventScroll: true });
  // 解説と「つぎへ」を下の帯より上へ出す。68回目：iPad（横向き・Safari）で、解説の上の端が帯の上に少し出ただけで止まった
  // （持ち主の家族の指摘）。前は scrollIntoView（帯の分は scroll-padding まかせ）＋0.45秒後に scrollBy の2回で、
  // Safari は帯の分を数えずに少しだけ動かし、2回目のスクロールも効かなかったとみられる。
  // いまは、帯が元の高さへ戻り終えてから（0.18秒）帯の上の端を測り、行き先を計算して1回だけ動かす。
  // 動き終わるころ（0.9秒後）にまだ「つぎへ」が帯にかかっていたら、なめらかにせず すぐ動かす（念のための2回目）
  const shownQ = q;
  const stillHere = () => answered && curQ() === shownQ && $('screen-play').classList.contains('active');
  const revealDistance = () => {
    const dockTop = $('dock').getBoundingClientRect().top;
    const over = $('btn-next').getBoundingClientRect().bottom + 12 - dockTop; // 「つぎへ」が帯にかかっている分
    const room = fb.getBoundingClientRect().top - 8; // 解説の上の端が画面の上で切れない分
    return over > 0 && room > 0 ? Math.min(over, room) : 0;
  };
  clearTimeout(nextVisTimer);
  stopNextVisWatch();
  nextVisTimer = setTimeout(() => {
    if (!stillHere()) return;
    const d = revealDistance();
    if (d <= 0) return;
    const from = window.scrollY;
    window.scrollTo({ top: from + d, behavior: store.settings.motion === 'low' ? 'auto' : 'smooth' });
    // 70回目：動いている間に指・ホイール・キーで自分から画面を動かした人は、2回目で引き戻さない
    // （前は「動き始めの位置より上」のときだけ止めていた＝一番上から動いたあと少し上へ戻しても下へ戻されていた）。
    // 行き先との差では決めない（なめらかなスクロールが効かない Safari では、動いていなくても2回目が要る）
    let touched = false;
    const mark = () => { touched = true; };
    nextVisAbort = new AbortController();
    for (const t of ['touchstart', 'wheel', 'keydown']) window.addEventListener(t, mark, { passive: true, capture: true, signal: nextVisAbort.signal });
    nextVisTimer = setTimeout(() => {
      stopNextVisWatch();
      // 自分で上へ戻して問題を読み直している人は動かさない（動き始めの位置より上にいるとき・自分で動かしたとき）
      if (!stillHere() || touched || window.scrollY < from - 1) return;
      const d2 = revealDistance();
      if (d2 > 1) window.scrollTo(0, window.scrollY + d2);
    }, 900);
  }, 200);
  $('live').textContent = `${main} ${sub}${ok && lastBonus ? `（タイムボーナス +${lastBonus}）` : ''}。${sol.textContent}。${q.explanation}`;
}

function restartAnim(node, cls, ms) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
  setTimeout(() => node.classList.remove(cls), ms);
}

// quiet＝「しずかな正解」の問題（43回目）：花丸のはんこ・紙吹雪・花火だけ出さない（ほかは同じ）
function celebrate(stageUp, prevStage, quiet = false) {
  const s = run.stage;
  setStage(s);
  const m = $('mascot');
  const mood = moodFor({ correct: true, combo: run.combo, stage: s });
  setMood(mood);
  say(SAY[mood][run.correct % SAY[mood].length]);
  if (!quiet) restartAnim($('stamp'), 'on', 100000);
  if (run.combo >= 2) restartAnim($('hud-combo'), 'pop', 350);
  showCombo(run.combo);
  // 16回目：正解の瞬間に一瞬だけ溜めて（正解の選択肢がぐっとふくらむ）から、音・紙吹雪・大きな文字をはじけさせる。
  // 演出の量・種類は同じで、出す時刻が 60ms あとになるだけ。ひかえめでは溜めない
  const burst = () => celebrateBurst(stageUp, prevStage, m, mood, quiet);
  clearTimeout(burstTimer);
  if (lowMotion()) burst();
  else burstTimer = setTimeout(burst, HITSTOP_MS);
}

function celebrateBurst(stageUp, prevStage, m, mood, quiet = false) {
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
  if (!quiet) fx.confetti(10 + s * 8, ...fx.free(rect.left + rect.width / 2, rect.top + 40)); // カードの後ろから出さず、カードのすぐ上か下の空いた所から
  if (s >= 4) shake();
  if (!quiet && s >= 5) fx.firework();
  if (!quiet && s >= 7) fxLater.later(() => fx.firework(), 250);
  if (stageUp && s > prevStage) {
    audio.stageUp(s);
    if (!quiet) fxLater.later(() => fx.confetti(30 + s * 10), 200);
    if (!quiet && s >= 5) fxLater.later(() => fx.firework(), 450);
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

// reason＝理由・目的の問いで「まだ」を選んだ（「おしい」の無いひとことから選ぶ）
function oops(lostCombo, reason = false) {
  audio.wrong();
  setMood('oops');
  restartAnim($('mascot'), 'slump', 700);
  $('combo-burst').hidden = true;
  const list = reason ? SAY.notyet : SAY.oops;
  say(lostCombo >= 3 ? `${lostCombo}コンボ、すごかった！ つぎいこう！` : list[run.answered % list.length]);
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
  // 考えている間は帯が低いので、大きな文字が消えてから吹き出しを出す（2つを重ねない）
  fxLater.later(() => { if (!answered) say('まちがえた問題に もう一度挑戦！'); }, FX_MS.shout);
  $('live').textContent = `リベンジ問題 ${revenge.list.length}問`;
}

// リベンジ成功：派手に（大きな文字・花火・紙吹雪・揺れ）。正解と同じく一瞬溜めてからはじける。ひかえめでは揺れ・花火なし
// quiet（43回目）：しずかな正解の問題は、リベンジ成功でも花丸のはんこ・紙吹雪・花火を出さない
function celebrateRevenge(quiet = false) {
  setMood('combo');
  say('リベンジ成功！');
  if (!quiet) restartAnim($('stamp'), 'on', 100000);
  const burst = () => {
    audio.comboMilestone(10);
    restartAnim($('mascot'), 'spin', 700);
    restartAnim($('card'), 'bump', 350);
    scorePop(lastGained);
    shout('リベンジ成功！', 'tier4');
    shake();
    const rect = $('card').getBoundingClientRect();
    if (!quiet) fx.confetti(lowMotion() ? 20 : 70, ...fx.free(rect.left + rect.width / 2, rect.top + 40)); // カードの後ろから出さず、カードのすぐ上か下の空いた所から
    if (!quiet && !lowMotion()) [0, 250, 500].forEach((d) => fxLater.later(() => fx.firework(), d));
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
  // 69回目：範囲をしぼった「全時代を統べる神」は、全範囲のベストと比べられないので記録に入れない（遊んだ回数・進化は数える）
  const ranged = unit.mix && !unit.full;
  const best = review || ranged ? null : bestStatus(prev, run);
  const ownedBefore = unlockedOutfits(store.stats || emptyStats(), store.records);
  const titleBefore = titleFor(store.stats || emptyStats());
  const evoBefore = evolutionFor(store.stats || emptyStats());
  if (!review && !ranged) store.records[rkey] = mergeRecord(prev, run);
  store.stats = addPlay(store.stats, run, { total: session.length, review });
  const gotOutfits = newOutfits(ownedBefore, unlockedOutfits(store.stats, store.records));
  const titleAfter = titleFor(store.stats);
  const evoAfter = evolutionFor(store.stats);
  save(store);
  const weakLeft = unit.mix ? 0 : (store.weak[unit.id] || []).length;
  audio.finish();
  const list = $('result-list');
  list.replaceChildren();
  // 得点はリベンジの点も足す（ベスト記録の比較は1周の5問の点）。足したときは内わけを得点の下に出す
  // （「920点」と「はじめての記録 820点」が食い違って見えたため）
  const revPts = revenge ? revenge.points : 0;
  const scoreDd = el('dd', '', `${run.score + revPts}点`);
  if (revPts) scoreDd.append(el('span', 'score-split', `1周 ${run.score}点＋リベンジ ${revPts}点`));
  const rows = [
    ['正解', `${run.correct} / ${session.length}問`],
    ['得点', scoreDd],
    ['最大コンボ', `${run.maxCombo}`],
    ['盛り上がり', `${run.stage}. ${stageName(run.stage)}`],
  ];
  if (revenge) rows.push(['リベンジ', `${revenge.success} / ${revenge.list.length}問 成功（+${revenge.points}点）`]);
  for (const [k, v] of rows) list.append(el('dt', '', k), typeof v === 'string' ? el('dd', '', v) : v);
  // 「達成！」と祭りの名前は、それぞれ折れない1かたまり（「祭り達／成！」と折れない）
  if (run.stage === MAX_STAGE) $('result-title').replaceChildren(el('span', 'nw', unit.festival), el('span', 'nw', '達成！'));
  else $('result-title').replaceChildren(phrase('おつかれさま！'));
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
    // リベンジの点が入った回は、記録が1周の点であることを一言（得点の欄の「1周 ○点」と同じ数）
    if (revPts) rb.append(el('span', 'best-note', '記録は1周（5問）の点。リベンジの点は入らないよ'));
  } else if (ranged) {
    rb.replaceChildren(phrase('範囲をしぼった回は、ベスト記録に入らないよ'));
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
    const o = OUTFITS.find((x) => x.id === id);
    const li = elp('li', 'unlock', `NEW！ きせかえ「${o.name}」をゲット！`);
    // もらった その場で着られる
    const wb = elp('button', 'btn wear-btn', 'いま着る');
    wb.type = 'button';
    wb.addEventListener('click', () => {
      store.outfit = id;
      save(store);
      $('mascot').dataset.outfit = id;
      for (const x of ul.querySelectorAll('.wear-btn')) {
        x.disabled = x === wb;
        x.replaceChildren(phrase(x === wb ? '着たよ！' : 'いま着る'));
      }
      setMood('happy');
      restartAnim($('mascot'), 'jump', 700);
    });
    li.append(wb);
    ul.appendChild(li);
  }
  if (titleAfter.level > titleBefore.level) ul.appendChild(elp('li', 'unlock', `称号アップ！「${titleAfter.name}」`));
  const evolved = evoAfter.level > evoBefore.level;
  $('mascot').dataset.evo = String(evoAfter.level);
  // 進化の進み具合：遊ぶたびに進むゲージ。進化した回はゲージが光る。
  // 進化した回の知らせは、ここ1枚にまとめる（一覧の「ハッピーが進化！」の行は出さない）
  const et = $('result-evo-text');
  et.replaceChildren();
  if (evolved) {
    et.append(phrase(`ハッピーが進化！「${evoAfter.name}」`), elp('span', 'evo-look', `（${EVOLUTIONS[evoAfter.level].look}）`));
    if (evoAfter.next) et.append(elp('span', 'evo-next', `次の進化まで あと${evoAfter.next.left}回`));
  } else {
    et.append(phrase(evoAfter.next ? `「${evoAfter.next.name}」に進化まで あと${evoAfter.next.left}回！` : `「${evoAfter.name}」（いちばん上まで進化）`));
  }
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
  wn.replaceChildren(phrase(`リベンジで正解した${kept}問は、にがて問題に残るよ。次にまた正解できたら外れるよ。`));
  if (rank === 'S') shout('パーフェクト！', 'tier4');
  setMood(rank === 'C' && run.stage < MAX_STAGE ? 'happy' : 'festival');
  $('btn-again').textContent = review && weakLeft ? 'にがて問題をもう一度' : 'もう一度';
  $('btn-again').dataset.review = review && weakLeft ? '1' : '';
  show('screen-result');
  fx.cut(); // 結果の箱の中に残っている問題の画面の粒子をすぐ消す
  restartAnim(badge, 'stamp', 700);
  restartAnim(rk, 'stamp', 700);
  fx.confetti(60);
  if (run.stage >= 5) [0, 300, 600].forEach((d) => fxLater.later(() => fx.firework(), d));
  // 69回目：進化した回は、結果の判子が押し終わったころに画面いっぱいの進化の場面を出す。
  // ベスト記録の花火・音は場面の後ろに隠れるので、場面を閉じてから出す
  if (evolved) fxLater.later(() => openEvoScene(evoBefore, evoAfter, () => {
    celebrateEvolution(evoAfter);
    if (best) celebrateBest();
  }), EVO_SCENE_DELAY);
  else if (best) celebrateBest();
  $('btn-again').focus();
}

// 進化の場面を閉じたあと：帯のハッピー（もう新しい姿）が光って1回ふくらみ、紙吹雪。
// ひかえめ（data-motion=low）では動かさず（CSS で止まる）、紙吹雪を少しだけ。揺れ・フラッシュは使わない
function celebrateEvolution(ev) {
  restartAnim($('mascot'), 'evolve', 1300);
  fx.confetti(store.settings.motion === 'low' ? 15 : 40, fx.w - 60, fx.h - 120);
  $('live').textContent = `ハッピーが進化しました。${ev.name}`;
}

// ---------- 69回目：進化の瞬間（画面いっぱいの場面） ----------
// 前の姿がゆれて光る（old）→ まっ白に光る（glow）→ 新しい姿が大きく飛び出し、名前・変わったところ・次の進化までが順に出る（reveal）→ 止まる（done）。
// 場面のどこを押しても先へ進み（done なら閉じる）、「やったね！」で閉じる。Esc も閉じる。
// ひかえめでは動かさない＝はじめから done の姿で出す（CSS でも動きを止める）。音はミュートに従う（audio の中で止まる）
const EVO_SCENE_DELAY = 800;
const EVO_STEP = { glow: 1100, reveal: 1700, done: 3000 };
const EVO_SPARKS = 12;
const evoDlg = $('evo-dialog');
const evoTimers = timerGroup();
let evoAfterClose = null;

function evoPhase(p) {
  evoDlg.dataset.phase = p;
  const early = p === 'old' || p === 'glow';
  $('evo-kicker').replaceChildren(phrase(early ? 'あれれ？ ハッピーが 光りだした…！' : 'ハッピーが 進化した！'));
  if (!early) $('btn-evo-close').focus();
}

function openEvoScene(before, after, onClose) {
  evoTimers.clear();
  evoAfterClose = onClose;
  const [oldFig, newFig] = evoDlg.querySelectorAll('.evo-fig');
  for (const [f, lv] of [[oldFig, before.level], [newFig, after.level]]) {
    if (!f.firstElementChild) f.innerHTML = mascotSVG();
    f.dataset.evo = String(lv);
    f.dataset.outfit = store.outfit || 'none';
  }
  const sparks = evoDlg.querySelector('.evo-sparks');
  if (!sparks.childElementCount) {
    for (let i = 0; i < EVO_SPARKS; i++) {
      const s = el('span', 'evo-spark');
      s.style.setProperty('--a', `${(360 / EVO_SPARKS) * i}deg`);
      s.style.setProperty('--d', `${(i % 3) * 0.12}s`);
      sparks.append(s);
    }
  }
  $('evo-name').replaceChildren(phrase(`「${after.name}」`));
  $('evo-change').replaceChildren(phrase(`かわったところ：${EVOLUTIONS[after.level].look}`));
  $('evo-next').replaceChildren(phrase(after.next ? `次の進化まで あと${after.next.left}回 遊ぶ` : 'いちばん上まで 進化した！'));
  // 70回目：ここで #live に入れていた読み上げはやめた（すぐ showModal するとダイアログの外は読めなくなる）。
  // 名前と変わったところはダイアログの説明（aria-describedby="evo-name evo-change"）として、開いたときに読まれる
  if (lowMotion()) {
    evoPhase('done');
    evoDlg.showModal();
    $('btn-evo-close').focus();
    audio.newBest();
    return;
  }
  evoPhase('old');
  evoDlg.showModal();
  audio.stageUp(2);
  evoTimers.later(() => { evoPhase('glow'); audio.newBest(); }, EVO_STEP.glow);
  evoTimers.later(() => evoPhase('reveal'), EVO_STEP.reveal);
  evoTimers.later(() => evoPhase('done'), EVO_STEP.done);
}

function closeEvoScene() {
  if (!evoDlg.open) return;
  evoTimers.clear();
  evoDlg.close();
  const f = evoAfterClose;
  evoAfterClose = null;
  $('btn-again').focus();
  if (f) f();
}

// 押したら：動いている途中なら止まった姿（done）へ進む。止まっていたら閉じる。「やったね！」はいつでも閉じる
evoDlg.addEventListener('click', (e) => {
  if (e.target.closest('#btn-evo-close') || evoDlg.dataset.phase === 'done') closeEvoScene();
  else {
    evoTimers.clear();
    evoPhase('done');
  }
});
evoDlg.addEventListener('cancel', (e) => {
  e.preventDefault();
  closeEvoScene();
});

// ベスト更新の特別演出。音はミュートに、動きは「動きの強さ」に従う
function celebrateBest() {
  audio.newBest();
  restartAnim($('result-best'), 'pop-in', 900);
  if (store.settings.motion === 'low') {
    fxLater.later(() => fx.confetti(40), 700);
    return;
  }
  [700, 950, 1200, 1450, 1700].forEach((d) => fxLater.later(() => fx.firework(), d));
  fxLater.later(() => fx.confetti(80, ...fx.free(fx.w / 2, fx.h * 0.25)), 800); // 結果の箱の中から出さない
}

// ---------- 入力 ----------

$('btn-submit').addEventListener('click', submitCurrent);
$('btn-hint').addEventListener('click', showHint);
$('btn-next').addEventListener('click', next);
// 69回目：「全時代を統べる神」も一覧（units）には無いので MIX から探す（前は見つからず、もう一度が効かなかった）
const unitById = (id) => [...units, MIX].find((u) => u.id === id);
$('btn-again').addEventListener('click', () => startUnit(unitById(unit.id), $('btn-again').dataset.review === '1'));
$('btn-home').addEventListener('click', () => renderTitle());

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

// 69回目：「全時代を統べる神」の出題の範囲。えらんだものは端末に残る（次に開いたときも同じ範囲）
const rangeDlg = $('range-dialog');
let rangeSel = new Set();
function syncRange() {
  for (const cb of $('range-list').querySelectorAll('input')) cb.checked = rangeSel.has(cb.value);
  for (const b of $('range-quick').querySelectorAll('.range-chip')) {
    b.setAttribute('aria-pressed', String(b.dataset.ids.split(',').every((id) => rangeSel.has(id))));
  }
  const n = rangeSel.size;
  const c = $('range-count');
  c.classList.toggle('none', !n);
  c.textContent = !n ? '1つ以上えらんでね' : n === units.length ? `全${n}単元から出すよ` : `${n}単元から出すよ`;
  $('btn-range-start').disabled = !n;
}
function openRange() {
  if (rangeDlg.open) return;
  rangeSel = new Set(godUnits().map((x) => x.id));
  const quick = $('range-quick');
  quick.replaceChildren();
  for (const g of [{ name: 'ぜんぶ', ids: units.map((x) => x.id) }, ...RANGE_GROUPS]) {
    const ids = g.ids.filter((id) => units.some((x) => x.id === id));
    if (!ids.length) continue;
    const b = el('button', 'range-chip', g.name);
    b.type = 'button';
    b.dataset.ids = ids.join(',');
    b.addEventListener('click', () => {
      // 全部えらんであるときに まとまりを押したら、そのまとまりだけにする（「近世だけ」をすぐ作れる）。ほかは足す／外す
      if (ids.length < units.length && rangeSel.size === units.length) rangeSel.clear();
      const on = ids.every((id) => rangeSel.has(id));
      for (const id of ids) {
        if (on) rangeSel.delete(id);
        else rangeSel.add(id);
      }
      syncRange();
    });
    quick.append(b);
  }
  const list = $('range-list');
  list.replaceChildren();
  for (const u of units) {
    const lb = el('label');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.value = u.id;
    cb.addEventListener('change', () => {
      if (cb.checked) rangeSel.add(u.id);
      else rangeSel.delete(u.id);
      syncRange();
    });
    lb.append(cb, phrase(u.title));
    list.append(lb);
  }
  syncRange();
  rangeDlg.showModal();
  rangeDlg.scrollTop = 0;
}
// 1つもえらばずに閉じたときは、前の範囲のまま
function keepRange() {
  if (rangeSel.size) {
    const r = cleanRange(units.map((x) => x.id).filter((id) => rangeSel.has(id)));
    if (r) store.godRange = r;
    else delete store.godRange; // 全部なら持たない（保存の形を今までと同じに）
  }
  save(store);
}
function closeRange() {
  keepRange();
  rangeDlg.close();
  renderTitle({ toTop: false });
  const rb = $('btn-range');
  if (rb) setTimeout(() => rb.focus({ preventScroll: true }), 0);
}
$('btn-range-close').addEventListener('click', closeRange);
rangeDlg.addEventListener('cancel', (e) => {
  e.preventDefault();
  closeRange();
});
$('btn-range-start').addEventListener('click', () => {
  if (!rangeSel.size) return;
  keepRange();
  rangeDlg.close();
  startUnit(MIX);
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
  if (dlg.open || $('quit-dialog').open || rangeDlg.open || evoDlg.open || e.ctrlKey || e.metaKey || e.altKey) return;
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
