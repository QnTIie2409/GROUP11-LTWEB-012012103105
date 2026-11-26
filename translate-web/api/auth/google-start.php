<?php
declare(strict_types=1);

require_once __DIR__ . '/../auth-helper.php';

header('Cache-Control: no-store');

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'GET' && $method !== 'HEAD') {
    header('Allow: GET, HEAD');
    header('Content-Type: application/json; charset=utf-8');
    lingo_reply(405, ['error' => 'Method Not Allowed']);
}

$config = lingo_load_config();
$googleClientId = lingo_google_client_id($config);
$googleClientSecret = lingo_google_client_secret($config);

if ($googleClientId === null || $googleClientSecret === null) {
    header('Location: ../../index.html?auth_error=google_not_configured', true, 302);
    exit;
}

$state = bin2hex(random_bytes(16));
setcookie('lingo_oauth_state', $state, [
    'expires' => time() + 600,
    'path' => '/',
    'secure' => lingo_is_https(),
    'httponly' => true,
    'samesite' => 'Lax',
]);

$redirectUri = lingo_google_redirect_uri($config);
$params = http_build_query([
    'client_id' => $googleClientId,
    'redirect_uri' => $redirectUri,
    'response_type' => 'code',
    'scope' => 'openid email profile',
    'state' => $state,
    'prompt' => 'select_account',
], '', '&', PHP_QUERY_RFC3986);

header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . $params, true, 302);
exit;
