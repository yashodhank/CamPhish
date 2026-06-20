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

$configFile = '/data/config/session.env';
$sessionName = 'default';
$watermarkEnabled = true;
if (file_exists($configFile)) {
    foreach (file($configFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (strpos($line, '=') !== false) {
            list($k, $v) = explode('=', $line, 2);
            if ($k === 'SESSION_NAME') $sessionName = $v;
            if ($k === 'WATERMARK_ENABLED') $watermarkEnabled = ($v === 'true');
        }
    }
}

$filename = '/data/captures/' . $sessionName . '_cam' . $date . '.png';

if ($watermarkEnabled && function_exists('imagecreatefromstring')) {
    $img = @imagecreatefromstring($unencodedData);
    if ($img !== false) {
        $w = imagesx($img);
        $h = imagesy($img);

        $fontSize = max(3, (int)($w / 40));
        $text = $sessionName . ' | ' . date('Y-m-d H:i:s');
        $textW = imagefontwidth($fontSize) * strlen($text);
        $textH = imagefontheight($fontSize);

        $margin = 8;
        $x = $w - $textW - $margin;
        $y = $h - $textH - $margin;

        $overlay = imagecreatetruecolor($textW + $margin * 2, $textH + $margin * 2);
        $bg = imagecolorallocatealpha($overlay, 0, 0, 0, 80);
        imagefilledrectangle($overlay, 0, 0, $textW + $margin * 2, $textH + $margin * 2, $bg);

        $white = imagecolorallocate($overlay, 255, 255, 255);
        imagestring($overlay, $fontSize, $margin, $margin, $text, $white);

        imagecopymerge($img, $overlay, $x - $margin, $y - $margin, 0, 0, $textW + $margin * 2, $textH + $margin * 2, 60);

        imagedestroy($overlay);
        imagepng($img, $filename);
        imagedestroy($img);
    } else {
        file_put_contents($filename, $unencodedData, LOCK_EX);
    }
} else {
    file_put_contents($filename, $unencodedData, LOCK_EX);
}

exit();
