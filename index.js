export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Проверяем, что это запрос от Telegram
    if (request.method !== 'POST') {
      return new Response('Bot is running!', { status: 200 });
    }

    try {
      const update = await request.json();

      // Обработка команды /start
      if (update.message && update.message.text === '/start') {
        const chatId = update.message.chat.id;

        // Создаём запись, если её нет
        await env.DB.prepare(
          'INSERT OR IGNORE INTO counters (chat_id, count) VALUES (?, 0)'
        ).bind(chatId).run();

        const result = await env.DB.prepare(
          'SELECT count FROM counters WHERE chat_id = ?'
        ).bind(chatId).first();

        await sendMessage(env.BOT_TOKEN, chatId,
          '👋 Привет! Текущий счёт: *${result?.count ?? 0}*\n\nЖми кнопку 👇',
          {
            inline_keyboard: [[
              { text: '➕ Нажми меня', callback_data: 'tap' }
            ]]
          }
        );
      }

      // Обработка нажатия кнопки
      if (update.callback_query && update.callback_query.data === 'tap') {
        const chatId = update.callback_query.message.chat.id;
        const messageId = update.callback_query.message.message_id;

        // Увеличиваем счётчик и получаем новое значение
        await env.DB.prepare(
          'UPDATE counters SET count = count + 1 WHERE chat_id = ?'
        ).bind(chatId).run();

        const result = await env.DB.prepare(
          'SELECT count FROM counters WHERE chat_id = ?'
        ).bind(chatId).first();

        // Обновляем сообщение
        await editMessage(env.BOT_TOKEN, chatId, messageId,
          '👋 Текущий счёт: *${result.count}*\n\nЖми кнопку 👇',
          {
            inline_keyboard: [[
              { text: '➕ Нажми меня', callback_data: 'tap' }
            ]]
          }
        );

        // Убираем "часики" на кнопке
        await fetch(
          'https://api.telegram.org/bot${env.BOT_TOKEN}/answerCallbackQuery',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: update.callback_query.id
            })
          }
        );
      }

      return new Response('OK', { status: 200 });
    } catch (e) {
      console.error(e);
      return new Response('Error', { status: 500 });
    }
  }
};

// Хелпер: отправить сообщение
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

// Хелпер: отредактировать сообщение
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
