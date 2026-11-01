// office.js
import * as THREE from "three";
import { state } from "./state.js"; // <-- ⭐ ДОБАВЬ ЭТУ СТРОКУ ⭐
export const wallBoxes = [];
export const floors = [];
export const chairs = [];
export const loginComputers = [];
export const doors = [];
export const draggableObjects = [];
export const reactiveNPCs = [];
export const spawnedObjects = [];
export const interactiveObjects = [];
export const ambientNPCs = [];
export const animatedObjects = []; // Для анимации вентиляторов и т.д.

const WALL_H = 3.2;
const WALL_T = 0.3;
const DOOR_W = 2.4;
const DOOR_H = 2.4;

// === АТМОСФЕРНЫЕ МАТЕРИАЛЫ ===
const matWall = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.95 });
const matFloor = new THREE.MeshStandardMaterial({ color: 0x9a8b76, roughness: 1 });
const matFloorRoom = new THREE.MeshStandardMaterial({ color: 0xb5a68e, roughness: 1 });
const matDesk = new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.7 });
const matDeskTop = new THREE.MeshStandardMaterial({ color: 0xc9a876, roughness: 0.5 });
const matGlass = new THREE.MeshStandardMaterial({
  color: 0xbfe8ff, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.1,
});
const matWindowFrame = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
const matChairSeat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.6 });
const matChairLeg = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });
const matCabinet = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.7 });
const matHandle = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.6, roughness: 0.3 });
const matPlantPot = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.9 });
const matPlantLeaf = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
const matMonitor = new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x0ea5e9, emissiveIntensity: 0.6 });
const matDoor = new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.6 });
const matPrinter = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.3 });
const matWaterCooler = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.3, metalness: 0.5 });

function pushBox(minX, maxX, minZ, maxZ, minY = 0, maxY = WALL_H) {
  wallBoxes.push({ minX, maxX, minZ, maxZ, minY, maxY });
}

function addBox(scene, w, h, d, x, y, z, mat, collide = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (collide) pushBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y - h / 2, y + h / 2);
  return mesh;
}

function addWallX(scene, x, z, length, door = false) {
  if (!door) {
    addBox(scene, length, WALL_H, WALL_T, x, WALL_H / 2, z, matWall);
    return;
  }
  const side = (length - DOOR_W) / 2;
  addBox(scene, side, WALL_H, WALL_T, x - length / 2 + side / 2, WALL_H / 2, z, matWall);
  addBox(scene, side, WALL_H, WALL_T, x + length / 2 - side / 2, WALL_H / 2, z, matWall);
  addBox(scene, DOOR_W, WALL_H - DOOR_H, WALL_T, x, DOOR_H + (WALL_H - DOOR_H) / 2, z, matWall, false);
  const openDir = z < 0 ? 1 : -1;
  addDoor(scene, x - DOOR_W / 2, z, 0, openDir);
}

function addWallZ(scene, x, z, length, door = false) {
  if (!door) {
    addBox(scene, WALL_T, WALL_H, length, x, WALL_H / 2, z, matWall);
    return;
  }
  const side = (length - DOOR_W) / 2;
  addBox(scene, WALL_T, WALL_H, side, x, WALL_H / 2, z - length / 2 + side / 2, matWall);
  addBox(scene, WALL_T, WALL_H, side, x, WALL_H / 2, z + length / 2 - side / 2, matWall);
  addBox(scene, WALL_T, WALL_H - DOOR_H, DOOR_W, x, DOOR_H + (WALL_H - DOOR_H) / 2, z, matWall, false);
  const openDir = x < 0 ? 1 : -1;
  addDoor(scene, x, z - DOOR_W / 2, Math.PI / 2, openDir);
}

function addWindowX(scene, x, z, length) {
  const sillH = 1.0, winH = 1.6, topH = WALL_H - sillH - winH;
  const winW = Math.min(length - 1, 3.0);
  addBox(scene, length, sillH, WALL_T, x, sillH / 2, z, matWall);
  addBox(scene, length, topH, WALL_T, x, sillH + winH + topH / 2, z, matWall, false);
  const sideW = (length - winW) / 2;
  if (sideW > 0.05) {
    addBox(scene, sideW, winH, WALL_T, x - length / 2 + sideW / 2, sillH + winH / 2, z, matWall);
    addBox(scene, sideW, winH, WALL_T, x + length / 2 - sideW / 2, sillH + winH / 2, z, matWall);
  }
  const glass = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.05), matGlass);
  glass.position.set(x, sillH + winH / 2, z);
  scene.add(glass);
  const frameGeo = new THREE.BoxGeometry(winW + 0.1, 0.06, 0.12);
  const fTop = new THREE.Mesh(frameGeo, matWindowFrame); fTop.position.set(x, sillH + winH, z); scene.add(fTop);
  const fBot = new THREE.Mesh(frameGeo, matWindowFrame); fBot.position.set(x, sillH, z); scene.add(fBot);
  for (const off of [-winW / 3, 0, winW / 3]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, winH, 0.12), matWindowFrame);
    bar.position.set(x + off, sillH + winH / 2, z);
    scene.add(bar);
  }
}

