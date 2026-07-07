import * as THREE from 'three';
import { City } from './city.js';
import { Input } from './input.js';
import { FollowCamera, DIAGONAL } from './camera.js';
import { Player } from './player.js';
import { AntManager } from './ants.js';
import { GrenadeManager, THROW_TIERS, tierForHold } from './grenades.js';
import { Captive } from './captive.js';
import { Hud } from './hud.js';
import { sfx } from './sfx.js';

const TIME_LIMIT = 360;
const START_GRENADES = 20;
const START_LIVES = 5;
const SKY = 0x0c1022;
const OBJECTIVE_RESCUE = "FOLLOW THE SCANNER TO THE CAPTIVE — GREEN MEANS YOU'RE FACING THEM";
const OBJECTIVE_ESCORT = 'ESCORT THEM BACK TO THE SOUTH GATE — STAY TOGETHER';

// --- renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 60, 170);

scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x3a3630, 1.1));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.2);
sun.position.set(30, 60, 20);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 250);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- world & actors ---
const city = new City();
scene.add(city.group);

const input = new Input(renderer.domElement);
const followCam = new FollowCamera(camera);
const hud = new Hud();
const player = new Player(city, scene);
const captive = new Captive(city, scene);
const ants = new AntManager(city, scene, 10);
// stunned ants' backs are standable ground for the player
player.support = (x, z) => ants.supportAt(x, z);
const grenades = new GrenadeManager(scene, city, (pos, killRadius, stunRadius) => {
  const { kills, stuns } = ants.damageAt(pos, killRadius, stunRadius);
  if (kills > 0) hud.message(kills > 1 ? `${kills} ANTS DOWN!` : 'ANT DOWN!', 1.5);
  else if (stuns > 0) hud.message(stuns > 1 ? `${stuns} ANTS STUNNED!` : 'ANT STUNNED!', 1.5);
  // your own blast only hurts you inside the kill radius, never the stun ring
  if (player.pos.distanceTo(pos) < killRadius * 0.75) {
    if (player.hit(pos)) loseLife();
  }
});

// --- game state ---
const TOTAL_CAPTIVES = city.captiveSpots.length; // 10, matching the original's 10 levels

const game = {
  state: 'title', // title | playing | won | lost
  timeLeft: TIME_LIMIT,
  lives: START_LIVES,
  grenadeCount: START_GRENADES,
  warned: false,
  charging: false,
  chargeTime: 0,
  rescued: 0,       // captives escorted out so far this playthrough
  spotQueue: [],    // remaining shuffled captive locations for this playthrough
  currentSpot: null, // this round's captive location (for respawn-on-recapture)
};

// pop the next not-yet-used location and place a fresh, un-freed captive
// there — a new "round", same as the original relocating the hostage
function nextCaptiveRound() {
  if (game.spotQueue.length === 0) game.spotQueue = city.shuffledCaptiveSpots();
  game.currentSpot = game.spotQueue.pop();
  captive.reset(game.currentSpot);
  hud.setCaptiveLives(captive.health);
  hud.setObjective(OBJECTIVE_RESCUE);
}

function resetRound() {
  game.timeLeft = TIME_LIMIT;
  game.lives = START_LIVES;
  game.grenadeCount = START_GRENADES;
  game.warned = false;
  game.charging = false;
  game.rescued = 0;
  game.spotQueue = city.shuffledCaptiveSpots();
  player.reset(city.spawnPos);
  ants.reset(player.pos);
  grenades.clear();
  followCam.targetYaw = DIAGONAL;
  followCam.yaw = DIAGONAL;
  followCam.snapTo(player.pos);
  hud.setTime(game.timeLeft);
  hud.setLives(game.lives);
  hud.setGrenades(game.grenadeCount);
  hud.setRescued(game.rescued, TOTAL_CAPTIVES);
  hud.setCharge(-1);
  hud.setScanner(false);
  nextCaptiveRound();
}

function startGame() {
  resetRound();
  game.state = 'playing';
  hud.hideOverlay();
}

function loseLife() {
  game.lives--;
  hud.setLives(game.lives);
  if (game.lives <= 0) endGame(false, 'THE ANTS OF ANTESCHER CLAIM ANOTHER SOUL.');
}

function endGame(won, detail) {
  game.state = won ? 'won' : 'lost';
  game.charging = false;
  hud.setCharge(-1);
  hud.showEnd(won, detail);
  sfx(won ? 'win' : 'lose');
}

resetRound(); // place everyone before the title screen shows the city
hud.showTitle(player.character);

// --- main loop ---
const clock = new THREE.Clock();

