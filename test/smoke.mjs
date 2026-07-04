// Headless smoke tests for the real-Antescher map loader and the shared
// actor physics. Run with: npm test  (no browser needed — City only touches
// Three.js math/geometry)
import * as THREE from 'three';
import { City, SIZE, HALF } from '../src/city.js';

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
};

const city = new City();

// key positions sit on fully open ground
check('spawn on open ground', city.mask(Math.floor(city.spawnPos.x), Math.floor(city.spawnPos.z)) === 0);
check('captive cell open', city.mask(Math.floor(city.captivePos.x), Math.floor(city.captivePos.z)) === 0);
check('gate zone accepts gatePos', city.inGateZone(city.gatePos));
check('gate zone rejects spawn', !city.inGateZone(city.spawnPos));

// map has buildings and streets
let blocks = 0, streets = 0;
for (let iz = -HALF; iz < HALF; iz++)
  for (let ix = -HALF; ix < HALF; ix++) {
    if (city.mask(ix, iz) > 0) blocks++;
    else streets++;
  }
check(`buildings exist (${blocks} columns)`, blocks > 2000);
check(`streets exist (${streets} cells)`, streets > 10000);

// landmark spot-checks against the independently verified extraction:
// gatehouse low step-over wall, the captive yard's ant-sized ground arch,
// and the northern canopy roof slab
check('gatehouse low wall', [8, 9, 10, 11, 12, 13].every((x) => city.mask(x, 58) === 0b000001));
check('yard ground arch (ants only)', city.mask(-48, -44) === 0b011110);
check('northern canopy roof', city.mask(-36, -56) === 0b010000);

// out-of-bounds is solid (nothing can leave the world)
check('OOB solid', city.maxH(-HALF - 2, 10, 0.3) === 9 && city.maxH(10, HALF + 2, 0.3) === 9);

// walking never sinks below the surface underfoot or flies
const actor = { pos: city.spawnPos.clone(), vel: new THREE.Vector3(), radius: 0.3, onGround: true };
let ok = true;
let heading = Math.PI;
for (let i = 0; i < 600; i++) {
  if (i % 60 === 0) heading += 1.3;
  actor.vel.x = Math.sin(heading) * 4.6; actor.vel.z = Math.cos(heading) * 4.6;
  city.moveActor(actor, 1 / 60);
  const floor = city.floorUnder(actor.pos.x, actor.pos.z, actor.radius * 0.85, actor.pos.y, 0.06);
  if (actor.pos.y < floor - 0.01 || actor.pos.y > 6) ok = false;
}
check(`wandering walk stays on terrain (y=${actor.pos.y.toFixed(2)})`, ok);

// blocked by the perimeter wall (west wall from inside)
const w = { pos: new THREE.Vector3(-55.5, 0, -55.5), vel: new THREE.Vector3(), radius: 0.3, onGround: true };
for (let i = 0; i < 500; i++) {
  w.vel.x = -4.6; w.vel.z = 0;
  city.moveActor(w, 1 / 60);
}
check(`wall keeps player inside (x=${w.pos.x.toFixed(2)}, y=${w.pos.y.toFixed(2)})`, w.pos.x > -63.9 && w.pos.y <= 1.2);

// steps over the gatehouse's 1-high wall while walking (and down the far side)
const s = { pos: new THREE.Vector3(11.5, 0, 56.5), vel: new THREE.Vector3(), radius: 0.3, onGround: true };
let stepApex = 0;
for (let i = 0; i < 240; i++) {
  s.vel.x = 0; s.vel.z = 3;
  city.moveActor(s, 1 / 60);
  stepApex = Math.max(stepApex, s.pos.y);
}
check(`steps over gate wall (apex=${stepApex.toFixed(2)}, z=${s.pos.z.toFixed(2)})`, stepApex >= 1 && s.pos.z > 59.5 && s.pos.y === 0);

// ants pass maxStep 0.06 — the same 1-high wall must stop them (ants can't climb)
const ant = { pos: new THREE.Vector3(11.5, 0, 56.5), vel: new THREE.Vector3(), radius: 0.35, onGround: true };
for (let i = 0; i < 240; i++) {
  ant.vel.x = 0; ant.vel.z = 3;
  city.moveActor(ant, 1 / 60, { maxStep: 0.06, height: 0.9 });
}
check(`ant blocked by 1-block step (z=${ant.pos.z.toFixed(2)})`, ant.pos.y === 0 && ant.pos.z < 57.8);

// ...but an ant's low body crawls through the yard's 1-block ground arch
const crawler = { pos: new THREE.Vector3(-47.5, 0, -42.5), vel: new THREE.Vector3(), radius: 0.35, onGround: true };
for (let i = 0; i < 240; i++) {
  crawler.vel.x = 0; crawler.vel.z = -3;
  city.moveActor(crawler, 1 / 60, { maxStep: 0.06, height: 0.9 });
}
check(`ant crawls through ground arch (z=${crawler.pos.z.toFixed(2)})`, crawler.pos.z < -44.5 && crawler.pos.y === 0);

// the player is too tall for that arch
const tall = { pos: new THREE.Vector3(-47.5, 0, -42.5), vel: new THREE.Vector3(), radius: 0.3, onGround: true };
for (let i = 0; i < 240; i++) {
  tall.vel.x = 0; tall.vel.z = -3;
  city.moveActor(tall, 1 / 60);
}
check(`player blocked by ant-sized arch (z=${tall.pos.z.toFixed(2)})`, tall.pos.z > -43.5);

// walks freely under the northern canopy (roof slab at level 4, open below)
const c = { pos: new THREE.Vector3(-39.5, 0, -55.5), vel: new THREE.Vector3(), radius: 0.3, onGround: true };
let underOk = true;
for (let i = 0; i < 300; i++) {
  c.vel.x = 3; c.vel.z = 0;
  city.moveActor(c, 1 / 60);
  if (c.pos.y !== 0) underOk = false;
}
check(`walks under canopy (x=${c.pos.x.toFixed(2)})`, underOk && c.pos.x > -29);

// jumping under a 2-level arch bumps the head on its underside
const b = { pos: new THREE.Vector3(-28.5, 0, -45.5), vel: new THREE.Vector3(0, 8.6, 0), radius: 0.3, onGround: false };
let bumpApex = 0;
for (let i = 0; i < 120; i++) {
  city.moveActor(b, 1 / 60);
  bumpApex = Math.max(bumpApex, b.pos.y);
}
check(`head bumps arch underside (apex=${bumpApex.toFixed(2)})`, bumpApex < 0.7 && b.pos.y === 0);

// jump clears ~1.4 blocks in the open: enough for 1-block ledges, never 2
const j = { pos: city.spawnPos.clone(), vel: new THREE.Vector3(0, 8.6, 0), radius: 0.3, onGround: false };
let apex = 0;
for (let i = 0; i < 120; i++) {
  city.moveActor(j, 1 / 60);
  apex = Math.max(apex, j.pos.y);
}
check(`jump apex ~1.4 (${apex.toFixed(2)})`, apex > 1.2 && apex < 1.7 && j.pos.y === 0);

// every solid voxel of the original city is instanced
const inst = city.group.children[0];
check(`instanced voxels (${inst.count})`, inst.count === 5560);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
