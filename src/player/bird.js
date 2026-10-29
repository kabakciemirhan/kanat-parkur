import * as THREE from 'three';
import { CONFIG } from '../config.js';

const DEG = Math.PI / 180;
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

const COLORS = {
  body: '#f8f8f8',
  wing: '#cfc9ac',
  tip: '#26281d',
  beak: '#ff9a5a',
  tail: '#ff7fa8',
  eye: '#26281d',
};

function mat(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, side: THREE.DoubleSide });
}

// XY düzleminde çizilen çokgeni yatay (XZ) kanat yüzeyine çevirir; side = -1 sol, +1 sağ
function wingShape(points, side) {
  const geo = new THREE.ShapeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))));
  geo.rotateX(-Math.PI / 2); // şekil y'si → -z (ön kenar)
  geo.scale(side, 1, 1);
  return geo;
}

function buildWing(side) {
  const root = new THREE.Group(); // omuz eklemi
  const inner = new THREE.Mesh(wingShape([[0, 0.75], [2.6, 0.6], [2.6, -1.0], [0, -1.0]], side), mat(COLORS.wing));
  root.add(inner);
  const elbow = new THREE.Group(); // dirsek eklemi: dış kanat
  elbow.position.x = 2.6 * side;
  const outer = new THREE.Mesh(wingShape([[0, 0.6], [1.8, 0.3], [3.0, -0.45], [2.1, -1.1], [0, -1.0]], side), mat(COLORS.tip));
  elbow.add(outer);
  root.add(elbow);
  root.position.set(0.55 * side, 0.25, -0.3);
  return { root, elbow, side, angle: 10 * DEG, bend: 0, sweep: 0 };
}

// Prosedürel low-poly kuş. Kanat açısı oyuncunun kol açısını birebir izler.
export class Bird {
  constructor() {
    this.object = new THREE.Group(); // dünya konumu ve yön (yaw)
    this.object.rotation.order = 'YXZ';
    this.model = new THREE.Group(); // görsel duruş (pitch, roll, takla)
    this.model.rotation.order = 'YXZ';
    this.object.add(this.model);

    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), mat(COLORS.body));
    body.scale.set(0.85, 0.72, 2);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), mat(COLORS.body));
    head.position.set(0, 0.45, -1.7);
    const beakGeo = new THREE.ConeGeometry(0.2, 0.75, 4);
    beakGeo.rotateX(-Math.PI / 2);
    const beak = new THREE.Mesh(beakGeo, mat(COLORS.beak));
    beak.position.set(0, 0.35, -2.45);
    const eyeGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const eyeL = new THREE.Mesh(eyeGeo, mat(COLORS.eye));
    eyeL.position.set(-0.33, 0.62, -1.95);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.33;
    const tailGeo = new THREE.ConeGeometry(0.75, 1.7, 3);
    tailGeo.rotateX(Math.PI / 2);
    tailGeo.scale(1, 0.25, 1);
    const tail = new THREE.Mesh(tailGeo, mat(COLORS.tail));
    tail.position.set(0, 0.15, 2.15);

    this.wingL = buildWing(-1);
    this.wingR = buildWing(1);
    this.model.add(body, head, beak, eyeL, eyeR, tail, this.wingL.root, this.wingR.root);

    this.flipT = null; // takla zamanlayıcısı (sn), null = takla yok
    this.autoFlapT = null; // kol verisi yokken çırpma animasyonu
    this.time = 0;
    this.roll = 0;
    this.pitch = 0;
  }

  // Tek seferlik olaylar
  flip() {
    this.flipT = 0;
  }

  // g: gesture çıktısı, flight: uçuş durumu (bankVisual, vy, speed)
  update(dt, g, flight) {
    const cb = CONFIG.bird;
    this.time += dt;
    if (g.flap.event) this.autoFlapT = 0;
    if (g.jump) this.flip();

    // Kanat hedef açıları: kol verisi varsa birebir, yoksa animasyon
    const auto = this._autoWingAngle(dt);
    const target = (armDeg) => {
      if (g.wingsTucked) return -15 * DEG;
      const deg = armDeg ?? auto;
      return THREE.MathUtils.clamp(deg, cb.maxWingDownDeg, cb.maxWingUpDeg) * DEG;
    };
    for (const [wing, armDeg] of [[this.wingL, g.arms?.left], [this.wingR, g.arms?.right]]) {
      wing.angle = approach(wing.angle, target(armDeg), cb.wingResponse, dt);
      // Dış kanat inişte biraz geride kalır (doğal çırpma görünümü)
      const bendTarget = g.wingsTucked ? -60 * DEG : -0.25 * wing.angle;
      wing.bend = approach(wing.bend, bendTarget, cb.wingResponse, dt);
      wing.sweep = approach(wing.sweep, g.wingsTucked ? 65 * DEG : 0, 8, dt);
      wing.root.rotation.set(0, -wing.side * wing.sweep, wing.side * wing.angle);
      wing.elbow.rotation.z = wing.side * wing.bend;
    }

    // Gövde duruşu: yatış, tırmanma/dalış eğimi, squat'ta öne eğilme
    this.roll = -flight.bankVisual * cb.maxRollDeg * DEG;
    const climbPitch = Math.atan2(flight.vy, Math.max(flight.speed, 1)) * 0.8;
    const targetPitch = climbPitch - g.squatDepth * cb.squatPitchDeg * DEG;
    this.pitch = approach(this.pitch, targetPitch, 6, dt);

    let flipPitch = 0;
    if (this.flipT !== null) {
      this.flipT += dt;
      const u = Math.min(this.flipT / cb.flipDuration, 1);
      flipPitch = (u * u * (3 - 2 * u)) * Math.PI * 2; // yumuşak başla-bitir
      if (u >= 1) this.flipT = null;
    }
    this.model.rotation.set(this.pitch + flipPitch, 0, this.roll);
  }

  // Klavye modunda çırpma animasyonu: kalk → hızla in → dinlenme
  _autoWingAngle(dt) {
    const idle = 8 + Math.sin(this.time * 2) * 3;
    if (this.autoFlapT === null) return idle;
    this.autoFlapT += dt;
    const u = this.autoFlapT / CONFIG.bird.autoFlapDuration;
    if (u >= 1) {
      this.autoFlapT = null;
      return idle;
    }
    return u < 0.35 ? 65 : -50;
  }
}
