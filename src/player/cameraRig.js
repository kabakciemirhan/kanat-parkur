import * as THREE from 'three';
import { CONFIG } from '../config.js';

const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// 3. şahıs takip kamerası: kuşun arkasından izler, boost'ta FOV genişler
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.desired = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.initialized = false;
  }

  update(dt, flight) {
    const c = CONFIG.cameraRig;
    const { position, forward } = flight;
    this.desired.copy(position).addScaledVector(forward, -c.distance);
    this.desired.y += c.height;

    if (!this.initialized) {
      this.camera.position.copy(this.desired);
      this.initialized = true;
    } else {
      const k = 1 - Math.exp(-c.followResponse * dt);
      this.camera.position.lerp(this.desired, k);
    }
    this.look.copy(position).addScaledVector(forward, c.lookAhead);
    this.camera.lookAt(this.look);
    // Kuşun yatışını hafifçe izle
    this.camera.rotateZ(-flight.bankVisual * c.rollFollow);

    const fov = approach(this.camera.fov, c.baseFov + (c.boostFov - c.baseFov) * flight.boostLevel, c.fovResponse, dt);
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
