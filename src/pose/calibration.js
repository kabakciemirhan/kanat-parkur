import { CONFIG } from '../config.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

// --- Kayıt (localStorage; erişilemezse sessizce devam eder) ---
export function loadProfile() {
  try {
    const raw = localStorage.getItem(CONFIG.calibration.storageKey);
    const profile = raw ? JSON.parse(raw) : null;
    return profile?.version === 1 ? profile : null;
  } catch {
    return null;
  }
}

function saveProfile(profile) {
  try {
    localStorage.setItem(CONFIG.calibration.storageKey, JSON.stringify(profile));
  } catch (err) {
    console.warn('[calibration] Profil kaydedilemedi:', err);
  }
}

// Her adım: { id, title, text, update(ctx) → { progress, done }, result() }
// ctx: { m (gesture metrics), g (gesture çıktısı), dt (sn), elapsed (ms) }
function createSteps(engine) {
  const c = CONFIG.calibration;

  const ready = {
    id: 'ready',
    title: 'Hazırlan',
    text: 'Kameradan 2–2,5 m uzaklaş; baştan ayağa görün.',
    held: 0,
    update({ m, g, dt }) {
      const ankles = m.visibility?.lAnkle >= CONFIG.tracking.visibilityThreshold
        && m.visibility?.rAnkle >= CONFIG.tracking.visibilityThreshold;
      this.held = g.tracked && ankles ? this.held + dt * 1000 : 0;
      return { progress: this.held / c.readyHoldMs, done: this.held >= c.readyHoldMs };
    },
    result: () => null,
    noTimeout: true,
  };

  const stand = {
    id: 'stand',
    title: 'Dik dur',
    text: 'Kolların yanda, kıpırdamadan dur.',
    samples: [],
    update({ m, g, dt }) {
      const ok = g.tracked && m.S !== undefined && m.armY !== null && m.armY !== undefined && m.armY > c.armsDownLevel;
      const first = this.samples[0];
      if (!ok || (first && Math.abs(m.hipY - first.hipY) / m.S > c.maxStandMotion)) {
        this.samples = []; // hareket var ya da poz yanlış: ölçüme baştan başla
        this.t = 0;
        return { progress: 0, done: false };
      }
      this.t = (this.t ?? 0) + dt * 1000;
      this.samples.push({ S: m.S, hipY: m.hipY, ankleY: m.ankleY, legRatio: m.legRatio, noseY: m.noseY });
      const t = this.t;
      return { progress: t / c.standHoldMs, done: t >= c.standHoldMs };
    },
    result() {
      const s = this.samples;
      if (!s.length) return null;
      const withAnkles = s.filter((x) => x.ankleY !== null);
      const baseline = {
        S: avg(s.map((x) => x.S)),
        hipY: avg(s.map((x) => x.hipY)),
        ankleY: withAnkles.length ? avg(withAnkles.map((x) => x.ankleY)) : null,
        legRatio: withAnkles.length ? avg(withAnkles.map((x) => x.legRatio)) : null,
      };
      // Sonraki adımlar (squat, zıplama) bu tabana göre ölçülür
      engine.setBaseline(baseline);
      const heightRatio = withAnkles.length ? avg(withAnkles.map((x) => (x.ankleY - x.noseY) / x.S)) : null;
      return { baseline, heightRatio };
    },
  };

  const tPose = {
    id: 'tpose',
    title: 'T-poz',
    text: 'Kollarını yanlara aç, omuz hizasında tut.',
    samples: [],
    update({ m, g, dt }) {
      const ok = g.tracked && m.S !== undefined && m.spanL > c.tPoseMinSpan && m.spanR > c.tPoseMinSpan
        && Math.abs(m.armYL) < c.tPoseLevelTol && Math.abs(m.armYR) < c.tPoseLevelTol;
      if (!ok) {
        this.samples = [];
        this.t = 0;
        return { progress: 0, done: false };
      }
      this.t = (this.t ?? 0) + dt * 1000;
      this.samples.push({ armY: (m.armYL + m.armYR) / 2, span: Math.min(m.spanL, m.spanR) });
      const t = this.t;
      return { progress: t / c.tPoseHoldMs, done: t >= c.tPoseHoldMs };
    },
    result() {
      if (!this.samples.length) return null;
      return {
        neutralArmY: avg(this.samples.map((x) => x.armY)),
        span: avg(this.samples.map((x) => x.span)),
      };
    },
  };

  const flap = {
    id: 'flap',
    title: 'Kanat çırp',
    text: `Kollarını başının üstüne kaldır, sonra yanlara hızla indir — ${c.flapCycles} kez.`,
    phase: 'down',
    cycles: [],
    cur: null,
    update({ m, g }) {
      if (!g.tracked || m.armY === null || m.armY === undefined) return { progress: this.cycles.length / c.flapCycles, done: false };
      if (this.phase === 'down' && m.armY < c.flapUpLevel) {
        this.phase = 'up';
        this.cur = { top: m.armY, bottom: m.armY, speed: 0 };
      } else if (this.phase === 'up') {
        this.cur.top = Math.min(this.cur.top, m.armY);
        this.cur.speed = Math.max(this.cur.speed, m.armSpeed ?? 0);
        if (m.armY > c.flapDownLevel) this.phase = 'falling';
      } else if (this.phase === 'falling') {
        this.cur.bottom = Math.max(this.cur.bottom, m.armY);
        this.cur.speed = Math.max(this.cur.speed, m.armSpeed ?? 0);
        // Kol durunca (ya da tekrar kalkmaya başlayınca) tekrar tamamlanır
        if ((m.armSpeed ?? 0) <= 0.2) {
          this.cycles.push(this.cur);
          this.phase = 'down';
        }
      }
      return { progress: this.cycles.length / c.flapCycles, done: this.cycles.length >= c.flapCycles };
    },
    result() {
      if (!this.cycles.length) return null;
      return {
        top: median(this.cycles.map((x) => x.top)),
        bottom: median(this.cycles.map((x) => x.bottom)),
        peakSpeed: median(this.cycles.map((x) => x.speed)),
      };
    },
  };

  const squat = {
    id: 'squat',
    title: 'Squat',
    text: 'Rahat bir squat yap, sonra tekrar dik dur.',
    maxDrop: 0,
    minKnee: 180,
    reached: false,
    update({ m, g }) {
      if (!g.tracked) return { progress: 0, done: false };
      const drop = m.hipDrop ?? 0;
      const knee = m.kneeDeg ?? 180;
      this.maxDrop = Math.max(this.maxDrop, drop);
      this.minKnee = Math.min(this.minKnee, knee);
      if (drop > c.squatMinDrop || knee < c.squatMaxKneeDeg) this.reached = true;
      const progress = this.reached ? 0.6 : clamp(drop / c.squatMinDrop, 0, 1) * 0.6;
      // Squat'a inildi ve tekrar kalkıldı
      const stoodUp = this.reached && drop < this.maxDrop * 0.3 && knee > c.squatMaxKneeDeg;
      return { progress: stoodUp ? 1 : progress, done: stoodUp };
    },
    result() {
      return this.reached ? { maxDrop: this.maxDrop, minKnee: this.minKnee } : null;
    },
  };

  const jump = {
    id: 'jump',
    title: 'Zıpla',
    text: 'Yerinde hafifçe bir kez zıpla.',
    maxRise: 0,
    maxHipRise: 0,
    maxSpeed: 0,
    usedAnkles: true,
    update({ m, g }) {
      if (!g.tracked) return { progress: 0, done: false };
      const rise = m.ankleRise ?? m.hipRise ?? 0;
      if (m.ankleRise === null || m.ankleRise === undefined) this.usedAnkles = false;
      this.maxRise = Math.max(this.maxRise, rise);
      this.maxHipRise = Math.max(this.maxHipRise, m.hipRise ?? 0);
      this.maxSpeed = Math.max(this.maxSpeed, m.hipUpSpeed ?? 0);
      const peaked = this.maxRise > c.jumpMinRise;
      const landed = peaked && rise < this.maxRise * 0.3;
      return { progress: landed ? 1 : peaked ? 0.6 : 0, done: landed };
    },
    result() {
      if (this.maxRise <= c.jumpMinRise) return null;
      return { maxRise: this.maxRise, maxHipRise: this.maxHipRise, peakSpeed: this.maxSpeed, usedAnkles: this.usedAnkles };
    },
  };

  return [ready, stand, tPose, flap, squat, jump];
}

