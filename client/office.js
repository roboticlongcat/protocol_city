import * as THREE from "three";

// AABB стен для коллизий (с учётом высоты — minY/maxY)
export const wallBoxes = [];

// Полы (для вертикальной физики)
export const floors = [];

// Стулья (заполняется в buildOffice)
export const chairs = [];

// Компьютеры для входа (логин/пароль)
export const loginComputers = [];

// Размеры
const WALL_H = 3.2;
const WALL_T = 0.3;
const DOOR_W = 2.4;
const DOOR_H = 2.4;

// Материалы
const matWall = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.95 });
const matFloor = new THREE.MeshStandardMaterial({ color: 0x9a8b76, roughness: 1 });
const matFloorRoom = new THREE.MeshStandardMaterial({ color: 0xb5a68e, roughness: 1 });
const matDesk = new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.7 });
const matDeskTop = new THREE.MeshStandardMaterial({ color: 0xc9a876, roughness: 0.5 });
const matCarpet = new THREE.MeshStandardMaterial({ color: 0x5b6b7a, roughness: 1 });
const matGlass = new THREE.MeshStandardMaterial({
  color: 0xbfe8ff,
  transparent: true,
  opacity: 0.3,
  roughness: 0.05,
  metalness: 0.1,
});
const matWindowFrame = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
const matChairSeat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.6 });
const matChairLeg = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });
const matCabinet = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.7 });
const matHandle = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.6, roughness: 0.3 });
const matPlantPot = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.9 });
const matPlantLeaf = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
const matMonitor = new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x0ea5e9, emissiveIntensity: 0.6 });

// --- Базовые хелперы ---
function pushBox(minX, maxX, minZ, maxZ, minY = 0, maxY = WALL_H) {
  wallBoxes.push({ minX, maxX, minZ, maxZ, minY, maxY });
}

function addBox(scene, w, h, d, x, y, z, mat, collide = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (collide) {
    pushBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y - h / 2, y + h / 2);
  }
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
}

function addWindowX(scene, x, z, length) {
  const sillH = 1.0;
  const winH = 1.6;
  const topH = WALL_H - sillH - winH;
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
  const fTop = new THREE.Mesh(frameGeo, matWindowFrame);
  fTop.position.set(x, sillH + winH, z);
  scene.add(fTop);
  const fBot = new THREE.Mesh(frameGeo, matWindowFrame);
  fBot.position.set(x, sillH, z);
  scene.add(fBot);

  for (const off of [-winW / 3, 0, winW / 3]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, winH, 0.12), matWindowFrame);
    bar.position.set(x + off, sillH + winH / 2, z);
    scene.add(bar);
  }
}

function addWindowZ(scene, x, z, length) {
  const sillH = 1.0;
  const winH = 1.6;
  const topH = WALL_H - sillH - winH;
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
  const fTop = new THREE.Mesh(frameGeo, matWindowFrame);
  fTop.position.set(x, sillH + winH, z);
  scene.add(fTop);
  const fBot = new THREE.Mesh(frameGeo, matWindowFrame);
  fBot.position.set(x, sillH, z);
  scene.add(fBot);

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

// --- Столы и мебель ---
function addDesk(scene, x, z, rotY = 0) {
  const group = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.9), matDeskTop);
  top.position.y = 0.75;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  const legGeo = new THREE.BoxGeometry(0.1, 0.75, 0.1);
  for (const [lx, lz] of [[-0.9, -0.35], [0.9, -0.35], [-0.9, 0.35], [0.9, 0.35]]) {
    const leg = new THREE.Mesh(legGeo, matDesk);
    leg.position.set(lx, 0.375, lz);
    leg.castShadow = true;
    group.add(leg);
  }

  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.06), matMonitor);
  monitor.position.set(0, 1.1, -0.2);
  group.add(monitor);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), matDesk);
  stand.position.set(0, 0.85, -0.2);
  group.add(stand);

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);

  const cos = Math.abs(Math.cos(rotY));
  const sin = Math.abs(Math.sin(rotY));
  const halfW = 1.0 * cos + 0.45 * sin;
  const halfD = 1.0 * sin + 0.45 * cos;
  pushBox(x - halfW, x + halfW, z - halfD, z + halfD, 0, 0.8);
}

