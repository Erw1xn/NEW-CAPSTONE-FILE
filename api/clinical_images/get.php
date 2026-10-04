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

$patientId = trim((string) ($_GET['patient_id'] ?? ''));
$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
$userId = (int) $_SESSION['user_id'];

if ($patientId === '') {
    imageResponse(false, 'Patient ID is required.', null, 422);
}

if ($role === 'user') {
    $stmt = $conn->prepare('SELECT patient_id FROM tbl_patients WHERE patient_id = ? AND user_id = ? LIMIT 1');
    $stmt->bind_param('si', $patientId, $userId);
    $stmt->execute();
    $allowed = $stmt->get_result()->num_rows === 1;
    $stmt->close();

    if (!$allowed) {
        imageResponse(false, 'You may access only your own clinical images.', null, 403);
    }
}

$basePath = rtrim(
    str_replace(
        '\\',
        '/',
        dirname(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/clinical_images/get.php')))
    ),
    '/'
);

$stmt = $conn->prepare('
    SELECT
        image_id,
        patient_id,
        title,
        description,
        before_image,
        after_image,
        image_date,
        created_at
    FROM tbl_clinical_images
    WHERE patient_id = ?
    ORDER BY image_date DESC, image_id DESC
');

$stmt->bind_param('s', $patientId);
$stmt->execute();

$result = $stmt->get_result();
$images = [];

while ($row = $result->fetch_assoc()) {
    $beforeImage = (string) $row['before_image'];
    $afterImage = (string) $row['after_image'];

    $images[] = [
        'id' => (int) $row['image_id'],
        'imageId' => (int) $row['image_id'],
        'patientId' => $row['patient_id'],
        'title' => $row['title'],
        'description' => $row['description'],
        'beforeImageData' => preg_match('/^data:image\//', $beforeImage)
            ? $beforeImage
            : $basePath . '/' . ltrim($beforeImage, '/'),
        'afterImageData' => preg_match('/^data:image\//', $afterImage)
            ? $afterImage
            : $basePath . '/' . ltrim($afterImage, '/'),
        'date' => $row['image_date'],
        'createdAt' => $row['created_at'],
    ];
}

$stmt->close();

imageResponse(true, 'Clinical images loaded.', $images);