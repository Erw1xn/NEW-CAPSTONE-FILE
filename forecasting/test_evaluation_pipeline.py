import numpy as np
import pandas as pd

from inventory_demand_forecast import (
    engineer_features,
    evaluate_item,
)


rng = np.random.default_rng(42)

days = 120

dates = pd.date_range(
    start="2026-01-01",
    periods=days,
    freq="D",
)

values = rng.integers(
    0,
    21,
    size=days,
).astype(float)

daily_usage = pd.DataFrame({
    "item": ["EVALUATION TEST ITEM"] * days,
    "date": dates,
    "quantity": values,
})

features = engineer_features(daily_usage)

result = evaluate_item(features)

split_index = int(len(features) * 0.8)

print("=== EVALUATION PIPELINE TEST ===")
print("Raw daily observations:", days)
print("Feature observations:", len(features))
print("Expected 80/20 split index:", split_index)
print("Expected training rows:", split_index)
print("Expected testing rows:", len(features) - split_index)

print("\nEvaluation result:")
print("Model:", result.get("model_name"))
print("Forecast status:", result.get("forecast_status"))
print("Evaluation available:", result.get("evaluation_available"))

print("\nMetrics:")
print("SMA accuracy:", result.get("sma_accuracy"))
print("RF accuracy:", result.get("rf_accuracy"))
print("SMA MAPE:", result.get("sma_mape"))
print("RF MAPE:", result.get("rf_mape"))
print("SMA RMSE:", result.get("sma_rmse"))
print("RF RMSE:", result.get("rf_rmse"))

print("\nForecasts:")
print("SMA forecast:", result.get("sma_forecast"))
print("RF forecast:", result.get("rf_forecast"))
print("Selected forecast:", result.get("forecast"))