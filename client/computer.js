import * as THREE from "three";
import { camera, controls, scene, renderer } from "./scene.js";
import { state, send } from "./state.js";
import { crosshair, hint, anyOverlayOpen } from "./ui.js";
import { currentFps } from "./metrics.js";

// ============================================================
// ЭКРАН ПК
// ============================================================
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
pcScreen.appendChild(pcDesktopView);
document.body.appendChild(pcScreen);

const APPS = [
  { name: "Проекты", icon: "📁" },
  { name: "Терминал", icon: "💻" },
  { name: "Браузер", icon: "🌐" },
  { name: "Настройки", icon: "⚙️" },
];
for (const app of APPS) {
  const d = document.createElement("div");
  d.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;padding:15px;border-radius:8px;transition:background .2s;";
  d.onmouseover = () => { d.style.background = "rgba(255,255,255,0.1)"; };
  d.onmouseout = () => { d.style.background = "transparent"; };
  d.innerHTML = '<div style="font-size:48px;">' + app.icon + '</div><span style="color:#e2e8f0;font-size:14px;text-align:center;">' + app.name + "</span>";
  d.onclick = () => launchApp(app.name);
  pcDesktopView.appendChild(d);
}

// ---------- FPS-бейдж (управляется настройкой "Счётчик FPS") ----------
const fpsBadge = document.createElement("div");
fpsBadge.style.cssText = "position:fixed;top:10px;right:10px;z-index:6;background:rgba(2,6,23,.75);border:1px solid rgba(148,163,184,.25);border-radius:8px;padding:4px 10px;font:12px system-ui,sans-serif;color:#4ade80;display:none;";
document.body.appendChild(fpsBadge);
setInterval(() => {
  const on = state.showFps !== false;
  fpsBadge.style.display = on ? "block" : "none";
  if (on) fpsBadge.textContent = "FPS: " + currentFps();
}, 500);

// ============================================================
// ОТКРЫТИЕ / ЗАКРЫТИЕ ПК
// ============================================================
function originFromMonitor(mesh) {
  const wp = new THREE.Vector3();
  mesh.getWorldPosition(wp);
  const pr = wp.clone().project(camera);
  return (pr.x * 0.5 + 0.5) * innerWidth + "px " + (-pr.y * 0.5 + 0.5) * innerHeight + "px";
}

export function openComputer(monitorMesh) {
  state.currentPcMonitor = monitorMesh;
  pcScreen.style.transformOrigin = originFromMonitor(monitorMesh);
  pcScreen.style.display = "flex";
  pcScreen.style.transform = "scale(0.01)";
  pcScreen.style.opacity = "0";
  pcUserInfo.textContent = "👤 " + state.currentUsername + " | Рабочая станция";
  state.pcOpen = true;
  for (const k in state.keys) state.keys[k] = false;
  try { controls.unlock(); } catch (e) {}
  document.getElementById("hud").style.display = "none";
  crosshair.style.display = "none";
  hint.style.display = "none";
  requestAnimationFrame(() => {
    pcScreen.style.transform = "scale(1)";
    pcScreen.style.opacity = "1";
  });
}

export function closeComputer() {
  if (state.currentPcMonitor) pcScreen.style.transformOrigin = originFromMonitor(state.currentPcMonitor);
  pcScreen.style.transform = "scale(0.01)";
  pcScreen.style.opacity = "0";
  setTimeout(() => {
    pcScreen.style.display = "none";
    pcScreen.querySelectorAll("[id^=pcapp-]").forEach((e) => { e.style.display = "none"; });
    document.getElementById("hud").style.display = "block";
    state.currentPcMonitor = null;
    state.pcOpen = false;
    if (!anyOverlayOpen()) {
      crosshair.style.display = "block";
      try { controls.lock(); } catch (e) {}
    }
  }, 450);
}

