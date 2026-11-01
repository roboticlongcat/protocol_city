import { scene, camera, renderer } from "./scene.js";
import { state } from "./state.js";
import { updateMovement, startPositionSync } from "./movement.js";
import { updateSpatial } from "./voice.js";
import { tickFps } from "./metrics.js";

// side-effect импорты: модули вешают DOM-обработчики при загрузке
import "./net.js";
import "./ui.js";
import "./computer.js";
import "./activities.js";
import "./npc-chat.js";
import "./project.js";
import "./departments.js";
import "./interaction.js";
import "./input.js";

let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  tickFps(now);                       // <<< скользсреднее FPS каждый кадр
  updateMovement(delta);
  renderer.render(scene, camera);
  if (state.voiceStarted) updateSpatial(state.otherPlayers);
  const nicksOn = state.showNicks !== false;
  if (state.localNameSprite) state.localNameSprite.visible = nicksOn;
  for (const p of state.otherPlayers.values()) {
    if (p.nameSprite) p.nameSprite.visible = nicksOn;
  }
}
animate();
startPositionSync();