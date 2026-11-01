// interaction.js
import * as THREE from "three";
import { camera, controls, playerBody, localPlayer, applyPlayerTransforms, scene } from "./scene.js";
import { state, send } from "./state.js";
import { INTERACT_DIST, NPC_DIST, STAND_EYE, SIT_EYE } from "./config.js";
import { chairs, floorAt, doors, draggableObjects, reactiveNPCs, ambientNPCs, interactiveObjects, spawnAgentObject } from "./office.js";
import { log } from "./ui.js";
import { showProjectOverlay, myStepOfProject } from "./project.js";
import { openNpc } from "./npc-chat.js";

const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

let draggedObject = null;
let dragDistance = 2.5;
let holdingCoffee = false;
let coffeeMesh = null;
let holdingWater = false;

export function isDragging() { return draggedObject !== null; }
export function isHoldingCoffee() { return holdingCoffee; }
export function isHoldingWater() { return holdingWater; }

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

export function findDoorUnderCrosshair(maxDist = 3.0) {
  if (!doors.length || !controls.isLocked) return null;
  raycaster.setFromCamera(screenCenter, camera);
  raycaster.far = maxDist;
  const meshes = doors.map((d) => d.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  if (!hits.length) return null;
  let obj = hits[0].object;
  while (obj && !meshes.includes(obj)) obj = obj.parent;
  return doors.find((d) => d.mesh === obj) || null;
}

export function findDraggableUnderCrosshair(maxDist = 3.5) {
  if (!draggableObjects.length || !controls.isLocked) return null;
  raycaster.setFromCamera(screenCenter, camera);
  raycaster.far = maxDist;
  const hits = raycaster.intersectObjects(draggableObjects, true);
  if (!hits.length) return null;
  let obj = hits[0].object;
  while (obj && !draggableObjects.includes(obj)) obj = obj.parent;
  return obj || null;
}

export function findReactiveNPCUnderCrosshair(maxDist = 3.0) {
  if (!reactiveNPCs.length || !controls.isLocked) return null;
  raycaster.setFromCamera(screenCenter, camera);
  raycaster.far = maxDist;
  const meshes = reactiveNPCs.map((n) => n.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  if (!hits.length) return null;
  let obj = hits[0].object;
  while (obj && !meshes.includes(obj)) obj = obj.parent;
  return reactiveNPCs.find((n) => n.mesh === obj) || null;
}

export function findAmbientNPCUnderCrosshair(maxDist = 3.5) {
  if (!ambientNPCs.length || !controls.isLocked) return null;
  raycaster.setFromCamera(screenCenter, camera);
  raycaster.far = maxDist;
  const meshes = ambientNPCs.map((n) => n.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  if (!hits.length) return null;
  let obj = hits[0].object;
  while (obj && !meshes.includes(obj)) obj = obj.parent;
  return ambientNPCs.find((n) => n.mesh === obj) || null;
}

export function findInteractiveUnderCrosshair(maxDist = 3.5) {
  if (!interactiveObjects.length || !controls.isLocked) return null;
  raycaster.setFromCamera(screenCenter, camera);
  raycaster.far = maxDist;
  const meshes = interactiveObjects.map((o) => o.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  if (!hits.length) return null;
  let obj = hits[0].object;
  while (obj && !meshes.includes(obj)) obj = obj.parent;
  return interactiveObjects.find((o) => o.mesh === obj) || null;
}

export function findCoffeeBarUnderCrosshair(maxDist = 3.5) {
  if (!controls.isLocked) return null;
  raycaster.setFromCamera(screenCenter, camera);
  raycaster.far = maxDist;
  for (const obj of state.interactables) {
    if (obj.userData.interactableId !== "coffee_bar") continue;
    const hits = raycaster.intersectObject(obj, true);
    if (hits.length > 0) return obj;
  }
  return null;
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
    if (!id || id === "login_computer" || id === "door" || id === "draggable" || id === "coffee_bar") continue;
    const wp = new THREE.Vector3(); obj.getWorldPosition(wp);
    const d = playerBody.position.distanceTo(wp);
    if (d < bestD) { best = obj; bestD = d; }
  }
  return best;
}

export function interactLabel(id) {
  if (id === "door") return "E — открыть/закрыть дверь";
  if (id === "draggable") return "E — взять / E — бросить";
  if (id === "coffee_bar") return holdingCoffee ? "E — выпить кофе" : "E — заказать кофе";
  if (id === "printer") return "E — распечатать документ";
  if (id === "water_cooler") return holdingWater ? "E — выпить воду" : "E — налить воду";
  if (id === "vending_machine") return "E — купить снек (5 очков)";
  if (id === "pm_desk") return "E — взять задачу у PM";
  if (id === "work_terminal") return myStepOfProject() ? "E — сдать шаг конвейера" : "E — открыть мини-игру задачи";
  if (id === "project_board") return "E — открыть доску проекта";
  if (id === "reward") return "E — забрать награду";
  if (id.startsWith("dept_sign_")) return "E — перейти в отдел";
  return "E — взаимодействие";
}

export function toggleDoor(door) {
  if (!door) return;
  door.isOpen = !door.isOpen;
  door.targetRot = door.isOpen ? (Math.PI / 2) * door.openDir : 0;
  log(door.isOpen ? "🚪 Дверь открыта" : "🚪 Дверь закрыта");
}

export function startDrag(obj) {
  if (!obj) return;
  draggedObject = obj;
  obj.userData.physics.isDragged = true;
  obj.userData.physics.velocity.set(0, 0, 0);
  obj.userData.physics.isFalling = false;
  log("📦 Вы взяли объект. E — бросить.");
}

export function stopDrag() {
  if (!draggedObject) return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  draggedObject.userData.physics.velocity.copy(dir.multiplyScalar(8));
  draggedObject.userData.physics.velocity.y += 3;
  draggedObject.userData.physics.isFalling = true;
  draggedObject.userData.physics.isDragged = false;
  draggedObject = null;
  log("📦 Вы бросили объект.");
}

export function updateDraggedObject(delta) {
  if (draggedObject) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const targetPos = camera.position.clone().add(dir.multiplyScalar(dragDistance));
    draggedObject.position.lerp(targetPos, 0.3);
    if (draggedObject.position.y < 0.3) draggedObject.position.y = 0.3;
  }
}

export function pickupCoffee() {
  if (holdingCoffee) return;
  holdingCoffee = true;
  const cupGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.15, 8);
  const cupMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  coffeeMesh = new THREE.Mesh(cupGeo, cupMat);
  coffeeMesh.position.set(0.3, -0.3, -0.5);
  camera.add(coffeeMesh);
  log("☕ Вы взяли кофе. E — выпить.");
}

export function drinkCoffee() {
  if (!holdingCoffee) return;
  holdingCoffee = false;
  if (coffeeMesh) {
    camera.remove(coffeeMesh);
    coffeeMesh.geometry.dispose();
    coffeeMesh.material.dispose();
    coffeeMesh = null;
  }
  state.player.caffeinated = true;
  log("☕ Вы выпили кофе! Прилив сил (+скорость на 15 сек).");
  if (scene) spawnAgentObject(scene, state.player.x, state.player.z, 'coffee_steam');
  setTimeout(() => {
    state.player.caffeinated = false;
    log("☕ Действие кофе закончилось.");
  }, 15000);
}

export function pickupWater() {
  if (holdingWater) return;
  holdingWater = true;
  log("💧 Вы набрали воду. E — выпить.");
}

export function drinkWater() {
  if (!holdingWater) return;
  holdingWater = false;
  state.player.hydrated = true;
  log("💧 Вы выпили воду! +5 очков за заботу о здоровье.");
  state.points = (state.points || 0) + 5;
  setTimeout(() => {
    state.player.hydrated = false;
  }, 10000);
}

export function usePrinter(printerObj) {
  if (printerObj.isPrinting) {
    log("🖨 Принтер уже печатает...");
    return;
  }
  printerObj.isPrinting = true;
  printerObj.printTimer = 3;
  log("🖨 Печатаем документ...");
  
  setTimeout(() => {
    // Спавним документ рядом с принтером
    if (scene) {
      const doc = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.01, 0.35),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
      );
      const pos = new THREE.Vector3();
      printerObj.group.getWorldPosition(pos);
      doc.position.set(pos.x + 0.3, 0.85, pos.z + 0.4);
      doc.userData.interactableId = "document";
      doc.userData.isDraggable = true;
      doc.userData.physics = {
        velocity: new THREE.Vector3(0, 0, 0),
        mass: 0.2,
        restitution: 0.1,
        friction: 0.9,
        isFalling: false,
        isDragged: false,
        radius: 0.15
      };
      scene.add(doc);
      draggableObjects.push(doc);
      log("📄 Документ напечатан! Можете взять его.");
    }
  }, 3000);
}