// Ölçümlerden kişisel eşikleri türetir; ölçülemeyen adımlar varsayılanda kalır
export function deriveTuning(r) {
  const c = CONFIG.calibration;
  const t = {};
  if (r.tpose) {
    t.glide = {
      neutralArmY: clamp(r.tpose.neutralArmY, -0.5, 0.5),
      minArmSpan: clamp(r.tpose.span * c.tPoseSpanFrac, 0.7, 1.4),
    };
  }
  if (r.flap) {
    const amp = Math.max(r.flap.bottom - r.flap.top, 0.8);
    const armUpLevel = clamp(r.flap.top + amp * c.flapLevelFrac, -1.2, 0);
    const armDownLevel = clamp(r.flap.bottom - amp * c.flapLevelFrac, 0.1, 1.2);
    t.flap = {
      armUpLevel,
      armDownLevel: Math.max(armDownLevel, armUpLevel + 0.3),
      refAmplitude: amp * c.flapRefAmpFrac,
      minDownSpeed: clamp(r.flap.peakSpeed * c.flapMinSpeedFrac, 1.0, 3.0),
      refSpeed: clamp(r.flap.peakSpeed * c.flapRefSpeedFrac, 3, 12),
    };
  }
  if (r.squat) {
    const kneeDeepDeg = clamp(r.squat.minKnee + c.squatKneeMargin, 70, 140);
    t.squat = {
      fullDrop: clamp(r.squat.maxDrop * c.squatFullFrac, 0.25, 1.5),
      kneeDeepDeg,
      kneeStraightDeg: Math.max(CONFIG.squat.kneeStraightDeg, kneeDeepDeg + 20),
    };
  }
  if (r.jump) {
    t.jump = {
      ankleRise: clamp(r.jump.maxRise * c.jumpRiseFrac, 0.06, 0.3),
      hipOnlyRise: clamp(r.jump.maxHipRise * 0.5, 0.1, 0.4),
      hipRiseSpeed: clamp(r.jump.peakSpeed * c.jumpSpeedFrac, 0.8, 3.0),
    };
  }
  return t;
}

