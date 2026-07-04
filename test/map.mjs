// Map-data integrity and walk-connectivity for the fixed, real Antescher map.
// The BFS mirrors moveActor's rules: stand on a supported level with 2 clear
// levels of headroom, step up <= 1 level, drop any height. This must keep
// spawn -> captive yard -> gate mutually reachable, or the game is unwinnable.
import { City, SIZE, HALF } from '../src/city.js';

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
};

const city = new City();

// exact voxel count of the original city (guards the extraction/encoding)
let voxels = 0;
for (let iz = -HALF; iz < HALF; iz++)
  for (let ix = -HALF; ix < HALF; ix++) {
    let m = city.mask(ix, iz);
    while (m > 0) { voxels += m & 1; m >>= 1; }
  }
check(`voxel count (${voxels})`, voxels === 5560);

// an actor can stand at level L of a column: supported from below, and both
// body levels (L, L+1) clear — matches BODY_H 1.5 in moveActor
const standable = (m, L) => {
  if (L > 0 && !((m >> (L - 1)) & 1)) return false;
  if (L < 6 && ((m >> L) & 1)) return false;
  if (L + 1 < 6 && ((m >> (L + 1)) & 1)) return false;
  return true;
};
const key = (ix, iz, L) => ((iz + HALF) * SIZE + (ix + HALF)) * 7 + L;

function bfs(startX, startZ, startL = 0) {
  const seen = new Set([key(startX, startZ, startL)]);
  const q = [[startX, startZ, startL]];
  while (q.length) {
    const [x, z, L] = q.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      const m = city.mask(nx, nz);
      if (m < 0) continue;
      for (let NL = 0; NL <= Math.min(L + 1, 6); NL++) {
        if (!standable(m, NL)) continue;
        const k = key(nx, nz, NL);
        if (!seen.has(k)) { seen.add(k); q.push([nx, nz, NL]); }
      }
    }
  }
  return seen;
}

const spawnCell = [Math.floor(city.spawnPos.x), Math.floor(city.spawnPos.z)];
const captiveCell = [Math.floor(city.captivePos.x), Math.floor(city.captivePos.z)];
const gateCell = [Math.floor(city.gatePos.x), Math.floor(city.gatePos.z)];

const fromSpawn = bfs(...spawnCell);
check('captive reachable from spawn', fromSpawn.has(key(...captiveCell, 0)));
check('gate reachable from spawn', fromSpawn.has(key(...gateCell, 0)));

// and back: the freed captive follows with the same step rules
const fromCaptive = bfs(...captiveCell);
check('gate reachable from captive yard', fromCaptive.has(key(...gateCell, 0)));

// the whole city floor is one walkable space
let ground = 0, groundReach = 0;
for (let iz = -HALF + 1; iz < HALF - 1; iz++)
  for (let ix = -HALF + 1; ix < HALF - 1; ix++) {
    if (city.mask(ix, iz) !== 0) continue;
    ground++;
    if (fromSpawn.has(key(ix, iz, 0))) groundReach++;
  }
check(`ground connected (${groundReach}/${ground})`, groundReach / ground > 0.99);

// rooftop refuge: plenty of elevated, ant-proof stands are climbable
let elevated = 0;
for (const k of fromSpawn) if (k % 7 >= 1) elevated++;
check(`elevated stands reachable (${elevated})`, elevated > 300);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
