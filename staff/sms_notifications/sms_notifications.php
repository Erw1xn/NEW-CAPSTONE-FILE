<?php
header("Content-Type: application/json; charset=UTF-8");
require_once "../../php/db_connect.php";
require_once "../../php/mailer.php";
require_once "../../php/sms_sender.php";
ensureNotificationSuppressionTable($conn);
if ($_SERVER["REQUEST_METHOD"] === "GET") {
    $action = $_GET["action"] ?? "";
    if ($action === "fetch") {
        fetchNotifications($conn);
    }
    if ($action === "sms_status") {
        syncSMSStatuses($conn);
    }
    if ($action === "suppressed") {
        fetchSuppressedNotifications($conn);
    }
    respond(false, "Invalid action.");
}
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $action = $_GET["action"] ?? "";
    $input = json_decode(file_get_contents("php://input"), true);
    if (!is_array($input)) {
        respond(false, "Invalid request data.");
    }
    if ($action === "save") {
        saveNotifications($conn, $input);
    }
    if ($action === "send") {
        sendNotification($conn, $input);
    }
    if ($action === "delete") {
        deleteNotification($conn, $input);
    }
    respond(false, "Invalid action.");
}
respond(false, "Unsupported request method.");
function respond($success, $message = "", $data = null) {
    $response = ["success" => $success];
    if ($message !== "") {
        $response["message"] = $message;
    }
    if ($data !== null) {
        $response["data"] = $data;
    }
    echo json_encode($response);
    exit;
}
function ensureNotificationSuppressionTable($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS tbl_notification_suppressions (suppression_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,suppression_key VARCHAR(255) NOT NULL,appointment_id BIGINT UNSIGNED NOT NULL,notification_type VARCHAR(100) NOT NULL,channel ENUM('email','sms') NOT NULL,appointment_date DATE DEFAULT NULL,appointment_start_time TIME DEFAULT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (suppression_id),UNIQUE KEY uq_suppression_key (suppression_key),KEY idx_suppression_appointment (appointment_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
    $conn->query($sql);
}
function fetchNotifications($conn) {
    $sql = "SELECT n.notification_id,n.notification_uid,n.appointment_id,n.patient_id,n.doctor_id,n.channel,n.notification_type,n.patient_email,n.patient_phone,n.subject,n.message,n.appointment_date,n.appointment_start_time,n.appointment_end_time,n.duration_minutes,n.scheduled_at,n.status,n.sent_at,n.failed_at,n.failure_reason,n.created_at,n.updated_at,CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,'')) AS patient_name,u.name AS doctor_name,a.service_type AS service_type,a.status AS appointment_status FROM tbl_notifications n LEFT JOIN tbl_patients p ON p.patient_id=n.patient_id LEFT JOIN tbl_users u ON u.user_id=n.doctor_id LEFT JOIN tbl_patient_appointments a ON a.appointment_id=n.appointment_id ORDER BY n.created_at DESC,n.notification_id DESC";
    $result = $conn->query($sql);
    if (!$result) {
        respond(false, "Failed to fetch notifications: " . $conn->error);
    }
    $notifications = [];
    while ($row = $result->fetch_assoc()) {
        $appointmentId = $row["appointment_id"] !== null ? (int)$row["appointment_id"] : null;
        $duration = $row["duration_minutes"] !== null ? (int)$row["duration_minutes"] : null;
        $notification = [
            "id" => $row["notification_uid"],
            "appointmentId" => $appointmentId,
            "patientId" => $row["patient_id"],
            "patientName" => trim($row["patient_name"] ?? ""),
            "phone" => $row["patient_phone"] ?? "",
            "email" => $row["patient_email"] ?? "",
            "channel" => strtolower($row["channel"] ?? "email"),
            "doctorId" => $row["doctor_id"] !== null ? (int)$row["doctor_id"] : null,
            "doctorName" => $row["doctor_name"] ?? "",
            "service" => $row["service_type"] ?? "",
            "duration" => $duration,
            "appointmentEndTime" => $row["appointment_end_time"] ?? "",
            "subject" => $row["subject"] ?? "",
            "message" => $row["message"] ?? "",
            "type" => $row["notification_type"],
            "appointmentType" => $row["notification_type"],
            "appointmentDate" => $row["appointment_date"] ?? "",
            "appointmentTime" => $row["appointment_start_time"] ?? "",
            "status" => $row["status"],
            "deliveryStatus" => $row["status"],
            "createdAt" => $row["created_at"],
            "sentAt" => $row["sent_at"],
            "failedAt" => $row["failed_at"],
            "failureReason" => $row["failure_reason"],
            "source" => "appointment",
            "scheduledFor" => $row["scheduled_at"],
            "isScheduledReminder" => in_array($row["notification_type"], ["Appointment Reminder", "Same-Day Reminder"], true),
            "appointmentSnapshot" => [
                "date" => $row["appointment_date"] ?? "",
                "time" => $row["appointment_start_time"] ?? "",
                "status" => normalizeAppointmentStatus($row["appointment_status"] ?? "")
            ]
        ];
        $notifications[] = $notification;
    }
    respond(true, "", $notifications);
}
function saveNotifications($conn, $input) {
    $notifications = $input["notifications"] ?? [];
    if (!is_array($notifications)) {
        respond(false, "Notifications must be an array.");
    }
    $uniqueNotifications = [];
    foreach ($notifications as $notification) {
        if (!is_array($notification)) {
            continue;
        }
        $appointmentId = trim((string)($notification["appointmentId"] ?? $notification["appointment_id"] ?? ""));
        $channel = strtolower(trim((string)($notification["channel"] ?? "email")));
        $notificationType = trim((string)($notification["type"] ?? $notification["notificationType"] ?? $notification["notification_type"] ?? ""));
        $appointmentDate = normalizeDate($notification["appointmentDate"] ?? $notification["appointment_date"] ?? null);
        $appointmentStartTime = normalizeTime($notification["appointmentTime"] ?? $notification["appointment_time"] ?? $notification["startTime"] ?? $notification["appointment_start_time"] ?? null);
        if ($channel !== "email" && $channel !== "sms") {
            $channel = "email";
        }
        if ($appointmentId !== "" && $notificationType !== "") {
            $uniqueKey = buildNotificationSuppressionKey(
                $appointmentId,
                $notificationType,
                $channel,
                $appointmentDate,
                $appointmentStartTime
            );
        } else {
            $uniqueKey = "UID|" . trim((string)($notification["id"] ?? $notification["notification_uid"] ?? uniqid("", true)));
        }
        $notification["_dedupe_appointment_id"] = $appointmentId;
        $notification["_dedupe_channel"] = $channel;
        $notification["_dedupe_type"] = $notificationType;
        $notification["_dedupe_date"] = $appointmentDate;
        $notification["_dedupe_time"] = $appointmentStartTime;
        $uniqueNotifications[$uniqueKey] = $notification;
    }
    $deduplicatedNotifications = array_values($uniqueNotifications);
    $sql = "INSERT INTO tbl_notifications (notification_uid,appointment_id,patient_id,doctor_id,channel,notification_type,patient_email,patient_phone,subject,message,appointment_date,appointment_start_time,appointment_end_time,duration_minutes,scheduled_at,status,sent_at,failed_at,failure_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE appointment_id=VALUES(appointment_id),patient_id=VALUES(patient_id),doctor_id=VALUES(doctor_id),channel=VALUES(channel),notification_type=VALUES(notification_type),patient_email=VALUES(patient_email),patient_phone=VALUES(patient_phone),subject=VALUES(subject),message=VALUES(message),appointment_date=VALUES(appointment_date),appointment_start_time=VALUES(appointment_start_time),appointment_end_time=VALUES(appointment_end_time),duration_minutes=VALUES(duration_minutes),scheduled_at=VALUES(scheduled_at)";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        respond(false, "Failed to prepare save query: " . $conn->error);
    }
    $saved = 0;
    foreach ($deduplicatedNotifications as $notification) {
        if (!is_array($notification)) {
            continue;
        }
        $appointmentId = resolveAppointmentId($conn, $notification["appointmentId"] ?? $notification["appointment_id"] ?? null);
        $patientId = trim((string)($notification["patientId"] ?? $notification["patient_id"] ?? ""));
        $doctorId = normalizeDoctorId($notification["doctorId"] ?? $notification["doctor_id"] ?? null);
        $channel = strtolower(trim((string)($notification["channel"] ?? "email")));
        $notificationType = trim((string)($notification["type"] ?? $notification["notificationType"] ?? $notification["notification_type"] ?? ""));
        $patientEmail = trim((string)($notification["email"] ?? $notification["patient_email"] ?? ""));
        $patientPhone = trim((string)($notification["phone"] ?? $notification["patient_phone"] ?? ""));
        $subject = trim((string)($notification["subject"] ?? ""));
        $message = trim((string)($notification["message"] ?? ""));
        $appointmentDate = normalizeDate($notification["appointmentDate"] ?? $notification["appointment_date"] ?? null);
        $appointmentStartTime = normalizeTime($notification["appointmentTime"] ?? $notification["appointment_time"] ?? $notification["startTime"] ?? $notification["appointment_start_time"] ?? null);
        $appointmentEndTime = normalizeTime($notification["appointmentEndTime"] ?? $notification["appointment_end_time"] ?? $notification["endTime"] ?? null);
        $duration = normalizeInteger($notification["duration"] ?? $notification["durationMinutes"] ?? $notification["duration_minutes"] ?? null);
        $scheduledAt = normalizeDateTime($notification["scheduledFor"] ?? $notification["scheduled_at"] ?? null);
        $status = normalizeStatus($notification["status"] ?? "Pending");
        $sentAt = normalizeDateTime($notification["sentAt"] ?? $notification["sent_at"] ?? null);
        $failedAt = normalizeDateTime($notification["failedAt"] ?? $notification["failed_at"] ?? null);
        $failureReason = trim((string)($notification["failureReason"] ?? $notification["failure_reason"] ?? ""));
        if ($appointmentId !== null && $notificationType !== "") {
            $suppressionKey = buildNotificationSuppressionKey(
                $appointmentId,
                $notificationType,
                $channel,
                $appointmentDate,
                $appointmentStartTime
            );
            if (isNotificationSuppressed($conn, $suppressionKey)) {
                continue;
            }
            $notificationUid = buildNotificationUid(
                $appointmentId,
                $notificationType,
                $channel,
                $appointmentDate,
                $appointmentStartTime
            );
        } else {
            $notificationUid = trim((string)($notification["id"] ?? $notification["notification_uid"] ?? ""));
        }
        if ($notificationUid === "" || $patientId === "" || $notificationType === "" || $message === "") {
            continue;
        }
        if ($channel !== "email" && $channel !== "sms") {
            $channel = "email";
        }
        $stmt->bind_param("sisisssssssssisssss",$notificationUid,$appointmentId,$patientId,$doctorId,$channel,$notificationType,$patientEmail,$patientPhone,$subject,$message,$appointmentDate,$appointmentStartTime,$appointmentEndTime,$duration,$scheduledAt,$status,$sentAt,$failedAt,$failureReason);
        if ($stmt->execute()) {
            $saved++;
        }
    }
    $stmt->close();
    respond(true, "Notifications saved successfully.", ["saved" => $saved]);
}
function isNotificationSuppressed($conn, $suppressionKey) {
    $sql = "SELECT suppression_id FROM tbl_notification_suppressions WHERE suppression_key=? LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param("s", $suppressionKey);
    $stmt->execute();
    $result = $stmt->get_result();
    $exists = $result && $result->fetch_assoc();
    $stmt->close();
    return (bool)$exists;
}
function sendNotification($conn, $input) {
    $channel = strtolower(trim((string)($input["channel"] ?? "email")));
    if ($channel === "sms") {
        sendNotificationSMS($conn, $input);
        return;
    }
    sendNotificationEmail($conn, $input);
}
function claimNotificationForSending($conn, $notificationUid) {
    $sql = "UPDATE tbl_notifications SET status='Processing',updated_at=NOW() WHERE notification_uid=? AND status='Pending'";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return ["claimed" => false, "status" => null, "error" => $conn->error];
    }
    $stmt->bind_param("s", $notificationUid);
    $stmt->execute();
    $claimed = $stmt->affected_rows === 1;
    $stmt->close();
    if ($claimed) {
        return ["claimed" => true, "status" => "Processing", "error" => null];
    }
    $sql = "SELECT status FROM tbl_notifications WHERE notification_uid=? LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return ["claimed" => false, "status" => null, "error" => $conn->error];
    }
    $stmt->bind_param("s", $notificationUid);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();
    return ["claimed" => false, "status" => $row["status"] ?? null, "error" => null];
}
function sendNotificationEmail($conn, $input) {
    $notificationId = trim((string)($input["id"] ?? ""));
    $email = trim((string)($input["email"] ?? ""));
    $name = trim((string)($input["name"] ?? ""));
    $subject = trim((string)($input["subject"] ?? ""));
    $message = trim((string)($input["message"] ?? ""));
    if ($notificationId === "") {
        respond(false, "Notification ID is required.");
    }
    if ($email === "" || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        markNotificationFailed($conn, $notificationId, "Invalid patient email address.");
        respond(false, "Invalid patient email address.");
    }
    if ($subject === "") {
        $subject = "DentaNueva Dental Clinic Notification";
    }
    if ($message === "") {
        markNotificationFailed($conn, $notificationId, "Notification message is empty.");
        respond(false, "Notification message is empty.");
    }
    $claim = claimNotificationForSending($conn, $notificationId);
    if (!$claim["claimed"]) {
        if ($claim["status"] === "Sent" || $claim["status"] === "Processing") {
            respond(true, "Notification is already processed or currently processing.", ["alreadyProcessed" => true, "status" => $claim["status"]]);
        }
        if ($claim["status"] === "Failed") {
            respond(false, "Notification has already failed. Retry it explicitly.");
        }
        respond(false, $claim["error"] ?? "Notification could not be locked for sending.");
    }
    if ($name === "") {
        $sql = "SELECT CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,'')) AS patient_name FROM tbl_notifications n LEFT JOIN tbl_patients p ON p.patient_id=n.patient_id WHERE n.notification_uid=? LIMIT 1";
        $stmt = $conn->prepare($sql);
        if ($stmt) {
            $stmt->bind_param("s", $notificationId);
            $stmt->execute();
            $result = $stmt->get_result();
            $row = $result ? $result->fetch_assoc() : null;
            $name = trim($row["patient_name"] ?? "");
            $stmt->close();
        }
    }
    $result = sendClinicEmail($email, $name, $subject, $message);
    if ($result["success"]) {
        markNotificationSent($conn, $notificationId);
        respond(true, "Email sent successfully.");
    }
    $failureReason = $result["message"] ?? "Email delivery failed.";
    markNotificationFailed($conn, $notificationId, $failureReason);
    respond(false, $failureReason);
}
function sendNotificationSMS($conn, $input) {
    $notificationId = trim((string)($input["id"] ?? ""));
    $phone = trim((string)($input["phone"] ?? ""));
    $message = trim((string)($input["message"] ?? ""));
    if ($notificationId === "") {
        respond(false, "Notification ID is required.");
    }
    if ($phone === "") {
        markNotificationFailed($conn, $notificationId, "Patient phone number is required.");
        respond(false, "Patient phone number is required.");
    }
    if ($message === "") {
        markNotificationFailed($conn, $notificationId, "SMS message is empty.");
        respond(false, "SMS message is empty.");
    }
    $claim = claimNotificationForSending($conn, $notificationId);
    if (!$claim["claimed"]) {
        if ($claim["status"] === "Sent" || $claim["status"] === "Processing") {
            respond(true, "Notification is already processed or currently processing.", ["alreadyProcessed" => true, "status" => $claim["status"]]);
        }
        if ($claim["status"] === "Failed") {
            respond(false, "Notification has already failed. Retry it explicitly.");
        }
        respond(false, $claim["error"] ?? "Notification could not be locked for sending.");
    }
    $result = sendClinicSMS($phone, $message);
    if ($result["success"]) {
        $providerResponse = $result["response"] ?? null;
        $providerStatus = is_array($providerResponse) ? strtolower(trim((string)($providerResponse["status"] ?? ""))) : "";
        if ($providerStatus === "sent" || $providerStatus === "delivered") {
            markNotificationSent($conn, $notificationId);
            respond(true, "SMS sent successfully.", ["provider_status" => $providerStatus, "response" => $providerResponse]);
        }
        markNotificationProcessing($conn, $notificationId);
        respond(true, "SMS request accepted by SkySMS and queued for delivery.", ["provider_status" => $providerStatus !== "" ? $providerStatus : "pending", "response" => $providerResponse]);
    }
    $failureReason = $result["message"] ?? "SMS delivery failed.";
    markNotificationFailed($conn, $notificationId, $failureReason);
    respond(false, $failureReason);
}
function markNotificationProcessing($conn, $notificationUid) {
    $sql = "UPDATE tbl_notifications SET status='Processing',sent_at=NULL,failed_at=NULL,failure_reason=NULL,updated_at=NOW() WHERE notification_uid=?";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return;
    }
    $stmt->bind_param("s", $notificationUid);
    $stmt->execute();
    $stmt->close();
}
function normalizeSMSPhone($phone) {
    $phone = trim((string)$phone);
    $phone = preg_replace('/[\s\-\(\)]/', '', $phone);
    if ($phone === "") return "";
    if (strpos($phone, "+63") === 0) return $phone;
    if (strpos($phone, "63") === 0 && strlen($phone) === 12) return "+" . $phone;
    if (strpos($phone, "09") === 0 && strlen($phone) === 11) return "+63" . substr($phone, 1);
    if (strpos($phone, "9") === 0 && strlen($phone) === 10) return "+63" . $phone;
    return $phone;
}
function syncSMSStatuses($conn) {
    $config = require __DIR__ . "/../../php/skysms_config.php";
    $apiKey = trim((string)($config["api_key"] ?? ""));
    if ($apiKey === "") {
        respond(false, "SkySMS API key is not configured.");
    }
    $ch = curl_init("https://skysms.skyio.site/api/v1/sms/messages?per_page=100");
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["X-API-Key: " . $apiKey, "Accept: application/json"]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $response = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($response === false) {
        respond(false, $curlError !== "" ? $curlError : "SkySMS status request failed.");
    }
    $data = json_decode($response, true);
    if ($httpCode < 200 || $httpCode >= 300) {
        $errorMessage = "SkySMS status request failed.";
        if (is_array($data)) {
            if (isset($data["message"]) && is_string($data["message"])) $errorMessage = $data["message"];
            elseif (isset($data["error"]) && is_string($data["error"])) $errorMessage = $data["error"];
        }
        respond(false, $errorMessage, $data);
    }
    $messages = [];
    if (is_array($data)) {
        if (isset($data["data"]) && is_array($data["data"])) $messages = $data["data"];
        elseif (isset($data["messages"]) && is_array($data["messages"])) $messages = $data["messages"];
        elseif (isset($data["data"]["messages"]) && is_array($data["data"]["messages"])) $messages = $data["data"]["messages"];
    }
    if (!$messages) {
        respond(true, "SMS statuses synchronized.", ["updated" => 0]);
    }
    $sql = "SELECT notification_uid,patient_phone,message FROM tbl_notifications WHERE channel='sms' AND status='Processing' ORDER BY updated_at ASC,notification_id ASC";
    $result = $conn->query($sql);
    if (!$result) {
        respond(false, "Failed to load processing SMS notifications: " . $conn->error);
    }
    $pending = [];
    while ($row = $result->fetch_assoc()) $pending[] = $row;
    $updated = 0;
    foreach ($pending as $notification) {
        $notificationPhone = normalizeSMSPhone($notification["patient_phone"] ?? "");
        $notificationMessage = trim((string)($notification["message"] ?? ""));
        $matched = null;
        foreach ($messages as $providerMessage) {
            if (!is_array($providerMessage)) continue;
            $providerStatus = strtolower(trim((string)($providerMessage["status"] ?? $providerMessage["delivery_status"] ?? "")));
            if (!in_array($providerStatus, ["sent", "delivered", "failed"], true)) continue;
            $providerPhone = normalizeSMSPhone($providerMessage["phone_number"] ?? $providerMessage["phone"] ?? $providerMessage["recipient"] ?? "");
            $providerText = trim((string)($providerMessage["message"] ?? $providerMessage["body"] ?? ""));
            if ($providerPhone !== "" && $notificationPhone !== "" && $providerPhone !== $notificationPhone) continue;
            if ($providerText !== "" && $notificationMessage !== "" && $providerText !== $notificationMessage) continue;
            $matched = $providerMessage;
            break;
        }
        if (!$matched) continue;
        $providerStatus = strtolower(trim((string)($matched["status"] ?? $matched["delivery_status"] ?? "")));
        if ($providerStatus === "sent" || $providerStatus === "delivered") {
            markNotificationSent($conn, $notification["notification_uid"]);
            $updated++;
        } elseif ($providerStatus === "failed") {
            $reason = trim((string)($matched["failure_reason"] ?? $matched["error"] ?? $matched["message_status_reason"] ?? "SMS delivery failed."));
            markNotificationFailed($conn, $notification["notification_uid"], $reason);
            $updated++;
        }
    }
    respond(true, "SMS statuses synchronized.", ["updated" => $updated]);
}
function markNotificationSent($conn, $notificationUid) {
    $sql = "UPDATE tbl_notifications SET status='Sent',sent_at=NOW(),failed_at=NULL,failure_reason=NULL WHERE notification_uid=?";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return;
    }
    $stmt->bind_param("s", $notificationUid);
    $stmt->execute();
    $stmt->close();
}
function markNotificationFailed($conn, $notificationUid, $reason) {
    $sql = "UPDATE tbl_notifications SET status='Failed',failed_at=NOW(),failure_reason=? WHERE notification_uid=?";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return;
    }
    $stmt->bind_param("ss", $reason, $notificationUid);
    $stmt->execute();
    $stmt->close();
}
function fetchSuppressedNotifications($conn) {
    $sql = "SELECT suppression_key FROM tbl_notification_suppressions";
    $result = $conn->query($sql);
    if (!$result) {
        respond(false, "Failed to load notification suppressions: " . $conn->error);
    }
    $suppressed = [];
    while ($row = $result->fetch_assoc()) {
        $suppressed[] = $row["suppression_key"];
    }
    respond(true, "", $suppressed);
}
function buildNotificationSuppressionKey($appointmentId, $notificationType, $channel, $appointmentDate = null, $appointmentStartTime = null) {
    $base = $appointmentId . "|" . $notificationType . "|" . $channel;
    if (in_array($notificationType, ["Appointment Reminder", "Same-Day Reminder", "Appointment Reschedule"], true)) {
        return $base . "|" . ($appointmentDate ?? "") . "|" . ($appointmentStartTime ?? "");
    }
    return $base;
}
function buildNotificationUid($appointmentId, $notificationType, $channel, $appointmentDate = null, $appointmentStartTime = null) {
    $key = buildNotificationSuppressionKey($appointmentId, $notificationType, $channel, $appointmentDate, $appointmentStartTime);
    $hash1 = 2166136261;
    $hash2 = (2166136261 ^ 0x9e3779b9) & 0xFFFFFFFF;
    $length = strlen($key);
    for ($i = 0; $i < $length; $i++) {
        $code = ord($key[$i]);
        $hash1 = (($hash1 ^ $code) * 16777619) & 0xFFFFFFFF;
        $hash2 = (($hash2 ^ ($code + $i)) * 16777619) & 0xFFFFFFFF;
    }
    return "NTF-" . base_convert((string)$hash1, 10, 36) . "-" . base_convert((string)$hash2, 10, 36);
}
function deleteNotification($conn, $input) {
    $notificationId = trim((string)($input["id"] ?? ""));
    if ($notificationId === "") {
        respond(false, "Notification ID is required.");
    }
    $sql = "SELECT appointment_id,notification_type,channel,appointment_date,appointment_start_time FROM tbl_notifications WHERE notification_uid=? LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        respond(false, "Failed to prepare notification lookup: " . $conn->error);
    }
    $stmt->bind_param("s", $notificationId);
    $stmt->execute();
    $result = $stmt->get_result();
    $notification = $result ? $result->fetch_assoc() : null;
    $stmt->close();
    if (!$notification) {
        respond(false, "Notification record was not found.");
    }
    if ($notification["appointment_id"] !== null) {
        $appointmentId = (int)$notification["appointment_id"];
        $notificationType = (string)$notification["notification_type"];
        $channel = strtolower((string)$notification["channel"]);
        $appointmentDate = $notification["appointment_date"] ?? null;
        $appointmentStartTime = $notification["appointment_start_time"] ?? null;
        $suppressionKey = buildNotificationSuppressionKey(
            $appointmentId,
            $notificationType,
            $channel,
            $appointmentDate,
            $appointmentStartTime
        );
        $insertSql = "INSERT INTO tbl_notification_suppressions (suppression_key,appointment_id,notification_type,channel,appointment_date,appointment_start_time) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE created_at=created_at";
        $insertStmt = $conn->prepare($insertSql);
        if (!$insertStmt) {
            respond(false, "Failed to prepare notification suppression: " . $conn->error);
        }
        $insertStmt->bind_param(
            "sissss",
            $suppressionKey,
            $appointmentId,
            $notificationType,
            $channel,
            $appointmentDate,
            $appointmentStartTime
        );
        if (!$insertStmt->execute()) {
            $insertStmt->close();
            respond(false, "Failed to save notification deletion state.");
        }
        $insertStmt->close();
    }
    $deleteSql = "DELETE FROM tbl_notifications WHERE notification_uid=?";
    $deleteStmt = $conn->prepare($deleteSql);
    if (!$deleteStmt) {
        respond(false, "Failed to prepare delete query: " . $conn->error);
    }
    $deleteStmt->bind_param("s", $notificationId);
    if (!$deleteStmt->execute()) {
        $deleteStmt->close();
        respond(false, "Failed to delete notification.");
    }
    $deleted = $deleteStmt->affected_rows;
    $deleteStmt->close();
    if ($deleted < 1) {
        respond(false, "Notification record was not found.");
    }
    respond(true, "Notification deleted successfully.");
}
function resolveAppointmentId($conn, $value) {
    if ($value === null || $value === "") {
        return null;
    }
    if (is_numeric($value)) {
        return (int)$value;
    }
    $value = trim((string)$value);
    $sql = "SELECT appointment_id FROM tbl_patient_appointments WHERE appointment_uid=? LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return null;
    }
    $stmt->bind_param("s", $value);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();
    return $row ? (int)$row["appointment_id"] : null;
}
function normalizeInteger($value) {
    if ($value === null || $value === "" || !is_numeric($value)) {
        return null;
    }
    return (int)$value;
}
function normalizeDoctorId($value) {
    if ($value === null || $value === "") {
        return null;
    }
    if (is_numeric($value)) {
        return (int)$value;
    }
    $value = trim((string)$value);
    if (preg_match('/(\d+)$/', $value, $matches)) {
        return (int)$matches[1];
    }
    return null;
}
function normalizeDate($value) {
    if ($value === null || $value === "") {
        return null;
    }
    $timestamp = strtotime((string)$value);
    return $timestamp === false ? null : date("Y-m-d", $timestamp);
}
function normalizeTime($value) {
    if ($value === null || $value === "") {
        return null;
    }
    $value = trim((string)$value);
    if (preg_match('/^(\d{1,2}):(\d{2})(?::\d{2})?\s(AM|PM)$/i', $value, $matches)) {
        $hour = (int)$matches[1];
        $minute = (int)$matches[2];
        $period = strtoupper($matches[3]);
        if ($hour === 12) {
            $hour = 0;
        }
        if ($period === "PM") {
            $hour += 12;
        }
        return sprintf("%02d:%02d:%02d", $hour, $minute, 0);
    }
    if (preg_match('/^\d{1,2}:\d{2}(?::\d{2})?$/', $value)) {
        $parts = explode(":", $value);
        $hour = (int)$parts[0];
        $minute = (int)$parts[1];
        $second = isset($parts[2]) ? (int)$parts[2] : 0;
        return sprintf("%02d:%02d:%02d", $hour, $minute, $second);
    }
    $timestamp = strtotime($value);
    return $timestamp === false ? null : date("H:i:s", $timestamp);
}
function normalizeDateTime($value) {
    if ($value === null || $value === "") {
        return null;
    }
    $timestamp = strtotime((string)$value);
    return $timestamp === false ? null : date("Y-m-d H:i:s", $timestamp);
}
function normalizeStatus($value) {
    $value = trim((string)$value);
    return in_array($value, ["Sent", "Failed", "Pending", "Processing"], true) ? $value : "Pending";
}
function normalizeAppointmentStatus($value) {
    $value = strtolower(trim((string)$value));
    if (in_array($value, ["confirmed", "confirm", "scheduled", "schedule", "pending", "waiting"], true)) return "scheduled";
    if (in_array($value, ["cancelled", "canceled", "cancel"], true)) return "cancelled";
    if (in_array($value, ["completed", "complete", "done"], true)) return "completed";
    if (in_array($value, ["checked in", "checkedin", "check in"], true)) return "checkedin";
    if (in_array($value, ["in consultation", "inconsultation"], true)) return "in consultation";
    if (in_array($value, ["no show", "noshow"], true)) return "no-show";
    return $value;
}