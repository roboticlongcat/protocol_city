import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import {
  buildOffice,
  collides,
  chairs,
  floorAt,
  loginComputers,
  ROOMS,
  roomDoorZ,
  roomLeadPos,
} from "./office.js";

const USE_TLS = true;
const SERVER_HOST = location.hostname || "localhost";
const API = `${USE_TLS ? "https" : "http"}://${SERVER_HOST}:8080`;
const WS = `${USE_TLS ? "wss" : "ws"}://${SERVER_HOST}:8080`;

let socket = null;
let selfId = null;
let currentUsername = "";

// --- игровое состояние (с сервера) ---
let departments = [];
let npcs = [];
let playerDepartment = null;
let activeTask = null;
let points = 0;

// --- мини-игры ---
let currentActivity = null;
let actState = null;

// --- реестры объектов ---
const otherPlayers = new Map(); // id -> { mesh, nameSprite, username }
const npcMeshes = [];
const interactables = [];       // loginComputers + игровые стенды
const keys = {};

// --- физика игрока ---
const GRAVITY = 20;
const JUMP_V = 6.5;
const MOVE_SPEED = 4.0;
const STAND_EYE = 1.7;
const SIT_EYE = 1.2;
const PLAYER_RADIUS = 0.4;
const PLAYER_HEIGHT = 1.7;
const INTERACT_DIST = 3.2;   // расстояние до стенда/стола для E
const NPC_DIST = 3.0;        // расстояние до NPC для N

const player = {
  x: 0, y: 0, z: 8, vy: 0,
  onGround: true, seated: false, seatChair: null,
  eyeHeight: STAND_EYE,
};

// ============================================================
// СЦЕНА
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.Fog(0x05070d, 60, 140);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(player.x, player.y + player.eyeHeight, player.z);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);
scene.add(new THREE.AmbientLight(0xffffff, 0.65));
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

// группы игровых сущностей (пересобираются без удаления офиса)
const deptGroup = new THREE.Group();
const objectGroup = new THREE.Group();
const npcGroup = new THREE.Group();
scene.add(deptGroup, objectGroup, npcGroup);

