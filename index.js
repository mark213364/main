// ============================================================
// BASICCLICKBOT — Cloudflare Worker (без энергии)
// ============================================================

// ⚠️ ЗАМЕНИ на свой Telegram user_id
const ADMIN_ID = 5946292761;

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

    if (path.startsWith('/api/')) {
      return handleApi(request, env, path, corsHeaders);
    }

    if (request.method !== 'POST') {
      return new Response('Bot is running!', { status: 200 });
    }

    try {
      const update = await request.json();
      const message = update.message;

      if (message && message.text === '/start') {
        await handleStart(message, env);
      }

      if (message && message.text && message.text.startsWith('/reset ')) {
        await handleReset(message, env);
      }

      return new Response('OK', { status: 200 });
    } catch (e) {
      console.error('Webhook error:', e.message, e.stack);
      return new Response('Error', { status: 500 });
    }
  }
};

// ============================================================
// TELEGRAM
// ============================================================

async function handleStart(message, env) {
  const chatId = message.chat.id;
  const name = [message.from.first_name, message.from.last_name]
    .filter(Boolean).join(' ') || 'Игрок';
  const username = message.from.username || null;

  await env.DB.prepare(
    `INSERT INTO counters (chat_id, name, username, count)
     VALUES (?, ?, ?, 0)
     ON CONFLICT(chat_id) DO UPDATE SET
       name = excluded.name,
       username = excluded.username`
  ).bind(chatId, name, username).run();

  const result = await env.DB.prepare(
    'SELECT count FROM counters WHERE chat_id = ?'
  ).bind(chatId).first();

  await sendMessage(env.BOT_TOKEN, chatId,
    `👋 Привет, ${name}!\nТекущий счёт: *${result?.count ?? 0}*\n\nОткрой приложение 👇`,
    {
      inline_keyboard: [[
        // ⚠️ ЗАМЕНИ на URL мини-приложения
        { text: '🚀 Открыть приложение', web_app: { url: 'https://mark213364.github.io/main/index.html' } }
      ]]
    }
  );
}

async function handleReset(message, env) {
  if (message.from.id !== ADMIN_ID) {
    await sendMessage(env.BOT_TOKEN, message.chat.id, '⛔ Нет доступа');
    return;
  }

  const targetId = parseInt(message.text.split(' ')[1], 10);
  if (!targetId || isNaN(targetId)) {
    await sendMessage(env.BOT_TOKEN, message.chat.id, '❌ /reset <user_id>');
    return;
  }

  await env.DB.prepare(
    'UPDATE counters SET count = 0 WHERE chat_id = ?'
  ).bind(targetId).run();

  await sendMessage(env.BOT_TOKEN, message.chat.id, `✅ Сброшено для ID ${targetId}`);
}

// ============================================================
// API
// ============================================================

async function handleApi(request, env, path, corsHeaders) {
  const initData = request.headers.get('X-Init-Data');
  const userId = await verifyInitData(initData, env.BOT_TOKEN);

  if (!userId) {
    return json({ error: 'unauthorized' }, 401, corsHeaders);
  }

  // GET /api/me
  if (path === '/api/me' && request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT count FROM counters WHERE chat_id = ?'
    ).bind(userId).first();

    return json({ count: row?.count ?? 0 }, 200, corsHeaders);
  }

  // POST /api/count
  if (path === '/api/count' && request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid body' }, 400, corsHeaders);
    }

    const count = parseInt(body.count, 10);

    if (!Number.isInteger(count) || count < 0) {
      return json({ error: 'invalid count' }, 400, corsHeaders);
    }

    await env.DB.prepare(
      'UPDATE counters SET count = ? WHERE chat_id = ?'
    ).bind(count, userId).run();

    return json({ ok: true }, 200, corsHeaders);
  }

  // GET /api/top
  if (path === '/api/top' && request.method === 'GET') {
    const result = await env.DB.prepare(
      `SELECT chat_id AS user_id,
              COALESCE(username, name, 'Игрок') AS display_name,
              count
       FROM counters
       ORDER BY count DESC
       LIMIT 10`
    ).all();

    return json({ players: result.results }, 200, corsHeaders);
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

async function sendMessage(token, chatId, text, keyboard) {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    })
  });
}

async function verifyInitData(initData, botToken) {
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
    if (!authDate || Date.now() / 1000 - authDate > 86400) {
      return null;
    }

    const encoder = new TextEncoder();

    const secretKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const derivedKey = await crypto.subtle.sign(
      'HMAC',
      secretKey,
      encoder.encode(botToken)
    );

    const verifyKey = await crypto.subtle.importKey(
      'raw',
      derivedKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const hashBytes = new Uint8Array(
      hash.match(/.{1,2}/g).map(b => parseInt(b, 16))
    );

    const isValid = await crypto.subtle.verify(
      'HMAC',
      verifyKey,
      hashBytes,
      encoder.encode(dataCheckString)
    );

    if (!isValid) return null;

    const user = JSON.parse(params.get('user') || '{}');
    return user.id || null;
  } catch (e) {
    console.error('verifyInitData error:', e.message);
    return null;
  }
}