function updatePlaying(dt) {
  // camera controls
  if (input.consumePressed('KeyQ')) followCam.rotate(1);
  if (input.consumePressed('KeyE')) followCam.rotate(-1);
  if (input.dragDX) followCam.drag(input.dragDX);

  const fallSpeed = -player.vel.y; // read before update — landing zeroes it
  player.update(dt, input, followCam);
  followCam.update(dt, player.pos);

  // stomp: landing on an ant from above stuns it, or crushes an already-stunned one
  if (fallSpeed > 5) {
    const stomp = ants.stompAt(player.pos);
    if (stomp) {
      player.vel.y = 4; // bounce — slow enough that re-landing can't re-trigger
      player.onGround = false;
      hud.message(stomp === 'kill' ? 'ANT CRUSHED!' : 'ANT STOMPED!', 1.2);
    }
  }

  // grenade throw: hold G to charge a distance tier, release to lob
  if (game.grenadeCount > 0 && input.consumePressed('KeyG')) {
    game.charging = true;
    game.chargeTime = 0;
  }
  if (game.charging) {
    game.chargeTime += dt;
    const tier = tierForHold(game.chargeTime);
    hud.setCharge(tier, THROW_TIERS.length);
    if (input.consumeReleased('KeyG')) {
      game.grenadeCount--;
      hud.setGrenades(game.grenadeCount);
      // release at the scaled figure's hands, below any 1-block arch ceiling
      const origin = player.pos.clone().add(new THREE.Vector3(0, 0.7, 0));
      grenades.throw(origin, player.facing, THROW_TIERS[tier]);
      game.charging = false;
      hud.setCharge(-1);
    } else if (!input.isDown('KeyG')) {
      // focus lost mid-charge — cancel without spending the grenade
      game.charging = false;
      hud.setCharge(-1);
    }
  }

  ants.update(dt, player.pos, true);
  grenades.update(dt);
  captive.update(dt, player.pos);
  // a grenade self-hit inside grenades.update can take the last life
  if (game.state !== 'playing') return;

  // ant contact damage
  const biters = ants.touching(player.pos);
  if (biters.length > 0 && player.hit(biters[0].pos)) loseLife();
  if (game.state !== 'playing') return;

  // ants bite the captive too — being safe up on a stunned ant doesn't protect them
  const captiveBiters = ants.touching(captive.pos);
  if (captiveBiters.length > 0 && captive.hit(captiveBiters[0].pos)) {
    hud.setCaptiveLives(captive.health);
    if (captive.health <= 0) {
      // dragged back to this round's spot, un-freed: the rescue must be
      // redone. losing that progress is the penalty — no player life taken.
      captive.reset(game.currentSpot);
      hud.setCaptiveLives(captive.health);
      hud.message('THE ANTS DRAGGED THE CAPTIVE BACK!', 3);
      hud.setObjective(OBJECTIVE_RESCUE);
    } else {
      hud.message('THE CAPTIVE IS UNDER ATTACK!', 2);
    }
  }

  // scan indicator: green while facing the current objective (the captive
  // until freed, then the gate), matching the original's documented
  // behaviour ("turn green if the character is facing in the direction of
  // a survivor"). Facing is the grid-snapped movement direction, so a
  // forgiving ±60° cone reads as "roughly facing that way" rather than
  // requiring pixel-perfect aim.
  const scanTarget = captive.freed ? city.gatePos : captive.pos;
  const toTarget = scanTarget.clone().sub(player.pos).setY(0);
  const onTarget = toTarget.lengthSq() < 1
    ? true
    : toTarget.normalize().dot(player.facing) > 0.5; // cos(60deg)
  hud.setScanner(onTarget);

  // rescue
  if (!captive.freed && player.pos.distanceTo(captive.pos) < 1.7) {
    captive.free();
    sfx('rescue');
    hud.message('CAPTIVE FREED!', 3);
    hud.setObjective(OBJECTIVE_ESCORT);
  }

  // both at the gate: this round's captive is out. Either start the next
  // round (a new captive at a different, not-yet-used spot) or, once all
  // TOTAL_CAPTIVES have been brought home, win the game
  if (captive.freed && city.inGateZone(player.pos) && city.inGateZone(captive.pos)) {
    game.rescued++;
    hud.setRescued(game.rescued, TOTAL_CAPTIVES);
    if (game.rescued >= TOTAL_CAPTIVES) {
      endGame(true,
        `ALL ${TOTAL_CAPTIVES} CAPTIVES ESCAPED WITH ${hud.timerEl.textContent} REMAINING.<br>ANTESCHER SLEEPS ONCE MORE.`);
      return;
    }
    sfx('win');
    hud.message(`${game.rescued}/${TOTAL_CAPTIVES} RESCUED — ANOTHER CAPTIVE IS OUT THERE!`, 3.5);
    nextCaptiveRound();
  }

  // timer
  game.timeLeft -= dt;
  hud.setTime(game.timeLeft);
  if (game.timeLeft < 60 && !game.warned) {
    game.warned = true;
    hud.message('HURRY — TIME IS RUNNING OUT!', 3);
  }
  if (game.timeLeft <= 0) endGame(false, 'TIME RAN OUT. THE CITY KEEPS ITS PRISONERS.');
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (game.state === 'title') {
    if (input.consumePressed('Digit1')) {
      player.setCharacter('sandy');
      hud.showTitle('sandy');
    }
    if (input.consumePressed('Digit2')) {
      player.setCharacter('sandra');
      hud.showTitle('sandra');
    }
    if (input.consumePressed('Enter')) startGame();
    // slow orbit of the city while on the title screen
    followCam.targetYaw += dt * 0.1;
    followCam.update(dt, new THREE.Vector3(city.spawnPos.x, 4, city.spawnPos.z - 14));
  } else if (game.state === 'playing') {
    updatePlaying(dt);
  } else {
    if (input.consumePressed('KeyR')) startGame();
    ants.update(dt, player.pos, false);
    grenades.update(dt);
    followCam.update(dt, player.pos);
  }

  hud.update(dt);
  input.endFrame();
  renderer.render(scene, camera);
}
tick();

// debug/testing handle
window.__game = { game, player, captive, ants, city, startGame, endGame, TOTAL_CAPTIVES };
