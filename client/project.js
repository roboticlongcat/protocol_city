import { state, send } from "./state.js";
import { showOverlay, hideOverlay, log } from "./ui.js";

export function myStepOfProject() {
  if (!state.project) return null;
  return state.project.steps.find((s) => s.status === "in_progress" && s.assigned_user_id === state.selfId) || null;
}
export function renderProjectPanel() {
  const el = document.getElementById("project-panel");
  if (!el) return;
  if (!state.project) { el.textContent = "Совместный проект: нет открытых."; return; }
  const done = state.project.steps.filter((s) => s.status === "done").length;
  const mine = myStepOfProject();
  el.innerHTML =
    `<b>Проект: ${state.project.title}</b> — ${done}/${state.project.steps.length} шагов (бонус ${state.project.reward_points})` +
    (mine
      ? `<br>🔧 Твой шаг: ${state.project.steps.find((s) => s.id === mine.id)?.department_name} — сдай на <b>голубой консоли</b> (E) или освободи на доске (F)`
      : `<br>Свободных шагов твоего отдела нет — жди предыдущий или открой доску (F)`);
}
export function showProjectOverlay() {
  if (!state.project) { log("Данные проекта ещё не загружены. Перезайди."); return; }
  renderProjectOverlay();
  showOverlay(document.getElementById("project-overlay"));
}
export function closeProjectOverlay() { hideOverlay(document.getElementById("project-overlay")); }
document.getElementById("proj-close").onclick = closeProjectOverlay;

export function renderProjectOverlay() {
  if (!state.project) return;
  document.getElementById("proj-title").textContent = state.project.title;
  document.getElementById("proj-desc").textContent = state.project.description || "";
  const pct = Math.round((state.project.overallProgress || 0) * 100);
  document.getElementById("proj-progress-bar").style.width = pct + "%";
  const done = state.project.steps.filter((s) => s.status === "done").length;
  document.getElementById("proj-progress-text").textContent =
    `Прогресс: ${done}/${state.project.steps.length} (${pct}%) · статус: ${state.project.status === "completed" ? "завершён 🎉" : "в работе"}`;

  const wrap = document.getElementById("proj-steps");
  wrap.innerHTML = "";
  const mine = myStepOfProject();
  for (const s of state.project.steps) {
    const row = document.createElement("div");
    row.className = "act-item"; row.style.cursor = "default";
    let badge = "";
    if (s.status === "done") badge = " ✅ сдано" + (s.by_username ? ` (${s.by_username})` : "");
    else if (s.status === "in_progress") badge = ` ⏳ в работе: ${s.by_username || "?"}`;
    else if (s.status === "locked") badge = " 🔒 ждёт предыдущий шаг";
    row.innerHTML = `<b>${s.order_index + 1}. ${s.department_name}</b>${badge}`;

    if (s.status === "in_progress" && s.assigned_user_id === state.selfId) {
      const rel = document.createElement("button");
      rel.textContent = "Освободить шаг"; rel.className = "ghost"; rel.style.marginTop = "6px";
      rel.onclick = () => send("release_step", { stepId: s.id });
      row.appendChild(rel);
      const tip = document.createElement("div");
      tip.style.cssText = "font-size:12px;opacity:.8;margin-top:4px";
      tip.textContent = "Или сдай на голубой консоли (подойди и нажми E).";
      row.appendChild(tip);
    }
    if (s.status === "available") {
      const canTake = state.playerDepartment && state.playerDepartment.id === s.department_id && !mine;
      const btn = document.createElement("button");
      btn.textContent = canTake ? "Взять шаг" : (state.playerDepartment && state.playerDepartment.id === s.department_id ? "У тебя уже есть шаг" : "Не ваш отдел");
      btn.disabled = !canTake; btn.style.marginTop = "6px";
      btn.onclick = () => { closeProjectOverlay(); send("claim_step", { stepId: s.id }); };
      row.appendChild(btn);
    }
    wrap.appendChild(row);
  }
}