<?php
declare(strict_types=1);

require_once __DIR__ . '/auth-helper.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');

const LINGO_ANON_PLACEHOLDER_OWNER = '00000000-0000-0000-0000-000000000000';

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'GET' && $method !== 'PUT' && $method !== 'POST') {
    header('Allow: GET, PUT, POST');
    lingo_reply(405, ['error' => 'Method Not Allowed']);
}

lingo_check_origin();

function lingo_str_len(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function lingo_valid_history_id($id): bool
{
    return is_string($id) && preg_match('/^[a-zA-Z0-9_-]{1,64}$/', $id) === 1;
}

function lingo_valid_history_item($item): bool
{
    return is_array($item)
        && isset(
            $item['id'],
            $item['sourceLang'],
            $item['targetLang'],
            $item['sourceText'],
            $item['targetText'],
            $item['timestamp'],
            $item['starred']
        )
        && lingo_valid_history_id($item['id'])
        && is_string($item['sourceLang']) && strlen($item['sourceLang']) <= 12
        && is_string($item['targetLang']) && strlen($item['targetLang']) <= 12
        && is_string($item['sourceText']) && lingo_str_len($item['sourceText']) <= 5000
        && strlen($item['sourceText']) <= 65535
        && is_string($item['targetText']) && lingo_str_len($item['targetText']) <= 20000
        && strlen($item['targetText']) <= 65535
        && is_int($item['timestamp']) && $item['timestamp'] >= 0
        && is_bool($item['starred']);
}

function validHistory($items): bool
{
    if (!is_array($items) || !lingo_array_is_list($items) || count($items) > 50) {
        return false;
    }
    $ids = [];
    foreach ($items as $item) {
        if (!lingo_valid_history_item($item) || isset($ids[$item['id']])) {
            return false;
        }
        $ids[$item['id']] = true;
    }
    return true;
}

function lingo_history_scope(bool $hasUserId, ?array $user, string $owner): array
{
    if ($hasUserId) {
        if ($user !== null) {
            return [
                'where' => 'user_id = ?',
                'params' => [$user['id']],
                'userIdValue' => $user['id'],
            ];
        }
        return [
            'where' => 'owner_id = ? AND user_id IS NULL',
            'params' => [$owner],
            'userIdValue' => null,
        ];
    }

    return [
        'where' => 'owner_id = ?',
        'params' => [$owner],
        'userIdValue' => null,
    ];
}

function lingo_insert_history_row(
    PDO $db,
    bool $hasUserId,
    string $owner,
    $userIdValue,
    array $item
): array {
    $insertId = $item['id'];
    for ($attempt = 0; $attempt < 3; $attempt++) {
        try {
            if ($hasUserId) {
                $insert = $db->prepare(
                    'INSERT INTO translation_history
                     (id, owner_id, user_id, source_lang, target_lang, source_text, target_text, starred, translated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $insert->execute([
                    $insertId,
                    $owner,
                    $userIdValue,
                    $item['sourceLang'],
                    $item['targetLang'],
                    $item['sourceText'],
                    $item['targetText'],
                    (int) $item['starred'],
                    $item['timestamp'],
                ]);
            } else {
                $insert = $db->prepare(
                    'INSERT INTO translation_history
                     (id, owner_id, source_lang, target_lang, source_text, target_text, starred, translated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $insert->execute([
                    $insertId,
                    $owner,
                    $item['sourceLang'],
                    $item['targetLang'],
                    $item['sourceText'],
                    $item['targetText'],
                    (int) $item['starred'],
                    $item['timestamp'],
                ]);
            }
            $item['id'] = $insertId;
            return $item;
        } catch (Throwable $err) {
            if (!lingo_is_duplicate_key_error($err) || $attempt === 2) {
                throw $err;
            }
            $suffix = '_' . bin2hex(random_bytes(4));
            $baseMaxLen = 64 - strlen($suffix);
            $insertId = substr($item['id'], 0, $baseMaxLen) . $suffix;
        }
    }

    return $item;
}

function lingo_upsert_history_item(
    PDO $db,
    bool $hasUserId,
    array $scope,
    string $owner,
    array $item,
    bool $preserveNewerTimestamp = false
): array {
    $findSql = 'SELECT id, source_text, starred, translated_at
        FROM translation_history
        WHERE ' . $scope['where'] . ' AND (id = ? OR (source_lang = ? AND target_lang = ? AND source_text = ?))';
    $findStmt = $db->prepare($findSql);
    $findStmt->execute(array_merge(
        $scope['params'],
        [$item['id'], $item['sourceLang'], $item['targetLang'], $item['sourceText']]
    ));

    $existingStarred = false;
    $maxTimestamp = $item['timestamp'];
    $idsToDelete = [];

    while ($row = $findStmt->fetch(PDO::FETCH_ASSOC)) {
        if ($row['id'] === $item['id'] || $row['source_text'] === $item['sourceText']) {
            $idsToDelete[] = $row['id'];
            if (!empty($row['starred'])) {
                $existingStarred = true;
            }
            if ($preserveNewerTimestamp && isset($row['translated_at'])) {
                $rowTime = (int) $row['translated_at'];
                if ($rowTime > $maxTimestamp) {
                    $maxTimestamp = $rowTime;
                }
            }
        }
    }

    if ($idsToDelete !== []) {
        $placeholders = implode(', ', array_fill(0, count($idsToDelete), '?'));
        $delSql = 'DELETE FROM translation_history WHERE ' . $scope['where'] . ' AND id IN (' . $placeholders . ')';
        $delStmt = $db->prepare($delSql);
        $delStmt->execute(array_merge($scope['params'], $idsToDelete));
    }

    $normalizedItem = [
        'id' => $item['id'],
        'sourceLang' => $item['sourceLang'],
        'targetLang' => $item['targetLang'],
        'sourceText' => $item['sourceText'],
        'targetText' => $item['targetText'],
        'starred' => (bool) ($item['starred'] || $existingStarred),
        'timestamp' => $maxTimestamp,
    ];

    return lingo_insert_history_row($db, $hasUserId, $owner, $scope['userIdValue'], $normalizedItem);
}

function lingo_prune_history(PDO $db, array $scope, int $maxRows = 50): void
{
    $stmt = $db->prepare(
        'SELECT id FROM translation_history WHERE ' . $scope['where'] . ' ORDER BY translated_at DESC, id DESC'
    );
    $stmt->execute($scope['params']);

    $allIds = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if (isset($row['id'])) {
            $allIds[] = $row['id'];
        }
    }

    if (count($allIds) <= $maxRows) {
        return;
    }

    $excessIds = array_slice($allIds, $maxRows);
    foreach (array_chunk($excessIds, 100) as $chunk) {
        $placeholders = implode(', ', array_fill(0, count($chunk), '?'));
        $delStmt = $db->prepare(
            'DELETE FROM translation_history WHERE ' . $scope['where'] . ' AND id IN (' . $placeholders . ')'
        );
        $delStmt->execute(array_merge($scope['params'], $chunk));
    }
}

$items = null;
$postPayload = null;

if ($method === 'PUT' || $method === 'POST') {
    $body = file_get_contents('php://input', false, null, 0, 1500001);
    if ($body === false) {
        lingo_reply(400, ['error' => $method === 'PUT' ? 'Invalid history' : 'Invalid JSON body']);
    }
    if (strlen($body) > 1500000) {
        lingo_reply(413, ['error' => 'History too large']);
    }
    try {
        $decoded = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
    } catch (Throwable $e) {
        lingo_reply(400, ['error' => $method === 'PUT' ? 'Invalid history' : 'Invalid JSON body']);
    }

    if ($method === 'PUT') {
        $items = $decoded;
        if (!validHistory($items)) {
            lingo_reply(400, ['error' => 'Invalid history']);
        }
    } else {
        if (!is_array($decoded) || lingo_array_is_list($decoded)) {
            lingo_reply(400, ['error' => 'Invalid JSON body']);
        }
        $action = $decoded['action'] ?? null;
        if (!is_string($action)) {
            lingo_reply(400, ['error' => 'Invalid action']);
        }

        if ($action === 'upsert') {
            if (!isset($decoded['item']) || !lingo_valid_history_item($decoded['item'])) {
                lingo_reply(400, ['error' => 'Invalid history item']);
            }
        } elseif ($action === 'star') {
            if (!isset($decoded['id'], $decoded['starred'])
                || !lingo_valid_history_id($decoded['id'])
                || !is_bool($decoded['starred'])) {
                lingo_reply(400, ['error' => 'Invalid star payload']);
            }
        } elseif ($action === 'delete') {
            if (!isset($decoded['id']) || !lingo_valid_history_id($decoded['id'])) {
                lingo_reply(400, ['error' => 'Invalid delete payload']);
            }
        } elseif ($action === 'clear') {
            // No additional fields required
        } elseif ($action === 'merge') {
            $mergeItems = $decoded['items'] ?? null;
            if (!is_array($mergeItems) || !lingo_array_is_list($mergeItems) || count($mergeItems) > 100) {
                lingo_reply(400, ['error' => 'Invalid merge items']);
            }
            foreach ($mergeItems as $mergeItem) {
                if (!lingo_valid_history_item($mergeItem)) {
                    lingo_reply(400, ['error' => 'Invalid merge items']);
                }
            }
        } else {
            lingo_reply(400, ['error' => 'Invalid action']);
        }

        $postPayload = $decoded;
    }
}

$config = lingo_load_config();
$db = null;
$step = 'connect';

try {
    $db = lingo_db($config);
} catch (Throwable $error) {
    error_log('History database connect error: ' . $error->getMessage());
    $reason = lingo_has_db_config() ? 'db_connect_error' : 'config_missing';
    lingo_reply(503, lingo_safe_db_error_meta($error, 'connect', $reason));
}

try {
    $step = 'schema';
    $schema = lingo_ensure_schema($db);
    $hasUserId = !empty($schema['has_user_id']);

    $step = 'query';
    $user = null;
    if (!empty($schema['has_users_table'])) {
        try {
            $user = lingo_get_authenticated_user($config, $db);
        } catch (Throwable $authError) {
            error_log('History auth lookup warning: ' . $authError->getMessage());
            $user = null;
        }
    }

    $ownerCookie = $_COOKIE['lingo_owner'] ?? '';
    $validOwnerCookie = is_string($ownerCookie) && preg_match('/^[0-9a-f-]{36}$/', $ownerCookie) ? $ownerCookie : null;

    if ($user !== null && $hasUserId) {
        $owner = $validOwnerCookie ?? LINGO_ANON_PLACEHOLDER_OWNER;
    } elseif ($validOwnerCookie !== null) {
        $owner = $validOwnerCookie;
    } else {
        $hex = bin2hex(random_bytes(16));
        $owner = substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4)
            . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
        setcookie('lingo_owner', $owner, [
            'expires' => time() + 31536000,
            'path' => '/',
            'secure' => lingo_is_https(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    $scope = lingo_history_scope($hasUserId, $user, $owner);

    if ($method === 'GET') {
        $query = $db->prepare(
            'SELECT id, source_lang, target_lang, source_text, target_text, starred, translated_at
             FROM translation_history WHERE ' . $scope['where'] . ' ORDER BY translated_at DESC LIMIT 50'
        );
        $query->execute($scope['params']);

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
        lingo_reply(200, $history);
    }

    if ($method === 'PUT') {
        $db->beginTransaction();
        $delete = $db->prepare('DELETE FROM translation_history WHERE ' . $scope['where']);
        $delete->execute($scope['params']);

        foreach ($items as $item) {
            lingo_insert_history_row($db, $hasUserId, $owner, $scope['userIdValue'], $item);
        }
        $db->commit();
        lingo_reply(200, ['saved' => count($items)]);
    }

    $action = $postPayload['action'];

    if ($action === 'upsert') {
        $db->beginTransaction();
        $savedItem = lingo_upsert_history_item($db, $hasUserId, $scope, $owner, $postPayload['item'], false);
        lingo_prune_history($db, $scope, 50);
        $db->commit();
        lingo_reply(200, ['ok' => true, 'item' => $savedItem]);
    }

    if ($action === 'star') {
        $stmt = $db->prepare(
            'UPDATE translation_history SET starred = ? WHERE id = ? AND ' . $scope['where']
        );
        $stmt->execute(array_merge([(int) $postPayload['starred'], $postPayload['id']], $scope['params']));
        lingo_reply(200, ['ok' => true]);
    }

    if ($action === 'delete') {
        $stmt = $db->prepare(
            'DELETE FROM translation_history WHERE id = ? AND ' . $scope['where']
        );
        $stmt->execute(array_merge([$postPayload['id']], $scope['params']));
        lingo_reply(200, ['ok' => true]);
    }

    if ($action === 'clear') {
        $stmt = $db->prepare('DELETE FROM translation_history WHERE ' . $scope['where']);
        $stmt->execute($scope['params']);
        lingo_reply(200, ['ok' => true]);
    }

    if ($action === 'merge') {
        $mergeItems = $postPayload['items'];
        $db->beginTransaction();
        foreach ($mergeItems as $mergeItem) {
            lingo_upsert_history_item($db, $hasUserId, $scope, $owner, $mergeItem, true);
        }
        lingo_prune_history($db, $scope, 50);
        $db->commit();
        lingo_reply(200, ['ok' => true, 'saved' => count($mergeItems)]);
    }
} catch (Throwable $error) {
    if ($db !== null && $db->inTransaction()) {
        $db->rollBack();
    }
    error_log('History database error (' . $step . '): ' . $error->getMessage());
    $reason = $step === 'schema' ? 'db_schema_error' : 'db_query_error';
    lingo_reply(503, lingo_safe_db_error_meta($error, $step, $reason));
}
