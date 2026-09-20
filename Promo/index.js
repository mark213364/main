// ============================================================
// CHATPROMO — бот для предложений от пользователей
// ============================================================
// Логика:
//   1. Пользователь пишет боту → сохраняем в D1 → пересылаем админу
//   2. Админ жмёт «Принять»/«Отклонить» → обновляем статус →
//      уведомляем пользователя ЧЕРЕЗ ЭТОГО ЖЕ БОТА
// ============================================================

// ⚠️ ЗАМЕНИ на свой Telegram user_id
const ADMIN_ID = 5946292761;

export default {
  async fetch(request, env) {
    // Проверка метода
    if (request.method !== 'POST') {
      return new Response('Proposals Bot is running!', { status: 200 });
    }

    try {
      const update = await request.json();

      // ============================================================
      // 1. ПРИЁМ НОВОГО ПРЕДЛОЖЕНИЯ ОТ ПОЛЬЗОВАТЕЛЯ
      // ============================================================
      if (update.message && update.message.text) {
        return await handleNewProposal(update.message, env);
      }

      // ============================================================
      // 2. ОБРАБОТКА НАЖАТИЯ КНОПКИ АДМИНОМ
      // ============================================================
      if (update.callback_query) {
        return await handleCallback(update.callback_query, env);
      }

      return new Response('OK', { status: 200 });
    } catch (e) {
      console.error('Error:', e.message, e.stack);
      return new Response('Error', { status: 500 });
    }
  }
};

// ============================================================
// НОВОЕ ПРЕДЛОЖЕНИЕ
// ============================================================

async function handleNewProposal(message, env) {
  const userId = message.from.id;
  const username = message.from.username || null;
  const text = message.text;

  // Игнорируем команду /start
  if (text === '/start') {
    await sendMessage(env.BOT_TOKEN, userId,
      '👋 Привет!\n\n' +
      'Напиши мне своё предложение — что добавить или изменить в игре.\n' +
      'Я передам его разработчику, и он ответит тебе здесь же.');
    return new Response('OK', { status: 200 });
  }

  // Сохраняем в БД
  let proposalId;
  try {
    const result = await env.DB.prepare(
      `INSERT INTO proposals (user_id, username, text, status, created_at)
       VALUES (?, ?, ?, 'pending', ?)
       RETURNING id`
    ).bind(userId, username, text, Date.now()).first();

    proposalId = result.id;
  } catch (e) {
    console.error('DB error:', e.message);
    await sendMessage(env.BOT_TOKEN, userId, '❌ Ошибка сохранения. Попробуй позже.');
    return new Response('Error', { status: 500 });
  }

  // Отправляем админу
  const adminText =
    '📩 *Новое предложение #' + proposalId + '*\n\n' +
    'От: ' + (username ? '@' + username : 'ID ' + userId) + '\n\n' +
    text;

  const sendRes = await fetch(
    'https://api.telegram.org/bot' + env.BOT_TOKEN + '/sendMessage',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_ID,
        text: adminText,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Принять', callback_data: 'approve_' + proposalId + '_' + userId },
            { text: '❌ Отклонить', callback_data: 'reject_' + proposalId + '_' + userId }
          ]]
        }
      })
    }
  );
  const sendData = await sendRes.json();
  console.log('SEND TO ADMIN:', JSON.stringify(sendData));

  // Отвечаем пользователю
  await sendMessage(env.BOT_TOKEN, userId,
    '✅ Твоё предложение отправлено!\nОжидай ответа в этом чате.');

  return new Response('OK', { status: 200 });
}

// ============================================================
// ОБРАБОТКА НАЖАТИЯ КНОПКИ
// ============================================================

async function handleCallback(cb, env) {
  const data = cb.data;
  const parts = data.split('_');
  const action = parts[0];
  const proposalId = parseInt(parts[1], 10);
  const userId = parseInt(parts[2], 10);

  if (!action || !proposalId || !userId) {
    await answerCallback(env.BOT_TOKEN, cb.id, 'Ошибка данных');
    return new Response('OK', { status: 200 });
  }

  const status = action === 'approve' ? 'approved' : 'rejected';

  // Обновляем статус в БД
  await env.DB.prepare(
    'UPDATE proposals SET status = ? WHERE id = ?'
  ).bind(status, proposalId).run();

  // Формируем текст для пользователя
  const isApproved = action === 'approve';
  const title = isApproved
    ? '✅ Твоё предложение принято!'
    : '❌ Твоё предложение отклонено';
  const body = isApproved
    ? 'Спасибо! Мы добавим это в игру в ближайшее время.'
    : 'Спасибо за идею! К сожалению, сейчас мы не можем её реализовать.';

  // Уведомляем пользователя ЧЕРЕЗ ЭТОГО ЖЕ БОТА (chatpromo)
  await sendMessage(env.BOT_TOKEN, userId,
    title + '\n\n' + body + '\n\nПредложение #' + proposalId);

  // Убираем кнопки из сообщения админа
  await fetch(
    'https://api.telegram.org/bot' + env.BOT_TOKEN + '/editMessageReplyMarkup',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        reply_markup: { inline_keyboard: [] }
      })
    }
  );

  // Отвечаем на callback (убираем "часики" на кнопке)
  const verdict = isApproved ? 'принято' : 'отклонено';
  await answerCallback(env.BOT_TOKEN, cb.id, 'Статус: ' + verdict);

  return new Response('OK', { status: 200 });
}

// ============================================================
// ХЕЛПЕРЫ
// ============================================================

async function sendMessage(token, chatId, text) {
  return fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text
    })
  });
}

async function answerCallback(token, callbackId, text) {
  return fetch('https://api.telegram.org/bot' + token + '/answerCallbackQuery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackId,
      text: text
    })
  });
}
