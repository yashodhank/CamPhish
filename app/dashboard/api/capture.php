<?php
$file = $_GET['file'] ?? null;
if (!$file || !preg_match('/^cam.*\.png$/i', $file)) {
    http_response_code(400);
    exit('Invalid file');
}

$path = '/data/captures/' . basename($file);
if (!file_exists($path)) {
    http_response_code(404);
    exit('File not found');
}

header('Content-Type: image/png');
header('Content-Length: ' . filesize($path));
header('Cache-Control: no-cache');
readfile($path);
