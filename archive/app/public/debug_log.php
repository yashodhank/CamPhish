<?php
if (!isset($_POST['message'])) {
    header('Content-Type: application/json');
    echo json_encode(['status' => 'error', 'message' => 'No message provided']);
    exit;
}

$message = $_POST['message'];
$date = date('Y-m-d H:i:s');

$filteredPhrases = [
    "Location data sent",
    "getLocation called",
    "Geolocation error",
    "Location permission denied"
];

$shouldFilter = false;
foreach ($filteredPhrases as $phrase) {
    if (strpos($message, $phrase) !== false) {
        $shouldFilter = true;
        break;
    }
}

if (!$shouldFilter && (
    strpos($message, 'Lat:') !== false ||
    strpos($message, 'Latitude:') !== false ||
    strpos($message, 'Position obtained') !== false
)) {
    file_put_contents('/data/logs/location_debug.log', "[$date] $message\n", FILE_APPEND | LOCK_EX);
    file_put_contents('/data/logs/LocationLog.log', "Location data captured\n", FILE_APPEND | LOCK_EX);
}

header('Content-Type: application/json');
echo json_encode(['status' => 'success']);
