<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function reply(int $status, array $data): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'GET' && $method !== 'PUT') {
    header('Allow: GET, PUT');
    reply(405, ['error' => 'Method Not Allowed']);
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = $_SERVER['HTTP_HOST'] ?? '';
if ($origin !== '' && $origin !== 'http://' . $host && $origin !== 'https://' . $host) {
    reply(403, ['error' => 'Forbidden origin']);
}

$owner = $_COOKIE['lingo_owner'] ?? '';
if (!is_string($owner) || !preg_match('/^[0-9a-f-]{36}$/', $owner)) {
    $hex = bin2hex(random_bytes(16));
    $owner = substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4)
        . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
    setcookie('lingo_owner', $owner, [
        'expires' => time() + 31536000,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function validHistory(mixed $items): bool
{
    if (!is_array($items) || !array_is_list($items) || count($items) > 50) {
        return false;
    }
    $ids = [];
    foreach ($items as $item) {
        if (!is_array($item)
            || !isset($item['id'], $item['sourceLang'], $item['targetLang'],
                $item['sourceText'], $item['targetText'], $item['timestamp'], $item['starred'])
            || !is_string($item['id']) || !preg_match('/^[a-zA-Z0-9_-]{1,64}$/', $item['id'])
            || isset($ids[$item['id']])
            || !is_string($item['sourceLang']) || strlen($item['sourceLang']) > 12
            || !is_string($item['targetLang']) || strlen($item['targetLang']) > 12
            || !is_string($item['sourceText']) || mb_strlen($item['sourceText']) > 5000
            || strlen($item['sourceText']) > 65535
            || !is_string($item['targetText']) || mb_strlen($item['targetText']) > 20000
            || strlen($item['targetText']) > 65535
            || !is_int($item['timestamp']) || $item['timestamp'] < 0
            || !is_bool($item['starred'])) {
            return false;
        }
        $ids[$item['id']] = true;
    }
    return true;
}

$items = null;
if ($method === 'PUT') {
    $body = file_get_contents('php://input', false, null, 0, 1500001);
    if ($body === false) {
        reply(400, ['error' => 'Invalid history']);
    }
    if (strlen($body) > 1500000) {
        reply(413, ['error' => 'History too large']);
    }
    try {
        $items = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        reply(400, ['error' => 'Invalid history']);
    }
    if (!validHistory($items)) {
        reply(400, ['error' => 'Invalid history']);
    }
}

$config = [
    'host' => getenv('DB_HOST') ?: '127.0.0.1',
    'port' => getenv('DB_PORT') ?: '3306',
    'user' => getenv('DB_USER') ?: 'root',
    'password' => getenv('DB_PASSWORD') ?: '',
    'name' => getenv('DB_NAME') ?: 'group11_lingo_studio',
];
$localConfig = __DIR__ . '/config.local.php';
if (is_file($localConfig)) {
    $config = array_replace($config, require $localConfig);
}

try {
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        $config['host'], $config['port'], $config['name']);
    $db = new PDO($dsn, $config['user'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    if ($method === 'GET') {
        $query = $db->prepare('SELECT id, source_lang, target_lang, source_text, target_text, starred, translated_at
            FROM translation_history WHERE owner_id = ? ORDER BY translated_at DESC LIMIT 50');
        $query->execute([$owner]);
        $history = [];
        while ($row = $query->fetch(PDO::FETCH_ASSOC)) {
            $history[] = [
                'id' => $row['id'],
                'sourceLang' => $row['source_lang'],
                'targetLang' => $row['target_lang'],
                'sourceText' => $row['source_text'],
                'targetText' => $row['target_text'],
                'starred' => (bool) $row['starred'],
                'timestamp' => (int) $row['translated_at'],
            ];
        }
        reply(200, $history);
    }

    $db->beginTransaction();
    $delete = $db->prepare('DELETE FROM translation_history WHERE owner_id = ?');
    $delete->execute([$owner]);
    $insert = $db->prepare('INSERT INTO translation_history
        (id, owner_id, source_lang, target_lang, source_text, target_text, starred, translated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    foreach ($items as $item) {
        $insert->execute([
            $item['id'], $owner, $item['sourceLang'], $item['targetLang'],
            $item['sourceText'], $item['targetText'], (int) $item['starred'], $item['timestamp'],
        ]);
    }
    $db->commit();
    reply(200, ['saved' => count($items)]);
} catch (Throwable $error) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }
    error_log('History database error: ' . $error->getMessage());
    reply(503, ['error' => 'Database unavailable']);
}
