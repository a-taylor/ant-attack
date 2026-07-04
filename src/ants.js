import * as THREE from 'three';
import { makeBlobShadow, updateBlobShadow } from './figures.js';
import { sfx } from './sfx.js';

const CHASE_RANGE = 12;
const WANDER_SPEED = 1.3;
const CHASE_SPEED = 2.7;
const RESPAWN_TIME = 15;

function buildAntMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x1c1c24 });
  const box = (w, h, d) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

  const abdomen = box(0.6, 0.45, 0.8);
  abdomen.position.set(0, 0.55, 0.65);
  const thorax = box(0.42, 0.36, 0.45);
  thorax.position.set(0, 0.55, 0);
  const head = box(0.4, 0.4, 0.42);
  head.position.set(0, 0.6, -0.45);

  const antL = box(0.04, 0.04, 0.4);
  antL.position.set(-0.12, 0.85, -0.65);
  antL.rotation.x = -0.5;
  const antR = antL.clone();
  antR.position.x = 0.12;

  const legs = [];
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const leg = box(0.06, 0.55, 0.06);
      leg.geometry = leg.geometry.clone();
      leg.geometry.translate(0, -0.25, 0);
      leg.position.set(side * 0.22, 0.55, -0.25 + i * 0.3);
      leg.rotation.z = side * 0.5;
      legs.push(leg);
      g.add(leg);
    }
  }
  g.add(abdomen, thorax, head, antL, antR);
  return { mesh: g, legs };
}

class Ant {
  constructor(city, scene) {
    this.city = city;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.radius = 0.35;
    this.onGround = true;
    this.heading = Math.random() * Math.PI * 2;
    this.wanderTimer = 0;
    this.evadeTimer = 0;
    this.dead = false;
    this.deathAnim = 0;
    this.respawnTimer = 0;
    this.legPhase = Math.random() * 10;
    this.visualY = 0;

    const { mesh, legs } = buildAntMesh();
    this.mesh = mesh;
    this.legs = legs;
    this.shadow = makeBlobShadow(0.4);
    scene.add(this.mesh, this.shadow);
  }

  spawnAt(p) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.dead = false;
    this.deathAnim = 0;
    this.visualY = p.y;
    this.mesh.visible = true;
    this.shadow.visible = true;
    this.mesh.scale.setScalar(1);
    this.mesh.rotation.z = 0;
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.deathAnim = 0.7;
    this.respawnTimer = RESPAWN_TIME;
    sfx('antdie');
  }

  update(dt, playerPos, playerAlive) {
    if (this.dead) {
      if (this.deathAnim > 0) {
        this.deathAnim -= dt;
        this.mesh.rotation.z += dt * 9;
        this.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 2.2));
        if (this.deathAnim <= 0) {
          this.mesh.visible = false;
          this.shadow.visible = false;
        }
      }
      return;
    }

    const toPlayer = playerPos.clone().sub(this.pos);
    const distXZ = Math.hypot(toPlayer.x, toPlayer.z);
    let speed;

    if (this.evadeTimer > 0) {
      this.evadeTimer -= dt;
      speed = CHASE_SPEED;
    } else if (playerAlive && distXZ < CHASE_RANGE) {
      this.heading = Math.atan2(toPlayer.x, toPlayer.z);
      speed = CHASE_SPEED;
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.heading = Math.random() * Math.PI * 2;
        this.wanderTimer = 2 + Math.random() * 3;
      }
      speed = WANDER_SPEED;
    }

    this.vel.x = Math.sin(this.heading) * speed;
    this.vel.z = Math.cos(this.heading) * speed;

    const before = this.pos.clone();
    // ants cannot climb — like the original, they only roam the floor level,
    // but their low body squeezes through 1-block holes in the walls
    this.city.moveActor(this, dt, { maxStep: 0.06, height: 0.9 });
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    if (moved < speed * dt * 0.3) {
      // stuck against something too tall — sidestep for a moment
      this.heading += (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2) + (Math.random() - 0.5);
      this.evadeTimer = 0.5;
      this.wanderTimer = 0;
    }

    // animation
    this.legPhase += speed * dt * 6;
    for (let i = 0; i < this.legs.length; i++) {
      this.legs[i].rotation.x = Math.sin(this.legPhase + i * 1.1) * 0.5;
    }
    this.visualY += (this.pos.y - this.visualY) * Math.min(1, dt * 14);
    this.mesh.position.set(this.pos.x, this.visualY, this.pos.z);
    this.mesh.rotation.y = Math.atan2(this.vel.x, this.vel.z);
    updateBlobShadow(this.shadow, this.city, this.pos, this.radius);
  }
}

export class AntManager {
  constructor(city, scene, count = 8) {
    this.city = city;
    this.ants = [];
    for (let i = 0; i < count; i++) this.ants.push(new Ant(city, scene));
  }

  reset(playerPos) {
    for (const ant of this.ants) {
      ant.spawnAt(this.city.randomStreetPos(playerPos, 14, 45));
      ant.respawnTimer = 0;
    }
  }

  update(dt, playerPos, playerAlive) {
    for (const ant of this.ants) {
      if (ant.dead && ant.deathAnim <= 0) {
        ant.respawnTimer -= dt;
        if (ant.respawnTimer <= 0) ant.spawnAt(this.city.randomStreetPos(playerPos, 16, 50));
      }
      ant.update(dt, playerPos, playerAlive);
    }
  }

  // returns list of ants whose body overlaps pos within reach.
  // vertical tolerance < 1 so standing on a 1-block ledge is out of bite range —
  // height is the refuge from ants, as in the original
  touching(pos, reach = 0.85) {
    return this.ants.filter(
      (a) => !a.dead &&
        Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z) < reach &&
        Math.abs(a.pos.y - pos.y) < 0.8
    );
  }

  damageAt(pos, radius) {
    let kills = 0;
    for (const a of this.ants) {
      if (!a.dead && a.pos.distanceTo(pos) < radius) {
        a.kill();
        kills++;
      }
    }
    return kills;
  }
}
