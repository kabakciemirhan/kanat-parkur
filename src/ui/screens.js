const fmt = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d) : '—');

// Başlangıç, kalibrasyon ve kalibrasyon özeti ekranları
export class Screens {
  constructor(root, { onCalibrate, onSkip, onContinue }) {
    this.root = root;
    this.handlers = { onCalibrate, onSkip, onContinue };
    this.current = null;
    root.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'calibrate') this.handlers.onCalibrate();
      if (action === 'skip') this.handlers.onSkip();
      if (action === 'continue') this.handlers.onContinue();
    });
  }

  hide() {
    this.current = null;
    this.root.hidden = true;
    this.root.innerHTML = '';
  }

  showStart(profile) {
    this.current = 'start';
    this.root.hidden = false;
    const saved = profile ? new Date(profile.savedAt).toLocaleString('tr-TR') : null;
    this.root.innerHTML = `
      <div class="panel card">
        <h1>Kanat: Hava Parkuru</h1>
        <p>Kalibrasyon yaklaşık 15 saniye sürer. Başlattıktan sonra kameradan 2–2,5 m uzaklaş.</p>
        <div class="actions">
          <button class="primary" data-action="calibrate">Kalibrasyonu başlat <kbd>Enter</kbd></button>
          ${saved ? `<button data-action="skip">Kalibrasyonu atla <kbd>S</kbd></button>` : ''}
        </div>
        ${saved ? `<p class="muted">Kayıtlı kalibrasyon: ${saved}</p>` : ''}
      </div>`;
  }

  // Kalibrasyon sırasında her karede çağrılır; yalnızca değişen kısımlar güncellenir
  showCalibration(view) {
    if (this.current !== 'calibration') {
      this.current = 'calibration';
      this.root.hidden = false;
      this.root.innerHTML = `
        <div class="panel calib">
          <div class="calib-step"></div>
          <h2 class="calib-title"></h2>
          <p class="calib-text"></p>
          <div class="calib-bar"><i></i></div>
        </div>`;
      this.el = {
        step: this.root.querySelector('.calib-step'),
        title: this.root.querySelector('.calib-title'),
        text: this.root.querySelector('.calib-text'),
        bar: this.root.querySelector('.calib-bar i'),
      };
    }
    if (this.el.title.textContent !== view.title) {
      this.el.step.textContent = view.stepLabel;
      this.el.title.textContent = view.title;
      this.el.text.textContent = view.text;
    }
    this.el.bar.style.width = `${Math.round(view.progress * 100)}%`;
  }

  showSummary(profile) {
    this.current = 'summary';
    this.root.hidden = false;
    const t = profile.tuning;
    const labels = { stand: 'Dik duruş', tpose: 'T-poz', flap: 'Çırpma', squat: 'Squat', jump: 'Zıplama' };
    const defaulted = profile.defaulted.map((id) => labels[id]).join(', ');
    this.root.innerHTML = `
      <div class="panel card">
        <h1>Kalibrasyon tamam</h1>
        <table class="summary">
          <tr><td>Çırpma kurma / tamamlama</td><td>${fmt(t.flap?.armUpLevel)} / ${fmt(t.flap?.armDownLevel)}</td></tr>
          <tr><td>Çırpma min hız</td><td>${fmt(t.flap?.minDownSpeed, 1)}</td></tr>
          <tr><td>T-poz kol seviyesi / açıklık</td><td>${fmt(t.glide?.neutralArmY)} / ${fmt(t.glide?.minArmSpan)}</td></tr>
          <tr><td>Squat tam derinlik / diz°</td><td>${fmt(t.squat?.fullDrop)} / ${fmt(t.squat?.kneeDeepDeg, 0)}</td></tr>
          <tr><td>Zıplama eşiği / hız</td><td>${fmt(t.jump?.ankleRise)} / ${fmt(t.jump?.hipRiseSpeed, 1)}</td></tr>
        </table>
        ${defaulted ? `<p class="warn-text">Ölçülemedi, varsayılan kullanılıyor: ${defaulted}</p>` : ''}
        <div class="actions">
          <button class="primary" data-action="continue">Devam <kbd>Enter</kbd></button>
          <button data-action="calibrate">Tekrarla <kbd>C</kbd></button>
        </div>
        <p class="muted">Birkaç saniye içinde otomatik devam edilecek.</p>
      </div>`;
  }
}