function addWindowZ(scene, x, z, length) {
  const sillH = 1.0, winH = 1.6, topH = WALL_H - sillH - winH;
  const winW = Math.min(length - 1, 3.0);
  addBox(scene, WALL_T, sillH, length, x, sillH / 2, z, matWall);
  addBox(scene, WALL_T, topH, length, x, sillH + winH + topH / 2, z, matWall, false);
  const sideW = (length - winW) / 2;
  if (sideW > 0.05) {
    addBox(scene, WALL_T, winH, sideW, x, sillH + winH / 2, z - length / 2 + sideW / 2, matWall);
    addBox(scene, WALL_T, winH, sideW, x, sillH + winH / 2, z + length / 2 - sideW / 2, matWall);
  }
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.05, winH, winW), matGlass);
  glass.position.set(x, sillH + winH / 2, z);
  scene.add(glass);
  const frameGeo = new THREE.BoxGeometry(0.12, 0.06, winW + 0.1);
  const fTop = new THREE.Mesh(frameGeo, matWindowFrame); fTop.position.set(x, sillH + winH, z); scene.add(fTop);
  const fBot = new THREE.Mesh(frameGeo, matWindowFrame); fBot.position.set(x, sillH, z); scene.add(fBot);
  for (const off of [-winW / 3, 0, winW / 3]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, winH, 0.06), matWindowFrame);
    bar.position.set(x, sillH + winH / 2, z + off);
    scene.add(bar);
  }
}

function addFloor(scene, x, z, w, d, mat = matFloorRoom) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(x, 0.01, z);
  floor.receiveShadow = true;
  scene.add(floor);
}

function addCarpet(scene, x, z, w, d, color = 0x1f2937) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(x, 0.02, z);
  carpet.receiveShadow = true;
  scene.add(carpet);
}

function addDesk(scene, x, z, rotY = 0) {
  const group = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.9), matDeskTop);
  top.position.y = 0.75; top.castShadow = true; top.receiveShadow = true;
  group.add(top);
  const legGeo = new THREE.BoxGeometry(0.1, 0.75, 0.1);
  for (const [lx, lz] of [[-0.9, -0.35], [0.9, -0.35], [-0.9, 0.35], [0.9, 0.35]]) {
    const leg = new THREE.Mesh(legGeo, matDesk);
    leg.position.set(lx, 0.375, lz); leg.castShadow = true;
    group.add(leg);
  }
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.06), matMonitor);
  monitor.position.set(0, 1.1, -0.2);
  group.add(monitor);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), matDesk);
  stand.position.set(0, 0.85, -0.2);
  group.add(stand);
  
  // Клавиатура и мышь
  const keyboard = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.02, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
  );
  keyboard.position.set(-0.1, 0.81, 0.15);
  group.add(keyboard);
  
  const mouse = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.02, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
  );
  mouse.position.set(0.3, 0.81, 0.15);
  group.add(mouse);
  
  // Кружка на столе (атмосфера!)
  if (Math.random() > 0.5) {
    const mug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    mug.position.set(0.5, 0.85, 0.2);
    group.add(mug);
  }
  
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  const cos = Math.abs(Math.cos(rotY)), sin = Math.abs(Math.sin(rotY));
  const halfW = 1.0 * cos + 0.45 * sin, halfD = 1.0 * sin + 0.45 * cos;
  pushBox(x - halfW, x + halfW, z - halfD, z + halfD, 0, 0.8);
}

function addRoundTable(scene, x, z, radius = 1.6) {
  const group = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.1, 48), matDeskTop);
  top.position.y = 0.75; top.castShadow = true; top.receiveShadow = true;
  group.add(top);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 0.75, 16), matDesk);
  pillar.position.y = 0.375;
  group.add(pillar);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 24), matDesk);
  base.position.y = 0.025;
  group.add(base);
  group.position.set(x, 0, z);
  scene.add(group);
  pushBox(x - radius, x + radius, z - radius, z + radius, 0, 0.8);
}

export function addChair(scene, x, z, rotY = 0, floorY = 0) {
  const group = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.55), matChairSeat);
  seat.position.y = 0.5; seat.castShadow = true;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.08), matChairSeat);
  back.position.set(0, 0.8, -0.24); back.castShadow = true;
  group.add(back);
  const legGeo = new THREE.BoxGeometry(0.06, 0.5, 0.06);
  for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) {
    const leg = new THREE.Mesh(legGeo, matChairLeg);
    leg.position.set(lx, 0.25, lz); leg.castShadow = true;
    group.add(leg);
  }
  group.position.set(x, floorY, z);
  group.rotation.y = rotY;
  scene.add(group);
  return { mesh: group, x, z, rotY, floorY, seatY: floorY + 1.2 };
}

function addCabinet(scene, x, z, rotY = 0) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.5), matCabinet);
  body.position.y = 1.0; body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  for (const dy of [-0.4, 0.4]) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.05), matHandle);
    handle.position.set(0.55, 1.0 + dy, 0.28);
    g.add(handle);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
  const cos = Math.abs(Math.cos(rotY)), sin = Math.abs(Math.sin(rotY));
  const hw = 0.6 * cos + 0.25 * sin, hd = 0.6 * sin + 0.25 * cos;
  pushBox(x - hw, x + hw, z - hd, z + hd, 0, 2.0);
}

function addComputer(scene, x, z, rotY = 0) {
  const g = new THREE.Group();
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.05), matMonitor);
  monitor.position.set(0, 0.85, 0);
  monitor.userData.interactableId = "login_computer";
  loginComputers.push(monitor);
  g.add(monitor);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.1), matDesk);
  stand.position.set(0, 0.7, 0);
  g.add(stand);
  g.position.set(x, 0.8, z);
  g.rotation.y = rotY;
  scene.add(g);
}

function addPlant(scene, x, z) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.3, 12), matPlantPot);
  pot.position.y = 0.15; pot.castShadow = true;
  g.add(pot);
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), matPlantLeaf);
  leaves.position.y = 0.55; leaves.scale.set(1, 0.8, 1); leaves.castShadow = true;
  g.add(leaves);
  g.position.set(x, 0, z);
  scene.add(g);
  pushBox(x - 0.2, x + 0.2, z - 0.2, z + 0.2, 0, 0.7);
}

