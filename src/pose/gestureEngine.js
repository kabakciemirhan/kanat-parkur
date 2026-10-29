import { CONFIG } from '../config.js';

// MediaPipe Pose landmark indeksleri
const LM = {
  nose: 0,
  lShoulder: 11, rShoulder: 12,
  lWrist: 15, rWrist: 16,
  lHip: 23, rHip: 24,
  lKnee: 25, rKnee: 26,
  lAnkle: 27, rAnkle: 28,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(v, 0, 1);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// b noktasındaki a-b-c açısı (derece)
function angleDeg(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
  return (Math.acos(clamp(cos, -1, 1)) * 180) / Math.PI;
}

// Deadzone uygular ve kalan aralığı yeniden 0..1'e ölçekler
function applyDeadzone(v, dz) {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return Math.sign(v) * ((a - dz) / (1 - dz));
}

// Basit üstel yumuşatmalı hız ölçer (birim/saniye)
class Velocity {
  constructor(smoothing = 0.5) {
    this.k = smoothing;
    this.reset();
  }
  reset() {
    this.prev = null;
    this.value = 0;
  }
  update(x, dt) {
    if (this.prev !== null && dt > 0) {
      const raw = (x - this.prev) / dt;
      this.value = this.k * raw + (1 - this.k) * this.value;
    }
    this.prev = x;
    return this.value;
  }
}

// Klavye yedeği: kamera yokken ya da test için hareketleri taklit eder
export class KeyboardInput {
  constructor() {
    this.held = new Set();
    this.pendingFlap = false;
    this.pendingJump = false;
    const handled = ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyT'];
    window.addEventListener('keydown', (e) => {
      if (!handled.includes(e.code)) return;
      e.preventDefault();
      if (e.repeat) return;
      this.held.add(e.code);
      if (e.code === 'Space') this.pendingFlap = true;
      if (e.code === 'ArrowUp') this.pendingJump = true;
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  // Bu karedeki klavye girdisini döndürür; tek seferlik olaylar tüketilir
  read() {
    const out = {
      flap: this.pendingFlap,
      jump: this.pendingJump,
      bank: (this.held.has('ArrowRight') ? 1 : 0) - (this.held.has('ArrowLeft') ? 1 : 0),
      squat: this.held.has('ArrowDown'),
      tuck: this.held.has('KeyT'),
      any: this.held.size > 0 || this.pendingFlap || this.pendingJump,
    };
    this.pendingFlap = false;
    this.pendingJump = false;
    return out;
  }
}

export class GestureEngine {
  constructor() {
    this.keyboard = new KeyboardInput();
    this.counts = { flap: 0, jump: 0, squat: 0, bank: 0 };
    this.resetBaseline();
    this._resetMotionState();
    this.lastSeenMs = -Infinity;
    this.lastMs = null;
    this.metrics = {};
  }

  // Taban çizgisini sıfırlar; takip stabil olunca yeniden yakalanır (R tuşu)
  resetBaseline() {
    this.baseline = null;
    this._capture = null;
  }

  _resetMotionState() {
    this.flapState = { armed: false, top: 0, peakSpeed: 0, lastEventMs: -Infinity };
    this.jumpState = { airborne: false, lastEventMs: -Infinity };
    this.glideSince = null;
    this.vArmY = new Velocity(0.6);
    this.vHipY = new Velocity(0.6);
    this.vWristL = { x: new Velocity(0.5), y: new Velocity(0.5) };
    this.vWristR = { x: new Velocity(0.5), y: new Velocity(0.5) };
    this.wasSquatting = false;
    this.lastBankSign = 0;
  }

  // landmarks: yumuşatılmış normalize landmark dizisi; null = kişi yok,
  // undefined = bu render karesinde yeni kamera karesi yok (son poz durumu korunur)
  // aspect: video genişlik/yükseklik oranı, nowMs: performance.now()
  update(landmarks, aspect, nowMs) {
    if (landmarks === undefined) return this._repeatLast(nowMs);
    const dt = this.lastMs === null ? 0 : (nowMs - this.lastMs) / 1000;
    this.lastMs = nowMs;
    const cfg = CONFIG;
    const visTh = cfg.tracking.visibilityThreshold;

    const out = {
      flap: { event: false, strength: 0 },
      glide: false,
      bank: 0,
      squatDepth: 0,
      jump: false,
      wingsTucked: false,
      tracked: false,
    };
    const m = { visibility: {}, baselineProgress: this.baseline ? 1 : (this._capture?.progress ?? 0) };

    // Aynalanmış ve en-boy düzeltilmiş koordinatlar: x kullanıcının kendi solu/sağı ile eşleşir
    const p = landmarks
      ? landmarks.map((l) => ({ x: (1 - l.x) * aspect, y: l.y, v: l.visibility ?? 0 }))
      : null;
    const vis = (i) => (p ? p[i].v >= visTh : false);
    for (const [name, i] of Object.entries(LM)) m.visibility[name] = p ? p[i].v : 0;

    // --- Takip durumu: omuzlar ve kalçalar görünür mü? ---
    const coreVisible = vis(LM.lShoulder) && vis(LM.rShoulder) && vis(LM.lHip) && vis(LM.rHip);
    if (coreVisible) this.lastSeenMs = nowMs;
    out.tracked = nowMs - this.lastSeenMs < cfg.tracking.lostTimeoutMs;

    if (coreVisible) {
      const lSh = p[LM.lShoulder], rSh = p[LM.rShoulder];
      const lHip = p[LM.lHip], rHip = p[LM.rHip];
      const S = Math.max(dist(lSh, rSh), 1e-3); // omuz genişliği: tüm mesafelerin birimi
      const shMid = mid(lSh, rSh);
      const hipMid = mid(lHip, rHip);
      const anklesVisible = vis(LM.lAnkle) && vis(LM.rAnkle);
      const ankleY = anklesVisible ? (p[LM.lAnkle].y + p[LM.rAnkle].y) / 2 : null;
      // Kalça yüksekliği: ayak bileklerine göre (mesafeden bağımsız oran)
      const legRatio = anklesVisible ? (ankleY - hipMid.y) / S : null;
      m.S = S;

      this._updateBaseline({ S, hipY: hipMid.y, ankleY, legRatio }, dt);
      const b = this.baseline;

      // --- Bank: omuz hattı açısı + omuz/kalça yatay kayması ---
      const rollDeg = (Math.atan2(lSh.y - rSh.y, rSh.x - lSh.x) * 180) / Math.PI; // + = sol omuz aşağıda
      const rollNorm = clamp(-rollDeg / cfg.bank.maxRollDeg, -1, 1);
      const shift = (shMid.x - hipMid.x) / S;
      const shiftNorm = clamp(shift / cfg.bank.maxShift, -1, 1);
      const bankRaw = clamp(cfg.bank.rollWeight * rollNorm + cfg.bank.shiftWeight * shiftNorm, -1, 1);
      out.bank = applyDeadzone(bankRaw, cfg.bank.deadzone);
      Object.assign(m, { rollDeg, shift, bankRaw });

      // --- Squat: kalça düşüşü (birincil) + diz açısı (yedek); büyüğü alınır ---
      let hipDrop = 0;
      if (b) {
        if (legRatio !== null && b.legRatio !== null) hipDrop = b.legRatio - legRatio;
        else hipDrop = (hipMid.y - b.hipY) / S;
      }
      const hipDepth = clamp01((hipDrop - cfg.squat.minDrop) / (cfg.squat.fullDrop - cfg.squat.minDrop));
      const kneeAngles = [];
      if (vis(LM.lHip) && vis(LM.lKnee) && vis(LM.lAnkle)) kneeAngles.push(angleDeg(lHip, p[LM.lKnee], p[LM.lAnkle]));
      if (vis(LM.rHip) && vis(LM.rKnee) && vis(LM.rAnkle)) kneeAngles.push(angleDeg(rHip, p[LM.rKnee], p[LM.rAnkle]));
      const kneeDeg = kneeAngles.length ? kneeAngles.reduce((a, c) => a + c, 0) / kneeAngles.length : null;
      const kneeDepth = kneeDeg === null ? 0
        : clamp01((cfg.squat.kneeStraightDeg - kneeDeg) / (cfg.squat.kneeStraightDeg - cfg.squat.kneeDeepDeg));
      out.squatDepth = Math.max(hipDepth, kneeDepth);
      Object.assign(m, { hipDrop, hipDepth, kneeDeg, kneeDepth });

      // --- Jump: ayak bilekleri tabandan yükselir + kalça hızla yukarı çıkar ---
      const hipUpSpeed = -this.vHipY.update(hipMid.y / S, dt); // + = yukarı (S/sn)
      let ankleRise = null, hipRise = null;
      if (b) {
        if (ankleY !== null && b.ankleY !== null) ankleRise = (b.ankleY - ankleY) / S;
        hipRise = (b.hipY - hipMid.y) / S;
      }
      const js = this.jumpState;
      const rise = ankleRise !== null ? ankleRise : hipRise;
      const riseTh = ankleRise !== null ? cfg.jump.ankleRise : cfg.jump.hipOnlyRise;
      if (rise !== null) {
        if (!js.airborne && rise > riseTh && hipUpSpeed > cfg.jump.hipRiseSpeed
            && nowMs - js.lastEventMs > cfg.jump.cooldownMs) {
          out.jump = true;
          js.airborne = true;
          js.lastEventMs = nowMs;
        } else if (js.airborne && rise < riseTh * 0.5) {
          js.airborne = false; // yere indi
        }
      }
      Object.assign(m, { hipUpSpeed, ankleRise, hipRise, airborne: js.airborne });

      // --- Kol metrikleri ---
      const lWv = vis(LM.lWrist), rWv = vis(LM.rWrist);
      const lW = p[LM.lWrist], rW = p[LM.rWrist];
      const armYL = (lW.y - lSh.y) / S; // + = bilek omuzun altında
      const armYR = (rW.y - rSh.y) / S;
      let armY = null;
      if (lWv && rWv) armY = (armYL + armYR) / 2;
      else if (lWv) armY = armYL;
      else if (rWv) armY = armYR;
      const wristSpeed = Math.max(
        Math.hypot(this.vWristL.x.update(lW.x / S, dt), this.vWristL.y.update(lW.y / S, dt)),
        Math.hypot(this.vWristR.x.update(rW.x / S, dt), this.vWristR.y.update(rW.y / S, dt)),
      );
      Object.assign(m, { armY, armYL, armYR, wristSpeed });

      // --- Wings tucked: bilekler başın üstünde ve birbirine yakın ---
      if (lWv && rWv) {
        const nose = p[LM.nose];
        const gap = dist(lW, rW) / S;
        const aboveNose = (nose.y - Math.max(lW.y, rW.y)) / S; // + = iki bilek de burnun üstünde
        out.wingsTucked = aboveNose > cfg.wingsTucked.aboveNose && gap < cfg.wingsTucked.maxWristGap;
        Object.assign(m, { wristGap: gap, aboveNose });
      }

      // --- Flap: yukarıda kurulur, hızlı iniş + yeterli genlikle tetiklenir ---
      const fs = this.flapState;
      if (armY !== null) {
        const armSpeed = this.vArmY.update(armY, dt); // + = aşağı
        if (out.wingsTucked) {
          fs.armed = false; // kanat kapama pozu flap kurmasın
        } else if (!fs.armed) {
          if (armY < cfg.flap.armUpLevel) {
            fs.armed = true;
            fs.top = armY;
            fs.peakSpeed = 0;
          }
        } else {
          fs.top = Math.min(fs.top, armY);
          fs.peakSpeed = Math.max(fs.peakSpeed, armSpeed);
          if (armY > cfg.flap.armDownLevel) {
            const amplitude = armY - fs.top;
            if (fs.peakSpeed > cfg.flap.minDownSpeed && nowMs - fs.lastEventMs > cfg.flap.cooldownMs) {
              out.flap.event = true;
              out.flap.strength = clamp01(
                0.5 * (amplitude / cfg.flap.refAmplitude) + 0.5 * (fs.peakSpeed / cfg.flap.refSpeed),
              );
              fs.lastEventMs = nowMs;
              m.lastFlapAmp = amplitude;
              m.lastFlapSpeed = fs.peakSpeed;
            }
            fs.armed = false; // histerezis: yeniden kurmak için kollar tekrar yukarı çıkmalı
          }
        }
        Object.assign(m, { armSpeed, flapArmed: fs.armed });
      }

      // --- Glide (T-poz): kollar omuz hizasında, açık ve sabit ---
      let tPose = false;
      if (lWv && rWv) {
        const spanL = (lSh.x - lW.x) / S; // sol bilek omuzun solunda
        const spanR = (rW.x - rSh.x) / S;
        const tol = cfg.glide.armLevelTolerance;
        tPose = Math.abs(armYL) < tol && Math.abs(armYR) < tol
          && spanL > cfg.glide.minArmSpan && spanR > cfg.glide.minArmSpan
          && wristSpeed < cfg.glide.maxWristSpeed;
        Object.assign(m, { spanL, spanR });
      }
      if (tPose) this.glideSince ??= nowMs;
      else this.glideSince = null;
      out.glide = this.glideSince !== null && nowMs - this.glideSince >= cfg.glide.holdMs;
    } else {
      // Takip yok: hız ölçerlerin eski değerlerle sıçramaması için sıfırla
      this.vArmY.reset();
      this.vHipY.reset();
      this.flapState.armed = false;
      this.glideSince = null;
      if (!out.tracked) this._capture = null;
    }

    // Takip kaybolduysa nötr çıktı (oyuncu lehine: yanlış hareket üretme)
    if (!out.tracked) {
      out.flap = { event: false, strength: 0 };
      out.glide = false;
      out.bank = 0;
      out.squatDepth = 0;
      out.jump = false;
      out.wingsTucked = false;
    }

    this.lastPoseOut = { ...out, flap: { ...out.flap } };
    this._mergeKeyboard(out);
    this._count(out);
    m.keyboard = this._lastKeyboard;
    this.metrics = m;
    return out;
  }

  // Yeni kamera karesi yokken: sürekli değerler aynı kalır, tek seferlik olaylar tekrar edilmez
  _repeatLast(nowMs) {
    const base = this.lastPoseOut ?? {
      flap: { event: false, strength: 0 }, glide: false, bank: 0,
      squatDepth: 0, jump: false, wingsTucked: false, tracked: false,
    };
    const out = { ...base, flap: { event: false, strength: 0 }, jump: false };
    out.tracked = nowMs - this.lastSeenMs < CONFIG.tracking.lostTimeoutMs;
    if (!out.tracked) Object.assign(out, { glide: false, bank: 0, squatDepth: 0, wingsTucked: false });
    this._mergeKeyboard(out);
    this._count(out);
    this.metrics.keyboard = this._lastKeyboard;
    return out;
  }

  // Klavye girdisi basılıysa pozdan gelen değeri geçersiz kılar
  _mergeKeyboard(out) {
    const k = this.keyboard.read();
    const kc = CONFIG.keyboard;
    this._lastKeyboard = k.any;
    if (k.flap) out.flap = { event: true, strength: kc.flapStrength };
    if (k.jump) out.jump = true;
    if (k.bank !== 0) out.bank = k.bank * kc.bankValue;
    if (k.squat) out.squatDepth = kc.squatDepth;
    if (k.tuck) out.wingsTucked = true;
  }

  // Egzersiz sayaçları (squat ve eğilme: eşiği geçen her tekrar bir sayılır)
  _count(out) {
    if (out.flap.event) this.counts.flap++;
    if (out.jump) this.counts.jump++;
    const squatting = out.squatDepth > 0.5;
    if (squatting && !this.wasSquatting) this.counts.squat++;
    this.wasSquatting = squatting;
    const bankSign = Math.abs(out.bank) > 0.5 ? Math.sign(out.bank) : 0;
    if (bankSign !== 0 && bankSign !== this.lastBankSign) this.counts.bank++;
    this.lastBankSign = bankSign;
  }

  // Ayakta duruş tabanını yakalar; sonra ayak bileği tabanını yavaşça günceller
  _updateBaseline(sample, dt) {
    const cfg = CONFIG.baseline;
    if (!this.baseline) {
      const c = (this._capture ??= { t: 0, n: 0, S: 0, hipY: 0, ankleY: 0, legRatio: 0, ankleN: 0, startHipY: sample.hipY, progress: 0 });
      if (Math.abs(sample.hipY - c.startHipY) / sample.S > cfg.maxMotion) {
        this._capture = null; // hareket var: yeniden başla
        return;
      }
      c.t += dt * 1000;
      c.n++;
      c.S += sample.S;
      c.hipY += sample.hipY;
      if (sample.ankleY !== null) {
        c.ankleN++;
        c.ankleY += sample.ankleY;
        c.legRatio += sample.legRatio;
      }
      c.progress = clamp01(c.t / cfg.captureMs);
      if (c.t >= cfg.captureMs) {
        this.baseline = {
          S: c.S / c.n,
          hipY: c.hipY / c.n,
          ankleY: c.ankleN ? c.ankleY / c.ankleN : null,
          legRatio: c.ankleN ? c.legRatio / c.ankleN : null,
        };
        this._capture = null;
      }
      return;
    }
    const b = this.baseline;
    // Oyuncu lehine: daha dik durulduysa ayakta-boy tabanını hemen yukarı çek
    if (sample.legRatio !== null && b.legRatio !== null && sample.legRatio > b.legRatio) b.legRatio = sample.legRatio;
    // Ayak bileği tabanı: yerdeyken kamera/konum değişimine yavaşça uyum sağlar (~2 sn)
    if (sample.ankleY !== null && !this.jumpState.airborne) {
      if (b.ankleY === null) b.ankleY = sample.ankleY;
      const k = clamp01(dt / 2);
      b.ankleY += (sample.ankleY - b.ankleY) * k;
    }
  }
}
