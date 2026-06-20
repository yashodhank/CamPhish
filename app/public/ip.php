<?php
$ipaddress = $_SERVER['HTTP_CLIENT_IP']
    ?? $_SERVER['HTTP_X_FORWARDED_FOR']
    ?? $_SERVER['REMOTE_ADDR']
    ?? 'unknown';

$useragent = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';

$entry = sprintf(
    "[%s] IP: %s | UA: %s\n",
    date('Y-m-d H:i:s'),
    $ipaddress,
    $useragent
);

file_put_contents('/data/logs/ip.txt', $entry, FILE_APPEND | LOCK_EX);
file_put_contents('/data/logs/saved.ip.txt', $entry, FILE_APPEND | LOCK_EX);