function addCeilingLight(scene, x, z, color = 0xfef3c7, intensity = 1.2, floorY = 0) {
  const light = new THREE.PointLight(color, intensity, 22, 2);
  light.position.set(x, floorY + WALL_H - 0.3, z);
  scene.add(light);
  const fixture = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.08, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xfffaf0, emissive: 0xfffaf0, emissiveIntensity: 1.0 })
  );
  fixture.position.set(x, floorY + WALL_H - 0.05, z);
  scene.add(fixture);
}

function addSign(scene, x, y, z, color) {
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.5, 0.08),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 })
  );
  sign.position.set(x, y, z);
  scene.add(sign);
}

function addPainting(scene, x, y, z, rotY, color) {
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.8, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.6 })
  );
  frame.position.set(x, y, z);
  frame.rotation.y = rotY;
  scene.add(frame);
  
  const canvas = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.6),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  );
  canvas.position.set(x, y, z + (rotY === 0 ? 0.03 : rotY === Math.PI ? -0.03 : 0));
  canvas.rotation.y = rotY;
  scene.add(canvas);
}

// === ЧАСЫ НА СТЕНЕ (атмосфера!) ===
function addWallClock(scene, x, y, z, rotY) {
  const group = new THREE.Group();
  
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
  );
  group.add(face);
  
  const frame = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.32, 32),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 })
  );
  group.add(frame);
  
  // Стрелки
  const hourHand = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.15, 0.01),
    new THREE.MeshStandardMaterial({ color: 0x000000 })
  );
  hourHand.position.set(0, 0.075, 0.01);
  hourHand.rotation.z = -Math.PI / 4;
  group.add(hourHand);
  
  const minuteHand = new THREE.Mesh(
    new THREE.BoxGeometry(0.015, 0.2, 0.01),
    new THREE.MeshStandardMaterial({ color: 0x000000 })
  );
  minuteHand.position.set(0, 0.1, 0.015);
  minuteHand.rotation.z = Math.PI / 3;
  group.add(minuteHand);
  
  group.position.set(x, y, z);
  group.rotation.y = rotY;
  scene.add(group);
}

// === ВЕНТИЛЯТОР НА ПОТОЛКЕ (анимированный!) ===
function addCeilingFan(scene, x, y, z) {
  const group = new THREE.Group();
  
  const motor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.2, 16),
    new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6 })
  );
  group.add(motor);
  
  const blades = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.02, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.7 })
    );
    blade.position.set(0.4, 0, 0);
    blade.rotation.y = (i * Math.PI) / 2;
    blades.add(blade);
  }
  blades.position.y = -0.15;
  group.add(blades);
  
  group.position.set(x, y, z);
  scene.add(group);
  
  // Добавляем в анимируемые объекты
  animatedObjects.push({
    type: 'fan',
    mesh: blades,
    speed: 2 + Math.random() * 2
  });
}

export function addDoor(scene, x, z, rotY = 0, openDir = 1) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0, z);
  pivot.rotation.y = rotY;
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.1), matDoor);
  doorMesh.position.set(DOOR_W / 2, DOOR_H / 2, 0);
  doorMesh.castShadow = true; doorMesh.receiveShadow = true;
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.25, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.8, roughness: 0.2 })
  );
  handle.position.set(DOOR_W - 0.15, 0, 0.08);
  doorMesh.add(handle);
  pivot.add(doorMesh);
  scene.add(pivot);
  doorMesh.userData.interactableId = "door";
  const doorObj = {
    pivot, mesh: doorMesh, isOpen: false,
    targetRot: 0, currentRot: 0, x, z, rotY, openDir
  };
  doors.push(doorObj);
  return doorObj;
}

export function addDraggableBox(scene, x, z, color = 0x3b82f6, size = 0.5) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.15 })
  );
  mesh.position.set(x, size / 2, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.interactableId = "draggable";
  mesh.userData.isDraggable = true;
  mesh.userData.physics = {
    velocity: new THREE.Vector3(0, 0, 0),
    mass: size * 2,
    restitution: 0.4,
    friction: 0.85,
    isFalling: false,
    isDragged: false,
    radius: size / 2
  };
  scene.add(mesh);
  draggableObjects.push(mesh);
  return mesh;
}

export function addPrinter(scene, x, z, rotY = 0) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.6), matPrinter);
  body.position.y = 0.2; body.castShadow = true;
  group.add(body);
  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.05, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 })
  );
  tray.position.set(0, 0.42, -0.05);
  group.add(tray);
  const outTray = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.05, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 })
  );
  outTray.position.set(0, 0.05, 0.35);
  group.add(outTray);
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.8 })
  );
  led.position.set(0.3, 0.35, 0.2);
  group.add(led);
  const button = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12),
    new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 })
  );
  button.position.set(-0.25, 0.42, 0.2);
  button.rotation.x = Math.PI / 2;
  group.add(button);
  group.position.set(x, 0.8, z);
  group.rotation.y = rotY;
  scene.add(group);
  body.userData.interactableId = "printer";
  body.userData.parentGroup = group;
  body.userData.led = led;
  body.userData.isPrinting = false;
  interactiveObjects.push({ mesh: body, group, type: 'printer', led, isPrinting: false, printTimer: 0 });
  pushBox(x - 0.4, x + 0.4, z - 0.3, z + 0.3, 0.8, 1.2);
  return group;
}

