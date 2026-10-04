<?php
declare(strict_types=1);

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../php/db_connect.php';

function jsonResponse(bool $success, string $message = '', $data = null, int $status = 200): void
{
    http_response_code($status);
    echo json_encode(['success' => $success, 'message' => $message, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

if (empty($_SESSION['logged_in']) || empty($_SESSION['user_id'])) {
    jsonResponse(false, 'Authentication required.', null, 401);
}

$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
$userId = (int) $_SESSION['user_id'];
$method = $_SERVER['REQUEST_METHOD'];
$requestedPatientId = trim((string) ($_GET['patient_id'] ?? $_POST['patient_id'] ?? ''));

function getRegisteredPatientId(mysqli $conn, int $userId): string
{
    $stmt = $conn->prepare("
        SELECT patient_id
        FROM tbl_patients
        WHERE user_id = ?
        LIMIT 1
    ");

    $stmt->bind_param('i', $userId);
    $stmt->execute();

    $result = $stmt->get_result();
    $existing = $result->fetch_assoc();

    $stmt->close();

    if ($existing && !empty($existing['patient_id'])) {
        $patientId = $existing['patient_id'];

        $stmt = $conn->prepare("
            UPDATE tbl_patients
            SET patient_type = 'registered',
                status = 'active',
                updated_at = NOW()
            WHERE patient_id = ?
            LIMIT 1
        ");

        $stmt->bind_param('s', $patientId);
        $stmt->execute();
        $stmt->close();

        return $patientId;
    }

    $patientId = generateNextPatientId($conn);

    $stmt = $conn->prepare("
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
        SELECT
            ?,
            user_id,
            COALESCE(firstname, ''),
            COALESCE(lastname, ''),
            email,
            'registered',
            'active',
            user_id
        FROM tbl_users
        WHERE user_id = ?
        LIMIT 1
    ");

    $stmt->bind_param('si', $patientId, $userId);

    if (!$stmt->execute()) {
        $stmt->close();
        jsonResponse(false, 'Unable to create the registered patient record.', null, 500);
    }

    $stmt->close();

    return $patientId;
}

function patientRecordExists(mysqli $conn, string $patientId): bool
{
    $stmt = $conn->prepare('SELECT patient_id FROM tbl_patients WHERE patient_id = ? LIMIT 1');
    $stmt->bind_param('s', $patientId);
    $stmt->execute();

    $exists = $stmt->get_result()->num_rows > 0;

    $stmt->close();

    return $exists;
}

function generateNextPatientId(mysqli $conn): string
{
    $result = $conn->query("
        SELECT COALESCE(
            MAX(CAST(SUBSTRING(patient_id, 4) AS UNSIGNED)),
            0
        ) AS highest_id
        FROM tbl_patients
        WHERE patient_id REGEXP '^PN-[0-9]{4}$'
    ");

    $row = $result
        ? $result->fetch_assoc()
        : ['highest_id' => 0];

    $nextId = ((int) ($row['highest_id'] ?? 0)) + 1;

    return 'PN-' . str_pad((string) $nextId, 4, '0', STR_PAD_LEFT);
}

function assertAccess(mysqli $conn, string $patientId, int $userId, string $role): void
{
    if ($role === 'doctor' || $role === 'staff') {
        return;
    }

    $stmt = $conn->prepare('SELECT patient_id FROM tbl_patients WHERE patient_id = ? AND user_id = ? LIMIT 1');
    $stmt->bind_param('si', $patientId, $userId);
    $stmt->execute();

    $allowed = $stmt->get_result()->num_rows === 1;

    $stmt->close();

    if (!$allowed) {
        jsonResponse(false, 'You may access only your own patient record.', null, 403);
    }
}

function assertDoctorPatientAccess(mysqli $conn, string $patientId, int $userId): void
{
    $stmt = $conn->prepare("
        SELECT a.patient_id
        FROM tbl_patient_appointments a
        WHERE a.patient_id = ?
          AND a.doctor_id = ?
        LIMIT 1
    ");

    if (!$stmt) {
        jsonResponse(false, 'Unable to verify doctor patient access.', null, 500);
    }

    $stmt->bind_param('si', $patientId, $userId);
    $stmt->execute();

    $allowed = $stmt->get_result()->num_rows === 1;

    $stmt->close();

    if (!$allowed) {
        jsonResponse(false, 'You may access only patients assigned to you through an appointment.', null, 403);
    }
}

function decodeJsonValue(?string $value): array
{
    $decoded = json_decode((string) $value, true);

    return is_array($decoded) ? $decoded : [];
}

function normalizePhilippinePhone(string $phone): string
{
    $phone = trim($phone);

    if ($phone === '') {
        return '';
    }

    $phone = preg_replace('/[\s\\-\\(\\)]/', '', $phone);

    if (str_starts_with($phone, '+63')) {
        return '+63' . substr(preg_replace('/\D/', '', substr($phone, 3)), 0);
    }

    $digits = preg_replace('/\D/', '', $phone);

    if (str_starts_with($digits, '09') && strlen($digits) === 11) {
        return '+63' . substr($digits, 1);
    }

    if (str_starts_with($digits, '63') && strlen($digits) === 12) {
        return '+' . $digits;
    }

    return $phone;
}

function patientPayload(mysqli $conn, string $patientId): ?array
{
    $stmt = $conn->prepare('SELECT * FROM tbl_patients WHERE patient_id = ? LIMIT 1');
    $stmt->bind_param('s', $patientId);
    $stmt->execute();

    $patient = $stmt->get_result()->fetch_assoc();

    $stmt->close();

    if (!$patient) {
        return null;
    }

    $patient['id'] = $patient['patient_id'];
    $patient['userId'] = $patient['user_id'];
    $patient['firstName'] = $patient['first_name'];
    $patient['lastName'] = $patient['last_name'];
    $patient['fullName'] = trim($patient['first_name'] . ' ' . $patient['last_name']);
    $patient['dateOfBirth'] = $patient['date_of_birth'];
    $patient['patientGender'] = $patient['gender'];
    $patient['emergencyName'] = $patient['emergency_name'];
    $patient['emergencyContact'] = $patient['emergency_contact'];
    $patient['appointments'] = [];
    $patient['treatments'] = [];
    $patient['dentalChart'] = ['teeth' => []];
    $patient['clinicalImages'] = [];

    $stmt = $conn->prepare('SELECT * FROM tbl_medical_forms WHERE patient_id = ? LIMIT 1');
    $stmt->bind_param('s', $patientId);
    $stmt->execute();

    $medical = $stmt->get_result()->fetch_assoc();

    $stmt->close();

    if ($medical) {
        $patient['medicalForm'] = [
            'dentalConcern' => decodeJsonValue($medical['dental_concern']),
            'dentalConcernOther' => $medical['dental_concern_other'],
            'negativeExperience' => $medical['negative_experience'],
            'negativeExperienceNote' => $medical['negative_experience_note'],
            'medLastVisit' => $medical['last_dental_visit'],
            'medLastTreatment' => $medical['last_dental_treatment'],
            'currentMedications' => $medical['current_medications'],
            'currentMedicationsList' => $medical['current_medications_list'],
            'medicalHistory' => decodeJsonValue($medical['medical_history']),
            'medicalOther' => $medical['medical_other'],
            'allergies' => decodeJsonValue($medical['allergies']),
            'allergyOther' => $medical['allergy_other'],
            'consent' => (bool) $medical['consent'],
            'completed' => (bool) $medical['completed'],
            'createdAt' => $medical['created_at'],
            'updatedAt' => $medical['updated_at'],
        ];
    } else {
        $patient['medicalForm'] = null;
    }

    $stmt = $conn->prepare("SELECT a.*, COALESCE(NULLIF(u.doctor_id, ''), CONCAT('DOC-', LPAD(u.user_id, 4, '0'))) AS doctor_code, TRIM(COALESCE(u.name, CONCAT(u.firstname, ' ', u.lastname))) AS doctor_name FROM tbl_patient_appointments a LEFT JOIN tbl_users u ON u.user_id = a.doctor_id WHERE a.patient_id = ? ORDER BY a.appointment_date DESC, a.appointment_time DESC");
    $stmt->bind_param('s', $patientId);
    $stmt->execute();

    $appointments = $stmt->get_result();

    while ($row = $appointments->fetch_assoc()) {
        $patient['appointments'][] = [
            'id' => $row['appointment_uid'] ?: $row['appointment_id'],
            'appointmentId' => $row['appointment_id'],
            'appointment_uid' => $row['appointment_uid'],
            'patientId' => $row['patient_id'],
            'appointment_date' => $row['appointment_date'],
            'appointment_time' => $row['appointment_time'],
            'date' => $row['appointment_date'],
            'start' => $row['appointment_time'],
            'time' => $row['appointment_time'],
            'type' => $row['service_type'],
            'service' => $row['service_type'],
            'duration' => (int) $row['duration_minutes'],
            'dentist' => $row['doctor_code'],
            'dentistId' => $row['doctor_code'],
            'dentist_id' => $row['doctor_code'],
            'doctorId' => $row['doctor_code'],
            'doctor_id' => $row['doctor_code'],
            'dentistName' => $row['doctor_name'],
            'dentist_name' => $row['doctor_name'],
            'doctorName' => $row['doctor_name'],
            'doctor_name' => $row['doctor_name'],
            'status' => $row['status'],
            'checkedIn' => (bool) $row['checked_in'],
            'checkedInAt' => $row['checked_in_at'],
            'reason' => $row['reason'],
            'notes' => $row['notes'],
        ];
    }

    $stmt->close();

    $stmt = $conn->prepare('SELECT * FROM tbl_patient_treatments WHERE patient_id = ? ORDER BY treatment_date DESC, treatment_id DESC');
    $stmt->bind_param('s', $patientId);
    $stmt->execute();

    $treatments = $stmt->get_result();

    while ($row = $treatments->fetch_assoc()) {
        $patient['treatments'][] = [
            'treatmentId' => $row['treatment_id'],
            'appointmentId' => $row['appointment_id'],
            'toothNumber' => $row['tooth_number'],
            'procedure' => $row['procedure_name'],
            'date' => $row['treatment_date'],
            'note' => $row['notes'],
            'consumedMaterials' => decodeJsonValue($row['consumed_materials']),
        ];
    }

    $stmt->close();

    $stmt = $conn->prepare('SELECT * FROM tbl_dental_chart WHERE patient_id = ? ORDER BY recorded_at DESC, dental_chart_id DESC');
    $stmt->bind_param('s', $patientId);
    $stmt->execute();

    $chart = $stmt->get_result();

    while ($row = $chart->fetch_assoc()) {
        $toothNumber = (string) $row['tooth_number'];

        $patient['dentalChart']['teeth'][$toothNumber]['procedure'] = $row['procedure_name'];
        $patient['dentalChart']['teeth'][$toothNumber]['note'] = $row['notes'];
        $patient['dentalChart']['teeth'][$toothNumber]['updatedAt'] = $row['recorded_at'];
    }

    $stmt->close();

    $clinicalImagesBasePath = rtrim(
        str_replace(
            '\\',
            '/',
            dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/patient_records.php'))
        ),
        '/'
    );

    $stmt = $conn->prepare('
        SELECT
            image_id,
            patient_id,
            doctor_id,
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

    $clinicalImages = $stmt->get_result();

    while ($row = $clinicalImages->fetch_assoc()) {
        $beforeImage = (string) ($row['before_image'] ?? '');
        $afterImage = (string) ($row['after_image'] ?? '');

        $patient['clinicalImages'][] = [
            'id' => (int) $row['image_id'],
            'imageId' => (int) $row['image_id'],
            'patientId' => $row['patient_id'],
            'doctorId' => $row['doctor_id'] !== null ? (int) $row['doctor_id'] : null,
            'title' => $row['title'],
            'description' => $row['description'],
            'beforeImage' => $beforeImage,
            'afterImage' => $afterImage,
            'beforeImageData' => preg_match('/^data:image\//', $beforeImage)
                ? $beforeImage
                : ($beforeImage !== '' ? $clinicalImagesBasePath . '/' . ltrim($beforeImage, '/') : ''),
            'afterImageData' => preg_match('/^data:image\//', $afterImage)
                ? $afterImage
                : ($afterImage !== '' ? $clinicalImagesBasePath . '/' . ltrim($afterImage, '/') : ''),
            'date' => $row['image_date'],
            'createdAt' => $row['created_at'],
        ];
    }

    $stmt->close();

    return $patient;
}

if ($method === 'GET') {
    if ($role === 'user') {
        $requestedPatientId = getRegisteredPatientId($conn, $userId);
    }

    if ($requestedPatientId === '') {
        if ($role === 'doctor') {
            $stmt = $conn->prepare("
                SELECT DISTINCT p.patient_id
                FROM tbl_patients p
                INNER JOIN tbl_patient_appointments a
                    ON a.patient_id = p.patient_id
                WHERE p.status = 'active'
                  AND a.doctor_id = ?
                ORDER BY p.last_name, p.first_name
            ");

            if (!$stmt) {
                jsonResponse(false, 'Unable to load doctor patients.', null, 500);
            }

            $stmt->bind_param('i', $userId);
            $stmt->execute();

            $result = $stmt->get_result();
        } else {
            $result = $conn->query("
                SELECT patient_id
                FROM tbl_patients
                WHERE status = 'active'
                ORDER BY last_name, first_name
            ");
        }

        $records = [];

        while ($row = $result->fetch_assoc()) {
            $record = patientPayload($conn, $row['patient_id']);

            if ($record) {
                $records[] = $record;
            }
        }

        if (isset($stmt) && $stmt instanceof mysqli_stmt) {
            $stmt->close();
        }

        jsonResponse(true, 'Patients loaded.', $records);
    }

    if ($role === 'doctor') {
        assertDoctorPatientAccess($conn, $requestedPatientId, $userId);
    } else {
        assertAccess($conn, $requestedPatientId, $userId, $role);
    }

    jsonResponse(
        true,
        'Patient record loaded.',
        patientPayload($conn, $requestedPatientId)
    );
}

if ($method === 'DELETE') {
    if ($role !== 'staff') {
        jsonResponse(false, 'Only staff may delete patient records.', null, 403);
    }

    $input = json_decode(file_get_contents('php://input'), true);

    if (!is_array($input)) {
        $input = $_REQUEST;
    }

    $patientId = trim((string) ($input['patientId'] ?? $requestedPatientId));

    if ($patientId === '') {
        jsonResponse(false, 'Patient ID is required.', null, 422);
    }

    $stmt = $conn->prepare('DELETE FROM tbl_patients WHERE patient_id = ? LIMIT 1');
    $stmt->bind_param('s', $patientId);
    $stmt->execute();

    $deleted = $stmt->affected_rows;

    $stmt->close();

    if ($deleted !== 1) {
        jsonResponse(false, 'Patient record was not found.', null, 404);
    }

    jsonResponse(true, 'Patient record deleted.', ['patientId' => $patientId]);
}

if ($method !== 'POST') {
    jsonResponse(false, 'Unsupported request method.', null, 405);
}

$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input)) {
    $input = $_POST;
}

$patientId = trim((string) ($input['patientId'] ?? $requestedPatientId));

if ($role === 'user') {
    $patientId = getRegisteredPatientId($conn, $userId);
} elseif ($patientId === '') {
    $patientId = generateNextPatientId($conn);
}

if ($role === 'doctor') {
    if ($patientId === '' || !patientRecordExists($conn, $patientId)) {
        jsonResponse(
            false,
            'Patient record was not found.',
            null,
            404
        );
    }

    assertDoctorPatientAccess($conn, $patientId, $userId);
} elseif ($patientId !== '') {
    assertAccess($conn, $patientId, $userId, $role);
}

$patient = $input['patient'] ?? $input;
$medical = $input['medicalForm'] ?? null;

$conn->begin_transaction();

try {
    if (is_array($patient)) {
        $firstName = trim((string) ($patient['firstName'] ?? $patient['firstname'] ?? ''));
        $lastName = trim((string) ($patient['lastName'] ?? $patient['lastname'] ?? ''));
        $dateOfBirth = (string) ($patient['dateOfBirth'] ?? '');
        $gender = (string) ($patient['gender'] ?? $patient['patientGender'] ?? '');
        $phone = normalizePhilippinePhone((string) ($patient['phone'] ?? ''));
        $email = (string) ($patient['email'] ?? '');
        $address = (string) ($patient['address'] ?? '');
        $emergencyName = (string) ($patient['emergencyName'] ?? '');
        $emergencyContact = normalizePhilippinePhone((string) ($patient['emergencyContact'] ?? ''));
        $patientType = $role === 'user' ? 'registered' : 'walk_in';

        $stmt = $conn->prepare('INSERT IGNORE INTO tbl_patients (patient_id, first_name, last_name, date_of_birth, gender, phone, email, address, emergency_name, emergency_contact, patient_type, created_by) VALUES (?, ?, ?, NULLIF(?, ""), ?, ?, ?, ?, ?, ?, ?, ?)');

        $stmt->bind_param('sssssssssssi', $patientId, $firstName, $lastName, $dateOfBirth, $gender, $phone, $email, $address, $emergencyName, $emergencyContact, $patientType, $userId);
        $stmt->execute();
        $stmt->close();
    }

    if (is_array($patient)) {
        $stmt = $conn->prepare('UPDATE tbl_patients SET first_name = COALESCE(NULLIF(?, ""), first_name), last_name = COALESCE(NULLIF(?, ""), last_name), date_of_birth = COALESCE(NULLIF(?, ""), date_of_birth), gender = COALESCE(NULLIF(?, ""), gender), phone = COALESCE(NULLIF(?, ""), phone), email = COALESCE(NULLIF(?, ""), email), address = COALESCE(NULLIF(?, ""), address), emergency_name = COALESCE(NULLIF(?, ""), emergency_name), emergency_contact = COALESCE(NULLIF(?, ""), emergency_contact), updated_at = NOW() WHERE patient_id = ?');

        $stmt->bind_param('ssssssssss', $firstName, $lastName, $dateOfBirth, $gender, $phone, $email, $address, $emergencyName, $emergencyContact, $patientId);
        $stmt->execute();
        $stmt->close();
    }

    if (is_array($medical)) {
        $stmt = $conn->prepare('INSERT INTO tbl_medical_forms (patient_id, dental_concern, dental_concern_other, negative_experience, negative_experience_note, last_dental_visit, last_dental_treatment, current_medications, current_medications_list, medical_history, medical_other, allergies, allergy_other, consent, completed, submitted_by) VALUES (?, ?, ?, ?, ?, NULLIF(?, ""), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE dental_concern = VALUES(dental_concern), dental_concern_other = VALUES(dental_concern_other), negative_experience = VALUES(negative_experience), negative_experience_note = VALUES(negative_experience_note), last_dental_visit = VALUES(last_dental_visit), last_dental_treatment = VALUES(last_dental_treatment), current_medications = VALUES(current_medications), current_medications_list = VALUES(current_medications_list), medical_history = VALUES(medical_history), medical_other = VALUES(medical_other), allergies = VALUES(allergies), allergy_other = VALUES(allergy_other), consent = VALUES(consent), completed = VALUES(completed), submitted_by = VALUES(submitted_by), updated_at = NOW()');

        $dentalConcern = json_encode($medical['dentalConcern'] ?? []);
        $dentalConcernOther = (string) ($medical['dentalConcernOther'] ?? '');
        $negativeExperience = (string) ($medical['negativeExperience'] ?? 'No');
        $negativeExperienceNote = (string) ($medical['negativeExperienceNote'] ?? '');
        $lastVisit = (string) ($medical['medLastVisit'] ?? '');
        $lastTreatment = (string) ($medical['medLastTreatment'] ?? '');
        $currentMedications = (string) ($medical['currentMedications'] ?? 'No');
        $medicationList = (string) ($medical['currentMedicationsList'] ?? '');
        $medicalHistory = json_encode($medical['medicalHistory'] ?? []);
        $medicalOther = (string) ($medical['medicalOther'] ?? '');
        $allergies = json_encode($medical['allergies'] ?? []);
        $allergyOther = (string) ($medical['allergyOther'] ?? '');
        $consent = !empty($medical['consent']) ? 1 : 0;
        $completed = !empty($medical['completed']) ? 1 : 0;

        $stmt->bind_param('sssssssssssssiii', $patientId, $dentalConcern, $dentalConcernOther, $negativeExperience, $negativeExperienceNote, $lastVisit, $lastTreatment, $currentMedications, $medicationList, $medicalHistory, $medicalOther, $allergies, $allergyOther, $consent, $completed, $userId);
        $stmt->execute();
        $stmt->close();
    }

if ($role === 'doctor' && is_array($patient)) {
    if (array_key_exists('treatments', $patient)) {

        $stmt = $conn->prepare('
            INSERT INTO tbl_patient_treatments
            (
                patient_id,
                doctor_id,
                appointment_id,
                tooth_number,
                procedure_name,
                treatment_date,
                notes,
                consumed_materials
            )
            VALUES (?, ?, ?, ?, ?, NULLIF(?, ""), ?, ?)
        ');

        if (!$stmt) {
            throw new RuntimeException('Unable to prepare treatment save.');
        }

        foreach (
            is_array($patient['treatments'])
                ? $patient['treatments']
                : []
            as $treatment
        ) {
            $treatmentId = (int) ($treatment['treatmentId'] ?? 0);

            $appointmentId = trim(
                (string) ($treatment['appointmentId'] ?? '')
            );

            if ($appointmentId === '') {
                throw new RuntimeException(
                    'Appointment is required for every treatment.'
                );
            }

            $toothNumber = trim(
                (string) (
                    $treatment['toothNumber']
                    ?? $treatment['tooth']
                    ?? ''
                )
            );

            $procedureName = trim(
                (string) (
                    $treatment['procedure']
                    ?? $treatment['treatment']
                    ?? 'Dental Treatment'
                )
            );

            $treatmentDate = trim(
                (string) (
                    $treatment['date']
                    ?? $treatment['createdAt']
                    ?? ''
                )
            );

            $treatmentNotes = (string) (
                $treatment['note']
                ?? $treatment['notes']
                ?? ''
            );

            $consumedMaterials = json_encode(
                $treatment['consumedMaterials'] ?? [],
                JSON_UNESCAPED_UNICODE
            );

            $appointmentDbId = (int) $appointmentId;
            if ($treatmentId > 0) {

                $updateStmt = $conn->prepare('
                    UPDATE tbl_patient_treatments
                    SET
                        doctor_id = ?,
                        appointment_id = ?,
                        tooth_number = ?,
                        procedure_name = ?,
                        treatment_date = NULLIF(?, ""),
                        notes = ?,
                        consumed_materials = ?
                    WHERE treatment_id = ?
                      AND patient_id = ?
                ');

                if (!$updateStmt) {
                    throw new RuntimeException(
                        'Unable to prepare treatment update.'
                    );
                }

                $updateStmt->bind_param(
                    'iisssssis',
                    $userId,
                    $appointmentDbId,
                    $toothNumber,
                    $procedureName,
                    $treatmentDate,
                    $treatmentNotes,
                    $consumedMaterials,
                    $treatmentId,
                    $patientId
                );

                $updateStmt->execute();
                $updateStmt->close();

            } else {

                $stmt->bind_param(
                    'siisssss',
                    $patientId,
                    $userId,
                    $appointmentDbId,
                    $toothNumber,
                    $procedureName,
                    $treatmentDate,
                    $treatmentNotes,
                    $consumedMaterials
                );

                $stmt->execute();
            }
        }

        $stmt->close();
    }
}

    $conn->commit();
} catch (Throwable $exception) {
    $conn->rollback();
    jsonResponse(false, 'Unable to save patient record.', null, 500);
}

jsonResponse(true, 'Patient record saved.', patientPayload($conn, $patientId));