// Kalibrasyon akışı: adımları sırayla yürütür, sonunda profili kaydeder
export class Calibration {
  constructor(engine) {
    this.engine = engine;
    this.active = false;
  }

  start(nowMs = performance.now()) {
    this.engine.applyTuning({}); // ölçüm varsayılan eşiklerle yapılır
    this.engine.resetBaseline();
    this.steps = createSteps(this.engine);
    this.index = 0;
    this.results = {};
    this.defaulted = [];
    this.stepStart = nowMs;
    this.progress = 0;
    this.active = true;
    this.profile = null;
  }

  get step() {
    return this.steps[this.index];
  }

  // Her render karesinde; adım değişince true döner (ses ipucu için)
  update(nowMs, g, m, dt) {
    if (!this.active) return false;
    const step = this.step;
    const elapsed = nowMs - this.stepStart;
    const { progress, done } = step.update({ m, g, dt, elapsed });
    this.progress = clamp(progress, 0, 1);
    const timedOut = !step.noTimeout && elapsed > CONFIG.calibration.stepTimeoutMs;
    if (!done && !timedOut) return false;

    const res = step.result();
    if (res) this.results[step.id] = res;
    else if (step.id !== 'ready') this.defaulted.push(step.id);
    this.index++;
    this.stepStart = nowMs;
    this.progress = 0;
    if (this.index >= this.steps.length) this._finish();
    return true;
  }

  _finish() {
    this.active = false;
    const tuning = deriveTuning(this.results);
    this.profile = {
      version: 1,
      savedAt: new Date().toISOString(),
      body: { heightRatio: this.results.stand?.heightRatio ?? null },
      tuning,
      defaulted: this.defaulted,
    };
    this.engine.applyTuning(tuning);
    this.engine.resetCounts();
    saveProfile(this.profile);
  }

  // Ekranda gösterilecek durum
  view() {
    const total = this.steps.length - 1; // "Hazırlan" sayılmaz
    const step = this.step;
    return {
      title: step.title,
      text: step.text,
      progress: this.progress,
      stepLabel: step.id === 'ready' ? 'Başlıyor' : `${this.index} / ${total}`,
    };
  }
}
