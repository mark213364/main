// ============================================================
// CHATPROMO — бот для предложений
// ============================================================
// 1. Пользователь пишет в боте ИЛИ в мини-аппе
// 2. Предложение уходит админу с кнопками ✅ / ❌
// 3. Админ нажимает → пользователю приходит ответ в чат с ботом
// ============================================================

// ⚠️ ЗАМЕНИ на свой Telegram user_id
const ADMIN_ID = 5946292761;

// ⚠️ ЗАМЕНИ на URL своего мини-приложения (chatpromo.html)
const WEBAPP_URL = 'https://mark213364.github.io/main/Promo/chatpromo.html';

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
// ОБРАБОТКА СООБЩЕНИЙ В БОТЕ
// ============================================================

async function handleMessage(message, env) {
  const userId = message.from.id;
  const username = message.from.username || null;
  const text = message.text;

  // /start — показать кнопку мини-приложения
  if (text === '/start') {
    await sendMessage(env.BOT_TOKEN, userId,
      '👋 Привет!\n\n' +
      'Нажми кнопку ниже, чтобы отправить своё предложение.',
      null,
      {
        inline_keyboard: [[
          { text: '📝 Отправить предложение', web_app: { url: WEBAPP_URL } }
        ]]
      });
    return new Response('OK', { status: 200 });
  }

  // Если пишут текстом в чат — тоже принимаем как предложение
  await saveProposalAndNotify(userId, username, text, env);

  return new Response('OK', { status: 200 });
}

// ============================================================
// СОХРАНЕНИЕ ПРЕДЛОЖЕНИЯ + УВЕДОМЛЕНИЕ АДМИНА
// ============================================================

async function saveProposalAndNotify(userId, username, text, env) {
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
    return null;
  }

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

  return proposalId;
}

// ============================================================
// ОБРАБОТКА КНОПОК «ПРИНЯТЬ» / «ОТКЛОНИТЬ»
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

  if (!userId) {
    return json({ error: 'unauthorized' }, 401, corsHeaders);
  }

  // ===== POST /api/send — отправить предложение =====
  if (path === '/api/send' && request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid body' }, 400, corsHeaders);
    }

    const text = (body.text || '').trim();

    if (text.length < 3) {
      return json({ error: 'too_short', message: 'Слишком короткое предложение' }, 400, corsHeaders);
    }
    if (text.length > 1000) {
      return json({ error: 'too_long', message: 'Максимум 1000 символов' }, 400, corsHeaders);
    }

    // Достаём username из initData
    const initData = request.headers.get('X-Init-Data');
    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user') || '{}');
    const username = user.username || null;

    const proposalId = await saveProposalAndNotify(userId, username, text, env);

    if (!proposalId) {
      return json({ error: 'save_failed' }, 500, corsHeaders);
    }

    return json({ ok: true, proposalId: proposalId }, 200, corsHeaders);
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
  const body = { chat_id: chatId, text: text };
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
    body: JSON.stringify({ callback_query_id: callbackId, text: text })
  });
}

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