// ============================================================
// НИКИ
// ============================================================
function createNameSprite(name, color = "#22d3ee") {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 512; canvas.height = 128;
  ctx.font = "bold 64px system-ui, sans-serif";
  const tw = ctx.measureText(name).width;
  const pad = 30, bw = tw + pad * 2, bx = (canvas.width - bw) / 2;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath(); ctx.roundRect(bx, 20, bw, 88, 16); ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(name, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(2.5, 0.625, 1);
  sprite.center.set(0.5, 0);
  return sprite;
}

let localNameSprite = null;
function setLocalPlayerName(name) {
  if (localNameSprite) scene.remove(localNameSprite);
  localNameSprite = createNameSprite(name, "#22d3ee");
  scene.add(localNameSprite);
  syncLocalName();
}
function syncLocalName() {
  if (localNameSprite) localNameSprite.position.set(player.x, player.y + 2.3, player.z);
}

// ============================================================
// HUD / ОВЕРЛЕИ
// ============================================================
const crosshair = document.createElement("div");
crosshair.style.cssText =
  "position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;" +
  "border-radius:50%;background:#fff;pointer-events:none;z-index:10;" +
  "box-shadow:0 0 4px #000,0 0 2px #000;";
document.body.appendChild(crosshair);

const hint = document.createElement("div");
hint.style.cssText =
  "position:fixed;left:50%;top:56%;transform:translateX(-50%);" +
  "color:#fff;font:14px system-ui,sans-serif;background:rgba(0,0,0,.65);" +
  "padding:6px 12px;border-radius:8px;pointer-events:none;z-index:10;display:none;";
document.body.appendChild(hint);

function log(text) {
  const el = document.getElementById("log");
  if (!el) return;
  const item = document.createElement("div");
  item.textContent = text;
  el.prepend(item);
}
function setStatus(t) { const e = document.getElementById("status"); if (e) e.textContent = t; }

function updateDeptPanel() {
  const el = document.getElementById("dept-panel");
  const name = playerDepartment ? playerDepartment.name : "без отдела";
  el.textContent = `Отдел: ${name} | Очки: ${points}`;
}
function updateTaskPanel() {
  const el = document.getElementById("task-panel");
  if (!activeTask) {
    el.textContent = "Нет активной задачи. Подойди к столу PM (кабинет начальника) и нажми E.";
    return;
  }
  el.innerHTML =
    `<b>Задача: ${activeTask.title}</b><br>` +
    `${activeTask.description || ""}<br>` +
    `Сложность: ${activeTask.difficulty} | Награда: ${activeTask.reward_points}`;
}

// все DOM-оверлеи, которые блокируют игру/мышь
function overlayEls() {
  return [
    document.getElementById("overlay"),
    document.getElementById("dept-overlay"),
    document.getElementById("activity-overlay"),
    document.getElementById("npc-overlay"),
  ];
}
function anyOverlayOpen() {
  if (pcScreen.style.display === "flex") return true;
  return overlayEls().some((e) => e && !e.hidden);
}
function showOverlay(el) {
  el.hidden = false;
  try { controls.unlock(); } catch {}
  crosshair.style.display = "none";
  hint.style.display = "none";
}
function hideOverlay(el) {
  el.hidden = true;
  if (!anyOverlayOpen()) {
    crosshair.style.display = "block";
    try { controls.lock(); } catch {} // если без жеста не залочится — игрок кликнет
  }
}

// ============================================================
// КОМПЬЮТЕР (анимация приближения) — из ветки, с правками
// ============================================================
const pcScreen = document.createElement("div");
pcScreen.style.cssText =
  "position:fixed;top:0;left:0;width:100vw;height:100vh;background:#0f172a;z-index:100;" +
  "display:none;flex-direction:column;font-family:system-ui,sans-serif;" +
  "transform-origin:center center;transform:scale(0.01);opacity:0;" +
  "transition:transform .45s cubic-bezier(.22,1,.36,1),opacity .3s ease;";
const pcHeader = document.createElement("div");
pcHeader.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:15px 25px;background:#1e293b;";
const pcUserInfo = document.createElement("div");
pcUserInfo.style.cssText = "color:#94a3b8;font-size:14px;";
pcHeader.appendChild(pcUserInfo);
const closePcBtn = document.createElement("button");
closePcBtn.textContent = "✕ Закрыть (Esc)";
closePcBtn.style.cssText = "background:#ef4444;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;width:auto;margin:0;";
closePcBtn.onclick = closeComputer;
pcHeader.appendChild(closePcBtn);
pcScreen.appendChild(pcHeader);

const pcDesktopView = document.createElement("div");
pcDesktopView.style.cssText = "flex:1;padding:40px;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:30px;align-content:start;";
[
  { name: "Почта", icon: "📧" },
  { name: "Файлы", icon: "📁" },
  { name: "Терминал", icon: "💻" },
  { name: "Настройки", icon: "⚙️" },
  { name: "Браузер", icon: "🌐" },
  { name: "Калькулятор", icon: "🧮" },
].forEach((app) => {
  const d = document.createElement("div");
  d.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;padding:15px;border-radius:8px;transition:background .2s;";
  d.onmouseover = () => (d.style.background = "rgba(255,255,255,0.1)");
  d.onmouseout = () => (d.style.background = "transparent");
  d.innerHTML = `<div style="font-size:48px;">${app.icon}</div><span style="color:#e2e8f0;font-size:14px;text-align:center;">${app.name}</span>`;
  d.onclick = () => log(`[ПК] Запуск: ${app.name}`);
  pcDesktopView.appendChild(d);
});
pcScreen.appendChild(pcDesktopView);
document.body.appendChild(pcScreen);

let currentPcMonitor = null;
function openComputer(monitorMesh) {
  currentPcMonitor = monitorMesh;
  const wp = new THREE.Vector3(); monitorMesh.getWorldPosition(wp);
  const pr = wp.clone().project(camera);
  pcScreen.style.transformOrigin = `${(pr.x * .5 + .5) * innerWidth}px ${(-pr.y * .5 + .5) * innerHeight}px`;
  pcScreen.style.display = "flex";
  pcScreen.style.transform = "scale(0.01)";
  pcScreen.style.opacity = "0";
  pcUserInfo.textContent = `👤 ${currentUsername} | Рабочая станция`;
  try { controls.unlock(); } catch {}
  document.getElementById("hud").style.display = "none";
  crosshair.style.display = "none";
  hint.style.display = "none";
  requestAnimationFrame(() => { pcScreen.style.transform = "scale(1)"; pcScreen.style.opacity = "1"; });
}
function closeComputer() {
  if (currentPcMonitor) {
    const wp = new THREE.Vector3(); currentPcMonitor.getWorldPosition(wp);
    const pr = wp.clone().project(camera);
    pcScreen.style.transformOrigin = `${(pr.x * .5 + .5) * innerWidth}px ${(-pr.y * .5 + .5) * innerHeight}px`;
  }
  pcScreen.style.transform = "scale(0.01)";
  pcScreen.style.opacity = "0";
  setTimeout(() => {
    pcScreen.style.display = "none";
    document.getElementById("hud").style.display = "block";
    currentPcMonitor = null;
    if (!anyOverlayOpen()) { crosshair.style.display = "block"; try { controls.lock(); } catch {} }
  }, 450);
}

// ============================================================
// ПОСТРОЕНИЕ ИГРОВЫХ СУЩНОСТЕЙ ПО ДАННЫМ СЕРВЕРА
// ============================================================
function makeLabel(text, scale = [9, 2.2]) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 40px system-ui, sans-serif";
  ctx.fillStyle = "white";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
  sprite.scale.set(scale[0], scale[1], 1);
  return sprite;
}

