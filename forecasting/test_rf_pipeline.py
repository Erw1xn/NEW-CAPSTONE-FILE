import json
import numpy as np
import pandas as pd

from inventory_demand_forecast import engineer_features, evaluate_item


def main():
    dates = pd.date_range(
        start="2026-01-01",
        periods=90,
        freq="D"
    )

    quantities = np.full(90, 5.0)

    daily_usage = pd.DataFrame({
        "item": ["TEST ITEM"] * 90,
        "date": dates,
        "quantity": quantities,
    })

    print("=== RF PIPELINE TEST ===")
    print(f"Daily observations: {len(daily_usage)}")

    feature_data = engineer_features(daily_usage)

    item_features = feature_data[
        feature_data["item"] == "TEST ITEM"
    ].copy()

    print(f"RF feature rows: {len(item_features)}")

    result = evaluate_item(item_features)

    print("\n=== EVALUATION RESULT ===")
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()