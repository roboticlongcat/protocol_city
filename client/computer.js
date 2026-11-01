import * as THREE from "three";
import { camera, controls } from "./scene.js";
import { state } from "./state.js";
import { crosshair, hint, anyOverlayOpen } from "./ui.js";

export const pcScreen = document.createElement("div");
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
  { name: "Почта", icon: "📧" }, { name: "Файлы", icon: "📁" },
  { name: "Терминал", icon: "💻" }, { name: "Настройки", icon: "⚙️" },
  { name: "Браузер", icon: "🌐" }, { name: "Калькулятор", icon: "🧮" },
].forEach((app) => {
  const d = document.createElement("div");
  d.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;padding:15px;border-radius:8px;transition:background .2s;";
  d.onmouseover = () => (d.style.background = "rgba(255,255,255,0.1)");
  d.onmouseout = () => (d.style.background = "transparent");
  d.innerHTML = `<div style="font-size:48px;">${app.icon}</div><span style="color:#e2e8f0;font-size:14px;text-align:center;">${app.name}</span>`;
  d.onclick = () => {}; // заглушка приложений (лог не тянем сюда, чтобы не плодить зависимости)
  pcDesktopView.appendChild(d);
});
pcScreen.appendChild(pcDesktopView);
document.body.appendChild(pcScreen);

function originFromMonitor(mesh) {
  const wp = new THREE.Vector3(); mesh.getWorldPosition(wp);
  const pr = wp.clone().project(camera);
  return `${(pr.x * .5 + .5) * innerWidth}px ${(-pr.y * .5 + .5) * innerHeight}px`;
}

export function openComputer(monitorMesh) {
  state.currentPcMonitor = monitorMesh;
  pcScreen.style.transformOrigin = originFromMonitor(monitorMesh);
  pcScreen.style.display = "flex";
  pcScreen.style.transform = "scale(0.01)";
  pcScreen.style.opacity = "0";
  pcUserInfo.textContent = `👤 ${state.currentUsername} | Рабочая станция`;
  state.pcOpen = true;
  try { controls.unlock(); } catch {}
  document.getElementById("hud").style.display = "none";
  crosshair.style.display = "none";
  hint.style.display = "none";
  requestAnimationFrame(() => { pcScreen.style.transform = "scale(1)"; pcScreen.style.opacity = "1"; });
}

export function closeComputer() {
  if (state.currentPcMonitor) pcScreen.style.transformOrigin = originFromMonitor(state.currentPcMonitor);
  pcScreen.style.transform = "scale(0.01)";
  pcScreen.style.opacity = "0";
  setTimeout(() => {
    pcScreen.style.display = "none";
    document.getElementById("hud").style.display = "block";
    state.currentPcMonitor = null;
    state.pcOpen = false;
    if (!anyOverlayOpen()) { crosshair.style.display = "block"; try { controls.lock(); } catch {} }
  }, 450);
}