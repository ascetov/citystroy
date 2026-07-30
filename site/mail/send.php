<?php
/* =============================================================================
   ПРИЁМ ЗАЯВОК С САЙТА — ООО «СитиСтрой»

   Скрипт принимает данные формы, проверяет их, отправляет письмо и в любом
   случае записывает заявку в log/requests.log (подстраховка на случай, если
   почта не настроена или почтовый сервер недоступен).

   Все настройки — в соседнем файле config.php. Здесь править ничего не нужно.
   ============================================================================= */

declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as MailException;

require __DIR__ . '/config.php';
require __DIR__ . '/PHPMailer/src/Exception.php';
require __DIR__ . '/PHPMailer/src/PHPMailer.php';
require __DIR__ . '/PHPMailer/src/SMTP.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const PHONE_TEXT = '+7 (843) 253-74-24';
const LOG_DIR    = __DIR__ . '/log';

/* ---------------------------------------------------------------------------
   Вспомогательные функции
   --------------------------------------------------------------------------- */

/** Ответить браузеру и завершить работу. */
function reply(bool $ok, string $error = ''): void
{
    $out = ['ok' => $ok];
    if ($error !== '') {
        $out['error'] = $error;
    }
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Длина строки в символах (работает и без расширения mbstring). */
function str_len(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

/** Обрезать строку до указанного числа символов (работает и без mbstring). */
function str_cut(string $value, int $limit): string
{
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $limit, 'UTF-8');
    }
    return substr($value, 0, $limit);
}

/** Убрать переносы строк (защита от подмены заголовков письма) и лишние пробелы. */
function clean(string $value): string
{
    $value = str_replace(["\r", "\n", "\0"], ' ', $value);
    // Модификатор /u работает только с корректным UTF-8, иначе preg_replace вернёт null
    $squeezed = preg_replace('/\s{2,}/u', ' ', $value);
    if ($squeezed === null) {
        $squeezed = preg_replace('/\s{2,}/', ' ', $value) ?? $value;
    }
    return trim($squeezed);
}

/** Значение поля формы в виде строки. */
function field(string $name): string
{
    return isset($_POST[$name]) && is_string($_POST[$name]) ? $_POST[$name] : '';
}

/** Дописать строку в файл журнала. */
function write_log(string $file, string $text): void
{
    if (!is_dir(LOG_DIR)) {
        @mkdir(LOG_DIR, 0755, true);
    }
    @file_put_contents(LOG_DIR . '/' . $file, $text . PHP_EOL, FILE_APPEND | LOCK_EX);
}

/** IP-адрес отправителя. */
function client_ip(): string
{
    return isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : 'unknown';
}

/**
 * Учёт частоты обращений: не больше MAX_PER_HOUR отправленных писем с одного IP за час.
 *
 * $record = false — только проверить лимит (возвращает false, если он исчерпан);
 * $record = true  — засчитать успешно отправленное письмо.
 *
 * Считаются именно отправленные письма, а не попытки: если клиент ошибся в адресе
 * почты и заполняет форму заново, лимит на него не тратится.
 */
function rate_use(string $ip, bool $record): bool
{
    if (!is_dir(LOG_DIR)) {
        @mkdir(LOG_DIR, 0755, true);
    }
    $path = LOG_DIR . '/rate.json';
    $now  = time();

    $fh = @fopen($path, 'c+');
    if ($fh === false) {
        return true; // не смогли открыть файл — не блокируем настоящих клиентов
    }
    flock($fh, LOCK_EX);

    $raw  = stream_get_contents($fh);
    $data = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
    if (!is_array($data)) {
        $data = [];
    }

    // выбрасываем всё, что старше часа
    foreach ($data as $key => $stamps) {
        $data[$key] = array_values(array_filter((array) $stamps, static fn($t) => $now - (int) $t < 3600));
        if (!$data[$key]) {
            unset($data[$key]);
        }
    }

    $allowed = count($data[$ip] ?? []) < MAX_PER_HOUR;
    if ($record && $allowed) {
        $data[$ip][] = $now;
    }

    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($data, JSON_UNESCAPED_UNICODE));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);

    return $allowed;
}

/* ---------------------------------------------------------------------------
   1. Базовые проверки запроса
   --------------------------------------------------------------------------- */

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    reply(false, 'Неверный запрос.');
}

// Ловушка для роботов: поле скрыто от людей, заполнить его может только бот.
if (clean(field('website')) !== '') {
    reply(true); // делаем вид, что всё отправлено, письмо не шлём
}

// Слишком быстрое заполнение формы — тоже признак робота.
$elapsed = (int) field('elapsed');
if ($elapsed > 0 && $elapsed < MIN_SECONDS) {
    reply(true);
}

if (!rate_use(client_ip(), false)) {
    reply(false, 'Вы отправили слишком много сообщений. Попробуйте позже или позвоните: ' . PHONE_TEXT);
}

/* ---------------------------------------------------------------------------
   2. Проверка полей
   --------------------------------------------------------------------------- */

$name    = clean(field('name'));
$email   = clean(field('email'));
$phone   = clean(field('phone'));
$message = trim(str_replace(["\r\n", "\r"], "\n", field('message')));

