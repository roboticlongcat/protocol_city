const { WebSocketServer } = require("ws");
const { askNPC } = require("./npc");

const clients = new Map();
const positions = new Map();

function sendJSON(ws, type, payload) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function broadcast(type, payload, exceptUserId = null) {
  for (const [userId, ws] of clients.entries()) {
    if (exceptUserId && userId === exceptUserId) continue;
    sendJSON(ws, type, payload);
  }
}

function loadPlayerState(db, userId) {
  return db
    .prepare("SELECT * FROM player_states WHERE user_id = ?")
    .get(userId);
}

function savePosition(db, userId, position) {
  db.prepare(
    `
    UPDATE player_states
    SET x = ?, y = ?, z = ?, rot_y = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `
  ).run(
    position.x || 0,
    position.y || 0,
    position.z || 0,
    position.rotY || 0,
    userId
  );
}

function getFlags(db, userId) {
  const row = db
    .prepare("SELECT flags FROM player_states WHERE user_id = ?")
    .get(userId);

  try {
    return JSON.parse(row?.flags || "{}");
  } catch {
    return {};
  }
}

function saveFlags(db, userId, flags) {
  db.prepare("UPDATE player_states SET flags = ? WHERE user_id = ?").run(
    JSON.stringify(flags),
    userId
  );
}

function setMissionStep(db, userId, missionSlug, step, completed = 0) {
  const mission = db
    .prepare("SELECT id FROM missions WHERE slug = ?")
    .get(missionSlug);

  if (!mission) return;

  db.prepare(
    `
    INSERT INTO mission_progress (user_id, mission_id, step, completed)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, mission_id)
    DO UPDATE SET
      step = excluded.step,
      completed = excluded.completed,
      updated_at = CURRENT_TIMESTAMP
  `
  ).run(userId, mission.id, step, completed);
}

function logRequest(db, userId, method, path, status, payload = {}) {
  return db
    .prepare(
      `
      INSERT INTO requests_log (user_id, method, path, status, payload)
      VALUES (?, ?, ?, ?, ?)
    `
    )
    .run(userId, method, path, status, JSON.stringify(payload));
}

function handleInteract(db, ws, objectId) {
  const flags = getFlags(db, ws.userId);

  if (objectId === "browser_terminal") {
    const packetId = `req_${Date.now()}`;
    const hasToken = Boolean(flags.authToken);

    const requestInfo = logRequest(db, ws.userId, "GET", "/api/hello", 0, {
      packetId,
      hasToken,
    });

    broadcast("packet_spawn", {
      packet: {
        id: packetId,
        method: "GET",
        path: "/api/hello",
        username: ws.username,
      },
      route: ["browser", "dns", "firewall", "server"],
    });

    broadcast("game_event", {
      message: `${ws.username} отправил запрос: GET /api/hello`,
    });

    setTimeout(() => {
      if (!hasToken) {
        db.prepare("UPDATE requests_log SET status = 401 WHERE id = ?").run(
          requestInfo.lastInsertRowid
        );

        broadcast("request_result", {
          packetId,
          status: 401,
          message: "401 Unauthorized: сервер требует авторизацию",
        });

        setMissionStep(db, ws.userId, "first_request", 1);

        broadcast("game_event", {
          message: `${ws.username} получил 401. Нужно получить токен на терминале авторизации.`,
        });
      } else {
        db.prepare("UPDATE requests_log SET status = 200 WHERE id = ?").run(
          requestInfo.lastInsertRowid
        );

        broadcast("request_result", {
          packetId,
          status: 200,
          message: "200 OK: запрос успешно обработан",
        });

        setMissionStep(db, ws.userId, "first_request", 3, 1);

        broadcast("game_event", {
          message: `${ws.username} прошёл миссию "Первый запрос"`,
        });
      }
    }, 2500);
  }

  if (objectId === "auth_terminal") {
    flags.authToken = `demo-token-${Date.now()}`;
    saveFlags(db, ws.userId, flags);

    setMissionStep(db, ws.userId, "first_request", 2);

    sendJSON(ws, "game_event", {
      message:
        "Вы получили токен авторизации. Теперь снова отправьте запрос через браузерный терминал.",
    });

    broadcast(
      "game_event",
      {
        message: `${ws.username} получил токен авторизации`,
      },
      ws.userId
    );
  }
}

