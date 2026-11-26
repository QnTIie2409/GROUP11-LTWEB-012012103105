<?php
declare(strict_types=1);

require_once __DIR__ . '/../auth-helper.php';

header('Cache-Control: no-store');

function lingo_oauth_redirect(string $location): void
{
    header('Location: ' . $location, true, 302);
    exit;
}

function lingo_oauth_redirect_error(string $code): void
{
    $safeCode = preg_replace('/[^a-zA-Z0-9_-]/', '_', trim($code));
    if (!is_string($safeCode) || $safeCode === '') {
        $safeCode = 'oauth_failed';
    }
    lingo_oauth_redirect('../../index.html?auth_error=' . rawurlencode($safeCode));
}

function lingo_clear_oauth_state_cookie(): void
{
    setcookie('lingo_oauth_state', '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => lingo_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'GET') {
    header('Allow: GET');
    header('Content-Type: application/json; charset=utf-8');
    lingo_reply(405, ['error' => 'Method Not Allowed']);
}

$expectedState = isset($_COOKIE['lingo_oauth_state']) && is_string($_COOKIE['lingo_oauth_state'])
    ? $_COOKIE['lingo_oauth_state']
    : '';
lingo_clear_oauth_state_cookie();

if (isset($_GET['error']) && is_string($_GET['error']) && trim($_GET['error']) !== '') {
    lingo_oauth_redirect_error($_GET['error']);
}

$state = isset($_GET['state']) && is_string($_GET['state']) ? $_GET['state'] : '';
if ($expectedState === '' || $state === '' || !hash_equals($expectedState, $state)) {
    lingo_oauth_redirect_error('invalid_state');
}

$code = isset($_GET['code']) && is_string($_GET['code']) ? trim($_GET['code']) : '';
if ($code === '') {
    lingo_oauth_redirect_error('missing_code');
}

$config = lingo_load_config();
$googleClientId = lingo_google_client_id($config);
$googleClientSecret = lingo_google_client_secret($config);
if ($googleClientId === null || $googleClientSecret === null) {
    lingo_oauth_redirect_error('google_not_configured');
}

$redirectUri = lingo_google_redirect_uri($config);
$tokenRes = lingo_http_post_form('https://oauth2.googleapis.com/token', [
    'code' => $code,
    'client_id' => $googleClientId,
    'client_secret' => $googleClientSecret,
    'redirect_uri' => $redirectUri,
    'grant_type' => 'authorization_code',
], 10);

$tokenData = $tokenRes['data'];
$idToken = is_array($tokenData) && isset($tokenData['id_token']) && is_string($tokenData['id_token'])
    ? trim($tokenData['id_token'])
    : '';

if ($tokenRes['status'] !== 200 || $idToken === '') {
    error_log('Google OAuth token exchange failed with HTTP ' . (string) $tokenRes['status']);
    lingo_oauth_redirect_error('token_exchange_failed');
}

$profile = lingo_verify_google_id_token($idToken, $googleClientId);
if ($profile === null) {
    lingo_oauth_redirect_error('invalid_token');
}

try {
    $db = lingo_db($config);
    $schema = lingo_ensure_schema($db);
    if (empty($schema['has_users_table'])) {
        lingo_oauth_redirect_error('database_error');
    }

    $user = lingo_upsert_google_user(
        $db,
        $schema,
        $profile['sub'],
        $profile['email'],
        $profile['displayName'],
        $profile['avatarUrl']
    );

    lingo_set_session_cookie(lingo_sign_session($user['id'], $config));
    lingo_oauth_redirect('../../index.html');
} catch (Throwable $error) {
    error_log('Google OAuth callback DB error: ' . $error->getMessage());
    lingo_oauth_redirect_error('database_error');
}
