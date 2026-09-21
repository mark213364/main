// ============================================================
// BASICCLICKBOT — Cloudflare Worker
// ============================================================

const ADMIN_ID = 5946292761;
const COIN_EMOJI = '🪙';
const WEBAPP_URL = 'https://mark213364.github.io/main/index.html';

// ============================================================
// ЦВЕТА
// ============================================================
const COLORS = {
  red:    { id: 'red',    name: 'Красный',    icon: '🔴', price: 1000, hex: '#ef4444' },
  orange: { id: 'orange', name: 'Оранжевый',  icon: '🟠', price: 1000, hex: '#f97316' },
  yellow: { id: 'yellow', name: 'Жёлтый',     icon: '🟡', price: 1000, hex: '#eab308' },
  green:  { id: 'green',  name: 'Зелёный',    icon: '🟢', price: 1000, hex: '#22c55e' },
  cyan:   { id: 'cyan',   name: 'Голубой',    icon: '🔵', price: 1000, hex: '#06b6d4' },
  blue:   { id: 'blue',   name: 'Синий',      icon: '🔷', price: 1000, hex: '#3b82f6' },
  purple: { id: 'purple', name: 'Фиолетовый', icon: '🟣', price: 1000, hex: '#a855f7' },
  pink:   { id: 'pink',   name: 'Розовый',    icon: '🌸', price: 1000, hex: '#ec4899' },
  brown:  { id: 'brown',  name: 'Коричневый', icon: '🟤', price: 1000, hex: '#92400e' },
  black:  { id: 'black',  name: 'Чёрный',     icon: '⚫', price: 1000, hex: '#1f2937' },
  white:  { id: 'white',  name: 'Белый',      icon: '⚪', price: 1000, hex: '#f3f4f6' },
};

// ============================================================
// СКИНЫ КНОПКИ
// ============================================================
const SKINS = {
  default: { id: 'default', name: 'Стандарт', icon: '⭕', price: 0 },
  star:    { id: 'star',    name: 'Звезда',   icon: '⭐', price: 1500 },
  fire:    { id: 'fire',    name: 'Огонь',    icon: '🔥', price: 1500 },
  rocket:  { id: 'rocket',  name: 'Ракета',   icon: '🚀', price: 2000 },
  gem:     { id: 'gem',     name: 'Алмаз',    icon: '💎', price: 3000, premiumOnly: true },
  crown:   { id: 'crown',   name: 'Корона',   icon: '👑', price: 5000 },
  heart:   { id: 'heart',   name: 'Сердце',   icon: '❤️', price: 1200 },
  bolt:    { id: 'bolt',    name: 'Молния',   icon: '⚡', price: 1800 },
  moon:    { id: 'moon',    name: 'Луна',     icon: '🌙', price: 2000 },
  sun:     { id: 'sun',     name: 'Солнце',   icon: '☀️', price: 2000 },
  clover:  { id: 'clover',  name: 'Клевер',   icon: '🍀', price: 2500 },
  skull:   { id: 'skull',   name: 'Череп',    icon: '💀', price: 3500 },
};

// ============================================================
// БОНУСЫ
// ============================================================
const BONUSES = {
  multiplier2: {
    id: 'multiplier2', name: 'x2 кликов', icon: '⚡',
    desc: 'Удваивает клики на 2 минуты', price: 800,
    duration: 2 * 60 * 1000, multiplier: 2,
  },
  multiplier5: {
    id: 'multiplier5', name: 'x5 кликов', icon: '🔥',
    desc: 'Пятикратные клики на 1.5 минуты', price: 2500,
    duration: 90 * 1000, multiplier: 5,
  },
  premium: {
    id: 'premium', name: 'Премиум', icon: '💎',
    desc: 'Значок 💎 рядом с ником навсегда', price: 100000,
    duration: null, multiplier: 1,
  },
};

// ============================================================
// ПРОМОКОДЫ
// ============================================================
const PROMOS = {
  'FREE500К': { code: 'FREE500К', reward: 500000 },
};

// ============================================================
// WORKER — точка входа
// ============================================================
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

      if (message && message.text === '/start') await handleStart(message, env);
      if (message && message.text && message.text.startsWith('/reset ')) await handleReset(message, env);
      if (message && message.text === '/wipe' && message.from.id === ADMIN_ID) await handleWipe(message, env);

      return new Response('OK', { status: 200 });
    } catch (e) {
      console.error('Webhook error:', e.message, e.stack);
      return new Response('Error', { status: 500 });
    }
  }
};

