import * as THREE from 'three';
import { CONFIG } from '../config.js';

const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// Arcade uçuş modeli: kuş hep ileri gider; çırpma yükseltir, eğilme döndürür,
// squat daldırır, zıplama hız patlaması verir, kanat kapama hızlı ama düşüşlü.
export class FlightPhysics {
  constructor(terrain) {
    this.terrain = terrain;
    this.position = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.reset();
  }

  reset(position = null, yaw = 0) {
    const f = CONFIG.flight;
    if (position) this.position.copy(position);
    else this.position.set(0, f.startAltitude, 0);
    this.yaw = yaw; // 0 = -Z yönü
    this.speed = f.cruiseSpeed;
    this.vy = 0;
    this.bankVisual = 0;
    this.boost = 0; // ek hız (m/sn), zamanla söner
  }

  // 0..1: boost şiddeti (kamera FOV'u için)
  get boostLevel() {
    return Math.min(this.boost / CONFIG.flight.boostSpeed, 1);
  }

  update(dt, g) {
    const f = CONFIG.flight;

    // --- Dönüş: bank yatışı yumuşatılır, yatış kadar döner ---
    this.bankVisual = approach(this.bankVisual, g.bank, f.bankResponse, dt);
    this.yaw -= this.bankVisual * f.maxTurnRate * dt; // + bank = sağa dönüş

    // --- İleri hız ---
    if (g.jump) this.boost = f.boostSpeed;
    this.boost *= Math.exp(-dt / f.boostDecay);
    if (g.flap.event) this.speed += f.flapThrust * (0.5 + 0.5 * g.flap.strength);
    const targetSpeed = f.cruiseSpeed + this.boost
      + g.squatDepth * f.diveSpeedBonus
      + (g.wingsTucked ? f.tuckSpeedBonus : 0);
    this.speed = Math.min(approach(this.speed, targetSpeed, f.speedResponse, dt), f.maxSpeed);

    // --- Dikey hız: yerçekimi, çırpma itkisi, duruşa göre son düşüş hızı ---
    const gravityScale = g.glide ? f.glideGravityScale : 1;
    this.vy -= f.gravity * gravityScale * dt;
    if (g.flap.event) this.vy = Math.max(this.vy, 0) + f.flapImpulse * (0.5 + 0.5 * g.flap.strength);
    this.vy = Math.min(this.vy, f.maxClimbRate);

    let terminal = g.glide ? f.glideSinkRate : f.sinkRate;
    if (g.wingsTucked) terminal = f.tuckSinkRate;
    terminal = Math.max(terminal, g.squatDepth * f.diveSinkRate);
    // Dalışta düşüş hızına hızlıca ulaşılır; diğer durumlarda sürükleme ile sınırlanır
    if (g.squatDepth > 0.1) this.vy = Math.min(this.vy, approach(this.vy, -terminal, 3, dt));
    if (this.vy < -terminal) this.vy = approach(this.vy, -terminal, 4, dt);

    // --- Konum ---
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.position.addScaledVector(this.forward, this.speed * dt);
    this.position.y += this.vy * dt;

    // Tavan: yumuşak sınır
    if (this.position.y > f.ceiling && this.vy > 0) this.vy = approach(this.vy, 0, 6, dt);

    // Zemin: araziye çarpma yok; kuş yumuşakça yukarı itilir (oyun bitmez)
    const floor = this.terrain.heightAt(this.position.x, this.position.z) + f.groundClearance;
    if (this.position.y < floor) {
      this.position.y = floor;
      this.vy = Math.max(this.vy, f.groundBounce);
    }
  }
}
