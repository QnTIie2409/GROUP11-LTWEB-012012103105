<?php
declare(strict_types=1);

const LINGO_SESSION_COOKIE = 'lingo_session';
const LINGO_SESSION_TTL = 2592000; // 30 days

function lingo_reply(int $status, array $data): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function lingo_array_is_list($arr): bool
{
    if (!is_array($arr)) {
        return false;
    }
    if ($arr === []) {
        return true;
    }
    return array_keys($arr) === range(0, count($arr) - 1);
}

function lingo_check_origin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if ($origin !== '' && $origin !== 'http://' . $host && $origin !== 'https://' . $host) {
        lingo_reply(403, ['error' => 'Forbidden origin']);
    }
}

function lingo_is_https(): bool
{
    $https = $_SERVER['HTTPS'] ?? '';
    $forwardedProto = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    return ($https !== '' && $https !== 'off') || $forwardedProto === 'https';
}

function lingo_load_config(): array
{
    $config = [
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => getenv('DB_PORT') ?: '3306',
        'user' => getenv('DB_USER') ?: 'root',
        'password' => getenv('DB_PASSWORD') ?: '',
        'name' => getenv('DB_NAME') ?: 'group11_lingo_studio',
        'google_client_id' => getenv('GOOGLE_CLIENT_ID') ?: '',
        'google_client_secret' => getenv('GOOGLE_CLIENT_SECRET') ?: '',
        'google_redirect_uri' => getenv('GOOGLE_REDIRECT_URI') ?: '',
        'session_secret' => getenv('SESSION_SECRET') ?: '',
    ];

    $localConfig = __DIR__ . '/config.local.php';
    if (is_file($localConfig)) {
        $loaded = require $localConfig;
        if (is_array($loaded)) {
            $config = array_replace($config, $loaded);
        }
    }

    return $config;
}

function lingo_has_db_config(): bool
{
    if (is_file(__DIR__ . '/config.local.php')) {
        return true;
    }
    $envHost = getenv('DB_HOST');
    $envName = getenv('DB_NAME');
    return (is_string($envHost) && trim($envHost) !== '')
        || (is_string($envName) && trim($envName) !== '');
}

function lingo_safe_db_error_meta(Throwable $error, string $step, string $reason): array
{
    $meta = [
        'error' => 'Database unavailable',
        'code' => $reason,
        'reason' => $reason,
        'step' => $step,
    ];
    if ($error instanceof PDOException) {
        $sqlState = $error->getCode();
        if (is_string($sqlState) || is_int($sqlState)) {
            $meta['sqlState'] = (string) $sqlState;
        }
        if (isset($error->errorInfo) && is_array($error->errorInfo)) {
            if (isset($error->errorInfo[0]) && $error->errorInfo[0] !== '') {
                $meta['sqlState'] = (string) $error->errorInfo[0];
            }
            if (isset($error->errorInfo[1]) && is_numeric($error->errorInfo[1])) {
                $meta['driverCode'] = (int) $error->errorInfo[1];
            }
        }
    }
    return $meta;
}

