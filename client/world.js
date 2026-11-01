// world.js
import * as THREE from "three";
import { deptGroup, objectGroup, npcGroup, scene } from "./scene.js";
import { makeLabel } from "./sprites.js";
import { state } from "./state.js";
import { ROOMS, roomDoorZ, roomLeadPos, loginComputers } from "./office.js";
import { log } from "./ui.js";

function createChair(x, z, rotationY = 0) {
  const group = new THREE.Group();
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.1, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x1e293b })
  );
  seat.position.y = 0.5;
  group.add(seat);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x1e293b })
  );
  back.position.set(0, 0.8, -0.25);
  group.add(back);
  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 })
  );
  leg.position.y = 0.25;
  group.add(leg);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.05, 5),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 })
  );
  base.position.y = 0.025;
  group.add(base);
  group.position.set(x, 0, z);
  group.rotation.y = rotationY;
  group.castShadow = true;
  return group;
}

export function addGameBox(id, color, x, z, labelText, group = objectGroup) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.2, 1.2),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 })
  );
  mesh.position.set(x, 1.1, z);
  mesh.userData.interactableId = id;
  group.add(mesh);
  state.interactables.push(mesh);
  if (labelText) { 
    const lbl = makeLabel(labelText); 
    lbl.position.set(x, 2.9, z); 
    group.add(lbl); 
  }
  return mesh;
}

export function addBoard(id, color, x, z, labelText) {
  const group = new THREE.Group();
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.5, 0.12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 })
  );
  panel.position.y = 1.5; panel.castShadow = true; group.add(panel);
  const legGeo = new THREE.BoxGeometry(0.08, 1.0, 0.08);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
  for (const lx of [-1.0, 1.0]) { 
    const leg = new THREE.Mesh(legGeo, legMat); 
    leg.position.set(lx, 0.5, 0); 
    group.add(leg); 
  }
  group.position.set(x, 0, z);
  group.userData.interactableId = id;
  objectGroup.add(group);
  state.interactables.push(group);
  if (labelText) { 
    const lbl = makeLabel(labelText, [11, 2.6]); 
    lbl.position.set(x, 2.7, z); 
    objectGroup.add(lbl); 
  }
  return group;
}

function buildAwesomeCoffeeBar(pos) {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);
  group.rotation.y = pos.rotation;

  const counterBase = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.1, 3.0),
    new THREE.MeshStandardMaterial({ color: 0x4E342E, roughness: 0.5, metalness: 0.1 })
  );
  counterBase.position.set(0, 0.55, 0);
  counterBase.castShadow = true;
  counterBase.receiveShadow = true;
  counterBase.userData.interactableId = "coffee_bar";
  group.add(counterBase);

  const counterTop = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.05, 3.1),
    new THREE.MeshStandardMaterial({ color: 0x8D6E63, roughness: 0.3 })
  );
  counterTop.position.set(0, 1.1, 0);
  counterTop.receiveShadow = true;
  group.add(counterTop);

  const machine = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.7, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.2, metalness: 0.8 })
  );
  machine.position.set(0.3, 1.45, -0.8);
  machine.castShadow = true;
  group.add(machine);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00ff88, emissiveIntensity: 1.0 })
  );
  screen.position.set(0.3, 1.55, -1.01);
  group.add(screen);

  const cupGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.12, 8);
  const cupMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  for (let i = 0; i < 3; i++) {
    const cup = new THREE.Mesh(cupGeo, cupMat);
    cup.position.set(0.3, 1.18, -0.6 + i * 0.6);
    group.add(cup);
  }

  const barLight = new THREE.PointLight(0xffaa00, 1.5, 6);
  barLight.position.set(0, 2.5, 0);
  barLight.castShadow = true;
  group.add(barLight);

  objectGroup.add(group);
  state.interactables.push(counterBase);

  const lbl = makeLabel("☕ Кофе-поинт (E)", [10, 2.5]);
  lbl.position.set(0, 2.6, 0);
  group.add(lbl);

  if (state.npcModelManager && state.npcModelManager.isLoaded) {
    const template = state.npcModelManager.templates["/models/character-b.glb"] || 
                     Object.values(state.npcModelManager.templates)[0];
    
    if (template) {
      const baristaMesh = template.clone();
      baristaMesh.scale.set(0.9, 0.9, 0.9);
      baristaMesh.position.set(-1.8, 0, 0);
      baristaMesh.rotation.y = Math.PI / 2;
      
      const bbox = new THREE.Box3().setFromObject(baristaMesh);
      baristaMesh.position.y = -bbox.min.y;

      baristaMesh.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      group.add(baristaMesh);

      const baristaId = pos.x < 0 ? "barista_left" : "barista_right";
      baristaMesh.userData.npc = {
        id: baristaId,
        name: "Бариста",
        role: "barista",
        isBarista: true
      };

      const mixer = new THREE.AnimationMixer(baristaMesh);
      state.npcModelManager.mixers.set(baristaId, mixer);
      
      const clip = state.npcModelManager.animations["idle"] || state.npcModelManager.animations["static"];
      if (clip) mixer.clipAction(clip).play();

      counterBase.userData.baristaId = baristaId;
      state.npcMeshes.push(baristaMesh);
    }
  }
}

