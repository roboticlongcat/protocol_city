// ================= СПРАВОЧНИК ЗНАНИЙ (фолбэк + контекст для LLM) =================
const knowledge = {
  frontend: [
    { keys: ["бандл", "bundle", "webpack", "vite", "размер"], answer: "Бандл — это итоговый файл (или файлы) JS/CSS, который собирается сборщиком из исходников и отдаётся браузеру." },
    { keys: ["оптимиз", "тяжел", "медлен"], answer: "Бандл оптимизируют: code splitting, tree shaking, динамические import(), минификация, сжатие gzip/brotli." },
    { keys: ["тем", "theme", "тёмн", "темн"], answer: "Тёмную тему делают через CSS-переменные и атрибут data-theme на корне документа." },
    { keys: ["форм", "логин", "верст"], answer: "Форма логина: семантичные input type=email/password, label, автофокус, submit без перезагрузки." },
    { keys: ["react", "vue", "компонент"], answer: "Компонентный подход: интерфейс собирается из независимых кусков со своим состоянием и разметкой." },
    { keys: ["css", "grid", "flex", "адаптив"], answer: "Для раскладки — Flexbox или Grid, адаптив через media-запросы и относительные единицы." },
  ],
  backend: [
    { keys: ["jwt", "токен", "authoriz", "авториз"], answer: "JWT — подписанный токен: сервер проверяет подпись и доверяет содержимому без обращения к базе." },
    { keys: ["эндпоинт", "endpoint", "api", "users"], answer: "Эндпоинт /api/users — маршрут сервера: GET возвращает список пользователей в JSON." },
    { keys: ["sql", "join", "запрос"], answer: "JOIN соединяет таблицы по ключу; агрегация (COUNT, SUM) работает вместе с GROUP BY." },
    { keys: ["инъекц", "inject", "безопас"], answer: "От SQL-инъекций защищаются prepared statements: параметры подставляются отдельно от текста запроса." },
    { keys: ["валидац"], answer: "Валидировать нужно всё, что пришло извне: тип, длину, формат — до любой бизнес-логики." },
  ],
  analytics: [
    { keys: ["dau", "активн", "метрики", "метрик"], answer: "DAU — число уникальных пользователей с целевым действием за сутки." },
    { keys: ["a/b", "аб", "тест"], answer: "A/B-тест: две версии показываются случайным группам, результат сравнивают по метрике при достаточной выборке." },
    { keys: ["выборк", "репрезент"], answer: "Выборка репрезентативна, когда случайно отражает всю аудиторию, иначе выводы неверны." },
    { keys: ["корреляц"], answer: "Корреляция не означает причинность: оба признака может двигать третий фактор." },
  ],
  devops: [
    { keys: ["docker", "докер", "образ", "image"], answer: "Dockerfile описывает образ: базовый образ, копии файлов, зависимости, команду запуска." },
    { keys: ["multi-stage", "многоступ"], answer: "Multi-stage build: в финальный образ попадают только артефакты, без компиляторов и node_modules для сборки." },
    { keys: ["ci", "cd", "пайплайн", "github actions"], answer: "CI/CD-пайплайн: на push запускаются тесты, затем сборка образа и деплой." },
    { keys: ["kubernetes", "kube", "health"], answer: "Kubernetes перезапускает pod, если health check не отвечает, поэтому проверки обязательны." },
  ],
  qa: [
    { keys: ["тест-кейс", "кейс", "сценар"], answer: "Тест-кейс: предусловие, шаги, ожидаемый результат. Обязательно негативные сценарии." },
    { keys: ["граничн", "значен"], answer: "Граничные значения: 0, 1, максимум, максимум+1 — на них ломается чаще всего." },
    { keys: ["автотест", "cypress", "playwright"], answer: "Автотесты пишут на повторяющиеся сценарии; хрупкие селекторы — главный враг." },
    { keys: ["баг", "репорт"], answer: "Баг-репорт: окружение, шаги воспроизведения, факт vs ожидание, серьёзность, скриншот." },
  ],
};

