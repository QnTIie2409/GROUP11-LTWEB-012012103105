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
if ($email === '' || strlen($email) > 191 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    lingo_reply(400, ['error' => 'Email không hợp lệ.']);
}

$password = isset($body['password']) && is_string($body['password']) ? $body['password'] : '';
$passwordLength = function_exists('mb_strlen') ? mb_strlen($password, 'UTF-8') : strlen($password);
if ($passwordLength < 6) {
    lingo_reply(400, ['error' => 'Mật khẩu phải có ít nhất 6 ký tự.']);
}
if (strlen($password) > 1024) {
    lingo_reply(400, ['error' => 'Mật khẩu quá dài.']);
}

$rawDisplayName = isset($body['displayName']) && is_string($body['displayName']) ? trim($body['displayName']) : '';
$displayName = null;
if ($rawDisplayName !== '') {
    $displayName = function_exists('mb_substr')
        ? mb_substr($rawDisplayName, 0, 100, 'UTF-8')
        : substr($rawDisplayName, 0, 100);
}

$config = lingo_load_config();
$conn = lingo_connect_auth_db($config);
/** @var PDO $db */
$db = $conn['db'];
$schema = $conn['schema'];

$passwordHash = password_hash($password, PASSWORD_DEFAULT);

try {
    $checkStmt = $db->prepare('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1');
    $checkStmt->execute([$email]);
    if ($checkStmt->fetch(PDO::FETCH_ASSOC)) {
        lingo_reply(409, ['error' => 'Email đã được đăng ký.']);
    }

    $db->beginTransaction();

    $insertStmt = $db->prepare(
        'INSERT INTO users (google_sub, email, password_hash, display_name, avatar_url)
         VALUES (NULL, ?, ?, ?, NULL)'
    );
    $insertStmt->execute([$email, $passwordHash, $displayName]);

    $userId = (int) $db->lastInsertId();
    $selectStmt = $db->prepare('SELECT id, email, display_name, avatar_url FROM users WHERE id = ? LIMIT 1');
    $selectStmt->execute([$userId]);
    $row = $selectStmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        throw new RuntimeException('User creation failed');
    }

    $user = lingo_format_user($row);
    lingo_migrate_owner_history($db, $user['id'], $schema);

    $db->commit();

    lingo_set_session_cookie(lingo_sign_session($user['id'], $config));
    lingo_reply(201, [
        'authenticated' => true,
        'user' => $user,
    ]);
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    if (lingo_is_duplicate_key_error($error)) {
        lingo_reply(409, ['error' => 'Email đã được đăng ký.']);
    }
    error_log('Auth register error: ' . $error->getMessage());
    lingo_reply(503, lingo_safe_db_error_meta($error, 'query', 'db_query_error'));
}