export function addWaterCooler(scene, x, z) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.5), matWaterCooler);
  base.position.y = 0.5; base.castShadow = true;
  group.add(base);
  const bottle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.6, 16),
    new THREE.MeshStandardMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.6, roughness: 0.1 })
  );
  bottle.position.y = 1.3;
  group.add(bottle);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12),
    new THREE.MeshStandardMaterial({ color: 0x1e40af })
  );
  cap.position.y = 1.62;
  group.add(cap);
  const tapRed = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xef4444 })
  );
  tapRed.position.set(-0.15, 0.85, 0.28);
  group.add(tapRed);
  const tapBlue = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x3b82f6 })
  );
  tapBlue.position.set(0.15, 0.85, 0.28);
  group.add(tapBlue);
  group.position.set(x, 0, z);
  scene.add(group);
  base.userData.interactableId = "water_cooler";
  interactiveObjects.push({ mesh: base, group, type: 'water_cooler', bottle });
  pushBox(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, 1.6);
  return group;
}

export function addVendingMachine(scene, x, z, rotY = 0) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 2.0, 0.8),
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4, metalness: 0.3 })
  );
  body.position.y = 1.0; body.castShadow = true;
  group.add(body);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.2, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, transparent: true, opacity: 0.4, roughness: 0.05, metalness: 0.8 })
  );
  glass.position.set(0, 1.2, 0.4);
  group.add(glass);
  const snackColors = [0xfbbf24, 0x22c55e, 0xef4444, 0x8b5cf6];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const snack = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.2, 0.1),
        new THREE.MeshStandardMaterial({ color: snackColors[(row + col) % snackColors.length], roughness: 0.6 })
      );
      snack.position.set(-0.25 + col * 0.25, 1.6 - row * 0.35, 0.3);
      group.add(snack);
    }
  }
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.4, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x1e293b })
  );
  panel.position.set(0.3, 0.8, 0.42);
  group.add(panel);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x22c55e, emissiveIntensity: 0.8 })
  );
  screen.position.set(0.3, 0.9, 0.45);
  group.add(screen);
  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.15, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1e293b })
  );
  tray.position.set(0, 0.1, 0.4);
  group.add(tray);
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  body.userData.interactableId = "vending_machine";
  interactiveObjects.push({ mesh: body, group, type: 'vending_machine', screen });
  const cos = Math.abs(Math.cos(rotY)), sin = Math.abs(Math.sin(rotY));
  const hw = 0.5 * cos + 0.4 * sin, hd = 0.5 * sin + 0.4 * cos;
  pushBox(x - hw, x + hw, z - hd, z + hd, 0, 2.0);
  return group;
}

export function addNoticeBoard(scene, x, y, z, rotY) {
  const group = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.0, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.9 })
  );
  group.add(board);
  const stickerColors = [0xfbbf24, 0xf472b6, 0x60a5fa, 0x34d399];
  for (let i = 0; i < 6; i++) {
    const sticker = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.2),
      new THREE.MeshStandardMaterial({ color: stickerColors[i % stickerColors.length], roughness: 0.8 })
    );
    sticker.position.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.8, 0.03);
    sticker.rotation.z = (Math.random() - 0.5) * 0.3;
    group.add(sticker);
  }
  group.position.set(x, y, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

export function addReactiveNPC(scene, x, z, type, scale = 0.5) {
  const group = new THREE.Group();
  let bodyColor, bodySize;
  if (type === 'cat') { bodyColor = 0xffa500; bodySize = { w: 0.4, h: 0.25, d: 0.7 }; }
  else if (type === 'dog') { bodyColor = 0x8b4513; bodySize = { w: 0.5, h: 0.4, d: 0.9 }; }
  else if (type === 'parrot') { bodyColor = 0x22c55e; bodySize = { w: 0.2, h: 0.3, d: 0.2 }; }
  else { bodyColor = 0x94a3b8; bodySize = { w: 0.3, h: 0.3, d: 0.3 }; }
  
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(bodySize.w, bodySize.h, bodySize.d),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7 })
  );
  body.position.y = bodySize.h / 2 + 0.1; body.castShadow = true;
  group.add(body);
  
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(bodySize.w * 0.6, 12, 10),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7 })
  );
  head.position.set(0, bodySize.h + 0.2, bodySize.d / 2); head.castShadow = true;
  group.add(head);
  
  const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.08, bodySize.h + 0.25, bodySize.d / 2 + 0.1);
  group.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.08, bodySize.h + 0.25, bodySize.d / 2 + 0.1);
  group.add(rightEye);
  
  group.position.set(x, 0, z);
  group.scale.set(scale, scale, scale);
  scene.add(group);
  
  const npc = {
    mesh: group, type, state: 'idle',
    position: new THREE.Vector3(x, 0, z),
    targetPosition: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(0, 0, 0),
    rotationSpeed: 3,
    moveSpeed: type === 'cat' ? 1.5 : type === 'dog' ? 2 : 1,
    fleeDistance: type === 'cat' ? 3 : type === 'dog' ? 2 : 1.5,
    watchDistance: type === 'cat' ? 6 : type === 'dog' ? 8 : 5,
    stateTimer: 0, happiness: 50,
    name: type === 'cat' ? 'Мурзик' : type === 'dog' ? 'Бобик' : 'Кеша'
  };
  reactiveNPCs.push(npc);
  return npc;
}