async function handleNpcAsk(db, ws, npcId, message) {
  const npc = db.prepare("SELECT * FROM npcs WHERE id = ?").get(npcId);

  if (!npc) return;

  db.prepare(
    `
    INSERT INTO npc_dialogues (user_id, npc_id, role, content)
    VALUES (?, ?, 'user', ?)
  `
  ).run(ws.userId, npcId, message);

  let reply;

  try {
    reply = await askNPC(npc, message, {
      username: ws.username,
      flags: getFlags(db, ws.userId),
    });
  } catch (error) {
    console.error(error);
    reply =
      "Локальная модель недоступна. Проверь, запущен ли 'ollama serve' и установлена ли модель.";
  }

  db.prepare(
    `
    INSERT INTO npc_dialogues (user_id, npc_id, role, content)
    VALUES (?, ?, 'assistant', ?)
  `
  ).run(ws.userId, npcId, reply);

  sendJSON(ws, "npc_reply", {
    npcId,
    name: npc.name,
    text: reply,
  });
}

function setupGame(server, verifyToken, db) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");

    try {
      const payload = verifyToken(token);
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req, payload);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on("connection", (ws, req, payload) => {
    const userId = payload.sub;
    const username = payload.username;

    ws.userId = userId;
    ws.username = username;

    clients.set(userId, ws);

    const state = loadPlayerState(db, userId);
    const position = {
      x: state?.x || 0,
      y: state?.y || 0,
      z: state?.z || 0,
      rotY: state?.rot_y || 0,
    };

    positions.set(userId, position);

    const zones = db.prepare("SELECT * FROM zones").all();
    const npcs = db.prepare("SELECT * FROM npcs").all();

    const missions = db
      .prepare(
        `
        SELECT
          m.*,
          mp.step AS step,
          COALESCE(mp.completed, 0) AS completed
        FROM missions m
        LEFT JOIN mission_progress mp
          ON mp.mission_id = m.id AND mp.user_id = ?
      `
      )
      .all(userId);

    const otherPlayers = [];

    for (const [otherId, client] of clients.entries()) {
      if (otherId === userId) continue;

      otherPlayers.push({
        id: otherId,
        username: client.username,
        position: positions.get(otherId) || { x: 0, y: 0, z: 0 },
      });
    }

    sendJSON(ws, "welcome", {
      selfId: userId,
      username,
      position,
      zones,
      npcs,
      missions,
      otherPlayers,
    });

    broadcast(
      "player_joined",
      {
        id: userId,
        username,
        position,
      },
      userId
    );

    const saveInterval = setInterval(() => {
      const pos = positions.get(userId);
      if (pos) savePosition(db, userId, pos);
    }, 5000);

    ws.on("message", async (raw) => {
      let msg;

      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.type === "move") {
        positions.set(userId, {
          x: msg.position?.x || 0,
          y: msg.position?.y || 0,
          z: msg.position?.z || 0,
          rotY: msg.rotationY || 0,
        });

        broadcast(
          "player_moved",
          {
            id: userId,
            position: msg.position,
            rotationY: msg.rotationY || 0,
          },
          userId
        );
      }

      if (msg.type === "interact") {
        handleInteract(db, ws, msg.objectId);
      }

      if (msg.type === "npc_ask") {
        await handleNpcAsk(db, ws, msg.npcId, msg.message);
      }
    });

    ws.on("close", () => {
      clearInterval(saveInterval);

      const pos = positions.get(userId) || position;
      savePosition(db, userId, pos);

      clients.delete(userId);
      positions.delete(userId);

      broadcast("player_left", {
        id: userId,
      });
    });
  });
}

module.exports = { setupGame };