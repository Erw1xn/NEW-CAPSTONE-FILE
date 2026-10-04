import numpy as np
import pandas as pd

from inventory_demand_forecast import (
    evaluate_item,
    MIN_DAILY_HISTORY_FOR_RF,
)

rng = np.random.default_rng(42)

days = MIN_DAILY_HISTORY_FOR_RF + 50

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

frame = pd.DataFrame({
    "item": ["RF FALLBACK TEST"] * days,
    "date": dates,
    "target": values,
})

for lag in range(1, 8):
    frame[f"lag_{lag}"] = pd.Series(values).shift(lag)

frame["rolling_7"] = pd.Series(values).rolling(7).mean()
frame["rolling_14"] = pd.Series(values).rolling(14).mean()
frame["rolling_28"] = pd.Series(values).rolling(28).mean()

frame["day_of_week"] = dates.dayofweek
frame["day_of_month"] = dates.day
frame["month"] = dates.month

frame = frame.dropna().reset_index(drop=True)

result = evaluate_item(frame)

print("=== PRODUCTION RF FALLBACK TEST ===")
print("Required daily observations:", MIN_DAILY_HISTORY_FOR_RF)
print("Input daily observations:", len(frame))
print("Model:", result.get("model_name"))
print("Forecast status:", result.get("forecast_status"))
print("Evaluation available:", result.get("evaluation_available"))
print("RF accuracy:", result.get("rf_accuracy"))
print("SMA accuracy:", result.get("sma_accuracy"))
print("RF forecast:", result.get("rf_forecast"))
print("SMA forecast:", result.get("sma_forecast"))
print("Selected forecast:", result.get("forecast"))