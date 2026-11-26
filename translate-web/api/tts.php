<?php
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
    header('Allow: GET, HEAD');
    lingo_tts_error(405, 'Method Not Allowed');
}

function lingo_tts_error(int $status, string $message): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(
        ['success' => false, 'error' => $message],
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );
    exit;
}

function lingo_tts_fetch(string $url): array
{
    $userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    $referer = 'https://translate.google.com/';
    $status = 0;
    $contentType = '';
    $body = false;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_USERAGENT => $userAgent,
            CURLOPT_HTTPHEADER => [
                'Referer: ' . $referer,
                'Accept: audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
            ],
        ]);
        $result = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $rawContentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $contentType = is_string($rawContentType) ? trim($rawContentType) : '';
        curl_close($ch);
        if (is_string($result)) {
            $body = $result;
        }
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 12,
                'ignore_errors' => true,
                'header' => "User-Agent: {$userAgent}\r\nReferer: {$referer}\r\nAccept: audio/mpeg,audio/*;q=0.9,*/*;q=0.8\r\n",
            ],
        ]);
        $result = @file_get_contents($url, false, $context);
        if (is_string($result)) {
            $body = $result;
        }
        $headers = $http_response_header ?? [];
        if (is_array($headers)) {
            foreach ($headers as $idx => $headerLine) {
                if ($idx === 0 && preg_match('/\s(\d{3})\s/', $headerLine, $m)) {
                    $status = (int) $m[1];
                } elseif (stripos($headerLine, 'Content-Type:') === 0) {
                    $contentType = trim(substr($headerLine, strlen('Content-Type:')));
                }
            }
        }
    }

    return [
        'status' => $status,
        'contentType' => $contentType,
        'body' => $body,
    ];
}

$rawQ = isset($_GET['q']) && is_string($_GET['q']) ? trim($_GET['q']) : '';
if ($rawQ === '') {
    lingo_tts_error(400, 'Thiếu tham số q');
}

$q = function_exists('mb_substr')
    ? mb_substr($rawQ, 0, 200, 'UTF-8')
    : substr($rawQ, 0, 200);

$rawTl = isset($_GET['tl']) && is_string($_GET['tl']) ? trim($_GET['tl']) : 'vi';
if (
    $rawTl === ''
    || strtolower($rawTl) === 'auto'
    || !preg_match('/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/', $rawTl)
) {
    $tl = 'vi';
} else {
    $tl = $rawTl;
}

$googleTtsUrl = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob'
    . '&tl=' . rawurlencode($tl)
    . '&q=' . rawurlencode($q);

$response = lingo_tts_fetch($googleTtsUrl);
$status = $response['status'];
$contentType = strtolower($response['contentType']);
$body = $response['body'];

if ($status !== 200 || !is_string($body) || $body === '') {
    $errStatus = $status >= 400 && $status < 600 ? $status : 502;
    $errMsg = $status > 0 ? "Google TTS error {$status}" : 'TTS service unavailable';
    lingo_tts_error($errStatus, $errMsg);
}

if (
    $contentType !== ''
    && strpos($contentType, 'audio/') !== 0
    && strpos($contentType, 'application/octet-stream') !== 0
) {
    lingo_tts_error(502, 'Invalid TTS upstream response');
}

http_response_code(200);
header('Content-Type: audio/mpeg');
header('Cache-Control: public, max-age=86400');

if ($method === 'HEAD') {
    exit;
}

echo $body;
