import * as THREE from "three";
import { camera, controls, playerBody } from "./scene.js";
import { state, send } from "./state.js";
import { INTERACT_DIST, NPC_DIST, STAND_EYE, SIT_EYE } from "./config.js";
import { chairs, floorAt } from "./office.js";
import { log } from "./ui.js";
import { showProjectOverlay, myStepOfProject } from "./project.js";
import { openNpc } from "./npc-chat.js";
import { openComputer } from "./computer.js";

const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

export function findChairUnderCrosshair(maxDist = 3.5) {
  if (!chairs.length || !controls.isLocked) return null;
  raycaster.setFromCamera(screenCenter, camera);
  raycaster.far = maxDist;
  const meshes = chairs.map((c) => c.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  if (!hits.length) return null;
  let obj = hits[0].object;
  while (obj && !meshes.includes(obj)) obj = obj.parent;
  return chairs.find((c) => c.mesh === obj) || null;
}

export function findComputerUnderCrosshair(maxDist = 3.5, maxAngleDeg = 60) {
  let best = null, bestDist = maxDist;
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const flat = dir.clone(); flat.y = 0; flat.normalize();
  for (const obj of state.interactables) {
    if (obj.userData.interactableId !== "login_computer") continue;
    const wp = new THREE.Vector3(); obj.getWorldPosition(wp);
    const to = wp.clone().sub(playerBody.position); to.y = 0;
    const dist = to.length();
    if (dist > bestDist) continue;
    to.normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, flat.dot(to)))) * 180 / Math.PI;
    if (ang < maxAngleDeg) { best = obj; bestDist = dist; }
  }
  return best;
}

export function findNearestGameInteractable() {
  let best = null, bestD = INTERACT_DIST;
  for (const obj of state.interactables) {
    const id = obj.userData.interactableId;
    if (!id || id === "login_computer") continue;
    const wp = new THREE.Vector3(); obj.getWorldPosition(wp);
    const d = playerBody.position.distanceTo(wp);
    if (d < bestD) { best = obj; bestD = d; }
  }
  return best;
}

export function interactLabel(id) {
  if (id === "pm_desk") return "E — взять задачу у PM";
  if (id === "work_terminal") return myStepOfProject() ? "E — сдать шаг конвейера" : "E — открыть мини-игру задачи";
  if (id === "project_board") return "E — открыть доску проекта";
  if (id.startsWith("dept_sign_")) return "E — перейти в отдел";
  return "E — взаимодействие";
}

export function tryInteract() {
  if (!state.socket || state.socket.readyState !== 1) return;
  const best = findNearestGameInteractable();
  if (!best) { log("Подойдите ближе к стенду / столу PM / доске / консоли."); return; }
  const id = best.userData.interactableId;
  log(`E нажато → ближайший объект: ${id}`);
  if (id === "project_board") { showProjectOverlay(); return; }
  if (id === "work_terminal") { send("start_activity"); return; }
  if (id.startsWith("dept_sign_")) {
    const deptId = Number(id.replace("dept_sign_", ""));
    if (state.playerDepartment && state.playerDepartment.id === deptId) { log("Ты уже в этом отделе."); return; }
    send("select_department", { departmentId: deptId });
    return;
  }
  send("interact", { objectId: id });
}

export function tryTalkNPC() {
  if (!state.socket || state.socket.readyState !== 1) return;
  let best = null, bestD = NPC_DIST;
  for (const m of state.npcMeshes) {
    const d = playerBody.position.distanceTo(m.position);
    if (d < bestD) { best = m; bestD = d; }
  }
  if (!best) { log("Подойдите ближе к NPC."); return; }
  openNpc(best.userData.npc);
}

export function toggleSit() {
  if (state.player.seated) {
    state.player.seated = false; state.player.seatChair = null; state.player.eyeHeight = STAND_EYE;
    state.player.y = floorAt(state.player.x, state.player.z, state.player.y); state.player.vy = 0; state.player.onGround = true;
    return;
  }
  const chair = findChairUnderCrosshair();
  if (!chair) return;
  state.player.seated = true; state.player.seatChair = chair;
  state.player.x = chair.x; state.player.z = chair.z; state.player.y = chair.floorY;
  state.player.vy = 0; state.player.onGround = true; state.player.eyeHeight = SIT_EYE;
  camera.position.set(state.player.x, chair.seatY, state.player.z);
}