function addRoundTable(scene, x, z, radius = 1.6) {
  const group = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.1, 48), matDeskTop);
  top.position.y = 0.75;
  top.castShadow = true;
  top.receiveShadow = true;
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
  seat.position.y = 0.5;
  seat.castShadow = true;
  group.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.08), matChairSeat);
  back.position.set(0, 0.8, -0.24);
  back.castShadow = true;
  group.add(back);

  const legGeo = new THREE.BoxGeometry(0.06, 0.5, 0.06);
  for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) {
    const leg = new THREE.Mesh(legGeo, matChairLeg);
    leg.position.set(lx, 0.25, lz);
    leg.castShadow = true;
    group.add(leg);
  }

  group.position.set(x, floorY, z);
  group.rotation.y = rotY;
  scene.add(group);

  return { mesh: group, x, z, rotY, floorY, seatY: floorY + 1.2 };
}

// --- Шкаф ---
function addCabinet(scene, x, z, rotY = 0) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.5), matCabinet);
  body.position.y = 1.0;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  for (const dy of [-0.4, 0.4]) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.05), matHandle);
    handle.position.set(0.55, 1.0 + dy, 0.28);
    g.add(handle);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);

  const cos = Math.abs(Math.cos(rotY));
  const sin = Math.abs(Math.sin(rotY));
  const hw = 0.6 * cos + 0.25 * sin;
  const hd = 0.6 * sin + 0.25 * cos;
  pushBox(x - hw, x + hw, z - hd, z + hd, 0, 2.0);
}

// --- Компьютер (доп. монитор, интерактивный для входа) ---
function addComputer(scene, x, z, rotY = 0) {
  const g = new THREE.Group();
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.05), matMonitor);
  monitor.position.set(0, 0.85, 0);
  
  // Помечаем как интерактивный объект для входа
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

// --- Цветок ---
function addPlant(scene, x, z) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.3, 12), matPlantPot);
  pot.position.y = 0.15;
  pot.castShadow = true;
  g.add(pot);
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), matPlantLeaf);
  leaves.position.y = 0.55;
  leaves.scale.set(1, 0.8, 1);
  leaves.castShadow = true;
  g.add(leaves);
  g.position.set(x, 0, z);
  scene.add(g);
  pushBox(x - 0.2, x + 0.2, z - 0.2, z + 0.2, 0, 0.7);
}

// --- Свет и таблички ---
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

// --- Фигура руководителя (человек в костюме, сидящий за столом) ---
function addManagerFigure(scene, x, z, rotY = 0) {
  const group = new THREE.Group();

  // Тело (темный костюм)
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.8, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
  );
  body.position.y = 0.9;
  body.castShadow = true;
  group.add(body);

  // Голова
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xfca5a5, roughness: 0.6 })
  );
  head.position.y = 1.55;
  head.castShadow = true;
  group.add(head);

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
}

// --- Рабочее место руководителя ---
function addManagerDesk(scene, x, z, rotY = 0) {
  addDesk(scene, x, z, rotY);
  addComputer(scene, x - 0.4, z - 0.1, rotY);
  addComputer(scene, x + 0.4, z - 0.1, rotY);
  chairs.push(addChair(scene, x, z + 0.9, rotY + Math.PI));
}

// ============================================================
// ПЕРЕГОВОРНАЯ (стеклянная коробка в центре)
// ============================================================
function buildMeetingRoom(scene, cx, cz) {
  const W = 12, D = 12, H = WALL_H;
  const t = 0.12;
  const doorW = 2.4;

  // Стены (север, запад, восток) — стекло
  const walls = [
    [W, H, t, cx, H / 2, cz - D / 2],
    [t, H, D, cx - W / 2, H / 2, cz],
    [t, H, D, cx + W / 2, H / 2, cz],
  ];
  for (const [w, h, d, x, y, z] of walls) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matGlass);
    m.position.set(x, y, z);
    scene.add(m);
    pushBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0, H);
  }

  // Южная стена с проёмом (вход в коридор)
  const side = (W - doorW) / 2;
  for (const [sx, sw] of [[cx - W / 2 + side / 2, side], [cx + W / 2 - side / 2, side]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sw, H, t), matGlass);
    m.position.set(sx, H / 2, cz + D / 2);
    scene.add(m);
    pushBox(sx - sw / 2, sx + sw / 2, cz + D / 2 - t / 2, cz + D / 2 + t / 2, 0, H);
  }

  // Круглый стол + 8 стульев (развёрнуты лицом к столу: +Math.PI)
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
}