// ============================================================
// ФАБРИКА ОКОН + ХЕЛПЕРЫ
// ============================================================
function makeAppWindow(id, title) {
  let el = document.getElementById("pcapp-" + id);
  if (el) { el.style.display = "flex"; return el; }
  el = document.createElement("div");
  el.id = "pcapp-" + id;
  el.style.cssText = "position:absolute;inset:48px 24px 24px;background:#020617;border:1px solid #1f2937;border-radius:10px;display:flex;flex-direction:column;color:#e5e7eb;overflow:hidden;";
  const head = document.createElement("div");
  head.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#0b1220;border-bottom:1px solid #1f2937;";
  const t = document.createElement("span");
  t.textContent = title;
  t.style.cssText = "font-size:12px;color:#94a3b8;";
  const x = document.createElement("button");
  x.textContent = "✕ свернуть";
  x.style.cssText = "background:#ef4444;border:0;color:#fff;border-radius:4px;padding:2px 10px;cursor:pointer;width:auto;margin:0;";
  x.onclick = () => { el.style.display = "none"; };
  head.appendChild(t);
  head.appendChild(x);
  const body = document.createElement("div");
  body.style.cssText = "flex:1;overflow:auto;padding:12px;font-size:13px;";
  el.appendChild(head);
  el.appendChild(body);
  pcScreen.appendChild(el);
  el.__body = body;
  return el;
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function launchApp(name) {
  if (name === "Терминал") { openTerminal(); return; }
  if (name === "Проекты") { openProjects(); return; }
  if (name === "Браузер") { openBrowser(); return; }
  if (name === "Настройки") { openSettings(); return; }
}

// ============================================================
// ТЕРМИНАЛ
// ============================================================
function openTerminal() {
  const win = makeAppWindow("terminal", "💻 Терминал");
  const b = win.__body;
  if (b.__wired) return;
  b.__wired = true;
  b.style.cssText = "flex:1;display:flex;flex-direction:column;overflow:hidden;padding:0;";
  b.innerHTML = "";
  const out = document.createElement("div");
  out.style.cssText = "flex:1;overflow:auto;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px;color:#a7f3d0;padding:8px;";
  out.textContent = "Терминал Протокол-Сити. Введи: help\n";
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;padding:8px;border-top:1px solid #1f2937;";
  const inp = document.createElement("input");
  inp.placeholder = "команда...";
  inp.style.cssText = "flex:1;background:#0b1220;border:1px solid #334155;color:#e5e7eb;border-radius:6px;padding:6px 8px;font:inherit;";
  const btn = document.createElement("button");
  btn.textContent = "Enter";
  btn.style.cssText = "background:#0ea5e9;border:0;color:#04263a;font-weight:700;padding:6px 12px;border-radius:6px;cursor:pointer;width:auto;margin:0;";
  row.appendChild(inp);
  row.appendChild(btn);
  b.appendChild(out);
  b.appendChild(row);
  window.__termPrint = function (lines) {
    out.textContent += lines.join("\n") + "\n";
    out.scrollTop = out.scrollHeight;
  };
  function submit() {
    const cmd = inp.value.trim();
    if (!cmd) return;
    out.textContent += "> " + cmd + "\n";
    inp.value = "";
    send("app_query", { appId: "terminal", action: cmd });
  }
  btn.onclick = submit;
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.stopPropagation(); submit(); } });
  inp.focus();
}

// ============================================================
// ПРОЕКТЫ
// ============================================================
function openProjects() {
  const win = makeAppWindow("projects", "📁 Проекты");
  win.__body.innerHTML = "<div style='opacity:.7'>Загрузка…</div>";
  send("app_query", { appId: "projects", action: "list" });
}

function renderProjects(data) {
  const win = makeAppWindow("projects", "📁 Проекты");
  const b = win.__body;
  b.innerHTML = "";
  const personal = data.personal || [];
  const active = personal.filter((p) => p.status === "in_progress");
  const mail = document.createElement("div");
  mail.style.cssText = "margin-bottom:10px;font-size:12px;color:#94a3b8;";
  mail.textContent = "📧 Почта: " + active.length + " — задачи ждут твоего внимания";
  b.appendChild(mail);
  const h1 = document.createElement("b");
  h1.textContent = "Мои задачи";
  b.appendChild(h1);
  const ul = document.createElement("div");
  ul.style.cssText = "margin:6px 0 14px;";
  if (!personal.length) ul.innerHTML = "<div style='opacity:.6'>Пусто — возьми задачу у стола PM.</div>";
  for (const p of personal) {
    const row = document.createElement("div");
    row.style.cssText = "padding:4px 0;border-bottom:1px solid #1e293b;";
    const badge = p.status === "completed" ? "✅" : p.status === "in_progress" ? "⏳" : "❌";
    row.textContent = badge + " " + p.title + " (" + p.difficulty + ", +" + p.reward_points + ")";
    ul.appendChild(row);
  }
  b.appendChild(ul);
  const h2 = document.createElement("b");
  h2.textContent = "Общий проект (конвейер)";
  b.appendChild(h2);
  const pd = document.createElement("div");
  pd.style.cssText = "margin-top:6px;";
  if (!data.project) pd.innerHTML = "<div style='opacity:.6'>Нет открытого проекта.</div>";
  else {
    for (const s of (data.project.steps || [])) {
      const row = document.createElement("div");
      row.style.cssText = "padding:4px 0;border-bottom:1px solid #1e293b;";
      row.textContent = (s.order_index + 1) + ". " + s.department_name + " — " + s.status + (s.by_username ? " (" + s.by_username + ")" : "");
      pd.appendChild(row);
    }
  }
  b.appendChild(pd);
}

