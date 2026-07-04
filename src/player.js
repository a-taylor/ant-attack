import * as THREE from 'three';
import { buildHumanoid, walkAnim, makeBlobShadow, updateBlobShadow } from './figures.js';
import { sfx } from './sfx.js';

const SPEED = 4.6;
const JUMP_V = 8.6;

const CHARACTERS = {
  sandy:  { skin: 0xe8b890, hair: 0x4a2f18, shirt: 0xf0efe6, legs: 0x33518f },
  sandra: { skin: 0xe8b890, hair: 0xd9b84e, shirt: 0xf0efe6, legs: 0xb03a5a },
};

export class Player {
  constructor(city, scene) {
    this.city = city;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.radius = 0.3;
    this.onGround = true;
    this.facing = new THREE.Vector3(0, 0, -1);
    this.invuln = 0;
    this.walkPhase = 0;
    this.visualY = 0;

    const { group, parts } = buildHumanoid(CHARACTERS.sandy);
    this.mesh = group;
    this.parts = parts;
    this.shadow = makeBlobShadow(0.32);
    scene.add(this.mesh, this.shadow);
    this.setCharacter('sandy');
  }

  setCharacter(name) {
    this.character = name;
    const c = CHARACTERS[name];
    this.parts.hairMat.color.setHex(c.hair);
    this.parts.legMat.color.setHex(c.legs);
    this.parts.shirtMat.color.setHex(c.shirt);
  }

  reset(spawn) {
    this.pos.copy(spawn);
    this.vel.set(0, 0, 0);
    this.onGround = true;
    this.invuln = 0;
    this.facing.set(0, 0, -1);
    this.visualY = spawn.y;
    this.syncMesh();
  }

  hit(fromPos) {
    if (this.invuln > 0) return false;
    this.invuln = 1.6;
    const away = this.pos.clone().sub(fromPos).setY(0);
    if (away.lengthSq() < 0.001) away.set(0, 0, 1);
    away.normalize();
    this.vel.x = away.x * 6;
    this.vel.z = away.z * 6;
    this.vel.y = 4.5;
    this.onGround = false;
    sfx('hit');
    return true;
  }

  update(dt, input, cam) {
    const fwdAxis = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const rightAxis = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);

    const move = new THREE.Vector3()
      .addScaledVector(cam.forward, fwdAxis)
      .addScaledVector(cam.right, rightAxis);
    if (move.lengthSq() > 0) move.normalize();

    // knockback decays; player control blends back in
    const control = this.invuln > 1.2 ? 0.15 : 1;
    const blend = Math.min(1, dt * 12) * control;
    this.vel.x += (move.x * SPEED - this.vel.x) * blend;
    this.vel.z += (move.z * SPEED - this.vel.z) * blend;

    if (input.consumePressed('Space') && this.onGround) {
      this.vel.y = JUMP_V;
      this.onGround = false;
      sfx('jump');
    }

    this.city.moveActor(this, dt);

    if (move.lengthSq() > 0) this.facing.copy(move);
    if (this.invuln > 0) this.invuln -= dt;

    // animation
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += speed * dt * 3.2;
    walkAnim(this.parts, this.walkPhase, Math.min(0.7, speed * 0.18));
    this.mesh.visible = this.invuln <= 0 || Math.floor(this.invuln * 10) % 2 === 0;

    this.syncMesh(dt);
  }

  syncMesh(dt = 1) {
    // smooth the 1-block step-ups so climbing reads as a hop, not a teleport
    this.visualY += (this.pos.y - this.visualY) * Math.min(1, dt * 16);
    if (Math.abs(this.pos.y - this.visualY) < 0.01 || this.vel.y < -2) this.visualY = this.pos.y;
    this.mesh.position.set(this.pos.x, this.visualY, this.pos.z);
    this.mesh.rotation.y = Math.atan2(this.facing.x, this.facing.z);
    updateBlobShadow(this.shadow, this.city, this.pos, this.radius);
  }
}
