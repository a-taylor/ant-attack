// Headless smoke tests for city generation and the shared actor physics.
// Run with: npm test  (no browser needed — City only touches Three.js math/geometry)
import * as THREE from 'three';
import { City, SIZE } from '../src/city.js';

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
};

const city = new City(12345);

// spawn & key positions are on walkable ground
check('spawn on ground', city.maxH(city.spawnPos.x, city.spawnPos.z, 0.3) === 0);
check('prison interior clear', city.maxH(city.prisonPos.x, city.prisonPos.z, 0.3) === 0);
check('gate zone detects spawn-adjacent', city.inGateZone(new THREE.Vector3(city.gateX + 0.5, 0, SIZE - 1.5)));
check('gate zone rejects spawn', !city.inGateZone(city.spawnPos));

// map has buildings and streets
let blocks = 0, streets = 0;
for (let i = 0; i < SIZE * SIZE; i++) {
  if (city.heights[i] > 0) blocks++;
  else streets++;
}
check(`buildings exist (${blocks} columns)`, blocks > 500);
check(`streets exist (${streets} cells)`, streets > 800);

// gate passage is open through the wall
check('gate passage open', city.h(city.gateX, SIZE - 1) === 0 && city.h(city.gateX, SIZE - 2) === 0);

// out-of-bounds is solid (player can't leave the world)
check('OOB solid', city.maxH(-2, 10, 0.3) === 9 && city.maxH(10, SIZE + 2, 0.3) === 9);

// prison has exactly one doorway at ground level
let gaps = 0;
const pcx = Math.floor(city.prisonPos.x), pcz = Math.floor(city.prisonPos.z);
for (let d = -3; d <= 3; d++) {
  for (const [ix, iz] of [[pcx + d, pcz - 3], [pcx + d, pcz + 3], [pcx - 3, pcz + d], [pcx + 3, pcz + d]]) {
    if (city.h(ix, iz) === 0) gaps++;
  }
}
check(`prison doorway (${gaps} gap cells)`, gaps >= 1 && gaps <= 3);

// --- BFS reachability: walking allows +1 step up, any drop down ---
function reachable(from) {
  const seen = new Set();
  const key = (x, z) => z * SIZE + x;
  const q = [[Math.floor(from.x), Math.floor(from.z)]];
  seen.add(key(q[0][0], q[0][1]));
  while (q.length) {
    const [x, z] = q.pop();
    const h = city.h(x, z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
      const nh = city.h(nx, nz);
      if (nh - h > 1) continue; // too tall to step up
      const k = key(nx, nz);
      if (!seen.has(k)) { seen.add(k); q.push([nx, nz]); }
    }
  }
  return seen;
}
const reach = reachable(city.spawnPos);
const cellKey = (p) => Math.floor(p.z) * SIZE + Math.floor(p.x);
check('prison interior reachable from spawn', reach.has(cellKey(city.prisonPos)));
check('gate reachable from spawn', reach.has(cellKey(city.gatePos)));
check(`most of city reachable (${reach.size} cells)`, reach.size > SIZE * SIZE * 0.5);

// walking never sinks below terrain or flies
const actor = { pos: city.spawnPos.clone(), vel: new THREE.Vector3(), radius: 0.3, onGround: true };
let ok = true;
let heading = Math.PI;
for (let i = 0; i < 600; i++) {
  if (i % 60 === 0) heading += 1.3;
  actor.vel.x = Math.sin(heading) * 4.6; actor.vel.z = Math.cos(heading) * 4.6;
  city.moveActor(actor, 1 / 60);
  const floor = city.maxH(actor.pos.x, actor.pos.z, actor.radius * 0.85);
  if (actor.pos.y < floor - 0.01 || actor.pos.y > 9) ok = false;
}
check(`wandering walk stays on terrain (y=${actor.pos.y.toFixed(2)})`, ok);

// blocked by the 5-high perimeter wall
const w = { pos: new THREE.Vector3(10.5, 0, 10.5), vel: new THREE.Vector3(), radius: 0.3, onGround: true };
for (let i = 0; i < 400; i++) {
  w.vel.x = -4.6; w.vel.z = 0;
  city.moveActor(w, 1 / 60);
}
check(`wall blocks exit (x=${w.pos.x.toFixed(2)}, y=${w.pos.y.toFixed(2)})`, w.pos.x > 1.9 && w.pos.y <= 1.2);

// steps up a 1-block column when grounded (and walks over + off it)
const sIx = 30;
city.set(sIx, 30, 1);
city.set(sIx - 1, 30, 0);
city.set(sIx - 2, 30, 0);
const s = { pos: new THREE.Vector3(sIx - 1.5, 0, 30.5), vel: new THREE.Vector3(), radius: 0.3, onGround: true };
let stepApex = 0;
for (let i = 0; i < 120; i++) {
  s.vel.x = 3; s.vel.z = 0;
  city.moveActor(s, 1 / 60);
  stepApex = Math.max(stepApex, s.pos.y);
}
check(`steps up 1-block while walking (apex=${stepApex.toFixed(2)})`, stepApex >= 1);

// ants pass maxStep 0.06 — even a 1-block column must stop them (ants can't climb)
const ant = { pos: new THREE.Vector3(sIx - 1.5, 0, 30.5), vel: new THREE.Vector3(), radius: 0.3, onGround: true };
for (let i = 0; i < 120; i++) {
  ant.vel.x = 3; ant.vel.z = 0;
  city.moveActor(ant, 1 / 60, { maxStep: 0.06 });
}
check(`ground-bound actor blocked by 1-block step (x=${ant.pos.x.toFixed(2)}, y=${ant.pos.y.toFixed(2)})`, ant.pos.y === 0 && ant.pos.x < sIx - 0.2);

// jump clears ~1.4 blocks: enough for 1-block ledges, never 2 (keeps walls unclimbable)
const j = { pos: new THREE.Vector3(city.spawnPos.x, 0, city.spawnPos.z), vel: new THREE.Vector3(0, 8.6, 0), radius: 0.3, onGround: false };
let apex = 0;
for (let i = 0; i < 120; i++) {
  city.moveActor(j, 1 / 60);
  apex = Math.max(apex, j.pos.y);
}
check(`jump apex ~1.4 (${apex.toFixed(2)})`, apex > 1.2 && apex < 1.7 && j.pos.y === 0);

// mesh built with sane instance count
const inst = city.group.children[0];
check(`instanced blocks (${inst.count})`, inst.count > 1000 && inst.count < 40000);

// different seeds -> different cities
const city2 = new City(999);
let diff = 0;
for (let i = 0; i < SIZE * SIZE; i++) if (city.heights[i] !== city2.heights[i]) diff++;
check(`seeded variety (${diff} differing cells)`, diff > 200);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
