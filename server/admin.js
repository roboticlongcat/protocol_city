// Админ-модуль: метрики клиентов + редактирование вселенной + управление агентами.
// Все зависимости инжектятся из game.js, чтобы не создавать циклических импортов.

const ALLOWED = {
  npc: ["name", "role", "personality", "model", "behavior", "department_id"],
  department: ["name", "description", "max_players", "color", "x", "y", "z", "radius", "slug"],
  task: ["title", "description", "difficulty", "reward_points", "department_id"],
  activity: ["kind", "data"],
};

function safeJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function createAdmin({ db, sendJSON, broadcast, clients, getFlags, getPlayerDepartment, getDepartmentsWithOccupancy }) {
  // userId -> { fps, pingMs, sentAt, username, dept, zone }
  const metrics = new Map();
  const startedAt = Date.now();

  function adminSockets() {
    const arr = [];
    for (const [, ws] of clients.entries()) if (ws.isAdmin) arr.push(ws);
    return arr;
  }

  function recordMetrics(userId, data) {
    const ws = clients.get(userId);
    if (!ws) return;
    const dept = getPlayerDepartment(db, userId);
    const state = db.prepare("SELECT zone FROM player_states WHERE user_id=?").get(userId);
    metrics.set(userId, {
      fps: Number(data.fps) || 0,
      pingMs: Number(data.pingMs) ?? null,
      sentAt: Date.now(),
      username: ws.username,
      dept: dept ? dept.name : "—",
      zone: state ? state.zone : "—",
    });
    broadcastMetrics();
  }

  function aggregate() {
    const rows = [...metrics.values()];
    const now = Date.now();
    const live = rows.filter((r) => now - r.sentAt < 6000); // «живые» за 6 с
    const fps = live.map((r) => r.fps).filter((n) => n > 0);
    const pings = live.map((r) => r.pingMs).filter((n) => n != null).sort((a, b) => a - b);
    const p95 = pings.length ? pings[Math.min(pings.length - 1, Math.floor(pings.length * 0.95))] : null;
    const mem = process.memoryUsage();
    return {
      online: clients.size,
      admins: adminSockets().length,
      liveClients: live.length,
      avgFps: fps.length ? Math.round(fps.reduce((a, b) => a + b, 0) / fps.length) : 0,
      minFps: fps.length ? Math.min(...fps) : 0,
      p95Ping: p95,
      avgPing: pings.length ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : null,
      uptimeSec: Math.round((now - startedAt) / 1000),
      rssMb: Math.round(mem.rss / 1048576),
      heapMb: Math.round(mem.heapUsed / 1048576),
      serverTime: new Date().toISOString(),
    };
  }

  function broadcastMetrics() {
    const payload = {
      type: "admin_metrics",
      agg: aggregate(),
      clients: [...metrics.entries()].map(([id, m]) => ({ id, ...m })),
    };
    for (const ws of adminSockets()) sendJSON(ws, "admin_metrics", { agg: payload.agg, clients: payload.clients });
  }

  function fullSnapshot() {
    const world = safeJson(db.prepare("SELECT data FROM world_config WHERE id=1").get()?.data || "{}", {});
    return {
      world,
      departments: db.prepare("SELECT * FROM departments").all(),
      npcs: db.prepare("SELECT * FROM npcs").all(),
      tasks: db.prepare("SELECT * FROM tasks").all(),
      activities: db.prepare("SELECT * FROM activities").all(),
      metrics: { agg: aggregate(), clients: [...metrics.entries()].map(([id, m]) => ({ id, ...m })) },
      online: [...clients.entries()].map(([id, ws]) => ({ id, username: ws.username, isAdmin: !!ws.isAdmin })),
    };
  }

  function patch(table, id, fields, patchObj) {
    const cols = [];
    const vals = [];
    for (const [k, v] of Object.entries(patchObj || {})) {
      if (!fields.includes(k)) continue;          // белый список
      if (v === undefined) continue;
      cols.push(`${k} = ?`);
      vals.push(typeof v === "object" ? JSON.stringify(v) : v);
    }
    if (!cols.length) return { ok: false, reason: "no_allowed_fields" };
    vals.push(id);
    const info = db.prepare(`UPDATE ${table} SET ${cols.join(", ")} WHERE id = ?`).run(...vals);
    return { ok: info.changes > 0 };
  }

  function handleAdminMessage(ws, msg) {
    if (!ws.isAdmin) { sendJSON(ws, "game_event", { message: "Нет прав администратора." }); return; }

    if (msg.type === "admin_get_snapshot") {
      sendJSON(ws, "admin_snapshot", fullSnapshot());
      return;
    }

    if (msg.type === "admin_update_npc") {
      const r = patch("npcs", msg.id, ALLOWED.npc, msg.patch);
      broadcast("game_event", { message: `Админ обновил NPC #${msg.id}` });
      sendJSON(ws, "admin_ack", { ok: r.ok, action: "npc", id: msg.id });
      // NPC поменялись -> пересобрать мир у всех игроков
      broadcast("departments_updated", { departments: getDepartmentsWithOccupancy(db) });
      return;
    }

    if (msg.type === "admin_update_department") {
      const r = patch("departments", msg.id, ALLOWED.department, msg.patch);
      sendJSON(ws, "admin_ack", { ok: r.ok, action: "department", id: msg.id });
      broadcast("departments_updated", { departments: getDepartmentsWithOccupancy(db) });
      return;
    }

    if (msg.type === "admin_update_task") {
      const r = patch("tasks", msg.id, ALLOWED.task, msg.patch);
      sendJSON(ws, "admin_ack", { ok: r.ok, action: "task", id: msg.id });
      return;
    }

    if (msg.type === "admin_update_activity") {
      // activity привязан к task_id, не к своему id
      const cols = []; const vals = [];
      for (const k of ALLOWED.activity) {
        if (msg.patch && msg.patch[k] !== undefined) {
          cols.push(`${k} = ?`);
          vals.push(typeof msg.patch[k] === "object" ? JSON.stringify(msg.patch[k]) : msg.patch[k]);
        }
      }
      if (cols.length) {
        vals.push(msg.taskId);
        db.prepare(`UPDATE activities SET ${cols.join(", ")} WHERE task_id = ?`).run(...vals);
      }
      sendJSON(ws, "admin_ack", { ok: true, action: "activity", taskId: msg.taskId });
      return;
    }

    if (msg.type === "admin_create_activity") {
        const taskId = Number(msg.taskId);
        const task = db.prepare("SELECT id FROM tasks WHERE id = ?").get(taskId);
        if (!task) {
            sendJSON(ws, "admin_ack", { ok: false, action: "create_activity", reason: "task not found" });
            return;
        }
        const kind = String(msg.kind || "quiz");
        const data = JSON.stringify(msg.data || {});
        const existing = db.prepare("SELECT id FROM activities WHERE task_id = ?").get(taskId);
        if (existing) {
            db.prepare("UPDATE activities SET kind = ?, data = ? WHERE task_id = ?").run(kind, data, taskId);
        } else {
            db.prepare("INSERT INTO activities (task_id, kind, data) VALUES (?, ?, ?)").run(taskId, kind, data);
        }
        sendJSON(ws, "admin_ack", { ok: true, action: "create_activity", taskId: taskId });
        return;
    }

    if (msg.type === "admin_set_world") {
      const cur = safeJson(db.prepare("SELECT data FROM world_config WHERE id=1").get()?.data || "{}", {});
      const next = { ...cur, ...(msg.patch || {}) };
      db.prepare("INSERT OR REPLACE INTO world_config (id, data) VALUES (1, ?)").run(JSON.stringify(next));
      sendJSON(ws, "admin_ack", { ok: true, action: "world" });
      // разошём новый мир всем игрокам отдельным событием
      broadcast("world_updated", { world: next });
      return;
    }

    if (msg.type === "admin_force_event") {
      // фундамент под расписание/события: пока рассылаем как game_event + флаг в world
      const cur = safeJson(db.prepare("SELECT data FROM world_config WHERE id=1").get()?.data || "{}", {});
      cur.events = { ...(cur.events || {}), [msg.event]: msg.on !== false };
      db.prepare("INSERT OR REPLACE INTO world_config (id, data) VALUES (1, ?)").run(JSON.stringify(cur));
      broadcast("game_event", { message: `⚡ Событие админа: ${msg.event} = ${msg.on !== false}` });
      broadcast("world_updated", { world: cur });
      sendJSON(ws, "admin_ack", { ok: true, action: "force_event" });
      return;
    }

    if (msg.type === "admin_kick") {
      const target = clients.get(msg.userId);
      if (target) { try { target.close(4000, "kicked by admin"); } catch {} }
      metrics.delete(msg.userId);
      sendJSON(ws, "admin_ack", { ok: true, action: "kick", userId: msg.userId });
      broadcastMetrics();
      return;
    }

    if (msg.type === "admin_broadcast") {
      broadcast("game_event", { message: `📢 ${msg.message || ""}` });
      sendJSON(ws, "admin_ack", { ok: true, action: "broadcast" });
      return;
    }
  }

  function cleanupUser(userId) { metrics.delete(userId); broadcastMetrics(); }

  return { handleAdminMessage, recordMetrics, broadcastMetrics, fullSnapshot, cleanupUser, aggregate };
}

module.exports = { createAdmin };