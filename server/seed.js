const db = require("./db");
const bcrypt = require("bcryptjs");

function seedDepartments() {
  const departments = [
    {
      id: 1,
      slug: "frontend",
      name: "Отдел фронтенда",
      description: "React, Vue, UI/UX, верстка",
      max_players: 3,
      color: "#38bdf8",
      x: -20,
      y: 0,
      z: 10,
      radius: 12,
    },
    {
      id: 2,
      slug: "backend",
      name: "Отдел бэкенда",
      description: "Node.js, Python, API, базы данных",
      max_players: 3,
      color: "#34d399",
      x: 20,
      y: 0,
      z: 10,
      radius: 12,
    },
    {
      id: 3,
      slug: "analytics",
      name: "Отдел аналитики",
      description: "Данные, метрики, отчёты, A/B тесты",
      max_players: 2,
      color: "#facc15",
      x: -20,
      y: 0,
      z: -15,
      radius: 10,
    },
    {
      id: 4,
      slug: "devops",
      name: "Отдел DevOps",
      description: "CI/CD, Docker, Kubernetes, мониторинг",
      max_players: 2,
      color: "#f87171",
      x: 20,
      y: 0,
      z: -15,
      radius: 10,
    },
    {
      id: 5,
      slug: "qa",
      name: "Отдел тестирования",
      description: "Автотесты, ручное тестирование, баг-репорты",
      max_players: 3,
      color: "#a78bfa",
      x: 0,
      y: 0,
      z: -25,
      radius: 12,
    },
  ];

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO departments
      (id, slug, name, description, max_players, color, x, y, z, radius)
    VALUES
      (@id, @slug, @name, @description, @max_players, @color, @x, @y, @z, @radius)
  `);

  for (const d of departments) stmt.run(d);
  console.log("Departments seeded");
}

function seedNPCs() {
  const npcs = [
    {
      id: 1,
      department_id: null,
      name: "Анна (Product Manager)",
      role: "product_manager",
      personality: "строгая, но справедливая, следит за дедлайнами",
    },
    {
      id: 2,
      department_id: 1,
      name: "Максим (Frontend Lead)",
      role: "department_lead",
      personality: "дружелюбный, любит красивый UI",
    },
    {
      id: 3,
      department_id: 2,
      name: "Елена (Backend Lead)",
      role: "department_lead",
      personality: "дотошная, ценит чистый код",
    },
    {
      id: 4,
      department_id: 3,
      name: "Дмитрий (Analytics Lead)",
      role: "department_lead",
      personality: "спокойный, любит цифры и графики",
    },
    {
      id: 5,
      department_id: 4,
      name: "Ольга (DevOps Lead)",
      role: "department_lead",
      personality: "энергичная, ненавидит рутину",
    },
    {
      id: 6,
      department_id: 5,
      name: "Игорь (QA Lead)",
      role: "department_lead",
      personality: "придирчивый, но справедливый",
    },
  ];

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO npcs
      (id, department_id, name, role, personality)
    VALUES
      (@id, @department_id, @name, @role, @personality)
  `);

  for (const npc of npcs) stmt.run(npc);
  console.log("NPCs seeded");
}

function seedTasks() {
  const tasks = [
    // Frontend
    { department_id: 1, title: "Сверстать форму логина", difficulty: "easy", reward_points: 10, description: "Нужна простая форма с полями логин/пароль" },
    { department_id: 1, title: "Добавить темную тему", difficulty: "medium", reward_points: 25, description: "Реализовать переключатель темы" },
    { department_id: 1, title: "Оптимизировать бандл", difficulty: "hard", reward_points: 50, description: "Уменьшить размер финального бандла на 30%" },

    // Backend
    { department_id: 2, title: "Реализовать эндпоинт /api/users", difficulty: "easy", reward_points: 10, description: "GET список пользователей" },
    { department_id: 2, title: "Добавить авторизацию JWT", difficulty: "medium", reward_points: 30, description: "Настроить middleware проверки токена" },
    { department_id: 2, title: "Написать сложные SQL-запросы", difficulty: "hard", reward_points: 50, description: "JOIN 5 таблиц с агрегацией" },

    // Analytics
    { department_id: 3, title: "Построить отчёт по DAU", difficulty: "easy", reward_points: 15, description: "Посчитать дневных активных пользователей" },
    { department_id: 3, title: "Провести A/B тест", difficulty: "medium", reward_points: 35, description: "Сравнить две версии главной страницы" },

    // DevOps
    { department_id: 4, title: "Написать Dockerfile", difficulty: "easy", reward_points: 15, description: "Контейнеризировать приложение" },
    { department_id: 4, title: "Настроить CI/CD пайплайн", difficulty: "medium", reward_points: 40, description: "GitHub Actions с тестами и деплоем" },

    // QA
    { department_id: 5, title: "Написать тест-кейсы для логина", difficulty: "easy", reward_points: 10, description: "Позитивные и негативные сценарии" },
    { department_id: 5, title: "Настроить автотесты", difficulty: "medium", reward_points: 30, description: "Cypress или Playwright" },
  ];

  const stmt = db.prepare(`
    INSERT INTO tasks (department_id, title, description, difficulty, reward_points)
    VALUES (@department_id, @title, @description, @difficulty, @reward_points)
  `);

  for (const t of tasks) stmt.run(t);
  console.log("Tasks seeded");
}

