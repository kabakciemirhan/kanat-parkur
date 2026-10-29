// MediaPipe WASM dosyalarını public/ altına kopyalar ve poz modelini bir kez indirir.
// Böylece oyun çalışırken hiçbir CDN'e ihtiyaç duyulmaz.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/mediapipe/wasm');
const modelDir = join(root, 'public/models');
const modelPath = join(modelDir, 'pose_landmarker_full.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';

if (existsSync(wasmSrc)) {
  mkdirSync(wasmDst, { recursive: true });
  cpSync(wasmSrc, wasmDst, { recursive: true });
  console.log('[setup-assets] WASM kopyalandı →', wasmDst);
} else {
  console.warn('[setup-assets] @mediapipe/tasks-vision henüz kurulu değil, WASM atlandı.');
}

if (existsSync(modelPath)) {
  console.log('[setup-assets] Model zaten var.');
} else {
  mkdirSync(modelDir, { recursive: true });
  console.log('[setup-assets] Model indiriliyor…');
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    console.error('[setup-assets] Model indirilemedi:', res.status);
    process.exit(1);
  }
  writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
  console.log('[setup-assets] Model kaydedildi →', modelPath);
}
