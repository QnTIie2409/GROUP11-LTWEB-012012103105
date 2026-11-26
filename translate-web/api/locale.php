<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, max-age=1800');

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'GET' && $method !== 'HEAD') {
    header('Allow: GET, HEAD');
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

function lingo_locale_reply(array $payload): void
{
    http_response_code(200);
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'HEAD') {
        exit;
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function lingo_locale_lang_map(): array
{
    return [
        'vi' => ['uiLang' => 'vi', 'targetLang' => 'vi', 'defaultCountry' => 'VN'],
        'en' => ['uiLang' => 'en', 'targetLang' => 'en', 'defaultCountry' => 'US'],
        'ja' => ['uiLang' => 'ja', 'targetLang' => 'ja', 'defaultCountry' => 'JP'],
        'ko' => ['uiLang' => 'ko', 'targetLang' => 'ko', 'defaultCountry' => 'KR'],
        'zh' => ['uiLang' => 'zh', 'targetLang' => 'zh-CN', 'defaultCountry' => 'CN'],
        'fr' => ['uiLang' => 'fr', 'targetLang' => 'fr', 'defaultCountry' => 'FR'],
        'de' => ['uiLang' => 'de', 'targetLang' => 'de', 'defaultCountry' => 'DE'],
        'es' => ['uiLang' => 'es', 'targetLang' => 'es', 'defaultCountry' => 'ES'],
    ];
}

function lingo_locale_country_to_ui(string $countryCode): ?string
{
    $map = [
        'VN' => 'vi',
        'JP' => 'ja',
        'KR' => 'ko',
        'CN' => 'zh',
        'TW' => 'zh',
        'HK' => 'zh',
        'MO' => 'zh',
        'FR' => 'fr',
        'MC' => 'fr',
        'DE' => 'de',
        'AT' => 'de',
        'LI' => 'de',
        'ES' => 'es',
        'MX' => 'es',
        'AR' => 'es',
        'CO' => 'es',
        'CL' => 'es',
        'PE' => 'es',
        'VE' => 'es',
        'EC' => 'es',
        'UY' => 'es',
        'PY' => 'es',
        'BO' => 'es',
        'CR' => 'es',
        'PA' => 'es',
        'DO' => 'es',
        'GT' => 'es',
        'HN' => 'es',
        'SV' => 'es',
        'NI' => 'es',
        'CU' => 'es',
        'PR' => 'es',
        'US' => 'en',
        'GB' => 'en',
        'AU' => 'en',
        'CA' => 'en',
        'NZ' => 'en',
        'IE' => 'en',
        'SG' => 'en',
    ];

    return $map[$countryCode] ?? null;
}

function lingo_locale_is_valid_country(string $code): bool
{
    $upper = strtoupper(trim($code));
    if ($upper === '' || $upper === 'XX' || $upper === 'T1') {
        return false;
    }
    return preg_match('/^[A-Z]{2}$/', $upper) === 1;
}

function lingo_locale_is_public_ip(string $ip): bool
{
    $clean = trim($ip);
    if ($clean === '') {
        return false;
    }
    if (substr($clean, 0, 1) === '[' && strpos($clean, ']') !== false) {
        $endBracket = strpos($clean, ']');
        $clean = substr($clean, 1, $endBracket - 1);
    }
    return filter_var($clean, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
}

function lingo_locale_extract_client_ip(): ?string
{
    $cfIp = trim((string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? ''));
    if ($cfIp !== '' && lingo_locale_is_public_ip($cfIp)) {
        return $cfIp;
    }

    $forwardedFor = (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
    if ($forwardedFor !== '') {
        $parts = explode(',', $forwardedFor);
        foreach ($parts as $part) {
            $candidate = trim($part);
            if ($candidate !== '' && lingo_locale_is_public_ip($candidate)) {
                return $candidate;
            }
        }
    }

    $remoteAddr = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    if ($remoteAddr !== '' && lingo_locale_is_public_ip($remoteAddr)) {
        return $remoteAddr;
    }

    return null;
}

function lingo_locale_fetch_ip_country(string $ip): ?string
{
    $url = 'http://ip-api.com/json/' . rawurlencode($ip) . '?fields=status,countryCode';
    $body = false;
    $status = 0;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT_MS => 1500,
            CURLOPT_CONNECTTIMEOUT_MS => 1500,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
            CURLOPT_USERAGENT => 'LingoStudio/1.0',
        ]);
        $result = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (is_string($result)) {
            $body = $result;
        }
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 1.5,
                'ignore_errors' => true,
                'header' => "Accept: application/json\r\nUser-Agent: LingoStudio/1.0\r\n",
            ],
        ]);
        $result = @file_get_contents($url, false, $context);
        if (is_string($result)) {
            $body = $result;
        }
        $headers = $http_response_header ?? [];
        if (is_array($headers) && isset($headers[0]) && preg_match('/\s(\d{3})\s/', $headers[0], $m)) {
            $status = (int) $m[1];
        }
    }

    if ($status !== 200 || $body === false) {
        return null;
    }

    try {
        $data = json_decode($body, true, 16, JSON_THROW_ON_ERROR);
    } catch (Throwable $e) {
        return null;
    }

    if (!is_array($data) || ($data['status'] ?? '') !== 'success') {
        return null;
    }

    $countryCode = strtoupper(trim((string) ($data['countryCode'] ?? '')));
    return lingo_locale_is_valid_country($countryCode) ? $countryCode : null;
}