export function useVendingMachine(vendingObj) {
  if ((state.points || 0) < 5) {
    log("❌ Недостаточно очков (нужно 5).");
    return;
  }
  state.points -= 5;
  log("🍫 Вы купили снек! +5 к энергии.");
  
  // Спавним снек в лотке выдачи
  if (scene) {
    const snack = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.2, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.6 })
    );
    const pos = new THREE.Vector3();
    vendingObj.group.getWorldPosition(pos);
    snack.position.set(pos.x, 0.2, pos.z + 0.4);
    snack.userData.interactableId = "snack";
    snack.userData.isDraggable = true;
    snack.userData.physics = {
      velocity: new THREE.Vector3(0, 0, 0),
      mass: 0.1,
      restitution: 0.2,
      friction: 0.9,
      isFalling: false,
      isDragged: false,
      radius: 0.1
    };
    scene.add(snack);
    draggableObjects.push(snack);
  }
}

export function interactWithAnimal(npc) {
  if (!npc) return;
  npc.state = 'watching';
  npc.stateTimer = 4;
  npc.happiness = Math.min(100, npc.happiness + 20);
  
  if (npc.type === 'cat') {
    log(`🐱 ${npc.name} мурлычет и трется о вашу ногу.`);
  } else if (npc.type === 'dog') {
    log(`🐶 ${npc.name} радостно виляет хвостом!`);
    npc.state = 'walking';
    npc.targetPosition.copy(new THREE.Vector3(state.player.x, 0, state.player.z));
    npc.stateTimer = 3;
  } else if (npc.type === 'parrot') {
    const phrases = ['Привет!', 'Красавчик!', 'Работай!', 'Кофе?', 'Мяу?'];
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    log(`🦜 ${npc.name}: "${phrase}"`);
  }
  
  if (npc.happiness > 80 && scene && Math.random() < 0.3) {
    spawnAgentObject(scene, npc.position.x, npc.position.z, 'reward');
    log(`✨ ${npc.name} так рад, что оставил вам подарок!`);
    npc.happiness = 50;
  }
}