export function addAmbientNPC(scene, x, z, role, modelPath) {
  if (!state.npcModelManager || !state.npcModelManager.isLoaded) {
    console.warn(`⚠️ Модели не загружены, пропускаем ambient NPC: ${role}`);
    return null;
  }
  const template = state.npcModelManager.templates[modelPath] || Object.values(state.npcModelManager.templates)[0];
  if (!template) { console.warn(`⚠️ Модель не найдена: ${modelPath}`); return null; }
  
  const mesh = template.clone();
  mesh.scale.set(0.9, 0.9, 0.9);
  mesh.position.set(x, 0, z);
  const bbox = new THREE.Box3().setFromObject(mesh);
  mesh.position.y = -bbox.min.y;
  mesh.traverse((child) => {
    if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
  });
  
  const mixer = new THREE.AnimationMixer(mesh);
  const clip = state.npcModelManager.animations["idle"] || state.npcModelManager.animations["static"];
  if (clip) mixer.clipAction(clip).play();
  
  const npcId = `ambient_${role}_${Date.now()}`;
  state.npcModelManager.mixers.set(npcId, mixer);
  
  const npc = {
    mesh, role, modelPath, state: 'walking',
    position: new THREE.Vector3(x, 0, z),
    targetPosition: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(0, 0, 0),
    moveSpeed: 1.2, stateTimer: 2 + Math.random() * 3,
    name: role === 'it' ? 'IT-шник' : role === 'cleaner' ? 'Уборщик' : role === 'courier' ? 'Курьер' : 'Секретарь',
    dialogue: role === 'it' ? 'Опять WiFi упал...' : role === 'cleaner' ? 'Осторожно, мокрый пол!' :
              role === 'courier' ? 'Посылка для отдела!' : 'Добро пожаловать!',
    mixerId: npcId
  };
  ambientNPCs.push(npc);
  scene.add(mesh);
  return npc;
}

export function updatePhysics(delta) {
  const gravity = -15;
  for (const obj of draggableObjects) {
    const phys = obj.userData.physics;
    if (!phys || phys.isDragged) continue;
    if (phys.isFalling || phys.velocity.lengthSq() > 0.001) {
      phys.velocity.y += gravity * delta;
      obj.position.x += phys.velocity.x * delta;
      obj.position.y += phys.velocity.y * delta;
      obj.position.z += phys.velocity.z * delta;
      obj.rotation.x += phys.velocity.z * delta * 2;
      obj.rotation.z -= phys.velocity.x * delta * 2;
      const floorY = phys.radius;
      if (obj.position.y < floorY) {
        obj.position.y = floorY;
        phys.velocity.y = -phys.velocity.y * phys.restitution;
        phys.velocity.x *= phys.friction;
        phys.velocity.z *= phys.friction;
        if (Math.abs(phys.velocity.y) < 0.5) phys.velocity.y = 0;
      }
      for (const wall of wallBoxes) {
        if (obj.position.y > wall.maxY || obj.position.y < wall.minY) continue;
        if (obj.position.x + phys.radius > wall.minX && obj.position.x - phys.radius < wall.maxX &&
            obj.position.z + phys.radius > wall.minZ && obj.position.z - phys.radius < wall.maxZ) {
          const dx1 = Math.abs(obj.position.x - wall.minX);
          const dx2 = Math.abs(obj.position.x - wall.maxX);
          const dz1 = Math.abs(obj.position.z - wall.minZ);
          const dz2 = Math.abs(obj.position.z - wall.maxZ);
          const minDist = Math.min(dx1, dx2, dz1, dz2);
          if (minDist === dx1 || minDist === dx2) phys.velocity.x = -phys.velocity.x * phys.restitution;
          else phys.velocity.z = -phys.velocity.z * phys.restitution;
        }
      }
      if (obj.position.y <= floorY + 0.01 && phys.velocity.length() < 0.3) {
        phys.velocity.set(0, 0, 0); phys.isFalling = false;
      }
    }
  }
}

export function updateReactiveNPCs(delta, playerPos) {
  for (const npc of reactiveNPCs) {
    const dist = npc.position.distanceTo(playerPos);
    npc.stateTimer -= delta;
    if (dist < npc.fleeDistance && npc.state !== 'fleeing') {
      npc.state = 'fleeing'; npc.stateTimer = 2;
      const away = npc.position.clone().sub(playerPos).normalize();
      npc.targetPosition.copy(npc.position).add(away.multiplyScalar(5));
    } else if (dist < npc.watchDistance && dist >= npc.fleeDistance && npc.state !== 'watching') {
      npc.state = 'watching'; npc.stateTimer = 3;
    } else if (npc.state === 'idle' && npc.stateTimer <= 0) {
      npc.state = 'walking'; npc.stateTimer = 3 + Math.random() * 3;
      const angle = Math.random() * Math.PI * 2;
      const distance = 2 + Math.random() * 2;
      npc.targetPosition.set(npc.position.x + Math.cos(angle) * distance, 0, npc.position.z + Math.sin(angle) * distance);
      npc.targetPosition.x = Math.max(-28, Math.min(28, npc.targetPosition.x));
      npc.targetPosition.z = Math.max(-28, Math.min(28, npc.targetPosition.z));
    }
    if (npc.stateTimer <= 0 && npc.state !== 'idle') { npc.state = 'idle'; npc.stateTimer = 2 + Math.random() * 2; }
    if (npc.state === 'walking' || npc.state === 'fleeing') {
      const toTarget = npc.targetPosition.clone().sub(npc.position);
      const distToTarget = toTarget.length();
      if (distToTarget > 0.2) {
        toTarget.normalize();
        const speed = npc.state === 'fleeing' ? npc.moveSpeed * 2 : npc.moveSpeed;
        const newX = npc.position.x + toTarget.x * speed * delta;
        const newZ = npc.position.z + toTarget.z * speed * delta;
        const animalRadius = 0.3; const animalHeight = 0.5;
        if (!collides(newX, npc.position.z, 0, animalRadius, animalHeight)) npc.position.x = newX;
        if (!collides(npc.position.x, newZ, 0, animalRadius, animalHeight)) npc.position.z = newZ;
        npc.position.x = Math.max(-28, Math.min(28, npc.position.x));
        npc.position.z = Math.max(-28, Math.min(28, npc.position.z));
        const targetAngle = Math.atan2(toTarget.x, toTarget.z);
        let diff = targetAngle - npc.mesh.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        npc.mesh.rotation.y += diff * Math.min(delta * npc.rotationSpeed, 1);
      } else { npc.state = 'idle'; npc.stateTimer = 1 + Math.random() * 2; }
    }
    if (npc.state === 'watching') {
      const toPlayer = playerPos.clone().sub(npc.position); toPlayer.y = 0;
      const targetAngle = Math.atan2(toPlayer.x, toPlayer.z);
      let diff = targetAngle - npc.mesh.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      npc.mesh.rotation.y += diff * Math.min(delta * npc.rotationSpeed, 1);
    }
    npc.mesh.position.set(npc.position.x, 0, npc.position.z);
  }
}

