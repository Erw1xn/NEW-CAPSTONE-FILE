<?php

declare(strict_types=1);

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../php/db_connect.php';

function jsonResponse(bool $success, string $message = '', $data = null, int $status = 200): void
{
    http_response_code($status);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function normalizeItemRow(array $row): array
{
    $itemId = (string) ($row['item_id'] ?? $row['id'] ?? '');
    $itemName = (string) ($row['item_name'] ?? $row['name'] ?? '');
    return [
        'id' => $itemId,
        'item_id' => $itemId,
        'name' => $itemName,
        'itemName' => $itemName,
        'category' => (string) ($row['category'] ?? 'Other'),
        'unit' => (string) ($row['unit'] ?? 'unit'),
        'stock' => (float) ($row['stock_quantity'] ?? $row['stock'] ?? 0),
        'stock_quantity' => (float) ($row['stock_quantity'] ?? $row['stock'] ?? 0),
        'minimum' => (float) ($row['reorder_level'] ?? $row['minimum'] ?? 0),
        'reorder_level' => (float) ($row['reorder_level'] ?? $row['minimum'] ?? 0),
        'expiry' => $row['expiry_date'] ?? $row['expiry'] ?? null,
        'createdAt' => $row['created_at'] ?? $row['createdAt'] ?? null,
        'updatedAt' => $row['updated_at'] ?? $row['updatedAt'] ?? null,
    ];
}

function normalizeMovementRow(array $row): array
{
    $itemId = (string) ($row['item_id'] ?? $row['itemId'] ?? '');
    $itemName = (string) ($row['item_name'] ?? $row['itemName'] ?? '');
    return [
        'id' => (string) ($row['movement_id'] ?? $row['id'] ?? ''),
        'movementId' => (string) ($row['movement_id'] ?? $row['id'] ?? ''),
        'itemId' => $itemId,
        'itemName' => $itemName,
        'unit' => (string) ($row['unit'] ?? 'unit'),
        'type' => (string) ($row['movement_type'] ?? $row['type'] ?? 'stock-out'),
        'quantity' => (float) ($row['quantity'] ?? 0),
        'previousStock' => (float) ($row['previous_stock'] ?? 0),
        'newStock' => (float) ($row['new_stock'] ?? 0),
        'reason' => (string) ($row['source'] ?? $row['reason'] ?? 'Inventory movement'),
        'source' => (string) ($row['source'] ?? 'manual-adjustment'),
        'patientId' => $row['patient_id'] ?? null,
        'appointmentId' => $row['appointment_id'] ?? null,
        'date' => $row['movement_date'] ?? $row['date'] ?? $row['created_at'] ?? null,
        'createdAt' => $row['created_at'] ?? $row['createdAt'] ?? $row['movement_date'] ?? null,
    ];
}

if (empty($_SESSION['logged_in']) || empty($_SESSION['user_id'])) {
    jsonResponse(false, 'Authentication required.', null, 401);
}

$conn->query("ALTER TABLE tbl_inventory_items ADD COLUMN IF NOT EXISTS expiry_date DATE NULL AFTER reorder_level");

$method = $_SERVER['REQUEST_METHOD'];
$raw = file_get_contents('php://input');
$input = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
if (!is_array($input)) {
    $input = $_POST;
}
$action = strtolower(trim((string) ($_GET['action'] ?? $input['action'] ?? 'list')));

if ($method === 'GET') {
    $itemsResult = $conn->query("SELECT item_id, item_name, category, unit, stock_quantity, reorder_level, expiry_date, created_at, updated_at FROM tbl_inventory_items ORDER BY item_name ASC");
    $items = [];
    while ($row = $itemsResult ? $itemsResult->fetch_assoc() : null) {
        $items[] = normalizeItemRow($row);
    }

    $movementsResult = $conn->query("SELECT movement_id, item_id, item_name, movement_type, quantity, unit, previous_stock, new_stock, source, appointment_id, patient_id, movement_date, created_at FROM tbl_inventory_movements ORDER BY movement_date DESC, movement_id DESC LIMIT 200");
    $movements = [];
    while ($row = $movementsResult ? $movementsResult->fetch_assoc() : null) {
        $movements[] = normalizeMovementRow($row);
    }

    jsonResponse(true, 'Inventory loaded.', ['items' => $items, 'movements' => $movements]);
}

if ($method !== 'POST') {
    jsonResponse(false, 'Unsupported request method.', null, 405);
}

if ($action === 'list') {
    $itemsResult = $conn->query("SELECT item_id, item_name, category, unit, stock_quantity, reorder_level, expiry_date, created_at, updated_at FROM tbl_inventory_items ORDER BY item_name ASC");
    $items = [];
    while ($row = $itemsResult ? $itemsResult->fetch_assoc() : null) {
        $items[] = normalizeItemRow($row);
    }

    $movementsResult = $conn->query("SELECT movement_id, item_id, item_name, movement_type, quantity, unit, previous_stock, new_stock, source, appointment_id, patient_id, movement_date, created_at FROM tbl_inventory_movements ORDER BY movement_date DESC, movement_id DESC LIMIT 200");
    $movements = [];
    while ($row = $movementsResult ? $movementsResult->fetch_assoc() : null) {
        $movements[] = normalizeMovementRow($row);
    }

    jsonResponse(true, 'Inventory loaded.', ['items' => $items, 'movements' => $movements]);
}

if ($action === 'save_item') {
    $itemId = trim((string) ($input['id'] ?? $input['itemId'] ?? ''));
    $name = trim((string) ($input['name'] ?? $input['itemName'] ?? ''));
    $category = trim((string) ($input['category'] ?? 'Other'));
    $unit = trim((string) ($input['unit'] ?? 'unit'));
    $stock = max(0, (float) ($input['stock'] ?? $input['stock_quantity'] ?? 0));
    $minimum = max(0, (float) ($input['minimum'] ?? $input['reorder_level'] ?? 0));
    $expiry = trim((string) ($input['expiry'] ?? ''));

    if ($name === '') {
        jsonResponse(false, 'Inventory item name is required.', null, 422);
    }

    if ($itemId !== '') {
        $stmt = $conn->prepare('UPDATE tbl_inventory_items SET item_name = ?, category = ?, unit = ?, stock_quantity = ?, reorder_level = ?, expiry_date = ?, updated_at = NOW() WHERE item_id = ?');
        $expiryDate = $expiry !== '' ? $expiry : null;
        $stmt->bind_param('sssddsi', $name, $category, $unit, $stock, $minimum, $expiryDate, (int) $itemId);        $stmt->execute();
        $stmt->close();
    } else {
        $stmt = $conn->prepare('INSERT INTO tbl_inventory_items (item_name, category, unit, stock_quantity, reorder_level, expiry_date) VALUES (?, ?, ?, ?, ?, ?)');
        $expiryDate = $expiry !== '' ? $expiry : null;
        $stmt->bind_param('sssdds', $name, $category, $unit, $stock, $minimum, $expiryDate);        $stmt->execute();
        $itemId = (string) $stmt->insert_id;
        $stmt->close();
    }

    $updated = $conn->query("SELECT item_id, item_name, category, unit, stock_quantity, reorder_level, expiry_date, created_at, updated_at FROM tbl_inventory_items WHERE item_id = {$itemId} LIMIT 1");
    $row = $updated ? $updated->fetch_assoc() : null;
    jsonResponse(true, 'Inventory item saved.', $row ? normalizeItemRow($row) : null);
}

if ($action === 'delete_item') {
    $itemId = trim((string) ($input['id'] ?? $input['itemId'] ?? ''));

    if ($itemId === '' || !ctype_digit($itemId) || (int) $itemId <= 0) {
        jsonResponse(false, 'Valid inventory item ID is required.', null, 422);
    }

    $itemId = (int) $itemId;

    $checkStmt = $conn->prepare(
        'SELECT item_id, item_name FROM tbl_inventory_items WHERE item_id = ? LIMIT 1'
    );
    $checkStmt->bind_param('i', $itemId);
    $checkStmt->execute();
    $item = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if (!$item) {
        jsonResponse(false, 'Inventory item not found.', null, 404);
    }

    $deleteStmt = $conn->prepare(
        'DELETE FROM tbl_inventory_items WHERE item_id = ?'
    );
    $deleteStmt->bind_param('i', $itemId);

    if (!$deleteStmt->execute()) {
        $deleteStmt->close();
        jsonResponse(false, 'Unable to delete inventory item.', null, 500);
    }

    $deleteStmt->close();

    jsonResponse(true, 'Inventory item deleted.', [
        'id' => (string) $itemId,
        'name' => (string) $item['item_name'],
    ]);
}

if ($action === 'record_movement') {
    $itemIdentifier = (string) ($input['itemId'] ?? $input['item_id'] ?? '');
    $itemName = trim((string) ($input['itemName'] ?? $input['name'] ?? ''));
    $type = strtolower(trim((string) ($input['type'] ?? 'stock-in')));
    $quantity = max(0, (float) ($input['quantity'] ?? 0));
    $reason = trim((string) ($input['reason'] ?? 'Inventory adjustment'));
    $patientId = $input['patientId'] ?? null;
    $appointmentId = $input['appointmentId'] ?? null;

    if ($itemIdentifier === '' && $itemName === '') {
        jsonResponse(false, 'Inventory item is required.', null, 422);
    }

    if ($quantity <= 0) {
        jsonResponse(false, 'Movement quantity must be greater than zero.', null, 422);
    }

    if ($itemIdentifier !== '') {
        $itemIdentifierInt = (int) $itemIdentifier;
        $itemSelect = $conn->prepare('SELECT item_id, item_name, stock_quantity, unit FROM tbl_inventory_items WHERE item_id = ? LIMIT 1');
        $itemSelect->bind_param('i', $itemIdentifierInt);
    } else {
        $itemSelect = $conn->prepare('SELECT item_id, item_name, stock_quantity, unit FROM tbl_inventory_items WHERE LOWER(item_name) = LOWER(?) LIMIT 1');
        $itemSelect->bind_param('s', $itemName);
    }
    $itemSelect->execute();
    $item = $itemSelect->get_result()->fetch_assoc();
    $itemSelect->close();

    if (!$item) {
        jsonResponse(false, 'Inventory item not found.', null, 404);
    }

    $previousStock = (float) ($item['stock_quantity'] ?? 0);
    $unit = (string) ($item['unit'] ?? 'unit');
    $newStock = $previousStock;

    if ($type === 'stock-out') {
        if ($quantity > $previousStock) {
            jsonResponse(false, 'Insufficient stock for this movement.', null, 422);
        }
        $newStock = $previousStock - $quantity;
    } else {
        $newStock = $previousStock + $quantity;
    }

    $itemIdForUpdate = (int) $item['item_id'];
    $itemNameForMovement = (string) $item['item_name'];
    $updateStmt = $conn->prepare('UPDATE tbl_inventory_items SET stock_quantity = ?, updated_at = NOW() WHERE item_id = ?');
    $updateStmt->bind_param('di', $newStock, $itemIdForUpdate);
    $updateStmt->execute();
    $updateStmt->close();

    $movementStmt = $conn->prepare('INSERT INTO tbl_inventory_movements (item_id, item_name, movement_type, quantity, unit, previous_stock, new_stock, source, appointment_id, patient_id, movement_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
    $movementType = $type === 'stock-out' ? 'stock-out' : 'stock-in';
    $movementStmt->bind_param('issdsddsis', $itemIdForUpdate, $itemNameForMovement, $movementType, $quantity, $unit, $previousStock, $newStock, $reason, $appointmentId, $patientId);
    $movementStmt->execute();
    $movementStmt->close();

    $list = $conn->query("SELECT item_id, item_name, category, unit, stock_quantity, reorder_level, expiry_date, created_at, updated_at FROM tbl_inventory_items ORDER BY item_name ASC");
    $items = [];
    while ($row = $list->fetch_assoc()) {
        $items[] = normalizeItemRow($row);
    }
    $movements = [];
    $latest = $conn->query("SELECT movement_id, item_id, item_name, movement_type, quantity, unit, previous_stock, new_stock, source, appointment_id, patient_id, movement_date, created_at FROM tbl_inventory_movements ORDER BY movement_date DESC, movement_id DESC LIMIT 200");
    while ($row = $latest->fetch_assoc()) {
        $movements[] = normalizeMovementRow($row);
    }

    jsonResponse(true, 'Inventory movement recorded.', ['items' => $items, 'movements' => $movements]);
}

if ($action === 'deduct_for_treatment') {
    $treatment = $input['treatment'] ?? [];
    $requestedMaterials = is_array($input['requestedMaterials'] ?? null) ? $input['requestedMaterials'] : (is_array($input['materials'] ?? null) ? $input['materials'] : []);
    $patient = $input['patient'] ?? [];

    $patientName = trim((string) ($patient['firstName'] ?? $patient['first_name'] ?? $patient['name'] ?? ''));
    $lastName = trim((string) ($patient['lastName'] ?? $patient['last_name'] ?? ''));
    $patientLabel = trim($patientName . ' ' . $lastName);
    $procedure = trim((string) ($treatment['procedure'] ?? $treatment['treatment'] ?? 'Treatment'));
    $patientId = trim((string) ($treatment['patientId'] ?? $patient['patientId'] ?? $patient['id'] ?? ''));
    $appointmentId = trim((string) ($treatment['appointmentId'] ?? ''));

    if (!$requestedMaterials) {
        jsonResponse(true, 'No consumed materials to deduct.', ['movements' => [], 'unresolvedMaterials' => []]);
    }

    $movements = [];
    $unresolved = [];
    $nowIso = gmdate('Y-m-d H:i:s');

    foreach ($requestedMaterials as $material) {
        $itemName = trim((string) ($material['itemName'] ?? $material['name'] ?? ''));
        $quantity = max(0, (float) ($material['quantity'] ?? 0));
        if ($itemName === '' || $quantity <= 0) {
            continue;
        }

        $stmt = $conn->prepare('SELECT item_id, item_name, stock_quantity, unit FROM tbl_inventory_items WHERE LOWER(item_name) = LOWER(?) LIMIT 1');
        $stmt->bind_param('s', $itemName);
        $stmt->execute();
        $item = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$item) {
            $unresolved[] = [
                'itemName' => $itemName,
                'quantity' => $quantity,
                'unit' => 'unit',
                'available' => 0,
                'status' => 'unregistered',
            ];
            continue;
        }

        $previousStock = (float) ($item['stock_quantity'] ?? 0);
        if ($previousStock < $quantity) {
            $unresolved[] = [
                'itemName' => $itemName,
                'quantity' => $quantity,
                'unit' => (string) ($item['unit'] ?? 'unit'),
                'available' => $previousStock,
                'status' => 'insufficient-stock',
            ];
            continue;
        }

        $newStock = $previousStock - $quantity;
        $itemIdForUpdate = (int) $item['item_id'];
        $itemNameForMovement = (string) $item['item_name'];
        $unitForMovement = (string) ($item['unit'] ?? 'unit');

        $updateStmt = $conn->prepare('UPDATE tbl_inventory_items SET stock_quantity = ?, updated_at = NOW() WHERE item_id = ?');
        $updateStmt->bind_param('di', $newStock, $itemIdForUpdate);
        $updateStmt->execute();
        $updateStmt->close();

        $reason = 'Patient treatment: ' . $procedure . ' (' . $patientLabel . ')';
        $movementStmt = $conn->prepare('INSERT INTO tbl_inventory_movements (item_id, item_name, movement_type, quantity, unit, previous_stock, new_stock, source, appointment_id, patient_id, movement_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())');
        $movementType = 'stock-out';
        $movementStmt->bind_param('issdsddsis', $itemIdForUpdate, $itemNameForMovement, $movementType, $quantity, $unitForMovement, $previousStock, $newStock, $reason, $appointmentId, $patientId);
        $movementStmt->execute();
        $movementId = $movementStmt->insert_id;
        $movementStmt->close();

        $movements[] = [
            'id' => (string) $movementId,
            'itemId' => (string) $item['item_id'],
            'itemName' => (string) $item['item_name'],
            'unit' => (string) ($item['unit'] ?? 'unit'),
            'type' => 'stock-out',
            'quantity' => $quantity,
            'previousStock' => $previousStock,
            'newStock' => $newStock,
            'reason' => $reason,
            'source' => 'clinical-treatment',
            'patientId' => $patientId,
            'appointmentId' => $appointmentId,
            'date' => $nowIso,
            'createdAt' => $nowIso,
        ];
    }

    jsonResponse(true, 'Treatment materials deducted from inventory.', ['movements' => $movements, 'unresolvedMaterials' => $unresolved]);
}

jsonResponse(false, 'Inventory action is not supported.', null, 400);