// ============================================================
// ОТДЕЛ (столы, шкафы, компы, цветы и руководитель)
// ============================================================
function buildDepartment(scene, cx, cz, color, label) {
  // Рабочее место руководителя (ближе к центру отдела)
  addManagerDesk(scene, cx, cz - 2.5, 0);
  
  // Фигура руководителя, сидящего за своим столом
  addManagerFigure(scene, cx, cz - 2.5 + 0.9, Math.PI);

  // Столы сотрудников
  const spots = [
    [cx - 3, cz + 1], [cx + 3, cz + 1],
    [cx - 3, cz + 3.5], [cx + 3, cz + 3.5],
  ];
  for (const [sx, sz] of spots) {
    addDesk(scene, sx, sz, 0);
    addComputer(scene, sx, sz - 0.1, 0);
    chairs.push(addChair(scene, sx, sz + 0.9, Math.PI));
    // Шкаф сбоку
    addCabinet(scene, sx + (sx < cx ? -2 : 2), sz, Math.PI / 2);
    // Цветок
    addPlant(scene, sx + (sx < cx ? 1.5 : -1.5), sz + 1.2);
  }

  // Табличка у входа
  addSign(scene, cx, WALL_H - 0.4, cz - 4.5, color);
  // Ковёр
  addCarpet(scene, cx, cz + 1, 8, 6, 0x4a5568);
  // Свет
  addCeilingLight(scene, cx - 3, cz, 0xfef3c7, 1.2);
  addCeilingLight(scene, cx + 3, cz, 0xfef3c7, 1.2);
}

// ============================================================
// КАБИНЕТ НАЧАЛЬНИКА
// ============================================================
function buildBossOffice(scene, cx, cz) {
  // Большой круглый стол
  addRoundTable(scene, cx, cz - 1, 2.0);
  
  // Стулья
  chairs.push(addChair(scene, cx, cz + 1.3, Math.PI));
  chairs.push(addChair(scene, cx - 1.5, cz - 2.5, 0));
  chairs.push(addChair(scene, cx + 1.5, cz - 2.5, 0));
  
  // Начальник сидит за главным стулом (смотрит на стол)
  addManagerFigure(scene, cx, cz + 1.3, Math.PI);

  // Шкафы у стены
  addCabinet(scene, cx - 4, cz - 3, 0);
  addCabinet(scene, cx + 4, cz - 3, 0);
  addCabinet(scene, cx - 4, cz + 2, 0);
  addCabinet(scene, cx + 4, cz + 2, 0);

  // Цветы
  addPlant(scene, cx - 4, cz + 3.5);
  addPlant(scene, cx + 4, cz + 3.5);
  addPlant(scene, cx, cz - 4);

  addCarpet(scene, cx, cz, 10, 8, 0x5a3a2a);
  addCeilingLight(scene, cx, cz, 0xffe4b5, 1.4);
  addCeilingLight(scene, cx - 3, cz - 2, 0xffe4b5, 1.0);
  addCeilingLight(scene, cx + 3, cz + 2, 0xffe4b5, 1.0);
  addSign(scene, cx, WALL_H - 0.4, cz - 5, 0xf59e0b);
}

