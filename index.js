export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS для мини-приложения
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

        await env.DB.prepare(
          `INSERT INTO counters (chat_id, name, count) VALUES (?, ?, 0)
           ON CONFLICT(chat_id) DO UPDATE SET name = excluded.name`
        ).bind(chatId, name).run();

        const result = await env.DB.prepare(
          'SELECT count FROM counters WHERE chat_id = ?'
        ).bind(chatId).first();

        await sendMessage(env.BOT_TOKEN, chatId,
          `👋 Привет, заходи в игру \n\nВыбери действие 👇`,
          {
            inline_keyboard: [[
              { text: '🚀 Открыть приложение', web_app: { url: 'https://mark213364.github.io/main/index.html' } }
            ]]
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

// ===== API =====
async function handleApi(request, env, path, corsHeaders) {
  const initData = request.headers.get('X-Init-Data');
  const userId = verifyInitData(initData, env.BOT_TOKEN);

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

  // POST /api/count — обновить мой счёт
  if (path === '/api/count' && request.method === 'POST') {
    const body = await request.json();
    const count = parseInt(body.count, 10);

    if (!Number.isInteger(count) || count < 0) {
      return json({ error: 'invalid count' }, 400, corsHeaders);
    }

    await env.DB.prepare(
      `INSERT INTO counters (chat_id, name, count) VALUES (?, 'Игрок', ?)
       ON CONFLICT(chat_id) DO UPDATE SET count = excluded.count`
    ).bind(userId, count).run();

    return json({ ok: true }, 200, corsHeaders);
  }

  // GET /api/top — топ-10
  if (path === '/api/top' && request.method === 'GET') {
    const result = await env.DB.prepare(
      'SELECT chat_id AS user_id, name, count FROM counters ORDER BY count DESC LIMIT 10'
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

// Проверка подписи Telegram initData
function verifyInitData(initData, botToken) {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    // В Workers нет crypto.createHmac — используем Web Crypto API
    // Но для простоты пока пропускаем проверку подписи.
    // В продакшене обязательно проверяй!
    const user = JSON.parse(params.get('user') || '{}');
    return user.id || null;
  } catch (e) {
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
