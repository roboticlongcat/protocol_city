const db = require("./db");
const bcrypt = require("bcryptjs");

// ============================================================
// Безопасные миграции (если db.js их не прогнал) — идемпотентно
// ============================================================
for (const sql of [
  "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member'",
  "ALTER TABLE npcs ADD COLUMN behavior TEXT DEFAULT '{}'",
]) {
  try { db.exec(sql); } catch (e) { /* колонка уже есть */ }
}

// ============================================================
// Каскадная очистка мира: строго дети -> родители.
// users и player_states НЕ трогаем — аккаунты и прогресс живут.
// ============================================================
db.exec(`
  DELETE FROM project_participants;
  DELETE FROM project_steps;
  DELETE FROM team_projects;
  DELETE FROM task_instances;
  DELETE FROM activities;
  DELETE FROM npc_dialogues;
  DELETE FROM department_assignments;
  DELETE FROM tasks;
  DELETE FROM npcs;
  DELETE FROM departments;
`);
try { db.exec("DELETE FROM game_events;"); } catch (e) {}

// ============================================================
// ОТДЕЛЫ (координаты совпадают с ROOMS в office.js)
// ============================================================
function seedDepartments() {
  const rows = [
    { id: 1, slug: "frontend",  name: "Отдел фронтенда",    description: "React, Vue, UI/UX, верстка",            max_players: 3, color: "#38bdf8", x: -19, z: -22, radius: 8 },
    { id: 2, slug: "analytics", name: "Отдел аналитики",    description: "Данные, метрики, отчёты, A/B тесты",    max_players: 2, color: "#facc15", x: 0,   z: -22, radius: 8 },
    { id: 3, slug: "backend",   name: "Отдел бэкенда",      description: "Node.js, Python, API, базы данных",     max_players: 3, color: "#34d399", x: 19,  z: -22, radius: 8 },
    { id: 4, slug: "devops",    name: "Отдел DevOps",       description: "CI/CD, Docker, Kubernetes, мониторинг", max_players: 2, color: "#f87171", x: -19, z: 22,  radius: 8 },
    { id: 5, slug: "qa",        name: "Отдел тестирования", description: "Автотесты, ручное тестирование, баги",  max_players: 3, color: "#a78bfa", x: -1,  z: 22,  radius: 8 },
  ];
  const stmt = db.prepare(`
    INSERT INTO departments (id, slug, name, description, max_players, color, x, y, z, radius)
    VALUES (@id, @slug, @name, @description, @max_players, @color, @x, 0, @z, @radius)
  `);
  for (const r of rows) stmt.run(r);
  console.log("Departments seeded:", rows.length);
}

// ============================================================
// NPC: PM + лиды. behavior — то, что админ правит в панели.
// ============================================================
function seedNPCs() {
  const def = { tone: "дружелюбно", maxSentences: 3, allowSpoilers: false, hintMode: "пошагово", extra: "" };
  const rows = [
    { id: 1, department_id: null, name: "Анна (Product Manager)",  role: "product_manager", personality: "строгая, но справедливая, следит за дедлайнами" },
    { id: 2, department_id: 1,    name: "Максим (Frontend Lead)",  role: "department_lead", personality: "дружелюбный, любит красивый UI" },
    { id: 3, department_id: 3,    name: "Елена (Backend Lead)",    role: "department_lead", personality: "дотошная, ценит чистый код" },
    { id: 4, department_id: 2,    name: "Дмитрий (Analytics Lead)",role: "department_lead", personality: "спокойный, любит цифры и графики" },
    { id: 5, department_id: 4,    name: "Ольга (DevOps Lead)",     role: "department_lead", personality: "энергичная, ненавидит рутину" },
    { id: 6, department_id: 5,    name: "Игорь (QA Lead)",         role: "department_lead", personality: "придирчивый, но справедливый" },
  ];
  const stmt = db.prepare(`
    INSERT INTO npcs (id, department_id, name, role, personality, behavior)
    VALUES (@id, @department_id, @name, @role, @personality, @behavior)
  `);
  for (const r of rows) stmt.run({ ...r, behavior: JSON.stringify(def) });
  console.log("NPCs seeded:", rows.length);
}