if ($name === '' || str_len($name) > 120) {
    reply(false, 'Укажите ваше имя.');
}
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    reply(false, 'Проверьте адрес электронной почты.');
}
if ($phone !== '' && strlen(preg_replace('/\D/', '', $phone) ?? '') < 10) {
    reply(false, 'Проверьте номер телефона.');
}
if (str_len($message) < 5) {
    reply(false, 'Напишите ваше сообщение.');
}
if (str_len($message) > 5000) {
    $message = str_cut($message, 5000) . '…';
}

/* ---------------------------------------------------------------------------
   3. Запись заявки в журнал (до отправки — чтобы ничего не потерялось)
   --------------------------------------------------------------------------- */

$stamp = date('d.m.Y H:i:s');
write_log('requests.log', sprintf(
    "%s | IP: %s\nИмя: %s\nТелефон: %s\nE-mail: %s\nСообщение: %s\n%s",
    $stamp,
    client_ip(),
    $name,
    $phone !== '' ? $phone : '—',
    $email,
    str_replace("\n", ' / ', $message),
    str_repeat('-', 60)
));

/* ---------------------------------------------------------------------------
   4. Сборка письма
   --------------------------------------------------------------------------- */

$subject = str_replace('{name}', $name, SUBJECT_TPL);

$rows = [
    'Имя'      => $name,
    'Телефон'  => $phone !== '' ? $phone : 'не указан',
    'E-mail'   => $email,
    'Отправлено' => $stamp,
];

$html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#23262B;line-height:1.6">'
      . '<h2 style="margin:0 0 18px;font-size:20px;color:#1C1F24">Новая заявка с сайта citystroy-kazan.ru</h2>'
      . '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px">';
foreach ($rows as $label => $value) {
    $html .= '<tr>'
           . '<td style="padding:6px 18px 6px 0;color:#6B7280;white-space:nowrap;vertical-align:top">' . htmlspecialchars($label, ENT_QUOTES, 'UTF-8') . '</td>'
           . '<td style="padding:6px 0;font-weight:bold">' . htmlspecialchars($value, ENT_QUOTES, 'UTF-8') . '</td>'
           . '</tr>';
}
$html .= '</table>'
       . '<div style="padding:16px 18px;background:#F5F3EF;border-left:3px solid #1F73C4;border-radius:6px">'
       . nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8'))
       . '</div>'
       . '<p style="margin:22px 0 0;font-size:13px;color:#6B7280">Чтобы ответить клиенту, просто нажмите «Ответить» — письмо уйдёт на ' . htmlspecialchars($email, ENT_QUOTES, 'UTF-8') . '</p>'
       . '</div>';

$plain = "Новая заявка с сайта citystroy-kazan.ru\n\n";
foreach ($rows as $label => $value) {
    $plain .= $label . ': ' . $value . "\n";
}
$plain .= "\nСообщение:\n" . $message . "\n";

/* ---------------------------------------------------------------------------
   5. Отправка
   --------------------------------------------------------------------------- */

if (USE_SMTP && (SMTP_USER === '' || SMTP_PASS === '')) {
    write_log('errors.log', $stamp . ' | SMTP не настроен: заполните SMTP_USER и SMTP_PASS в mail/config.php');
    reply(false, 'Почта на сайте ещё не настроена. Позвоните нам: ' . PHONE_TEXT);
}

$from = FROM_EMAIL !== '' ? FROM_EMAIL : SMTP_USER;
if ($from === '') {
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $from = 'noreply@' . preg_replace('/^www\./', '', (string) $host);
}

$mail = new PHPMailer(true);

try {
    $mail->CharSet  = PHPMailer::CHARSET_UTF8;
    $mail->Encoding = PHPMailer::ENCODING_BASE64;

    if (USE_SMTP) {
        $mail->isSMTP();
        $mail->Host       = SMTP_HOST;
        $mail->Port       = SMTP_PORT;
        $mail->SMTPAuth   = true;
        $mail->Username   = SMTP_USER;
        $mail->Password   = SMTP_PASS;
        $mail->SMTPSecure = SMTP_SECURE === 'tls'
            ? PHPMailer::ENCRYPTION_STARTTLS
            : PHPMailer::ENCRYPTION_SMTPS;
        $mail->Timeout    = 20;
    } else {
        $mail->isMail();
    }

    $mail->setFrom($from, FROM_NAME);
    foreach (array_filter(array_map('trim', explode(',', TO_EMAIL))) as $to) {
        $mail->addAddress($to, TO_NAME);
    }
    $mail->addReplyTo($email, $name);

    $mail->Subject = $subject;
    $mail->isHTML(true);
    $mail->Body    = $html;
    $mail->AltBody = $plain;

    $mail->send();
    rate_use(client_ip(), true); // засчитываем только реально отправленное письмо
    reply(true);

} catch (MailException $e) {
    write_log('errors.log', $stamp . ' | Ошибка отправки: ' . $mail->ErrorInfo);
    reply(false, 'Не удалось отправить письмо. Позвоните нам: ' . PHONE_TEXT);
} catch (Throwable $e) {
    write_log('errors.log', $stamp . ' | Ошибка: ' . $e->getMessage());
    reply(false, 'Не удалось отправить письмо. Позвоните нам: ' . PHONE_TEXT);
}
