import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { CONFIG } from '../config.js';

// Webcam + PoseLandmarker sarmalayıcısı. Görüntü yalnızca bu cihazda işlenir.
export class PoseTracker {
  constructor(video) {
    this.video = video;
    this.landmarker = null;
    this.delegate = null;
    this.hasCamera = false;
    this.lastVideoTime = -1;
    this.inferenceMs = 0;
    this.inferenceFps = 0;
    this._fpsCount = 0;
    this._fpsStart = performance.now();
  }

  async startCamera() {
    const { width, height, frameRate } = CONFIG.camera;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: frameRate } },
    });
    this.video.srcObject = stream;
    await this.video.play();
  }

  async init() {
    const fileset = await FilesetResolver.forVisionTasks(CONFIG.pose.wasmPath);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: CONFIG.pose.modelPath, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: CONFIG.pose.minPoseDetectionConfidence,
      minPosePresenceConfidence: CONFIG.pose.minPosePresenceConfidence,
      minTrackingConfidence: CONFIG.pose.minTrackingConfidence,
    });
    // Önce GPU dene, olmazsa CPU'ya düş
    try {
      this.landmarker = await PoseLandmarker.createFromOptions(fileset, options('GPU'));
      this.delegate = 'GPU';
    } catch (err) {
      console.warn('[pose] GPU delegate başarısız, CPU kullanılıyor:', err);
      this.landmarker = await PoseLandmarker.createFromOptions(fileset, options('CPU'));
      this.delegate = 'CPU';
    }
  }

  // Yeni bir video karesi varsa çıkarım yapar; yoksa null döner.
  // Dönen değer: { landmarks: [...33] | null, timestampMs }
  detect(nowMs) {
    if (!this.landmarker || this.video.readyState < 2) return null;
    if (this.video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = this.video.currentTime;

    const t0 = performance.now();
    const result = this.landmarker.detectForVideo(this.video, nowMs);
    this.inferenceMs = performance.now() - t0;

    this._fpsCount++;
    const elapsed = t0 - this._fpsStart;
    if (elapsed >= 1000) {
      this.inferenceFps = (this._fpsCount * 1000) / elapsed;
      this._fpsCount = 0;
      this._fpsStart = t0;
    }

    return { landmarks: result.landmarks?.[0] ?? null, timestampMs: nowMs };
  }
}
