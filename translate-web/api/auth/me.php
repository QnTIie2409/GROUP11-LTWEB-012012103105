<?php
declare(strict_types=1);

require_once __DIR__ . '/../auth-helper.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'GET' && $method !== 'HEAD') {
    header('Allow: GET, HEAD');
    lingo_reply(405, ['error' => 'Method Not Allowed']);
}

try {
    $config = lingo_load_config();
    $googleClientId = lingo_google_client_id($config);
    $googleClientSecret = lingo_google_client_secret($config);
    $googleOAuthReady = ($googleClientId !== null && $googleClientSecret !== null);
    $googleRedirectUri = lingo_google_redirect_uri($config);

    $user = null;
    try {
        $user = lingo_get_authenticated_user($config);
    } catch (Throwable $error) {
        error_log('Auth session lookup error: ' . $error->getMessage());
        $user = null;
    }

    lingo_reply(200, [
        'authenticated' => $user !== null,
        'user' => $user,
        'googleClientId' => $googleClientId,
        'googleOAuthReady' => $googleOAuthReady,
        'googleRedirectUri' => $googleRedirectUri,
    ]);
} catch (Throwable $error) {
    error_log('Auth me endpoint error: ' . $error->getMessage());
    lingo_reply(500, [
        'error' => 'Internal server error',
        'code' => 'auth_me_error',
        'reason' => 'auth_me_error',
    ]);
}
