import argparse
import json
import pandas as pd

from inventory_demand_forecast import (
    load_treatment_usage_from_database,
    build_daily_usage_dataset,
)


def main():
    parser = argparse.ArgumentParser(
        description="Inspect actual completed-treatment forecasting history."
    )

    parser.add_argument("--db-host", default="127.0.0.1")
    parser.add_argument("--db-port", type=int, default=3307)
    parser.add_argument("--db-user", default="root")
    parser.add_argument("--db-password", default="")
    parser.add_argument("--db-name", default="dental_clinic_system")

    args = parser.parse_args()

    db_config = {
        "host": args.db_host,
        "port": args.db_port,
        "user": args.db_user,
        "password": args.db_password,
        "database": args.db_name,
    }

    print("=== FORECAST HISTORY INSPECTION ===")
    print("Source: completed treatment consumption")
    print("Database:", args.db_name)
    print()

    treatment_rows = load_treatment_usage_from_database(db_config)

    print("=== RAW TREATMENT USAGE ===")
    print("Total treatment-consumption rows:", len(treatment_rows))

    if not treatment_rows:
        print("No treatment-consumption data found.")
        return

    raw_df = pd.DataFrame(treatment_rows)
    print()
    print("=== ACTUAL DATABASE LOADER COLUMNS ===")
    print(list(raw_df.columns))

    if "date" in raw_df.columns:
        raw_df["date"] = pd.to_datetime(
            raw_df["date"],
            errors="coerce",
        )

    print()

    if "consumptionDate" in raw_df.columns:
        valid_dates = raw_df["date"].dropna()

        if not valid_dates.empty:
            print("Earliest consumption date:", valid_dates.min().date())
            print("Latest consumption date:", valid_dates.max().date())

    if "itemName" in raw_df.columns:
        print()
        print("=== RAW CONSUMPTION BY ITEM ===")

        item_summary = (
            raw_df.groupby("itemName", dropna=False)
            .agg(
                records=("itemName", "size"),
                total_quantity=("quantity", "sum"),
                first_date=("date", "min"),
                last_date=("date", "max"),
            )
            .reset_index()
            .sort_values("itemName")
        )

        print(item_summary.to_string(index=False))

    daily_input = raw_df.rename(
        columns={
            "itemName": "item",
            "availableFrom": "available_from",
        }
    )
    daily_usage = build_daily_usage_dataset(daily_input)

    print()
    print("=== DAILY DEMAND DATASET ===")
    print("Total daily demand rows:", len(daily_usage))

    if daily_usage.empty:
        print("No daily demand data generated.")
        return

    print()

    daily_usage["date"] = pd.to_datetime(
        daily_usage["date"],
        errors="coerce",
    )

    daily_summary = (
        daily_usage.groupby("item", dropna=False)
        .agg(
            daily_records=("date", "size"),
            total_demand=("quantity", "sum"),
            first_date=("date", "min"),
            last_date=("date", "max"),
        )
        .reset_index()
        .sort_values("item")
    )

    print(daily_summary.to_string(index=False))

    print()
    print("=== DAILY DEMAND DETAILS ===")
    print(
        daily_usage[
            ["item", "date", "quantity"]
        ].to_string(index=False)
    )

    print()
    print("=== HISTORY CHECK ===")

    for _, row in daily_summary.iterrows():
        print(
            f'{row["item"]}: '
            f'{int(row["daily_records"])} daily observations | '
            f'{row["first_date"].date()} → {row["last_date"].date()}'
        )

    print()
    print("Inspection completed.")
    print("No database records were inserted, updated, or deleted.")


if __name__ == "__main__":
    main()