export function updateAmbientNPCs(delta, playerPos) {
  for (const npc of ambientNPCs) {
    npc.stateTimer -= delta;
    const dist = npc.position.distanceTo(playerPos);
    if (dist < 4 && npc.state !== 'talking') { npc.state = 'talking'; npc.stateTimer = 2; }
    else if (npc.state === 'talking' && dist >= 4) { npc.state = 'walking'; npc.stateTimer = 1; }
    if (npc.stateTimer <= 0 && npc.state !== 'talking') {
      npc.state = 'walking'; npc.stateTimer = 3 + Math.random() * 4;
      npc.targetPosition.set((Math.random() - 0.5) * 50, 0, (Math.random() - 0.5) * 50);
      npc.targetPosition.x = Math.max(-28, Math.min(28, npc.targetPosition.x));
      npc.targetPosition.z = Math.max(-28, Math.min(28, npc.targetPosition.z));
    }
    if (npc.state === 'walking') {
      const toTarget = npc.targetPosition.clone().sub(npc.position);
      const distToTarget = toTarget.length();
      if (distToTarget > 0.3) {
        toTarget.normalize();
        const newX = npc.position.x + toTarget.x * npc.moveSpeed * delta;
        const newZ = npc.position.z + toTarget.z * npc.moveSpeed * delta;
        if (!collides(newX, npc.position.z, 0, 0.3, 1.8)) npc.position.x = newX;
        if (!collides(npc.position.x, newZ, 0, 0.3, 1.8)) npc.position.z = newZ;
        const targetAngle = Math.atan2(toTarget.x, toTarget.z);
        let diff = targetAngle - npc.mesh.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        npc.mesh.rotation.y += diff * Math.min(delta * 4, 1);
        npc.mesh.position.y = Math.abs(Math.sin(Date.now() * 0.008)) * 0.05;
      } else { npc.state = 'idle'; npc.stateTimer = 2 + Math.random() * 2; }
    } else if (npc.state === 'talking') {
      const toPlayer = playerPos.clone().sub(npc.position); toPlayer.y = 0;
      const targetAngle = Math.atan2(toPlayer.x, toPlayer.z);
      let diff = targetAngle - npc.mesh.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      npc.mesh.rotation.y += diff * Math.min(delta * 5, 1);
    }
    npc.mesh.position.x = npc.position.x;
    npc.mesh.position.z = npc.position.z;
  }
}

export function updateInteractiveObjects(delta, time) {
  for (const obj of interactiveObjects) {
    if (obj.type === 'printer' && obj.isPrinting) {
      obj.printTimer -= delta;
      if (obj.led) obj.led.material.emissiveIntensity = 0.5 + Math.sin(time * 10) * 0.5;
      if (obj.printTimer <= 0) { obj.isPrinting = false; if (obj.led) obj.led.material.emissiveIntensity = 0.8; }
    }
    if (obj.type === 'vending_machine' && obj.screen) {
      obj.screen.material.emissiveIntensity = 0.6 + Math.sin(time * 2) * 0.2;
    }
  }
}

export function updateAnimatedObjects(delta, time) {
  for (const obj of animatedObjects) {
    if (obj.type === 'fan') {
      obj.mesh.rotation.y += obj.speed * delta;
    }
  }
}

export function spawnAgentObject(scene, x, z, type) {
  let mesh;
  if (type === 'reward') {
    mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3, 0),
      new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.5, metalness: 0.8 })
    );
    mesh.position.set(x, 1.5, z);
    mesh.userData.interactableId = 'reward';
  } else if (type === 'coffee_steam') {
    const group = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })
      );
      particle.position.set((Math.random() - 0.5) * 0.2, 1.2 + i * 0.15, (Math.random() - 0.5) * 0.2);
      particle.userData.steamOffset = i;
      group.add(particle);
    }
    group.position.set(x, 0, z);
    mesh = group;
    mesh.userData.isSteam = true;
  }
  if (mesh) { scene.add(mesh); spawnedObjects.push(mesh); }
  return mesh;
}

export function updateSpawnedObjects(delta, time) {
  for (const obj of spawnedObjects) {
    if (obj.userData.interactableId === 'reward') {
      obj.rotation.y += delta * 2;
      obj.position.y = 1.5 + Math.sin(time * 2) * 0.1;
    }
    if (obj.userData.isSteam) {
      obj.children.forEach((p, i) => {
        p.position.y = 1.2 + ((time * 0.5 + i * 0.2) % 1) * 0.5;
        p.material.opacity = 0.4 * (1 - ((time * 0.5 + i * 0.2) % 1));
      });
    }
  }
}

function addManagerDesk(scene, x, z, rotY = 0) {
  addDesk(scene, x, z, rotY);
  addComputer(scene, x - 0.4, z - 0.1, rotY);
  addComputer(scene, x + 0.4, z - 0.1, rotY);
  chairs.push(addChair(scene, x, z + 0.9, rotY + Math.PI));
}

