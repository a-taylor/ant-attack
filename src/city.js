import * as THREE from 'three';
import { MAP_SIZE, MAP_COLUMNS } from './mapdata.js';

// The city is the real Antescher, extracted from the original 1983 snapshot
// (see ant_attack_original_map_extraction.md). Columns are 6-bit masks of
// solid unit blocks, not heights — mid-wall holes, arches and floating
// ledges are real and preserved. World is centered on the origin: cell
// (ix, iz) spans [ix, ix+1) with ix, iz in -HALF .. HALF-1.
export const SIZE = MAP_SIZE;   // 128
export const HALF = MAP_SIZE / 2;
const LEVELS = 6;

// actors' body height in blocks: what they can walk under / squeeze through.
// Player and captive need 2 clear levels; ants (DEFAULTS in ants.js: 0.9)
// crawl through 1-block holes — that's how they get everywhere, like 1983.
const BODY_H = 1.5;

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

export class City {
  constructor() {
    this.cols = MAP_COLUMNS; // Uint8Array(SIZE*SIZE), index (iz+HALF)*SIZE+(ix+HALF)

    // fixed key positions on the real architecture (design choices):
    // spawn just inside the gatehouse's low step-over wall (south),
    // captive in the high-walled yard in the far north-east.
    this.spawnPos = new THREE.Vector3(-11.5, 0, 55.5);
    this.gatePos = new THREE.Vector3(-11.5, 0, 61.5);
    this.captivePos = new THREE.Vector3(50.5, 0, -48.5);

    this.group = this.buildMeshes();
  }

  // column bitmask at integer cell coords; -1 = out of bounds (treated solid)
  mask(ix, iz) {
    const gx = ix + HALF, gz = iz + HALF;
    if (gx < 0 || gz < 0 || gx >= SIZE || gz >= SIZE) return -1;
    return this.cols[gz * SIZE + gx];
  }

  // column top height (blocks above any gaps included); OOB reports 9 so
  // nothing ever leaves the map
  h(ix, iz) {
    const m = this.mask(ix, iz);
    if (m < 0) return 9;
    let t = 0;
    for (let l = 0; l < LEVELS; l++) if ((m >> l) & 1) t = l + 1;
    return t;
  }

  // highest column top under the square footprint centered at (x, z)
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

