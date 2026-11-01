// FPS + ping игрового клиента, отправка на сервер раз в ~1с.
let rafLast = performance.now();
let frames = 0;
let fpsAccum = 0;
let fps = 0;
let pingMs = null;
let pendingPing = null;
let sendFn = null;
let timer = null;

export function initMetrics(send) { sendFn = send; }

// вызывать каждый кадр из animate()
export function tickFps(now = performance.now()) {
  frames++;
  const dt = now - rafLast;
  if (dt >= 1000) {
    fps = Math.round((frames * 1000) / dt);
    frames = 0; rafLast = now;
  }
}

// сервер прислал client_pong -> считаем RTT
export function onPong(ts) {
  if (pendingPing != null && ts === pendingPing) {
    pingMs = Math.round(performance.now() - pendingPingStart);
    pendingPing = null;
  }
}
let pendingPingStart = 0;
function doPing() {
  if (!sendFn) return;
  pendingPing = Date.now();
  pendingPingStart = performance.now();
  sendFn("client_ping", { ts: pendingPing });
}

export function startMetricsLoop() {
  if (timer) return;
  timer = setInterval(() => {
    doPing();
    if (sendFn) sendFn("metrics_report", { fps, pingMs });
  }, 1000);
}
export function stopMetricsLoop() { if (timer) { clearInterval(timer); timer = null; } }
export function currentFps() { return fps; }