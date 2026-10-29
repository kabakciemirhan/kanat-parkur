// One Euro Filter (Casiez ve ark., 2012): yavaş harekette titremeyi bastırır,
// hızlı harekette gecikmeyi azaltır.

function smoothingFactor(dt, cutoff) {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);
}

export class OneEuroFilter {
  constructor({ minCutoff, beta, dCutoff }) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.prevX = null;
    this.prevDx = 0;
    this.prevT = null;
  }

  // t: saniye cinsinden zaman damgası
  filter(x, t) {
    if (this.prevX === null) {
      this.prevX = x;
      this.prevT = t;
      return x;
    }
    const dt = Math.max(t - this.prevT, 1e-3);
    const dx = (x - this.prevX) / dt;
    const aD = smoothingFactor(dt, this.dCutoff);
    const dxHat = aD * dx + (1 - aD) * this.prevDx;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = smoothingFactor(dt, cutoff);
    const xHat = a * x + (1 - a) * this.prevX;
    this.prevX = xHat;
    this.prevDx = dxHat;
    this.prevT = t;
    return xHat;
  }
}

// 33 landmark'ın x ve y koordinatları için filtre bankası
export class LandmarkFilterBank {
  constructor(params, count = 33) {
    this.fx = Array.from({ length: count }, () => new OneEuroFilter(params));
    this.fy = Array.from({ length: count }, () => new OneEuroFilter(params));
  }

  reset() {
    this.fx.forEach((f) => f.reset());
    this.fy.forEach((f) => f.reset());
  }

  // landmarks: [{x,y,z,visibility}] → yumuşatılmış yeni dizi
  apply(landmarks, tSec) {
    return landmarks.map((lm, i) => ({
      x: this.fx[i].filter(lm.x, tSec),
      y: this.fy[i].filter(lm.y, tSec),
      z: lm.z,
      visibility: lm.visibility ?? 1,
    }));
  }
}
