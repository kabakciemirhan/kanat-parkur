import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { CONFIG } from '../config.js';
import { createRandom } from '../utils/random.js';

// Aşağıdaki low-poly tepeler. Tek bir karo oyuncuyu ızgaraya oturtularak takip eder;
// yükseklikler dünya koordinatından hesaplandığı için arazi "kaymaz".
export function createTerrain(scene) {
  const w = CONFIG.world;
  const noise = createNoise2D(createRandom(w.seed));
  const cell = w.terrainSize / w.terrainSegments;

  const heightAt = (x, z) => {
    const s = w.terrainScale;
    let n = 0.6 * noise(x / s, z / s) + 0.3 * noise((x / s) * 2.3, (z / s) * 2.3) + 0.1 * noise((x / s) * 5.1, (z / s) * 5.1);
    n = (n + 1) / 2; // 0..1
    return Math.pow(n, 1.6) * w.terrainHeight;
  };

  const geometry = new THREE.PlaneGeometry(w.terrainSize, w.terrainSize, w.terrainSegments, w.terrainSegments);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  const base = Float32Array.from(pos.array); // ızgaranın yerel x/z değerleri
  const colors = new Float32Array(pos.count * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const low = new THREE.Color('#5f6247');
  const mid = new THREE.Color('#9a9a76');
  const high = new THREE.Color('#cfc9ac');
  const tmp = new THREE.Color();

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  let centerX = NaN, centerZ = NaN;

  function rebuild(cx, cz) {
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3] + cx;
      const z = base[i * 3 + 2] + cz;
      const h = heightAt(x, z);
      pos.setY(i, h);
      const t = h / w.terrainHeight;
      if (t < 0.5) tmp.lerpColors(low, mid, t / 0.5);
      else tmp.lerpColors(mid, high, (t - 0.5) / 0.5);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    pos.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    mesh.position.set(cx, 0, cz);
  }

  return {
    heightAt,
    // Oyuncu karonun çeyreğinden fazla uzaklaşınca karo ızgaraya hizalı biçimde yeniden ortalanır
    update(playerPos) {
      const threshold = w.terrainSize / 4;
      if (Number.isNaN(centerX) || Math.abs(playerPos.x - centerX) > threshold || Math.abs(playerPos.z - centerZ) > threshold) {
        centerX = Math.round(playerPos.x / cell) * cell;
        centerZ = Math.round(playerPos.z / cell) * cell;
        rebuild(centerX, centerZ);
      }
    },
  };
}
