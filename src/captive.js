import * as THREE from 'three';
import { buildHumanoid, walkAnim, makeBlobShadow, updateBlobShadow } from './figures.js';

const FOLLOW_SPEED = 4.2;
const STOP_DIST = 1.9;

export class Captive {
  constructor(city, scene) {
    this.city = city;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.radius = 0.3;
    this.onGround = true;
    this.freed = false;
    this.walkPhase = 0;
    this.waveTime = 0;
    this.visualY = 0;
    this.facingY = 0;

    const { group, parts } = buildHumanoid({
      skin: 0xe8b890, hair: 0x777777, shirt: 0xd9c0a8, legs: 0x8a7460,
    });
    this.mesh = group;
    this.parts = parts;
    this.shadow = makeBlobShadow(0.32);
    scene.add(this.mesh, this.shadow);
  }

  reset(prisonPos) {
    this.pos.copy(prisonPos);
    this.vel.set(0, 0, 0);
    this.freed = false;
    this.visualY = prisonPos.y;
    this.mesh.position.copy(prisonPos);
  }

  free() {
    this.freed = true;
  }

  update(dt, playerPos) {
    if (!this.freed) {
      // wave for help
      this.waveTime += dt;
      this.parts.armR.rotation.z = Math.PI - 0.3 + Math.sin(this.waveTime * 6) * 0.35;
      this.facingY = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      this.syncMesh(dt);
      return;
    }
    this.parts.armR.rotation.z = 0;

    const toPlayer = playerPos.clone().sub(this.pos);
    const dist = Math.hypot(toPlayer.x, toPlayer.z);

    if (dist > 24) {
      // hopelessly separated (fell off a roof, got mazed) — catch up
      this.pos.set(playerPos.x, playerPos.y + 0.1, playerPos.z);
      this.vel.set(0, 0, 0);
    }

    let speed = 0;
    if (dist > STOP_DIST) {
      speed = FOLLOW_SPEED;
      const dir = toPlayer.setY(0).normalize();
      this.vel.x += (dir.x * speed - this.vel.x) * Math.min(1, dt * 10);
      this.vel.z += (dir.z * speed - this.vel.z) * Math.min(1, dt * 10);
      this.facingY = Math.atan2(dir.x, dir.z);
    } else {
      this.vel.x *= 1 - Math.min(1, dt * 10);
      this.vel.z *= 1 - Math.min(1, dt * 10);
    }

    this.city.moveActor(this, dt);

    const spd = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += spd * dt * 3.2;
    walkAnim(this.parts, this.walkPhase, Math.min(0.7, spd * 0.18));
    this.syncMesh(dt);
  }

  syncMesh(dt) {
    this.visualY += (this.pos.y - this.visualY) * Math.min(1, dt * 16);
    if (this.vel.y < -2) this.visualY = this.pos.y;
    this.mesh.position.set(this.pos.x, this.visualY, this.pos.z);
    this.mesh.rotation.y = this.facingY;
    updateBlobShadow(this.shadow, this.city, this.pos, this.radius);
  }
}