// ============================================================
// TELEGRAM — обработчики
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
    `👋 Привет, ${name}!\nТекущий счёт: *${result?.count ?? 0}* ${COIN_EMOJI}\n\nОткрой приложение 👇`,
    {
      inline_keyboard: [[
        { text: '🚀 Открыть приложение', web_app: { url: WEBAPP_URL } }
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
    'UPDATE counters SET count = 0, color = "default", skin = "default", is_premium = 0 WHERE chat_id = ?'
  ).bind(targetId).run();
  await env.DB.prepare('DELETE FROM purchases WHERE chat_id = ?').bind(targetId).run();
  await env.DB.prepare('DELETE FROM used_promos WHERE chat_id = ?').bind(targetId).run();
  await sendMessage(env.BOT_TOKEN, message.chat.id, `✅ Сброшено для ID ${targetId}`);
}

async function handleWipe(message, env) {
  await env.DB.prepare(
    'UPDATE counters SET count = 0, color = "default", skin = "default", is_premium = 0'
  ).run();
  await env.DB.prepare('DELETE FROM purchases').run();
  await env.DB.prepare('DELETE FROM used_promos').run();
  await sendMessage(env.BOT_TOKEN, message.chat.id,
    '🧹 Полный сброс для всех пользователей\n\n' +
    '• Счёт → 0\n• Цвета и скины → сброшены\n• Премиум → выключен\n' +
    '• Покупки → очищены\n• Промокоды → доступны заново'
  );
  }
// ============================================================
// API
// ============================================================

async function handleApi(request, env, path, corsHeaders) {
  const initData = request.headers.get('X-Init-Data');
  const userId = await verifyInitData(initData, env.BOT_TOKEN);
  if (!userId) return json({ error: 'unauthorized' }, 401, corsHeaders);

  // /api/me
  if (path === '/api/me' && request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT count, color, skin, is_premium FROM counters WHERE chat_id = ?'
    ).bind(userId).first();
    return json({
      count: row?.count ?? 0,
      color: row?.color || 'default',
      skin: row?.skin || 'default',
      isPremium: (row?.is_premium ?? 0) === 1,
      coinEmoji: COIN_EMOJI,
    }, 200, corsHeaders);
  }

  // /api/count
  if (path === '/api/count' && request.method === 'POST') {
    let body; try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400, corsHeaders); }
    const count = parseInt(body.count, 10);
    if (!Number.isInteger(count) || count < 0) return json({ error: 'invalid count' }, 400, corsHeaders);
    await env.DB.prepare('UPDATE counters SET count = ? WHERE chat_id = ?').bind(count, userId).run();
    return json({ ok: true }, 200, corsHeaders);
  }

  // /api/top
  if (path === '/api/top' && request.method === 'GET') {
    const result = await env.DB.prepare(
      `SELECT c.chat_id AS user_id,
              COALESCE(c.username, c.name, 'Игрок') AS display_name,
              c.count, c.is_premium
       FROM counters c ORDER BY c.count DESC LIMIT 10`
    ).all();
    return json({ players: result.results, coinEmoji: COIN_EMOJI }, 200, corsHeaders);
  }

  // ===== ЦВЕТА =====
  if (path === '/api/colors' && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT color FROM counters WHERE chat_id = ?').bind(userId).first();
    const current = row?.color || 'default';
    const owned = await env.DB.prepare(
      `SELECT item_id FROM purchases WHERE chat_id = ? AND item_id LIKE 'color_%'`
    ).bind(userId).all();
    const ownedIds = owned.results.map(o => o.item_id.replace('color_', ''));
    const colors = Object.values(COLORS).map(c => ({
      ...c, owned: ownedIds.includes(c.id), active: c.id === current,
    }));
    return json({ colors, current, coinEmoji: COIN_EMOJI }, 200, corsHeaders);
  }

  if (path === '/api/colors/buy' && request.method === 'POST') {
    let body; try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400, corsHeaders); }
    const color = COLORS[body.colorId];
    if (!color) return json({ error: 'not found' }, 404, corsHeaders);

    const existing = await env.DB.prepare(
      `SELECT id FROM purchases WHERE chat_id = ? AND item_id = ?`
    ).bind(userId, 'color_' + color.id).first();
    if (existing) {
      await env.DB.prepare('UPDATE counters SET color = ? WHERE chat_id = ?').bind(color.id, userId).run();
      return json({ ok: true, activated: true, color }, 200, corsHeaders);
    }
    const row = await env.DB.prepare('SELECT count FROM counters WHERE chat_id = ?').bind(userId).first();
    const cur = row?.count ?? 0;
    if (cur < color.price) return json({ error: 'not_enough', need: color.price, have: cur }, 400, corsHeaders);

    const newCount = cur - color.price;
    await env.DB.prepare('UPDATE counters SET count = ?, color = ? WHERE chat_id = ?')
      .bind(newCount, color.id, userId).run();
    await env.DB.prepare(
      `INSERT INTO purchases (chat_id, item_id, expires_at, created_at) VALUES (?, ?, NULL, ?)`
    ).bind(userId, 'color_' + color.id, Date.now()).run();
    return json({ ok: true, newCount, color }, 200, corsHeaders);
  }

  if (path === '/api/colors/activate' && request.method === 'POST') {
    let body; try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400, corsHeaders); }
    const color = COLORS[body.colorId];
    if (!color) return json({ error: 'not found' }, 404, corsHeaders);
    const existing = await env.DB.prepare(
      `SELECT id FROM purchases WHERE chat_id = ? AND item_id = ?`
    ).bind(userId, 'color_' + color.id).first();
    if (!existing) return json({ error: 'not_owned' }, 400, corsHeaders);
    await env.DB.prepare('UPDATE counters SET color = ? WHERE chat_id = ?').bind(color.id, userId).run();
    return json({ ok: true, color }, 200, corsHeaders);
  }

  // ===== СКИНЫ =====
  if (path === '/api/skins' && request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT skin, is_premium FROM counters WHERE chat_id = ?'
    ).bind(userId).first();
    const current = row?.skin || 'default';
    const isPremium = (row?.is_premium ?? 0) === 1;
    const owned = await env.DB.prepare(
      `SELECT item_id FROM purchases WHERE chat_id = ? AND item_id LIKE 'skin_%'`
    ).bind(userId).all();
    const ownedIds = owned.results.map(o => o.item_id.replace('skin_', ''));
    const skins = Object.values(SKINS).map(s => {
      let ownedFlag = s.id === 'default' || ownedIds.includes(s.id);
      if (s.premiumOnly && isPremium) ownedFlag = true;
      return { ...s, owned: ownedFlag, active: s.id === current };
    });
    return json({ skins, current, isPremium, coinEmoji: COIN_EMOJI }, 200, corsHeaders);
  }

  if (path === '/api/skins/buy' && request.method === 'POST') {
    let body; try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400, corsHeaders); }
    const skin = SKINS[body.skinId];
    if (!skin) return json({ error: 'not found' }, 404, corsHeaders);
    if (skin.id === 'default') return json({ error: 'free_skin' }, 400, corsHeaders);
    if (skin.premiumOnly) return json({ error: 'premium_only', message: 'Этот скин выдаётся с Премиумом' }, 400, corsHeaders);

    const existing = await env.DB.prepare(
      `SELECT id FROM purchases WHERE chat_id = ? AND item_id = ?`
    ).bind(userId, 'skin_' + skin.id).first();
    if (existing) {
      await env.DB.prepare('UPDATE counters SET skin = ? WHERE chat_id = ?').bind(skin.id, userId).run();
      return json({ ok: true, activated: true, skin }, 200, corsHeaders);
    }
    const row = await env.DB.prepare('SELECT count FROM counters WHERE chat_id = ?').bind(userId).first();
    const cur = row?.count ?? 0;
    if (cur < skin.price) return json({ error: 'not_enough', need: skin.price, have: cur }, 400, corsHeaders);

    const newCount = cur - skin.price;
    await env.DB.prepare('UPDATE counters SET count = ?, skin = ? WHERE chat_id = ?')
      .bind(newCount, skin.id, userId).run();
    await env.DB.prepare(
      `INSERT INTO purchases (chat_id, item_id, expires_at, created_at) VALUES (?, ?, NULL, ?)`
    ).bind(userId, 'skin_' + skin.id, Date.now()).run();
    return json({ ok: true, newCount, skin }, 200, corsHeaders);
  }

  if (path === '/api/skins/activate' && request.method === 'POST') {
    let body; try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400, corsHeaders); }
    const skin = SKINS[body.skinId];
    if (!skin) return json({ error: 'not found' }, 404, corsHeaders);

    if (skin.id !== 'default') {
      const existing = await env.DB.prepare(
        `SELECT id FROM purchases WHERE chat_id = ? AND item_id = ?`
      ).bind(userId, 'skin_' + skin.id).first();

      if (!existing && skin.premiumOnly) {
        const userRow = await env.DB.prepare('SELECT is_premium FROM counters WHERE chat_id = ?').bind(userId).first();
        if ((userRow?.is_premium ?? 0) !== 1) return json({ error: 'premium_only' }, 400, corsHeaders);
      } else if (!existing) {
        return json({ error: 'not_owned' }, 400, corsHeaders);
      }
    }
    await env.DB.prepare('UPDATE counters SET skin = ? WHERE chat_id = ?').bind(skin.id, userId).run();
    return json({ ok: true, skin }, 200, corsHeaders);
    }
    // ===== ИНВЕНТАРЬ =====
  if (path === '/api/inventory' && request.method === 'GET') {
    const purchases = await env.DB.prepare(
      `SELECT item_id, expires_at, created_at FROM purchases
       WHERE chat_id = ? ORDER BY created_at DESC`
    ).bind(userId).all();
    const items = purchases.results.map(p => {
      const id = p.item_id;
      let type = 'unknown', name = id, icon = '❓';
      if (id.startsWith('color_')) {
        const c = COLORS[id.replace('color_', '')];
        if (c) { type = 'color'; name = c.name; icon = c.icon; }
      } else if (id.startsWith('skin_')) {
        const s = SKINS[id.replace('skin_', '')];
        if (s) { type = 'skin'; name = s.name; icon = s.icon; }
      } else if (id === 'premium') { type = 'premium'; name = 'Премиум'; icon = '💎'; }
      else if (id === 'multiplier2') { type = 'bonus'; name = 'x2 кликов'; icon = '⚡'; }
      else if (id === 'multiplier5') { type = 'bonus'; name = 'x5 кликов'; icon = '🔥'; }
      return {
        itemId: id, type, name, icon,
        expiresAt: p.expires_at, createdAt: p.created_at,
        isActive: p.expires_at === null || p.expires_at > Date.now(),
      };
    });
    return json({ items, coinEmoji: COIN_EMOJI }, 200, corsHeaders);
  }

  // ===== БОНУСЫ =====
  if (path === '/api/bonuses' && request.method === 'GET') {
    const now = Date.now();
    const purchases = await env.DB.prepare(
      `SELECT item_id, expires_at FROM purchases
       WHERE chat_id = ? AND expires_at IS NOT NULL AND expires_at > ?`
    ).bind(userId, now).all();
    const userRow = await env.DB.prepare('SELECT is_premium FROM counters WHERE chat_id = ?').bind(userId).first();
    let multiplier = 1, activeUntil = 0;
    purchases.results.forEach(p => {
      if (p.item_id === 'multiplier2') { multiplier = Math.max(multiplier, 2); activeUntil = Math.max(activeUntil, p.expires_at); }
      else if (p.item_id === 'multiplier5') { multiplier = Math.max(multiplier, 5); activeUntil = Math.max(activeUntil, p.expires_at); }
    });
    const bonuses = Object.values(BONUSES).map(b => {
      let active = false;
      if (b.id === 'premium') active = (userRow?.is_premium ?? 0) === 1;
      else active = purchases.results.some(p => p.item_id === b.id);
      return { ...b, active };
    });
    return json({ bonuses, multiplier, activeUntil, coinEmoji: COIN_EMOJI }, 200, corsHeaders);
  }

  if (path === '/api/bonuses/buy' && request.method === 'POST') {
    let body; try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400, corsHeaders); }
    const bonus = BONUSES[body.bonusId];
    if (!bonus) return json({ error: 'bonus not found' }, 404, corsHeaders);
    const now = Date.now();

    if (bonus.id === 'premium') {
      const userRow = await env.DB.prepare('SELECT count, is_premium FROM counters WHERE chat_id = ?').bind(userId).first();
      if ((userRow?.is_premium ?? 0) === 1) return json({ error: 'already_active', message: 'Премиум уже куплен' }, 400, corsHeaders);
      const cur = userRow?.count ?? 0;
      if (cur < bonus.price) return json({ error: 'not_enough', need: bonus.price, have: cur }, 400, corsHeaders);
      const newCount = cur - bonus.price;
      await env.DB.prepare('UPDATE counters SET count = ?, is_premium = 1 WHERE chat_id = ?').bind(newCount, userId).run();
      await env.DB.prepare(
        `INSERT INTO purchases (chat_id, item_id, expires_at, created_at) VALUES (?, 'premium', NULL, ?)`
      ).bind(userId, now).run();
      return json({ ok: true, newCount, bonus }, 200, corsHeaders);
    }

    const active = await env.DB.prepare(
      `SELECT id FROM purchases WHERE chat_id = ? AND item_id = ?
         AND expires_at IS NOT NULL AND expires_at > ?`
    ).bind(userId, bonus.id, now).first();
    if (active) return json({ error: 'already_active' }, 400, corsHeaders);

    const row = await env.DB.prepare('SELECT count FROM counters WHERE chat_id = ?').bind(userId).first();
    const cur = row?.count ?? 0;
    if (cur < bonus.price) return json({ error: 'not_enough', need: bonus.price, have: cur }, 400, corsHeaders);

    const newCount = cur - bonus.price;
    const expiresAt = now + bonus.duration;
    await env.DB.prepare('UPDATE counters SET count = ? WHERE chat_id = ?').bind(newCount, userId).run();
    await env.DB.prepare(
      `INSERT INTO purchases (chat_id, item_id, expires_at, created_at) VALUES (?, ?, ?, ?)`
    ).bind(userId, bonus.id, expiresAt, now).run();
    return json({ ok: true, newCount, bonus, expiresAt }, 200, corsHeaders);
  }

  // ===== ПРОМОКОД =====
  if (path === '/api/promo' && request.method === 'POST') {
    let body; try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400, corsHeaders); }
    const code = (body.code || '').trim().toUpperCase();
    if (!code) return json({ error: 'empty_code', message: 'Введи промокод' }, 400, corsHeaders);
    const promo = PROMOS[code];
    if (!promo) return json({ error: 'invalid_code', message: 'Промокод не существует' }, 404, corsHeaders);
    const used = await env.DB.prepare(
      'SELECT id FROM used_promos WHERE chat_id = ? AND promo_code = ?'
    ).bind(userId, code).first();
    if (used) return json({ error: 'already_used', message: 'Ты уже использовал этот промокод' }, 400, corsHeaders);
    const row = await env.DB.prepare('SELECT count FROM counters WHERE chat_id = ?').bind(userId).first();
    const cur = row?.count ?? 0;
    const newCount = cur + promo.reward;
    await env.DB.prepare('UPDATE counters SET count = ? WHERE chat_id = ?').bind(newCount, userId).run();
    await env.DB.prepare(
      `INSERT INTO used_promos (chat_id, promo_code, used_at) VALUES (?, ?, ?)`
    ).bind(userId, code, Date.now()).run();
    return json({ ok: true, reward: promo.reward, newCount }, 200, corsHeaders);
  }

  return json({ error: 'not found' }, 404, corsHeaders);
}

// ============================================================
// ХЕЛПЕРЫ
// ============================================================

function json(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

async function sendMessage(token, chatId, text, keyboard) {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: keyboard })
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
    if (!authDate || Date.now() / 1000 - authDate > 86400) return null;
    const encoder = new TextEncoder();
    const secretKey = await crypto.subtle.importKey('raw', encoder.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const derivedKey = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken));
    const verifyKey = await crypto.subtle.importKey('raw', derivedKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const hashBytes = new Uint8Array(hash.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const isValid = await crypto.subtle.verify('HMAC', verifyKey, hashBytes, encoder.encode(dataCheckString));
    if (!isValid) return null;
    const user = JSON.parse(params.get('user') || '{}');
    return user.id || null;
  } catch (e) {
    console.error('verifyInitData error:', e.message);
    return null;
  }
}
