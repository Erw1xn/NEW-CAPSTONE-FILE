import pandas as pd

from inventory_demand_forecast import (
    build_daily_usage_dataset,
    engineer_features,
)


dates = pd.date_range(
    start="2026-01-01",
    periods=90,
    freq="D",
)

demand_df = pd.DataFrame({
    "item": ["TEST ITEM"] * 90,
    "date": dates,
    "quantity": [5.0] * 90,
    "available_from": [dates[0]] * 90,
})

daily_usage = build_daily_usage_dataset(demand_df)
features = engineer_features(daily_usage)

print("=== FEATURE ENGINEERING TEST ===")
print("Raw demand rows:", len(demand_df))
print("Daily usage rows:", len(daily_usage))
print("Feature rows:", len(features))

print("\nFeature columns:")
print(features.columns.tolist())

print("\nFirst feature row:")
print(features.head(1).to_string(index=False))

print("\nLast feature row:")
print(features.tail(1).to_string(index=False))

print("\nTarget values:")
print(features["target"].head().tolist())