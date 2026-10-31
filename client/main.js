import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { cacheNearby } from "./cache.js";
import {
  buildOffice,
  collides,
  chairs,
  floorAt,
  loginComputers,
} from "./office.js";

const USE_TLS = true;
const SERVER_HOST = location.hostname || "localhost";
const API = `${USE_TLS ? "https" : "http"}://${SERVER_HOST}:8080`;
const WS = `${USE_TLS ? "wss" : "ws"}://${SERVER_HOST}:8080`;

let socket = null;
let selfId = null;
let currentUsername = ""; // <-- Ник текущего игрока

let zones = [];
let npcs = [];
let missions = [];

let otherPlayers = new Map(); // id -> { mesh, nameSprite, username }
let packets = new Map();
let npcMeshes = [];
let interactables = [];

const keys = {};

// --- Физика игрока ---
const GRAVITY = 20;
const JUMP_V = 6.5;
const MOVE_SPEED = 4.0;
const STAND_EYE = 1.7;
const SIT_EYE = 1.2;
const PLAYER_RADIUS = 0.4;
const PLAYER_HEIGHT = 1.7;

const player = {
  x: 0,
  y: 0,
  z: 20,
  vy: 0,
  onGround: true,
  seated: false,
  seatChair: null,
  eyeHeight: STAND_EYE,
};

// --- Сцена ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.Fog(0x05070d, 60, 140);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(player.x, player.y + player.eyeHeight, player.z);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(30, 60, 20);
sun.castShadow = true;
scene.add(sun);

buildOffice(scene);

const playerBody = new THREE.Object3D();
playerBody.position.set(player.x, 0, player.z);
scene.add(playerBody);

const localPlayer = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.4, 1.0, 4, 12),
  new THREE.MeshStandardMaterial({ color: 0x22d3ee })
);
localPlayer.position.set(player.x, player.y + 0.9, player.z);
scene.add(localPlayer);

// ============================================================
// --- НИК НАД ЛОКАЛЬНЫМ ИГРОКОМ ---
// ============================================================
function createNameSprite(name, color = "#22d3ee") {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 512;
  canvas.height = 128;

  ctx.font = "bold 64px system-ui, sans-serif";
  const textWidth = ctx.measureText(name).width;

  // Фон-плашка
  const padding = 30;
  const bgWidth = textWidth + padding * 2;
  const bgX = (canvas.width - bgWidth) / 2;
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.beginPath();
  ctx.roundRect(bgX, 20, bgWidth, 88, 16);
  ctx.fill();

  // Текст
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.5, 0.625, 1);
  sprite.center.set(0.5, 0);
  return sprite;
}

let localNameSprite = null;

function setLocalPlayerName(name) {
  if (localNameSprite) scene.remove(localNameSprite);
  localNameSprite = createNameSprite(name, "#22d3ee");
  localNameSprite.position.set(player.x, player.y + 2.3, player.z);
  scene.add(localNameSprite);
}

const zoneGroup = new THREE.Group();
scene.add(zoneGroup);

// --- HUD ---
const crosshair = document.createElement("div");
crosshair.id = "crosshair";
crosshair.style.cssText =
  "position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;" +
  "border-radius:50%;background:#fff;pointer-events:none;z-index:10;" +
  "box-shadow:0 0 4px #000,0 0 2px #000;";
document.body.appendChild(crosshair);

const hint = document.createElement("div");
hint.id = "hint";
hint.style.cssText =
  "position:fixed;left:50%;top:56%;transform:translateX(-50%);" +
  "color:#fff;font:14px system-ui,sans-serif;background:rgba(0,0,0,.65);" +
  "padding:6px 12px;border-radius:8px;pointer-events:none;z-index:10;display:none;";
document.body.appendChild(hint);

// ============================================================
// --- ИНТЕРФЕЙС КОМПЬЮТЕРА (С АНИМАЦИЕЙ ПРИБЛИЖЕНИЯ) ---
// ============================================================
const pcScreen = document.createElement("div");
pcScreen.id = "computer-screen";
pcScreen.style.cssText =
  "position:fixed;top:0;left:0;width:100vw;height:100vh;background:#0f172a;z-index:100;" +
  "display:none;flex-direction:column;font-family:system-ui,sans-serif;" +
  "transform-origin:center center;transform:scale(0.01);opacity:0;" +
  "transition:transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease;";

const pcHeader = document.createElement("div");
pcHeader.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:15px 25px;background:#1e293b;";

const pcUserInfo = document.createElement("div");
pcUserInfo.style.cssText = "color:#94a3b8;font-size:14px;";
pcHeader.appendChild(pcUserInfo);

