<?php
declare(strict_types=1);

require_once __DIR__ . '/../auth-helper.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

lingo_check_origin();

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'POST') {
    header('Allow: POST');
    lingo_reply(405, ['error' => 'Method Not Allowed']);
}

$body = lingo_read_json_body(32768);

$rawEmail = isset($body['email']) && is_string($body['email']) ? trim($body['email']) : '';
$email = strtolower($rawEmail);
$password = isset($body['password']) && is_string($body['password']) ? $body['password'] : '';

if ($email === '' || $password === '') {
    lingo_reply(400, ['error' => 'Vui lòng nhập email và mật khẩu.']);
}
if (strlen($email) > 191 || filter_var($email, FILTER_VALIDATE_EMAIL) === false || strlen($password) > 1024) {
    lingo_reply(401, ['error' => 'Email hoặc mật khẩu không đúng.']);
}

$config = lingo_load_config();
$conn = lingo_connect_auth_db($config);
/** @var PDO $db */
$db = $conn['db'];
$schema = $conn['schema'];

try {
    $stmt = $db->prepare(
        'SELECT id, email, password_hash, display_name, avatar_url FROM users WHERE LOWER(email) = ? LIMIT 1'
    );
    $stmt->execute([$email]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    $storedHash = is_array($row) && isset($row['password_hash']) && is_string($row['password_hash'])
        ? $row['password_hash']
        : '';

    if (!$row || $storedHash === '' || !password_verify($password, $storedHash)) {
        lingo_reply(401, ['error' => 'Email hoặc mật khẩu không đúng.']);
    }

    $user = lingo_format_user($row);
    lingo_migrate_owner_history($db, $user['id'], $schema);

    lingo_set_session_cookie(lingo_sign_session($user['id'], $config));
    lingo_reply(200, [
        'authenticated' => true,
        'user' => $user,
    ]);
} catch (Throwable $error) {
    error_log('Auth login error: ' . $error->getMessage());
    lingo_reply(503, lingo_safe_db_error_meta($error, 'query', 'db_query_error'));
}
