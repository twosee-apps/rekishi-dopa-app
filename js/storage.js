// 記録と設定を端末内（localStorage）に保存する。外部には送信しない。
import { SESSION_LENGTH, DIFFICULTIES, MAX_STAGE } from './game.js';
import { OUTFITS } from './rewards.js';

export const STORAGE_KEY = 'rekishi-dopa:v1';

export function defaultSettings(prefersReducedMotion = false) {
  return { motion: prefersReducedMotion ? 'low' : 'normal', muted: false, bgm: true, difficulty: 'normal' };
}

export function emptyRecord() {
  return { plays: 0, bestScore: 0, bestCorrect: 0, bestCombo: 0, bestStage: 0 };
}

function getStore(store) {
  if (store) return store;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function emptyData(prefersReducedMotion = false) {
  return { settings: defaultSettings(prefersReducedMotion), records: {}, lastUnit: null, weak: {}, stats: null, outfit: 'none' };
}

// 単元の id（app/data/units.json と同じ。単元を足したらここにも足す。tests/ui25.test.js が突き合わせる）と、
// 「全時代を統べる神」モードの id
export const UNIT_IDS = ['kofun', 'asuka', 'nara', 'azuchi', 'edo', 'meiji', 'rikken', 'nisshin'];
export const MIX_ID = 'mix';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
// 0以上 max 以下の整数だけ通す（ほかは null）
const intIn = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);

// 記録の数の上限（ふつうに遊んで届く値よりずっと大きく、表示がこわれない値）
const LIMIT = { plays: 1000000, bestScore: 10000000, bestCorrect: 1000, bestCombo: 1000, len: 100 };

// 設定は今ある選択肢だけを通す（ほかは既定値）
function cleanSettings(v, base) {
  const out = { ...base };
  if (!isObj(v)) return out;
  if (['low', 'normal', 'high'].includes(v.motion)) out.motion = v.motion;
  if (typeof v.muted === 'boolean') out.muted = v.muted;
  if (typeof v.bgm === 'boolean') out.bgm = v.bgm;
  if (Object.keys(DIFFICULTIES).includes(v.difficulty)) out.difficulty = v.difficulty;
  return out;
}

// 単元ごとの記録（25回目）。キーは「単元 id」か「単元 id:easy／hard」（全時代は mix）。知らないキーの記録は捨てる。
// 項目は今ある形（mergeRecord が書くもの）だけ通し、数が壊れていたら 0（len は捨てて20問の記録として扱う）。
// 今ある正しい記録は、1つも変わらない（項目がそろっていない古い記録も、ある項目だけそのまま）
const RECORD_KEY = new RegExp(`^(${[...UNIT_IDS, MIX_ID].join('|')})(:(easy|hard))?$`);
function cleanRecord(r) {
  if (!isObj(r)) return null;
  const out = {};
  if ('len' in r && intIn(r.len, LIMIT.len) >= 1) out.len = r.len;
  for (const k of ['plays', 'bestScore', 'bestCorrect', 'bestCombo']) if (k in r) out[k] = intIn(r[k], LIMIT[k]) ?? 0;
  if ('bestStage' in r) out.bestStage = intIn(r.bestStage, MAX_STAGE) ?? 0;
  // 20問のころのベスト（20回目）。len がないものは中身が読めないので捨てる
  if (isObj(r.old) && intIn(r.old.len, LIMIT.len) >= 1) {
    out.old = { len: r.old.len };
    for (const k of ['bestScore', 'bestCorrect', 'bestCombo']) out.old[k] = intIn(r.old[k], LIMIT[k]) ?? 0;
  }
  return out;
}
function cleanRecords(v) {
  const out = {};
  if (!isObj(v)) return out;
  for (const [k, r] of Object.entries(v)) {
    if (!RECORD_KEY.test(k)) continue;
    const c = cleanRecord(r);
    if (c) out[k] = c;
  }
  return out;
}

