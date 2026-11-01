import * as THREE from "three";
import { camera, controls, playerBody, localPlayer } from "./scene.js";
import { state, send } from "./state.js";
import { GRAVITY, JUMP_V, MOVE_SPEED, STAND_EYE, SIT_EYE, PLAYER_RADIUS, PLAYER_HEIGHT, NPC_DIST } from "./config.js";
import { collides, floorAt } from "./office.js";
import { hint, anyOverlayOpen } from "./ui.js";
import { syncLocalName } from "./sprites.js";
import { findChairUnderCrosshair, findComputerUnderCrosshair, findNearestGameInteractable, interactLabel } from "./interaction.js";
import { closeComputer } from "./computer.js";

export function updateMovement(delta) {
  if (anyOverlayOpen()) return;

  if (state.pcOpen && state.currentPcMonitor) {
    const wp = new THREE.Vector3(); state.currentPcMonitor.getWorldPosition(wp);
    if (playerBody.position.distanceTo(wp) > 4.0) { closeComputer(); return; }
  }

    if (state.showHints === false) {
    hint.style.display = "none";
  } else if (controls.isLocked) {
    if (state.player.seated) {
      const comp = findComputerUnderCrosshair();
      hint.textContent = comp ? "E — использовать компьютер" : "E — встать";
      hint.style.display = "block";
    } else {
      const chair = findChairUnderCrosshair();
      const comp = findComputerUnderCrosshair();
      const gi = findNearestGameInteractable();
      const nearNpc = state.npcMeshes.some((m) => playerBody.position.distanceTo(m.position) < NPC_DIST);
      if (chair) { hint.textContent = "E — сесть"; hint.style.display = "block"; }
      else if (comp) { hint.textContent = "E — использовать компьютер"; hint.style.display = "block"; }
      else if (gi) { hint.textContent = interactLabel(gi.userData.interactableId); hint.style.display = "block"; }
      else if (nearNpc) { hint.textContent = "N — спросить NPC"; hint.style.display = "block"; }
      else hint.style.display = "none";
    }
  } else hint.style.display = "none";

  if (state.player.seated && state.player.seatChair) {
    const c = state.player.seatChair;
    camera.position.set(c.x, c.seatY, c.z);
    state.player.x = c.x; state.player.z = c.z; state.player.y = c.floorY;
    if (state.keys.KeyW || state.keys.KeyA || state.keys.KeyS || state.keys.KeyD) {
      state.player.seated = false; state.player.seatChair = null; state.player.eyeHeight = STAND_EYE;
      state.player.y = floorAt(state.player.x, state.player.z, state.player.y);
    }
    playerBody.position.set(state.player.x, 0, state.player.z);
    localPlayer.position.set(state.player.x, state.player.y + 0.9, state.player.z);
    syncLocalName();
    return;
  }

  if (state.keys.Space && state.player.onGround) { state.player.vy = JUMP_V; state.player.onGround = false; }

  const forward = (state.keys.KeyW ? 1 : 0) - (state.keys.KeyS ? 1 : 0);
  const strafe = (state.keys.KeyD ? 1 : 0) - (state.keys.KeyA ? 1 : 0);
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const move = new THREE.Vector3().addScaledVector(dir, forward).addScaledVector(right, strafe);
  if (move.lengthSq() > 0) move.normalize().multiplyScalar(MOVE_SPEED * (state.speedMul || 1) * delta);

  const nx = state.player.x + move.x, nz = state.player.z + move.z;
  if (!collides(nx, state.player.z, state.player.y, PLAYER_RADIUS, PLAYER_HEIGHT)) state.player.x = nx;
  if (!collides(state.player.x, nz, state.player.y, PLAYER_RADIUS, PLAYER_HEIGHT)) state.player.z = nz;

  state.player.vy -= GRAVITY * delta;
  state.player.y += state.player.vy * delta;
  const g = floorAt(state.player.x, state.player.z, state.player.y);
  if (g > state.player.y && g - state.player.y < 0.6 && state.player.vy <= 0.01) { state.player.y = g; state.player.vy = 0; state.player.onGround = true; }
  else if (state.player.y <= g) { state.player.y = g; state.player.vy = 0; state.player.onGround = true; }
  else state.player.onGround = false;

  camera.position.set(state.player.x, state.player.y + state.player.eyeHeight, state.player.z);
  playerBody.position.set(state.player.x, 0, state.player.z);
  localPlayer.position.set(state.player.x, state.player.y + 0.9, state.player.z);
  localPlayer.rotation.y = camera.rotation.y;
  syncLocalName();

  window.__cam = camera.position;
  const d = new THREE.Vector3(); camera.getWorldDirection(d);
  window.__camDir = d;
  window.__myId = state.selfId;
}

export function startPositionSync() {
  setInterval(() => {
    if (anyOverlayOpen()) return;
    send("move", {
      position: { x: state.player.x, y: state.player.y, z: state.player.z },
      rotationY: camera.rotation.y,
    });
  }, 100);
}