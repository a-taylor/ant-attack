import * as THREE from 'three';

const QUARTER = Math.PI / 2;

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;              // camera south of the player, looking north into the city
    this.targetYaw = 0;
    this.pitch = 0.95;         // steep elevation — clears the wall, near-isometric
    this.dist = 15;
    this.focus = new THREE.Vector3();
  }

  rotate(dir) {
    // snap to the next 90° stop from wherever we currently are
    this.targetYaw = (Math.round(this.targetYaw / QUARTER) + dir) * QUARTER;
  }

  drag(dx) {
    this.targetYaw -= dx * 0.005;
  }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  get right() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
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
