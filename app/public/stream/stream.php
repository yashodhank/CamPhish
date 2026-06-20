<?php
$date = date('dMYHis');
$sessionName = 'default';
$configFile = '/data/config/session.env';
if (file_exists($configFile)) {
    foreach (file($configFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (strpos($line, '=') !== false) {
            list($k, $v) = explode('=', $line, 2);
            if ($k === 'SESSION_NAME') $sessionName = $v;
        }
    }
}

$chunkDir = '/data/captures/stream_chunks/';
if (!is_dir($chunkDir)) mkdir($chunkDir, 0755, true);

$action = $_POST['action'] ?? $_GET['action'] ?? '';

if ($action === 'init') {
    $streamId = $sessionName . '_' . date('YmdHis') . '_' . substr(bin2hex(random_bytes(4)), 0, 8);
    $metaFile = $chunkDir . $streamId . '.meta';
    file_put_contents($metaFile, json_encode([
        'stream_id' => $streamId,
        'session' => $sessionName,
        'started_at' => date('c'),
        'chunks' => 0,
        'total_bytes' => 0,
        'status' => 'recording'
    ]), LOCK_EX);
    header('Content-Type: application/json');
    echo json_encode(['status' => 'ok', 'stream_id' => $streamId]);

} elseif ($action === 'chunk') {
    $streamId = $_POST['stream_id'] ?? '';
    $chunkIndex = (int)($_POST['chunk_index'] ?? 0);
    $isLast = ($_POST['is_last'] ?? 'false') === 'true';
    $chunkData = $_POST['data'] ?? '';

    if (empty($streamId) || empty($chunkData)) {
        http_response_code(400);
        exit('Missing stream_id or data');
    }

    $metaFile = $chunkDir . $streamId . '.meta';
    if (!file_exists($metaFile)) {
        http_response_code(404);
        exit('Stream not found');
    }

    $decoded = base64_decode($chunkData);
    if ($decoded === false) {
        http_response_code(400);
        exit('Invalid chunk data');
    }

    $chunkFile = $chunkDir . $streamId . '_' . str_pad($chunkIndex, 6, '0', STR_PAD_LEFT) . '.chunk';
    file_put_contents($chunkFile, $decoded, LOCK_EX);

    $meta = json_decode(file_get_contents($metaFile), true);
    $meta['chunks'] = max($meta['chunks'], $chunkIndex + 1);
    $meta['total_bytes'] += strlen($decoded);
    file_put_contents($metaFile, json_encode($meta), LOCK_EX);

    if ($isLast) {
        $meta['status'] = 'assembling';
        file_put_contents($metaFile, json_encode($meta), LOCK_EX);

        $outputFile = '/data/captures/' . $sessionName . '_stream_' . $streamId . '.webm';
        $out = fopen($outputFile, 'wb');
        if ($out) {
            for ($i = 0; $i < $meta['chunks']; $i++) {
                $cf = $chunkDir . $streamId . '_' . str_pad($i, 6, '0', STR_PAD_LEFT) . '.chunk';
                if (file_exists($cf)) {
                    fwrite($out, file_get_contents($cf));
                    unlink($cf);
                }
            }
            fclose($out);
        }

        $meta['status'] = 'complete';
        $meta['output_file'] = $outputFile;
        $meta['completed_at'] = date('c');
        file_put_contents($metaFile, json_encode($meta), LOCK_EX);

        file_put_contents('/data/logs/Log.log', "Stream completed: {$streamId} at " . date('c') . "\n", FILE_APPEND | LOCK_EX);
    }

    header('Content-Type: application/json');
    echo json_encode(['status' => 'ok', 'chunks_received' => $meta['chunks'], 'is_last' => $isLast]);

} elseif ($action === 'status') {
    $streamId = $_GET['stream_id'] ?? '';
    $metaFile = $chunkDir . $streamId . '.meta';
    if (!file_exists($metaFile)) {
        http_response_code(404);
        echo json_encode(['error' => 'Stream not found']);
        exit;
    }
    header('Content-Type: application/json');
    echo file_get_contents($metaFile);

} else {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Unknown action: ' . $action]);
}
