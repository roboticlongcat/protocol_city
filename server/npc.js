const OLLAMA_URL =
  process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat";

async function askNPC(npc, userMessage, context = {}) {
  const systemPrompt = `
Ты персонаж образовательной игры "Протокол-Сити".
Твоя роль: ${npc.role}.
Твоя личность: ${npc.personality}.
Ты находишься в городе, который визуализирует работу веб-приложений.
Игрок изучает, как работают браузер, запросы, сервер, база данных, сеть, авторизация и кэш.

Отвечай:
- кратко;
- по-русски;
- дружелюбно;
- в роли персонажа;
- если игрок ошибается, дай наводящую подсказку;
- не вываливай сразу слишком много теории.

Контекст игрока:
${JSON.stringify(context)}
  `.trim();

  const payload = {
    model: npc.model || "qwen2.5:3b",
    stream: false,
    options: {
      temperature: 0.7,
      num_ctx: 2048,
    },
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userMessage,
      },
    ],
  };

  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();

  return data?.message?.content?.trim() || "Хм... я пока не могу ответить.";
}

module.exports = { askNPC };