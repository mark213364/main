// ============================================================
// CHATPROMO — бот для предложений + панель управления
// ============================================================

// ⚠️ ЗАМЕНИ на свой Telegram user_id
const ADMIN_ID = 5946292761;

// ⚠️ ЗАМЕНИ на URL своего мини-приложения
const WEBAPP_URL = 'https://mark213364.github.io/main/Promo/index.html';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Init-Data',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ===== API для мини-приложения =====
    if (path.startsWith('/api/')) {
      return handleApi(request, env, path, corsHeaders);
    }

    // ===== Webhook Telegram =====
    if (request.method !== 'POST') {
      return new Response('Proposals Bot is running!', { status: 200 });
    }

    try {
      const update = await request.json();

      if (update.message && update.message.text) {
        return await handleMessage(update.message, env);
      }

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
// ОБРАБОТКА СООБЩЕНИЙ ОТ ПОЛЬЗОВАТЕЛЕЙ
// ============================================================

async function handleMessage(message, env) {
  const userId = message.from.id;
  const username = message.from.username || null;
  const text = message.text;

  // /start — приветствие
  if (text === '/start') {
    // Если это админ — показать кнопку панели
    if (userId === ADMIN_ID) {
      await sendMessage(env.BOT_TOKEN, userId,
        '👋 Привет, админ!\n\n' +
        'Открой панель, чтобы видеть все предложения.',
        'Markdown',
        {
          inline_keyboard: [[
            { text: '📋 Открыть панель', web_app: { url: WEBAPP_URL } }
          ]]
        });
    } else {
      await sendMessage(env.BOT_TOKEN, userId,
        '👋 Привет!\n\n' +
        'Напиши мне своё предложение — что добавить или изменить в игре.\n' +
        'Я передам его разработчику, и он ответит тебе здесь же.');
    }
    return new Response('OK', { status: 200 });
  }

  // Если админ пишет /panel
  if (text === '/panel' && userId === ADMIN_ID) {
    await sendMessage(env.BOT_TOKEN, userId,
      '📋 Панель предложений:',
      null,
      {
        inline_keyboard: [[
          { text: '🚀 Открыть', web_app: { url: WEBAPP_URL } }
        ]]
      });
    return new Response('OK', { status: 200 });
  }

  // Сохраняем предложение в БД
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
  const safeText = escapeMarkdown(text);
  const safeUsername = username ? escapeMarkdown('@' + username) : ('ID ' + userId);

  const adminText =
    '📩 *Новое предложение #' + proposalId + '*\n\n' +
    'От: ' + safeUsername + '\n\n' +
    safeText;

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
// ОБРАБОТКА КНОПОК В ЧАТЕ БОТА
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

  await env.DB.prepare(
    'UPDATE proposals SET status = ? WHERE id = ?'
  ).bind(status, proposalId).run();

  const isApproved = action === 'approve';
  const title = isApproved
    ? '✅ *Твоё предложение принято!*'
    : '❌ *Твоё предложение отклонено*';
  const body = isApproved
    ? 'Спасибо! Мы добавим это в игру в ближайшее время.'
    : 'Спасибо за идею! К сожалению, сейчас мы не можем её реализовать.';

  const userText =
    title + '\n\n' + body + '\n\n' + '_Предложение #' + proposalId + '_';

  // Уведомляем пользователя
  await sendMessage(env.BOT_TOKEN, userId, userText, 'Markdown');

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

  const verdict = isApproved ? 'принято' : 'отклонено';
  await answerCallback(env.BOT_TOKEN, cb.id, 'Статус: ' + verdict);

  return new Response('OK', { status: 200 });
}

// ============================================================
// API ДЛЯ МИНИ-ПРИЛОЖЕНИЯ
// ============================================================

async function handleApi(request, env, path, corsHeaders) {
  const userId = await verifyInitData(request, env);

  // ===== GET /api/proposals — список всех предложений =====
  if (path === '/api/proposals' && request.method === 'GET') {
    if (!userId || userId !== ADMIN_ID) {
      return json({ error: 'forbidden' }, 403, corsHeaders);
    }

    const result = await env.DB.prepare(
      `SELECT id, user_id, username, text, status, created_at
       FROM proposals
       ORDER BY created_at DESC
       LIMIT 100`
    ).all();

    return json({ proposals: result.results }, 200, corsHeaders);
  }

  // ===== POST /api/proposals/decide — принять/отклонить =====
  if (path === '/api/proposals/decide' && request.method === 'POST') {
    if (!userId || userId !== ADMIN_ID) {
      return json({ error: 'forbidden' }, 403, corsHeaders);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid body' }, 400, corsHeaders);
    }

    const proposalId = parseInt(body.proposalId, 10);
    const action = body.action;

    if (!proposalId || !action) {
      return json({ error: 'invalid params' }, 400, corsHeaders);
    }

    const status = action === 'approve' ? 'approved' : 'rejected';

    const proposal = await env.DB.prepare(
      'SELECT user_id FROM proposals WHERE id = ?'
    ).bind(proposalId).first();

    if (!proposal) {
      return json({ error: 'not found' }, 404, corsHeaders);
    }

    await env.DB.prepare(
      'UPDATE proposals SET status = ? WHERE id = ?'
    ).bind(status, proposalId).run();

    // Уведомляем пользователя через бота
    const isApproved = action === 'approve';
    const title = isApproved
      ? '✅ *Твоё предложение принято!*'
      : '❌ *Твоё предложение отклонено*';
    const bodyText = isApproved
      ? 'Спасибо! Мы добавим это в игру в ближайшее время.'
      : 'Спасибо за идею! К сожалению, сейчас мы не можем её реализовать.';

    await sendMessage(env.BOT_TOKEN, proposal.user_id,
      title + '\n\n' + bodyText + '\n\n_Предложение #' + proposalId + '_',
      'Markdown');

    return json({ ok: true, status: status }, 200, corsHeaders);
  }

  // ===== GET /api/stats — статистика =====
  if (path === '/api/stats' && request.method === 'GET') {
    if (!userId || userId !== ADMIN_ID) {
      return json({ error: 'forbidden' }, 403, corsHeaders);
    }

    const row = await env.DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
       FROM proposals`
    ).first();

    return json({
      total: row.total || 0,
      pending: row.pending || 0,
      approved: row.approved || 0,
      rejected: row.rejected || 0
    }, 200, corsHeaders);
  }

  return json({ error: 'not found' }, 404, corsHeaders);
}

// ============================================================
// ХЕЛПЕРЫ
// ============================================================

function json(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

async function sendMessage(token, chatId, text, parseMode, keyboard) {
  const body = {
    chat_id: chatId,
    text: text
  };
  if (parseMode) body.parse_mode = parseMode;
  if (keyboard) body.reply_markup = keyboard;

  return fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
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

// Проверка подписи initData
async function verifyInitData(request, env) {
  const initData = request.headers.get('X-Init-Data');
  if (!initData) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const entries = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let dataCheckString = '';
    for (let i = 0; i < entries.length; i++) {
      if (i > 0) dataCheckString += '\n';
      dataCheckString += entries[i][0] + '=' + entries[i][1];
    }

    const authDate = parseInt(params.get('auth_date'), 10);
    if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

    const encoder = new TextEncoder();

    const secretKey = await crypto.subtle.importKey(
      'raw', encoder.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );

    const derivedKey = await crypto.subtle.sign(
      'HMAC', secretKey, encoder.encode(env.BOT_TOKEN)
    );

    const verifyKey = await crypto.subtle.importKey(
      'raw', derivedKey,
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );

    const hashBytes = new Uint8Array(
      hash.match(/.{1,2}/g).map(b => parseInt(b, 16))
    );

    const isValid = await crypto.subtle.verify(
      'HMAC', verifyKey, hashBytes, encoder.encode(dataCheckString)
    );

    if (!isValid) return null;

    const user = JSON.parse(params.get('user') || '{}');
    return user.id || null;
  } catch (e) {
    console.error('verifyInitData error:', e.message);
    return null;
  }
}

function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}
