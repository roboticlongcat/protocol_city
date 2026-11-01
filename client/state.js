// Единый источник мутируемого состояния + отправка сообщений на сервер.
// Все модули шлют через send(), поэтому никто не импортирует net "обратно".
export const state = {
  socket: null,
  selfId: null,
  voiceStarted: false,
  currentUsername: "",

  departments: [],
  npcs: [],
  playerDepartment: null,
  activeTask: null,
  project: null,
  points: 0,

  currentActivity: null,
  actState: null,

  pcOpen: false,            // был pcScreen.style.display
  currentPcMonitor: null,
  talkingNpc: null,
  localNameSprite: null,

  keys: {},
  player: {
    x: 0, y: 0, z: 8, vy: 0,
    onGround: true, seated: false, seatChair: null,
    eyeHeight: 1.7,
  },

  otherPlayers: new Map(),  // id -> { mesh, nameSprite, username }
  npcMeshes: [],
  interactables: [],
};

export function send(type, payload = {}) {
  const ws = state.socket;
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}