const closePcBtn = document.createElement("button");
closePcBtn.textContent = "✕ Закрыть (Esc)";
closePcBtn.style.cssText = "background:#ef4444;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;";
closePcBtn.onclick = closeComputer;
pcHeader.appendChild(closePcBtn);
pcScreen.appendChild(pcHeader);

// Рабочий стол ПК
const pcDesktopView = document.createElement("div");
pcDesktopView.style.cssText = "flex:1;padding:40px;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:30px;align-content:start;";

const apps = [
  { name: "Почта", icon: "📧" },
  { name: "Файлы", icon: "📁" },
  { name: "Терминал", icon: "💻" },
  { name: "Настройки", icon: "⚙️" },
  { name: "Браузер", icon: "🌐" },
  { name: "Калькулятор", icon: "🧮" },
];

apps.forEach(app => {
  const appDiv = document.createElement("div");
  appDiv.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;padding:15px;border-radius:8px;transition:background 0.2s;";
  appDiv.onmouseover = () => appDiv.style.background = "rgba(255,255,255,0.1)";
  appDiv.onmouseout = () => appDiv.style.background = "transparent";
  appDiv.innerHTML = `<div style="font-size:48px;">${app.icon}</div><span style="color:#e2e8f0;font-size:14px;text-align:center;">${app.name}</span>`;
  appDiv.onclick = () => log(`[ПК] Запуск: ${app.name}`);
  pcDesktopView.appendChild(appDiv);
});
pcScreen.appendChild(pcDesktopView);
document.body.appendChild(pcScreen);

// --- Функции открытия/закрытия ПК с анимацией ---
let currentPcMonitor = null; // монитор, с которого открыли ПК

function openComputer(monitorMesh) {
  currentPcMonitor = monitorMesh;
  
  // Вычисляем позицию монитора на экране (для transform-origin)
  const worldPos = new THREE.Vector3();
  monitorMesh.getWorldPosition(worldPos);
  const projected = worldPos.clone().project(camera);
  const screenX = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const screenY = (-projected.y * 0.5 + 0.5) * window.innerHeight;
  
  // Устанавливаем точку роста анимации — в центр монитора
  pcScreen.style.transformOrigin = `${screenX}px ${screenY}px`;
  
  // Показываем в начальном состоянии (маленький, прозрачный)
  pcScreen.style.display = "flex";
  pcScreen.style.transform = "scale(0.01)";
  pcScreen.style.opacity = "0";
  
  // Обновляем имя пользователя
  pcUserInfo.textContent = `👤 ${currentUsername} | Рабочая станция`;
  
  // Освобождаем мышь
  controls.unlock();
  document.getElementById("hud").style.display = "none";
  crosshair.style.display = "none";
  
  // На следующем кадре запускаем анимацию приближения
  requestAnimationFrame(() => {
    pcScreen.style.transform = "scale(1)";
    pcScreen.style.opacity = "1";
  });
}

function closeComputer() {
  // Анимация "отлёта" обратно в монитор
  if (currentPcMonitor) {
    const worldPos = new THREE.Vector3();
    currentPcMonitor.getWorldPosition(worldPos);
    const projected = worldPos.clone().project(camera);
    const screenX = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-projected.y * 0.5 + 0.5) * window.innerHeight;
    pcScreen.style.transformOrigin = `${screenX}px ${screenY}px`;
  }
  
  pcScreen.style.transform = "scale(0.01)";
  pcScreen.style.opacity = "0";
  
  // После окончания анимации — скрываем и возвращаем управление
  setTimeout(() => {
    pcScreen.style.display = "none";
    document.getElementById("hud").style.display = "block";
    crosshair.style.display = "block";
    currentPcMonitor = null;
    
    // Автоматически захватываем мышь обратно
    controls.lock();
  }, 450);
}

// --- Утилиты ---
function log(text) {
  const logEl = document.getElementById("log");
  if (!logEl) return;
  const item = document.createElement("div");
  item.textContent = text;
  logEl.prepend(item);
}

function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

// --- Авторизация ---
async function auth(path) {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  try {
    const response = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Ошибка авторизации");

    localStorage.setItem("token", data.token);
    currentUsername = username; // <-- Сохраняем ник
    setStatus("Успешно");
    startGame(data.token);
  } catch (error) {
    setStatus(error.message);
  }
}

document.getElementById("login-btn").onclick = () => auth("/api/login");
document.getElementById("register-btn").onclick = () => auth("/api/register");

