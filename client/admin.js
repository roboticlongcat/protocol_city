const USE_TLS = true;
const HOST = location.hostname || "localhost";
const API = `${USE_TLS ? "https" : "http"}://${HOST}:8080`;
const WS = `${USE_TLS ? "wss" : "ws"}://${HOST}:8080`;

let socket = null;
let snap = null;          // последний admin_snapshot
let metrics = { agg: null, clients: [] };

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const toast = (t) => { const el = $("#toast"); el.textContent = t; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 1800); };

// --- табы ---
$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  $$("#tabs button").forEach((x) => x.classList.remove("active"));
  b.classList.add("active");
  $$("section").forEach((s) => s.classList.remove("active"));
  $("#tab-" + b.dataset.tab).classList.add("active");
});

// --- логин админа ---
async function login() {
  const username = prompt("Логин админа:", "admin");
  const password = prompt("Пароль:", "admin123");
  const res = await fetch(`${API}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
  const data = await res.json();
  if (!res.ok) { alert("Не удалось войти: " + (data.error || res.status)); return false; }
  if ((data.user?.role || data.role) !== "admin" && !String(data.token).includes(".")) { /* role в токене, проверим на сервере */ }
  connect(data.token);
  return true;
}

function connect(token) {
  socket = new WebSocket(`${WS}?token=${token}`);
  socket.onopen = () => { $("#conn").textContent = "● онлайн"; socket.send(JSON.stringify({ type: "admin_get_snapshot" })); };
  socket.onclose = () => { $("#conn").textContent = "○ оффлайн"; };
  socket.onerror = () => { $("#conn").textContent = "✕ ошибка (прими сертификат /api/health)"; };
  socket.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === "admin_snapshot") { snap = m; renderAll(); }
    if (m.type === "admin_metrics") { metrics = { agg: m.agg, clients: m.clients }; renderMetrics(); }
    if (m.type === "admin_ack") toast(m.ok ? "✓ сохранено" : "✕ не сохранено: " + (m.reason || ""));
    if (m.type === "game_event") { /* можно показывать в консоль */ }
  };
}

const send = (type, payload = {}) => socket && socket.readyState === 1 && socket.send(JSON.stringify({ type, ...payload }));

// --- рендер метрик ---
function card(l, v) { return `<div class="card"><div class="v">${v ?? "—"}</div><div class="l">${l}</div></div>`; }
function renderMetrics() {
  const a = metrics.agg || {};
  $("#m-cards").innerHTML =
    card("Online", a.online) + card("Live ≤6с", a.liveClients) + card("Админов", a.admins) +
    card("Ср. FPS", a.avgFps) + card("Мин FPS", a.minFps) + card("Avg ping", a.avgPing != null ? a.avgPing + "мс" : "—") +
    card("p95 ping", a.p95Ping != null ? a.p95Ping + "мс" : "—") + card("Uptime", (a.uptimeSec ?? 0) + "с") +
    card("RSS", (a.rssMb ?? 0) + "МБ") + card("Heap", (a.heapMb ?? 0) + "МБ");
  const now = Date.now();
  $("#m-rows").innerHTML = (metrics.clients || []).map((c) => {
    const age = (now - c.sentAt) / 1000;    
    const dead = age > 6;
    return `<tr style="${dead ? "opacity:.45" : ""}">
      <td>${c.id}</td><td>${c.username || ""}</td><td>${c.dept || ""}</td><td>${c.zone || ""}</td>
      <td class="${c.fps >= 50 ? "ok" : c.fps >= 30 ? "" : "bad"}">${c.fps}</td>
      <td>${c.pingMs ?? "—"}</td><td>${age}${dead ? " (offline)" : ""}</td>
      <td><button class="save danger" onclick="window.__kick(${c.id})">кик</button></td></tr>`;
  }).join("") || `<tr><td colspan="8" class="muted">нет данных — пусть игроки зайдут в игру</td></tr>`;
}
window.__kick = (id) => { if (confirm("Кикнуть игрока #" + id + "?")) send("admin_kick", { userId: id }); };

// --- generic редактор таблиц ---
function cell(inputHtml, onchange) { return `<td>${inputHtml}</td>`; }

function renderNpc() {
  const rows = (snap?.npcs || []);
  $("#npc-rows").innerHTML = rows.map((n) => {
    const beh = (() => { try { return JSON.stringify(JSON.parse(n.behavior || "{}"), null, 1); } catch { return n.behavior || "{}"; } })();
    return `<tr data-id="${n.id}">
      <td>${n.id}</td>
      <td><input value="${esc(n.name)}" data-f="name"></td>
      <td><select data-f="role"><option ${n.role==="product_manager"?"selected":""}>product_manager</option><option ${n.role==="department_lead"?"selected":""}>department_lead</option></select></td>
      <td>${n.department_id ?? "PM"}</td>
      <td><input value="${esc(n.model || "")}" data-f="model"></td>
      <td><input value="${esc(n.personality || "")}" data-f="personality"></td>
      <td><textarea data-f="behavior">${esc(beh)}</textarea></td>
      <td><button class="save" data-save>💾</button></td></tr>`;
  }).join("");
  bindSave("#npc-rows", (tr, patch) => { if (patch.behavior) { try { patch.behavior = JSON.parse(patch.behavior); } catch { toast("behavior — невалидный JSON"); return false; } } send("admin_update_npc", { id: +tr.dataset.id, patch }); });
}

function renderDept() {
  $("#dept-rows").innerHTML = (snap?.departments || []).map((d) => `<tr data-id="${d.id}">
    <td>${d.id}</td><td><input value="${esc(d.slug)}" data-f="slug"></td>
    <td><input value="${esc(d.name)}" data-f="name"></td>
    <td><input value="${esc(d.description || "")}" data-f="description"></td>
    <td><input type="number" value="${d.max_players}" data-f="max_players" style="width:60px"></td>
    <td><input value="${esc(d.color)}" data-f="color" style="width:80px"></td>
    <td><input type="number" step="0.5" value="${d.x}" data-f="x" style="width:70px"></td>
    <td><input type="number" step="0.5" value="${d.z}" data-f="z" style="width:70px"></td>
    <td><button class="save" data-save>💾</button></td></tr>`).join("");
  bindSave("#dept-rows", (tr, patch) => send("admin_update_department", { id: +tr.dataset.id, patch }));
}

function renderTask() {
  $("#task-rows").innerHTML = (snap?.tasks || []).map((t) => `<tr data-id="${t.id}">
    <td>${t.id}</td><td>${t.department_id}</td>
    <td><input value="${esc(t.title)}" data-f="title"></td>
    <td><input value="${esc(t.description || "")}" data-f="description"></td>
    <td><select data-f="difficulty"><option ${t.difficulty==="easy"?"selected":""}>easy</option><option ${t.difficulty==="medium"?"selected":""}>medium</option><option ${t.difficulty==="hard"?"selected":""}>hard</option></select></td>
    <td><input type="number" value="${t.reward_points}" data-f="reward_points" style="width:70px"></td>
    <td><button class="save" data-save>💾</button></td></tr>`).join("");
  bindSave("#task-rows", (tr, patch) => send("admin_update_task", { id: +tr.dataset.id, patch }));
}

function renderAct() {
  $("#act-rows").innerHTML = (snap?.activities || []).map((a) => {
    const data = (() => { try { return JSON.stringify(JSON.parse(a.data), null, 1); } catch { return a.data; } })();
    return `<tr data-task="${a.task_id}">
      <td>${a.task_id}</td>
      <td><select data-f="kind"><option ${a.kind==="quiz"?"selected":""}>quiz</option><option ${a.kind==="blocks"?"selected":""}>blocks</option><option ${a.kind==="sorting"?"selected":""}>sorting</option></select></td>
      <td><textarea data-f="data">${esc(data)}</textarea></td>
      <td><button class="save" data-save>💾</button></td></tr>`;
  }).join("");
  bindSave("#act-rows", (tr, patch) => { if (patch.data) { try { patch.data = JSON.parse(patch.data); } catch { toast("data — невалидный JSON"); return false; } } send("admin_update_activity", { taskId: +tr.dataset.task, patch }); }, "data-task");
}

function renderWorld() { $("#w-json").value = JSON.stringify(snap?.world || {}, null, 2); }

function bindSave(sel, handler, idAttr = "data-id") {
  const root = $(sel); if (!root) return;
  root.querySelectorAll("[data-save]").forEach((btn) => {
    btn.onclick = () => {
      const tr = btn.closest("tr");
      const patch = {};
      tr.querySelectorAll("[data-f]").forEach((el) => { patch[el.dataset.f] = el.type === "number" ? Number(el.value) : el.value; });
      handler(tr, patch);
    };
  });
}
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function renderAll() { renderMetrics(); renderNpc(); renderDept(); renderTask(); renderAct(); renderWorld(); if (m.type === "admin_ack") {
  toast(m.ok ? "✓ сохранено" : "✕ не сохранено: " + (m.reason || ""));
  send("admin_get_snapshot");  
}}

// --- мир / события / broadcast ---
$("#w-save").onclick = () => { try { send("admin_set_world", { patch: JSON.parse($("#w-json").value) }); } catch { toast("world — невалидный JSON"); } };
$("#ev-send").onclick = () => send("admin_force_event", { event: $("#ev-name").value, on: $("#ev-on").value === "1" });
$("#bc-send").onclick = () => { const m = $("#bc-msg").value.trim(); if (m) { send("admin_broadcast", { message: m }); $("#bc-msg").value = ""; } };

login();

const TEMPLATES = {
  quiz: { question: "Вопрос?", options: ["Ответ 1", "Ответ 2", "Ответ 3"], correct: 0 },
  blocks: { prompt: "Расставь по порядку:", items: ["Шаг 1", "Шаг 2", "Шаг 3"], correctOrder: ["Шаг 1", "Шаг 2", "Шаг 3"] },
  sorting: { prompt: "Разложи по корзинам:", buckets: [{ name: "Корзина A", items: ["x", "y"] }, { name: "Корзина B", items: ["z"] }] },
};

function fillCreateSelects() {
  const dept = document.getElementById("nt-dept");
  if (dept) {
    dept.innerHTML = "";
    for (const d of (snap?.departments || [])) {
      const o = document.createElement("option");
      o.value = d.id;
      o.textContent = d.name;
      dept.appendChild(o);
    }
  }
  const task = document.getElementById("na-task");
  if (task) {
    task.innerHTML = "";
    for (const t of (snap?.tasks || [])) {
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = "#" + t.id + " " + t.title;
      task.appendChild(o);
    }
  }
}

function fillDeptSelect() {
  const sel = document.getElementById("nt-dept");
  if (!sel) return;
  sel.innerHTML = "";
  for (const d of (snap?.departments || [])) {
    const o = document.createElement("option");
    o.value = d.id;
    o.textContent = d.name;
    sel.appendChild(o);
  }
}

function wireCreateTask() {
  const kindSel = document.getElementById("nt-kind");
  const dataTa = document.getElementById("nt-data");
  if (!kindSel || !dataTa) return;
  const setTemplate = () => { dataTa.value = JSON.stringify(TEMPLATES[kindSel.value], null, 1); };
  kindSel.onchange = setTemplate;
  setTemplate();
  document.getElementById("nt-create").onclick = () => {
    let data;
    try { data = JSON.parse(dataTa.value); } catch { toast("data — невалидный JSON"); return; }
    const title = document.getElementById("nt-title").value.trim();
    if (!title) { toast("Укажи название задачи"); return; }
    send("admin_create_task", {
      patch: {
        department_id: Number(document.getElementById("nt-dept").value),
        title,
        description: document.getElementById("nt-desc").value.trim(),
        difficulty: document.getElementById("nt-diff").value,
        reward_points: Number(document.getElementById("nt-points").value) || 10,
      },
      activity: { kind: kindSel.value, data },
    });
  };
}
wireCreateTask();
function wireCreateForms() {
  const kindSel = document.getElementById("na-kind");
  const dataTa = document.getElementById("na-data");
  if (kindSel && dataTa) {
    const setT = function () { dataTa.value = JSON.stringify(TEMPLATES[kindSel.value], null, 1); };
    kindSel.onchange = setT;
    setT();
  }
  const ntBtn = document.getElementById("nt-create");
  if (ntBtn) ntBtn.onclick = function () {
    const title = document.getElementById("nt-title").value.trim();
    if (!title) { toast("Укажи название задачи"); return; }
    send("admin_create_task", {
      patch: {
        department_id: Number(document.getElementById("nt-dept").value),
        title: title,
        description: document.getElementById("nt-desc").value.trim(),
        difficulty: document.getElementById("nt-diff").value,
        reward_points: Number(document.getElementById("nt-points").value) || 10,
      },
    });
  };
  const naBtn = document.getElementById("na-create");
  if (naBtn) naBtn.onclick = function () {
    let data;
    try { data = JSON.parse(dataTa.value); } catch (e) { toast("data — невалидный JSON"); return; }
    send("admin_create_activity", {
      taskId: Number(document.getElementById("na-task").value),
      kind: kindSel.value,
      data: data,
    });
  };
}
wireCreateForms();