function lingo_locale_parse_accept_language(string $header): ?array
{
    $trimmed = trim($header);
    if ($trimmed === '') {
        return null;
    }

    $langMap = lingo_locale_lang_map();
    $candidates = [];
    $parts = explode(',', $trimmed);

    foreach ($parts as $index => $part) {
        $segments = explode(';', trim($part));
        $tag = strtolower(trim((string) ($segments[0] ?? '')));
        if ($tag === '' || $tag === '*') {
            continue;
        }

        $q = 1.0;
        for ($i = 1, $len = count($segments); $i < $len; $i++) {
            $param = trim($segments[$i]);
            if (strpos($param, 'q=') === 0) {
                $val = (float) substr($param, 2);
                $q = max(0.0, min(1.0, $val));
                break;
            }
        }

        if ($q <= 0.0) {
            continue;
        }

        $subtags = preg_split('/[-_]/', $tag);
        $primary = is_array($subtags) && isset($subtags[0]) ? $subtags[0] : '';
        if (!isset($langMap[$primary])) {
            continue;
        }

        $region = null;
        if (is_array($subtags)) {
            foreach (array_slice($subtags, 1) as $sub) {
                if (preg_match('/^[a-z]{2}$/', $sub) === 1) {
                    $upperSub = strtoupper($sub);
                    if ($upperSub !== 'XX' && $upperSub !== 'T1') {
                        $region = $upperSub;
                    }
                    break;
                }
            }
        }

        $candidates[] = [
            'q' => $q,
            'index' => $index,
            'uiLang' => $primary,
            'region' => $region,
        ];
    }

    if ($candidates === []) {
        return null;
    }

    usort($candidates, static function (array $a, array $b): int {
        if ($a['q'] !== $b['q']) {
            return $a['q'] > $b['q'] ? -1 : 1;
        }
        return $a['index'] <=> $b['index'];
    });

    $best = $candidates[0];
    $info = $langMap[$best['uiLang']];

    return [
        'countryCode' => $best['region'] ?? $info['defaultCountry'],
        'uiLang' => $info['uiLang'],
        'targetLang' => $info['targetLang'],
    ];
}

try {
    $langMap = lingo_locale_lang_map();
    $acceptLanguage = (string) ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '');

    $countryCode = null;
    $cfCountry = strtoupper(trim((string) ($_SERVER['HTTP_CF_IPCOUNTRY'] ?? '')));
    if (lingo_locale_is_valid_country($cfCountry)) {
        $countryCode = $cfCountry;
    } else {
        $vercelCountry = strtoupper(trim((string) ($_SERVER['HTTP_X_VERCEL_IP_COUNTRY'] ?? '')));
        if (lingo_locale_is_valid_country($vercelCountry)) {
            $countryCode = $vercelCountry;
        }
    }

    if ($countryCode === null) {
        $clientIp = lingo_locale_extract_client_ip();
        if ($clientIp !== null) {
            $countryCode = lingo_locale_fetch_ip_country($clientIp);
        }
    }

    if ($countryCode !== null) {
        $mappedUi = lingo_locale_country_to_ui($countryCode);
        if ($mappedUi !== null && isset($langMap[$mappedUi])) {
            $info = $langMap[$mappedUi];
            lingo_locale_reply([
                'countryCode' => $countryCode,
                'uiLang' => $info['uiLang'],
                'targetLang' => $info['targetLang'],
                'source' => 'ip',
            ]);
        }

        $headerMatch = lingo_locale_parse_accept_language($acceptLanguage);
        if ($headerMatch !== null) {
            lingo_locale_reply([
                'countryCode' => $countryCode,
                'uiLang' => $headerMatch['uiLang'],
                'targetLang' => $headerMatch['targetLang'],
                'source' => 'ip',
            ]);
        }

        lingo_locale_reply([
            'countryCode' => $countryCode,
            'uiLang' => 'en',
            'targetLang' => 'en',
            'source' => 'ip',
        ]);
    }

    $headerMatch = lingo_locale_parse_accept_language($acceptLanguage);
    if ($headerMatch !== null) {
        lingo_locale_reply([
            'countryCode' => $headerMatch['countryCode'],
            'uiLang' => $headerMatch['uiLang'],
            'targetLang' => $headerMatch['targetLang'],
            'source' => 'header',
        ]);
    }
} catch (Throwable $e) {
    error_log('Locale detection warning: ' . $e->getMessage());
}

lingo_locale_reply([
    'countryCode' => 'VN',
    'uiLang' => 'vi',
    'targetLang' => 'vi',
    'source' => 'default',
]);
