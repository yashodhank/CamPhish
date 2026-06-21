<?php
$file = $_GET['file'] ?? '';
$thumb = isset($_GET['thumb']);
if (!$file || !preg_match('/^[\w.-]+\.(png|webm)$/i', $file)) {
    http_response_code(400);
    exit('Invalid file');
}
$path = '/data/captures/' . basename($file);
if (!file_exists($path)) {
    http_response_code(404);
    exit('Not found');
}

$isVideo = preg_match('/\.webm$/i', $file);
$contentType = $isVideo ? 'video/webm' : 'image/png';
header('Content-Type: ' . $contentType);
header('Content-Length: ' . filesize($path));
header('Cache-Control: public, max-age=3600');

if ($thumb && !$isVideo && function_exists('imagecreatefrompng')) {
    $img = @imagecreatefrompng($path);
    if ($img !== false) {
        $w = imagesx($img); $h = imagesy($img);
        $tw = 200; $th = (int)($h * ($tw / $w));
        $thumbImg = imagecreatetruecolor($tw, $th);
        imagecopyresampled($thumbImg, $img, 0, 0, 0, 0, $tw, $th, $w, $h);
        header('Content-Type: image/png');
        imagepng($thumbImg);
        imagedestroy($img);
        imagedestroy($thumbImg);
        exit;
    }
}

readfile($path);