function addGameBox(id, color, x, z, labelText, group = objectGroup) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.2, 1.2),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 })
  );
  mesh.position.set(x, 1.1, z);
  mesh.userData.interactableId = id;
  group.add(mesh);
  interactables.push(mesh);
  if (labelText) {
    const lbl = makeLabel(labelText);
    lbl.position.set(x, 2.9, z);
    group.add(lbl);
  }
  return mesh;
}

function buildGameEntities() {
  deptGroup.clear();
  objectGroup.clear();
  npcGroup.clear();
  interactables.length = 0;
  npcMeshes.length = 0;

  // компьютеры офиса — статичны, но перепушиваем ссылки (меши те же, без утечки)
  interactables.push(...loginComputers);

  // отделы: диск зоны + стенд входа
  for (const d of departments) {
    const room = ROOMS[d.slug];
    if (!room) { log(`Нет комнаты для отдела ${d.slug}`); continue; }

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6, 0.2, 48),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(d.color), transparent: true, opacity: 0.22 })
    );
    disc.position.set(room.x, 0.06, room.z);
    deptGroup.add(disc);

    const dz = roomDoorZ(room);
    const isMine = playerDepartment && playerDepartment.id === d.id;
    addGameBox(
      `dept_sign_${d.id}`,
      new THREE.Color(d.color).getHex(),
      room.x, dz,
      isMine ? "Твой отдел" : `${d.name} (${d.current_players}/${d.max_players}) — E`
    );
  }

  // стол PM в кабинете начальника
  const boss = ROOMS.boss;
  addGameBox("pm_desk", 0xeab308, boss.x, roomDoorZ(boss), "Стол PM: взять задачу (E)");

  // рабочее место для мини-игры в переговорной
  addGameBox("work_terminal", 0x22d3ee, ROOMS.lobby.x, 4, "Рабочая консоль: мини-игра (E)");

  // NPC
  for (const npc of npcs) {
    let pos;
    if (npc.department_id) {
      const d = departments.find((x) => x.id === npc.department_id);
      const room = d && ROOMS[d.slug];
      if (!room) continue;
      pos = roomLeadPos(room);
    } else {
      pos = { x: boss.x, z: boss.z + 1.3 }; // Анна за своим столом
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
    npcMeshes.push(mesh);

    const lbl = makeLabel(npc.name, [10, 2.5]);
    lbl.position.set(pos.x, 2.5, pos.z);
    npcGroup.add(lbl);
  }
}

