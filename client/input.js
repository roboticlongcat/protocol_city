import { controls } from "./scene.js";
import { state, send } from "./state.js";
import { closeComputer } from "./computer.js";
import { hideOverlay, refreshVoiceButtons } from "./ui.js";
import { toggleMic, toggleDeafen, initVoice, connectPeer } from "./voice.js";
import { tryInteract, tryTalkNPC, toggleSit, findChairUnderCrosshair, findComputerUnderCrosshair } from "./interaction.js";
import { openComputer } from "./computer.js";
import { showProjectOverlay, closeProjectOverlay } from "./project.js";
import { isDragging, stopDrag } from "./interaction.js";

window.addEventListener("keydown", (event) => {
  if (state.pcOpen) { if (event.code === "Escape") closeComputer(); return; }

  const projOv = document.getElementById("project-overlay");
  if (!projOv.hidden) { if (event.code === "Escape") closeProjectOverlay(); return; }
  const actOv = document.getElementById("activity-overlay");
  if (!actOv.hidden) { if (event.code === "Escape") hideOverlay(actOv); return; }
  const deptOv = document.getElementById("dept-overlay");
  if (!deptOv.hidden) { if (event.code === "Escape") hideOverlay(deptOv); return; }
  const npcOv = document.getElementById("npc-overlay");
  if (!npcOv.hidden) { if (event.code === "Escape") hideOverlay(npcOv); return; }

  if (event.code === "Space") event.preventDefault();
  state.keys[event.code] = true;
  if (event.code === "KeyM") { toggleMic(); refreshVoiceButtons(); }
  if (event.code === "KeyO") { toggleDeafen(); refreshVoiceButtons(); }
  if (!controls.isLocked) return;
  if (event.code === "KeyE") {
    if (state.player.seated) {
      const comp = findComputerUnderCrosshair();
      if (comp) openComputer(comp); else toggleSit();
    } else {
      if (findChairUnderCrosshair()) toggleSit(); else tryInteract();
    }
  }
  if (event.code === "KeyF") {
  if (isDragging()) {
    stopDrag();
  }
}
  if (event.code === "KeyN") tryTalkNPC();
  if (event.code === "KeyF") showProjectOverlay();
});
window.addEventListener("keyup", (e) => { state.keys[e.code] = false; });

document.addEventListener("click", () => {
  if (controls.isLocked) return;
  const loginHidden = document.getElementById("overlay").hidden;
  if (loginHidden) { try { controls.lock(); } catch {} }
  if (!state.voiceStarted && loginHidden) {
    state.voiceStarted = true;
    initVoice((to, data) => send("rtc_signal", { to, data })).then((ok) => {
      if (!ok) { state.voiceStarted = false; }
      else {
        for (const id of state.otherPlayers.keys()) connectPeer(state.selfId, id);
        refreshVoiceButtons();
      }
    });
  }
});

window.addEventListener("resize", () => {
  // camera/renderer живут в scene.js; пересчёт делаем через экспорт
  import("./scene.js").then(({ camera, renderer }) => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
});