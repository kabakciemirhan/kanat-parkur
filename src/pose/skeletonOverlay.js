import { CONFIG } from '../config.js';

// Gösterilecek kemikler (yüz noktaları hariç)
const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32], [27, 29], [28, 30],
];
const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

// Canvas üzerine iskelet çizer. Canvas CSS ile aynalandığı için koordinatlar ham kalır.
export class SkeletonOverlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  // Canvas çözünürlüğünü görüntülendiği boyuta eşitler
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  draw(landmarks) {
    this.resize();
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks) return;

    const cfg = CONFIG.skeleton;
    const scale = canvas.width / Math.max(this.canvas.clientWidth, 1);
    const visTh = CONFIG.tracking.visibilityThreshold;
    const px = (lm) => [lm.x * canvas.width, lm.y * canvas.height];
    // Düşük görünürlüklü eklemler soluk çizilir
    const alpha = (v) => (v >= visTh ? 1 : 0.25);

    ctx.lineCap = 'round';
    ctx.lineWidth = cfg.boneWidth * scale;
    ctx.strokeStyle = cfg.boneColor;
    for (const [a, b] of BONES) {
      const la = landmarks[a], lb = landmarks[b];
      ctx.globalAlpha = Math.min(alpha(la.visibility), alpha(lb.visibility));
      const [ax, ay] = px(la);
      const [bx, by] = px(lb);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    ctx.fillStyle = cfg.jointColor;
    for (const i of JOINTS) {
      const lm = landmarks[i];
      ctx.globalAlpha = alpha(lm.visibility);
      const [x, y] = px(lm);
      ctx.beginPath();
      ctx.arc(x, y, cfg.jointRadius * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
