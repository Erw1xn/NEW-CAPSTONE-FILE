# Inventory Demand Forecasting

This pipeline replaces the legacy JavaScript forecasting scripts with a Python-based demand forecasting workflow for the Dental Clinic System.

## Workflow

1. Inventory movement ledger records are kept as raw operational events.
2. The app aggregates only `stock-out` movements into a daily or weekly demand dataset.
3. The forecast model reads the aggregated demand series, not raw movement rows.
4. A simple moving average baseline is compared with a Random Forest Regressor.
5. Accuracy is measured using MAPE and RMSE.

## Important distinction

Movement Ledger != Forecast Dataset

Raw movement rows such as:

- Sep 22 | Gloves | OUT | 2
- Sep 22 | Gloves | OUT | 2
- Sep 22 | Gloves | OUT | 3
- Sep 22 | Gloves | OUT | 2

must first be aggregated into a time series such as:

- Sep 20 | 7
- Sep 21 | 6
- Sep 22 | 9
- Sep 23 | 8

Only that aggregated dataset is used for training.

## Execution

```bash
pip install -r forecasting/requirements.txt
python forecasting/inventory_demand_forecast.py
```

The script saves a forecast summary JSON to `forecasting/inventory_forecast_summary.json`.
It expects an input JSON file with a list of stock-out movements or falls back to the bundled sample file.

## Database support

The same pipeline can read from MySQL and persist the aggregated demand history.
For the clinic workflow, the preferred source is completed treatment records instead of raw inventory deduction rows.

Run the schema in `database/inventory_forecasting.sql`, then configure the DB connection with environment variables:

```bash
export DB_HOST=127.0.0.1
export DB_PORT=3307
export DB_USER=root
export DB_PASSWORD=""
export DB_NAME=dental_clinic_system

python forecasting/inventory_demand_forecast.py --save-to-db --data-source treatments
```

The script will prefer completed treatment records from `tbl_patient_treatments`, read each treatment's `consumed_materials`, aggregate them by date and item, and save the result into:

- `tbl_inventory_demand_history`
- `tbl_inventory_forecast_runs`

## Accuracy target

The model aims to reach at least 80% accuracy, which is approximated as:

`Accuracy = 100 - MAPE`
