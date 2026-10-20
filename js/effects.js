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
    this.resize();
    addEventListener('resize', () => this.resize());
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

  confetti(n, x = this.w / 2, y = this.h * 0.35) {
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

  firework(x = this.w * (0.15 + Math.random() * 0.7), y = this.h * (0.12 + Math.random() * 0.3)) {
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
      if (this.parts.length) requestAnimationFrame(tick);
      else {
        c.clearRect(0, 0, this.w, this.h);
        this.running = false;
      }
    };
    requestAnimationFrame(tick);
  }
}