// ============================================================
// ЗАДАЧИ ОТДЕЛОВ
// ============================================================
function seedTasks() {
  const rows = [
    { department_id: 1, title: "Сверстать форму логина",             description: "Простая форма с полями логин/пароль",            difficulty: "easy",   reward_points: 10 },
    { department_id: 1, title: "Добавить темную тему",               description: "Переключатель темы на CSS-переменных",           difficulty: "medium", reward_points: 25 },
    { department_id: 1, title: "Оптимизировать бандл",               description: "Уменьшить размер финального бандла на 30%",      difficulty: "hard",   reward_points: 50 },
    { department_id: 3, title: "Реализовать эндпоинт /api/users",    description: "GET список пользователей в JSON",                difficulty: "easy",   reward_points: 10 },
    { department_id: 3, title: "Добавить авторизацию JWT",           description: "Middleware проверки токена",                     difficulty: "medium", reward_points: 30 },
    { department_id: 3, title: "Написать сложные SQL-запросы",       description: "JOIN пяти таблиц с агрегацией",                  difficulty: "hard",   reward_points: 50 },
    { department_id: 2, title: "Построить отчёт по DAU",             description: "Дневные активные пользователи по дням",          difficulty: "easy",   reward_points: 15 },
    { department_id: 2, title: "Провести A/B тест",                  description: "Сравнить две версии главной страницы",           difficulty: "medium", reward_points: 35 },
    { department_id: 4, title: "Написать Dockerfile",                description: "Контейнеризировать приложение",                  difficulty: "easy",   reward_points: 15 },
    { department_id: 4, title: "Настроить CI/CD пайплайн",           description: "GitHub Actions с тестами и деплоем",             difficulty: "medium", reward_points: 40 },
    { department_id: 5, title: "Написать тест-кейсы для логина",     description: "Позитивные и негативные сценарии",               difficulty: "easy",   reward_points: 10 },
    { department_id: 5, title: "Настроить автотесты",                description: "Cypress или Playwright на критический сценарий", difficulty: "medium", reward_points: 30 },
  ];
  const stmt = db.prepare(`
    INSERT INTO tasks (department_id, title, description, difficulty, reward_points)
    VALUES (@department_id, @title, @description, @difficulty, @reward_points)
  `);
  for (const r of rows) stmt.run(r);
  console.log("Tasks seeded:", rows.length);
}

// ============================================================
// МИНИ-ИГРЫ (привязаны к задачам по title)
// ============================================================
function seedActivities() {
  const byTitle = (t) => db.prepare("SELECT id FROM tasks WHERE title = ?").get(t);
  const stmt = db.prepare("INSERT INTO activities (task_id, kind, data) VALUES (?, ?, ?)");
  const same = (arr) => ({ items: arr, correctOrder: arr });

  const rows = [
    { title: "Сверстать форму логина", kind: "blocks", data: Object.assign(
        { prompt: "Собери форму логина в правильном порядке (сверху вниз):" },
        same(["<form>", "<label for=email>", "<input type=email>", "<input type=password>", "<button type=submit>", "</form>"])) },
    { title: "Добавить темную тему", kind: "quiz", data: {
        question: "Как удобнее всего реализовать переключение тёмной темы?",
        options: ["CSS-переменные + атрибут data-theme на <html>", "Дубликат всех стилей в отдельном файле", "Инверсия цветов картинками через filter"],
        correct: 0 } },
    { title: "Оптимизировать бандл", kind: "sorting", data: {
        prompt: "Распредели приёмы: что уменьшает РАЗМЕР бандла, а что УСКОРЯЕТ загрузку?",
        buckets: [
          { name: "Размер",  items: ["tree shaking", "минификация", "code splitting"] },
          { name: "Скорость", items: ["lazy loading", "кэш браузера", "preload шрифтов"] }] } },
    { title: "Реализовать эндпоинт /api/users", kind: "quiz", data: {
        question: "Какой статус вернёт корректный GET /api/users при успехе?",
        options: ["200 OK", "404 Not Found", "500 Internal Server Error"],
        correct: 0 } },
    { title: "Добавить авторизацию JWT", kind: "blocks", data: Object.assign(
        { prompt: "Выстрой жизненный цикл JWT по порядку:" },
        same(["Пользователь логинится", "Сервер подписывает токен", "Клиент шлёт токен в Authorization", "Middleware проверяет подпись"])) },
    { title: "Написать сложные SQL-запросы", kind: "quiz", data: {
        question: "Что обязательно добавить, чтобы использовать COUNT(*) по группам?",
        options: ["GROUP BY", "ORDER BY", "LIMIT"],
        correct: 0 } },
    { title: "Построить отчёт по DAU", kind: "quiz", data: {
        question: "Как посчитать DAU корректно?",
        options: ["COUNT(DISTINCT user_id) с группировкой по дню", "COUNT(*) всех событий", "SUM(session_duration)"],
        correct: 0 } },
    { title: "Провести A/B тест", kind: "sorting", data: {
        prompt: "Разложи шаги A/B-теста: ДО запуска и ВО время теста:",
        buckets: [
          { name: "До запуска", items: ["выбрать метрику", "рассчитать размер выборки"] },
          { name: "Во время",   items: ["случайное разбиение трафика", "не подсматривать результат ежедневно"] }] } },
    { title: "Написать Dockerfile", kind: "blocks", data: Object.assign(
        { prompt: "Собери Dockerfile в правильном порядке:" },
        same(["FROM node:20-alpine", "COPY package*.json ./", "RUN npm ci", "COPY . .", "CMD node index.js"])) },
    { title: "Настроить CI/CD пайплайн", kind: "blocks", data: Object.assign(
        { prompt: "Выстрой этапы пайплайна:" },
        same(["checkout кода", "npm ci", "тесты", "сборка образа", "деплой"])) },
    { title: "Написать тест-кейсы для логина", kind: "sorting", data: {
        prompt: "Раздели сценарии на позитивные и негативные:",
        buckets: [
          { name: "Позитивные",  items: ["верный логин и пароль", "вход по Enter"] },
          { name: "Негативные", items: ["пустой пароль", "несуществующий пользователь"] }] } },
    { title: "Настроить автотесты", kind: "quiz", data: {
        question: "Какие селекторы делают автотесты устойчивыми?",
        options: ["data-testid", "nth-child(3)", "класс .btn-active-hover"],
        correct: 0 } },
  ];

  let n = 0;
  for (const r of rows) {
    const t = byTitle(r.title);
    if (!t) { console.warn("seedActivities: нет задачи:", r.title); continue; }
    stmt.run(t.id, r.kind, JSON.stringify(r.data));
    n++;
  }
  console.log("Activities seeded:", n);
}