// ============================================================
// БРАУЗЕР
// ============================================================
let browserHistory = [];

function openBrowser() {
  const win = makeAppWindow("browser", "🌐 Браузер");
  const b = win.__body;
  if (b.__wired) return;
  b.__wired = true;
  b.innerHTML = "";
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;gap:6px;margin-bottom:10px;";
  const back = document.createElement("button");
  back.textContent = "←";
  back.style.cssText = "background:#1e293b;border:1px solid #334155;color:#e5e7eb;border-radius:6px;padding:4px 10px;cursor:pointer;width:auto;margin:0;";
  back.onclick = () => {
    if (browserHistory.length > 1) {
      browserHistory.pop();
      showBrowserView(browserHistory[browserHistory.length - 1]);
    }
  };
  const addr = document.createElement("input");
  addr.placeholder = "Поиск по Протокол-Сити…";
  addr.style.cssText = "flex:1;background:#0b1220;border:1px solid #334155;color:#e5e7eb;border-radius:6px;padding:6px 8px;font:inherit;";
  addr.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.stopPropagation(); doSearch(addr.value); } });
  const go = document.createElement("button");
  go.textContent = "Найти";
  go.style.cssText = "background:#0ea5e9;border:0;color:#04263a;font-weight:700;padding:4px 12px;border-radius:6px;cursor:pointer;width:auto;margin:0;";
  go.onclick = () => doSearch(addr.value);
  bar.appendChild(back);
  bar.appendChild(addr);
  bar.appendChild(go);
  const view = document.createElement("div");
  view.id = "pcapp-browser-view";
  b.appendChild(bar);
  b.appendChild(view);
  if (!browserHistory.length) browserHistory.push({ kind: "home" });
  send("app_query", { appId: "browser", action: "home" });
}

function doSearch(q) {
  const query = String(q || "").trim();
  browserHistory.push({ kind: "search", query });
  send("app_query", { appId: "browser", action: "search", query });
}

function showBrowserView(v) {
  if (v.kind === "search") send("app_query", { appId: "browser", action: "search", query: v.query });
  else if (v.kind === "page") send("app_query", { appId: "browser", action: "page", query: v.title });
  else send("app_query", { appId: "browser", action: "home" });
}

function renderBrowser(data) {
  const view = document.getElementById("pcapp-browser-view");
  if (!view) return;
  view.innerHTML = "";
  if (data.kind === "home") {
    const h = document.createElement("b");
    h.textContent = "🏠 Портал «Протокол-Сити»";
    view.appendChild(h);
    const p = document.createElement("div");
    p.style.cssText = "margin:8px 0;opacity:.8;";
    p.textContent = "Отделы компании: " + (data.deps || []).map((d) => d.name).join(", ") + ".";
    view.appendChild(p);
    const tip = document.createElement("div");
    tip.style.cssText = "opacity:.6;font-size:12px;";
    tip.textContent = "Введи запрос в строку выше — поисковик соберёт страницы локальной LLM без интернета.";
    view.appendChild(tip);
    return;
  }
  if (data.kind === "search") {
    const h = document.createElement("b");
    h.textContent = "Результаты по запросу: " + (data.query || "");
    view.appendChild(h);
    for (const r of (data.results || [])) {
      const item = document.createElement("div");
      item.style.cssText = "margin:10px 0;padding:8px;border:1px solid #1e293b;border-radius:8px;cursor:pointer;";
      item.innerHTML = "<div style='color:#38bdf8;font-weight:600'>" + escapeHtml(r.title) + "</div><div style='opacity:.8;font-size:12px;margin-top:4px'>" + escapeHtml(r.snippet) + "</div>";
      item.onmouseover = () => { item.style.borderColor = "#38bdf8"; };
      item.onmouseout = () => { item.style.borderColor = "#1e293b"; };
      item.onclick = () => {
        browserHistory.push({ kind: "page", title: r.title });
        send("app_query", { appId: "browser", action: "page", query: r.title });
      };
      view.appendChild(item);
    }
    return;
  }
  if (data.kind === "page") {
    const h = document.createElement("b");
    h.textContent = "📄 " + (data.title || "");
    view.appendChild(h);
    const pre = document.createElement("div");
    pre.style.cssText = "margin-top:8px;white-space:pre-wrap;line-height:1.5;";
    pre.textContent = data.text || "";
    view.appendChild(pre);
  }
}

