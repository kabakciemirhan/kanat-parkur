// Basit Web Audio ses efektleri. AudioContext ilk kullanıcı etkileşiminde açılır.
let ctx = null;

export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq, startOffset, duration, gain = 0.15) {
  if (!ctx) return;
  const t = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

// Kalibrasyonda adım geçişi: kısa yükselen iki nota
export function playStepCue() {
  tone(660, 0, 0.15);
  tone(880, 0.12, 0.2);
}

// Kalibrasyon tamamlandı: üç notalı akor
export function playDoneCue() {
  tone(523, 0, 0.35);
  tone(659, 0.1, 0.35);
  tone(784, 0.2, 0.5);
}
