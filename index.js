export default {
  async fetch(request, env) {
    // Проверяем, что это POST
    if (request.method !== 'POST') {
      return new Response('Bot is running!', { status: 200 });
    }

    try {
      const update = await request.json();

      const message = update.message;
      const callbackQuery = update.callback_query;

      // Обработка команды /start
    if (message && message.text === '/start') {
    const chatId = message.chat.id;

    await env.DB.prepare(
      'INSERT OR IGNORE INTO counters (chat_id, count) VALUES (?, 0)'
    ).bind(chatId).run();

    const result = await env.DB.prepare(
      'SELECT count FROM counters WHERE chat_id = ?'
    ).bind(chatId).first();

await sendMessage(env.BOT_TOKEN, chatId,
  '👋 Привет! Текущий счёт: *${result?.count ?? 0}*\n\nВыбери действие 👇',
   {
   inline_keyboard: [[
        {
          text: '🚀 Открыть приложение',
          web_app: { url: 'https://mark213364.github.io/main/index.html' }
        },
        {
          text: 'ℹ️ О боте',
          callback_data: 'info'
        }
      ]]
    }
  );
}

      // Обработка нажатия кнопки
      if (callbackQuery && callbackQuery.data === 'tap') {
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;

        await env.DB.prepare(
          'UPDATE counters SET count = count + 1 WHERE chat_id = ?'
        ).bind(chatId).run();

        const result = await env.DB.prepare(
          'SELECT count FROM counters WHERE chat_id = ?'
        ).bind(chatId).first();

        await editMessage(env.BOT_TOKEN, chatId, messageId,
          '👋 Текущий счёт: *${result.count}*\n\nЖми кнопку 👇',
          {
            inline_keyboard: [[
              { text: '➕ Нажми меня', callback_data: 'tap' }
            ]]
          }
        );

        await fetch(
          'https://api.telegram.org/bot${env.BOT_TOKEN}/answerCallbackQuery',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: callbackQuery.id
            })
          }
        );
      }

      return new Response('OK', { status: 200 });
    } catch (e) {
      console.error('Error:', e.message, e.stack);
      return new Response('Error', { status: 500 });
    }
  }
};

async function sendMessage(token, chatId, text, keyboard) {
  return fetch('https://api.telegram.org/bot${token}/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    })
  });
}

async function editMessage(token, chatId, messageId, text, keyboard) {
  return fetch('https://api.telegram.org/bot${token}/editMessageText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    })
  });
}