// ============================================================
// СЕТЬ
// ============================================================
async function auth(path) {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ошибка авторизации");
    localStorage.setItem("token", data.token);
    currentUsername = username;
    setStatus("Успешно");
    startGame(data.token);
  } catch (e) {
    setStatus(e instanceof TypeError
      ? `Не могу достучаться до сервера. Открой ${API}/api/health и прими сертификат.`
      : e.message);
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
  socket.onclose = (e) => log(`Соединение закрыто (код ${e.code})`);
  socket.onerror = () => log("Ошибка соединения: сервер недоступен или сертификат не принят");
  socket.onmessage = (ev) => {
    try { handleMessage(JSON.parse(ev.data)); } catch (e) { console.error("Bad message", e); }
  };
}

function teleportToRoom(slug, fallbackPos) {
  const room = ROOMS[slug];
  if (room) {
    player.x = room.x;
    player.z = room.z + (room.z < 0 ? 6 : -6); // у двери внутри комнаты
  } else if (fallbackPos) {
    player.x = fallbackPos.x;
    player.z = fallbackPos.z;
  }
  player.y = floorAt(player.x, player.z, 0);
  player.vy = 0;
  player.onGround = true;
  player.seated = false;
  player.seatChair = null;
  player.eyeHeight = STAND_EYE;
  applyPlayerTransforms();
}

function applyPlayerTransforms() {
  playerBody.position.set(player.x, 0, player.z);
  localPlayer.position.set(player.x, player.y + 0.9, player.z);
  camera.position.set(player.x, player.y + player.eyeHeight, player.z);
  syncLocalName();
}

function handleMessage(msg) {
  if (msg.type === "welcome") {
    selfId = msg.selfId;
    currentUsername = msg.username || currentUsername;
    departments = msg.departments || [];
    npcs = msg.npcs || [];
    playerDepartment = msg.playerDepartment || null;
    activeTask = msg.activeTask || null;
    points = msg.flags?.points || 0;

    if (playerDepartment) teleportToRoom(playerDepartment.slug);
    else { player.x = msg.position.x; player.z = msg.position.z; player.y = floorAt(player.x, player.z, 0); applyPlayerTransforms(); }

    setLocalPlayerName(currentUsername);
    buildGameEntities();
    for (const p of msg.otherPlayers || []) addOtherPlayer(p);
    updateDeptPanel();
    updateTaskPanel();
    log(`Добро пожаловать в офис, ${currentUsername}`);
    if (!playerDepartment) showDeptChooser();
  }

  if (msg.type === "departments_updated") {
    departments = msg.departments || [];
    buildGameEntities();
    if (!playerDepartment) showDeptChooser();
  }

  if (msg.type === "department_selected") {
    playerDepartment = msg.department;
    activeTask = null;
    teleportToRoom(msg.department.slug, msg.position);
    buildGameEntities();
    hideOverlay(document.getElementById("dept-overlay"));
    updateDeptPanel();
    updateTaskPanel();
    log(`Ты в отделе: ${msg.department.name}`);
  }

  if (msg.type === "department_selection_failed") {
    log(msg.message);
    const s = document.getElementById("dept-status");
    if (s) s.textContent = msg.message;
    showDeptChooser();
  }

  if (msg.type === "task_assigned") {
    activeTask = msg.task;
    updateTaskPanel();
    log(`PM назначил задачу: ${msg.task.title}`);
  }

  if (msg.type === "task_completed") {
    log(`Задача "${msg.taskTitle}" сдана! +${msg.pointsEarned} очков (всего ${msg.totalPoints})`);
    activeTask = null;
    points = msg.totalPoints;
    updateTaskPanel(); updateDeptPanel();
  }

  if (msg.type === "activity_start") openActivity(msg);
  if (msg.type === "activity_result") {
    document.getElementById("act-status").textContent = msg.message;
    if (msg.ok) {
      setTimeout(() => hideOverlay(document.getElementById("activity-overlay")), 900);
      activeTask = null;
      points = msg.totalPoints;
      updateTaskPanel(); updateDeptPanel();
    }
  }

  if (msg.type === "npc_reply") npcLogLine(msg.name, msg.text, "#93c5fd");
  if (msg.type === "game_event") log(msg.message);

  if (msg.type === "player_joined") { addOtherPlayer(msg); log(`Игрок ${msg.username} подключился`); }
  if (msg.type === "player_moved") {
    const p = otherPlayers.get(msg.id);
    if (p) {
      p.mesh.position.set(msg.position.x, msg.position.y + 0.9, msg.position.z);
      p.mesh.rotation.y = msg.rotationY || 0;
      if (p.nameSprite) p.nameSprite.position.set(msg.position.x, msg.position.y + 2.3, msg.position.z);
    }
  }
  if (msg.type === "player_left") {
    const p = otherPlayers.get(msg.id);
    if (p) { scene.remove(p.mesh); if (p.nameSprite) scene.remove(p.nameSprite); otherPlayers.delete(msg.id); }
  }
}

