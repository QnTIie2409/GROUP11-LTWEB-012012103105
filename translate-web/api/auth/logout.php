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

lingo_clear_session_cookie();
lingo_reply(200, ['authenticated' => false]);