// ================= ПОШАГОВЫЕ ПОДСКАЗКИ К ЗАДАЧАМ (истина для LLM) =================
const taskHints = {
  "Сверстать форму логина": [
    "Начни с семантики: form, label, input type=password.",
    "Не забудь кнопку submit и обработку события без перезагрузки страницы.",
    "Проверь доступность: у каждого input должен быть label.",
  ],
  "Добавить темную тему": [
    "Вынеси цвета в CSS-переменные (:root).",
    "Переключай атрибут data-theme на <html>.",
    "Сохрани выбор пользователя в localStorage.",
  ],
  "Оптимизировать бандл": [
    "Посмотри, что занимает место: webpack-bundle-analyzer или rollup-plugin-visualizer.",
    "Включи tree shaking и убери неиспользуемые импорты.",
    "Раздели код: тяжёлые страницы грузи через динамический import().",
  ],
  "Реализовать эндпоинт /api/users": [
    "Маршрут GET /api/users должен отвечать JSON-массивом.",
    "Не забудь код 200 и Content-Type: application/json.",
    "Обработай ошибку базы и верни 500, а не падай.",
  ],
  "Добавить авторизацию JWT": [
    "Проверяй токен в middleware до входа в обработчик.",
    "Сравнивай алгоритм и подпись, доверяй payload только после проверки.",
    "Верни 401, если токена нет, и 403, если прав не хватает.",
  ],
  "Написать сложные SQL-запросы": [
    "Сначала соедини таблицы через JOIN по внешнему ключу.",
    "Агрегируй через GROUP BY и не забывай HAVING для фильтрации групп.",
    "Проверь запрос на маленьких данных вручную.",
  ],
  "Построить отчёт по DAU": [
    "Считай уникальных пользователей по дню: COUNT(DISTINCT user_id).",
    "Группируй по дате активности.",
    "Сравни неделю к неделе, а не день к дню.",
  ],
  "Провести A/B тест": [
    "Раздели трафик случайно и поровну.",
    "Заранее выбери одну главную метрику.",
    "Не останавливай тест до набора достаточной выборки.",
  ],
  "Написать Dockerfile": [
    "Начни с лёгкого базового образа, например node:20-alpine.",
    "Копируй package.json раньше кода — кэш слоёв сэкономит время.",
    "Запусти приложение через CMD и не забудь EXPOSE порта.",
  ],
  "Настроить CI/CD пайплайн": [
    "Первый шаг — тесты, без них деплой запрещён.",
    "Собирай образ и пушь в реестр с тегом коммита.",
    "Деплой сделай отдельным job с зависимостью needs.",
  ],
  "Написать тест-кейсы для логина": [
    "Позитив: верные данные дают вход.",
    "Негатив: пустой пароль, неверный пароль, несуществующий пользователь.",
    "Опиши ожидаемый результат для каждого шага.",
  ],
  "Настроить автотесты": [
    "Начни с одного критического сценария: логин → главная.",
    "Используй устойчивые селекторы (data-testid).",
    "Запускай тесты в CI на каждом пуше.",
  ],
};
function shuffleLocal(arr) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Превращает activity в «честный» контекст: тип + элементы, НО без правильных ответов.
// LLM не сможет спойлерить, потому что верного ответа в контексте просто нет.
function describeActivity(kind, raw) {
  let data;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!data) return null;

  if (kind === "quiz") {
    return {
      type: "викторина: выбрать один правильный вариант",
      question: data.question,
      options: data.options, // порядок не важен; data.correct НЕ отдаём
    };
  }

  if (kind === "blocks") {
    return {
      type: "расстановка: выстроить элементы в корректный порядок",
      prompt: data.prompt,
      elements: shuffleLocal(data.correctOrder || data.items), // перемешано; эталон не отдаём
    };
  }

  if (kind === "sorting") {
    const allItems = (data.buckets || []).flatMap((b) => b.items || []);
    return {
      type: "сортировка: разложить предметы по корзинам по общему критерию",
      prompt: data.prompt,
      baskets: (data.buckets || []).map((b) => b.name), // только имена корзин
      items: shuffleLocal(allItems), // плоский перемешанный список; привязку не отдаём
    };
  }

  return null;
}

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:1.5b";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 45000);

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function findKnowledge(slug, message) {
  const lower = message.toLowerCase();
  const pool = knowledge[slug] || [];
  const hits = pool.filter((item) => item.keys.some((k) => lower.includes(k)));
  return hits.length ? pickRandom(hits).answer : null;
}