// ============================================================
// СОВМЕСТНЫЙ ПРОЕКТ (конвейер): фронт -> бэк -> QA -> DevOps
// ============================================================
function seedTeamProject() {
  const proj = db.prepare(`
    INSERT INTO team_projects (slug, title, description, kind, reward_points, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    "release_pipeline",
    "Релиз фичи «Личный кабинет»",
    "Соберите релиз по конвейеру: фронт → бэк → QA → DevOps. Проект засчитан, только когда все 4 шага сданы разными людьми.",
    "pipeline",
    100,
    "open"
  );
  const projectId = Number(proj.lastInsertRowid);

  const deptId = (slug) => db.prepare("SELECT id FROM departments WHERE slug = ?").get(slug);
  const actId = (title) => {
    const t = db.prepare("SELECT id FROM tasks WHERE title = ?").get(title);
    if (!t) return null;
    const a = db.prepare("SELECT id FROM activities WHERE task_id = ?").get(t.id);
    return a ? a.id : null;
  };

  const plan = [
    { dept: "frontend", task: "Сверстать форму логина" },
    { dept: "backend",  task: "Реализовать эндпоинт /api/users" },
    { dept: "qa",       task: "Написать тест-кейсы для логина" },
    { dept: "devops",   task: "Написать Dockerfile" },
  ];

  let prev = null;
  plan.forEach((p, i) => {
    const d = deptId(p.dept);
    const a = actId(p.task);
    if (!d || !a) { console.warn("seedTeamProject: пропуск шага", p); return; }
    const st = db.prepare(`
      INSERT INTO project_steps (project_id, department_id, order_index, activity_id, depends_on_step_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(projectId, d.id, i, a, prev, i === 0 ? "available" : "locked");
    prev = Number(st.lastInsertRowid);
  });
  console.log("Team project seeded");
}

// ============================================================
// МИРОВЫЕ НАСТРОЙКИ (расписание, множители, флаги событий)
// ============================================================
function seedWorldConfig() {
  const world = {
    schedule: { lunchStart: "13:00", lunchEnd: "14:00", meetingAt: "12:00" },
    pointMultiplier: 1.0,
    events: { lunch: false, meeting: false, alarm: false },
  };
  db.prepare("INSERT OR REPLACE INTO world_config (id, data) VALUES (1, ?)").run(JSON.stringify(world));
  console.log("World config seeded");
}

// ============================================================
// АДМИН: создаёт, если нет; ЧИНИТ РОЛЬ, если есть, но не admin.
// Пароль существующего админа НЕ трогает.
// ============================================================
function seedAdmin() {
  const existing = db.prepare("SELECT id, role FROM users WHERE username = ?").get("admin");
  if (!existing) {
    const hash = bcrypt.hashSync("admin123", 10);
    const info = db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)").run("admin", hash, "admin");
    const uid = Number(info.lastInsertRowid);
    db.prepare("INSERT OR IGNORE INTO player_states (user_id, x, y, z, rot_y, zone, flags) VALUES (?, 0, 0, 5, 0, 'lobby', '{}')").run(uid);
    console.log("Admin created: admin / admin123");
    return;
  }
  if (existing.role !== "admin") {
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run("admin", existing.id);
    console.log("Admin role FIXED -> admin (id " + existing.id + ")");
  } else {
    console.log("Admin already ok (id " + existing.id + ")");
  }
}

// ============================================================
// ДЕМО-ИГРОК (не админ)
// ============================================================
function seedDemoUser() {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get("demo");
  if (!existing) {
    const hash = bcrypt.hashSync("demo123", 10);
    const info = db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)").run("demo", hash, "member");
    const uid = Number(info.lastInsertRowid);
    db.prepare("INSERT OR IGNORE INTO player_states (user_id, x, y, z, rot_y, zone, flags) VALUES (?, 0, 0, 5, 0, 'lobby', '{}')").run(uid);
    console.log("Demo user created: demo / demo123");
  } else {
    console.log("Demo user already exists");
  }
}

// ============================================================
seedDepartments();
seedNPCs();
seedTasks();
seedActivities();
seedTeamProject();
seedWorldConfig();
seedAdmin();
seedDemoUser();
console.log("Seed completed");