  // is there a solid block containing height y anywhere in the footprint?
  solidAt(x, y, z, r = 0) {
    const l = Math.floor(y);
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    const z0 = Math.floor(z - r), z1 = Math.floor(z + r);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const m = this.mask(ix, iz);
        if (m < 0) return true;
        if (l >= 0 && l < LEVELS && (m >> l) & 1) return true;
      }
    return false;
  }

  // top of the highest block whose top is at or below y + allow (i.e. the
  // surface an actor at feet-height y can be standing on / land on)
  floorUnder(x, z, r, y, allow) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    const z0 = Math.floor(z - r), z1 = Math.floor(z + r);
    let f = 0;
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const m = this.mask(ix, iz);
        if (m < 0) { f = Math.max(f, 9); continue; }
        for (let l = 0; l < LEVELS; l++)
          if ((m >> l) & 1 && l + 1 <= y + allow && l + 1 > f) f = l + 1;
      }
    return f;
  }

  // bottom of the lowest block fully above the actor's head
  ceilingAbove(x, z, r, y, height) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    const z0 = Math.floor(z - r), z1 = Math.floor(z + r);
    let c = Infinity;
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const m = this.mask(ix, iz);
        if (m <= 0) continue;
        for (let l = 0; l < LEVELS; l++)
          if ((m >> l) & 1 && l >= y + height - 1e-3 && l < c) c = l;
      }
    return c;
  }

  // can a body (radius r, height h, feet at y, allowed to step up `step`)
  // occupy (x, z)? Blocks entirely below y+step are steppable, anything else
  // overlapping the body blocks. Walking under arches falls out naturally.
  canOccupy(x, z, r, y, step, h) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    const z0 = Math.floor(z - r), z1 = Math.floor(z + r);
    let sup = 0; // where the feet would rest after any step-up
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const m = this.mask(ix, iz);
        if (m < 0) return false;
        for (let l = 0; l < LEVELS; l++)
          if ((m >> l) & 1 && l + 1 <= y + step && l + 1 > sup) sup = l + 1;
      }
    const feet = Math.max(y, sup);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const m = this.mask(ix, iz);
        for (let l = 0; l < LEVELS; l++)
          if ((m >> l) & 1 && l + 1 > y + step && l < feet + h) return false;
      }
    return true;
  }

  // shared kinematics for player / ants / captive. actor: {pos, vel, radius, onGround}
  // Grounded actors auto-step up single blocks; taller obstacles stop them.
  // `height` is body height: blocks overhead block or are walked under.
  moveActor(a, dt, { gravity = 25, maxStep = 1.06, height = BODY_H } = {}) {
    const step = a.onGround ? maxStep : 0.06;
    const nx = a.pos.x + a.vel.x * dt;
    if (this.canOccupy(nx, a.pos.z, a.radius, a.pos.y, step, height)) a.pos.x = nx;
    else a.vel.x = 0;
    const nz = a.pos.z + a.vel.z * dt;
    if (this.canOccupy(a.pos.x, nz, a.radius, a.pos.y, step, height)) a.pos.z = nz;
    else a.vel.z = 0;

    a.vel.y -= gravity * dt;
    let ny = a.pos.y + a.vel.y * dt;
    if (a.vel.y > 0) {
      const ceil = this.ceilingAbove(a.pos.x, a.pos.z, a.radius * 0.85, a.pos.y, height);
      if (ny + height > ceil) { ny = ceil - height; a.vel.y = 0; }
    }
    const floor = this.floorUnder(a.pos.x, a.pos.z, a.radius * 0.85, a.pos.y, step);
    if (ny <= floor + 1e-3) {
      ny = floor;
      a.vel.y = 0;
      a.onGround = true;
    } else {
      a.onGround = false;
    }
    a.pos.y = ny;
  }

  // the walled pocket between the gatehouse's low wall and the open south edge
  inGateZone(pos) {
    return pos.z > 59.2 && pos.x > -19 && pos.x < -3 && pos.y < 1.5;
  }

  // random fully-open street cell, at least minDist and at most maxDist from `away`
  randomStreetPos(away, minDist, maxDist = Infinity) {
    for (let tries = 0; tries < 400; tries++) {
      const ix = 1 - HALF + Math.floor(Math.random() * (SIZE - 2));
      const iz = 1 - HALF + Math.floor(Math.random() * (SIZE - 2));
      if (this.mask(ix, iz) !== 0) continue;
      const p = new THREE.Vector3(ix + 0.5, 0, iz + 0.5);
      if (!away) return p;
      const d = p.distanceTo(away);
      if (d >= minDist && (d <= maxDist || tries > 200)) return p;
    }
    return this.spawnPos.clone();
  }

  buildMeshes() {
    const group = new THREE.Group();
    const colors = PALETTE.map((c) => new THREE.Color(c));
    const wallColor = new THREE.Color(WALL_COLOR);

    // per-building color: flood-fill connected solid columns; components
    // touching the map border are the perimeter wall
    const compOf = new Int16Array(SIZE * SIZE).fill(-1);
    const compColor = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (this.cols[i] === 0 || compOf[i] >= 0) continue;
      const comp = compColor.length;
      let onBorder = false;
      const stack = [i];
      compOf[i] = comp;
      while (stack.length) {
        const j = stack.pop();
        const gx = j % SIZE, gz = (j / SIZE) | 0;
        if (gx === 0 || gz === 0 || gx === SIZE - 1 || gz === SIZE - 1) onBorder = true;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = gx + dx, nz = gz + dz;
          if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
          const k = nz * SIZE + nx;
          if (this.cols[k] !== 0 && compOf[k] < 0) { compOf[k] = comp; stack.push(k); }
        }
      }
      compColor.push(onBorder ? wallColor : colors[comp % colors.length]);
    }

    // one instance per solid voxel (~5.6k — the real city is sparse)
    let count = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
      let m = this.cols[i];
      while (m) { count += m & 1; m >>= 1; }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial();
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const mtx = new THREE.Matrix4();
    let n = 0;
    for (let gz = 0; gz < SIZE; gz++)
      for (let gx = 0; gx < SIZE; gx++) {
        const i = gz * SIZE + gx;
        const m = this.cols[i];
        if (m === 0) continue;
        for (let l = 0; l < LEVELS; l++) {
          if (!((m >> l) & 1)) continue;
          mtx.makeTranslation(gx - HALF + 0.5, l + 0.5, gz - HALF + 0.5);
          inst.setMatrixAt(n, mtx);
          inst.setColorAt(n, compColor[compOf[i]]);
          n++;
        }
      }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);

    // ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE * 4, SIZE * 4),
      new THREE.MeshLambertMaterial({ color: 0x8f8878 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, 0);
    group.add(ground);

    // gate marker posts standing on the ends of the gatehouse's low
    // step-over wall (the wall top is at y=1)
    const postGeo = new THREE.BoxGeometry(0.3, 3.4, 0.3);
    const postMat = new THREE.MeshLambertMaterial({ color: 0xffd24a });
    for (const px of [-13.5, -8.5]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, 1 + 1.7, 58.5);
      group.add(post);
    }
    return group;
  }
}