// 保存の形に読み直す（壊れた値・知らない値は既定値にするか捨てる）。load と、記録の引き継ぎ（24回目）で同じ掃除を通す。
// 25回目：記録の中身（records）・設定・着せ替え・最後に遊んだ単元も、決まった値だけ通すようにした
export function cleanData(data, prefersReducedMotion = false) {
  const base = emptyData(prefersReducedMotion);
  if (!isObj(data)) return base;
  return {
    settings: cleanSettings(data.settings, base.settings),
    records: cleanRecords(data.records),
    lastUnit: [...UNIT_IDS, MIX_ID].includes(data.lastUnit) ? data.lastUnit : null,
    weak: cleanWeak(data.weak),
    stats: cleanStats(data.stats),
    outfit: OUTFITS.some((o) => o.id === data.outfit) ? data.outfit : 'none',
  };
}

export function load(store, prefersReducedMotion = false) {
  const s = getStore(store);
  if (!s) return emptyData(prefersReducedMotion);
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return emptyData(prefersReducedMotion);
    return cleanData(JSON.parse(raw), prefersReducedMotion);
  } catch {
    return emptyData(prefersReducedMotion);
  }
}

// ---- 記録の引き継ぎ（24回目）----
// 公開 URL を、前の場所（個人のアカウントの github.io）から twosee-apps.github.io へ移した。端末の記録はサイトごとに別なので、
// 古い URL の転送ページが、古い側の localStorage['rekishi-dopa:v1'] の中身（JSON 文字列の UTF-8 を base64url にしたもの）を
// 新しい URL の「#import=…」に付けて飛ばす。hash はサーバーに送られない（外部への送信はない）
export const IMPORT_PREFIX = '#import=';
export const IMPORT_MAX_BYTES = 1000000; // 1MB をこえるものは読まない（ふつうの記録は数KB）

// base64url（パディングあり・なしどちら）→ JSON。読めなければ null
export function decodeImport(encoded) {
  if (typeof encoded !== 'string' || !encoded || encoded.length > Math.ceil(IMPORT_MAX_BYTES / 3) * 4 + 4) return null;
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) return null;
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    if (bin.length > IMPORT_MAX_BYTES) return null;
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

// 記録が1つでもあるか（遊んだ回数・単元の記録・にがて問題のどれか）
export function hasRecords(d) {
  return !!d && ((d.stats ? d.stats.plays : 0) > 0 || Object.keys(d.records || {}).length > 0 || Object.keys(d.weak || {}).length > 0);
}

// 引き継ぐかを決める。25回目：**新しい側が空のときだけ**取り込む（記録が1つでもあれば、どんな中身でも取り込まない）。
// 引き継ぎは古い URL から初めて移る1回のためのもの。24回目は「遊んだ回数が多いほう」を残していたが、
// 遊んだ回数を大きくした細工の URL で今の記録を置きかえられてしまうのでやめた
export function chooseImport(current, incoming) {
  if (!hasRecords(incoming) || hasRecords(current)) return null;
  return incoming;
}

// 「#import=」のあとの文字列から記録を引き継いで保存する。引き継いだら true。壊れていても例外を出さない
export function importRecords(encoded, store, prefersReducedMotion = false) {
  try {
    const raw = decodeImport(encoded);
    if (!raw) return false;
    const incoming = cleanData(raw, prefersReducedMotion);
    const next = chooseImport(load(store, prefersReducedMotion), incoming);
    return next ? save(next, store) : false;
  } catch {
    return false;
  }
}

// 累計の記録（遊んだ回数など）。オブジェクトでなければ null、数が壊れていれば 0 にする（12回目：進化の段階に使うため）
function cleanStats(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const n = (x) => intIn(x, 100000000) ?? 0; // 25回目：上限も（表示がこわれない値）
  return { plays: n(v.plays), correct: n(v.correct), bestCombo: n(v.bestCombo), perfects: n(v.perfects),
    festivals: n(v.festivals), perfect5: n(v.perfect5) };
}

