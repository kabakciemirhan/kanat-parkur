import './style.css';
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PoseTracker } from './pose/poseTracker.js';
import { LandmarkFilterBank } from './pose/oneEuro.js';
import { GestureEngine } from './pose/gestureEngine.js';
import { SkeletonOverlay } from './pose/skeletonOverlay.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { Calibration, loadProfile } from './pose/calibration.js';
import { unlockAudio, playStepCue, playDoneCue } from './audio/sfx.js';
import { createSky } from './world/sky.js';
import { createTerrain } from './world/terrain.js';
import { createClouds } from './world/clouds.js';
import { Bird } from './player/bird.js';
import { FlightPhysics } from './player/flightPhysics.js';
import { CameraRig } from './player/cameraRig.js';

// --- 3D sahne ---
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.cameraRig.baseFov, window.innerWidth / window.innerHeight, 0.5, 6000);
const sky = createSky(scene);
const terrain = createTerrain(scene);
const clouds = createClouds(scene);
const bird = new Bird();
scene.add(bird.object);
const flight = new FlightPhysics(terrain);
const cameraRig = new CameraRig(camera);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

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
let manualPause = false;

// Son çıkarım sonucu (yumuşatılmış); çıkarım her render karesinde olmayabilir
let smoothed = null;

function startCalibration() {
  unlockAudio();
  calibration.start();
  manualPause = false;
  setMode('calibrating');
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
  setMode('live');
}

// Canlı modda webcam sağ alt köşeye küçülür
function setMode(next) {
  mode = next;
  document.body.classList.toggle('live', next === 'live');
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
  if ((e.code === 'KeyP' || e.code === 'Escape') && mode === 'live') {
    manualPause = !manualPause;
    hud.setStatus(manualPause ? 'Duraklatıldı — devam için P' : '');
  }
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
  const dt = lastFrameMs === null ? 0 : Math.min((nowMs - lastFrameMs) / 1000, CONFIG.render.maxDt);
  lastFrameMs = nowMs;

  // Kadraj kaybında otomatik duraklat; son birkaç saniyede klavye kullanıldıysa duraklatma (test modu)
  const keyboardRecent = performance.now() - gestures.lastKeyboardMs < CONFIG.game.keyboardGraceMs;
  const trackPause = mode === 'live' && tracker.hasCamera && !g.tracked && !keyboardRecent;
  hud.setTrackWarning(trackPause);
  const paused = trackPause || manualPause;

  if (mode === 'live' && !paused) flight.update(dt, g);
  // Kalibrasyon sırasında da kuş kolları taklit eder (konum sabit)
  if (!paused) bird.update(dt, g, flight);
  bird.object.position.copy(flight.position);
  bird.object.rotation.y = flight.yaw;
  if (!paused) cameraRig.update(dt, flight);
  terrain.update(flight.position);
  clouds.update(flight.position, Math.atan2(flight.forward.z, flight.forward.x));
  sky.update(camera.position);
  renderer.render(scene, camera);

  hud.update(nowMs, g, gestures.metrics, tracker, gestures.counts, flight);
  if (mode === 'calibrating') {
    if (calibration.update(nowMs, g, gestures.metrics, dt)) {
      if (calibration.active) playStepCue();
      else {
        playDoneCue();
        setMode('summary');
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
  // Sahne kamera izni beklenirken de çizilsin
  requestAnimationFrame(loop);
  hud.setStatus('Kamera açılıyor…');
  try {
    // ?nocam: kamerayı hiç açmadan klavyeyle test
    if (new URLSearchParams(location.search).has('nocam')) throw new Error('nocam parametresi');
    await tracker.startCamera();
    tracker.hasCamera = true;
    video.addEventListener('loadedmetadata', fitStage);
    fitStage();
  } catch (err) {
    console.warn('[main] Kamera açılamadı, yalnızca klavye:', err);
    hud.setStatus('Kamera yok — klavye yedeği aktif (Space, ←/→, ↓, ↑, T)');
    document.body.classList.add('nocam');
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
}

start();