// ---------- СБОРКА КОНТЕКСТА ДЛЯ LLM ----------
function buildSystemPrompt(npc, context) {
  const deptName = context.departmentName || "офис IT-компании";
  const at = context.activeTask;
  const hintIdx = context.hintIndex || 0;
  const hints = at ? taskHints[at.title] || [] : [];
  const currentHint = hints[hintIdx];
  const remaining = Math.max(0, hints.length - hintIdx - 1);

  const knowledgeBlock = (knowledge[context.departmentSlug] || [])
    .map((k) => `- ${k.answer}`)
    .join("\n");

  // обезвреженное описание мини-игры текущей задачи
  const activity = at ? describeActivity(at.activityKind, at.activityRaw) : null;
  const activityBlock = activity
    ? `МИНИ-ИГРА ТЕКУЩЕЙ ЗАДАЧИ (верных ответов здесь НЕТ, игрок должен найти их сам):
Тип: ${activity.type}
${activity.question ? `Вопрос: ${activity.question}` : ""}
${activity.prompt ? `Задание: ${activity.prompt}` : ""}
${activity.options ? `Варианты: ${activity.options.join(" | ")}` : ""}
${activity.elements ? `Элементы (перемешаны): ${activity.elements.join(" | ")}` : ""}
${activity.baskets ? `Корзины: ${activity.baskets.join(" | ")}` : ""}
${activity.items ? `Предметы (перемешаны): ${activity.items.join(" | ")}` : ""}`
    : "";

  return `Ты — ${npc.name}, персонаж образовательной 3D-игры «Протокол-Сити».
Твоя роль: ${npc.role === "product_manager" ? "продакт-менеджер, раздаёт задачи и следит за дедлайнами" : `руководитель отдела «${deptName}»`}.
Твой характер: ${npc.personality}.

Мир игры: офис, где игроки-сотрудники берут задачи у PM и выполняют их мини-играми (викторина / расстановка блоков / сортировка по корзинам). Ты помогаешь разобраться в теме и подсказываешь, как пройти текущую мини-игру.

ЖЁСТКИЕ ПРАВИЛА:
1. Отвечай ТОЛЬКО на русском языке.
2. Говори в своей роли, дружелюбно, как коллега, а не как лектор. Ответ — 1–3 коротких предложения.
3. Если игрок спрашивает общую теорию — опирайся на СПРАВОЧНИК ЗНАНИЙ ниже, перефразируй под вопрос, не выдумывай фактов вне справочника.
4. Если у игрока есть активная мини-игра и он просит подсказку — твоя подсказка ОБЯЗАНА опираться на конкретные элементы мини-игры из блока ниже. Тема подсказки №${hintIdx + 1}: ${currentHint || "(подсказки закончились)"}. Синтезируй: возьми эту тему и примени её к реальным элементам мини-игры, объясни ПРИНЦИП, по которому игрок сам определит верный вариант/порядок/корзину.
5. НИКОГДА не называй верный вариант, верный порядок или корзину напрямую — верного ответа у тебя в контексте нет, и не пытайся его угадать. Води игрока рассуждением, а не ответом.
6. Если подсказок по теме больше нет (remaining = ${remaining} и currentHint пуст) — мягко похвали за прогресс и отпусти решать самому.
7. Никогда не пиши «как языковая модель», не ломай роль.

СПРАВОЧНИК ЗНАНИЙ ТВОЕГО ОТДЕЛА:
${knowledgeBlock || "- (пусто, отвечай общими фразами по роли)"}

${activityBlock ? activityBlock + "\n" : ""}АКТИВНАЯ ЗАДАЧА ИГРОКА: ${at ? `"${at.title}" (${at.description || "без описания"})` : "нет"}
${currentHint ? `ТЕМА ТЕКУЩЕЙ ПОДСКАЗКИ (№${hintIdx + 1} из ${hints.length}): ${currentHint}\nОсталось подсказок после этой: ${remaining}.` : ""}

Контекст игрока: имя ${context.username || "сотрудник"}.
`.trim();
}