// にがて問題の記録 { 単元id: [問題id, ...] } を、壊れた値を捨てて読み直す
// 25回目：単元は UNIT_IDS のものだけ、問題 id は「単元 id-英字と数字」の形だけ、1単元 500問まで
function cleanWeak(w) {
  const out = {};
  if (!w || typeof w !== 'object' || Array.isArray(w)) return out;
  for (const [unitId, ids] of Object.entries(w)) {
    if (!UNIT_IDS.includes(unitId) || !Array.isArray(ids)) continue;
    const re = new RegExp(`^${unitId}-[a-z][0-9]{1,4}$`);
    const list = [...new Set(ids.filter((x) => typeof x === 'string' && re.test(x)))].slice(0, 500);
    if (list.length) out[unitId] = list;
  }
  return out;
}

// 1問の結果をにがて問題の記録に反映した新しい記録を返す（まちがえたら追加、正解したら外す）
export function updateWeak(weak, unitId, questionId, isCorrect) {
  const list = (weak && weak[unitId]) || [];
  const next = isCorrect ? list.filter((x) => x !== questionId)
    : list.includes(questionId) ? list : [...list, questionId];
  const out = { ...(weak || {}) };
  if (next.length) out[unitId] = next;
  else delete out[unitId];
  return out;
}

// 28回目：リベンジで正解した問題（{ unitId, id }）のうち、にがて問題の記録に残っている数
// （リベンジでは記録を変えないので、まちがえて入った問題は残る。「おしい」で入らなかった問題は数えない）
export function weakKept(weak, won) {
  return won.filter((q) => ((weak && weak[q.unitId]) || []).includes(q.id)).length;
}

export function save(data, store) {
  const s = getStore(store);
  if (!s) return false;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// 20回目（1周を20問から5問に）：記録に1周の問題数 len を持たせる。len のない記録は19回目までの20問の記録。
// 点数・正解数・コンボは問題数で大きさが変わるので、問題数のちがう記録とは比べない（5問のベストは0から）。
// 20問の記録は消さずに old に移して残す。遊んだ回数（plays）と到達段階（bestStage・祭りの単元数に使う）は引きつぐ
export function recordLen(record) {
  return record && Number.isInteger(record.len) ? record.len : 20;
}

// 今の問題数でのベスト（問題数のちがう記録なら null）
export function currentBest(record, len = SESSION_LENGTH) {
  if (!record || !record.plays || recordLen(record) !== len) return null;
  return { bestScore: record.bestScore || 0, bestCorrect: record.bestCorrect || 0, bestCombo: record.bestCombo || 0 };
}

// 問題数のちがう古い記録のベスト（なければ null）。一度移したもの（old）もここから読む
export function oldBest(record, len = SESSION_LENGTH) {
  if (!record || !record.plays) return null;
  if (recordLen(record) !== len) {
    return { len: recordLen(record), bestScore: record.bestScore || 0, bestCorrect: record.bestCorrect || 0, bestCombo: record.bestCombo || 0 };
  }
  return record.old && typeof record.old === 'object' ? record.old : null;
}

// プレイ結果を記録にまとめる（新しい記録オブジェクトを返す）
export function mergeRecord(record, run, len = SESSION_LENGTH) {
  const r = { ...emptyRecord(), ...(record || {}) };
  const cur = currentBest(record, len) || { bestScore: 0, bestCorrect: 0, bestCombo: 0 };
  const old = oldBest(record, len);
  return {
    len,
    plays: r.plays + 1,
    bestScore: Math.max(cur.bestScore, run.score),
    bestCorrect: Math.max(cur.bestCorrect, run.correct),
    bestCombo: Math.max(cur.bestCombo, run.maxCombo),
    bestStage: Math.max(r.bestStage, run.stage),
    ...(old ? { old } : {}),
  };
}

// ベスト記録の更新状況（結果画面の特別演出用）。更新でなければ null
// kind: 'first'＝今の問題数ではじめての記録（20問の記録しかない場合も）、'update'＝前のベストをこえた
export function bestStatus(record, run, len = SESSION_LENGTH) {
  const cur = currentBest(record, len);
  const before = cur ? cur.bestScore : 0;
  if (!run || run.score <= before) return null;
  return { kind: before > 0 ? 'update' : 'first', before, after: run.score };
}
