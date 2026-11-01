// npc-models.js
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export class NPCModelManager {
  constructor(scene) {
    this.scene = scene;
    this.templates = {};
    this.animations = {};
    this.mixers = new Map();
    this.isLoading = false;
    this.isLoaded = false;
    this.loadedCount = 0;
    this.totalModels = 0;
  }

  async loadModels(modelPaths) {
    if (this.isLoading) {
      return new Promise((resolve) => {
        const check = () => {
          if (this.isLoaded) resolve();
          else setTimeout(check, 100);
        };
        check();
      });
    }

    this.isLoading = true;
    this.totalModels = modelPaths.length;
    this.loadedCount = 0;

    const promises = modelPaths.map((path) => {
      return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.load(
          path,
          (gltf) => {
            this.templates[path] = gltf.scene;
            if (gltf.animations && gltf.animations.length > 0) {
              gltf.animations.forEach((clip) => {
                this.animations[clip.name.toLowerCase()] = clip;
              });
            }
            this.loadedCount++;
            console.log(`📦 Загружено моделей: ${this.loadedCount}/${this.totalModels}`);
            if (this.loadedCount === this.totalModels) {
              this.isLoaded = true;
              this.isLoading = false;
              console.log("✅ Все GLB модели загружены! Анимации:", Object.keys(this.animations));
              resolve();
            }
          },
          undefined,
          (error) => {
            console.error(`❌ Ошибка загрузки ${path}:`, error);
            reject(error);
          }
        );
      });
    });

    await Promise.all(promises);
  }

  createNPC(npcData, position, isBoss = false, isSeated = true) {
    let modelPath;
    if (isBoss) {
      modelPath = "/models/npc-boss.glb";
    } else {
      const workerModels = [
        "/models/character-a.glb", "/models/character-b.glb", "/models/character-c.glb",
        "/models/character-d.glb", "/models/character-e.glb", "/models/character-f.glb",
        "/models/character-g.glb", "/models/character-h.glb", "/models/character-i.glb",
        "/models/character-j.glb", "/models/character-k.glb", "/models/character-l.glb",
        "/models/character-m.glb"
      ];
      const index = npcData.id % workerModels.length;
      modelPath = workerModels[index];
    }

    const template = this.templates[modelPath];
    if (!template) {
      console.warn(`⚠️ Модель не найдена: ${modelPath}`);
      return null;
    }

    const mesh = template.clone();
    const scale = isBoss ? 1.0 : 0.9;
    mesh.scale.set(scale, scale, scale);
    mesh.position.set(position.x, 0, position.z);

    mesh.rotation.y = Math.PI;
    if (npcData.rotation) {
      mesh.rotation.y += npcData.rotation;
    }

    mesh.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (!child.material.map || (child.material.map && !child.material.map.image)) {
          child.material = new THREE.MeshStandardMaterial({
            color: isBoss ? 0xf472b6 : 0x60a5fa,
            roughness: 0.8,
            metalness: 0.1
          });
        }
      }
    });

    mesh.userData.npc = npcData;

    const bbox = new THREE.Box3().setFromObject(mesh);
    if (isSeated) {
      mesh.position.y = -bbox.min.y - 0.15;
    } else {
      mesh.position.y = -bbox.min.y;
    }

    const mixer = new THREE.AnimationMixer(mesh);
    let targetAnim = isSeated ? "sit" : "idle";

    let clip = this.animations[targetAnim];
    if (!clip) {
      const keys = Object.keys(this.animations);
      clip = this.animations[keys.find(k => k.includes(targetAnim))] || this.animations[keys[0]];
    }

    if (clip) {
      const action = mixer.clipAction(clip);
      action.play();
      if (isBoss) action.timeScale = 0.8;
    }

    this.mixers.set(npcData.id, mixer);
    return mesh;
  }

  createPlayer(username, position) {
    // Проверяем, загружены ли модели
    if (!this.isLoaded || Object.keys(this.templates).length === 0) {
      console.warn(`⚠️ Модели ещё не загружены для игрока ${username}`);
      return null;
    }

    const letters = "defghijklm";
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % letters.length;
    const charLetter = letters[index];
    const modelPath = `/models/character-${charLetter}.glb`;

    const template = this.templates[modelPath] || this.templates["/models/character-a.glb"];
    if (!template) {
      console.warn(`⚠️ Модель игрока не найдена: ${modelPath}`);
      return null;
    }

    const mesh = template.clone();
    mesh.scale.set(0.9, 0.9, 0.9);
    mesh.position.set(position.x, 0, position.z);

    const bbox = new THREE.Box3().setFromObject(mesh);
    mesh.position.y = -bbox.min.y;

    mesh.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (!child.material.map || (child.material.map && !child.material.map.image)) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x22d3ee,
            roughness: 0.8
          });
        }
      }
    });

    const mixer = new THREE.AnimationMixer(mesh);
    this.mixers.set(`player_${username}`, mixer);

    const idleClip = this.animations["idle"] || this.animations["static"] || this.animations[Object.keys(this.animations)[0]];
    if (idleClip) {
      mixer.clipAction(idleClip).play();
    }

    console.log(`✅ GLB модель создана для игрока ${username}`);
    return mesh;
  }

  setPlayerAnimation(username, isMoving) {
    const mixer = this.mixers.get(`player_${username}`);
    if (!mixer) return;

    const animName = isMoving ? "walk" : "idle";
    const clip = this.animations[animName] || this.animations["static"] || this.animations[Object.keys(this.animations)[0]];
    if (!clip) return;

    const currentActions = mixer._actions;
    const currentClip = currentActions && currentActions.length > 0 ? currentActions[0].getClip() : null;
    if (currentClip === clip) return;

    const newAction = mixer.clipAction(clip);
    newAction.reset();
    newAction.fadeIn(0.2);
    newAction.play();

    if (currentActions && currentActions.length > 0) {
      currentActions[0].fadeOut(0.2);
    }
  }

  playAnimation(npcId, animName, fadeIn = 0.2) {
    const mixer = this.mixers.get(npcId);
    if (!mixer) return false;

    let clip = this.animations[animName.toLowerCase()];
    if (!clip) {
      const keys = Object.keys(this.animations);
      clip = this.animations[keys.find(k => k.toLowerCase().includes(animName.toLowerCase()))];
    }

    if (!clip) return false;

    const action = mixer.clipAction(clip);
    mixer.stopAllAction();
    action.reset();
    action.fadeIn(fadeIn);
    action.play();
    return true;
  }

  update(delta) {
    for (const mixer of this.mixers.values()) {
      mixer.update(delta);
    }
  }

  setLocalPlayerAnimation(isMoving, isSeated) {
    const mixer = this.mixers.get("local_player");
    if (!mixer) return;

    let targetAnim = "idle";
    if (isSeated) targetAnim = "sit";
    else if (isMoving) targetAnim = "walk";

    let clip = this.animations[targetAnim];
    if (!clip) {
      const keys = Object.keys(this.animations);
      clip = this.animations[keys.find(k => k.toLowerCase().includes(targetAnim))];
    }
    if (!clip) clip = this.animations[Object.keys(this.animations)[0]];

    mixer.stopAllAction();
    const newAction = mixer.clipAction(clip);
    newAction.reset();
    newAction.time = 0;
    newAction.loop = THREE.LoopRepeat;
    newAction.clampWhenFinished = false;
    newAction.play();
  }
}