// 集めたくなるごほうび：ハッピーの着せ替えと称号（純粋関数、テスト対象）
// 解放の条件は、端末内に保存した累計の記録（stats）と単元ごとの記録（records）から決める。
import { SESSION_LENGTH, MAX_STAGE } from './game.js';

// 20回目（1周5問）に festivals・perfect5 を足した。perfects は「20問ぜんぶ正解」の回数（19回目までの記録。もう増えない）
export function emptyStats() {
  return { plays: 0, correct: 0, bestCombo: 0, perfects: 0, festivals: 0, perfect5: 0 };
}

// 1回のプレイを累計に足す。通常モード（にがて問題モードでない）の1周ぶん（total が SESSION_LENGTH 問）だけ、
// 祭りに届いた回数（festivals）と全問正解の回数（perfect5）を数える
export function addPlay(stats, run, { total = 0, review = false } = {}) {
  const s = { ...emptyStats(), ...(stats || {}) };
  const full = !review && total >= SESSION_LENGTH;
  return {
    plays: s.plays + 1,
    correct: s.correct + run.correct,
    bestCombo: Math.max(s.bestCombo, run.maxCombo),
    perfects: s.perfects,
    festivals: s.festivals + (full && run.stage >= MAX_STAGE ? 1 : 0),
    perfect5: s.perfect5 + (full && run.correct === total ? 1 : 0),
  };
}

// 祭り（段階7）に届いた単元の数。難易度ちがいの記録は同じ単元として数え、「全時代を統べる神」モードは数えない
export function festivalUnits(records) {
  const units = new Set();
  for (const [key, r] of Object.entries(records || {})) {
    const id = key.split(':')[0];
    if (r && r.bestStage >= 7 && id !== 'mix') units.add(id);
  }
  return units.size;
}

export const OUTFITS = [
  { id: 'none', name: 'なし', hint: 'はじめから', ok: () => true },
  { id: 'chonmage', name: 'ちょんまげ', hint: '1回 さいごまで遊ぶ', ok: (s) => s.plays >= 1 },
  // 20回目：1周5問では10コンボ・20問ぜんぶ正解に届かないので、何回も遊んで届く条件に変えた。
  // 20問のころに条件を満たした人（10コンボ・20問パーフェクト）は、もらったまま（後ろの条件）
  { id: 'jingasa', name: 'じんがさ', hint: '祭りに 5回 届く', ok: (s) => s.festivals >= 5 || s.bestCombo >= 10 },
  { id: 'eboshi', name: 'えぼし', hint: '5回 遊ぶ', ok: (s) => s.plays >= 5 },
  { id: 'hakase', name: 'はかせぼう', hint: '5問ぜんぶ正解を 3回', ok: (s) => s.perfect5 >= 3 || s.perfects >= 1 },
  { id: 'kabuto', name: 'きんのかぶと', hint: '2つの単元で 祭りに届く', ok: (s, rec) => festivalUnits(rec) >= 2 },
];

export function unlockedOutfits(stats, records) {
  const s = { ...emptyStats(), ...(stats || {}) };
  return OUTFITS.filter((o) => o.ok(s, records || {})).map((o) => o.id);
}

// 前と後をくらべて、新しく解放された着せ替え
export function newOutfits(before, after) {
  const was = new Set(before);
  return after.filter((id) => !was.has(id));
}

// ハッピーの進化（12回目）。遊んだ回数（結果画面まで行ったプレイ。にがて問題・全時代も数える）だけで決まり、
// 正解数には関係しない。最初の進化は2回目で来る。見た目は data-evo（0〜6）で切り替える（style.css）
export const EVOLUTIONS = [
  { min: 0, name: 'はじまりのハッピー', look: 'もとの姿' },
  { min: 2, name: '朱えりのハッピー', look: 'えりが朱色に' },
  { min: 5, name: '花もようのハッピー', look: '胸に花もよう' },
  { min: 10, name: '金えりのハッピー', look: 'えりが金色に・ひもがむらさきに' },
  { min: 20, name: '金かざりのハッピー', look: 'すそと袖に金の線' },
  { min: 35, name: '光のハッピー', look: '後ろに光の輪' },
  { min: 50, name: '伝説のハッピー', look: '光の輪が二重に・星がまわりに' },
];

// 遊んだ回数から進化の段階。next は次の進化までのこり回数（最後の段階なら null）
export function evolutionFor(stats) {
  const p = stats && Number.isInteger(stats.plays) && stats.plays > 0 ? stats.plays : 0;
  let level = 0;
  for (let k = 0; k < EVOLUTIONS.length; k++) if (p >= EVOLUTIONS[k].min) level = k;
  const next = EVOLUTIONS[level + 1];
  // frac：今の段階から次の段階までの進み具合（0〜1。結果画面のゲージ用・16回目）
  const frac = next ? (p - EVOLUTIONS[level].min) / (next.min - EVOLUTIONS[level].min) : 1;
  return { level, name: EVOLUTIONS[level].name, next: next ? { name: next.name, left: next.min - p } : null, frac };
}

// 20回目：1周5問になり1回で増える正解数が4分の1になったので、しきい値を下げた（30・100・300・700 → 10・30・100・250）。
// 1回に約4問正解として、最初の称号は3回目ごろ（20問のころは2回目）。下げただけなので、今までの称号が下がることはない
export const TITLES = [
  { min: 0, name: '歴史たんけん見習い' },
  { min: 10, name: '歴史たんけん隊' },
  { min: 30, name: '歴史ものしり' },
  { min: 100, name: '歴史はかせ' },
  { min: 250, name: '時をかける名人' },
];

// 累計の正解数から称号。next は次の称号までのこり
export function titleFor(stats) {
  const c = (stats && stats.correct) || 0;
  let i = 0;
  for (let k = 0; k < TITLES.length; k++) if (c >= TITLES[k].min) i = k;
  const next = TITLES[i + 1];
  return { name: TITLES[i].name, level: i, next: next ? { name: next.name, left: next.min - c } : null };
}