function addOtherPlayer(d) {
  if (otherPlayers.has(d.id)) return;
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 1.0, 4, 12),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b })
  );
  mesh.position.set(d.position.x, (d.position.y || 0) + 0.9, d.position.z);
  scene.add(mesh);
  const nameSprite = createNameSprite(d.username || "Игрок", "#fbbf24");
  nameSprite.position.set(d.position.x, (d.position.y || 0) + 2.3, d.position.z);
  scene.add(nameSprite);
  otherPlayers.set(d.id, { mesh, nameSprite, username: d.username });
}

// ============================================================
// ВЫБОР ОТДЕЛА
// ============================================================
function showDeptChooser() {
  const list = document.getElementById("dept-list");
  list.innerHTML = "";
  for (const d of departments) {
    const btn = document.createElement("button");
    const full = d.current_players >= d.max_players;
    btn.textContent = `${d.name} — ${d.current_players}/${d.max_players}`;
    btn.disabled = full;
    btn.style.background = d.color;
    btn.onclick = () => socket?.send(JSON.stringify({ type: "select_department", departmentId: d.id }));
    list.appendChild(btn);
  }
  showOverlay(document.getElementById("dept-overlay"));
}
document.getElementById("dept-close").onclick = () => hideOverlay(document.getElementById("dept-overlay"));

