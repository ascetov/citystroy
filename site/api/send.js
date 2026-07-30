// Приём заявок с сайта — serverless-функция Vercel (Node.js).
//
// Настройки (адрес получателя, данные почтового ящика-отправителя) задаются
// не в коде, а в панели Vercel: Settings → Environment Variables.
// Полный список переменных и инструкция — в README.md.

const nodemailer = require('nodemailer');

const PHONE_TEXT = '+7 (843) 253-74-24';
const MIN_SECONDS = 2; // если форму заполнили быстрее — это робот
const MAX_PER_HOUR = 5; // лимит заявок с одного IP на «тёплую» копию функции

// Живёт только пока Vercel держит этот экземпляр функции «тёплым» — это не
// постоянное хранилище (после холодного старта счётчик обнуляется). Честная
// защита от спама здесь — прежде всего ловушка для роботов и проверка
// скорости заполнения формы ниже; это лишь дополнительный барьер.
const rateMap = new Map();

function rateUse(ip, record) {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const stamps = (rateMap.get(ip) || []).filter((t) => now - t < hour);
  const allowed = stamps.length < MAX_PER_HOUR;
  if (record && allowed) {
    stamps.push(now);
  }
  rateMap.set(ip, stamps);
  return allowed;
}

function clean(value) {
  return String(value == null ? '' : value)
    .replace(/[\r\n\0]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Неверный запрос.' });
    return;
  }

  const body = req.body || {};

  // Ловушка для роботов: поле скрыто от людей на сайте.
  if (clean(body.website) !== '') {
    res.status(200).json({ ok: true });
    return;
  }

  const elapsed = Number(body.elapsed) || 0;
  if (elapsed > 0 && elapsed < MIN_SECONDS) {
    res.status(200).json({ ok: true });
    return;
  }

  const ip = clientIp(req);
  if (!rateUse(ip, false)) {
    res.status(200).json({
      ok: false,
      error: 'Вы отправили слишком много сообщений. Попробуйте позже или позвоните: ' + PHONE_TEXT,
    });
    return;
  }

  const name = clean(body.name);
  const email = clean(body.email);
  const phone = clean(body.phone);
  let message = String(body.message == null ? '' : body.message).replace(/\r\n/g, '\n').trim();

  if (!name || name.length > 120) {
    res.status(200).json({ ok: false, error: 'Укажите ваше имя.' });
    return;
  }
  if (!email || !EMAIL_RE.test(email)) {
    res.status(200).json({ ok: false, error: 'Проверьте адрес электронной почты.' });
    return;
  }
  if (phone && phone.replace(/\D/g, '').length < 10) {
    res.status(200).json({ ok: false, error: 'Проверьте номер телефона.' });
    return;
  }
  if (message.length < 5) {
    res.status(200).json({ ok: false, error: 'Напишите ваше сообщение.' });
    return;
  }
  if (message.length > 5000) {
    message = message.slice(0, 5000) + '…';
  }

  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    // Заявка есть, но письмо отправить некому — хотя бы видно в логах функции.
    console.error('SMTP не настроен (см. Environment Variables в Vercel). Заявка:', { name, email, phone });
    res.status(200).json({ ok: false, error: 'Почта на сайте ещё не настроена. Позвоните нам: ' + PHONE_TEXT });
    return;
  }

  const toEmail = process.env.TO_EMAIL || 'ascetovu@gmail.com';
  const toName = process.env.TO_NAME || 'ООО «СитиСтрой»';
  const fromEmail = process.env.FROM_EMAIL || SMTP_USER;
  const fromName = process.env.FROM_NAME || 'Сайт СитиСтрой';
  const port = Number(process.env.SMTP_PORT) || 465;
  const secure = (process.env.SMTP_SECURE || 'ssl').toLowerCase() !== 'tls';

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure, // true — для порта 465 (ssl), false — для 587 (tls/STARTTLS)
    requireTLS: !secure,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const stamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const subject = (process.env.SUBJECT_TPL || 'Заявка с сайта — {name}').replace('{name}', name);

  const rows = {
    Имя: name,
    Телефон: phone || 'не указан',
    'E-mail': email,
    Отправлено: stamp,
  };

  let html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#23262B;line-height:1.6">'
    + '<h2 style="margin:0 0 18px;font-size:20px;color:#1C1F24">Новая заявка с сайта</h2>'
    + '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px">';
  for (const [label, value] of Object.entries(rows)) {
    html += '<tr><td style="padding:6px 18px 6px 0;color:#6B7280;white-space:nowrap;vertical-align:top">' + escapeHtml(label) + '</td>'
      + '<td style="padding:6px 0;font-weight:bold">' + escapeHtml(value) + '</td></tr>';
  }
  html += '</table>'
    + '<div style="padding:16px 18px;background:#F5F3EF;border-left:3px solid #1F73C4;border-radius:6px">'
    + escapeHtml(message).replace(/\n/g, '<br>')
    + '</div>'
    + '<p style="margin:22px 0 0;font-size:13px;color:#6B7280">Чтобы ответить клиенту, просто нажмите «Ответить» — письмо уйдёт на ' + escapeHtml(email) + '</p>'
    + '</div>';

  const plain = 'Новая заявка с сайта\n\n'
    + Object.entries(rows).map(([k, v]) => k + ': ' + v).join('\n')
    + '\n\nСообщение:\n' + message + '\n';

  try {
    await transporter.sendMail({
      from: '"' + fromName + '" <' + fromEmail + '>',
      to: '"' + toName + '" <' + toEmail + '>',
      replyTo: '"' + name + '" <' + email + '>',
      subject,
      text: plain,
      html,
    });
    rateUse(ip, true);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Ошибка отправки письма:', err);
    res.status(200).json({ ok: false, error: 'Не удалось отправить письмо. Позвоните нам: ' + PHONE_TEXT });
  }
};
