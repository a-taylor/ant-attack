import * as THREE from 'three';

export const SIZE = 72;          // city is SIZE x SIZE unit blocks
const WALL_H = 5;

// palette: near-monochrome whites with faint tints, evoking the "white city"
const PALETTE = [
  0xe9e5d8, // bone white
  0xdfe3e0, // cool grey-white
  0xe4d9c6, // warm sand
  0xd6dce6, // pale blue-grey
  0xe6dcd2, // pale rose-grey
  0xdcdcd0, // stone
];
const WALL_COLOR = 0xb9b4a4;
const PRISON_COLOR = 0x9aa0ae;

export class City {
  constructor(seed = Math.random() * 1e9) {
    this.heights = new Uint8Array(SIZE * SIZE);
    this.colorIdx = new Uint8Array(SIZE * SIZE); // index into this.colors
    this.colors = PALETTE.map((c) => new THREE.Color(c));
    this.colors.push(new THREE.Color(WALL_COLOR));   // idx PALETTE.length
    this.colors.push(new THREE.Color(PRISON_COLOR)); // idx PALETTE.length + 1

    // simple seeded rng (mulberry32)
    let s = seed >>> 0;
    this.rand = () => {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    this.gateX = Math.floor(SIZE / 2);
    this.generate();
    this.group = this.buildMeshes();
  }

  h(ix, iz) {
    if (ix < 0 || iz < 0 || ix >= SIZE || iz >= SIZE) return 9; // solid beyond the map
    return this.heights[iz * SIZE + ix];
  }
  set(ix, iz, v, color) {
    if (ix < 0 || iz < 0 || ix >= SIZE || iz >= SIZE) return;
    this.heights[iz * SIZE + ix] = v;
    if (color !== undefined) this.colorIdx[iz * SIZE + ix] = color;
  }

  // highest column under the square footprint centered at (x, z) with half-size r
  maxH(x, z, r) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    const z0 = Math.floor(z - r), z1 = Math.floor(z + r);
    let m = 0;
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const v = this.h(ix, iz);
        if (v > m) m = v;
      }
    return m;
  }

  // shared kinematics for player / ants / captive. actor: {pos, vel, radius, onGround}
  // Grounded actors auto-step up single blocks; taller columns stop them.
  moveActor(a, dt, { gravity = 25, maxStep = 1.06 } = {}) {
    const step = a.onGround ? maxStep : 0.06;
    const nx = a.pos.x + a.vel.x * dt;
    if (this.maxH(nx, a.pos.z, a.radius) <= a.pos.y + step) a.pos.x = nx;
    else a.vel.x = 0;
    const nz = a.pos.z + a.vel.z * dt;
    if (this.maxH(a.pos.x, nz, a.radius) <= a.pos.y + step) a.pos.z = nz;
    else a.vel.z = 0;

    a.vel.y -= gravity * dt;
    let ny = a.pos.y + a.vel.y * dt;
    const floor = this.maxH(a.pos.x, a.pos.z, a.radius * 0.85);
    if (ny <= floor + 1e-3) {
      ny = floor;
      a.vel.y = 0;
      a.onGround = true;
    } else {
      a.onGround = false;
    }
    a.pos.y = ny;
  }

  generate() {
    const R = this.rand;
    const WALL_IDX = PALETTE.length;
    const PRISON_IDX = PALETTE.length + 1;

    // ---- perimeter wall (2 cells thick) ----
    for (let i = 0; i < SIZE; i++) {
      for (let t = 0; t < 2; t++) {
        this.set(i, t, WALL_H, WALL_IDX);
        this.set(i, SIZE - 1 - t, WALL_H, WALL_IDX);
        this.set(t, i, WALL_H, WALL_IDX);
        this.set(SIZE - 1 - t, i, WALL_H, WALL_IDX);
      }
    }

    // ---- street grid -> building plots ----
    const lines = (from, to) => {
      const out = [from];
      let v = from;
      while (v < to - 10) {
        v += 8 + Math.floor(R() * 5);
        out.push(Math.min(v, to));
      }
      out.push(to);
      return out;
    };
    const xs = lines(2, SIZE - 2);
    const zs = lines(2, SIZE - 2);

    // staircases are placed after the ring road / gate / prison carves so those
    // can't delete them (carving a building's only stairs left its roof unreachable)
    const stairJobs = [];

    for (let zi = 0; zi < zs.length - 1; zi++) {
      for (let xi = 0; xi < xs.length - 1; xi++) {
        const x0 = xs[xi] + 2, x1 = xs[xi + 1] - 1;
        const z0 = zs[zi] + 2, z1 = zs[zi + 1] - 1;
        if (x1 - x0 < 2 || z1 - z0 < 2) continue;
        if (R() < 0.16) continue; // plaza

        const color = Math.floor(R() * PALETTE.length);
        const hMax = 2 + Math.floor(R() * 4); // 2..5

        if (R() < 0.45) {
          // ziggurat: stepped pyramid, climbable from every side
          for (let iz = z0; iz <= z1; iz++)
            for (let ix = x0; ix <= x1; ix++) {
              const edge = Math.min(ix - x0, x1 - ix, iz - z0, z1 - iz);
              this.set(ix, iz, Math.min(hMax, edge + 1), color);
            }
        } else {
          // flat-roofed block with an external staircase strip
          for (let iz = z0; iz <= z1; iz++)
            for (let ix = x0; ix <= x1; ix++) this.set(ix, iz, hMax, color);

          stairJobs.push({ x0, x1, z0, z1, hMax, color, side: Math.floor(R() * 4) });
        }
      }
    }

    // ---- ring road inside the wall: guarantees every street connects ----
    for (let i = 2; i < SIZE - 2; i++)
      for (const t of [2, 3, SIZE - 4, SIZE - 3]) {
        this.set(i, t, 0);
        this.set(t, i, 0);
      }

    // ---- south gate: carve an opening and a clear approach ----
    const g = this.gateX;
    for (let dz = 0; dz < 2; dz++)
      for (let dx = -1; dx <= 1; dx++) this.set(g + dx, SIZE - 1 - dz, 0, WALL_IDX);
    for (let iz = SIZE - 6; iz <= SIZE - 3; iz++)
      for (let ix = g - 3; ix <= g + 3; ix++) this.set(ix, iz, 0);

    // ---- prison enclosure in the north ----
    const pcx = Math.floor(SIZE / 2 + (R() - 0.5) * 20);
    const pcz = 7;
    for (let iz = pcz - 4; iz <= pcz + 4; iz++)
      for (let ix = pcx - 4; ix <= pcx + 4; ix++) this.set(ix, iz, 0);
    for (let d = -3; d <= 3; d++) {
      this.set(pcx + d, pcz - 3, 3, PRISON_IDX);
      this.set(pcx + d, pcz + 3, 3, PRISON_IDX);
      this.set(pcx - 3, pcz + d, 3, PRISON_IDX);
      this.set(pcx + 3, pcz + d, 3, PRISON_IDX);
    }
    this.set(pcx, pcz + 3, 0, PRISON_IDX); // doorway facing south
    this.prisonPos = new THREE.Vector3(pcx + 0.5, 0, pcz + 0.5);

    // ---- external staircases, on ground that is now final ----
    for (const { x0, x1, z0, z1, hMax, color, side } of stairJobs) {
      for (let k = 0; k < hMax - 1; k++) {
        let sx, sz;
        if (side === 0) { sx = x0 + k; sz = z1 + 1; }
        else if (side === 1) { sx = x0 + k; sz = z0 - 1; }
        else if (side === 2) { sx = x1 + 1; sz = z0 + k; }
        else { sx = x0 - 1; sz = z0 + k; }
        if (sx < 3 || sz < 3 || sx > SIZE - 4 || sz > SIZE - 4) break;
        if (this.h(sx, sz) === 0) this.set(sx, sz, k + 1, color);
      }
    }

    this.spawnPos = new THREE.Vector3(g + 0.5, 0, SIZE - 4.5);
    this.gatePos = new THREE.Vector3(g + 0.5, 0, SIZE - 1.5);
  }

  inGateZone(pos) {
    return pos.z > SIZE - 4 && Math.abs(pos.x - (this.gateX + 0.5)) < 2.5 && pos.y < 1.5;
  }

  // random flat street cell, at least minDist from `away`
  randomStreetPos(away, minDist) {
    for (let tries = 0; tries < 200; tries++) {
      const ix = 3 + Math.floor(this.rand() * (SIZE - 6));
      const iz = 3 + Math.floor(this.rand() * (SIZE - 6));
      if (this.h(ix, iz) !== 0) continue;
      const p = new THREE.Vector3(ix + 0.5, 0, iz + 0.5);
      if (!away || p.distanceTo(away) >= minDist) return p;
    }
    return this.spawnPos.clone();
  }

  buildMeshes() {
    const group = new THREE.Group();

    // count exposed blocks, then instance them
    const exposed = [];
    for (let iz = 0; iz < SIZE; iz++)
      for (let ix = 0; ix < SIZE; ix++) {
        const h = this.h(ix, iz);
        for (let y = 0; y < h; y++) {
          const top = y === h - 1;
          const side =
            this.h(ix - 1, iz) <= y || this.h(ix + 1, iz) <= y ||
            this.h(ix, iz - 1) <= y || this.h(ix, iz + 1) <= y;
          if (top || side) exposed.push(ix, y, iz);
        }
      }

    const count = exposed.length / 3;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial();
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const ix = exposed[i * 3], y = exposed[i * 3 + 1], iz = exposed[i * 3 + 2];
      m.makeTranslation(ix + 0.5, y + 0.5, iz + 0.5);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, this.colors[this.colorIdx[iz * SIZE + ix]]);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);

    // ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE * 4, SIZE * 4),
      new THREE.MeshLambertMaterial({ color: 0x8f8878 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(SIZE / 2, -0.02, SIZE / 2);
    group.add(ground);

    // gate marker posts
    const postGeo = new THREE.BoxGeometry(0.3, 3.4, 0.3);
    const postMat = new THREE.MeshLambertMaterial({ color: 0xffd24a });
    for (const dx of [-1.7, 1.7]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(this.gateX + 0.5 + dx, 1.7, SIZE - 2.5);
      group.add(post);
    }
    return group;
  }
}