function buildMeetingRoom(scene, cx, cz) {
  const W = 12, D = 12, H = WALL_H, t = 0.12, doorW = 2.4;
  const walls = [[W, H, t, cx, H / 2, cz - D / 2], [t, H, D, cx - W / 2, H / 2, cz], [t, H, D, cx + W / 2, H / 2, cz]];
  for (const [w, h, d, x, y, z] of walls) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matGlass);
    m.position.set(x, y, z); scene.add(m);
    pushBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0, H);
  }
  const side = (W - doorW) / 2;
  for (const [sx, sw] of [[cx - W / 2 + side / 2, side], [cx + W / 2 - side / 2, side]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sw, H, t), matGlass);
    m.position.set(sx, H / 2, cz + D / 2); scene.add(m);
    pushBox(sx - sw / 2, sx + sw / 2, cz + D / 2 - t / 2, cz + D / 2 + t / 2, 0, H);
  }
  addRoundTable(scene, cx, cz, 1.8);
  const R = 2.6;
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    chairs.push(addChair(scene, cx + Math.cos(ang) * R, cz + Math.sin(ang) * R, -ang + Math.PI / 2 + Math.PI));
  }
  addCarpet(scene, cx, cz, 8, 8, 0x3b4a5a);
  addCeilingLight(scene, cx, cz, 0xe0f2fe, 1.6);
  addCeilingLight(scene, cx - 3, cz - 3, 0xe0f2fe, 1.0);
  addCeilingLight(scene, cx + 3, cz + 3, 0xe0f2fe, 1.0);
  addCeilingFan(scene, cx, H - 0.5, cz); // Вентилятор в переговорной!
}

function buildDepartment(scene, cx, cz, color, label) {
  addManagerDesk(scene, cx, cz - 2.5, 0);
  const spots = [[cx - 3, cz + 1], [cx + 3, cz + 1], [cx - 3, cz + 3.5], [cx + 3, cz + 3.5]];
  for (const [sx, sz] of spots) {
    addDesk(scene, sx, sz, 0);
    addComputer(scene, sx, sz - 0.1, 0);
    chairs.push(addChair(scene, sx, sz + 0.9, Math.PI));
    addCabinet(scene, sx + (sx < cx ? -2 : 2), sz, Math.PI / 2);
    addPlant(scene, sx + (sx < cx ? 1.5 : -1.5), sz + 1.2);
  }
  addSign(scene, cx, WALL_H - 0.4, cz - 4.5, color);
  addCarpet(scene, cx, cz + 1, 8, 6, 0x4a5568);
  addCeilingLight(scene, cx - 3, cz, 0xfef3c7, 1.2);
  addCeilingLight(scene, cx + 3, cz, 0xfef3c7, 1.2);
  addDraggableBox(scene, cx + 2, cz + 2, color);
  addPrinter(scene, cx - 4.5, cz, 0);
  addWallClock(scene, cx, 2.5, cz - 5, 0); // Часы в каждом отделе!
}

function buildBossOffice(scene, cx, cz) {
  addRoundTable(scene, cx, cz - 1, 2.0);
  chairs.push(addChair(scene, cx, cz + 1.3, Math.PI));
  chairs.push(addChair(scene, cx - 1.5, cz - 2.5, 0));
  chairs.push(addChair(scene, cx + 1.5, cz - 2.5, 0));
  addCabinet(scene, cx - 4, cz - 3, 0);
  addCabinet(scene, cx + 4, cz - 3, 0);
  addCabinet(scene, cx - 4, cz + 2, 0);
  addCabinet(scene, cx + 4, cz + 2, 0);
  addPlant(scene, cx - 4, cz + 3.5);
  addPlant(scene, cx + 4, cz + 3.5);
  addPlant(scene, cx, cz - 4);
  addCarpet(scene, cx, cz, 10, 8, 0x5a3a2a);
  addCeilingLight(scene, cx, cz, 0xffe4b5, 1.4);
  addCeilingLight(scene, cx - 3, cz - 2, 0xffe4b5, 1.0);
  addCeilingLight(scene, cx + 3, cz + 2, 0xffe4b5, 1.0);
  addSign(scene, cx, WALL_H - 0.4, cz - 5, 0xf59e0b);
  addPainting(scene, cx - 5, 2.0, cz, Math.PI / 2, 0x3b82f6);
  addPainting(scene, cx + 5, 2.0, cz, -Math.PI / 2, 0xef4444);
  addWallClock(scene, cx, 2.5, cz - 5, 0);
  addCeilingFan(scene, cx, WALL_H - 0.5, cz);
}

