<?php
$id = $_GET['id'] ?? '';
if (empty($id)) {
    http_response_code(400);
    exit('Template ID required');
}

$htmlFile = '/data/templates/ai-generated/' . basename($id) . '.html';
if (!file_exists($htmlFile)) {
    http_response_code(404);
    exit('Template not found');
}

$html = file_get_contents($htmlFile);
$html = str_replace('forwarding_link', 'PREVIEW_MODE', $html);
echo $html;