function startGame(token) {
  document.getElementById("overlay").hidden = true;
  document.getElementById("hud").hidden = false;

  log("Кликните по экрану, чтобы захватить мышь");

  socket = new WebSocket(`${WS}?token=${token}`);
  socket.onopen = () => log("Соединение с сервером установлено");
  socket.onclose = () => log("Соединение с сервером закрыто");
  socket.onmessage = (event) => {
    try { handleMessage(JSON.parse(event.data)); }
    catch (e) { console.error("Bad message", e); }
  };
}

function handleMessage(msg) {
  if (msg.type === "welcome") {
    selfId = msg.selfId;
    currentUsername = msg.username || currentUsername; // <-- Сервер тоже может прислать ник
    zones = msg.zones || [];
    npcs = msg.npcs || [];
    missions = msg.missions || [];

    player.x = msg.position.x;
    player.z = msg.position.z;
    player.y = floorAt(player.x, player.z, 0);
    player.vy = 0;
    player.onGround = true;

    playerBody.position.set(player.x, 0, player.z);
    localPlayer.position.set(player.x, player.y + 0.9, player.z);
    camera.position.set(player.x, player.y + player.eyeHeight, player.z);

    // Ник над локальным игроком
    setLocalPlayerName(currentUsername);

    for (const p of msg.otherPlayers || []) addOtherPlayer(p);

    createInteractables();

    log(`Добро пожаловать в Протокол-Сити, ${currentUsername}`);

    const activeMission = missions.find((m) => !m.completed);
    if (activeMission) log(`Активная миссия: ${activeMission.title}`);

    setTimeout(() => cacheNearby(zones, playerBody.position), 1000);
  }

  if (msg.type === "player_joined") {
    addOtherPlayer(msg);
    log(`Игрок ${msg.username} подключился`);
  }

  if (msg.type === "player_moved") {
    const p = otherPlayers.get(msg.id);
    if (p) {
      p.mesh.position.set(msg.position.x, msg.position.y + 0.9, msg.position.z);
      p.mesh.rotation.y = msg.rotationY || 0;
      // Обновляем позицию ника
      if (p.nameSprite) {
        p.nameSprite.position.set(msg.position.x, msg.position.y + 2.3, msg.position.z);
      }
    }
  }

  if (msg.type === "player_left") {
    const p = otherPlayers.get(msg.id);
    if (p) {
      scene.remove(p.mesh);
      if (p.nameSprite) scene.remove(p.nameSprite);
      otherPlayers.delete(msg.id);
    }
  }

  if (msg.type === "game_event") log(msg.message);
  if (msg.type === "packet_spawn") spawnPacket(msg.packet, msg.route);
  if (msg.type === "request_result") log(`Статус ${msg.status}: ${msg.message}`);
  if (msg.type === "npc_reply") log(`[${msg.name}] ${msg.text}`);
}

// --- Другие игроки (с никами) ---
function addOtherPlayer(playerData) {
  if (otherPlayers.has(playerData.id)) return;

  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 1.0, 4, 12),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b })
  );
  mesh.position.set(playerData.position.x, 0.9, playerData.position.z);
  scene.add(mesh);

  // Ник над другим игроком
  const nameSprite = createNameSprite(playerData.username || "Игрок", "#fbbf24");
  nameSprite.position.set(playerData.position.x, playerData.position.y + 2.3, playerData.position.z);
  scene.add(nameSprite);

  otherPlayers.set(playerData.id, { mesh, nameSprite, username: playerData.username });
}

// --- Терминалы и компьютеры ---
function createInteractables() {
  for (const m of interactables) scene.remove(m);
  interactables = [];

  addInteractable("browser_terminal", 0x38bdf8, 0, 6);
  addInteractable("auth_terminal", 0xf87171, 46, 2);
  
  interactables.push(...loginComputers);
}

function addInteractable(id, color, x, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 2.6, 1.6),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.position.set(x, 1.3, z);
  mesh.userData.interactableId = id;
  scene.add(mesh);
  interactables.push(mesh);
}

// --- Пакеты ---
function spawnPacket(packet, route) {
  const points = route
    .map((slug) => zones.find((z) => z.slug === slug))
    .filter(Boolean)
    .map((z) => new THREE.Vector3(z.x, 1.5, z.z));

  if (points.length < 2) return;

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 14, 14),
    new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x22c55e })
  );
  mesh.position.copy(points[0]);
  scene.add(mesh);

  packets.set(packet.id, { mesh, points, t: 0, packet });
  log(`Пакет: ${packet.method} ${packet.path}`);
}

