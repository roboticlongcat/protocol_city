// ============================================================
// ГОЛОСОВОЙ ЧАТ: WebRTC mesh + пространственный звук в 3D-офисе
// Сигнализация идёт через твой WebSocket (type: rtc_signal).
// ============================================================

let ctx = null;            // AudioContext
let masterGain = null;     // deafen-рубильник
let localStream = null;
let micEnabled = true;
let deafEnabled = false;
let sendSignal = null;     // (to, data) => void, внедряется из main.js

// userId -> { pc, panner, source, gain, stream }
const peers = new Map();

// Настройки затухания: в пределах комнаты слышно, дальше — тихо
const REF_DIST = 2;        // на этом расстоянии громкость ~100%
const MAX_DIST = 28;       // дальше почти не слышно
const ROLLOFF = 1.1;       // крутизна спада

export function isReady() { return !!ctx && !!localStream; }
export function micOn() { return micEnabled; }
export function deafOn() { return deafEnabled; }

// Инициализация по жесту пользователя (клик / кнопка). AudioContext
// без user gesture не стартует — это требование браузеров.
export async function initVoice(signalSender) {
  sendSignal = signalSender;
  if (ctx) return true;

  ctx = new (window.AudioContext || window.webkitAudioContext)();
  await ctx.resume();

  masterGain = ctx.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(ctx.destination);

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,   // критично: иначе фидбек от колонок
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch (e) {
    console.error("Микрофон недоступен:", e);
    return false;
  }
  return true;
}

// Правило, кто кидает offer: меньший id = offerer. Обе стороны
// применяют одно правило -> нет гонки offer/answer.
function shouldOffer(myId, otherId) {
  return Number(myId) < Number(otherId);
}

function makePanner() {
  const panner = ctx.createPanner();
  panner.panningModel = "HRTF";          // бинауралка: «с той стороны»
  panner.distanceModel = "inverse";
  panner.refDistance = REF_DIST;
  panner.maxDistance = MAX_DIST;
  panner.rolloffFactor = ROLLOFF;
  return panner;
}

// Создание RTCPeerConnection для пары (me <-> otherId)
export async function connectPeer(myId, otherId) {
  if (peers.has(otherId) || !localStream) return;

  const pc = new RTCPeerConnection({ iceServers: [] }); // LAN: STUN не нужен
  peers.set(otherId, { pc, panner: null, source: null, gain: null, stream: null });

  // отправляем свой микрофон в соединение
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

  pc.onicecandidate = (e) => {
    if (e.candidate && sendSignal) {
      sendSignal(otherId, { candidate: e.candidate.toJSON() });
    }
  };

  pc.ontrack = (e) => {
    const p = peers.get(otherId);
    if (!p) return;
    p.stream = e.streams[0];
    p.source = ctx.createMediaStreamSource(p.stream);
    p.pan = makePanner();
    p.gain = ctx.createGain();
    p.gain.gain.value = deafEnabled ? 0 : 1;
    p.source.connect(p.pan).connect(p.gain).connect(masterGain);
  };

  if (shouldOffer(myId, otherId)) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (sendSignal) sendSignal(otherId, { sdp: pc.localDescription });
  }
  // иначе ждём offer от другого — он сам создаст answer
}

// Разрыв соединения (игрок вышел / мы ушли)
export function disconnectPeer(otherId) {
  const p = peers.get(otherId);
  if (!p) return;
  try { p.pc && p.pc.close(); } catch {}
  try { p.source && p.source.disconnect(); } catch {}
  try { p.pan && p.pan.disconnect(); } catch {}
  try { p.gain && p.gain.disconnect(); } catch {}
  peers.delete(otherId);
}

// Приём сигнального пакета от сервера
export async function handleSignal(fromId, data) {
  let p = peers.get(fromId);
  if (!p) {
    // нам прилетел offer от того, с кем мы ещё не соединены (гонка join)
    await connectPeer(window.__myId, fromId);
    p = peers.get(fromId);
    if (!p) return;
  }
  const pc = p.pc;

  if (data.sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    if (data.sdp.type === "offer") {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (sendSignal) sendSignal(fromId, { sdp: pc.localDescription });
    }
  } else if (data.candidate) {
    try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); }
    catch (e) { console.warn("ICE candidate skip", e); }
  }
}

// Вызывается каждый кадр из main.js: слушаем камерой, говорим позициями
export function updateSpatial(otherPlayersMap) {
  if (!ctx) return;

  // позиция/ориентация слушателя = камера игрока
  const L = ctx.listener;
  if (L.positionX) {
    L.positionX.value = window.__cam.x;
    L.positionY.value = window.__cam.y;
    L.positionZ.value = window.__cam.z;
    L.forwardX.value = window.__camDir.x;
    L.forwardY.value = window.__camDir.y;
    L.forwardZ.value = window.__camDir.z;
    L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
  } else if (L.setPosition) {
    L.setPosition(window.__cam.x, window.__cam.y, window.__cam.z);
    L.setOrientation(window.__camDir.x, window.__camDir.y, window.__camDir.z, 0, 1, 0);
  }

  // позиция каждого говорящего = меш другого игрока
  for (const [id, p] of peers.entries()) {
    if (!p.pan) continue;
    const rec = otherPlayersMap.get(id);
    if (!rec) continue;
    const pos = rec.mesh.position;
    if (p.pan.positionX) {
      p.pan.positionX.value = pos.x;
      p.pan.positionY.value = pos.y + 1.4; // уровень рта
      p.pan.positionZ.value = pos.z;
    } else if (p.pan.setPosition) {
      p.pan.setPosition(pos.x, pos.y + 1.4, pos.z);
    }
  }
}

export function toggleMic() {
  if (!localStream) return micEnabled;
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach((t) => (t.enabled = micEnabled));
  return micEnabled;
}

export function toggleDeafen() {
  deafEnabled = !deafEnabled;
  if (masterGain) masterGain.gain.value = deafEnabled ? 0 : 1;
  return deafEnabled;
}