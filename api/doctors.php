<?php
declare(strict_types=1);

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../php/db_connect.php';

if (empty($_SESSION['logged_in']) || empty($_SESSION['user_id'])) {
    http_response_code(401);

    echo json_encode([
        'success' => false,
        'message' => 'Authentication required.'
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

$sql = "
    SELECT
        user_id,
        firstname,
        lastname,
        name,
        email,
        doctor_id,
        specialization,
        profile_image,
        contact,
        status
    FROM tbl_users
WHERE LOWER(TRIM(role)) = 'doctor'
    ORDER BY lastname, firstname, user_id
";

$result = $conn->query($sql);

if (!$result) {
    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Unable to load doctors.',
        'error' => $conn->error
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

$doctors = [];

while ($doctor = $result->fetch_assoc()) {
    $userId = (int) $doctor['user_id'];

    $doctorId = trim((string) ($doctor['doctor_id'] ?? ''));

    if ($doctorId === '') {
        $doctorId = 'DOC-' . str_pad(
            (string) $userId,
            4,
            '0',
            STR_PAD_LEFT
        );
    }

    $firstName = trim((string) ($doctor['firstname'] ?? ''));
    $lastName = trim((string) ($doctor['lastname'] ?? ''));
    $databaseName = trim((string) ($doctor['name'] ?? ''));

    $name = $databaseName !== ''
        ? $databaseName
        : trim($firstName . ' ' . $lastName);

    $specialization = trim(
        (string) ($doctor['specialization'] ?? '')
    );

    if ($specialization === '') {
        $specialization = 'General Dentistry';
    }

    $doctors[] = [
        'id' => $userId,
        'user_id' => $userId,

        'doctor_id' => $doctorId,
        'doctorId' => $doctorId,

        'firstname' => $firstName,
        'lastname' => $lastName,

        'name' => $name,
        'fullName' => $name,

        'email' => (string) ($doctor['email'] ?? ''),

        'specialization' => $specialization,

        'profile_image' => (string) ($doctor['profile_image'] ?? ''),

        'contact' => (string) ($doctor['contact'] ?? ''),

        'status' => strtolower(trim((string) ($doctor['status'] ?? 'active'))),

        'role' => 'doctor'
    ];
}

echo json_encode(
    [
        'success' => true,
        'data' => $doctors
    ],
    JSON_UNESCAPED_UNICODE
);