function updatePackets() {
  for (const [id, packet] of packets.entries()) {
    packet.t += 0.008;
    const totalSegments = packet.points.length - 1;
    if (totalSegments <= 0 || packet.t >= 1) {
      scene.remove(packet.mesh);
      packets.delete(id);
      continue;
    }
    const segmentIndex = Math.min(Math.floor(packet.t * totalSegments), totalSegments - 1);
    const localT = packet.t * totalSegments - segmentIndex;
    const from = packet.points[segmentIndex];
    const to = packet.points[Math.min(segmentIndex + 1, packet.points.length - 1)];
    packet.mesh.position.lerpVectors(from, to, localT);
  }
}

// --- Взаимодействие ---
function tryInteract() {
  let best = null;
  let bestDistance = 3.5;

  for (const obj of interactables) {
    const worldPos = new THREE.Vector3();
    obj.getWorldPosition(worldPos);
    const d = playerBody.position.distanceTo(worldPos);
    if (d < bestDistance) {
      best = obj;
      bestDistance = d;
    }
  }

  if (!best) return;

  // --- КОМПЬЮТЕР: открываем с анимацией ---
  if (best.userData.interactableId === "login_computer") {
    openComputer(best);
    return;
  }

  // --- Терминалы ---
  if (!socket || socket.readyState !== 1) return;
  socket.send(JSON.stringify({ type: "interact", objectId: best.userData.interactableId }));
}

function tryTalkNPC() {
  if (!socket || socket.readyState !== 1) return;
  let best = null;
  let bestDistance = 7;

  for (const mesh of npcMeshes) {
    const d = playerBody.position.distanceTo(mesh.position);
    if (d < bestDistance) {
      best = mesh;
      bestDistance = d;
    }
  }

  if (!best) {
    log("Рядом нет НПС");
    return;
  }

  const npc = best.userData.npc;
  const message = prompt(`Спросить ${npc.name}:`, "Что такое HTTP?");
  if (!message) return;

  socket.send(JSON.stringify({ type: "npc_ask", npcId: npc.id, message }));
}

// --- Рейкаст на стулья ---
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

