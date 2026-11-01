import * as THREE from "three";
import { scene } from "./scene.js";
import { state } from "./state.js";

export function createNameSprite(name, color = "#22d3ee") {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 512; canvas.height = 128;
  ctx.font = "bold 64px system-ui, sans-serif";
  const tw = ctx.measureText(name).width;
  const pad = 30, bw = tw + pad * 2, bx = (canvas.width - bw) / 2;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath(); ctx.roundRect(bx, 20, bw, 88, 16); ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(name, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(2.5, 0.625, 1);
  sprite.center.set(0.5, 0);
  return sprite;
}

export function makeLabel(text, scale = [9, 2.2]) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 40px system-ui, sans-serif";
  ctx.fillStyle = "white";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
  sprite.scale.set(scale[0], scale[1], 1);
  return sprite;
}

export function setLocalPlayerName(name) {
  if (state.localNameSprite) scene.remove(state.localNameSprite);
  state.localNameSprite = createNameSprite(name, "#22d3ee");
  scene.add(state.localNameSprite);
  syncLocalName();
}

export function syncLocalName() {
  if (state.localNameSprite) {
    state.localNameSprite.position.set(state.player.x, state.player.y + 2.3, state.player.z);
  }
}