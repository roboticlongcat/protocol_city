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

function releaseStep(db, ws, stepId) {
  const step = db.prepare(`
    SELECT * FROM project_steps
    WHERE id = ? AND assigned_user_id = ? AND status = 'in_progress'
  `).get(stepId, ws.userId);

  if (!step) {
    sendJSON(ws, "game_event", { message: "Этот шаг не твой или уже свободен." });
    return;
  }

  db.prepare(`UPDATE project_steps SET status = 'available', assigned_user_id = NULL WHERE id = ?`).run(stepId);
  broadcastProjectStatus(db, step.project_id);
  sendJSON(ws, "game_event", {
    message: "Ты освободила шаг — теперь его может взять любой сотрудник твоего отдела (и ты сама заново).",
  });
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
  releaseUserSteps(db, userId);

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

// ================= СОМЕСТНЫЙ ПРОЕКТ (КОНВЕЙЕР) =================
function getProjectSnapshot(db) {
  const proj = db.prepare(`SELECT * FROM team_projects WHERE status = 'open' ORDER BY id LIMIT 1`).get();
  if (!proj) return null;

  const steps = db.prepare(`
    SELECT ps.id, ps.department_id, ps.order_index, ps.status, ps.assigned_user_id,
           d.name AS department_name, a.kind AS activity_kind
    FROM project_steps ps
    JOIN departments d ON d.id = ps.department_id
    LEFT JOIN activities a ON a.id = ps.activity_id
    WHERE ps.project_id = ?
    ORDER BY ps.order_index
  `).all(proj.id);

  const withBy = steps.map((s) => ({
    ...s,
    by_username: s.assigned_user_id
      ? db.prepare("SELECT username FROM users WHERE id = ?").get(s.assigned_user_id)?.username ?? null
      : null,
  }));

  const total = withBy.length;
  const done = withBy.filter((s) => s.status === "done").length;
  return { ...proj, steps: withBy, overallProgress: total ? done / total : 0 };
}

function broadcastProjectStatus(db, projectId) {
  broadcast("team_project_updated", { project: getProjectSnapshot(db) });
}

function checkActivityAnswer(kind, data, answer) {
  if (kind === "quiz") return Number(answer) === Number(data.correct);
  if (kind === "blocks") {
    return (
      Array.isArray(answer) &&
      answer.length === data.correctOrder.length &&
      answer.every((v, i) => v === data.correctOrder[i])
    );
  }
  if (kind === "sorting") {
    if (!Array.isArray(answer)) return false;
    return data.buckets.every((bucket) => {
      const got = (answer.find((b) => b.bucket === bucket.name)?.items || []).slice().sort();
      const want = bucket.items.slice().sort();
      return got.length === want.length && got.every((v, i) => v === want[i]);
    });
  }
  return false;
}

function claimStep(db, ws, stepId) {
  const step = db.prepare(`
    SELECT ps.*, p.status AS project_status
    FROM project_steps ps JOIN team_projects p ON p.id = ps.project_id
    WHERE ps.id = ?
  `).get(stepId);

  if (!step || step.project_status !== "open") {
    sendJSON(ws, "game_event", { message: "Шаг недоступен." });
    return;
  }
  if (step.status !== "available") {
    sendJSON(ws, "game_event", { message: "Этот шаг уже занят или заблокирован предыдущим." });
    return;
  }
  const myDept = getPlayerDepartment(db, ws.userId);
  if (!myDept || myDept.id !== step.department_id) {
    sendJSON(ws, "game_event", { message: "Этот шаг — зона ответственности другого отдела. Переоденьтесь или позовите коллегу." });
    return;
  }
  const busy = db.prepare(`
    SELECT id FROM project_steps WHERE project_id = ? AND assigned_user_id = ? AND status = 'in_progress'
  `).get(step.project_id, ws.userId);
  if (busy) {
    sendJSON(ws, "game_event", { message: "У тебя уже взят шаг проекта. Сначала сдай его на мини-игре." });
    return;
  }

  db.prepare(`UPDATE project_steps SET status = 'in_progress', assigned_user_id = ? WHERE id = ?`).run(ws.userId, stepId);
  db.prepare(`INSERT OR IGNORE INTO project_participants (project_id, user_id) VALUES (?, ?)`).run(step.project_id, ws.userId);

  broadcastProjectStatus(db, step.project_id);
  startStepActivity(db, ws, stepId);
}

function startStepActivity(db, ws, stepId) {
  const step = db.prepare(`
    SELECT ps.id, ps.order_index, ps.activity_id, a.kind, a.data, d.name AS dept_name
    FROM project_steps ps
    JOIN activities a ON a.id = ps.activity_id
    JOIN departments d ON d.id = ps.department_id
    WHERE ps.id = ? AND ps.assigned_user_id = ? AND ps.status = 'in_progress'
  `).get(stepId, ws.userId);

  if (!step) { sendJSON(ws, "game_event", { message: "Шаг не найден." }); return; }

  let data = JSON.parse(step.data);
  if (step.kind === "quiz" && Array.isArray(data.options)) {
    const paired = data.options.map((t, i) => ({ t, c: i === Number(data.correct) }));
    const sh = shuffleArray(paired);
    data = { ...data, options: sh.map((p) => p.t), correct: sh.findIndex((p) => p.c) };
  }
  if (step.kind === "blocks" && Array.isArray(data.items)) {
    data = { ...data, items: shuffleArray(data.items) };
  }

  sendJSON(ws, "activity_start", {
    mode: "step",
    stepId: step.id,
    taskTitle: `${step.dept_name} · шаг ${step.order_index + 1} конвейера`,
    kind: step.kind,
    data,
  });
}

function completeStepInternal(db, stepId) {
  const step = db.prepare(`SELECT project_id FROM project_steps WHERE id = ?`).get(stepId);
  db.prepare(`UPDATE project_steps SET status = 'done', done_at = CURRENT_TIMESTAMP WHERE id = ?`).run(stepId);
  db.prepare(`UPDATE project_steps SET status = 'available' WHERE depends_on_step_id = ? AND status = 'locked'`).run(stepId);

  const pid = step.project_id;
  const notDone = db.prepare(`SELECT COUNT(*) c FROM project_steps WHERE project_id = ? AND status != 'done'`).get(pid).c;

  if (notDone === 0) {
    const proj = db.prepare(`SELECT * FROM team_projects WHERE id = ?`).get(pid);
    db.prepare(`UPDATE team_projects SET status = 'completed' WHERE id = ?`).run(pid);
    const parts = db.prepare(`SELECT user_id FROM project_participants WHERE project_id = ?`).all(pid);
    for (const p of parts) {
      const f = getFlags(db, p.user_id);
      f.points = (f.points || 0) + (proj.reward_points || 0);
      saveFlags(db, p.user_id, f);
    }
    broadcast("game_event", {
      message: `🎉 Совместный проект «${proj.title}» завершён! Всем участникам +${proj.reward_points} очков.`,
    });
  }
  broadcastProjectStatus(db, pid);
}

function submitStepActivity(db, ws, stepId, answer) {
  const step = db.prepare(`
    SELECT ps.id, a.kind, a.data, d.name AS dept_name
    FROM project_steps ps
    JOIN activities a ON a.id = ps.activity_id
    JOIN departments d ON d.id = ps.department_id
    WHERE ps.id = ? AND ps.assigned_user_id = ? AND ps.status = 'in_progress'
  `).get(stepId, ws.userId);

  if (!step) { sendJSON(ws, "activity_result", { ok: false, message: "Шаг не найден или уже закрыт." }); return; }

  const data = JSON.parse(step.data);
  if (!checkActivityAnswer(step.kind, data, answer)) {
    sendJSON(ws, "activity_result", { ok: false, message: "Неверно. Попроси подсказку у лида своего отдела и попробуй ещё раз." });
    return;
  }

  completeStepInternal(db, stepId);
  sendJSON(ws, "activity_result", {
    ok: true,
    message: `Шаг «${step.dept_name}» сдан!`,
    totalPoints: getFlags(db, ws.userId).points || 0,
  });
}

function releaseUserSteps(db, userId) {
  const rows = db.prepare(`SELECT DISTINCT project_id FROM project_steps WHERE assigned_user_id = ? AND status = 'in_progress'`).all(userId);
  if (!rows.length) return;
  db.prepare(`UPDATE project_steps SET status = 'available', assigned_user_id = NULL WHERE assigned_user_id = ? AND status = 'in_progress'`).run(userId);
  for (const r of rows) broadcastProjectStatus(db, r.project_id);
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
      project: getProjectSnapshot(db),
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
        if (msg.type === "release_step") {
          releaseStep(db, ws, msg.stepId);
        }
        if (msg.type === "submit_activity") {
          if (msg.stepId != null) submitStepActivity(db, ws, msg.stepId, msg.answer);
          else submitActivity(db, ws, msg.instanceId, msg.answer);
        }
        if (msg.type === "claim_step") {
          claimStep(db, ws, msg.stepId);
        }
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
      releaseUserSteps(db, userId);
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
  // 1) Приоритет — взятый шаг конвейера
  const step = db.prepare(`
    SELECT ps.id
    FROM project_steps ps
    JOIN team_projects p ON p.id = ps.project_id
    WHERE ps.assigned_user_id = ? AND ps.status = 'in_progress' AND p.status = 'open'
    ORDER BY ps.id LIMIT 1
  `).get(ws.userId);

  if (step) {
    startStepActivity(db, ws, step.id);   // шлёт activity_start с mode:"step"
    return;
  }

  // 2) Иначе — личная задача отдела
  const active = db.prepare(`
    SELECT ti.id AS instance_id, ti.task_id, t.title
    FROM task_instances ti JOIN tasks t ON t.id = ti.task_id
    WHERE ti.user_id = ? AND ti.status = 'in_progress'
  `).get(ws.userId);

  if (!active) {
    sendJSON(ws, "game_event", {
      message: "Нет ни личной задачи, ни взятого шага. Возьми задачу у PM (жёлтый стол) или шаг на доске (оранжевая).",
    });
    return;
  }

  const activity = getActivityForTask(db, active.task_id);
  if (!activity) { sendJSON(ws, "game_event", { message: "Для этой задачи пока нет мини-игры." }); return; }

  let data = JSON.parse(activity.data);
  if (activity.kind === "quiz" && Array.isArray(data.options)) {
    const paired = data.options.map((t, i) => ({ t, c: i === Number(data.correct) }));
    const sh = shuffleArray(paired);
    data = { ...data, options: sh.map((p) => p.t), correct: sh.findIndex((p) => p.c) };
  }
  if (activity.kind === "blocks" && Array.isArray(data.items)) {
    data = { ...data, items: shuffleArray(data.items) };
  }

  sendJSON(ws, "activity_start", {
    mode: "task",
    instanceId: active.instance_id,
    taskTitle: active.title,
    kind: activity.kind,
    data,
  });
}

function submitActivity(db, ws, instanceId, answer) {
  const instance = db.prepare(`
    SELECT ti.*, t.title, t.reward_points FROM task_instances ti
    JOIN tasks t ON t.id = ti.task_id
    WHERE ti.id = ? AND ti.user_id = ? AND ti.status = 'in_progress'
  `).get(instanceId, ws.userId);
  if (!instance) { sendJSON(ws, "activity_result", { ok: false, message: "Задача не найдена или уже закрыта." }); return; }

  const activity = getActivityForTask(db, instance.task_id);
  if (!activity) return;
  const data = JSON.parse(activity.data);

  if (!checkActivityAnswer(activity.kind, data, answer)) {
    sendJSON(ws, "activity_result", { ok: false, message: "Не совсем верно. Попроси подсказку у руководителя отдела и попробуй ещё раз." });
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
  broadcast("game_event", { message: `${ws.username} выполнил мини-игру и сдал задачу "${instance.title}"` }, ws.userId);
}

module.exports = { setupGame };