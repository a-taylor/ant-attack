// Headless tests for ant paralysis (stomp + blast ring), the charged grenade
// throw tiers, and captive health/respawn. Run with: npm test
// Like smoke.mjs, everything here only touches Three.js math — the scene is a
// stub, and sfx() no-ops without WebAudio.
import * as THREE from 'three';
import { City } from '../src/city.js';
import { AntManager, STUN_TIME, ANT_TOP } from '../src/ants.js';
import { GrenadeManager, KILL_RADIUS, STUN_RADIUS, THROW_TIERS, CHARGE_STEP, tierForHold } from '../src/grenades.js';
import { Captive, CAPTIVE_HEALTH } from '../src/captive.js';

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
};

const scene = { add() {}, remove() {} };
const city = new City();
const v = (x, y, z) => new THREE.Vector3(x, y, z);

// --- blast: kill radius vs stun ring -------------------------------------
const ants = new AntManager(city, scene, 3);
const [near, mid, far] = ants.ants;
near.spawnAt(v(2, 0, 0)); // inside kill radius
mid.spawnAt(v((KILL_RADIUS + STUN_RADIUS) / 2, 0, 0)); // stun ring
far.spawnAt(v(STUN_RADIUS + 2, 0, 0)); // untouched

const { kills, stuns } = ants.damageAt(v(0, 0, 0), KILL_RADIUS, STUN_RADIUS);
check('blast kills inside kill radius', kills === 1 && near.dead);
check('blast stuns in the outer ring', stuns === 1 && mid.stunned && !mid.dead);
check('blast misses beyond stun ring', !far.dead && !far.stunned);

// stunned ants are inert: excluded from bite checks
check('stunned ant cannot bite', ants.touching(mid.pos.clone()).length === 0);
check('awake ant still bites', ants.touching(far.pos.clone()).length === 1);

// re-blasting the stun ring refreshes, not double-counts
mid.stunTimer = 1;
const again = ants.damageAt(v(0, 0, 0), 0, STUN_RADIUS);
check('re-stun refreshes timer without new stun count', again.stuns === 0 && mid.stunTimer === STUN_TIME);

// --- stomp: falling onto an ant stuns it, again crushes it ----------------
check('stomp stuns an awake ant', ants.stompAt(far.pos.clone().add(v(0, 0.5, 0))) === 'stun' && far.stunned);
check('second stomp kills the stunned ant', ants.stompAt(far.pos.clone().add(v(0, ANT_TOP, 0))) === 'kill' && far.dead);
check('stomp needs an ant underfoot', ants.stompAt(v(30, 0.5, 30)) === null);

// --- stunned ant is standable ground, and the ant wakes up ----------------
const open = city.spawnPos; // known open street cell
mid.pos.set(open.x, 0, open.z);

const walker = { pos: v(open.x, 2, open.z), vel: new THREE.Vector3(), radius: 0.3, onGround: false };
const support = (x, z) => ants.supportAt(x, z);
for (let i = 0; i < 90; i++) city.moveActor(walker, 1 / 60, { support });
check(`player rests on stunned ant (y=${walker.pos.y.toFixed(2)})`, walker.onGround && Math.abs(walker.pos.y - ANT_TOP) < 0.01);

// standing height alone keeps the player out of bite range even of awake ants
check('ant-top height is out of bite range', ANT_TOP >= 0.8);

// wake-up: timer runs out, AI resumes, and the platform disappears
const playerFar = v(open.x + 40, 0, open.z - 40);
for (let t = 0; t < STUN_TIME + 1; t += 1 / 30) mid.update(1 / 30, playerFar, true);
check('stunned ant wakes after timeout', !mid.stunned && !mid.dead);
for (let i = 0; i < 90; i++) city.moveActor(walker, 1 / 60, { support });
check(`player drops when the ant wakes (y=${walker.pos.y.toFixed(2)})`, walker.pos.y === 0);

// a stunned ant stays put until it wakes
near.spawnAt(v(open.x, 0, open.z));
near.paralyse();
const held = near.pos.clone();
for (let i = 0; i < 60; i++) near.update(1 / 60, playerFar, true);
check('stunned ant does not move', near.pos.distanceTo(held) === 0 && near.stunned);

// --- charged throw: hold time maps to discrete distance tiers -------------
check('tap throws tier 0', tierForHold(0) === 0 && tierForHold(CHARGE_STEP * 0.9) === 0);
check('hold steps through tiers', tierForHold(CHARGE_STEP * 1.5) === 1 && tierForHold(CHARGE_STEP * 2.5) === 2);
check('charge caps at the top tier', tierForHold(999) === THROW_TIERS.length - 1);
check('tiers are ascending speeds', THROW_TIERS.every((s, i) => i === 0 || s > THROW_TIERS[i - 1]));

// each tier lands further than the last (flat, obstacle-free city stub)
const flat = { solidAt: () => false, floorUnder: () => 0 };
let boomPos = null;
const gm = new GrenadeManager(scene, flat, (pos) => { boomPos = pos.clone(); });
const ranges = THROW_TIERS.map((speed) => {
  boomPos = null;
  gm.throw(v(0, 0.7, 0), v(0, 0, -1), speed);
  for (let i = 0; i < 400 && !boomPos; i++) gm.update(1 / 60);
  return -boomPos.z;
});
check(`tier ranges ascend (${ranges.map((r) => r.toFixed(1)).join(' < ')})`,
  ranges.every((r, i) => i === 0 || r > ranges[i - 1]));
check(`tier 1 keeps the old 6-9 unit intercept range (${ranges[1].toFixed(1)})`,
  ranges[1] > 5.5 && ranges[1] < 9.5);

// --- captive health, invuln frames, and respawn ----------------------------
const cap = new Captive(city, scene);
cap.reset(city.captivePos);
cap.free();
check('captive starts at full health', cap.health === CAPTIVE_HEALTH && cap.freed);
check('first bite lands', cap.hit(v(cap.pos.x + 0.5, 0, cap.pos.z)) && cap.health === CAPTIVE_HEALTH - 1);
check('invuln frames block the next bite', !cap.hit(v(cap.pos.x, 0, cap.pos.z)) && cap.health === CAPTIVE_HEALTH - 1);
cap.invuln = 0;
cap.hit(v(cap.pos.x, 0, cap.pos.z));
cap.invuln = 0;
cap.hit(v(cap.pos.x, 0, cap.pos.z));
check('third bite empties health', cap.health === 0);
cap.reset(city.captivePos); // main.js does this when health hits 0
check('respawn back at the yard, un-freed, healed',
  !cap.freed && cap.health === CAPTIVE_HEALTH && cap.pos.distanceTo(city.captivePos) === 0);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