export function buildGameEntities() {
  deptGroup.clear(); 
  objectGroup.clear(); 
  npcGroup.clear();
  state.interactables.length = 0;
  state.npcMeshes.length = 0;
  
  state.interactables.push(...loginComputers);

  for (const d of state.departments) {
    const room = ROOMS[d.slug];
    if (!room) { log(`Нет комнаты для отдела ${d.slug}`); continue; }
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6, 0.2, 48),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(d.color), transparent: true, opacity: 0.22 })
    );
    disc.position.set(room.x, 0.06, room.z);
    deptGroup.add(disc);
    const dz = roomDoorZ(room);
    const isMine = state.playerDepartment && state.playerDepartment.id === d.id;
    addGameBox(`dept_sign_${d.id}`, new THREE.Color(d.color).getHex(), room.x, dz,
      isMine ? "Твой отдел" : `${d.name} (${d.current_players}/${d.max_players}) — E`);
  }

  const boss = ROOMS.boss;
  addGameBox("pm_desk", 0xeab308, boss.x, roomDoorZ(boss), "Стол PM: взять задачу (E)");
  addGameBox("work_terminal", 0x22d3ee, ROOMS.lobby.x, ROOMS.lobby.z + 5, "Рабочая консоль: мини-игра (E)");
  addBoard("project_board", 0xf59e0b, ROOMS.lobby.x, ROOMS.lobby.z - 5, "Доска проекта: конвейер (E / F)");

  for (const npc of state.npcs) {
    let pos;
    let isSeated = true;
    
    if (npc.department_id) {
      const d = state.departments.find((x) => x.id === npc.department_id);
      const room = d && ROOMS[d.slug];
      if (!room) continue;
      pos = roomLeadPos(room);
    } else {
      pos = { x: 20, z: 28 };
      isSeated = false;
    }

    const isBoss = npc.role === "product_manager" || npc.is_leader === true;
    const npcMesh = state.npcModelManager.createNPC(npc, pos, isBoss, isSeated);
    if (!npcMesh) continue;

    if (isSeated) {
      const chair = createChair(pos.x, pos.z, Math.PI);
      npcGroup.add(chair);
    } else {
      const chair = createChair(pos.x + 1, pos.z, Math.PI);
      npcGroup.add(chair);
    }

    npcGroup.add(npcMesh);
    state.npcMeshes.push(npcMesh);

    const labelHeight = isBoss ? 3.0 : 2.4; 
    const lbl = makeLabel(npc.name, [10, 2.5]);
    lbl.position.set(pos.x, labelHeight, pos.z);
    npcGroup.add(lbl);
  }

  buildAwesomeCoffeeBar({ x: -22, z: 0, rotation: 0 });
  buildAwesomeCoffeeBar({ x: 22, z: 0, rotation: Math.PI });
}