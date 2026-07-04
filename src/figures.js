import * as THREE from 'three';

// Blocky little humanoid, ~1.5 units tall, origin at the feet.
// Returns { group, parts } where parts hold the animatable limbs & tintable materials.
export function buildHumanoid({ skin, hair, shirt, legs: legColor }) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

  const skinMat = mat(skin), hairMat = mat(hair), shirtMat = mat(shirt), legMat = mat(legColor);

  const legL = box(0.16, 0.5, 0.2, legMat);
  const legR = box(0.16, 0.5, 0.2, legMat);
  // pivot at hip: geometry shifted down
  legL.geometry.translate(0, -0.25, 0);
  legR.geometry.translate(0, -0.25, 0);
  legL.position.set(-0.12, 0.5, 0);
  legR.position.set(0.12, 0.5, 0);

  const torso = box(0.44, 0.5, 0.26, shirtMat);
  torso.position.y = 0.75;

  const armL = box(0.12, 0.46, 0.14, shirtMat);
  const armR = box(0.12, 0.46, 0.14, shirtMat);
  armL.geometry.translate(0, -0.2, 0);
  armR.geometry.translate(0, -0.2, 0);
  armL.position.set(-0.3, 0.98, 0);
  armR.position.set(0.3, 0.98, 0);

  const head = box(0.32, 0.32, 0.3, skinMat);
  head.position.y = 1.2;
  const hairCap = box(0.34, 0.12, 0.32, hairMat);
  hairCap.position.y = 1.38;

  g.add(legL, legR, torso, armL, armR, head, hairCap);
  return {
    group: g,
    parts: { legL, legR, armL, armR, head, hairCap, skinMat, hairMat, shirtMat, legMat },
  };
}

export function walkAnim(parts, phase, amount) {
  const swing = Math.sin(phase) * amount;
  parts.legL.rotation.x = swing;
  parts.legR.rotation.x = -swing;
  parts.armL.rotation.x = -swing * 0.8;
  parts.armR.rotation.x = swing * 0.8;
}

// flat dark circle that hugs the floor under an actor — cheap depth cue
export function makeBlobShadow(radius) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

export function updateBlobShadow(shadow, city, pos, radius) {
  const floor = city.maxH(pos.x, pos.z, radius * 0.5);
  shadow.position.set(pos.x, floor + 0.03, pos.z);
  const drop = pos.y - floor;
  const s = Math.max(0.3, 1 - drop * 0.15);
  shadow.scale.setScalar(s);
  shadow.material.opacity = 0.3 * s;
}
