import * as THREE from 'three';

const QUARTER = Math.PI / 2;
// the four stops sit on the grid diagonals (45°, 135°, …), like the original
// game's four views: every cube shows two faces meeting at a corner edge
export const DIAGONAL = Math.PI / 4;

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = DIAGONAL;       // camera south-east of the player, looking north-west
    this.targetYaw = DIAGONAL;
    this.pitch = 0.95;         // steep elevation — clears the wall, near-isometric
    this.dist = 15;
    this.focus = new THREE.Vector3();
  }

  rotate(dir) {
    // snap to the next diagonal stop from wherever we currently are
    this.targetYaw = (Math.round(this.targetYaw / QUARTER - 0.5) + 0.5 + dir) * QUARTER;
  }

  drag(dx) {
    this.targetYaw -= dx * 0.005;
  }

  // movement basis, not the raw view direction: the view yaw snapped to its
  // diagonal stop minus DIAGONAL, i.e. locked to the city grid axes. Keys move
  // along city axes (screen diagonals) and key combos along city diagonals
  // (screen up/down/left/right), like the original. From the default view,
  // "up" is north — the up-right screen diagonal.
  get moveYaw() {
    return Math.round(this.yaw / QUARTER - 0.5) * QUARTER;
  }
  get forward() {
    const y = this.moveYaw;
    return new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y));
  }
  get right() {
    const y = this.moveYaw;
    return new THREE.Vector3(Math.cos(y), 0, -Math.sin(y));
  }

  update(dt, focusPos) {
    this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dt * 7);
    this.focus.lerp(focusPos, Math.min(1, dt * 9));

    const horiz = Math.cos(this.pitch) * this.dist;
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * horiz,
      this.focus.y + Math.sin(this.pitch) * this.dist,
      this.focus.z + Math.cos(this.yaw) * horiz
    );
    this.camera.lookAt(this.focus.x, this.focus.y + 1, this.focus.z);
  }

  snapTo(focusPos) {
    this.focus.copy(focusPos);
    this.update(0, focusPos);
  }
}
