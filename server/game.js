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
  return db.prepare("SELECT * FROM player_states WHERE user_id = ?").get(userId);
}

function savePosition(db, userId, position) {
  db.prepare(`
    UPDATE player_states
    SET x = ?, y = ?, z = ?, rot_y = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(
    position.x || 0,
    position.y || 0,
    position.z || 0,
    position.rotY || 0,
    userId
  );
}

function getFlags(db, userId) {
  const row = db.prepare("SELECT flags FROM player_states WHERE user_id = ?").get(userId);
  try {
    return JSON.parse(row?.flags || "{}");
  } catch {
    return {};
  }
}

function saveFlags(db, userId, flags) {
  db.prepare("UPDATE player_states SET flags = ? WHERE user_id = ?")
    .run(JSON.stringify(flags), userId);
}

// Получаем информацию об отделе и количестве занятых мест
function getDepartmentsWithOccupancy(db) {
  return db.prepare(`
    SELECT 
      d.*,
      COUNT(da.user_id) AS current_players
    FROM departments d
    LEFT JOIN department_assignments da ON da.department_id = d.id
    GROUP BY d.id
  `).all();
}

// Проверяем, может ли игрок войти в отдел
function canJoinDepartment(db, userId, departmentId) {
  const currentAssignment = db
    .prepare("SELECT * FROM department_assignments WHERE user_id = ?")
    .get(userId);

  // Уже сидит в этом же отделе — менять нечего
  if (currentAssignment && currentAssignment.department_id === departmentId) {
    return { canJoin: false, reason: "same_department" };
  }

  const dept = db.prepare(`
    SELECT d.*, COUNT(da.user_id) AS current_players
    FROM departments d
    LEFT JOIN department_assignments da ON da.department_id = d.id
    WHERE d.id = ?
    GROUP BY d.id
  `).get(departmentId);

  if (!dept) return { canJoin: false, reason: "not_found" };

  // Своё текущее место при переходе освободится, поэтому >=
  if (dept.current_players >= dept.max_players) {
    return { canJoin: false, reason: "department_full" };
  }

  return { canJoin: true, department: dept };
}

// Назначить игрока в отдел
function assignToDepartment(db, userId, departmentId) {
  db.prepare(`
    INSERT INTO department_assignments (user_id, department_id, role)
    VALUES (?, ?, 'junior')
  `).run(userId, departmentId);

  // Обновляем зону игрока
  const dept = db.prepare("SELECT * FROM departments WHERE id = ?").get(departmentId);
  db.prepare(`
    UPDATE player_states SET zone = ? WHERE user_id = ?
  `).run(dept.slug, userId);

  return dept;
}

// Получить текущий отдел игрока
function getPlayerDepartment(db, userId) {
  return db.prepare(`
    SELECT d.* FROM departments d
    JOIN department_assignments da ON da.department_id = d.id
    WHERE da.user_id = ?
  `).get(userId);
}

// Получить задачи для отдела
function getDepartmentTasks(db, departmentId) {
  return db.prepare(`
    SELECT t.*, 
           (SELECT COUNT(*) FROM task_instances ti 
            WHERE ti.task_id = t.id AND ti.status = 'completed') AS completed_count
    FROM tasks t
    WHERE t.department_id = ?
    ORDER BY 
      CASE t.difficulty 
        WHEN 'easy' THEN 1 
        WHEN 'medium' THEN 2 
        WHEN 'hard' THEN 3 
      END
  `).all(departmentId);
}

// Назначить задачу игроку
function assignTask(db, userId, taskId) {
  // Проверяем, не назначена ли уже
  const existing = db.prepare(`
    SELECT * FROM task_instances 
    WHERE user_id = ? AND task_id = ? AND status IN ('pending', 'in_progress')
  `).get(userId, taskId);

  if (existing) {
    return { assigned: false, reason: "already_assigned" };
  }

  const result = db.prepare(`
    INSERT INTO task_instances (task_id, user_id, status)
    VALUES (?, ?, 'in_progress')
  `).run(taskId, userId);

  return { assigned: true, instanceId: Number(result.lastInsertRowid) };
}

// Завершить задачу
function completeTask(db, userId, taskId, success = true) {
  const result = db.prepare(`
    UPDATE task_instances 
    SET status = ?, completed_at = CURRENT_TIMESTAMP, result = ?
    WHERE user_id = ? AND task_id = ? AND status = 'in_progress'
  `).run(
    success ? "completed" : "failed",
    success ? "success" : "failed",
    userId,
    taskId
  );

  if (result.changes === 0) {
    return { completed: false, reason: "not_found" };
  }

  // Начисляем очки
  if (success) {
    const task = db.prepare("SELECT reward_points FROM tasks WHERE id = ?").get(taskId);
    const flags = getFlags(db, userId);
    flags.points = (flags.points || 0) + (task?.reward_points || 0);
    flags.completedTasks = (flags.completedTasks || 0) + 1;
    saveFlags(db, userId, flags);
    return { completed: true, pointsEarned: task?.reward_points || 0 };
  }

  return { completed: true, pointsEarned: 0 };
}

// Обработка взаимодействия с объектами
function handleInteract(db, ws, objectId) {
  console.log(`[interact] user=${ws.username} objectId=${objectId}`);

  const flags = getFlags(db, ws.userId);
  const playerDept = getPlayerDepartment(db, ws.userId);
  console.log(`[interact] playerDept=${playerDept ? playerDept.slug : "НЕТ"}`);

  if (objectId === "pm_desk") {
    if (!playerDept) {
      console.log("[interact] отказ: игрок без отдела");
      sendJSON(ws, "game_event", {
        message: "PM: Сначала выбери отдел — подойди к табличке отдела и нажми E.",
      });
      return;
    }

    const tasks = getDepartmentTasks(db, playerDept.id);
    console.log(`[interact] задач в отделе: ${tasks.length}`);

    const availableTasks = tasks.filter((t) => t.completed_count < 3);

    if (availableTasks.length === 0) {
      console.log("[interact] отказ: нет доступных задач");
      sendJSON(ws, "game_event", {
        message: "PM: Пока нет свободных задач для твоего отдела. Отдохни!",
      });
      return;
    }

    const task = availableTasks[Math.floor(Math.random() * availableTasks.length)];
    const result = assignTask(db, ws.userId, task.id);

    if (!result.assigned) {
      console.log("[interact] отказ: уже есть активная задача этого типа");
      sendJSON(ws, "game_event", {
        message: "PM: У тебя уже есть активная задача. Сначала сдай её на голубом терминале.",
      });
      return;
    }

    console.log(`[interact] задача выдана: ${task.title}`);

    sendJSON(ws, "task_assigned", {
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        difficulty: task.difficulty,
        reward_points: task.reward_points,
      },
    });

    sendJSON(ws, "game_event", {
      message: `PM: Новая задача «${task.title}». Иди на голубой терминал и нажми E.`,
    });

    broadcast("game_event", {
      message: `${ws.username} взял задачу «${task.title}»`,
    }, ws.userId);
  }
}

// Обработка выбора отдела
function handleSelectDepartment(db, ws, departmentId) {
  const check = canJoinDepartment(db, ws.userId, departmentId);

  if (!check.canJoin) {
    const messages = {
      same_department: "Ты уже состоишь в этом отделе.",
      department_full: "В этом отделе нет свободных мест.",
      not_found: "Отдел не найден.",
    };
    sendJSON(ws, "department_selection_failed", {
      reason: check.reason,
      message: messages[check.reason] || "Не получилось.",
    });
    return;
  }

  // Перевод из другого отдела
  const oldDept = leaveDepartment(db, ws.userId);

  const dept = assignToDepartment(db, ws.userId, departmentId);

  db.prepare(`
    UPDATE player_states SET x = ?, y = 0, z = ?, zone = ?
    WHERE user_id = ?
  `).run(dept.x, dept.z + 5, dept.slug, ws.userId);

  positions.set(ws.userId, { x: dept.x, y: 0, z: dept.z + 5, rotY: 0 });

  broadcast("player_moved", {
    id: ws.userId,
    position: { x: dept.x, y: 0, z: dept.z + 5 },
    rotationY: 0,
  }, ws.userId);

  sendJSON(ws, "department_selected", {
    department: dept,
    position: { x: dept.x, y: 0, z: dept.z + 5 },
  });

  const transferNote = oldDept
    ? `${ws.username} перешёл из "${oldDept.name}" в "${dept.name}"`
    : `${ws.username} присоединился к "${dept.name}"`;

  broadcast("game_event", { message: transferNote }, ws.userId);

  broadcast("departments_updated", {
    departments: getDepartmentsWithOccupancy(db),
  });
}

function leaveDepartment(db, userId) {
  const current = getPlayerDepartment(db, userId);
  if (!current) return null;

  db.prepare("DELETE FROM department_assignments WHERE user_id = ?").run(userId);

  // Незавершённые задачи сгорают
  db.prepare(`
    UPDATE task_instances
    SET status = 'failed', result = 'left_department', completed_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND status = 'in_progress'
  `).run(userId);

  return current;
}

// Обработка NPC-диалогов
async function handleNpcAsk(db, ws, npcId, message) {
  const npc = db.prepare(`
    SELECT n.*, d.slug AS department_slug, d.name AS department_name
    FROM npcs n
    LEFT JOIN departments d ON d.id = n.department_id
    WHERE n.id = ?
  `).get(npcId);

  if (!npc) return;

  db.prepare(`
    INSERT INTO npc_dialogues (user_id, npc_id, role, content)
    VALUES (?, ?, 'user', ?)
  `).run(ws.userId, npcId, message);

  const flags = getFlags(db, ws.userId);

    const activeTaskRow = db.prepare(`
    SELECT t.id AS task_id, t.title, t.description, t.difficulty,
           a.kind AS activity_kind, a.data AS activity_data
    FROM task_instances ti
    JOIN tasks t ON t.id = ti.task_id
    LEFT JOIN activities a ON a.task_id = t.id
    WHERE ti.user_id = ? AND ti.status = 'in_progress'
  `).get(ws.userId);

  // обезвреженный контекст мини-игры для LLM (без правильных ответов)
  let activeTask = null;
  if (activeTaskRow) {
    activeTask = {
      title: activeTaskRow.title,
      description: activeTaskRow.description,
      difficulty: activeTaskRow.difficulty,
      activityKind: activeTaskRow.activity_kind || null,
      activityRaw: activeTaskRow.activity_data || null, // строку/JSON отдадим как есть, npc.js распарсит
    };
  }

  // последние 8 сообщений диалога с этим NPC (включая текущий вопрос)
  const history = db.prepare(`
    SELECT role, content FROM npc_dialogues
    WHERE user_id = ? AND npc_id = ?
    ORDER BY id DESC LIMIT 8
  `).all(ws.userId, npcId).reverse();

  // убираем из истории текущий вопрос, чтобы не дублировать его в конце messages
  const historyWithoutCurrent = history.filter(
    (h, i) => !(i === history.length - 1 && h.role === "user" && h.content === message)
  );

  let reply;
  try {
    reply = await askNPC(npc, message, {
      username: ws.username,
      departmentSlug: npc.department_slug,
      departmentName: npc.department_name,
      activeTask,
      hintIndex: flags.hintIndex || 0,
      history: historyWithoutCurrent,
    });

    if (
      activeTask &&
      /подсказ|помо|застрял|не понимаю|как сделать|hint|help/i.test(message)
    ) {
      flags.hintIndex = (flags.hintIndex || 0) + 1;
      saveFlags(db, ws.userId, flags);
    }
  } catch (error) {
    console.error(error);
    reply = "Извини, я сейчас не могу ответить. Попробуй позже.";
  }

  db.prepare(`
    INSERT INTO npc_dialogues (user_id, npc_id, role, content)
    VALUES (?, ?, 'assistant', ?)
  `).run(ws.userId, npcId, reply);

  sendJSON(ws, "npc_reply", { npcId, name: npc.name, text: reply });
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

    const departments = getDepartmentsWithOccupancy(db);
    const npcs = db.prepare(`
      SELECT n.*, d.slug AS department_slug
      FROM npcs n
      LEFT JOIN departments d ON d.id = n.department_id
    `).all();

    const playerDept = getPlayerDepartment(db, userId);
    const tasks = playerDept ? getDepartmentTasks(db, playerDept.id) : [];

    const activeTask = db.prepare(`
      SELECT ti.*, t.title, t.description, t.difficulty, t.reward_points
      FROM task_instances ti
      JOIN tasks t ON t.id = ti.task_id
      WHERE ti.user_id = ? AND ti.status = 'in_progress'
    `).get(userId);

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
      departments,
      npcs,
      tasks,
      activeTask,
      playerDepartment: playerDept,
      otherPlayers,
      flags: getFlags(db, userId),
    });

    broadcast("player_joined", {
      id: userId,
      username,
      position,
    }, userId);

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

      try {
        if (msg.type === "start_activity") startActivity(db, ws);
        if (msg.type === "submit_activity") submitActivity(db, ws, msg.instanceId, msg.answer);
        if (msg.type === "move") {
          positions.set(userId, {
            x: msg.position?.x || 0,
            y: msg.position?.y || 0,
            z: msg.position?.z || 0,
            rotY: msg.rotationY || 0,
          });
          broadcast("player_moved", {
            id: userId,
            position: msg.position,
            rotationY: msg.rotationY || 0,
          }, userId);
        }
        if (msg.type === "select_department") handleSelectDepartment(db, ws, msg.departmentId);
        if (msg.type === "interact") handleInteract(db, ws, msg.objectId);
        if (msg.type === "npc_ask") await handleNpcAsk(db, ws, msg.npcId, msg.message);
      } catch (err) {
        console.error("[ws dispatch ERROR]", err);
        sendJSON(ws, "game_event", { message: "Внутренняя ошибка сервера (см. консоль)." });
      }
    });

    ws.on("close", () => {
      clearInterval(saveInterval);
      const pos = positions.get(userId) || position;
      savePosition(db, userId, pos);
      clients.delete(userId);
      positions.delete(userId);
      broadcast("player_left", { id: userId });
      broadcast("departments_updated", {
        departments: getDepartmentsWithOccupancy(db),
      });
    });
  });
}

function getActivityForTask(db, taskId) {
  return db.prepare("SELECT * FROM activities WHERE task_id = ?").get(taskId);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startActivity(db, ws) {
  const active = db.prepare(`
    SELECT ti.id AS instance_id, ti.task_id, t.title
    FROM task_instances ti
    JOIN tasks t ON t.id = ti.task_id
    WHERE ti.user_id = ? AND ti.status = 'in_progress'
  `).get(ws.userId);

  if (!active) {
    sendJSON(ws, "game_event", { message: "Сначала возьми задачу у стола PM." });
    return;
  }

  const activity = getActivityForTask(db, active.task_id);
  if (!activity) {
    sendJSON(ws, "game_event", { message: "Для этой задачи пока нет мини-игры." });
    return;
  }

  let data = JSON.parse(activity.data);

  // Quiz: перемешиваем варианты ВМЕСТЕ с флагом правильности,
  // иначе индекс correct рассинхронится с показанным списком.
  if (activity.kind === "quiz" && Array.isArray(data.options)) {
    const paired = data.options.map((text, i) => ({
      text,
      correct: i === Number(data.correct),
    }));
    const shuffled = shuffleArray(paired);
    data = {
      ...data,
      options: shuffled.map((p) => p.text),
      correct: shuffled.findIndex((p) => p.correct),
    };
  }

  // Blocks: перемешиваем только отображаемые блоки, correctOrder остаётся эталоном.
  if (activity.kind === "blocks" && Array.isArray(data.items)) {
    data = { ...data, items: shuffleArray(data.items) };
  }

  sendJSON(ws, "activity_start", {
    instanceId: active.instance_id,
    taskTitle: active.title,
    kind: activity.kind,
    data,
  });
}

function submitActivity(db, ws, instanceId, answer) {
  const instance = db.prepare(`
    SELECT ti.*, t.title, t.reward_points
    FROM task_instances ti
    JOIN tasks t ON t.id = ti.task_id
    WHERE ti.id = ? AND ti.user_id = ? AND ti.status = 'in_progress'
  `).get(instanceId, ws.userId);

  if (!instance) {
    sendJSON(ws, "activity_result", { ok: false, message: "Задача не найдена или уже закрыта." });
    return;
  }

  const activity = getActivityForTask(db, instance.task_id);
  if (!activity) return;

  const data = JSON.parse(activity.data);
  let ok = false;

  if (activity.kind === "quiz") {
    ok = Number(answer) === Number(data.correct);
  } else if (activity.kind === "blocks") {
    ok =
      Array.isArray(answer) &&
      answer.length === data.correctOrder.length &&
      answer.every((v, i) => v === data.correctOrder[i]);
  } else if (activity.kind === "sorting") {
    if (Array.isArray(answer)) {
      ok = data.buckets.every((bucket) => {
        const got = (answer.find((b) => b.bucket === bucket.name)?.items || []).slice().sort();
        const want = bucket.items.slice().sort();
        return got.length === want.length && got.every((v, i) => v === want[i]);
      });
    }
  }

  if (!ok) {
    sendJSON(ws, "activity_result", {
      ok: false,
      message: "Не совсем верно. Попроси подсказку у руководителя отдела и попробуй ещё раз.",
    });
    return;
  }

  completeTask(db, ws.userId, instance.task_id, true);
  const flags = getFlags(db, ws.userId);

  sendJSON(ws, "activity_result", {
    ok: true,
    message: `Задача "${instance.title}" принята! +${instance.reward_points} очков.`,
    pointsEarned: instance.reward_points,
    totalPoints: flags.points || 0,
  });

  broadcast("game_event", {
    message: `${ws.username} выполнил мини-игру и сдал задачу "${instance.title}"`,
  }, ws.userId);
}

module.exports = { setupGame };