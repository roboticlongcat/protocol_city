import { state, send } from "./state.js";
import { showOverlay, hideOverlay } from "./ui.js";

export function showDeptChooser() {
  const list = document.getElementById("dept-list");
  list.innerHTML = "";
  for (const d of state.departments) {
    const btn = document.createElement("button");
    const full = d.current_players >= d.max_players;
    btn.textContent = `${d.name} — ${d.current_players}/${d.max_players}`;
    btn.disabled = full;
    btn.style.background = d.color;
    btn.onclick = () => send("select_department", { departmentId: d.id });
    list.appendChild(btn);
  }
  showOverlay(document.getElementById("dept-overlay"));
}
document.getElementById("dept-close").onclick = () => hideOverlay(document.getElementById("dept-overlay"));