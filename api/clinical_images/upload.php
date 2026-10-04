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
    imageResponse(false, 'Only doctors can upload clinical images.', null, 403);
}

$patientId = trim((string) ($_POST['patient_id'] ?? ''));
$title = trim((string) ($_POST['title'] ?? ''));
$description = trim((string) ($_POST['description'] ?? ''));
$imageDate = trim((string) ($_POST['image_date'] ?? ''));
$maxSize = 2 * 1024 * 1024;

if ($patientId === '' || $title === '') {
    imageResponse(false, 'Patient and title are required.', null, 422);
}

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $imageDate)) {
    $imageDate = date('Y-m-d');
}

$patientStmt = $conn->prepare('SELECT patient_id FROM tbl_patients WHERE patient_id = ? LIMIT 1');
$patientStmt->bind_param('s', $patientId);
$patientStmt->execute();
$patientExists = $patientStmt->get_result()->num_rows === 1;
$patientStmt->close();

if (!$patientExists) {
    imageResponse(false, 'Patient record was not found.', null, 404);
}

$files = [
    'before' => $_FILES['before_image'] ?? null,
    'after' => $_FILES['after_image'] ?? null,
];

$storedFiles = [];
$uploadDirectory = __DIR__ . '/../../uploads/clinical_images';

if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true) && !is_dir($uploadDirectory)) {
    imageResponse(false, 'Unable to prepare the image storage folder.', null, 500);
}

try {
    foreach ($files as $label => $file) {
        if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
            throw new RuntimeException('Both before and after images are required.');
        }

        if ($file['size'] > $maxSize) {
            throw new RuntimeException('Each image must not exceed 2 MB.');
        }

        $imageInfo = @getimagesize($file['tmp_name']);
        $mime = $imageInfo['mime'] ?? '';

        $extensions = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
        ];

        if (!$imageInfo || !isset($extensions[$mime])) {
            throw new RuntimeException('Only valid JPG, PNG, or WEBP images are allowed.');
        }

        $filename = bin2hex(random_bytes(16)) . '_' . $label . '.' . $extensions[$mime];
        $destination = $uploadDirectory . DIRECTORY_SEPARATOR . $filename;

        if (!move_uploaded_file($file['tmp_name'], $destination)) {
            throw new RuntimeException('Unable to store the uploaded image.');
        }

        $storedFiles[$label] = $destination;
    }

    $beforePath = 'uploads/clinical_images/' . basename($storedFiles['before']);
    $afterPath = 'uploads/clinical_images/' . basename($storedFiles['after']);
    $doctorId = (int) $_SESSION['user_id'];

    $stmt = $conn->prepare('
        INSERT INTO tbl_clinical_images
        (
            patient_id,
            doctor_id,
            title,
            description,
            before_image,
            after_image,
            image_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ');

    if (!$stmt) {
        throw new RuntimeException('Unable to prepare clinical image record.');
    }

    $stmt->bind_param(
        'sisssss',
        $patientId,
        $doctorId,
        $title,
        $description,
        $beforePath,
        $afterPath,
        $imageDate
    );

    if (!$stmt->execute()) {
        $error = $stmt->error;
        $stmt->close();
        throw new RuntimeException('Unable to save clinical image record: ' . $error);
    }

    $imageId = $conn->insert_id;
    $stmt->close();

    $basePath = rtrim(
        str_replace(
            '\\',
            '/',
            dirname(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/clinical_images/upload.php')))
        ),
        '/'
    );

    imageResponse(true, 'Clinical images uploaded.', [
        'id' => $imageId,
        'imageId' => $imageId,
        'patientId' => $patientId,
        'title' => $title,
        'description' => $description,
        'beforeImageData' => $basePath . '/' . $beforePath,
        'afterImageData' => $basePath . '/' . $afterPath,
        'date' => $imageDate,
    ], 201);
} catch (Throwable $exception) {
    foreach ($storedFiles as $storedFile) {
        if (is_file($storedFile)) {
            unlink($storedFile);
        }
    }

    imageResponse(false, $exception->getMessage(), null, 422);
}