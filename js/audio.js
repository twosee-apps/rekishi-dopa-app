// Web Audio API で BGM と効果音をその場で合成する（音声ファイルは使わない）
import { STAGES } from './game.js';

// D の陽音階（D E G A B）を中心にした音名 → 周波数
const NOTE = {
  D2: 73.42, E2: 82.41, G2: 98.0, A2: 110.0, B2: 123.47,
  D3: 146.83, E3: 164.81, Fs3: 185.0, G3: 196.0, A3: 220.0, B3: 246.94,
  D4: 293.66, E4: 329.63, Fs4: 369.99, G4: 392.0, A4: 440.0, B4: 493.88,
  D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, B5: 987.77, D6: 1174.66,
};
const SCALE = [NOTE.D4, NOTE.E4, NOTE.G4, NOTE.A4, NOTE.B4, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A5, NOTE.B5, NOTE.D6];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bgmOn = true;
    this.stage = 0;
    this.playing = false;
    this.step = 0;
    this.bar = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  // ユーザー操作の中で呼ぶ（自動再生制限のため）
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(comp);
    this.bgmBus = ctx.createGain();
    this.bgmBus.gain.value = this.bgmOn ? 0.55 : 0;
    this.bgmBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    // ノイズ（ハイハット・太鼓の皮の音用）
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  setBgm(on) {
    this.bgmOn = on;
    if (this.ctx) this.bgmBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
  }

  setStage(s) {
    this.stage = s;
  }

  start() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.bar = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    const ahead = this.ctx.currentTime + 0.12;
    while (this.nextTime < ahead) {
      this.playStep(this.step, this.bar, this.nextTime);
      const spb = 60 / STAGES[this.stage].bpm;
      this.nextTime += spb / 4;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar = (this.bar + 1) % 4;
    }
  }

  // 流れ続ける音（BGM）は拍子木のカウント音だけ（6回目）。段階1から1拍ごとに鳴り、テンポは段階で上がる。
  // 以前の、段階に応じて重ねていた層（キック・ハイハット・ベース・メロディ・和太鼓・鈴・和音・手拍子）は外した
  playStep(step, bar, t) {
    if (this.stage >= 1 && step % 4 === 0) this.wood(t, step === 0 ? 1400 : 1100, 0.16, this.bgmBus);
  }

  // ---- 楽器 ----

  env(t, peak, dur, attack = 0.005) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  tone(t, freq, dur, type, peak, out, cutoff) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = this.env(t, peak, dur);
    if (cutoff) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      o.connect(f).connect(g);
    } else {
      o.connect(g);
    }
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  wood(t, freq, peak, out) {
    this.tone(t, freq, 0.05, 'sine', peak, out);
  }


  noiseHit(t, dur, peak, type, freq, out) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.env(t, peak, dur, 0.002);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }




  taiko(t, peak, out) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.25);
    const g = this.env(t, peak, 0.4, 0.003);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.45);
    this.noiseHit(t, 0.06, peak * 0.4, 'lowpass', 900, out);
  }

  // ---- 効果音 ----

  correct(combo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    const base = Math.min(combo, 6);
    for (let i = 0; i < 3; i++) {
      this.tone(t + i * 0.07, SCALE[base + i * 2] || NOTE.D6, 0.22, 'triangle', 0.3, this.sfxBus);
    }
    this.tone(t + 0.21, (SCALE[base + 4] || NOTE.D6) * 2, 0.35, 'sine', 0.15, this.sfxBus);
  }

  wrong() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    this.tone(t, NOTE.A3, 0.18, 'sine', 0.2, this.sfxBus);
    this.tone(t + 0.14, NOTE.Fs3, 0.3, 'sine', 0.18, this.sfxBus);
  }

  stageUp(stage) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.3;
    const notes = [NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A5, NOTE.B5, NOTE.D6];
    const n = Math.min(3 + stage, notes.length);
    for (let i = 0; i < n; i++) this.tone(t + i * 0.06, notes[i], 0.3, 'square', 0.08, this.sfxBus, 3000);
    this.taiko(t, 0.6, this.sfxBus);
  }

  // コンボの節目：段階が上がるほど高く、音の数も増える
  comboMilestone(combo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.12;
    const notes = [NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A5, NOTE.B5, NOTE.D6];
    const n = Math.min(notes.length, 2 + Math.floor(combo / 4));
    for (let i = 0; i < n; i++) this.tone(t + i * 0.05, notes[i] * (combo >= 10 ? 2 : 1), 0.18, 'square', 0.06, this.sfxBus, 4000);
    if (combo >= 10) this.taiko(t, 0.5, this.sfxBus);
  }

  // ベスト記録こうしん：上がっていく音階と、高い鈴の音
  newBest() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.7;
    const notes = [NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A5, NOTE.B5, NOTE.D6];
    notes.forEach((f, i) => this.tone(t + i * 0.09, f, 0.25, 'triangle', 0.14, this.sfxBus));
    for (let i = 0; i < 4; i++) this.tone(t + 0.6 + i * 0.12, NOTE.D6 * 2, 0.3, 'sine', 0.06, this.sfxBus);
    this.taiko(t + 0.55, 0.6, this.sfxBus);
  }

  finish() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    for (const f of [NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.D5]) this.tone(t, f, 1.2, 'triangle', 0.12, this.sfxBus);
    this.taiko(t, 0.7, this.sfxBus);
    this.taiko(t + 0.25, 0.7, this.sfxBus);
  }
}
