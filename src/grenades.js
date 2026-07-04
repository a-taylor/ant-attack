import * as THREE from 'three';
import { sfx } from './sfx.js';

const FUSE = 1.1;
const GRAVITY = 22;
const BLAST_RADIUS = 3.5;

export class GrenadeManager {
  constructor(scene, city, onExplode) {
    this.scene = scene;
    this.city = city;
    this.onExplode = onExplode; // (pos, radius) => void
    this.grenades = [];
    this.explosions = [];
    this.geo = new THREE.SphereGeometry(0.14, 8, 6);
    this.mat = new THREE.MeshLambertMaterial({ color: 0x2a3a2a });
    this.boomGeo = new THREE.SphereGeometry(1, 12, 8);

    // adding/removing lights changes the scene light count and recompiles every
    // material, so keep a fixed pool in the scene at intensity 0 and reuse it
    this.lightPool = [];
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffcc66, 0, 14);
      scene.add(light);
      this.lightPool.push(light);
    }
  }

  throw(origin, dir) {
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.grenades.push({
      pos: origin.clone(),
      vel: new THREE.Vector3(dir.x * 7.5, 7.2, dir.z * 7.5),
      fuse: FUSE,
      mesh,
    });
    sfx('throw');
  }

  explode(g) {
    this.scene.remove(g.mesh);
    sfx('boom');
    const boom = new THREE.Mesh(
      this.boomGeo,
      new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.95 })
    );
    boom.position.copy(g.pos).y += 0.4;
    boom.scale.setScalar(0.4);
    this.scene.add(boom);
    const light = this.lightPool.find((l) => !this.explosions.some((e) => e.light === l)) || null;
    if (light) {
      light.intensity = 60;
      light.position.copy(boom.position);
    }
    this.explosions.push({ mesh: boom, light, t: 0 });
    this.onExplode(g.pos, BLAST_RADIUS);
  }

  update(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      g.vel.y -= GRAVITY * dt;

      // horizontal motion with wall bounce
      for (const axis of ['x', 'z']) {
        const next = g.pos[axis] + g.vel[axis] * dt;
        const test = g.pos.clone();
        test[axis] = next;
        if (this.city.maxH(test.x, test.z, 0.12) > g.pos.y + 0.05) {
          g.vel[axis] *= -0.45;
        } else {
          g.pos[axis] = next;
        }
      }
      // vertical with floor bounce
      g.pos.y += g.vel.y * dt;
      const floor = this.city.maxH(g.pos.x, g.pos.z, 0.12);
      if (g.pos.y <= floor + 0.05) {
        g.pos.y = floor + 0.05;
        if (g.vel.y < -1.5) {
          g.vel.y *= -0.45;
          g.vel.x *= 0.7;
          g.vel.z *= 0.7;
        } else {
          g.vel.y = 0;
          g.vel.x *= 1 - Math.min(1, dt * 4);
          g.vel.z *= 1 - Math.min(1, dt * 4);
        }
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * 8;

      if (g.fuse <= 0) {
        this.explode(g);
        this.grenades.splice(i, 1);
      }
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.t += dt;
      const k = e.t / 0.35;
      e.mesh.scale.setScalar(0.4 + k * BLAST_RADIUS);
      e.mesh.material.opacity = Math.max(0, 0.95 * (1 - k));
      if (e.light) e.light.intensity = Math.max(0, 60 * (1 - k * 1.4));
      if (k >= 1) {
        if (e.light) e.light.intensity = 0; // back to the pool
        this.scene.remove(e.mesh);
        e.mesh.material.dispose();
        this.explosions.splice(i, 1);
      }
    }
  }

  clear() {
    for (const g of this.grenades) this.scene.remove(g.mesh);
    for (const e of this.explosions) {
      if (e.light) e.light.intensity = 0;
      this.scene.remove(e.mesh);
      e.mesh.material.dispose();
    }
    this.grenades.length = 0;
    this.explosions.length = 0;
  }
}
