// 紙吹雪と花火（canvas）。motion の強さで粒子数を変える
const COLORS = ['#ff4d6d', '#ffb703', '#ffd60a', '#06d6a0', '#4cc9f0', '#b388ff', '#ffffff'];
const MOTION_SCALE = { high: 1.4, normal: 1, low: 0.35 };

export class Effects {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.parts = [];
    this.motion = 'normal';
    this.running = false;
    // 読んでいる箱（考えている間の問題カード・解説）の枠を返す（main.js が決める）。
    // 粒子はこの枠の「奥」を通る＝枠の中には描かない。粒子の数・速さ・寿命は変えず、重なる順だけ変える
    this.shield = () => [];
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  // 箱を出した（問題を出した・解説を出した）その時点で、箱の中に残っている前のフレームの粒子をすぐ消す。
  // 次のフレームを待つと、1フレームだけ前の絵が箱の上に残る
  cut() {
    for (const r of this.shield()) this.ctx.clearRect(r.left, r.top, r.right - r.left, r.bottom - r.top);
  }

  inShield(x, y, rects = this.shield()) {
    return rects.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
  }

  // 決まった場所が箱に入るときは、箱のすぐ上か下の空いた所へずらす（いちばん近い所。無ければそのまま）
  free(x, y) {
    const rects = this.shield();
    if (!this.inShield(x, y, rects)) return [x, y];
    const ys = rects.flatMap((r) => [r.top - 24, r.bottom + 24])
      .filter((v) => v >= 24 && v <= this.h - 24 && !this.inShield(x, v, rects))
      .sort((a, b) => Math.abs(a - y) - Math.abs(b - y));
    return ys.length ? [x, ys[0]] : [x, y];
  }

  // 花火の場所：今までどおり画面の上のほうから選び、箱に入るときは選び直す（上のほうが空いていなければ画面全体から）
  spot() {
    const rects = this.shield();
    const pick = (y0, y1) => [this.w * (0.15 + Math.random() * 0.7), this.h * (y0 + Math.random() * (y1 - y0))];
    for (let i = 0; i < 10; i++) {
      const p = pick(0.12, 0.42);
      if (!this.inShield(p[0], p[1], rects)) return p;
    }
    for (let i = 0; i < 20; i++) {
      const p = pick(0.06, 0.94);
      if (!this.inShield(p[0], p[1], rects)) return p;
    }
    return pick(0.12, 0.42);
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  count(n) {
    return Math.max(1, Math.round(n * (MOTION_SCALE[this.motion] || 1)));
  }

  confetti(n, x, y) {
    if (x === undefined) [x, y] = this.free(this.w / 2, this.h * 0.35);
    for (let i = 0; i < this.count(n); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 3 + Math.random() * 7;
      this.parts.push({
        kind: 'paper', x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        size: 5 + Math.random() * 6,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: 90 + Math.random() * 60,
      });
    }
    this.run();
  }

  firework(x, y) {
    if (x === undefined) [x, y] = this.spot();
    const color = COLORS[(Math.random() * (COLORS.length - 1)) | 0];
    const n = this.count(46);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const v = 2.5 + Math.random() * 2.5;
      this.parts.push({
        kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size: 2.2, color, life: 50 + Math.random() * 25,
      });
    }
    this.run();
  }

  run() {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      const c = this.ctx;
      c.clearRect(0, 0, this.w, this.h);
      this.parts = this.parts.filter((p) => p.life > 0 && p.y < this.h + 40);
      // 箱の中は描かない（画面全体から箱をくり抜いた形で切り抜く）。箱の外は今までどおり手前を飛ぶ
      const rects = this.shield();
      c.save();
      if (rects.length) {
        c.beginPath();
        c.rect(0, 0, this.w, this.h);
        for (const r of rects) c.rect(r.left, r.top, r.right - r.left, r.bottom - r.top);
        c.clip('evenodd');
      }
      for (const p of this.parts) {
        p.life--;
        p.x += p.vx;
        p.y += p.vy;
        if (p.kind === 'paper') {
          p.vx *= 0.97;
          p.vy = p.vy * 0.97 + 0.18;
          p.rot += p.vr;
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.globalAlpha = Math.min(1, p.life / 30);
          c.fillStyle = p.color;
          c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          c.restore();
        } else {
          p.vx *= 0.96;
          p.vy = p.vy * 0.96 + 0.05;
          c.globalAlpha = Math.min(1, p.life / 25);
          c.fillStyle = p.color;
          c.beginPath();
          c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          c.fill();
          c.globalAlpha = 1;
        }
      }
      c.restore();
      if (this.parts.length) requestAnimationFrame(tick);
      else {
        c.clearRect(0, 0, this.w, this.h);
        this.running = false;
      }
    };
    requestAnimationFrame(tick);
  }
}