// ---------- ВЫЗОВ OLLAMA ----------
async function callOllama(systemPrompt, history, userMessage) {
  const messages = [{ role: "system", content: systemPrompt }];

  // история: чередуем user/assistant, чтобы модель помнила диалог
  for (const h of history || []) {
    if (h.role === "user" || h.role === "assistant") {
      messages.push({ role: h.role, content: h.content });
    }
  }

  messages.push({ role: "user", content: userMessage });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages,
        options: {
          temperature: 0.6,
          top_p: 0.9,
          num_ctx: 4096,
          num_predict: 220,
          repeat_penalty: 1.1,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    const data = await response.json();
    return (data?.message?.content || "").trim();
  } finally {
    clearTimeout(timer);
  }
}

// ---------- ФОЛБЭК БЕЗ LLM ----------
function fallbackReply(npc, userMessage, context) {
  const message = userMessage.toLowerCase();
  const wantsHint = /подсказ|помо|застрял|не понимаю|как сделать|hint|help/.test(message);

  if (/^(привет|здравств|хай|hello|hi)\b/.test(message)) {
    return npc.role === "product_manager"
      ? "Привет! Я продакт-менеджер. За задачами — к моему столу."
      : "Привет! Я руководитель отдела. Спроси по теме задачи или технологии — подскажу.";
  }

  if (wantsHint && context.activeTask) {
    const hints = taskHints[context.activeTask.title] || [];
    const idx = Math.min(context.hintIndex || 0, hints.length - 1);
    if (hints.length) {
      const left = hints.length - idx - 1;
      return hints[idx] + (left > 0 ? ` (подсказка ${idx + 1} из ${hints.length})` : " (последняя подсказка)");
    }
  }

  const k = findKnowledge(context.departmentSlug, message);
  if (k) return k;

  if (context.activeTask) {
    return `Сейчас у тебя задача «${context.activeTask.title}». Скажи «дай подсказку» — помогу по шагам.`;
  }

  return npc.role === "product_manager"
    ? "Подойди к моему столу и нажми E — выдам задачу по твоему отделу."
    : "Это не по моей части. Спроси про технологии отдела или попроси подсказку к задаче.";
}

// ---------- ГЛАВНАЯ ФУНКЦИЯ ----------
async function askNPC(npc, userMessage, context = {}) {
  const t0 = Date.now();

  try {
    const systemPrompt = buildSystemPrompt(npc, context);
    const reply = await callOllama(systemPrompt, context.history, userMessage);
    const ms = Date.now() - t0;

    // считаем ответ «мусорным», если он слишком короткий или пустой
    if (!reply || reply.length < 4) {
      console.warn(`[npc] LLM вернула пустой ответ за ${ms}мс, фолбэк`);
      return fallbackReply(npc, userMessage, context);
    }

    console.log(`[npc] ${npc.name} ответил через LLM за ${ms}мс`);
    return reply;
  } catch (err) {
    const ms = Date.now() - t0;
    const reason = err.name === "AbortError" ? "таймаут" : err.message;
    console.warn(`[npc] LLM недоступна (${reason}, ${ms}мс), фолбэк`);
    return fallbackReply(npc, userMessage, context);
  }
}

module.exports = { askNPC, taskHints };