import * as THREE from 'three';
import { CONFIG } from '../config.js';

// Gün batımı gökyüzü kubbesi, güneş parıltısı, sis ve ışıklar
export function createSky(scene) {
  const w = CONFIG.world;
  const sunDir = new THREE.Vector3(...w.sunDirection).normalize();

  scene.background = new THREE.Color(w.skyHorizon);
  scene.fog = new THREE.Fog(w.fogColor, w.fogNear, w.fogFar);

  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(w.skyTop) },
      midColor: { value: new THREE.Color(w.skyMid) },
      horizonColor: { value: new THREE.Color(w.skyHorizon) },
      sunColor: { value: new THREE.Color(w.sunColor) },
      sunDir: { value: sunDir },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor, midColor, horizonColor, sunColor, sunDir;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.18, h));
        col = mix(col, topColor, smoothstep(0.18, 0.7, h));
        // Ufkun altı sis rengine karışır
        col = mix(horizonColor, col, smoothstep(-0.05, 0.0, h));
        float s = max(dot(vDir, sunDir), 0.0);
        col += sunColor * (pow(s, 600.0) * 1.5 + pow(s, 12.0) * 0.35);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), material);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  scene.add(dome);

  scene.add(new THREE.HemisphereLight('#ffe6dc', '#5d5a48', 1.1));
  const sun = new THREE.DirectionalLight(w.sunColor, 1.8);
  sun.position.copy(sunDir).multiplyScalar(1000);
  scene.add(sun);
  scene.add(sun.target);

  return {
    // Kubbe ve ışık kamerayla birlikte taşınır (sonsuz gökyüzü)
    update(cameraPos) {
      dome.position.copy(cameraPos);
      sun.target.position.copy(cameraPos);
      sun.position.copy(cameraPos).addScaledVector(sunDir, 1000);
    },
  };
}
