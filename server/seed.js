const db = require("./db");
const bcrypt = require("bcryptjs");

function seedZones() {
  const zones = [
    {
      id: 1,
      slug: "browser",
      name: "Браузерный портал",
      x: 0,
      y: 0,
      z: 0,
      radius: 10,
      color: "#38bdf8",
      data: JSON.stringify({
        description: "Место, где пользователь начинает взаимодействие с приложением",
      }),
    },
    {
      id: 2,
      slug: "dns",
      name: "Справочное бюро DNS",
      x: 24,
      y: 0,
      z: 0,
      radius: 8,
      color: "#facc15",
      data: JSON.stringify({
        description: "Превращает доменное имя в IP-адрес",
      }),
    },
    {
      id: 3,
      slug: "firewall",
      name: "Файрвол-таможня",
      x: 42,
      y: 0,
      z: 0,
      radius: 8,
      color: "#f87171",
      data: JSON.stringify({
        description: "Проверяет, можно ли пропускать запрос",
      }),
    },
    {
      id: 4,
      slug: "server",
      name: "Серверная ратуша",
      x: 60,
      y: 0,
      z: 0,
      radius: 12,
      color: "#34d399",
      data: JSON.stringify({
        description: "Здесь обрабатываются запросы",
      }),
    },
    {
      id: 5,
      slug: "db",
      name: "Библиотека данных",
      x: 85,
      y: 0,
      z: 0,
      radius: 10,
      color: "#a78bfa",
      data: JSON.stringify({
        description: "Хранит пользователей, прогресс, запросы и диалоги",
      }),
    },
    {
      id: 6,
      slug: "cache",
      name: "Кэш-склад",
      x: 70,
      y: 0,
      z: 18,
      radius: 6,
      color: "#fb923c",
      data: JSON.stringify({
        description: "Быстрый доступ к часто используемым данным",
      }),
    },
  ];

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO zones
      (id, slug, name, x, y, z, radius, color, data)
    VALUES
      (@id, @slug, @name, @x, @y, @z, @radius, @color, @data)
  `);

  for (const zone of zones) {
    stmt.run(zone);
  }

  console.log("Zones seeded");
}

function seedNPCs() {
  const npcs = [
    {
      id: 1,
      zone_id: 1,
      name: "Смотритель Браузера",
      role: "frontend_guide",
      model: "qwen2.5:3b",
      personality: "дружелюбный и понятный",
    },
    {
      id: 2,
      zone_id: 2,
      name: "DNS-архивариус",
      role: "dns_resolver",
      model: "qwen2.5:3b",
      personality: "педантичный и точный",
    },
    {
      id: 3,
      zone_id: 3,
      name: "Страж TLS",
      role: "tls_guardian",
      model: "qwen2.5:3b",
      personality: "строгий, заботится о безопасности",
    },
    {
      id: 4,
      zone_id: 4,
      name: "HTTP-дипломат",
      role: "http_protocol",
      model: "qwen2.5:3b",
      personality: "вежливый, объясняет правила общения клиента и сервера",
    },
    {
      id: 5,
      zone_id: 5,
      name: "Библиотекарь данных",
      role: "database_librarian",
      model: "qwen2.5:3b",
      personality: "аккуратный, любит порядок и индексы",
    },
  ];

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO npcs
      (id, zone_id, name, role, model, personality)
    VALUES
      (@id, @zone_id, @name, @role, @model, @personality)
  `);

  for (const npc of npcs) {
    stmt.run(npc);
  }

  console.log("NPCs seeded");
}

function seedMissions() {
  const missions = [
    {
      id: 1,
      slug: "first_request",
      title: "Первый запрос",
      description:
        "Отправьте запрос к серверу. Если сервер вернёт 401, получите токен и попробуйте снова.",
    },
    {
      id: 2,
      slug: "dns_lookup",
      title: "Потерянный адрес",
      description:
        "Помогите запросу найти сервер через DNS.",
    },
    {
      id: 3,
      slug: "cache_speed",
      title: "Кэш-ускоритель",
      description:
        "Настройте кэширование части данных, чтобы уменьшить нагрузку.",
    },
  ];

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO missions
      (id, slug, title, description)
    VALUES
      (@id, @slug, @title, @description)
  `);

  for (const mission of missions) {
    stmt.run(mission);
  }

  console.log("Missions seeded");
}

function seedDemoUser() {
  const existing = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get("demo");

  if (!existing) {
    const passwordHash = bcrypt.hashSync("demo123", 10);

    const info = db
      .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
      .run("demo", passwordHash);

    const userId = Number(info.lastInsertRowid);

    db.prepare(
      `
      INSERT OR IGNORE INTO player_states (user_id, x, y, z, rot_y, zone, flags)
      VALUES (?, 0, 0, 12, 0, 'spawn', '{}')
    `
    ).run(userId);

    console.log("Demo user created: demo / demo123");
  } else {
    console.log("Demo user already exists");
  }
}

seedZones();
seedNPCs();
seedMissions();
seedDemoUser();

console.log("Seed completed");