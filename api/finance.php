<?php
declare(strict_types=1);

session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../php/db_connect.php';

function financeResponse(bool $success, string $message = '', $data = null, int $status = 200): void
{
    http_response_code($status);
    echo json_encode(['success' => $success, 'message' => $message, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

if (empty($_SESSION['logged_in']) || empty($_SESSION['user_id'])) {
    financeResponse(false, 'Authentication required.', null, 401);
}

$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
if (!in_array($role, ['doctor', 'staff', 'user'], true)) {
    financeResponse(false, 'Authenticated clinic access required.', null, 403);
}
$sessionPatientId = $role === 'user'
    ? 'PN-' . str_pad((string) ((int) $_SESSION['user_id']), 4, '0', STR_PAD_LEFT)
    : '';

function financePayload(array $row): array
{
    $history = json_decode((string) ($row['payment_history'] ?? ''), true);
    return [
        'id' => $row['transaction_id'],
        'invoice' => $row['invoice_number'] ?: $row['transaction_id'],
        'patientId' => $row['patient_id'],
        'patient' => trim((string) (($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? ''))),
        'patientName' => trim((string) (($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? ''))),
        'service' => $row['service'],
        'date' => $row['transaction_date'],
        'time' => $row['transaction_time'],
        'total' => (float) $row['total'],
        'discount' => (float) $row['discount'],
        'paid' => (float) $row['paid'],
        'method' => $row['payment_method'],
        'paymentMethod' => $row['payment_method'],
        'paymentHistory' => is_array($history) ? $history : [],
        'createdAt' => $row['created_at'],
    ];
}

$method = strtoupper($_SERVER['REQUEST_METHOD']);
if ($method === 'GET') {
    $sql = "SELECT f.*, p.first_name, p.last_name FROM tbl_finance_transactions f JOIN tbl_patients p ON p.patient_id = f.patient_id";
    $stmt = null;
    if ($sessionPatientId !== '') {
        $sql .= ' WHERE f.patient_id = ?';
        $stmt = $conn->prepare($sql . ' ORDER BY f.transaction_date DESC, f.transaction_time DESC, f.created_at DESC');
        $stmt->bind_param('s', $sessionPatientId);
        $stmt->execute();
        $result = $stmt->get_result();
    } else {
        $result = $conn->query($sql . ' ORDER BY f.transaction_date DESC, f.transaction_time DESC, f.created_at DESC');
    }
    if (!$result) {
        financeResponse(false, 'Unable to load finance transactions.', null, 500);
    }
    $transactions = [];
    while ($row = $result->fetch_assoc()) {
        $transactions[] = financePayload($row);
    }
    $stmt?->close();
    financeResponse(true, 'Finance transactions loaded.', $transactions);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST;
}

if ($method === 'DELETE') {
    if ($role === 'user') {
        financeResponse(false, 'Patients may not delete transactions.', null, 403);
    }
    $id = trim((string) ($input['id'] ?? $_GET['id'] ?? ''));
    if ($id === '') {
        financeResponse(false, 'Transaction ID is required.', null, 422);
    }
    $stmt = $conn->prepare('DELETE FROM tbl_finance_transactions WHERE transaction_id = ? LIMIT 1');
    $stmt->bind_param('s', $id);
    $stmt->execute();
    $deleted = $stmt->affected_rows;
    $stmt->close();
    financeResponse($deleted === 1, $deleted === 1 ? 'Transaction deleted.' : 'Transaction not found.', null, $deleted === 1 ? 200 : 404);
}

if ($method !== 'POST') {
    financeResponse(false, 'Unsupported request method.', null, 405);
}

$records = $input['transactions'] ?? [$input['transaction'] ?? $input];
if (isset($records['id']) || isset($records['patientId'])) {
    $records = [$records];
}
if (!is_array($records)) {
    financeResponse(false, 'Transactions must be an array.', null, 422);
}

$conn->begin_transaction();
try {
    foreach ($records as $transaction) {
        if (!is_array($transaction)) {
            continue;
        }
        $id = trim((string) ($transaction['id'] ?? ''));
        $patientId = trim((string) ($transaction['patientId'] ?? $transaction['patient_id'] ?? ''));
        $service = trim((string) ($transaction['service'] ?? 'Consultation'));
        if ($id === '' || $patientId === '' || $service === '') {
            continue;
        }
        if ($role === 'user' && $patientId !== $sessionPatientId) {
            throw new RuntimeException('You may update only your own transactions.');
        }
        $invoice = trim((string) ($transaction['invoice'] ?? $transaction['invoiceNumber'] ?? ''));
        $date = trim((string) ($transaction['date'] ?? date('Y-m-d')));
        $time = trim((string) ($transaction['time'] ?? ''));
        $total = (float) ($transaction['total'] ?? 0);
        $discount = (float) ($transaction['discount'] ?? 0);
        $paid = (float) ($transaction['paid'] ?? 0);
        $methodValue = trim((string) ($transaction['paymentMethod'] ?? $transaction['method'] ?? 'Cash'));
        $history = json_encode($transaction['paymentHistory'] ?? [], JSON_UNESCAPED_UNICODE);
        $stmt = $conn->prepare('INSERT INTO tbl_finance_transactions (transaction_id, patient_id, invoice_number, service, transaction_date, transaction_time, total, discount, paid, payment_method, payment_history, created_by) VALUES (?, ?, NULLIF(?, ""), ?, ?, NULLIF(?, ""), ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE patient_id = VALUES(patient_id), invoice_number = VALUES(invoice_number), service = VALUES(service), transaction_date = VALUES(transaction_date), transaction_time = VALUES(transaction_time), total = VALUES(total), discount = VALUES(discount), paid = VALUES(paid), payment_method = VALUES(payment_method), payment_history = VALUES(payment_history), updated_at = NOW()');
        $stmt->bind_param('ssssssdddssi', $id, $patientId, $invoice, $service, $date, $time, $total, $discount, $paid, $methodValue, $history, $_SESSION['user_id']);
        if (!$stmt->execute()) {
            throw new RuntimeException($stmt->error);
        }
        $stmt->close();
    }
    $conn->commit();
} catch (Throwable $exception) {
    $conn->rollback();
    financeResponse(false, 'Unable to save finance transactions.', null, 500);
}

financeResponse(true, 'Finance transactions saved.');