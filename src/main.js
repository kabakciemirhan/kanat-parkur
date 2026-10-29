import './style.css';
import { CONFIG } from './config.js';
import { PoseTracker } from './pose/poseTracker.js';
import { LandmarkFilterBank } from './pose/oneEuro.js';
import { GestureEngine } from './pose/gestureEngine.js';
import { SkeletonOverlay } from './pose/skeletonOverlay.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { Calibration, loadProfile } from './pose/calibration.js';
import { unlockAudio, playStepCue, playDoneCue } from './audio/sfx.js';

const video = document.getElementById('webcam');
const stage = document.getElementById('stage');
const overlay = new SkeletonOverlay(document.getElementById('skeleton'));
const hud = new Hud({
  debugEl: document.getElementById('debug'),
  trackWarnEl: document.getElementById('trackWarn'),
  statusEl: document.getElementById('status'),
});
const tracker = new PoseTracker(video);
const filters = new LandmarkFilterBank(CONFIG.oneEuro);
const gestures = new GestureEngine();
const calibration = new Calibration(gestures);
const screens = new Screens(document.getElementById('screens'), {
  onCalibrate: startCalibration,
  onSkip: skipCalibration,
  onContinue: goLive,
});

// Uygulama modu: 'start' | 'calibrating' | 'summary' | 'live'
let mode = 'start';
let summaryUntil = 0;
let lastFrameMs = null;

// Son çıkarım sonucu (yumuşatılmış); çıkarım her render karesinde olmayabilir
let smoothed = null;

function startCalibration() {
  unlockAudio();
  calibration.start();
  mode = 'calibrating';
}

// Kayıtlı profille devam: eşikler profilden, ayakta duruş tabanı otomatik yakalanır
function skipCalibration() {
  const profile = loadProfile();
  if (!profile) return;
  unlockAudio();
  gestures.applyTuning(profile.tuning);
  gestures.resetBaseline();
  goLive();
}

function goLive() {
  gestures.resetCounts();
  screens.hide();
  mode = 'live';
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyD') hud.toggleDebug();
  if (e.code === 'KeyR') gestures.resetBaseline();
  if (e.code === 'Enter') {
    if (mode === 'start') startCalibration();
    else if (mode === 'summary') goLive();
  }
  if (e.code === 'KeyS' && mode === 'start') skipCalibration();
  if (e.code === 'KeyC' && (mode === 'summary' || mode === 'live')) startCalibration();
});

// Video oranına göre sahneyi boyutlandır (iskelet ile görüntü üst üste otursun)
function fitStage() {
  const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
  stage.style.aspectRatio = String(aspect);
}
window.addEventListener('resize', fitStage);

function loop(nowMs) {
  const res = tracker.detect(nowMs);
  if (res) {
    smoothed = res.landmarks ? filters.apply(res.landmarks, nowMs / 1000) : null;
    if (!res.landmarks) filters.reset();
    overlay.draw(smoothed);
  }
  const aspect = video.videoWidth ? video.videoWidth / video.videoHeight : 16 / 9;
  // Yeni kare yoksa undefined verilir: motor son poz durumunu korur, yalnızca klavyeyi işler
  const g = gestures.update(res ? smoothed : undefined, aspect, nowMs);
  hud.update(nowMs, g, gestures.metrics, tracker, gestures.counts);

  const dt = lastFrameMs === null ? 0 : (nowMs - lastFrameMs) / 1000;
  lastFrameMs = nowMs;
  if (mode === 'calibrating') {
    if (calibration.update(nowMs, g, gestures.metrics, dt)) {
      if (calibration.active) playStepCue();
      else {
        playDoneCue();
        mode = 'summary';
        summaryUntil = nowMs + CONFIG.calibration.doneScreenMs;
        screens.showSummary(calibration.profile);
      }
    }
    if (calibration.active) screens.showCalibration(calibration.view());
  } else if (mode === 'summary' && nowMs > summaryUntil) {
    goLive();
  }
  requestAnimationFrame(loop);
}

async function start() {
  hud.setStatus('Kamera açılıyor…');
  try {
    await tracker.startCamera();
    tracker.hasCamera = true;
    video.addEventListener('loadedmetadata', fitStage);
    fitStage();
  } catch (err) {
    console.warn('[main] Kamera açılamadı, yalnızca klavye:', err);
    hud.setStatus('Kamera yok — klavye yedeği aktif (Space, ←/→, ↓, ↑, T)');
  }
  if (tracker.hasCamera) {
    hud.setStatus('Poz modeli yükleniyor…');
    try {
      await tracker.init();
      hud.setStatus('');
    } catch (err) {
      console.error('[main] PoseLandmarker başlatılamadı:', err);
      hud.setStatus('Poz modeli yüklenemedi — konsolu kontrol et');
      tracker.hasCamera = false;
    }
  }
  // Kamera yoksa kalibrasyon yapılamaz: doğrudan klavyeyle canlı moda geç
  if (tracker.hasCamera) screens.showStart(loadProfile());
  else goLive();
  requestAnimationFrame(loop);
}

start();
