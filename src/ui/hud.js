import { CONFIG } from '../config.js';

const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d));

// Debug paneli ve kadraj uyarısı
export class Hud {
  constructor({ debugEl, trackWarnEl, statusEl }) {
    this.debugEl = debugEl;
    this.trackWarnEl = trackWarnEl;
    this.statusEl = statusEl;
    this.debugVisible = CONFIG.debug.showOnStart;
    this.lastUi = 0;
    this.flashUntil = { flap: 0, jump: 0 };
    this.lastFlapStrength = 0;
    this.renderFps = 0;
    this._frames = 0;
    this._fpsStart = performance.now();
    this.debugEl.hidden = !this.debugVisible;
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.debugEl.hidden = !this.debugVisible;
  }

  setStatus(text) {
    this.statusEl.textContent = text;
    this.statusEl.hidden = !text;
  }

  // Her render karesinde çağrılır; DOM yalnızca uiUpdateMs aralığında yenilenir
  update(nowMs, gesture, metrics, tracker, counts) {
    this._frames++;
    if (nowMs - this._fpsStart >= 1000) {
      this.renderFps = (this._frames * 1000) / (nowMs - this._fpsStart);
      this._frames = 0;
      this._fpsStart = nowMs;
    }
    // Tek karelik olayları kaçırmamak için her karede yakala
    if (gesture.flap.event) {
      this.flashUntil.flap = nowMs + CONFIG.debug.eventFlashMs;
      this.lastFlapStrength = gesture.flap.strength;
    }
    if (gesture.jump) this.flashUntil.jump = nowMs + CONFIG.debug.eventFlashMs;

    this.trackWarnEl.hidden = gesture.tracked || !tracker.hasCamera;

    if (!this.debugVisible || nowMs - this.lastUi < CONFIG.debug.uiUpdateMs) return;
    this.lastUi = nowMs;
    this.debugEl.innerHTML = this._render(nowMs, gesture, metrics, tracker, counts);
  }

  _render(nowMs, g, m, tracker, counts) {
    const flapOn = nowMs < this.flashUntil.flap;
    const jumpOn = nowMs < this.flashUntil.jump;
    const bar = (v, signed = false) => {
      const w = Math.min(Math.abs(v), 1) * (signed ? 50 : 100);
      const left = signed ? (v < 0 ? 50 - w : 50) : 0;
      return `<span class="bar${signed ? ' signed' : ''}"><i style="left:${left}%;width:${w}%"></i></span>`;
    };
    const pill = (on, label) => `<span class="pill${on ? ' on' : ''}">${label}</span>`;

    const visRows = Object.entries(m.visibility ?? {})
      .map(([name, v]) => `<div class="vis"><span>${name}</span>${bar(v)}<b>${fmt(v)}</b></div>`)
      .join('');

    return `
      <h3>Debug <small>D: gizle · R: tabanı yeniden al</small></h3>
      <section>
        <div class="row"><span>Render FPS</span><b>${fmt(this.renderFps, 0)}</b></div>
        <div class="row"><span>Çıkarım FPS / ms</span><b>${fmt(tracker.inferenceFps, 0)} / ${fmt(tracker.inferenceMs, 1)}</b></div>
        <div class="row"><span>Delegate</span><b>${tracker.delegate ?? '—'}</b></div>
        <div class="row"><span>Takip</span>${pill(g.tracked, g.tracked ? 'VAR' : 'YOK')}</div>
        <div class="row"><span>Taban çizgisi</span><b>${m.baselineProgress >= 1 ? 'hazır' : `%${Math.round((m.baselineProgress ?? 0) * 100)}`}</b></div>
        <div class="row"><span>Klavye</span>${pill(m.keyboard, m.keyboard ? 'aktif' : '—')}</div>
      </section>
      <h4>Hareketler</h4>
      <section>
        <div class="row"><span>flap</span>${pill(flapOn, 'ÇIRP')}<b>${fmt(this.lastFlapStrength)}</b></div>
        <div class="row"><span>glide</span>${pill(g.glide, 'SÜZÜL')}</div>
        <div class="row"><span>bank</span>${bar(g.bank, true)}<b>${fmt(g.bank)}</b></div>
        <div class="row"><span>squatDepth</span>${bar(g.squatDepth)}<b>${fmt(g.squatDepth)}</b></div>
        <div class="row"><span>jump</span>${pill(jumpOn, 'ZIPLA')}</div>
        <div class="row"><span>wingsTucked</span>${pill(g.wingsTucked, 'KAPAT')}</div>
        <div class="row"><span>Sayaç</span><b>flap ${counts.flap} · squat ${counts.squat} · zıpla ${counts.jump} · eğil ${counts.bank}</b></div>
      </section>
      <h4>Ham metrikler (S = omuz genişliği)</h4>
      <section class="metrics">
        <div class="row"><span>S (görüntü yüks.)</span><b>${fmt(m.S, 3)}</b></div>
        <div class="row"><span>armY ort / sol / sağ</span><b>${fmt(m.armY)} / ${fmt(m.armYL)} / ${fmt(m.armYR)}</b></div>
        <div class="row"><span>armSpeed (+aşağı)</span><b>${fmt(m.armSpeed, 1)}</b></div>
        <div class="row"><span>flap kurulu</span><b>${m.flapArmed ? 'evet' : 'hayır'}</b></div>
        <div class="row"><span>son flap genlik / hız</span><b>${fmt(m.lastFlapAmp)} / ${fmt(m.lastFlapSpeed, 1)}</b></div>
        <div class="row"><span>kol açıklığı sol / sağ</span><b>${fmt(m.spanL)} / ${fmt(m.spanR)}</b></div>
        <div class="row"><span>bilek hızı</span><b>${fmt(m.wristSpeed, 1)}</b></div>
        <div class="row"><span>omuz açısı°</span><b>${fmt(m.rollDeg, 1)}</b></div>
        <div class="row"><span>omuz-kalça kayma</span><b>${fmt(m.shift)}</b></div>
        <div class="row"><span>bank ham</span><b>${fmt(m.bankRaw)}</b></div>
        <div class="row"><span>kalça düşüşü / derinlik</span><b>${fmt(m.hipDrop)} / ${fmt(m.hipDepth)}</b></div>
        <div class="row"><span>diz açısı° / derinlik</span><b>${fmt(m.kneeDeg, 0)} / ${fmt(m.kneeDepth)}</b></div>
        <div class="row"><span>ayak bileği yükselişi</span><b>${fmt(m.ankleRise)}</b></div>
        <div class="row"><span>kalça yük. / hız</span><b>${fmt(m.hipRise)} / ${fmt(m.hipUpSpeed, 1)}</b></div>
        <div class="row"><span>havada</span><b>${m.airborne ? 'evet' : 'hayır'}</b></div>
        <div class="row"><span>bilek arası / burun üstü</span><b>${fmt(m.wristGap)} / ${fmt(m.aboveNose)}</b></div>
      </section>
      <h4>Görünürlük</h4>
      <section class="visList">${visRows}</section>
    `;
  }
}
