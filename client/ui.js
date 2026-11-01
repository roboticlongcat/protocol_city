import { controls } from "./scene.js";
import { state } from "./state.js";
import { micOn, deafOn, toggleMic, toggleDeafen } from "./voice.js";

// ============================================================
// ГАРАНТИРОВАННЫЕ СТИЛИ ОВЕРЛЕЕВ (не зависят от index.html)
// ============================================================
const overlayCss = document.createElement("style");
overlayCss.textContent = `
  [hidden] { display: none !important; }
  #overlay, #dept-overlay, #activity-overlay, #npc-overlay, #project-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(3, 7, 18, 0.72);
    z-index: 20;
  }
  .panel {
    width: 340px;
    max-width: 92vw;
    max-height: 86vh;
    overflow: auto;
    padding: 24px;
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.97);
    border: 1px solid rgba(148, 163, 184, 0.2);
  }
  .panel.wide { width: 520px; }
  .panel input, .panel textarea {
    width: 100%;
    margin-bottom: 10px;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid #334155;
    background: #020617;
    color: #ffffff;
    box-sizing: border-box;
    font-family: inherit;
  }
  .panel button {
    width: 100%;
    margin-top: 6px;
    padding: 10px;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    background: #0ea5e9;
    color: #ffffff;
    font-weight: 600;
  }
  .panel button.ghost { background: #64748b; }
  #npc-overlay .panel { display: flex; flex-direction: column; }
  #npc-log {
    flex: 1 1 auto;
    min-height: 120px;
    max-height: 38vh;
    overflow: auto;
    margin-bottom: 10px;
    padding-right: 4px;
  }
  #hud {
    position: fixed;
    top: 10px;
    left: 10px;
    z-index: 5;
    width: 380px;
    max-width: 46vw;
    pointer-events: none;
  }
  .hud-box {
    margin-bottom: 6px;
    background: rgba(2, 6, 23, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    line-height: 1.4;
  }
  #log {
    max-height: 240px;
    overflow: auto;
    font-size: 13px;
    background: rgba(2, 6, 23, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    padding: 8px;
  }
`;
document.head.appendChild(overlayCss);

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
  for (const o of overlayEls()) {
    if (o && o !== el) o.hidden = true;
  }
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