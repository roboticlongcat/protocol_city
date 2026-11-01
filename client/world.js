import * as THREE from "three";
import { deptGroup, objectGroup, npcGroup } from "./scene.js";
import { makeLabel } from "./sprites.js";
import { state } from "./state.js";
import { ROOMS, roomDoorZ, roomLeadPos, loginComputers } from "./office.js";
import { log } from "./ui.js";

export function addGameBox(id, color, x, z, labelText, group = objectGroup) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.2, 1.2),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 })
  );
  mesh.position.set(x, 1.1, z);
  mesh.userData.interactableId = id;
  group.add(mesh);
  state.interactables.push(mesh);
  if (labelText) { const lbl = makeLabel(labelText); lbl.position.set(x, 2.9, z); group.add(lbl); }
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
  for (const lx of [-1.0, 1.0]) { const leg = new THREE.Mesh(legGeo, legMat); leg.position.set(lx, 0.5, 0); group.add(leg); }
  group.position.set(x, 0, z);
  group.userData.interactableId = id;
  objectGroup.add(group);
  state.interactables.push(group);
  if (labelText) { const lbl = makeLabel(labelText, [11, 2.6]); lbl.position.set(x, 2.7, z); objectGroup.add(lbl); }
  return group;
}

export function buildGameEntities() {
  deptGroup.clear(); objectGroup.clear(); npcGroup.clear();
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
    if (npc.department_id) {
      const d = state.departments.find((x) => x.id === npc.department_id);
      const room = d && ROOMS[d.slug];
      if (!room) continue;
      pos = roomLeadPos(room);
    } else {
      pos = { x: boss.x, z: boss.z + 1.3 };
    }
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 20, 20),
      new THREE.MeshStandardMaterial({
        color: npc.role === "product_manager" ? 0xf472b6 : 0xffffff,
        emissive: npc.role === "product_manager" ? 0xf472b6 : 0x94a3b8,
        emissiveIntensity: 0.3,
      })
    );
    mesh.position.set(pos.x, 1.35, pos.z);
    mesh.userData.npc = npc;
    npcGroup.add(mesh);
    state.npcMeshes.push(mesh);
    const lbl = makeLabel(npc.name, [10, 2.5]);
    lbl.position.set(pos.x, 2.5, pos.z);
    npcGroup.add(lbl);
  }
}