// ============================================================
// МИНИ-ИГРЫ
// ============================================================
function openActivity(msg) {
  currentActivity = msg;
  const body = document.getElementById("act-body");
  document.getElementById("act-status").textContent = "";
  document.getElementById("act-title").textContent = msg.taskTitle;
  body.innerHTML = "";

  if (msg.kind === "quiz") {
    actState = { answer: null };
    const q = document.createElement("p"); q.textContent = msg.data.question; body.appendChild(q);
    msg.data.options.forEach((opt, i) => {
      const b = document.createElement("div"); b.className = "act-item"; b.textContent = opt;
      b.onclick = () => { body.querySelectorAll(".act-item").forEach((e) => e.classList.remove("selected")); b.classList.add("selected"); actState.answer = i; };
      body.appendChild(b);
    });
  }

  if (msg.kind === "blocks") {
    actState = { order: [] };
    const p = document.createElement("p"); p.textContent = msg.data.prompt + " (кликай блоки по порядку)"; body.appendChild(p);
    const list = document.createElement("div"); body.appendChild(list);
    msg.data.items.forEach((item) => {
      const el = document.createElement("div"); el.className = "act-item"; el.textContent = item;
      el.onclick = () => { if (el.classList.contains("selected")) return; el.classList.add("selected"); el.textContent = `${actState.order.length + 1}. ${item}`; actState.order.push(item); };
      list.appendChild(el);
    });
  }

  if (msg.kind === "sorting") {
    actState = { selected: null };
    const p = document.createElement("p"); p.textContent = msg.data.prompt + " (кликни предмет, затем корзину)"; body.appendChild(p);
    const pool = document.createElement("div"); body.appendChild(pool);
    const all = msg.data.buckets.flatMap((b) => b.items);
    [...all].sort(() => Math.random() - 0.5).forEach((item) => {
      const el = document.createElement("div"); el.className = "act-item"; el.textContent = item;
      el.onclick = () => { pool.querySelectorAll(".act-item").forEach((x) => x.classList.remove("selected")); el.classList.add("selected"); actState.selected = item; };
      pool.appendChild(el);
    });
    msg.data.buckets.forEach((bucket) => {
      const zone = document.createElement("div"); zone.className = "bucket"; zone.innerHTML = `<b>${bucket.name}</b>`;
      zone.onclick = () => {
        if (!actState.selected) return;
        const chip = document.createElement("div"); chip.className = "act-item"; chip.style.cursor = "default"; chip.textContent = actState.selected;
        zone.appendChild(chip);
        const src = [...pool.querySelectorAll(".act-item")].find((x) => x.textContent === actState.selected);
        if (src) src.remove();
        actState.selected = null;
      };
      body.appendChild(zone);
    });
  }

  showOverlay(document.getElementById("activity-overlay"));
}

function collectAnswer() {
  if (!currentActivity) return null;
  if (currentActivity.kind === "quiz") return actState.answer;
  if (currentActivity.kind === "blocks") return actState.order;
  if (currentActivity.kind === "sorting") {
    const buckets = [];
    document.querySelectorAll("#act-body .bucket").forEach((z) => {
      buckets.push({ bucket: z.querySelector("b").textContent, items: [...z.querySelectorAll(".act-item")].map((e) => e.textContent) });
    });
    return buckets;
  }
  return null;
}
document.getElementById("act-submit").onclick = () => {
  if (!currentActivity) return;
  socket?.send(JSON.stringify({ type: "submit_activity", instanceId: currentActivity.instanceId, answer: collectAnswer() }));
};
document.getElementById("act-cancel").onclick = () => hideOverlay(document.getElementById("activity-overlay"));