export function talkToAmbientNPC(npc) {
  if (!npc) return;
  log(`💬 ${npc.name}: "${npc.dialogue}"`);
  npc.state = 'talking';
  npc.stateTimer = 3;
}

export function tryInteract() {
  if (!state.socket || state.socket.readyState !== 1) return;
  
  if (holdingCoffee) { drinkCoffee(); return; }
  if (holdingWater) { drinkWater(); return; }
  if (draggedObject) { stopDrag(); return; }
  
  const door = findDoorUnderCrosshair();
  if (door) { toggleDoor(door); return; }
  
  const animal = findReactiveNPCUnderCrosshair();
  if (animal) { interactWithAnimal(animal); return; }
  
  const ambientNpc = findAmbientNPCUnderCrosshair();
  if (ambientNpc) { talkToAmbientNPC(ambientNpc); return; }
  
  const interactive = findInteractiveUnderCrosshair();
  if (interactive) {
    if (interactive.type === 'printer') {
      usePrinter(interactive);
      return;
    } else if (interactive.type === 'water_cooler') {
      pickupWater();
      return;
    } else if (interactive.type === 'vending_machine') {
      useVendingMachine(interactive);
      return;
    }
  }
  
  const draggable = findDraggableUnderCrosshair();
  if (draggable) { startDrag(draggable); return; }
  
  const coffeeBar = findCoffeeBarUnderCrosshair();
  if (coffeeBar) { orderCoffee(coffeeBar); return; }
  
  const best = findNearestGameInteractable();
  
  if (best && best.userData.interactableId === "reward") {
    log("🏆 Вы получили награду! +10 очков");
    state.points = (state.points || 0) + 10;
    scene.remove(best);
    const idx = spawnedObjects.indexOf(best);
    if (idx > -1) spawnedObjects.splice(idx, 1);
    return;
  }
  
  if (best && best.userData.interactableId === "document") {
    log("📄 Вы подобрали документ. Отнесите его PM для сдачи задачи!");
    state.activeDocument = best;
    return;
  }
  
  if (best && best.userData.interactableId === "snack") {
    log("🍫 Вы съели снек! +2 к энергии.");
    scene.remove(best);
    const idx = draggableObjects.indexOf(best);
    if (idx > -1) draggableObjects.splice(idx, 1);
    return;
  }
  
  if (!best) { log("Подойдите ближе к объекту."); return; }
  
  const id = best.userData.interactableId;
  if (id === "project_board") { showProjectOverlay(); return; }
  if (id === "work_terminal") { send("start_activity"); return; }
  if (id.startsWith("dept_sign_")) {
    const deptId = Number(id.replace("dept_sign_", ""));
    if (state.playerDepartment && state.playerDepartment.id === deptId) { 
      log("Ты уже в этом отделе."); return; 
    }
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
  if (!state.npcModelManager.mixers.has("local_player")) {
    console.warn("⚠️ Микшер не найден! Создаем модель на лету...");
    const template = Object.values(state.npcModelManager.templates)[0];
    if (template && localPlayer) {
      const newPlayerMesh = template.clone();
      newPlayerMesh.scale.set(0.9, 0.9, 0.9);
      newPlayerMesh.rotation.y = Math.PI; 
      const bbox = new THREE.Box3().setFromObject(newPlayerMesh);
      newPlayerMesh.position.set(0, -bbox.min.y, 0);
      localPlayer.add(newPlayerMesh);
      const localMixer = new THREE.AnimationMixer(newPlayerMesh);
      state.npcModelManager.mixers.set("local_player", localMixer);
      const idleClip = state.npcModelManager.animations["idle"] || 
                       state.npcModelManager.animations["static"] || 
                       state.npcModelManager.animations[Object.keys(state.npcModelManager.animations)[0]];
      if (idleClip) localMixer.clipAction(idleClip).play();
    }
  }

  if (state.player.seated) {
    state.player.seated = false;
    state.player.seatChair = null;
    state.player.eyeHeight = STAND_EYE;
    state.player.y = floorAt(state.player.x, state.player.z, state.player.y);
    state.player.vy = 0;
    state.player.onGround = true;
    if (state.npcModelManager) state.npcModelManager.setLocalPlayerAnimation(false, false);
    applyPlayerTransforms();
    log("Вы встали.");
    return;
  }

  const chair = findChairUnderCrosshair();
  if (!chair) { log("Рядом нет стула, чтобы сесть."); return; }

  state.player.seated = true;
  state.player.seatChair = chair;
  state.player.x = chair.x;
  state.player.z = chair.z;
  state.player.y = chair.floorY;
  state.player.vy = 0;
  state.player.onGround = true;
  state.player.eyeHeight = SIT_EYE;
  if (state.npcModelManager) state.npcModelManager.setLocalPlayerAnimation(false, true);
  applyPlayerTransforms();
  log("Вы сели.");
}

export function orderCoffee(baristaCounter) {
  const baristaId = baristaCounter.userData.baristaId;
  if (baristaId && state.npcModelManager) {
    const greetAnimations = ["nodding", "emote-yes", "greeting", "talking"];
    let played = false;
    for (const animName of greetAnimations) {
      if (state.npcModelManager.playAnimation(baristaId, animName, 0.2)) {
        played = true;
        break;
      }
    }
    if (!played) state.npcModelManager.playAnimation(baristaId, "idle", 0.2);
    setTimeout(() => {
      state.npcModelManager.playAnimation(baristaId, "idle", 0.5);
    }, 1500);
  }
  pickupCoffee();
}