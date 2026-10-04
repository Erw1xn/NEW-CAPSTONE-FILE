<?php
session_start();
header("Content-Type: application/json; charset=UTF-8");
require_once "../php/db_connect.php";

function response($success, $message, $user = null, $redirect = null)
{
    echo json_encode([
        "success" => $success,
        "message" => $message,
        "user" => $user,
        "redirect" => $redirect
    ]);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    response(false, "Invalid request.");
}

$email = strtolower(trim($_POST["email"] ?? ""));
$password = $_POST["password"] ?? "";
$remember = isset($_POST["remember"]) && $_POST["remember"] === "1";

if ($email === "" || $password === "") {
    response(false, "Please enter your email and password.");
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    response(false, "Please enter a valid email address.");
}

$stmt = $conn->prepare("
    SELECT
        user_id,
        firstname,
        lastname,
        name,
        email,
        password,
        role,
        department,
        staff_id,
        doctor_id,
        specialization,
        access_level,
        status,
        profile_image,
        contact
    FROM tbl_users
    WHERE LOWER(email) = ?
    LIMIT 1
");

if (!$stmt) {
    response(false, "Database error while checking your account.");
}

$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();

if (!$result || $result->num_rows === 0) {
    $stmt->close();
    $conn->close();
    response(false, "Account not found. Please check your email and try again.");
}

$user = $result->fetch_assoc();
$stmt->close();

if (!password_verify($password, $user["password"])) {
    $conn->close();
    response(false, "Email or password is incorrect. Please try again.");
}

if (isset($user["status"]) && strtolower(trim($user["status"])) !== "active") {
    $conn->close();
    response(false, "Your account is currently inactive. Please contact the administrator.");
}

$role = strtolower(trim($user["role"] ?? "user"));

if ($role !== "user" && $role !== "staff" && $role !== "doctor") {
    $conn->close();
    response(false, "Your account has an invalid role. Please contact the administrator.");
}

$userId = (int) $user["user_id"];
$patientId = null;
$staffId = $role === "staff" ? "STF-" . str_pad((string) $userId, 4, "0", STR_PAD_LEFT) : null;
$doctorId = $role === "doctor" ? "DOC-" . str_pad((string) $userId, 4, "0", STR_PAD_LEFT) : null;

$identityStmt = $conn->prepare("
    UPDATE tbl_users
    SET staff_id = ?, doctor_id = ?
    WHERE user_id = ?
    LIMIT 1
");

if (!$identityStmt) {
    $conn->close();
    response(false, "Database error while updating account identity.");
}

$identityStmt->bind_param("ssi", $staffId, $doctorId, $userId);
$identityStmt->execute();
$identityStmt->close();

if ($role === "user") {
    $existingPatientStmt = $conn->prepare("
        SELECT patient_id
        FROM tbl_patients
        WHERE user_id = ?
        LIMIT 1
    ");

    if (!$existingPatientStmt) {
        $conn->close();
        response(false, "Database error while checking your patient record.");
    }

    $existingPatientStmt->bind_param("i", $userId);
    $existingPatientStmt->execute();
    $existingPatient = $existingPatientStmt->get_result()->fetch_assoc();
    $existingPatientStmt->close();

    if ($existingPatient) {
        $patientId = $existingPatient["patient_id"];

        $activatePatientStmt = $conn->prepare("
UPDATE tbl_patients
SET
    patient_type = 'registered',
    status = 'active',
    first_name = ?,
    last_name = ?,
    email = ?
WHERE user_id = ?
LIMIT 1
        ");

        if ($activatePatientStmt) {
            $activatePatientStmt->bind_param(
                "sssi",
                $user["firstname"],
                $user["lastname"],
                $user["email"],
                $userId
            );
            $activatePatientStmt->execute();
            $activatePatientStmt->close();
        }
    } else {
        $nextPatientNumber = 1;

        while (true) {
            $candidatePatientId = "PN-" . str_pad(
                (string) $nextPatientNumber,
                4,
                "0",
                STR_PAD_LEFT
            );

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
            $candidateExists = $candidateStmt->get_result()->num_rows === 1;
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
            response(false, "Database error while creating your patient record.");
        }

        $patientStmt->bind_param(
            "sisssi",
            $patientId,
            $userId,
            $user["firstname"],
            $user["lastname"],
            $user["email"],
            $userId
        );

        if (!$patientStmt->execute()) {
            $patientStmt->close();
            $conn->close();
            response(false, "Unable to create your patient record. Please try again.");
        }

        $patientStmt->close();
    }
} else {
    $archivePatientStmt = $conn->prepare("
        UPDATE tbl_patients
        SET status = 'inactive'
        WHERE user_id = ?
        LIMIT 1
    ");

    if ($archivePatientStmt) {
        $archivePatientStmt->bind_param("i", $userId);
        $archivePatientStmt->execute();
        $archivePatientStmt->close();
    }
}

$user["staff_id"] = $staffId;
$user["doctor_id"] = $doctorId;
$user["patient_id"] = $patientId;

session_regenerate_id(true);

$_SESSION["logged_in"] = true;
$_SESSION["user_id"] = $userId;
$_SESSION["firstname"] = $user["firstname"];
$_SESSION["lastname"] = $user["lastname"];
$_SESSION["name"] = $user["name"];
$_SESSION["email"] = $user["email"];
$_SESSION["role"] = $role;
$_SESSION["department"] = $user["department"];
$_SESSION["staff_id"] = $user["staff_id"];
$_SESSION["doctor_id"] = $user["doctor_id"];
$_SESSION["patient_id"] = $patientId;
$_SESSION["specialization"] = $user["specialization"];
$_SESSION["access_level"] = $user["access_level"];
$_SESSION["status"] = $user["status"];
$_SESSION["profile_image"] = $user["profile_image"];
$_SESSION["contact"] = $user["contact"];

if ($remember) {
    ini_set("session.gc_maxlifetime", 2592000);

    setcookie(
        session_name(),
        session_id(),
        time() + 2592000,
        "/",
        "",
        false,
        true
    );
}

unset($user["password"]);

$redirect = "../homepage/homepage.html";

if ($role === "user") {
    $redirect = "../patients/dashboard/dashboard.html";
}

if ($role === "staff") {
    $redirect = "../staff/dashboard/dashboard.html";
}

if ($role === "doctor") {
    $redirect = "../doctor/dashboard/dashboard.html";
}

$conn->close();

response(
    true,
    "Login successful! Redirecting...",
    $user,
    $redirect
);
?>