function findChairUnderCrosshair(maxDist = 3.5) {
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
// --- Поиск компьютера, на который смотрит игрок ---
function findComputerUnderCrosshair(maxDist = 3.5, maxAngleDeg = 60) {
  let best = null;
  let bestDist = maxDist;

  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const flatCamDir = camDir.clone();
  flatCamDir.y = 0;
  flatCamDir.normalize();

  for (const obj of interactables) {
    if (obj.userData.interactableId !== "login_computer") continue;

    const worldPos = new THREE.Vector3();
    obj.getWorldPosition(worldPos);

    const toObj = worldPos.clone().sub(playerBody.position);
    toObj.y = 0;
    const dist = toObj.length();
    if (dist > bestDist) continue;

    toObj.normalize();
    const dot = Math.max(-1, Math.min(1, flatCamDir.dot(toObj)));
    const angle = Math.acos(dot) * 180 / Math.PI;

    if (angle < maxAngleDeg) {
      best = obj;
      bestDist = dist;
    }
  }
  return best;
}
function toggleSit() {
  if (player.seated) {
    player.seated = false;
    player.seatChair = null;
    player.eyeHeight = STAND_EYE;
    player.y = floorAt(player.x, player.z, player.y);
    player.vy = 0;
    player.onGround = true;
    return;
  }

  const chair = findChairUnderCrosshair();
  if (!chair) return;

  player.seated = true;
  player.seatChair = chair;
  player.x = chair.x;
  player.z = chair.z;
  player.y = chair.floorY;
  player.vy = 0;
  player.onGround = true;
  player.eyeHeight = SIT_EYE;

  camera.position.set(player.x, chair.seatY, player.z);
}

// --- Ввод ---
window.addEventListener("keydown", (event) => {
  // Если открыт монитор ПК — обрабатываем только Escape
  if (pcScreen.style.display === "flex" && pcScreen.style.opacity === "1") {
    if (event.code === "Escape") {
      closeComputer();
    }
    return;
  }

  if (event.code === "Space") event.preventDefault();
  keys[event.code] = true;

  if (!controls.isLocked) return;

  if (event.code === "KeyE") {
    if (player.seated) {
      // Сидя на стуле: если смотрим на комп — открываем, иначе — встаём
      const computer = findComputerUnderCrosshair();
      if (computer) {
        openComputer(computer);
      } else {
        toggleSit();
      }
    } else {
      // Стоя: если смотрим на стул — садимся, иначе — взаимодействуем
      if (findChairUnderCrosshair()) toggleSit();
      else tryInteract();
    }
  }
  if (event.code === "KeyN") tryTalkNPC();
});

window.addEventListener("keyup", (event) => {
  keys[event.code] = false;
});

document.addEventListener("click", () => {
  const overlay = document.getElementById("overlay");
  if (overlay && !overlay.hidden && !controls.isLocked) controls.lock();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Движение ---
function updateMovement(delta) {
    // --- Автозакрытие монитора, если игрок отошёл далеко ---
  if (pcScreen.style.display === "flex" && pcScreen.style.opacity === "1" && currentPcMonitor) {
    const worldPos = new THREE.Vector3();
    currentPcMonitor.getWorldPosition(worldPos);
    const d = playerBody.position.distanceTo(worldPos);
    if (d > 4.0) {
      closeComputer();
      return; // блокируем движение на этот кадр
    }
  }
  // Блокируем движение, если открыт монитор ПК
  if (pcScreen.style.display === "flex") return;

  // --- Подсказка ---
  // --- Подсказки ---
  if (controls.isLocked) {
    if (player.seated) {
      // Сидя: проверяем, смотрим ли на компьютер
      const computer = findComputerUnderCrosshair();
      if (computer) {
        hint.textContent = "E — использовать компьютер";
        hint.style.display = "block";
      } else {
        hint.textContent = "E — встать";
        hint.style.display = "block";
      }
    } else {
      // Стоя: стул или компьютер
      const chair = findChairUnderCrosshair();
      const computer = findComputerUnderCrosshair();

      if (chair) {
        hint.textContent = "E — сесть";
        hint.style.display = "block";
      } else if (computer) {
        hint.textContent = "E — использовать компьютер";
        hint.style.display = "block";
      } else {
        hint.style.display = "none";
      }
    }
  } else {
    hint.style.display = "none";
  }

  // --- Сидячий режим ---
  if (player.seated && player.seatChair) {
    const c = player.seatChair;
    camera.position.set(c.x, c.seatY, c.z);
    player.x = c.x;
    player.z = c.z;
    player.y = c.floorY;

    if (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD) {
      player.seated = false;
      player.seatChair = null;
      player.eyeHeight = STAND_EYE;
      player.y = floorAt(player.x, player.z, player.y);
    }

    playerBody.position.set(player.x, 0, player.z);
    localPlayer.position.set(player.x, player.y + 0.9, player.z);
    // Обновляем позицию ника локального игрока
    if (localNameSprite) localNameSprite.position.set(player.x, player.y + 2.3, player.z);
    return;
  }

  // --- Прыжок ---
  if (keys.Space && player.onGround) {
    player.vy = JUMP_V;
    player.onGround = false;
  }

  // --- Горизонтальное движение ---
  const forward = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();

  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

  const move = new THREE.Vector3();
  move.addScaledVector(dir, forward);
  move.addScaledVector(right, strafe);

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(MOVE_SPEED * delta);
  }

  const feetY = player.y;
  const nextX = player.x + move.x;
  const nextZ = player.z + move.z;

  if (!collides(nextX, player.z, feetY, PLAYER_RADIUS, PLAYER_HEIGHT)) player.x = nextX;
  if (!collides(player.x, nextZ, feetY, PLAYER_RADIUS, PLAYER_HEIGHT)) player.z = nextZ;

  // --- Вертикальная физика ---
  player.vy -= GRAVITY * delta;
  player.y += player.vy * delta;

  const groundY = floorAt(player.x, player.z, feetY);

  if (groundY > player.y && groundY - player.y < 0.6 && player.vy <= 0.01) {
    player.y = groundY;
    player.vy = 0;
    player.onGround = true;
  } else if (player.y <= groundY) {
    player.y = groundY;
    player.vy = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  // --- Камера и маркер ---
  camera.position.set(player.x, player.y + player.eyeHeight, player.z);
  playerBody.position.set(player.x, 0, player.z);
  localPlayer.position.set(player.x, player.y + 0.9, player.z);
  localPlayer.rotation.y = camera.rotation.y;
  
  // Обновляем позицию ника локального игрока
  if (localNameSprite) {
    localNameSprite.position.set(player.x, player.y + 2.3, player.z);
  }
}

// --- Отправка позиции ---
setInterval(() => {
  if (!socket || socket.readyState !== 1 || pcScreen.style.display === "flex") return;
  socket.send(
    JSON.stringify({
      type: "move",
      position: { x: player.x, y: player.y, z: player.z },
      rotationY: camera.rotation.y,
    })
  );
}, 100);

// --- Анимация ---
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const delta = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  updateMovement(delta);
  updatePackets();

  renderer.render(scene, camera);
}

animate();