function lingo_db(array $config): PDO
{
    $host = trim((string) ($config['host'] ?? '127.0.0.1'));
    $port = trim((string) ($config['port'] ?? '3306'));
    $name = trim((string) ($config['name'] ?? ''));

    $dsn = 'mysql:host=' . $host . ';';
    if ($port !== '') {
        $dsn .= 'port=' . $port . ';';
    }
    $dsn .= 'dbname=' . $name . ';charset=utf8mb4';

    return new PDO($dsn, (string) ($config['user'] ?? ''), (string) ($config['password'] ?? ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

function lingo_ensure_schema(PDO $db): array
{
    static $cache = [];
    $key = spl_object_hash($db);
    if (isset($cache[$key])) {
        return $cache[$key];
    }

    $hasUsersTable = false;
    $hasUserId = false;

    try {
        $db->exec(
            'CREATE TABLE IF NOT EXISTS users (
              id INT AUTO_INCREMENT PRIMARY KEY,
              google_sub VARCHAR(191) NULL UNIQUE,
              email VARCHAR(191) NOT NULL UNIQUE,
              password_hash VARCHAR(255) NULL,
              display_name VARCHAR(255) NULL,
              avatar_url TEXT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        $hasUsersTable = true;
    } catch (Throwable $e) {
        error_log('Schema ensure users error: ' . $e->getMessage());
        try {
            $checkUsers = $db->query("SHOW TABLES LIKE 'users'");
            $hasUsersTable = $checkUsers !== false && $checkUsers->fetch() !== false;
        } catch (Throwable $ignored) {
            $hasUsersTable = false;
        }
    }

    if ($hasUsersTable) {
        try {
            $googleSubStmt = $db->query("SHOW COLUMNS FROM users LIKE 'google_sub'");
            $googleSubCol = $googleSubStmt !== false ? $googleSubStmt->fetch(PDO::FETCH_ASSOC) : false;
            if (is_array($googleSubCol) && strtoupper((string) ($googleSubCol['Null'] ?? '')) !== 'YES') {
                $db->exec('ALTER TABLE users MODIFY COLUMN google_sub VARCHAR(191) NULL');
            }
        } catch (Throwable $e) {
            error_log('Schema alter google_sub nullable error: ' . $e->getMessage());
        }

        try {
            $pwStmt = $db->query("SHOW COLUMNS FROM users LIKE 'password_hash'");
            $hasPasswordHash = $pwStmt !== false && $pwStmt->fetch() !== false;
            if (!$hasPasswordHash) {
                $db->exec('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER email');
            }
        } catch (Throwable $e) {
            error_log('Schema alter password_hash error: ' . $e->getMessage());
        }

        try {
            $idxStmt = $db->query("SHOW INDEX FROM users WHERE Column_name = 'email' AND Non_unique = 0");
            $hasUniqueEmail = $idxStmt !== false && $idxStmt->fetch() !== false;
            if (!$hasUniqueEmail) {
                try {
                    $db->exec('ALTER TABLE users MODIFY COLUMN email VARCHAR(191) NOT NULL');
                } catch (Throwable $emailLenErr) {
                    error_log('Schema alter email length error: ' . $emailLenErr->getMessage());
                }
                try {
                    $db->exec('ALTER TABLE users ADD UNIQUE KEY uniq_users_email (email)');
                } catch (Throwable $emailIdxErr) {
                    error_log('Schema alter unique email index error: ' . $emailIdxErr->getMessage());
                }
            }
        } catch (Throwable $e) {
            error_log('Schema check email unique index error: ' . $e->getMessage());
        }
    }

    try {
        $db->exec(
            'CREATE TABLE IF NOT EXISTS translation_history (
              id VARCHAR(64) NOT NULL,
              owner_id CHAR(36) NOT NULL,
              user_id INT NULL,
              source_lang VARCHAR(12) NOT NULL,
              target_lang VARCHAR(12) NOT NULL,
              source_text TEXT NOT NULL,
              target_text TEXT NOT NULL,
              starred TINYINT(1) NOT NULL DEFAULT 0,
              translated_at BIGINT UNSIGNED NOT NULL,
              PRIMARY KEY (id),
              KEY idx_history_owner_time (owner_id, translated_at),
              KEY idx_history_user_time (user_id, translated_at)
            ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    } catch (Throwable $e) {
        error_log('Schema ensure translation_history error: ' . $e->getMessage());
    }

    try {
        $colStmt = $db->query("SHOW COLUMNS FROM translation_history LIKE 'user_id'");
        $hasUserId = $colStmt !== false && $colStmt->fetch() !== false;

        if (!$hasUserId) {
            try {
                $db->exec(
                    'ALTER TABLE translation_history
                     ADD COLUMN user_id INT NULL AFTER owner_id,
                     ADD KEY idx_history_user_time (user_id, translated_at)'
                );
                $hasUserId = true;
            } catch (Throwable $alterErr) {
                error_log('Schema alter user_id+index error: ' . $alterErr->getMessage());
                try {
                    $db->exec('ALTER TABLE translation_history ADD COLUMN user_id INT NULL AFTER owner_id');
                    $hasUserId = true;
                } catch (Throwable $colErr) {
                    error_log('Schema alter user_id error: ' . $colErr->getMessage());
                }
            }

            if ($hasUserId) {
                try {
                    $db->exec(
                        'ALTER TABLE translation_history
                         ADD CONSTRAINT fk_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL'
                    );
                } catch (Throwable $fkErr) {
                    // Shared/MyISAM MySQL hosting often disallows foreign keys; safe to ignore.
                }
            }
        }
    } catch (Throwable $e) {
        error_log('Schema check user_id column error: ' . $e->getMessage());
    }

    $cache[$key] = [
        'has_users_table' => $hasUsersTable,
        'has_user_id' => $hasUserId,
    ];
    return $cache[$key];
}

function lingo_google_client_id(array $config): ?string
{
    $envVal = getenv('GOOGLE_CLIENT_ID');
    $val = is_string($envVal) && trim($envVal) !== ''
        ? trim($envVal)
        : trim((string) ($config['google_client_id'] ?? ''));

    return $val !== '' ? $val : null;
}

function lingo_google_client_secret(array $config): ?string
{
    $envVal = getenv('GOOGLE_CLIENT_SECRET');
    $val = is_string($envVal) && trim($envVal) !== ''
        ? trim($envVal)
        : trim((string) ($config['google_client_secret'] ?? ''));

    return $val !== '' ? $val : null;
}

function lingo_google_redirect_uri(array $config): string
{
    $envVal = getenv('GOOGLE_REDIRECT_URI');
    $configured = is_string($envVal) && trim($envVal) !== ''
        ? trim($envVal)
        : trim((string) ($config['google_redirect_uri'] ?? ''));

    if ($configured !== '') {
        return $configured;
    }

    $scheme = lingo_is_https() ? 'https' : 'http';
    $host = trim((string) ($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? 'localhost'));
    if ($host === '') {
        $host = 'localhost';
    }

    $scriptName = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
    $dir = $scriptName !== ''
        ? rtrim(str_replace('\\', '/', dirname($scriptName)), '/')
        : '/translate-web/api/auth';
    if ($dir === '.' || $dir === '') {
        $dir = '';
    }

    return $scheme . '://' . $host . $dir . '/google-callback.php';
}

function lingo_session_secret(array $config): string
{
    $envVal = getenv('SESSION_SECRET');
    $configured = is_string($envVal) && trim($envVal) !== ''
        ? trim($envVal)
        : trim((string) ($config['session_secret'] ?? ''));

    if ($configured !== '') {
        return $configured;
    }

    $secretFile = rtrim(sys_get_temp_dir(), '/\\')
        . DIRECTORY_SEPARATOR
        . 'lingo_session_secret_'
        . substr(hash('sha256', __DIR__), 0, 16);

    if (is_file($secretFile) && is_readable($secretFile)) {
        $stored = trim((string) @file_get_contents($secretFile));
        if ($stored !== '') {
            return $stored;
        }
    }

    $generated = bin2hex(random_bytes(32));
    if (@file_put_contents($secretFile, $generated, LOCK_EX) !== false) {
        @chmod($secretFile, 0600);
        return $generated;
    }

    return hash(
        'sha256',
        __FILE__ . '|' . ($config['host'] ?? '') . '|' . ($config['name'] ?? '') . '|' . ($config['password'] ?? '')
    );
}

function lingo_base64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function lingo_base64url_decode(string $data)
{
    $padded = strtr($data, '-_', '+/');
    $remainder = strlen($padded) % 4;
    if ($remainder !== 0) {
        $padded .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode($padded, true);
}

function lingo_sign_session(int $userId, array $config): string
{
    $payloadJson = json_encode([
        'uid' => $userId,
        'exp' => time() + LINGO_SESSION_TTL,
    ], JSON_THROW_ON_ERROR);
    $payloadB64 = lingo_base64url_encode($payloadJson);
    $sigRaw = hash_hmac('sha256', $payloadB64, lingo_session_secret($config), true);
    $sigB64 = lingo_base64url_encode($sigRaw);

    return $payloadB64 . '.' . $sigB64;
}

function lingo_verify_session(?string $token, array $config): ?int
{
    if (!is_string($token) || strpos($token, '.') === false) {
        return null;
    }

    $parts = explode('.', $token);
    if (count($parts) !== 2 || $parts[0] === '' || $parts[1] === '') {
        return null;
    }

    [$payloadB64, $sigB64] = $parts;
    $expectedSig = lingo_base64url_encode(
        hash_hmac('sha256', $payloadB64, lingo_session_secret($config), true)
    );

    if (!hash_equals($expectedSig, $sigB64)) {
        return null;
    }

    $decoded = lingo_base64url_decode($payloadB64);
    if ($decoded === false) {
        return null;
    }

    try {
        $payload = json_decode($decoded, true, 16, JSON_THROW_ON_ERROR);
    } catch (Throwable $e) {
        return null;
    }

    if (
        !is_array($payload)
        || !isset($payload['uid'], $payload['exp'])
        || !is_int($payload['uid']) || $payload['uid'] <= 0
        || !is_int($payload['exp']) || $payload['exp'] <= time()
    ) {
        return null;
    }

    return $payload['uid'];
}

function lingo_set_session_cookie(string $token): void
{
    setcookie(LINGO_SESSION_COOKIE, $token, [
        'expires' => time() + LINGO_SESSION_TTL,
        'path' => '/',
        'secure' => lingo_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function lingo_clear_session_cookie(): void
{
    setcookie(LINGO_SESSION_COOKIE, '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => lingo_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function lingo_format_user(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'email' => (string) $row['email'],
        'displayName' => isset($row['display_name']) && $row['display_name'] !== '' ? (string) $row['display_name'] : null,
        'avatarUrl' => isset($row['avatar_url']) && $row['avatar_url'] !== '' ? (string) $row['avatar_url'] : null,
    ];
}

function lingo_read_json_body(int $maxBytes = 32768): array
{
    $rawBody = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($rawBody === false || strlen($rawBody) > $maxBytes) {
        lingo_reply(400, ['error' => 'Invalid JSON body']);
    }

    try {
        $body = json_decode($rawBody, true, 64, JSON_THROW_ON_ERROR);
    } catch (Throwable $e) {
        lingo_reply(400, ['error' => 'Invalid JSON body']);
    }

    if (!is_array($body)) {
        lingo_reply(400, ['error' => 'Invalid JSON body']);
    }

    return $body;
}

function lingo_connect_auth_db(array $config): array
{
    try {
        $db = lingo_db($config);
    } catch (Throwable $error) {
        error_log('Auth database connect error: ' . $error->getMessage());
        $reason = lingo_has_db_config() ? 'db_connect_error' : 'config_missing';
        lingo_reply(503, lingo_safe_db_error_meta($error, 'connect', $reason));
    }

    try {
        $schema = lingo_ensure_schema($db);
    } catch (Throwable $error) {
        error_log('Auth database schema error: ' . $error->getMessage());
        lingo_reply(503, lingo_safe_db_error_meta($error, 'schema', 'db_schema_error'));
    }

    if (empty($schema['has_users_table'])) {
        lingo_reply(503, [
            'error' => 'Database schema unavailable',
            'code' => 'db_schema_error',
            'reason' => 'db_schema_error',
            'step' => 'schema',
        ]);
    }

    return ['db' => $db, 'schema' => $schema];
}

function lingo_migrate_owner_history(PDO $db, int $userId, array $schema): void
{
    $owner = $_COOKIE['lingo_owner'] ?? '';
    if (
        !empty($schema['has_user_id'])
        && is_string($owner)
        && $owner !== '00000000-0000-0000-0000-000000000000'
        && preg_match('/^[0-9a-f-]{36}$/', $owner)
    ) {
        try {
            $migrate = $db->prepare('UPDATE translation_history SET user_id = ? WHERE owner_id = ? AND user_id IS NULL');
            $migrate->execute([$userId, $owner]);
        } catch (Throwable $migrateErr) {
            error_log('Auth history migration warning: ' . $migrateErr->getMessage());
        }
    }
}

function lingo_is_duplicate_key_error(Throwable $error): bool
{
    if (!($error instanceof PDOException)) {
        return false;
    }
    if ((string) $error->getCode() === '23000') {
        return true;
    }
    return isset($error->errorInfo) && is_array($error->errorInfo) && (int) ($error->errorInfo[1] ?? 0) === 1062;
}

function lingo_get_authenticated_user(array $config, ?PDO $db = null): ?array
{
    $token = $_COOKIE[LINGO_SESSION_COOKIE] ?? null;
    $userId = lingo_verify_session(is_string($token) ? $token : null, $config);
    if ($userId === null) {
        return null;
    }

    $pdo = $db ?? lingo_db($config);
    $schema = lingo_ensure_schema($pdo);
    if (empty($schema['has_users_table'])) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT id, email, display_name, avatar_url FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    return $row ? lingo_format_user($row) : null;
}

function lingo_http_get_json(string $url, int $timeoutSeconds = 10): array
{
    $status = 0;
    $body = false;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_CONNECTTIMEOUT => min(5, $timeoutSeconds),
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
                'timeout' => $timeoutSeconds,
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

    if ($body === false) {
        return ['status' => $status, 'data' => null];
    }

    $decoded = json_decode($body, true);
    return ['status' => $status, 'data' => $decoded];
}

function lingo_http_post_form(string $url, array $params, int $timeoutSeconds = 10): array
{
    $status = 0;
    $body = false;
    $formBody = http_build_query($params, '', '&', PHP_QUERY_RFC3986);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $formBody,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_CONNECTTIMEOUT => min(5, $timeoutSeconds),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/x-www-form-urlencoded',
                'Accept: application/json',
            ],
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
                'method' => 'POST',
                'timeout' => $timeoutSeconds,
                'ignore_errors' => true,
                'header' => "Content-Type: application/x-www-form-urlencoded\r\nAccept: application/json\r\nUser-Agent: LingoStudio/1.0\r\n",
                'content' => $formBody,
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

    if ($body === false) {
        return ['status' => $status, 'data' => null];
    }

    $decoded = json_decode($body, true);
    return ['status' => $status, 'data' => $decoded];
}

function lingo_verify_google_id_token(string $idToken, string $googleClientId): ?array
{
    $tokenInfoUrl = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($idToken);
    $tokenRes = lingo_http_get_json($tokenInfoUrl, 10);
    $info = $tokenRes['data'];

    if ($tokenRes['status'] !== 200 || !is_array($info)) {
        return null;
    }

    $emailVerified = ($info['email_verified'] ?? false) === true || ($info['email_verified'] ?? '') === 'true';
    $expValid = !isset($info['exp']) || ((int) $info['exp']) > time();
    $sub = isset($info['sub']) && is_string($info['sub']) ? trim($info['sub']) : '';
    $email = isset($info['email']) && is_string($info['email']) ? strtolower(trim($info['email'])) : '';

    if (($info['aud'] ?? '') !== $googleClientId || !$emailVerified || !$expValid || $sub === '' || $email === '') {
        return null;
    }

    $displayName = isset($info['name']) && is_string($info['name']) && trim($info['name']) !== ''
        ? trim($info['name'])
        : explode('@', $email)[0];
    $avatarUrl = isset($info['picture']) && is_string($info['picture']) && trim($info['picture']) !== ''
        ? trim($info['picture'])
        : null;

    return [
        'sub' => $sub,
        'email' => $email,
        'displayName' => $displayName,
        'avatarUrl' => $avatarUrl,
    ];
}

function lingo_upsert_google_user(
    PDO $db,
    array $schema,
    string $sub,
    string $email,
    string $displayName,
    ?string $avatarUrl
): array {
    $email = strtolower(trim($email));
    $startedTransaction = !$db->inTransaction();
    if ($startedTransaction) {
        $db->beginTransaction();
    }

    try {
        $upsert = $db->prepare(
            'INSERT INTO users (google_sub, email, display_name, avatar_url)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               google_sub = COALESCE(google_sub, VALUES(google_sub)),
               display_name = COALESCE(NULLIF(VALUES(display_name), \'\'), display_name),
               avatar_url = COALESCE(VALUES(avatar_url), avatar_url)'
        );
        $upsert->execute([$sub, $email, $displayName, $avatarUrl]);

        $select = $db->prepare(
            'SELECT id, email, display_name, avatar_url
             FROM users
             WHERE google_sub = ? OR LOWER(email) = LOWER(?)
             LIMIT 1'
        );
        $select->execute([$sub, $email]);
        $row = $select->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new RuntimeException('User upsert failed');
        }

        $user = lingo_format_user($row);
        lingo_migrate_owner_history($db, $user['id'], $schema);

        if ($startedTransaction && $db->inTransaction()) {
            $db->commit();
        }

        return $user;
    } catch (Throwable $error) {
        if ($startedTransaction && $db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }
}
