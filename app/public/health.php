<?php
header('Content-Type: application/json');
echo json_encode([
    'status' => 'ok',
    'service' => 'camphish-app',
    'timestamp' => date('c'),
    'php_version' => PHP_VERSION
]);
