import { controls } from "./scene.js";
import { state } from "./state.js";
import { micOn, deafOn, toggleMic, toggleDeafen } from "./voice.js";

export const crosshair = document.createElement("div");
crosshair.style.cssText =
  "position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;" +
  "border-radius:50%;background:#fff;pointer-events:none;z-index:10;" +
  "box-shadow:0 0 4px #000,0 0 2px #000;";
document.body.appendChild(crosshair);

export const hint = document.createElement("div");
hint.style.cssText =
  "position:fixed;left:50%;top:56%;transform:translateX(-50%);" +
  "color:#fff;font:14px system-ui,sans-serif;background:rgba(0,0,0,.65);" +
  "padding:6px 12px;border-radius:8px;pointer-events:none;z-index:10;display:none;";
document.body.appendChild(hint);

export function log(text) {
  const el = document.getElementById("log");
  if (!el) return;
  const item = document.createElement("div");
  item.textContent = text;
  el.prepend(item);
}
export function setStatus(t) { const e = document.getElementById("status"); if (e) e.textContent = t; }

export function updateDeptPanel() {
  const el = document.getElementById("dept-panel");
  const name = state.playerDepartment ? state.playerDepartment.name : "без отдела";
  el.textContent = `Отдел: ${name} | Очки: ${state.points}`;
}
export function updateTaskPanel() {
  const el = document.getElementById("task-panel");
  if (!state.activeTask) {
    el.textContent = "Нет активной задачи. Подойди к столу PM (кабинет начальника) и нажми E.";
    return;
  }
  el.innerHTML =
    `<b>Задача: ${state.activeTask.title}</b><br>` +
    `${state.activeTask.description || ""}<br>` +
    `Сложность: ${state.activeTask.difficulty} | Награда: ${state.activeTask.reward_points}`;
}

function overlayEls() {
  return [
    document.getElementById("overlay"),
    document.getElementById("dept-overlay"),
    document.getElementById("activity-overlay"),
    document.getElementById("npc-overlay"),
    document.getElementById("project-overlay"),
  ];
}
export function anyOverlayOpen() {
  if (state.pcOpen) return true;
  return overlayEls().some((e) => e && !e.hidden);
}
export function showOverlay(el) {
  el.hidden = false;
  try { controls.unlock(); } catch {}
  crosshair.style.display = "none";
  hint.style.display = "none";
}
export function hideOverlay(el) {
  el.hidden = true;
  if (!anyOverlayOpen()) {
    crosshair.style.display = "block";
    try { controls.lock(); } catch {}
  }
}

export function refreshVoiceButtons() {
  const m = document.getElementById("btn-mic");
  const d = document.getElementById("btn-deaf");
  if (m) { m.textContent = micOn() ? "🎙 Микрофон вкл" : "🔇 Микрофон выкл"; m.style.background = micOn() ? "#22c55e" : "#64748b"; }
  if (d) { d.textContent = deafOn() ? "🔊 Всех слышу" : "🔕 Глухой"; d.style.background = deafOn() ? "#64748b" : "#22c55e"; }
}
document.getElementById("btn-mic").onclick = () => { toggleMic(); refreshVoiceButtons(); };
document.getElementById("btn-deaf").onclick = () => { toggleDeafen(); refreshVoiceButtons(); };