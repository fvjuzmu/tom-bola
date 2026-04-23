<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

define('DATA_DIR',   __DIR__ . '/data');
define('DB_PATH',    DATA_DIR . '/tombola.sqlite');

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    if (!is_dir(DATA_DIR)) {
        if (!mkdir(DATA_DIR, 0750, true)) {
            json_err('Datenverzeichnis konnte nicht erstellt werden', 500);
        }
        file_put_contents(DATA_DIR . '/.htaccess', "Require all denied\n");
    }

    // Migration: detect old single-dataset schema (participants without dataset column)
    if (file_exists(DB_PATH)) {
        $tmp = new PDO('sqlite:' . DB_PATH);
        $tmp->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $cols = $tmp->query("PRAGMA table_info(participants)")->fetchAll(PDO::FETCH_ASSOC);
        $hasDataset = false;
        foreach ($cols as $col) {
            if ($col['name'] === 'dataset') { $hasDataset = true; break; }
        }
        unset($tmp);
        if (!empty($cols) && !$hasDataset) {
            unlink(DB_PATH); // wipe old schema; data was single-dataset only
        }
    }

    $pdo = new PDO('sqlite:' . DB_PATH);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("PRAGMA journal_mode=WAL;");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS datasets (
            hash       TEXT PRIMARY KEY,
            filename   TEXT NOT NULL,
            loaded_at  INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS participants (
            id         TEXT    NOT NULL,
            dataset    TEXT    NOT NULL,
            name       TEXT    NOT NULL,
            checked    INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (id, dataset)
        );
    ");
    return $pdo;
}

function now_ms(): int
{
    return (int) round(microtime(true) * 1000);
}

function detect_delimiter(string $csv): string
{
    $first = strtok($csv, "\n");
    return substr_count((string)$first, ';') >= substr_count((string)$first, ',') ? ';' : ',';
}

function json_ok(array $extra = []): void
{
    echo json_encode(array_merge(['ok' => true], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

function json_err(string $msg, int $code = 400): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// ── GET /api.php ─────────────────────────────────────────────────────────────
if ($method === 'GET') {
    $action = $_GET['action'] ?? '';

    // GET ?action=datasets — list all datasets
    if ($action === 'datasets') {
        if (!file_exists(DB_PATH)) {
            json_ok(['datasets' => []]);
        }
        $stmt = db()->query('SELECT hash, filename, loaded_at FROM datasets ORDER BY loaded_at DESC');
        $datasets = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($datasets as &$d) {
            $d['loaded_at'] = (int)$d['loaded_at'];
        }
        unset($d);
        json_ok(['datasets' => $datasets]);
    }

    // GET ?since=<ms>&hash=<hash> — incremental items for one dataset
    $hash        = $_GET['hash'] ?? '';
    $since       = (int)($_GET['since'] ?? 0);
    $server_time = now_ms();

    if ($hash === '' || !file_exists(DB_PATH)) {
        json_ok(['items' => [], 'server_time' => $server_time]);
    }

    $stmt = db()->prepare(
        'SELECT id, name, checked, updated_at
         FROM participants
         WHERE dataset = ? AND updated_at > ?
         ORDER BY CAST(id AS INTEGER), id'
    );
    $stmt->execute([$hash, $since]);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($items as &$row) {
        $row['checked']    = (bool)$row['checked'];
        $row['updated_at'] = (int)$row['updated_at'];
    }
    unset($row);

    json_ok(['items' => $items, 'server_time' => $server_time]);
}

// ── POST /api.php ─────────────────────────────────────────────────────────────
if ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) json_err('Ungültiger JSON-Body');

    $action = $body['action'] ?? '';

    // Toggle checked state ------------------------------------------------
    if ($action === 'toggle') {
        $id      = isset($body['id'])      ? (string)$body['id']         : null;
        $dataset = isset($body['dataset']) ? (string)$body['dataset']    : null;
        $checked = isset($body['checked']) ? (int)(bool)$body['checked'] : null;
        if ($id === null || $dataset === null || $checked === null) {
            json_err('id, dataset und checked erforderlich');
        }

        $ts   = now_ms();
        $stmt = db()->prepare(
            'UPDATE participants SET checked = ?, updated_at = ? WHERE id = ? AND dataset = ?'
        );
        $stmt->execute([$checked, $ts, $id, $dataset]);
        json_ok(['updated_at' => $ts]);
    }

    // Load CSV → add new dataset (no wipe) --------------------------------
    if ($action === 'load_csv') {
        $content  = $body['content']  ?? null;
        $filename = $body['filename'] ?? 'teilnehmer.csv';
        $hash     = $body['hash']     ?? null;

        if (!$content || !$hash) json_err('content und hash erforderlich');

        $pdo = db();

        // Skip if this exact CSV is already loaded
        $existing = $pdo->prepare('SELECT hash FROM datasets WHERE hash = ?');
        $existing->execute([$hash]);
        if ($existing->fetch()) {
            json_ok(['skipped' => true, 'filename' => $filename]);
        }

        // Parse CSV
        $del   = detect_delimiter($content);
        $lines = array_values(array_filter(
            explode("\n", str_replace("\r", '', $content)),
            static fn($l) => trim($l) !== ''
        ));
        if (empty($lines)) json_err('Leere CSV-Datei');

        $header   = str_getcsv((string)array_shift($lines), $del);
        $id_idx   = array_search('id',   $header, true);
        $name_idx = array_search('name', $header, true);
        if ($id_idx === false || $name_idx === false) {
            json_err('CSV muss Spalten "id" und "name" enthalten');
        }

        $ts = now_ms();

        $pdo->beginTransaction();

        // Register dataset
        $ds_stmt = $pdo->prepare('INSERT OR IGNORE INTO datasets (hash, filename, loaded_at) VALUES (?, ?, ?)');
        $ds_stmt->execute([$hash, $filename, $ts]);

        // Insert participants
        $p_stmt = $pdo->prepare(
            'INSERT OR IGNORE INTO participants (id, dataset, name, checked, updated_at) VALUES (?, ?, ?, 0, ?)'
        );
        $count = 0;
        foreach ($lines as $line) {
            $vals = str_getcsv(trim($line), $del);
            $id   = trim($vals[$id_idx]   ?? '');
            $name = trim($vals[$name_idx] ?? '', " \t\n\r\0\x0B\"");
            if ($id === '') continue;
            $p_stmt->execute([$id, $hash, $name, $ts]);
            $count++;
        }

        $pdo->commit();

        json_ok(['count' => $count, 'filename' => $filename]);
    }

    json_err('Unbekannte Aktion');
}

json_err('Methode nicht erlaubt', 405);