export function buildOffice(scene) {
  chairs.length = 0; wallBoxes.length = 0; floors.length = 0;
  loginComputers.length = 0; doors.length = 0; draggableObjects.length = 0;
  reactiveNPCs.length = 0; spawnedObjects.length = 0;
  interactiveObjects.length = 0; ambientNPCs.length = 0; animatedObjects.length = 0;

  const MIN_X = -30, MAX_X = 30, MIN_Z = -30, MAX_Z = 30;
  addFloor(scene, 0, 0, MAX_X - MIN_X, MAX_Z - MIN_Z, matFloor);

  addWallX(scene, 0, MIN_Z, MAX_X - MIN_X);
  addWallX(scene, 0, MAX_Z, MAX_X - MIN_X);
  addWallZ(scene, MIN_X, 0, MAX_Z - MIN_Z);
  addWallZ(scene, MAX_X, 0, MAX_Z - MIN_Z);

  buildMeetingRoom(scene, 0, 0);

  addWallX(scene, -19, -14, 14, true);
  addWallX(scene, 0, -14, 14, true);
  addWallX(scene, 19, -14, 14, true);
  addWallZ(scene, -9.5, -22, 16);
  addWallZ(scene, 9.5, -22, 16);
  addWindowX(scene, -19, MIN_Z, 14);
  addWindowX(scene, 0, MIN_Z, 14);
  addWindowX(scene, 19, MIN_Z, 14);
  buildDepartment(scene, -19, -22, 0x38bdf8, "Отдел 1");
  buildDepartment(scene, 0, -22, 0xfacc15, "Отдел 2");
  buildDepartment(scene, 19, -22, 0x34d399, "Отдел 3");

  addWallX(scene, -19, 14, 14, true);
  addWallX(scene, -1, 14, 14, true);
  addWallX(scene, 20, 14, 16, true);
  addWallZ(scene, -9.5, 22, 16);
  addWallZ(scene, 9.5, 22, 16);
  addWindowX(scene, -19, MAX_Z, 14);
  addWindowX(scene, -1, MAX_Z, 14);
  addWindowX(scene, 20, MAX_Z, 16);
  buildDepartment(scene, -19, 22, 0xf87171, "Отдел 4");
  buildDepartment(scene, -1, 22, 0xa78bfa, "Отдел 5");
  buildBossOffice(scene, 20, 22);

  addCarpet(scene, 0, -10, 50, 6, 0x2b3543);
  addCarpet(scene, 0, 10, 50, 6, 0x2b3543);
  addCarpet(scene, -18, 0, 22, 6, 0x2b3543);
  addCarpet(scene, 18, 0, 22, 6, 0x2b3543);

  for (let x = -25; x <= 25; x += 10) {
    addCeilingLight(scene, x, -10, 0xfff7ed, 1.0);
    addCeilingLight(scene, x, 10, 0xfff7ed, 1.0);
  }
  for (let z = -5; z <= 5; z += 10) {
    addCeilingLight(scene, -18, z, 0xfff7ed, 1.0);
    addCeilingLight(scene, 18, z, 0xfff7ed, 1.0);
  }

  addPlant(scene, -27, -27); addPlant(scene, 27, -27);
  addPlant(scene, -27, 27); addPlant(scene, 27, 27);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(MAX_X - MIN_X, MAX_Z - MIN_Z),
    new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.95, side: THREE.DoubleSide })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, WALL_H, 0);
  ceiling.receiveShadow = true;
  scene.add(ceiling);
  
  addWaterCooler(scene, -15, -10);
  addWaterCooler(scene, 15, 10);
  addVendingMachine(scene, -28, -15, Math.PI / 2);
  addVendingMachine(scene, 28, 15, -Math.PI / 2);
  addNoticeBoard(scene, -10, 2.0, -13.8, 0);
  addNoticeBoard(scene, 10, 2.0, 13.8, Math.PI);
  
  addReactiveNPC(scene, -5, -5, 'cat', 0.7);
  addReactiveNPC(scene, 8, 3, 'cat', 0.7);
  addReactiveNPC(scene, -15, 15, 'cat', 0.7);
  addReactiveNPC(scene, 12, -18, 'dog', 0.8);
  addReactiveNPC(scene, 0, 5, 'parrot', 0.6);
  
  addAmbientNPC(scene, -10, -8, 'it', '/models/character-d.glb');
  addAmbientNPC(scene, 10, 8, 'cleaner', '/models/character-e.glb');
  addAmbientNPC(scene, 0, -15, 'courier', '/models/character-f.glb');
  addAmbientNPC(scene, -20, 5, 'secretary', '/models/character-g.glb');
  addAmbientNPC(scene, 15, -5, 'it', '/models/character-h.glb');
}

export function collides(x, z, feetY, radius, height) {
  const headY = feetY + height;
  const minX = x - radius, maxX = x + radius;
  const minZ = z - radius, maxZ = z + radius;
  for (const b of wallBoxes) {
    if (headY <= b.minY || feetY >= b.maxY) continue;
    if (maxX <= b.minX || minX >= b.maxX) continue;
    if (maxZ <= b.minZ || minZ >= b.maxZ) continue;
    return true;
  }
  for (const d of doors) {
    if (d.isOpen) continue;
    if (headY <= 0 || feetY >= DOOR_H) continue;
    const cos = Math.cos(d.rotY), sin = Math.sin(d.rotY);
    const dx = DOOR_W * cos, dz = DOOR_W * sin;
    const dMinX = Math.min(d.x, d.x + dx) - 0.1;
    const dMaxX = Math.max(d.x, d.x + dx) + 0.1;
    const dMinZ = Math.min(d.z, d.z + dz) - 0.1;
    const dMaxZ = Math.max(d.z, d.z + dz) + 0.1;
    if (maxX <= dMinX || minX >= dMaxX) continue;
    if (maxZ <= dMinZ || minZ >= dMaxZ) continue;
    return true;
  }
  return false;
}

export function floorAt(x, z, feetY = 0) {
  let best = 0;
  for (const f of floors) {
    if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
    if (f.y <= feetY + 0.05 && f.y > best) best = f.y;
  }
  return best;
}

export const ROOMS = {
  frontend:  { x: -19, z: -22 },
  analytics: { x: 0, z: -22 },
  backend:   { x: 19, z: -22 },
  devops:    { x: -19, z: 22 },
  qa:        { x: -1, z: 22 },
  boss:      { x: 20, z: 22 },
  lobby:     { x: 0, z: 0 },
};

export function roomDoorZ(r) { return r.z + (r.z < 0 ? 6 : -6); }
export function roomLeadPos(r) { return { x: r.x, z: r.z - 1.6 }; }