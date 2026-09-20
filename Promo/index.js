// proposals-bot — Cloudflare Worker

const ADMIN_ID = 5946292761; // твой Telegram user_id
const TAPLLYBOT_TOKEN = 'TAPLLYBOT_TOKEN'; // для отправки уведомлений пользователю

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Proposals Bot is running!', { status: 200 });
    }

    try {
      const update = await request.json();

      // 1. Приём нового предложения
      if (update.message && update.message.text) {
        const userId = update.message.from.id;
        const username = update.message.from.username || null;
        const text = update.message.text;

        // Сохраняем в D1
        await env.DB.prepare(
          `INSERT INTO proposals (user_id, username, text, status, created_at)
           VALUES (?, ?, ?, 'pending', ?)`
        ).bind(userId, username, text, Date.now()).run();

        // Получаем id предложения
        const row = await env.DB.prepare(
          'SELECT last_insert_rowid() AS id'
        ).first();
        const proposalId = row.id;

        // Пересылаем тебе
        const sendRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: ADMIN_ID,
    text: `📩 *Новое предложение #${proposalId}*\n\nОт: @${username || userId}\n\n${text}`,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
                { text: '✅ Принять', callback_data: `approve_${proposalId}_${userId}` },
                { text: '❌ Отклонить', callback_data: `reject_${proposalId}_${userId}` }
    ]
    }
  })
});
        
const sendData = await sendRes.json();
console.log('SEND TO ADMIN:', JSON.stringify(sendData));
        // Ответ пользователю
        await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: userId,
            text: '✅ Твоё предложение отправлено! Ожидай ответа.'
          })
        });

        return new Response('OK', { status: 200 });
      }

      // 2. Обработка нажатия кнопки
      if (update.callback_query) {
        const cb = update.callback_query;
        const data = cb.data; // approve_5_123456789 или reject_5_123456789
        const parts = data.split('_');
        const action = parts[0]; // approve или reject
        const proposalId = parseInt(parts[1], 10);
        const userId = parseInt(parts[2], 10);

        // Обновляем статус
        const status = action === 'approve' ? 'approved' : 'rejected';
        await env.DB.prepare(
          'UPDATE proposals SET status = ? WHERE id = ?'
        ).bind(status, proposalId).run();

        // Уведомляем пользователя через Tapllybot
        const emoji = action === 'approve' ? '✅' : '❌';
        const verdict = action === 'approve' ? 'принято' : 'отклонено';
        await fetch(`https://api.telegram.org/bot${TAPLLYBOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: userId,
            text: `${emoji} Твоё предложение #${proposalId} было ${verdict}.`
          })
        });

        // Убираем кнопки из твоего сообщения
        await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/editMessageReplyMarkup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: cb.message.chat.id,
            message_id: cb.message.message_id,
            reply_markup: { inline_keyboard: [] }
          })
        });

        // Отвечаем на callback
        await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: cb.id,
            text: `Статус: ${verdict}`
          })
        });

        return new Response('OK', { status: 200 });
      }

      return new Response('OK', { status: 200 });
    } catch (e) {
      console.error('Error:', e.message);
      return new Response('Error', { status: 500 });
    }
  }
};