// ============================================================
// ГЛАВНАЯ СБОРКА
// ============================================================
export function buildOffice(scene) {
  chairs.length = 0;
  wallBoxes.length = 0;
  floors.length = 0;
  loginComputers.length = 0;

  // Внешние размеры «коробки»
  const MIN_X = -30, MAX_X = 30, MIN_Z = -30, MAX_Z = 30;

  addFloor(scene, 0, 0, MAX_X - MIN_X, MAX_Z - MIN_Z, matFloor);

  // --- ВНЕШНИЕ СТЕНЫ ---
  addWallX(scene, 0, MIN_Z, MAX_X - MIN_X);           // север
  addWallX(scene, 0, MAX_Z, MAX_X - MIN_X);           // юг
  addWallZ(scene, MIN_X, 0, MAX_Z - MIN_Z);           // запад
  addWallZ(scene, MAX_X, 0, MAX_Z - MIN_Z);           // восток

  // --- ПЕРЕГОВОРНАЯ В ЦЕНТРЕ ---
  buildMeetingRoom(scene, 0, 0);

  // ============================================================
  // ВЕРХНИЙ РЯД: Отдел1, Отдел2, Отдел3 (Z ≈ -22)
  // ============================================================
  addWallX(scene, -19, -14, 14, true);
  addWallX(scene,   0, -14, 14, true);
  addWallX(scene,  19, -14, 14, true);
  addWallZ(scene, -9.5, -22, 16);
  addWallZ(scene,  9.5, -22, 16);

  addWindowX(scene, -19, MIN_Z, 14);
  addWindowX(scene,   0, MIN_Z, 14);
  addWindowX(scene,  19, MIN_Z, 14);

  buildDepartment(scene, -19, -22, 0x38bdf8, "Отдел 1");
  buildDepartment(scene,   0, -22, 0xfacc15, "Отдел 2");
  buildDepartment(scene,  19, -22, 0x34d399, "Отдел 3");

  // ============================================================
  // НИЖНИЙ РЯД: Отдел4, Отдел5, Каб. начальника (Z ≈ +22)
  // ============================================================
  addWallX(scene, -19, 14, 14, true);
  addWallX(scene,  -1, 14, 14, true);
  addWallX(scene,  20, 14, 16, true);

  addWallZ(scene, -9.5, 22, 16);
  addWallZ(scene,  9.5, 22, 16);

  addWindowX(scene, -19, MAX_Z, 14);
  addWindowX(scene,  -1, MAX_Z, 14);
  addWindowX(scene,  20, MAX_Z, 16);

  buildDepartment(scene, -19, 22, 0xf87171, "Отдел 4");
  buildDepartment(scene,  -1, 22, 0xa78bfa, "Отдел 5");
  buildBossOffice(scene,  20, 22);

  // ============================================================
  // КОРИДОР: кольцо вокруг переговорной
  // ============================================================
  addCarpet(scene, 0, -10, 50, 6, 0x2b3543);
  addCarpet(scene, 0,  10, 50, 6, 0x2b3543);
  addCarpet(scene, -18, 0, 22, 6, 0x2b3543);
  addCarpet(scene,  18, 0, 22, 6, 0x2b3543);

  for (let x = -25; x <= 25; x += 10) {
    addCeilingLight(scene, x, -10, 0xfff7ed, 1.0);
    addCeilingLight(scene, x,  10, 0xfff7ed, 1.0);
  }
  for (let z = -5; z <= 5; z += 10) {
    addCeilingLight(scene, -18, z, 0xfff7ed, 1.0);
    addCeilingLight(scene,  18, z, 0xfff7ed, 1.0);
  }

  // ============================================================
  // ДЕКОР КОРИДОРА: цветы по углам
  // ============================================================
  addPlant(scene, -27, -27);
  addPlant(scene,  27, -27);
  addPlant(scene, -27,  27);
  addPlant(scene,  27,  27);

  // ============================================================
  // ПОТОЛОК
  // ============================================================
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(MAX_X - MIN_X, MAX_Z - MIN_Z),
    new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.95, side: THREE.DoubleSide })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, WALL_H, 0);
  ceiling.receiveShadow = true;
  scene.add(ceiling);
}

// ============================================================
// КОЛЛИЗИИ И ФИЗИКА (экспорт для main.js)
// ============================================================
export function collides(x, z, feetY, radius, height) {
  const headY = feetY + height;
  const minX = x - radius;
  const maxX = x + radius;
  const minZ = z - radius;
  const maxZ = z + radius;

  for (const b of wallBoxes) {
    if (headY <= b.minY || feetY >= b.maxY) continue;
    if (maxX <= b.minX || minX >= b.maxX) continue;
    if (maxZ <= b.minZ || minZ >= b.maxZ) continue;
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