function seedDemoUser() {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get("demo");

  if (!existing) {
    const passwordHash = bcrypt.hashSync("demo123", 10);
    const info = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run("demo", passwordHash);
    const userId = Number(info.lastInsertRowid);

    db.prepare(`
      INSERT OR IGNORE INTO player_states (user_id, x, y, z, rot_y, zone, flags)
      VALUES (?, 0, 0, 5, 0, 'lobby', '{}')
    `).run(userId);

    console.log("Demo user created: demo / demo123");
  } else {
    console.log("Demo user already exists");
  }
}

// Очистка старых данных перед сидом
db.exec("DELETE FROM task_instances");
db.exec("DELETE FROM department_assignments");

seedDepartments();
seedNPCs();
seedTasks();
seedDemoUser();

function seedActivities() {
  db.exec("DELETE FROM activities");

  const byTitle = (title) =>
    db.prepare("SELECT id FROM tasks WHERE title = ?").get(title)?.id;

  const insert = db.prepare(
    "INSERT INTO activities (task_id, kind, data) VALUES (?, ?, ?)"
  );

  const activities = [
    {
      title: "Сверстать форму логина",
      kind: "blocks",
      data: {
        prompt: "Собери форму логина в правильном порядке (сверху вниз):",
        items: ["<form>", "<label for=email>", "<input type=email>", "<input type=password>", "<button type=submit>", "</form>"],
        correctOrder: ["<form>", "<label for=email>", "<input type=email>", "<input type=password>", "<button type=submit>", "</form>"],
      },
    },
    {
      title: "Добавить темную тему",
      kind: "quiz",
      data: {
        question: "Как удобнее всего реализовать переключение тёмной темы?",
        options: [
          "CSS-переменные + атрибут data-theme на <html>",
          "Отдельный дубликат всех стилей в другом файле",
          "Инвертировать цвета картинками через filter на каждом элементе",
        ],
        correct: 0,
      },
    },
    {
      title: "Оптимизировать бандл",
      kind: "sorting",
      data: {
        prompt: "Распредели приёмы: что уменьшает РАЗМЕР бандла, а что УСКОРЯЕТ загрузку?",
        buckets: [
          { name: "Размер", items: ["tree shaking", "минификация", "code splitting"] },
          { name: "Скорость", items: ["lazy loading", "кэш браузера", "preload шрифтов"] },
        ],
      },
    },
    {
      title: "Реализовать эндпоинт /api/users",
      kind: "quiz",
      data: {
        question: "Какой статус вернёт корректный GET /api/users при успехе?",
        options: ["200 OK", "404 Not Found", "500 Internal Server Error"],
        correct: 0,
      },
    },
    {
      title: "Добавить авторизацию JWT",
      kind: "blocks",
      data: {
        prompt: "Выстрой жизненный цикл JWT по порядку:",
        items: ["Пользователь логинится", "Сервер подписывает токен", "Клиент шлёт токен в Authorization", "Middleware проверяет подпись"],
        correctOrder: ["Пользователь логинится", "Сервер подписывает токен", "Клиент шлёт токен в Authorization", "Middleware проверяет подпись"],
      },
    },
    {
      title: "Написать сложные SQL-запросы",
      kind: "quiz",
      data: {
        question: "Что обязательно добавить, чтобы использовать COUNT(*) по группам?",
        options: ["GROUP BY", "ORDER BY", "LIMIT"],
        correct: 0,
      },
    },
    {
      title: "Построить отчёт по DAU",
      kind: "quiz",
      data: {
        question: "Как посчитать DAU корректно?",
        options: [
          "COUNT(DISTINCT user_id) с группировкой по дню",
          "COUNT(*) всех событий",
          "SUM(session_duration)",
        ],
        correct: 0,
      },
    },
    {
      title: "Провести A/B тест",
      kind: "sorting",
      data: {
        prompt: "Разложи шаги A/B-теста по корзинам: ДО запуска и ВО время теста:",
        buckets: [
          { name: "До запуска", items: ["выбрать метрику", "рассчитать размер выборки"] },
          { name: "Во время", items: ["случайное разбиение трафика", "не подсматривать результат ежедневно"] },
        ],
      },
    },
    {
      title: "Написать Dockerfile",
      kind: "blocks",
      data: {
        prompt: "Собери Dockerfile в правильном порядке:",
        items: ["FROM node:20-alpine", "COPY package*.json ./", "RUN npm ci", "COPY . .", "CMD [\"node\", \"index.js\"]"],
        correctOrder: ["FROM node:20-alpine", "COPY package*.json ./", "RUN npm ci", "COPY . .", "CMD [\"node\", \"index.js\"]"],
      },
    },
    {
      title: "Настроить CI/CD пайплайн",
      kind: "blocks",
      data: {
        prompt: "Выстрой этапы пайплайна:",
        items: ["checkout кода", "npm ci", "тесты", "сборка образа", "деплой"],
        correctOrder: ["checkout кода", "npm ci", "тесты", "сборка образа", "деплой"],
      },
    },
    {
      title: "Написать тест-кейсы для логина",
      kind: "sorting",
      data: {
        prompt: "Раздели сценарии на позитивные и негативные:",
        buckets: [
          { name: "Позитивные", items: ["верный логин и пароль", "вход по Enter"] },
          { name: "Негативные", items: ["пустой пароль", "несуществующий пользователь"] },
        ],
      },
    },
    {
      title: "Настроить автотесты",
      kind: "quiz",
      data: {
        question: "Какие селекторы делают автотесты устойчивыми?",
        options: ["data-testid", "nth-child(3)", "класс .btn-active-hover"],
        correct: 0,
      },
    },
  ];

  for (const a of activities) {
    const taskId = byTitle(a.title);
    if (taskId) insert.run(taskId, a.kind, JSON.stringify(a.data));
  }

  console.log("Activities seeded");
}
seedActivities();

console.log("Seed completed");