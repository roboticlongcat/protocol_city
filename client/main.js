import * as THREE from "three";
import { cacheNearby } from "./cache.js";

const USE_TLS = true;

const SERVER_HOST = location.hostname || "localhost";
const API = `${USE_TLS ? "https" : "http"}://${SERVER_HOST}:8080`;
const WS = `${USE_TLS ? "wss" : "ws"}://${SERVER_HOST}:8080`;

let socket = null;
let selfId = null;

let zones = [];
let npcs = [];
let missions = [];

let otherPlayers = new Map();
let packets = new Map();
let npcMeshes = [];
let interactables = [];

const keys = {};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.Fog(0x05070d, 80, 220);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(320, 320),
  new THREE.MeshStandardMaterial({ color: 0x0f172a })
);

ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const grid = new THREE.GridHelper(320, 64, 0x334155, 0x111827);
scene.add(grid);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(30, 60, 20);
scene.add(sun);

const localPlayer = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.6, 1.2, 4, 12),
  new THREE.MeshStandardMaterial({ color: 0x22d3ee })
);

localPlayer.position.set(0, 1.2, 12);
scene.add(localPlayer);

camera.position.set(0, 18, 32);
camera.lookAt(localPlayer.position);

const zoneGroup = new THREE.Group();
scene.add(zoneGroup);

function log(text) {
  const logEl = document.getElementById("log");

  if (!logEl) return;

  const item = document.createElement("div");
  item.textContent = text;

  logEl.prepend(item);
}

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

async function auth(path) {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  try {
    const response = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Ошибка авторизации");
    }

    localStorage.setItem("token", data.token);

    setStatus("Успешно");
    startGame(data.token);
  } catch (error) {
    setStatus(error.message);
  }
}

document.getElementById("login-btn").onclick = () => auth("/api/login");
document.getElementById("register-btn").onclick = () =>
  auth("/api/register");

function startGame(token) {
  document.getElementById("overlay").hidden = true;
  document.getElementById("hud").hidden = false;

  socket = new WebSocket(`${WS}?token=${token}`);

  socket.onopen = () => {
    log("Соединение с сервером установлено");
  };

  socket.onclose = () => {
    log("Соединение с сервером закрыто");
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg);
  };
}

function handleMessage(msg) {
  if (msg.type === "welcome") {
    selfId = msg.selfId;
    zones = msg.zones || [];
    npcs = msg.npcs || [];
    missions = msg.missions || [];

    localPlayer.position.set(
      msg.position.x,
      msg.position.y + 1.2,
      msg.position.z
    );

    renderZones();
    renderNPCs();
    createInteractables();

    for (const player of msg.otherPlayers) {
      addOtherPlayer(player);
    }

    log(`Добро пожаловать в Протокол-Сити, ${msg.username}`);

    const activeMission = missions.find((m) => !m.completed);

    if (activeMission) {
      log(`Активная миссия: ${activeMission.title}`);
    }

    setTimeout(() => {
      cacheNearby(zones, localPlayer.position);
    }, 1000);
  }

  if (msg.type === "player_joined") {
    addOtherPlayer(msg);
    log(`Игрок ${msg.username} подключился`);
  }

  if (msg.type === "player_moved") {
    const player = otherPlayers.get(msg.id);

    if (player) {
      player.position.set(
        msg.position.x,
        msg.position.y + 1.2,
        msg.position.z
      );

      player.rotation.y = msg.rotationY || 0;
    }
  }

  if (msg.type === "player_left") {
    const player = otherPlayers.get(msg.id);

    if (player) {
      scene.remove(player);
      otherPlayers.delete(msg.id);
    }
  }

  if (msg.type === "game_event") {
    log(msg.message);
  }

  if (msg.type === "packet_spawn") {
    spawnPacket(msg.packet, msg.route);
  }

  if (msg.type === "request_result") {
    log(`Статус ${msg.status}: ${msg.message}`);
  }

  if (msg.type === "npc_reply") {
    log(`[${msg.name}] ${msg.text}`);
  }
}

function addOtherPlayer(playerData) {
  if (otherPlayers.has(playerData.id)) return;

  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.6, 1.2, 4, 12),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b })
  );

  mesh.position.set(
    playerData.position.x,
    playerData.position.y + 1.2,
    playerData.position.z
  );

  scene.add(mesh);
  otherPlayers.set(playerData.id, mesh);
}

