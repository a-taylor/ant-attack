import * as THREE from 'three';
import { City } from './city.js';
import { Input } from './input.js';
import { FollowCamera, DIAGONAL } from './camera.js';
import { Player } from './player.js';
import { AntManager } from './ants.js';
import { GrenadeManager } from './grenades.js';
import { Captive } from './captive.js';
import { Hud } from './hud.js';
import { sfx } from './sfx.js';

const TIME_LIMIT = 360;
const START_GRENADES = 20;
const START_LIVES = 5;
const SKY = 0x0c1022;

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
const grenades = new GrenadeManager(scene, city, (pos, radius) => {
  const kills = ants.damageAt(pos, radius);
  if (kills > 0) hud.message(kills > 1 ? `${kills} ANTS DOWN!` : 'ANT DOWN!', 1.5);
  if (player.pos.distanceTo(pos) < radius * 0.75) {
    if (player.hit(pos)) loseLife();
  }
});

// --- game state ---
const game = {
  state: 'title', // title | playing | won | lost
  timeLeft: TIME_LIMIT,
  lives: START_LIVES,
  grenadeCount: START_GRENADES,
  warned: false,
};

function resetRound() {
  game.timeLeft = TIME_LIMIT;
  game.lives = START_LIVES;
  game.grenadeCount = START_GRENADES;
  game.warned = false;
  player.reset(city.spawnPos);
  captive.reset(city.captivePos);
  ants.reset(player.pos);
  grenades.clear();
  followCam.targetYaw = DIAGONAL;
  followCam.yaw = DIAGONAL;
  followCam.snapTo(player.pos);
  hud.setTime(game.timeLeft);
  hud.setLives(game.lives);
  hud.setGrenades(game.grenadeCount);
  hud.setObjective('RESCUE THE CAPTIVE — THEY ARE HELD IN A WALLED YARD IN THE NORTH-EAST');
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

  player.update(dt, input, followCam);
  followCam.update(dt, player.pos);

  // grenade throw
  if (input.consumePressed('KeyG') && game.grenadeCount > 0) {
    game.grenadeCount--;
    hud.setGrenades(game.grenadeCount);
    // release at the scaled figure's hands, below any 1-block arch ceiling
    const origin = player.pos.clone().add(new THREE.Vector3(0, 0.7, 0));
    grenades.throw(origin, player.facing);
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

  // rescue
  if (!captive.freed && player.pos.distanceTo(captive.pos) < 1.7) {
    captive.free();
    sfx('rescue');
    hud.message('CAPTIVE FREED!', 3);
    hud.setObjective('ESCORT THEM BACK TO THE SOUTH GATE — STAY TOGETHER');
  }

  // win: both at the gate
  if (captive.freed && city.inGateZone(player.pos) && city.inGateZone(captive.pos)) {
    endGame(true,
      `YOU AND THE CAPTIVE ESCAPED WITH ${hud.timerEl.textContent} REMAINING.<br>ANTESCHER SLEEPS ONCE MORE.`);
    return;
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
window.__game = { game, player, captive, ants, city, startGame, endGame };
