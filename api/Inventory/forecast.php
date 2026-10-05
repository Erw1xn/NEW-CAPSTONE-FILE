<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
require_once __DIR__ . '/../../php/db_connect.php';
function jsonResponse(bool $success,string $message = '',array $data = [],int $statusCode = 200): never {
    http_response_code($statusCode);
    echo json_encode(array_merge(['success' => $success,'message' => $message],$data),JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
if (!isset($conn) || !($conn instanceof mysqli)) {
    jsonResponse(false,'Database connection is unavailable.',[],500);
}
try {
    $forecastSql = "
        SELECT
            latestForecast.forecast_run_id,
            historyItems.item_name,
            latestForecast.forecast_date,
            latestForecast.model_name,
            latestForecast.sma_forecast,
            latestForecast.random_forest_forecast,
            latestForecast.selected_forecast,
            latestForecast.mape,
            latestForecast.rmse,
            latestForecast.accuracy,
            CASE
                WHEN latestForecast.forecast_run_id IS NULL THEN 'insufficient_data'
                WHEN latestForecast.forecast_status IS NULL OR latestForecast.forecast_status = '' THEN 'insufficient_data'
                ELSE latestForecast.forecast_status
            END AS forecast_status,
            COALESCE(latestForecast.evaluation_available,0) AS evaluation_available,
            latestForecast.created_at
        FROM (
            SELECT DISTINCT
                item_name
            FROM tbl_inventory_demand_history
            WHERE source_type IN ('actual','treatment')
        ) historyItems
        LEFT JOIN (
            SELECT
                f.forecast_run_id,
                f.item_name,
                f.forecast_date,
                f.model_name,
                f.sma_forecast,
                f.random_forest_forecast,
                f.selected_forecast,
                f.mape,
                f.rmse,
                f.accuracy,
                f.forecast_status,
                f.evaluation_available,
                f.created_at
            FROM tbl_inventory_forecast_runs f
            INNER JOIN (
                SELECT
                    item_name,
                    MAX(forecast_run_id) AS latest_forecast_run_id
                FROM tbl_inventory_forecast_runs
                GROUP BY item_name
            ) latest
                ON latest.latest_forecast_run_id = f.forecast_run_id
        ) latestForecast
            ON latestForecast.item_name = historyItems.item_name
        ORDER BY historyItems.item_name ASC
    ";
    $forecastResult = $conn->query($forecastSql);
    if (!$forecastResult) {
        throw new RuntimeException('Unable to load inventory forecasts: ' . $conn->error);
    }
    $forecasts = [];
    while ($row = $forecastResult->fetch_assoc()) {
        $forecasts[] = [
            'forecast_id' => $row['forecast_run_id'] !== null ? (int) $row['forecast_run_id'] : null,
            'item_name' => (string) $row['item_name'],
            'forecast_date' => $row['forecast_date'],
            'model_name' => $row['model_name'] !== null ? (string) $row['model_name'] : null,
            'sma_forecast' => $row['sma_forecast'] !== null ? (float) $row['sma_forecast'] : null,
            'random_forest_forecast' => $row['random_forest_forecast'] !== null ? (float) $row['random_forest_forecast'] : null,
            'selected_forecast' => $row['selected_forecast'] !== null ? (float) $row['selected_forecast'] : null,
            'mape' => $row['mape'] !== null ? (float) $row['mape'] : null,
            'rmse' => $row['rmse'] !== null ? (float) $row['rmse'] : null,
            'accuracy' => $row['accuracy'] !== null ? (float) $row['accuracy'] : null,
            'forecast_status' => $row['forecast_status'] !== null ? (string) $row['forecast_status'] : 'insufficient_data',
            'evaluation_available' => (bool) $row['evaluation_available'],
            'created_at' => $row['created_at']
        ];
    }
    $forecastResult->free();
    $historySql = "
        SELECT
            h.item_name,
            h.demand_date,
            h.total_used
        FROM tbl_inventory_demand_history h
        INNER JOIN (
            SELECT
                MAX(demand_date) AS latest_demand_date
            FROM tbl_inventory_demand_history
            WHERE source_type IN ('actual','treatment')
        ) latest
            ON h.demand_date >= DATE_SUB(latest.latest_demand_date,INTERVAL 4 MONTH)
            AND h.demand_date <= latest.latest_demand_date
        WHERE h.source_type IN ('actual','treatment')
        ORDER BY
            h.item_name ASC,
            h.demand_date ASC
    ";
    $historyResult = $conn->query($historySql);
    if (!$historyResult) {
        throw new RuntimeException('Unable to load inventory demand history: ' . $conn->error);
    }
    $history = [];
    $historyByItem = [];
    while ($row = $historyResult->fetch_assoc()) {
        $itemName = (string) $row['item_name'];
        $historyRecord = [
            'item_name' => $itemName,
            'demand_date' => $row['demand_date'],
            'total_used' => (float) $row['total_used']
        ];
        $history[] = $historyRecord;
        if (!isset($historyByItem[$itemName])) {
            $historyByItem[$itemName] = [];
        }
        $historyByItem[$itemName][] = $historyRecord;
    }
    $historyResult->free();
    jsonResponse(true,'Inventory forecasts and demand history loaded successfully.',[
        'forecasts' => $forecasts,
        'history' => $history,
        'history_by_item' => $historyByItem,
        'count' => count($forecasts),
        'history_count' => count($history)
    ]);
} catch (Throwable $e) {
    error_log('Inventory forecast API error: ' . $e->getMessage());
    jsonResponse(false,'Unable to load inventory forecast data.',[],500);
}