function renderZones() {
  zoneGroup.clear();

  for (const zone of zones) {
    const zoneMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(zone.radius, zone.radius, 0.25, 48),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(zone.color),
        transparent: true,
        opacity: 0.35,
      })
    );

    zoneMesh.position.set(zone.x, 0.13, zone.z);
    zoneGroup.add(zoneMesh);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 14, 8),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(zone.color),
        transparent: true,
        opacity: 0.25,
      })
    );

    beacon.position.set(zone.x, 7, zone.z);
    zoneGroup.add(beacon);
  }
}

function renderNPCs() {
  for (const npc of npcs) {
    const zone = zones.find((z) => z.id === npc.zone_id);

    if (!zone) continue;

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );

    mesh.position.set(zone.x, 1.4, zone.z + 2);
    mesh.userData.npc = npc;

    scene.add(mesh);
    npcMeshes.push(mesh);
  }
}

function createInteractables() {
  addInteractable("browser_terminal", 0x38bdf8, 0, 6);
  addInteractable("auth_terminal", 0xf87171, 46, 2);
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

function spawnPacket(packet, route) {
  const points = route
    .map((slug) => zones.find((zone) => zone.slug === slug))
    .filter(Boolean)
    .map((zone) => new THREE.Vector3(zone.x, 1.5, zone.z));

  if (points.length < 2) return;

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 14, 14),
    new THREE.MeshStandardMaterial({
      color: 0x4ade80,
      emissive: 0x22c55e,
    })
  );

  mesh.position.copy(points[0]);
  scene.add(mesh);

  packets.set(packet.id, {
    mesh,
    points,
    t: 0,
    packet,
  });

  log(`Пакет: ${packet.method} ${packet.path}`);
}

function updatePackets() {
  for (const [id, packet] of packets.entries()) {
    packet.t += 0.008;

    const totalSegments = packet.points.length - 1;

    if (totalSegments <= 0) {
      scene.remove(packet.mesh);
      packets.delete(id);
      continue;
    }

    if (packet.t >= 1) {
      scene.remove(packet.mesh);
      packets.delete(id);
      continue;
    }

    const segmentIndex = Math.min(
      Math.floor(packet.t * totalSegments),
      totalSegments - 1
    );

    const localT = packet.t * totalSegments - segmentIndex;

    const from = packet.points[segmentIndex];
    const to = packet.points[Math.min(segmentIndex + 1, packet.points.length - 1)];

    packet.mesh.position.lerpVectors(from, to, localT);
  }
}

function tryInteract() {
  if (!socket || socket.readyState !== 1) return;

  let best = null;
  let bestDistance = 5;

  for (const object of interactables) {
    const distance = localPlayer.position.distanceTo(object.position);

    if (distance < bestDistance) {
      best = object;
      bestDistance = distance;
    }
  }

  if (best) {
    socket.send(
      JSON.stringify({
        type: "interact",
        objectId: best.userData.interactableId,
      })
    );
  }
}

function tryTalkNPC() {
  if (!socket || socket.readyState !== 1) return;

  let best = null;
  let bestDistance = 7;

  for (const mesh of npcMeshes) {
    const distance = localPlayer.position.distanceTo(mesh.position);

    if (distance < bestDistance) {
      best = mesh;
      bestDistance = distance;
    }
  }

  if (!best) {
    log("Рядом нет НПС");
    return;
  }

  const npc = best.userData.npc;

  const message = prompt(`Спросить ${npc.name}:`, "Что такое HTTP?");

  if (!message) return;

  socket.send(
    JSON.stringify({
      type: "npc_ask",
      npcId: npc.id,
      message,
    })
  );
}

window.addEventListener("keydown", (event) => {
  keys[event.code] = true;

  if (event.code === "KeyE") {
    tryInteract();
  }

  if (event.code === "KeyN") {
    tryTalkNPC();
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.code] = false;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function updateMovement() {
  const speed = 0.22;

  if (keys.KeyW) localPlayer.position.z -= speed;
  if (keys.KeyS) localPlayer.position.z += speed;
  if (keys.KeyA) localPlayer.position.x -= speed;
  if (keys.KeyD) localPlayer.position.x += speed;
}

setInterval(() => {
  if (!socket || socket.readyState !== 1) return;

  socket.send(
    JSON.stringify({
      type: "move",
      position: {
        x: localPlayer.position.x,
        y: 0,
        z: localPlayer.position.z,
      },
      rotationY: localPlayer.rotation.y,
    })
  );
}, 100);

function animate() {
  requestAnimationFrame(animate);

  updateMovement();
  updatePackets();

  camera.position.set(
    localPlayer.position.x,
    18,
    localPlayer.position.z + 26
  );

  camera.lookAt(localPlayer.position);

  renderer.render(scene, camera);
}

animate();