import { state, send } from "./state.js";
import { showOverlay, hideOverlay } from "./ui.js";

export function npcLogLine(who, text, color = "#e5e7eb") {
  const box = document.getElementById("npc-log");
  const line = document.createElement("div");
  line.style.marginBottom = "6px";
  line.innerHTML = `<span style="color:${color};font-weight:600">${who}:</span> ${text}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}
export function openNpc(npc) {
  state.talkingNpc = npc;
  document.getElementById("npc-name").textContent = npc.name;
  document.getElementById("npc-log").innerHTML = "";
  document.getElementById("npc-input").value = "";
  showOverlay(document.getElementById("npc-overlay"));
  setTimeout(() => document.getElementById("npc-input").focus(), 50);
}
export function sendNpc() {
  const input = document.getElementById("npc-input");
  const message = input.value.trim();
  if (!message || !state.talkingNpc) return;
  npcLogLine("Вы", message, "#fbbf24");
  send("npc_ask", { npcId: state.talkingNpc.id, message });
  input.value = "";
}
document.getElementById("npc-send").onclick = sendNpc;
document.getElementById("npc-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.stopPropagation(); sendNpc(); } });
document.getElementById("npc-close").onclick = () => hideOverlay(document.getElementById("npc-overlay"));