import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { buildOffice } from "./office.js";
import { STAND_EYE } from "./config.js";
import { state } from "./state.js";

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.Fog(0x05070d, 60, 140);

export const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(state.player.x, state.player.y + STAND_EYE, state.player.z);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

export const controls = new PointerLockControls(camera, document.body);

scene.add(new THREE.AmbientLight(0xffffff, 0.65));
export const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(30, 60, 20);
sun.castShadow = true;
scene.add(sun);

buildOffice(scene);

export const playerBody = new THREE.Object3D();
playerBody.position.set(state.player.x, 0, state.player.z);
scene.add(playerBody);

export const localPlayer = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.4, 1.0, 4, 12),
  new THREE.MeshStandardMaterial({ color: 0x22d3ee })
);
localPlayer.position.set(state.player.x, state.player.y + 0.9, state.player.z);
scene.add(localPlayer);

export const deptGroup = new THREE.Group();
export const objectGroup = new THREE.Group();
export const npcGroup = new THREE.Group();
scene.add(deptGroup, objectGroup, npcGroup);

// Позиционирование объектов сцены по state.player. syncLocalName НЕ вызываем
// здесь, иначе scene <-> sprites цикл; его дёргает тот, кто двигает игрока.
export function applyPlayerTransforms() {
  playerBody.position.set(state.player.x, 0, state.player.z);
  localPlayer.position.set(state.player.x, state.player.y + 0.9, state.player.z);
  camera.position.set(state.player.x, state.player.y + state.player.eyeHeight, state.player.z);
}