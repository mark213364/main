// ============================================================
// BASICCLICKBOT — Cloudflare Worker (без энергии)
// ============================================================

// ⚠️ ЗАМЕНИ на свой Telegram user_id
const ADMIN_ID = 5946292761;

// ============================================================
// ТЕМЫ ОФОРМЛЕНИЯ
// ============================================================
const THEMES = {
  classic: {
    id: 'classic',
    name: 'Классика',
    icon: '🎨',
    desc: 'Сине-фиолетовый градиент',
    price: 0,
    bg: 'linear-gradient(135deg, #0a0e27 0%, #1a1a4e 50%, #4a1a6b 100%)',
    btn: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    shadow: 'rgba(168, 85, 247, 0.5)',
    accent: '#a855f7',
  },
  ocean: {
    id: 'ocean',
    name: 'Океан',
    icon: '🌊',
    desc: 'Голубой и бирюзовый',
    price: 200,
    bg: 'linear-gradient(135deg, #0a1929 0%, #0e3a5c 50%, #1e6091 100%)',
    btn: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)',
    shadow: 'rgba(6, 182, 212, 0.5)',
    accent: '#06b6d4',
  },
  sunset: {
    id: 'sunset',
    name: 'Закат',
    icon: '🌅',
    desc: 'Оранжевый и розовый',
    price: 500,
    bg: 'linear-gradient(135deg, #1a0a1f 0%, #4a1e3a 50%, #8b2f4a 100%)',
    btn: 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)',
    shadow: 'rgba(236, 72, 153, 0.5)',
    accent: '#ec4899',
  },
  forest: {
    id: 'forest',
    name: 'Лес',
    icon: '🌲',
    desc: 'Зелёный и изумрудный',
    price: 500,
    bg: 'linear-gradient(135deg, #0a1f0a 0%, #143d1f 50%, #1e5f2e 100%)',
    btn: 'linear-gradient(135deg, #10b981 0%, #22c55e 100%)',
    shadow: 'rgba(34, 197, 94, 0.5)',
    accent: '#22c55e',
  },
  sakura: {
    id: 'sakura',
    name: 'Сакура',
    icon: '🌸',
    desc: 'Розовый и белый',
    price: 1000,
    bg: 'linear-gradient(135deg, #2a1a2e 0%, #5c2a4a 50%, #a86a8a 100%)',
    btn: 'linear-gradient(135deg, #f472b6 0%, #fbcfe8 100%)',
    shadow: 'rgba(244, 114, 182, 0.5)',
    accent: '#f472b6',
  },
  dark: {
    id: 'dark',
    name: 'Тьма',
    icon: '⚫',
    desc: 'Чёрный и фиолетовый',
    price: 1500,
    bg: 'linear-gradient(135deg, #000000 0%, #0f0f1a 50%, #1a0a2e 100%)',
    btn: 'linear-gradient(135deg, #1f1f3a 0%, #4c1d95 100%)',
    shadow: 'rgba(76, 29, 149, 0.7)',
    accent: '#7c3aed',
  },
  rainbow: {
    id: 'rainbow',
    name: 'Радуга',
    icon: '🌈',
    desc: 'Анимированный градиент',
    price: 3000,
    bg: 'linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #8a2be2, #ff0080)',
    btn: 'linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #8a2be2, #ff0080)',
    shadow: 'rgba(255, 0, 128, 0.5)',
    accent: '#ff0080',
    animated: true,
  },
};
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

    // ---------- GET /api/me ----------
  if (path === '/api/me' && request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT count, theme FROM counters WHERE chat_id = ?'
    ).bind(userId).first();

    return json({
      count: row?.count ?? 0,
      theme: row?.theme || 'classic',
    }, 200, corsHeaders);
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
  
  // ---------- GET /api/themes ----------
  if (path === '/api/themes' && request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT theme FROM counters WHERE chat_id = ?'
    ).bind(userId).first();

    const currentTheme = row?.theme || 'classic';

    const owned = await env.DB.prepare(
      `SELECT item_id FROM purchases
       WHERE chat_id = ? AND item_id LIKE 'theme_%'`
    ).bind(userId).all();

    const ownedIds = owned.results.map(o => o.item_id.replace('theme_', ''));
    ownedIds.push('classic'); // классика бесплатна

    const themes = Object.values(THEMES).map(t => ({
      ...t,
      owned: ownedIds.includes(t.id),
      active: t.id === currentTheme,
    }));

    return json({ themes: themes, current: currentTheme }, 200, corsHeaders);
  }

  // ---------- POST /api/themes/buy ----------
  if (path === '/api/themes/buy' && request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid body' }, 400, corsHeaders);
    }

    const themeId = body.themeId;
    const theme = THEMES[themeId];

    if (!theme) {
      return json({ error: 'theme not found' }, 404, corsHeaders);
    }

    if (themeId === 'classic') {
      return json({ error: 'free_theme' }, 400, corsHeaders);
    }

    // Проверка: уже куплено?
    const existing = await env.DB.prepare(
      `SELECT id FROM purchases
       WHERE chat_id = ? AND item_id = ?`
    ).bind(userId, 'theme_' + themeId).first();

    if (existing) {
      // Уже куплено — просто активируем
      await env.DB.prepare(
        'UPDATE counters SET theme = ? WHERE chat_id = ?'
      ).bind(themeId, userId).run();

      return json({ ok: true, activated: true, theme: theme }, 200, corsHeaders);
    }

    // Получаем счёт
    const row = await env.DB.prepare(
      'SELECT count FROM counters WHERE chat_id = ?'
    ).bind(userId).first();

    const currentCount = row?.count ?? 0;

    if (currentCount < theme.price) {
      return json({
        error: 'not_enough',
        need: theme.price,
        have: currentCount
      }, 400, corsHeaders);
    }

    // Списываем и записываем покупку + сразу активируем
    const newCount = currentCount - theme.price;

    await env.DB.prepare(
      'UPDATE counters SET count = ?, theme = ? WHERE chat_id = ?'
    ).bind(newCount, themeId, userId).run();

    await env.DB.prepare(
      `INSERT INTO purchases (chat_id, item_id, expires_at, created_at)
       VALUES (?, ?, NULL, ?)`
    ).bind(userId, 'theme_' + themeId, Date.now()).run();

    return json({
      ok: true,
      newCount: newCount,
      theme: theme,
    }, 200, corsHeaders);
  }

  // ---------- POST /api/themes/activate ----------
  if (path === '/api/themes/activate' && request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid body' }, 400, corsHeaders);
    }

    const themeId = body.themeId;
    const theme = THEMES[themeId];

    if (!theme) {
      return json({ error: 'theme not found' }, 404, corsHeaders);
    }

    // Проверка: куплено ли?
    if (themeId !== 'classic') {
      const existing = await env.DB.prepare(
        `SELECT id FROM purchases
         WHERE chat_id = ? AND item_id = ?`
      ).bind(userId, 'theme_' + themeId).first();

      if (!existing) {
        return json({ error: 'not_owned' }, 400, corsHeaders);
      }
    }

    await env.DB.prepare(
      'UPDATE counters SET theme = ? WHERE chat_id = ?'
    ).bind(themeId, userId).run();

    return json({ ok: true, theme: theme }, 200, corsHeaders);
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
