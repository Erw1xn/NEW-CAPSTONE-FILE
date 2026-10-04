<?php
header("Content-Type: application/json; charset=UTF-8");
require_once "../php/db_connect.php";

function response($success, $message)
{
    echo json_encode([
        "success" => $success,
        "message" => $message
    ]);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    response(false, "Invalid request.");
}

$firstname = trim($_POST["firstname"] ?? "");
$lastname = trim($_POST["lastname"] ?? "");
$email = strtolower(trim($_POST["email"] ?? ""));
$password = $_POST["password"] ?? "";
$confirm_password = $_POST["confirm_password"] ?? "";

if (
    $firstname === "" ||
    $lastname === "" ||
    $email === "" ||
    $password === "" ||
    $confirm_password === ""
) {
    response(false, "Please complete all required fields.");
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    response(false, "Please enter a valid email address.");
}

if ($password !== $confirm_password) {
    response(false, "Passwords do not match. Please try again.");
}

if (
    strlen($password) < 8 ||
    !preg_match("/[A-Z]/", $password) ||
    !preg_match("/[0-9]/", $password) ||
    !preg_match("/[^a-zA-Z0-9]/", $password)
) {
    response(false, "Password does not meet all requirements.");
}

$check = $conn->prepare("
    SELECT user_id
    FROM tbl_users
    WHERE LOWER(email) = ?
    LIMIT 1
");

if (!$check) {
    response(false, "Database error while checking the email.");
}

$check->bind_param("s", $email);
$check->execute();
$check->store_result();

if ($check->num_rows > 0) {
    $check->close();
    response(false, "An account with this email already exists! Please log in.");
}

$check->close();

$name = trim($firstname . " " . $lastname);
$hashedPassword = password_hash($password, PASSWORD_DEFAULT);

$role = "user";
$accessLevel = "user";
$status = "Active";

$stmt = $conn->prepare("
    INSERT INTO tbl_users
    (
        firstname,
        lastname,
        name,
        email,
        password,
        role,
        department,
        staff_id,
        access_level,
        status,
        profile_image,
        contact
    )
    VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL)
");

if (!$stmt) {
    response(false, "Database error while creating the account.");
}

$stmt->bind_param(
    "ssssssss",
    $firstname,
    $lastname,
    $name,
    $email,
    $hashedPassword,
    $role,
    $accessLevel,
    $status
);

if (!$stmt->execute()) {
    $stmt->close();
    $conn->close();
    response(false, "Unable to create the account. Please try again.");
}

$userId = $conn->insert_id;
$stmt->close();

$existingPatientStmt = $conn->prepare("
    SELECT patient_id
    FROM tbl_patients
    WHERE user_id = ?
    LIMIT 1
");

if (!$existingPatientStmt) {
    $conn->close();
    response(false, "Database error while checking the patient record.");
}

$existingPatientStmt->bind_param("i", $userId);
$existingPatientStmt->execute();
$existingPatientResult = $existingPatientStmt->get_result();
$existingPatient = $existingPatientResult->fetch_assoc();
$existingPatientStmt->close();

if (!$existingPatient) {
    $nextPatientNumber = 1;

    while (true) {
        $candidatePatientId = "PN-" . str_pad((string) $nextPatientNumber, 4, "0", STR_PAD_LEFT);

        $candidateStmt = $conn->prepare("
            SELECT patient_id
            FROM tbl_patients
            WHERE patient_id = ?
            LIMIT 1
        ");

        if (!$candidateStmt) {
            $conn->close();
            response(false, "Database error while generating the patient ID.");
        }

        $candidateStmt->bind_param("s", $candidatePatientId);
        $candidateStmt->execute();
        $candidateResult = $candidateStmt->get_result();
        $candidateExists = $candidateResult->num_rows > 0;
        $candidateStmt->close();

        if (!$candidateExists) {
            $patientId = $candidatePatientId;
            break;
        }

        $nextPatientNumber++;
    }

    $patientStmt = $conn->prepare("
        INSERT INTO tbl_patients
        (
            patient_id,
            user_id,
            first_name,
            last_name,
            email,
            patient_type,
            status,
            created_by
        )
        VALUES (?, ?, ?, ?, ?, 'registered', 'active', ?)
    ");

    if (!$patientStmt) {
        $conn->close();
        response(false, "Database error while creating the patient record.");
    }

    $patientStmt->bind_param(
        "sisssi",
        $patientId,
        $userId,
        $firstname,
        $lastname,
        $email,
        $userId
    );

    if (!$patientStmt->execute()) {
        $patientStmt->close();
        $conn->close();
        response(false, "Unable to create the patient record. Please try again.");
    }

    $patientStmt->close();
}

$conn->close();

response(
    true,
    "Account created successfully! Redirecting to login..."
);
?>