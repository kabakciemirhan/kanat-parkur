import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createRandom } from '../utils/random.js';

// Low-poly bulut kümeleri: tek bir InstancedMesh (tek çizim çağrısı).
// Oyuncudan çok uzaklaşan küme, oyuncunun önüne yeniden yerleştirilir.
export function createClouds(scene) {
  const w = CONFIG.world;
  const rand = createRandom(w.seed + 1);
  const total = w.cloudCount * w.puffsPerCloud;
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshLambertMaterial({ color: '#f8f8f8', emissive: '#f4d6cf', emissiveIntensity: 0.35, flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, total);
  mesh.frustumCulled = false;
  scene.add(mesh);

  // Her kümenin top düzeni sabit; yalnızca merkez taşınır
  const clouds = Array.from({ length: w.cloudCount }, () => ({
    center: new THREE.Vector3(),
    puffs: Array.from({ length: w.puffsPerCloud }, (_, i) => ({
      offset: new THREE.Vector3((rand() - 0.5) * 60, (rand() - 0.3) * 10, (rand() - 0.5) * 30),
      scale: new THREE.Vector3(1, 0.7, 1).multiplyScalar(i === 0 ? 22 : 10 + rand() * 12),
    })),
  }));

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();

  function place(cloud, around, ahead) {
    const angle = ahead !== null ? ahead + (rand() - 0.5) * 1.6 : rand() * Math.PI * 2;
    const r = ahead !== null ? w.cloudRadius * (0.7 + rand() * 0.3) : Math.sqrt(rand()) * w.cloudRadius;
    const high = rand() < w.highCloudChance;
    const y = high ? w.cloudLayerMax + 30 + rand() * 120 : w.cloudLayerMin + rand() * (w.cloudLayerMax - w.cloudLayerMin);
    cloud.center.set(around.x + Math.cos(angle) * r, y, around.z + Math.sin(angle) * r);
  }

  function writeMatrices(index) {
    const cloud = clouds[index];
    cloud.puffs.forEach((puff, j) => {
      p.copy(cloud.center).add(puff.offset);
      m.compose(p, q, puff.scale);
      mesh.setMatrixAt(index * w.puffsPerCloud + j, m);
    });
  }

  let initialized = false;

  return {
    // headingAngle: oyuncunun xz düzlemindeki hareket yönü (atan2(z, x))
    update(playerPos, headingAngle) {
      let dirty = false;
      clouds.forEach((cloud, i) => {
        if (!initialized) {
          place(cloud, playerPos, null);
          writeMatrices(i);
          dirty = true;
        } else if (Math.hypot(cloud.center.x - playerPos.x, cloud.center.z - playerPos.z) > w.cloudRadius * 1.05) {
          place(cloud, playerPos, headingAngle);
          writeMatrices(i);
          dirty = true;
        }
      });
      initialized = true;
      if (dirty) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
