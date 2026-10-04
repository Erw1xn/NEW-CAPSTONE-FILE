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
    "item": ["NEXT DAY TEST ITEM"] * days,
    "date": dates,
    "quantity": values,
})

features = engineer_features(daily_usage)

result = evaluate_item(features)

last_historical_date = pd.Timestamp(
    daily_usage["date"].max()
)

expected_forecast_date = (
    last_historical_date + pd.Timedelta(days=1)
)

print("=== NEXT-DAY FORECAST TEST ===")
print("Last historical date:", last_historical_date.date())
print("Expected forecast date:", expected_forecast_date.date())

print("\nEvaluation:")
print("Evaluation available:", result.get("evaluation_available"))
print("Model:", result.get("model_name"))
print("Forecast status:", result.get("forecast_status"))

print("\nForecast:")
print("Selected forecast:", result.get("forecast"))
print("SMA forecast:", result.get("sma_forecast"))
print("RF forecast:", result.get("rf_forecast"))

print("\nExpected forecast horizon: 1 day")