export const USE_TLS = true;
export const SERVER_HOST = location.hostname || "localhost";
export const API = `${USE_TLS ? "https" : "http"}://${SERVER_HOST}:8080`;
export const WS = `${USE_TLS ? "wss" : "ws"}://${SERVER_HOST}:8080`;

// физика игрока
export const GRAVITY = 20;
export const JUMP_V = 6.5;
export const MOVE_SPEED = 4.0;
export const STAND_EYE = 1.7;
export const SIT_EYE = 1.2;
export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 1.7;
export const INTERACT_DIST = 3.2;
export const NPC_DIST = 3.0;