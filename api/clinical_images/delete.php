<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require_once __DIR__ . '/../../php/db_connect.php';

function imageResponse(bool $success, string $message = '', $data = null, int $status = 200): void
{
    http_response_code($status);
    echo json_encode(['success' => $success, 'message' => $message, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

if (empty($_SESSION['logged_in']) || empty($_SESSION['user_id'])) {
    imageResponse(false, 'Authentication required.', null, 401);
}

$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));

if ($role !== 'doctor') {
    imageResponse(false, 'Only doctors can delete clinical images.', null, 403);
}

$imageId = (int) ($_POST['image_id'] ?? 0);

if ($imageId < 1) {
    imageResponse(false, 'Image ID is required.', null, 422);
}

$stmt = $conn->prepare('
    SELECT before_image, after_image
    FROM tbl_clinical_images
    WHERE image_id = ?
    LIMIT 1
');

$stmt->bind_param('i', $imageId);
$stmt->execute();

$image = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$image) {
    imageResponse(false, 'Clinical image record was not found.', null, 404);
}

$stmt = $conn->prepare('DELETE FROM tbl_clinical_images WHERE image_id = ?');

if (!$stmt) {
    imageResponse(false, 'Unable to prepare clinical image deletion.', null, 500);
}

$stmt->bind_param('i', $imageId);

if (!$stmt->execute()) {
    $error = $stmt->error;
    $stmt->close();
    imageResponse(false, 'Unable to delete clinical image: ' . $error, null, 500);
}

$stmt->close();

foreach ([$image['before_image'], $image['after_image']] as $path) {
    if (is_string($path) && !preg_match('/^data:image\//', $path)) {
        $file = __DIR__ . '/../../' . ltrim($path, '/');

        if (is_file($file)) {
            unlink($file);
        }
    }
}

imageResponse(true, 'Clinical image deleted.');