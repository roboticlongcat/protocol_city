// main.js
import * as THREE from "three";
import { scene, camera, renderer, localPlayer } from "./scene.js";
import { state } from "./state.js";
import { updateMovement, startPositionSync } from "./movement.js";
import { updateSpatial } from "./voice.js";
import { NPCModelManager } from "./npc-models.js";
import { 
  doors, reactiveNPCs, ambientNPCs, 
  updatePhysics, updateReactiveNPCs, updateAmbientNPCs, 
  updateInteractiveObjects, updateAnimatedObjects,
  spawnedObjects, updateSpawnedObjects 
} from "./office.js";
import { updateDraggedObject, isDragging } from "./interaction.js";

import "./net.js";
import "./ui.js";
import "./computer.js";
import "./activities.js";
import "./npc-chat.js";
import "./project.js";
import "./departments.js";
import "./interaction.js";
import "./input.js";

console.log("🚀 [MAIN] Запуск main.js...");

state.npcModelManager = new NPCModelManager(scene);

const modelsToLoad = [
  "/models/npc-boss.glb",
  "/models/character-a.glb", "/models/character-b.glb", "/models/character-c.glb",
  "/models/character-d.glb", "/models/character-e.glb", "/models/character-f.glb",
  "/models/character-g.glb", "/models/character-h.glb", "/models/character-i.glb",
  "/models/character-j.glb", "/models/character-k.glb", "/models/character-l.glb",
  "/models/character-m.glb"
];

state.npcModelManager.loadModels(modelsToLoad).then(() => {
  try {
    console.log("✅ [MAIN] Модели загружены. Инициализируем игрока...");
    const template = Object.values(state.npcModelManager.templates)[0];
    if (!template) throw new Error("Нет шаблонов!");
    if (!localPlayer) throw new Error("localPlayer не импортирован!");

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
    
    console.log("🎉 [MAIN] Локальный игрок готов!");
  } catch (error) {
    console.error("💥 [MAIN] ОШИБКА:", error);
  }
}).catch((err) => {
  console.error("⚠️ [MAIN] Ошибка загрузки моделей:", err);
});

let lastTime = performance.now();
let totalTime = 0;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  totalTime += delta;

  updateMovement(delta);
  updatePhysics(delta);

  for (const door of doors) {
    if (Math.abs(door.currentRot - door.targetRot) > 0.01) {
      door.currentRot += (door.targetRot - door.currentRot) * Math.min(delta * 6, 1);
      door.pivot.rotation.y = door.rotY + door.currentRot;
    }
  }

  // === ПОВОРОТ NPC К ИГРОКУ (БОСС И БАРМИСТА) ===
  if (state.npcMeshes) {
    const playerPosFlat = new THREE.Vector3(state.player.x, 0, state.player.z);
    
    for (const npcMesh of state.npcMeshes) {
      const npcData = npcMesh.userData.npc;
      if (!npcData) continue;
      
      const isBossStanding = !npcData.department_id && !npcData.is_leader && 
                             npcData.role !== "product_manager" && !npcData.isBarista;
      const isBarista = npcData.isBarista || npcData.role === "barista";
      
      if (isBossStanding || isBarista) {
        // ВАЖНО: Получаем МИРОВУЮ позицию NPC (а не локальную!)
        // Это критично для бариста, который находится внутри повёрнутой группы
        const worldPos = new THREE.Vector3();
        npcMesh.getWorldPosition(worldPos);
        worldPos.y = 0;
        
        const dist = worldPos.distanceTo(playerPosFlat);
        
        if (dist < 10) {
          // Направление к игроку в МИРОВЫХ координатах
          const dir = new THREE.Vector3(
            state.player.x - worldPos.x, 
            0, 
            state.player.z - worldPos.z
          ).normalize();
          const targetWorldAngle = Math.atan2(dir.x, dir.z);
          
          // Получаем поворот родителя (группы) в мировых координатах
          let parentWorldAngle = 0;
          if (npcMesh.parent && npcMesh.parent.type !== 'Scene') {
            const parentQuat = new THREE.Quaternion();
            npcMesh.parent.getWorldQuaternion(parentQuat);
            const euler = new THREE.Euler().setFromQuaternion(parentQuat, 'YXZ');
            parentWorldAngle = euler.y;
          }
          
          // Целевой ЛОКАЛЬНЫЙ поворот = мировой угол - поворот родителя
          const targetLocalAngle = targetWorldAngle - parentWorldAngle;
          
          // Плавный поворот с учётом кратчайшего пути
          let diff = targetLocalAngle - npcMesh.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          
          npcMesh.rotation.y += diff * Math.min(delta * 3, 1);
        }
      }
    }
  }
  const playerPos = new THREE.Vector3(state.player.x, 0, state.player.z);
  updateReactiveNPCs(delta, playerPos);
  updateAmbientNPCs(delta, playerPos);

  if (isDragging()) updateDraggedObject(delta);

  updateInteractiveObjects(delta, totalTime);
  updateAnimatedObjects(delta, totalTime);
  updateSpawnedObjects(delta, totalTime);

  if (state.npcModelManager) state.npcModelManager.update(delta);

  renderer.render(scene, camera);
  
  if (state.voiceStarted) updateSpatial(state.otherPlayers);
}

animate();
startPositionSync();

export function smoothLookAt(mesh, targetRotationY, speed = 0.15) {
  let currentY = mesh.rotation.y;
  let diff = targetRotationY - currentY;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  mesh.rotation.y += diff * speed;
}