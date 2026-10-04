-- Inventory demand forecasting database schema
-- Run this in the dental_clinic_system database.

CREATE TABLE IF NOT EXISTS tbl_inventory_items (
    item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    item_name VARCHAR(150) NOT NULL,
    category VARCHAR(120) NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'unit',
    stock_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    reorder_level DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (item_id),
    UNIQUE KEY uq_inventory_items_name (item_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tbl_inventory_movements (
    movement_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    item_id BIGINT UNSIGNED NULL,
    item_name VARCHAR(150) NOT NULL,
    movement_type ENUM('stock-in', 'stock-out', 'OUT', 'IN') NOT NULL DEFAULT 'stock-out',
    quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    unit VARCHAR(50) NOT NULL DEFAULT 'unit',
    previous_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
    new_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
    source VARCHAR(80) NULL,
    treatment_id BIGINT UNSIGNED NULL,
    appointment_id BIGINT UNSIGNED NULL,
    patient_id VARCHAR(20) NULL,
    movement_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (movement_id),
    KEY idx_inventory_movements_item (item_id, item_name),
    KEY idx_inventory_movements_date (movement_date),
    CONSTRAINT fk_inventory_movements_item FOREIGN KEY (item_id) REFERENCES tbl_inventory_items(item_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tbl_inventory_demand_history (
    history_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    item_name VARCHAR(150) NOT NULL,
    demand_date DATE NOT NULL,
    total_used DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (history_id),
    UNIQUE KEY uq_inventory_demand_history (item_name, demand_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tbl_inventory_forecast_runs (
    forecast_run_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    item_name VARCHAR(150) NOT NULL,
    forecast_date DATE NULL,
    model_name VARCHAR(120) NOT NULL,
    sma_forecast DECIMAL(10,2) NULL,
    random_forest_forecast DECIMAL(10,2) NULL,
    mape DECIMAL(10,2) NULL,
    rmse DECIMAL(10,2) NULL,
    accuracy DECIMAL(10,2) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (forecast_run_id),
    KEY idx_inventory_forecast_runs_item (item_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: example seed for inventory items
INSERT INTO tbl_inventory_items (item_name, category, unit, stock_quantity, reorder_level)
SELECT * FROM (
    SELECT 'Gloves' AS item_name, 'Disposable Supplies' AS category, 'box' AS unit, 100 AS stock_quantity, 20 AS reorder_level
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM tbl_inventory_items WHERE item_name = 'Gloves');

INSERT INTO tbl_inventory_items (item_name, category, unit, stock_quantity, reorder_level)
SELECT * FROM (
    SELECT 'Cotton Rolls' AS item_name, 'Disposable Supplies' AS category, 'pack' AS unit, 50 AS stock_quantity, 10 AS reorder_level
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM tbl_inventory_items WHERE item_name = 'Cotton Rolls');