// ============================================================
// НАСТРОЙКИ (нормальные: подсказки, FPS, ники, скорость, масштаб)
// ============================================================
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem("pc_prefs") || "{}"); } catch (e) { return {}; }
}
function savePrefs(p) { localStorage.setItem("pc_prefs", JSON.stringify(p)); }

function openSettings() {
  const win = makeAppWindow("settings", "⚙️ Настройки");
  const b = win.__body;
  b.innerHTML = "";
  const prefs = loadPrefs();
  function row(label, control) {
    const r = document.createElement("div");
    r.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1e293b;";
    const l = document.createElement("span");
    l.textContent = label;
    r.appendChild(l);
    r.appendChild(control);
    b.appendChild(r);
  }
  function checkbox(key, onchange) {
    const c = document.createElement("input");
    c.type = "checkbox";
    c.checked = prefs[key] !== false;
    c.style.cssText = "width:auto;";
    c.onchange = () => { prefs[key] = c.checked; savePrefs(prefs); onchange(c.checked); };
    return c;
  }
  row("Подсказки у прицела", checkbox("hints", (v) => { state.showHints = v; }));
  row("Счётчик FPS", checkbox("fps", (v) => { state.showFps = v; }));
  row("Ники игроков", checkbox("nicks", (v) => { state.showNicks = v; }));
  const speed = document.createElement("input");
  speed.type = "range";
  speed.min = "0.5";
  speed.max = "2";
  speed.step = "0.1";
  speed.value = String(prefs.speed || 1);
  speed.style.cssText = "width:140px;";
  speed.oninput = () => { prefs.speed = Number(speed.value); savePrefs(prefs); state.speedMul = prefs.speed; };
  row("Скорость передвижения", speed);
  const scale = document.createElement("input");
  scale.type = "range";
  scale.min = "0.8";
  scale.max = "1.4";
  scale.step = "0.05";
  scale.value = String(prefs.hudScale || 1);
  scale.style.cssText = "width:140px;";
  scale.oninput = () => { prefs.hudScale = Number(scale.value); savePrefs(prefs); applyHudScale(prefs.hudScale); };
  row("Масштаб интерфейса (HUD)", scale);
  const note = document.createElement("div");
  note.style.cssText = "margin-top:10px;opacity:.6;font-size:12px;";
  note.textContent = "Настройки сохраняются в этом браузере и применяются сразу.";
  b.appendChild(note);
}

function applyHudScale(v) {
  const hud = document.getElementById("hud");
  if (hud) hud.style.zoom = String(v || 1);
}

(function applyPrefs() {
  const p = loadPrefs();
  state.showHints = p.hints !== false;
  state.showFps = p.fps !== false;
  state.showNicks = p.nicks !== false;
  state.speedMul = p.speed || 1;
  applyHudScale(p.hudScale || 1);
})();

// ============================================================
// РОУТЕР ОТВЕТОВ ПРИЛОЖЕНИЙ (один раз, вызывается из net.js)
// ============================================================
window.__appResponse = function (msg) {
  if (msg.appId === "terminal" && typeof window.__termPrint === "function") {
    window.__termPrint((msg.data && msg.data.lines) || ["(пустой ответ)"]);
  } else if (msg.appId === "projects") {
    renderProjects(msg.data || {});
  } else if (msg.appId === "browser") {
    renderBrowser(msg.data || {});
  }
};