import unittest
from pathlib import Path

import pandas as pd

from forecasting.inventory_demand_forecast import build_treatment_usage_rows, forecast_inventory, load_excel_usage


class ExcelHistoricalDataTest(unittest.TestCase):
    def test_load_excel_historical_usage(self):
        path = Path(__file__).parent.parent / "DentaNueva_Inventory_Historical_Data_4_Months.xlsx"
        rows = load_excel_usage(path)

        self.assertEqual(len(rows), 1845)
        self.assertEqual(rows[0]["itemName"], "Gloves")
        self.assertEqual(rows[0]["quantity"], 13.0)
        self.assertEqual(rows[0]["type"], "stock-out")


class TreatmentUsageRowsTest(unittest.TestCase):
    def test_build_treatment_usage_rows_from_completed_materials(self):
        treatments = [
            {
                "treatment_date": "2024-09-03",
                "consumed_materials": [
                    {"itemName": "Gloves", "quantity": 2},
                    {"itemName": "Cotton Rolls", "quantity": 3},
                ],
            },
            {
                "treatment_date": "2024-09-04",
                "consumed_materials": {
                    "itemName": "Gloves",
                    "quantity": 1,
                },
            },
        ]

        rows = build_treatment_usage_rows(treatments)

        self.assertEqual(rows[0]["itemName"], "Gloves")
        self.assertEqual(rows[0]["quantity"], 2.0)
        self.assertEqual(rows[0]["type"], "stock-out")
        self.assertEqual(rows[1]["itemName"], "Cotton Rolls")
        self.assertEqual(rows[2]["itemName"], "Gloves")
        self.assertEqual(rows[2]["quantity"], 1.0)

    def test_forecast_inventory_reaches_high_accuracy_on_realistic_demand(self):
        dates = pd.date_range("2024-01-01", periods=180, freq="D")
        values = []

        for idx, current_day in enumerate(dates):
            weekday_factor = [2.0, 3.5, 4.0, 5.5, 6.0, 3.0, 2.5][current_day.weekday()]
            trend = 0.08 * idx
            seasonal = 1.5 * ((idx % 14) / 7)
            value = max(0.0, 7.0 + weekday_factor + trend + seasonal)
            values.append(round(value, 2))

        demand_df = pd.DataFrame({
            "item": "Gloves",
            "date": dates,
            "quantity": values,
        })

        summary = forecast_inventory(demand_df)
        self.assertGreater(summary["overall_accuracy"], 80.0)
        self.assertGreater(summary["items"][0]["accuracy"], 80.0)


if __name__ == "__main__":
    unittest.main()