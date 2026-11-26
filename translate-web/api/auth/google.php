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

$config = lingo_load_config();
$googleClientId = lingo_google_client_id($config);
if ($googleClientId === null) {
    lingo_reply(503, [
        'error' => 'Google Sign-In is not configured on the server',
        'code' => 'google_client_id_missing',
        'reason' => 'google_client_id_missing',
    ]);
}

$rawBody = file_get_contents('php://input', false, null, 0, 32769);
if ($rawBody === false || strlen($rawBody) > 32768) {
    lingo_reply(400, ['error' => 'Invalid JSON body']);
}

try {
    $body = json_decode($rawBody, true, 64, JSON_THROW_ON_ERROR);
} catch (Throwable $e) {
    lingo_reply(400, ['error' => 'Invalid JSON body']);
}

$credential = is_array($body) && isset($body['credential']) && is_string($body['credential'])
    ? trim($body['credential'])
    : '';
if ($credential === '' || strlen($credential) > 8192) {
    lingo_reply(400, ['error' => 'Missing Google credential']);
}

$profile = lingo_verify_google_id_token($credential, $googleClientId);
if ($profile === null) {
    lingo_reply(401, ['error' => 'Invalid Google credential']);
}

$conn = lingo_connect_auth_db($config);
/** @var PDO $db */
$db = $conn['db'];
$schema = $conn['schema'];

try {
    $user = lingo_upsert_google_user(
        $db,
        $schema,
        $profile['sub'],
        $profile['email'],
        $profile['displayName'],
        $profile['avatarUrl']
    );

    lingo_set_session_cookie(lingo_sign_session($user['id'], $config));
    lingo_reply(200, [
        'authenticated' => true,
        'user' => $user,
    ]);
} catch (Throwable $error) {
    error_log('Auth database error (query): ' . $error->getMessage());
    lingo_reply(503, lingo_safe_db_error_meta($error, 'query', 'db_query_error'));
}
