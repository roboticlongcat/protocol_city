const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:1.5b";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 45000);

function createApps(deps) {
  const db = deps.db;
  const sendJSON = deps.sendJSON;
  const clients = deps.clients;
  const getFlags = deps.getFlags;
  const getPlayerDepartment = deps.getPlayerDepartment;
  const getProjectSnapshot = deps.getProjectSnapshot;
  const admin = deps.admin;

  async function askRawMeta(system, question, maxTokens) {
    const limit = maxTokens || 220;
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, OLLAMA_TIMEOUT_MS);
    try {
        const resp = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            stream: false,
            messages: [{ role: "system", content: system }, { role: "user", content: question }],
            options: { temperature: 0.3, num_predict: limit, num_ctx: 4096 },
        }),
        });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const data = await resp.json();
        const content = (data && data.message && data.message.content || "").trim();
        const truncated = !!(data && (data.done_reason === "length" || (data.eval_count || 0) >= limit));
        return { content: content, truncated: truncated };
    } catch (e) {
        return { content: "[ассистент недоступен: " + (e.name === "AbortError" ? "таймаут" : e.message) + "]", truncated: false };
    } finally {
        clearTimeout(timer);
    }
    }

    function cleanArticle(text, truncated) {
        let t = String(text || "");
        t = t.replace(/\*\*/g, "");
        t = t.replace(/^#{1,6}\s*/gm, "");
        t = t.replace(/^\s*[-*_]{3,}\s*$/gm, "");
        t = t.replace(/^>\s?/gm, "");
        t = t.replace(/^Конечно[,.]!?\s*/i, "");
        t = t.replace(/^Вот\s+(небольшая\s+)?статья[^\n]*\n/i, "");
        t = t.replace(/^Страница:[^\n]*\n/i, "");
        t = t.replace(/\n{3,}/g, "\n\n").trim();
        if (truncated) {
            const last = Math.max(t.lastIndexOf("."), t.lastIndexOf("!"), t.lastIndexOf("?"));
            if (last > t.length * 0.5) t = t.slice(0, last + 1);
            t = t + "\n\n(продолжение не уместилось в один ответ)";
        }
        return t;
        }

        function isRefusal(text) {
        return /К сожалению|нет доступа|не могу написать|не имею доступа|станет доступной/i.test(text || "");
        }

        function fallbackPage(title, ctx) {
        return (
            "Страница «" + title + "» ещё пишется редакцией портала.\n\n" +
            "Пока материал готовится, вот сводка мира по твоему запросу:\n" +
            ctx +
            "\n\nУточни запрос в строке поиска или вернись позже."
        );
        }

    async function askRaw(system, question) {
    const r = await askRawMeta(system, question, 220);
    return r.content;
    }

  function buildContext(ws) {
    const dept = getPlayerDepartment(db, ws.userId);
    const flags = getFlags(db, ws.userId);
    const proj = getProjectSnapshot(db);
    const parts = [];
    parts.push("Игрок: " + ws.username + (dept ? ", отдел: " + dept.name : ", без отдела"));
    parts.push("Очки: " + (flags.points || 0));
    if (proj) {
      const done = proj.steps.filter(function (s) { return s.status === "done"; }).length;
      parts.push("Проект: " + proj.title + ", " + done + "/" + proj.steps.length + " шагов");
      for (const s of proj.steps) {
        parts.push("  шаг " + (s.order_index + 1) + ": " + s.department_name + " - " + s.status + (s.by_username ? " (" + s.by_username + ")" : ""));
      }
    }
    const active = db.prepare("SELECT t.title FROM task_instances ti JOIN tasks t ON t.id = ti.task_id WHERE ti.user_id = ? AND ti.status = 'in_progress'").all(ws.userId);
    if (active.length) parts.push("Активные задачи: " + active.map(function (a) { return a.title; }).join(", "));
    parts.push("Отделы: " + db.prepare("SELECT name FROM departments").all().map(function (d) { return d.name; }).join(", "));
    return parts.join("\n");
  }

  function runCommand(ws, action) {
    if (action === "help") return { ok: true, lines: ["Команды: help, status, whoami, tasks, project, metrics, ask <вопрос>"] };
    if (action === "status") {
      const agg = admin && admin.aggregate ? admin.aggregate() : {};
      return { ok: true, lines: ["клиентов: " + clients.size, "uptime: " + (agg.uptimeSec || 0) + "с", "avgFps: " + (agg.avgFps || 0)] };
    }
    if (action === "whoami") {
      const dept = getPlayerDepartment(db, ws.userId);
      const flags = getFlags(db, ws.userId);
      return { ok: true, lines: ["user: " + ws.username + " (id " + ws.userId + ")", "role: " + (ws.isAdmin ? "admin" : "member"), "отдел: " + (dept ? dept.name : "-"), "очки: " + (flags.points || 0)] };
    }
    if (action === "tasks") {
      const rows = db.prepare("SELECT t.title, t.difficulty, t.reward_points FROM task_instances ti JOIN tasks t ON t.id = ti.task_id WHERE ti.user_id = ? AND ti.status = 'in_progress'").all(ws.userId);
      return { ok: true, lines: rows.length ? rows.map(function (r) { return r.title + " (" + r.difficulty + ", +" + r.reward_points + ")"; }) : ["Нет активных задач."] };
    }
    if (action === "project") {
      const proj = getProjectSnapshot(db);
      if (!proj) return { ok: true, lines: ["Нет открытого проекта."] };
      return { ok: true, lines: proj.steps.map(function (s) { return (s.order_index + 1) + ". " + s.department_name + " - " + s.status + (s.by_username ? " (" + s.by_username + ")" : ""); }) };
    }
    if (action === "metrics") {
      if (!ws.isAdmin) return { ok: false, lines: ["Только для админа."] };
      const agg = admin && admin.aggregate ? admin.aggregate() : {};
      return { ok: true, lines: ["online: " + agg.online, "live: " + agg.liveClients, "avgFps: " + agg.avgFps, "p95Ping: " + agg.p95Ping] };
    }
    return { ok: false, lines: ["Неизвестная команда: " + action + ". Введи help."] };
  }

  function handleProjects(ws) {
    const personal = db.prepare(
      "SELECT t.title, t.difficulty, t.reward_points, ti.status, ti.completed_at " +
      "FROM task_instances ti JOIN tasks t ON t.id = ti.task_id " +
      "WHERE ti.user_id = ? ORDER BY ti.id DESC LIMIT 20"
    ).all(ws.userId);
    const project = getProjectSnapshot(db);
    sendJSON(ws, "app_response", { appId: "projects", ok: true, data: { personal: personal, project: project } });
  }

  async function handleBrowser(ws, msg) {
    const ctx = buildContext(ws);
    const action = msg.action || "home";

    if (action === "home") {
        const depsList = db.prepare("SELECT name, slug FROM departments").all();
        const proj = getProjectSnapshot(db);
        sendJSON(ws, "app_response", { appId: "browser", ok: true, data: { kind: "home", deps: depsList, project: proj ? proj.title : null } });
        return;
    }

    if (action === "search") {
        const query = String(msg.query || "").trim();
        if (!query) {
        sendJSON(ws, "app_response", { appId: "browser", ok: true, data: { kind: "search", query: "", results: [] } });
        return;
        }
        const system =
        "Ты - поисковик корпоративного портала Протокол-Сити.\n" +
        "По контексту мира верни СТРОГО JSON-массив из 3 объектов вида [{\"title\": \"...\", \"snippet\": \"...\"}].\n" +
        "title - короткий заголовок страницы без markdown, snippet - 1-2 предложения на русском без markdown.\n" +
        "Никакого markdown, никаких пояснений, только JSON-массив.\n\nКОНТЕКСТ МИРА:\n" + ctx;
        const raw = await askRaw(system, query);
        let results = null;
        try {
        const start = raw.indexOf("[");
        const end = raw.lastIndexOf("]");
        if (start >= 0 && end > start) results = JSON.parse(raw.slice(start, end + 1));
        } catch (e) { results = null; }
        if (!Array.isArray(results) || !results.length) {
        results = [{ title: query, snippet: raw || "Ничего не найдено." }];
        }
        results = results.slice(0, 5).map(function (r) {
        return {
            title: String(r.title || query).replace(/\*\*/g, "").slice(0, 80),
            snippet: cleanArticle(String(r.snippet || ""), false).slice(0, 220),
        };
        });
        sendJSON(ws, "app_response", { appId: "browser", ok: true, data: { kind: "search", query: query, results: results } });
        return;
    }

  if (action === "page") {
    const title = String(msg.query || "").trim();
    const system =
      "Ты - автор статьи корпоративного портала «Протокол-Сити».\n" +
      "ПРАВИЛА, которые запрещено нарушать:\n" +
      "1. Всегда пиши статью. Никогда не отказывайся, не пиши про отсутствие доступа, готовности или прав.\n" +
      "2. Объём: ровно 3 абзаца по 2-3 предложения. Без списков, без заголовков внутри текста.\n" +
      "3. Никакого markdown: без **, без #, без ---, без нумерации точками с звёздочками.\n" +
      "4. Без вступлений вроде «Конечно, вот статья». Начинай сразу с первого абзаца.\n" +
      "5. Пиши по-русски, как внутренний блог компании.\n" +
      "6. Даже если тема не про компанию - свяжи её с жизнью офиса Протокол-Сити: отделы, задачи, релизы, совещания, кофе, офисные коты.\n\n" +
      "КОНТЕКСТ МИРА:\n" + ctx;
    let meta = await askRawMeta(system, "Статья на тему: " + title, 700);
    if (isRefusal(meta.content)) {
      meta = await askRawMeta(
        system + "\n7. Предыдущая попытка содержала отказ. Это ошибка. Напиши статью заново и полностью.",
        "Статья на тему: " + title,
        700
      );
    }
    let text = cleanArticle(meta.content, meta.truncated);
    if (!text || isRefusal(text)) text = fallbackPage(title, ctx);
    sendJSON(ws, "app_response", { appId: "browser", ok: true, data: { kind: "page", title: title, text: text } });
    return;
  }

  sendJSON(ws, "app_response", { appId: "browser", ok: false, data: { kind: "error", text: "Неизвестное действие" } });
}

  async function handleAppQuery(ws, msg) {
    if (msg.appId === "terminal") {
      const action = String(msg.action || "help").trim();
      if (action.indexOf("ask ") === 0) {
        const q = action.slice(4).trim();
        if (!q) { sendJSON(ws, "app_response", { appId: "terminal", ok: false, data: { lines: ["Формат: ask <вопрос>"] } }); return; }
        const reply = await askRaw(
          "Ты - внутриигровой ассистент Терминал в офисе Протокол-Сити.\n" +
          "Отвечай по-русски, кратко (1-4 предложения), как справка системы.\n" +
          "Опирайся на факты контекста; если вопроса нет в контексте - скажи, что не знаешь, и предложи help.\n\nКОНТЕКСТ МИРА:\n" + buildContext(ws),
          q
        );
        sendJSON(ws, "app_response", { appId: "terminal", ok: true, data: { lines: ["ассистент> " + reply] } });
        return;
      }
      const res = runCommand(ws, action);
      sendJSON(ws, "app_response", { appId: "terminal", ok: res.ok, data: { lines: res.lines } });
      return;
    }
    if (msg.appId === "projects") { handleProjects(ws); return; }
    if (msg.appId === "browser") { await handleBrowser(ws, msg); return; }
    sendJSON(ws, "app_response", { appId: msg.appId, ok: false, data: { lines: ["Приложение ещё не подключено."] } });
  }

  return { handleAppQuery: handleAppQuery };
}

module.exports = { createApps: createApps };