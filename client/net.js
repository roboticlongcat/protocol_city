import * as THREE from "three";
import { scene, applyPlayerTransforms } from "./scene.js";
import { state, send } from "./state.js";
import { API, WS, STAND_EYE } from "./config.js";
import { createNameSprite, setLocalPlayerName, syncLocalName } from "./sprites.js";
import { buildGameEntities } from "./world.js";
import { log, setStatus, updateDeptPanel, updateTaskPanel, hideOverlay } from "./ui.js";
import { showDeptChooser } from "./departments.js";
import { openActivity } from "./activities.js";
import { npcLogLine } from "./npc-chat.js";
import { renderProjectPanel, renderProjectOverlay } from "./project.js";
import { connectPeer, disconnectPeer, handleSignal } from "./voice.js";
import { floorAt } from "./office.js";
import { ROOMS } from "./office.js";

export function teleportToRoom(slug, fallbackPos) {
  const room = ROOMS[slug];
  if (room) {
    state.player.x = room.x;
    state.player.z = room.z + (room.z < 0 ? 6 : -6);
  } else if (fallbackPos) {
    state.player.x = fallbackPos.x;
    state.player.z = fallbackPos.z;
  }
  state.player.y = floorAt(state.player.x, state.player.z, 0);
  state.player.vy = 0;
  state.player.onGround = true;
  state.player.seated = false;
  state.player.seatChair = null;
  state.player.eyeHeight = STAND_EYE;
  applyPlayerTransforms();
  syncLocalName();
}

export function addOtherPlayer(d) {
  if (state.otherPlayers.has(d.id)) return;
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 1.0, 4, 12),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b })
  );
  mesh.position.set(d.position.x, (d.position.y || 0) + 0.9, d.position.z);
  scene.add(mesh);
  const nameSprite = createNameSprite(d.username || "Игрок", "#fbbf24");
  nameSprite.position.set(d.position.x, (d.position.y || 0) + 2.3, d.position.z);
  scene.add(nameSprite);
  state.otherPlayers.set(d.id, { mesh, nameSprite, username: d.username });
}

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
    state.currentUsername = username;
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

export function startGame(token) {
  document.getElementById("overlay").hidden = true;
  document.getElementById("hud").hidden = false;
  log("Кликните по экрану, чтобы захватить мышь");
  state.socket = new WebSocket(`${WS}?token=${token}`);
  state.socket.onopen = () => log("Соединение с сервером установлено");
  state.socket.onclose = (e) => log(`Соединение закрыто (код ${e.code})`);
  state.socket.onerror = () => log("Ошибка соединения: сервер недоступен или сертификат не принят");
  state.socket.onmessage = (ev) => {
    try { handleMessage(JSON.parse(ev.data)); } catch (e) { console.error("Bad message", e); }
  };
}

export function handleMessage(msg) {
  if (msg.type === "welcome") {
    state.selfId = msg.selfId;
    state.currentUsername = msg.username || state.currentUsername;
    state.departments = msg.departments || [];
    state.npcs = msg.npcs || [];
    state.playerDepartment = msg.playerDepartment || null;
    state.activeTask = msg.activeTask || null;
    state.points = msg.flags?.points || 0;
    state.project = msg.project || null;
    renderProjectPanel();

    if (state.playerDepartment) teleportToRoom(state.playerDepartment.slug);
    else {
      state.player.x = msg.position.x; state.player.z = msg.position.z;
      state.player.y = floorAt(state.player.x, state.player.z, 0);
      applyPlayerTransforms(); syncLocalName();
    }
    setLocalPlayerName(state.currentUsername);
    buildGameEntities();
    for (const p of msg.otherPlayers || []) addOtherPlayer(p);
    updateDeptPanel(); updateTaskPanel();
    log(`Добро пожаловать в офис, ${state.currentUsername}`);
    if (!state.playerDepartment) showDeptChooser();
  }

  if (msg.type === "team_project_updated") {
    state.project = msg.project || null;
    renderProjectPanel();
    if (!document.getElementById("project-overlay").hidden) renderProjectOverlay();
  }
  if (msg.type === "departments_updated") {
    state.departments = msg.departments || [];
    buildGameEntities();
    if (!state.playerDepartment) showDeptChooser();
  }
  if (msg.type === "department_selected") {
    state.playerDepartment = msg.department;
    state.activeTask = null;
    teleportToRoom(msg.department.slug, msg.position);
    buildGameEntities();
    hideOverlay(document.getElementById("dept-overlay"));
    updateDeptPanel(); updateTaskPanel();
    log(`Ты в отделе: ${msg.department.name}`);
  }
  if (msg.type === "department_selection_failed") {
    log(msg.message);
    const s = document.getElementById("dept-status");
    if (s) s.textContent = msg.message;
    showDeptChooser();
  }
  if (msg.type === "task_assigned") {
    state.activeTask = msg.task;
    updateTaskPanel();
    log(`PM назначил задачу: ${msg.task.title}`);
  }
  if (msg.type === "task_completed") {
    log(`Задача "${msg.taskTitle}" сдана! +${msg.pointsEarned} очков (всего ${msg.totalPoints})`);
    state.activeTask = null; state.points = msg.totalPoints;
    updateTaskPanel(); updateDeptPanel();
  }
  if (msg.type === "activity_start") openActivity(msg);
  if (msg.type === "activity_result") {
    document.getElementById("act-status").textContent = msg.message;
    if (msg.ok) {
      setTimeout(() => hideOverlay(document.getElementById("activity-overlay")), 900);
      state.activeTask = null; state.points = msg.totalPoints;
      updateTaskPanel(); updateDeptPanel();
    }
  }
  if (msg.type === "npc_reply") npcLogLine(msg.name, msg.text, "#93c5fd");
  if (msg.type === "game_event") log(msg.message);

  if (msg.type === "player_joined") {
    addOtherPlayer(msg);
    log(`Игрок ${msg.username} подключился`);
    if (state.voiceStarted) connectPeer(state.selfId, msg.id);
  }
  if (msg.type === "player_moved") {
    const p = state.otherPlayers.get(msg.id);
    if (p) {
      p.mesh.position.set(msg.position.x, msg.position.y + 0.9, msg.position.z);
      p.mesh.rotation.y = msg.rotationY || 0;
      if (p.nameSprite) p.nameSprite.position.set(msg.position.x, msg.position.y + 2.3, msg.position.z);
    }
  }
  if (msg.type === "player_left") {
    const p = state.otherPlayers.get(msg.id);
    if (p) {
      scene.remove(p.mesh);
      if (p.nameSprite) scene.remove(p.nameSprite);
      state.otherPlayers.delete(msg.id);
      if (state.voiceStarted) disconnectPeer(msg.id);
    }
  }
  if (msg.type === "rtc_signal") handleSignal(msg.from, msg.data);
}