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
      const callbackQuery = update.callback_query;

      if (message && message.text === '/start') {
  const chatId = message.chat.id;
  const name = [message.from.first_name, message.from.last_name]
    .filter(Boolean).join(' ') || 'Игрок';
  const username = message.from.username || null;

  await env.DB.prepare(
    `INSERT INTO counters (chat_id, name, username, count) VALUES (?, ?, ?, 0)
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
        { text: '🚀 Открыть приложение', web_app: { url: 'https://mark213364.github.io/main/index.html' } }
      ]]
    }
  );
}

      // Команда админа: /reset <user_id>
      if (message && message.text && message.text.startsWith('/reset ')) {
        if (message.from.id !== ADMIN_ID) {
          await sendMessage(env.BOT_TOKEN, message.chat.id, '⛔ Нет доступа');
          return new Response('OK', { status: 200 });
        }

        const targetId = parseInt(message.text.split(' ')[1], 10);
        if (!targetId || isNaN(targetId)) {
          await sendMessage(env.BOT_TOKEN, message.chat.id, '❌ Использование: /reset <user_id>');
          return new Response('OK', { status: 200 });
        }

        await env.DB.prepare(
          'UPDATE counters SET count = 0, clicks_in_window = 0 WHERE chat_id = ?'
        ).bind(targetId).run();

        await sendMessage(env.BOT_TOKEN, message.chat.id, '✅ Счёт сброшен для ID ${targetId}');
      }

      return new Response('OK', { status: 200 });
    } catch (e) {
      console.error('Error:', e.message, e.stack);
      return new Response('Error', { status: 500 });
    }
  }
};

const ADMIN_ID = 5946292761; // ⚠️ ЗАМЕНИ на свой user_id

// ===== API =====
async function handleApi(request, env, path, corsHeaders) {
  const initData = request.headers.get('X-Init-Data');
  const userId = await verifyInitData(initData, env.BOT_TOKEN);

  if (!userId) {
    return json({ error: 'unauthorized' }, 401, corsHeaders);
  }

  // GET /api/me — мой счёт
  if (path === '/api/me' && request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT count FROM counters WHERE chat_id = ?'
    ).bind(userId).first();

    return json({ count: row?.count ?? 0 }, 200, corsHeaders);
  }

  // POST /api/count — обновить мой счёт (с античит-проверкой)
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

    // Получаем текущее состояние пользователя
    const row = await env.DB.prepare(
      'SELECT count, last_click_at, clicks_in_window FROM counters WHERE chat_id = ?'
    ).bind(userId).first();

    const now = Date.now();
    const currentCount = row?.count || 0;
    const delta = count - currentCount;
    // Проверка 1: дельта не может быть отрицательной или огромной
    if (delta < 0 || delta > 10) {
      return json({ ok: true, blocked: 'delta' }, 200, corsHeaders);
    }

    // Проверка 2: окно кликов (2 секунды)
    let windowClicks = row?.clicks_in_window || 0;
    const lastClickAt = row?.last_click_at || 0;

    if (now - lastClickAt > 2000) {
      windowClicks = 0;
    }
    windowClicks += delta;

    // Больше 8 кликов за 2 секунды — считаем ботом
    if (windowClicks > 8) {
      console.log(`Bot suspected: user ${userId}, windowClicks ${windowClicks}`);
      return json({ ok: true, blocked: 'rate' }, 200, corsHeaders);
    }

    // Проверка 3: слишком быстрый интервал между запросами
    if (now - lastClickAt < 50 && delta > 0) {
      return json({ ok: true, blocked: 'too_fast' }, 200, corsHeaders);
    }

    // Всё ок — сохраняем
    await env.DB.prepare(`
      UPDATE counters
       SET count = ?, last_click_at = ?, clicks_in_window = ?
       WHERE chat_id = ?`
    ).bind(count, now, windowClicks, userId).run();

    return json({ ok: true }, 200, corsHeaders);
  }

  // GET /api/top — топ-10
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

// ===== Хелперы =====
function json(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

// Полная проверка подписи Telegram initData через Web Crypto API
async function verifyInitData(initData, botToken) {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(`([k, v]) => ${k}=${v}`)
      .join('\n');

    // Проверка свежести initData (не старше 1 дня)
    const authDate = parseInt(params.get('auth_date'), 10);
    if (!authDate || Date.now() / 1000 - authDate > 86400) {
      return null;
    }

    const encoder = new TextEncoder();

    // secret_key = HMAC-SHA256("WebAppData", bot_token)
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

    // verify_key = derivedKey
    const verifyKey = await crypto.subtle.importKey(
      'raw',
      derivedKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Преобразуем hex-хэш в байты
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