// ============================================================
// ДИАЛОГ С NPC
// ============================================================
let talkingNpc = null;
function npcLogLine(who, text, color = "#e5e7eb") {
  const box = document.getElementById("npc-log");
  const line = document.createElement("div");
  line.style.marginBottom = "6px";
  line.innerHTML = `<span style="color:${color};font-weight:600">${who}:</span> ${text}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}
function openNpc(npc) {
  talkingNpc = npc;
  document.getElementById("npc-name").textContent = npc.name;
  document.getElementById("npc-log").innerHTML = "";
  document.getElementById("npc-input").value = "";
  showOverlay(document.getElementById("npc-overlay"));
  setTimeout(() => document.getElementById("npc-input").focus(), 50);
}
function sendNpc() {
  const input = document.getElementById("npc-input");
  const message = input.value.trim();
  if (!message || !talkingNpc) return;
  npcLogLine("Вы", message, "#fbbf24");
  socket?.send(JSON.stringify({ type: "npc_ask", npcId: talkingNpc.id, message }));
  input.value = "";
}
document.getElementById("npc-send").onclick = sendNpc;
document.getElementById("npc-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.stopPropagation(); sendNpc(); } });
document.getElementById("npc-close").onclick = () => hideOverlay(document.getElementById("npc-overlay"));

// ============================================================
// ВЗАИМОДЕЙСТВИЕ (рейкаст по взгляду + дистанция до стендов)
// ============================================================
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

function findComputerUnderCrosshair(maxDist = 3.5, maxAngleDeg = 60) {
  let best = null, bestDist = maxDist;
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const flat = dir.clone(); flat.y = 0; flat.normalize();
  for (const obj of interactables) {
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

function findNearestGameInteractable() {
  let best = null, bestD = INTERACT_DIST;
  for (const obj of interactables) {
    const id = obj.userData.interactableId;
    if (!id || id === "login_computer") continue;
    const wp = new THREE.Vector3(); obj.getWorldPosition(wp);
    const d = playerBody.position.distanceTo(wp);
    if (d < bestD) { best = obj; bestD = d; }
  }
  return best;
}

function interactLabel(id) {
  if (id === "pm_desk") return "E — взять задачу у PM";
  if (id === "work_terminal") return "E — открыть мини-игру";
  if (id.startsWith("dept_sign_")) return "E — перейти в отдел";
  return "E — взаимодействие";
}

function tryInteract() {
  if (!socket || socket.readyState !== 1) return;
  const best = findNearestGameInteractable();
  if (!best) { log("Подойдите ближе к стенду / столу PM / консоли."); return; }
  const id = best.userData.interactableId;

  if (id === "work_terminal") { socket.send(JSON.stringify({ type: "start_activity" })); return; }

  if (id.startsWith("dept_sign_")) {
    const deptId = Number(id.replace("dept_sign_", ""));
    if (playerDepartment && playerDepartment.id === deptId) { log("Ты уже в этом отделе."); return; }
    socket.send(JSON.stringify({ type: "select_department", departmentId: deptId }));
    return;
  }

  socket.send(JSON.stringify({ type: "interact", objectId: id })); // pm_desk
}

function tryTalkNPC() {
  if (!socket || socket.readyState !== 1) return;
  let best = null, bestD = NPC_DIST;
  for (const m of npcMeshes) {
    const d = playerBody.position.distanceTo(m.position);
    if (d < bestD) { best = m; bestD = d; }
  }
  if (!best) { log("Подойдите ближе к NPC."); return; }
  openNpc(best.userData.npc);
}

function toggleSit() {
  if (player.seated) {
    player.seated = false; player.seatChair = null; player.eyeHeight = STAND_EYE;
    player.y = floorAt(player.x, player.z, player.y); player.vy = 0; player.onGround = true;
    return;
  }
  const chair = findChairUnderCrosshair();
  if (!chair) return;
  player.seated = true; player.seatChair = chair;
  player.x = chair.x; player.z = chair.z; player.y = chair.floorY;
  player.vy = 0; player.onGround = true; player.eyeHeight = SIT_EYE;
  camera.position.set(player.x, chair.seatY, player.z);
}

// ============================================================
// ВВОД
// ============================================================
window.addEventListener("keydown", (event) => {
  if (pcScreen.style.display === "flex" && pcScreen.style.opacity === "1") {
    if (event.code === "Escape") closeComputer();
    return;
  }
  // оверлеи: Esc закрывает, Enter в npc-поле отправляет
  const npcOv = document.getElementById("npc-overlay");
  if (!npcOv.hidden) {
    if (event.code === "Escape") hideOverlay(npcOv);
    return;
  }
  const actOv = document.getElementById("activity-overlay");
  if (!actOv.hidden) { if (event.code === "Escape") hideOverlay(actOv); return; }
  const deptOv = document.getElementById("dept-overlay");
  if (!deptOv.hidden) { if (event.code === "Escape") hideOverlay(deptOv); return; }

  if (event.code === "Space") event.preventDefault();
  keys[event.code] = true;
  if (!controls.isLocked) return;
  if (event.code === "KeyE") {
    if (player.seated) {
      const comp = findComputerUnderCrosshair();
      if (comp) openComputer(comp); else toggleSit();
    } else {
      if (findChairUnderCrosshair()) toggleSit(); else tryInteract();
    }
  }
  if (event.code === "KeyN") tryTalkNPC();
});
window.addEventListener("keyup", (e) => { keys[e.code] = false; });

document.addEventListener("click", () => {
  if (controls.isLocked || anyOverlayOpen()) return;
  if (document.getElementById("overlay").hidden) { try { controls.lock(); } catch {} }
});

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ============================================================
// ДВИЖЕНИЕ + ПОДСКАЗКИ
// ============================================================
function updateMovement(delta) {
  if (anyOverlayOpen()) return; // блокировка движения и автозакрытия ПК

  if (pcScreen.style.display === "flex" && currentPcMonitor) {
    const wp = new THREE.Vector3(); currentPcMonitor.getWorldPosition(wp);
    if (playerBody.position.distanceTo(wp) > 4.0) { closeComputer(); return; }
  }

  // подсказки
  if (controls.isLocked) {
    if (player.seated) {
      const comp = findComputerUnderCrosshair();
      hint.textContent = comp ? "E — использовать компьютер" : "E — встать";
      hint.style.display = "block";
    } else {
      const chair = findChairUnderCrosshair();
      const comp = findComputerUnderCrosshair();
      const gi = findNearestGameInteractable();
      let nearNpc = npcMeshes.some((m) => playerBody.position.distanceTo(m.position) < NPC_DIST);
      if (chair) { hint.textContent = "E — сесть"; hint.style.display = "block"; }
      else if (comp) { hint.textContent = "E — использовать компьютер"; hint.style.display = "block"; }
      else if (gi) { hint.textContent = interactLabel(gi.userData.interactableId); hint.style.display = "block"; }
      else if (nearNpc) { hint.textContent = "N — спросить NPC"; hint.style.display = "block"; }
      else hint.style.display = "none";
    }
  } else hint.style.display = "none";

  if (player.seated && player.seatChair) {
    const c = player.seatChair;
    camera.position.set(c.x, c.seatY, c.z);
    player.x = c.x; player.z = c.z; player.y = c.floorY;
    if (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD) {
      player.seated = false; player.seatChair = null; player.eyeHeight = STAND_EYE;
      player.y = floorAt(player.x, player.z, player.y);
    }
    playerBody.position.set(player.x, 0, player.z);
    localPlayer.position.set(player.x, player.y + 0.9, player.z);
    syncLocalName();
    return;
  }

  if (keys.Space && player.onGround) { player.vy = JUMP_V; player.onGround = false; }

  const forward = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const move = new THREE.Vector3().addScaledVector(dir, forward).addScaledVector(right, strafe);
  if (move.lengthSq() > 0) move.normalize().multiplyScalar(MOVE_SPEED * delta);

  const nx = player.x + move.x, nz = player.z + move.z;
  if (!collides(nx, player.z, player.y, PLAYER_RADIUS, PLAYER_HEIGHT)) player.x = nx;
  if (!collides(player.x, nz, player.y, PLAYER_RADIUS, PLAYER_HEIGHT)) player.z = nz;

  player.vy -= GRAVITY * delta;
  player.y += player.vy * delta;
  const g = floorAt(player.x, player.z, player.y);
  if (g > player.y && g - player.y < 0.6 && player.vy <= 0.01) { player.y = g; player.vy = 0; player.onGround = true; }
  else if (player.y <= g) { player.y = g; player.vy = 0; player.onGround = true; }
  else player.onGround = false;

  applyPlayerTransforms();
  localPlayer.rotation.y = camera.rotation.y;
}

setInterval(() => {
  if (!socket || socket.readyState !== 1 || anyOverlayOpen()) return;
  socket.send(JSON.stringify({
    type: "move",
    position: { x: player.x, y: player.y, z: player.z },
    rotationY: camera.rotation.y,
  }));
}, 100);

let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  updateMovement(delta);
  renderer.render(scene, camera);
}
animate();