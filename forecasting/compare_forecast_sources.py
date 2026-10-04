import argparse
import mysql.connector


def main():
    parser = argparse.ArgumentParser(
        description="Compare treatment consumption against saved demand history."
    )

    parser.add_argument("--db-host", default="127.0.0.1")
    parser.add_argument("--db-port", type=int, default=3307)
    parser.add_argument("--db-user", default="root")
    parser.add_argument("--db-password", default="")
    parser.add_argument("--db-name", default="dental_clinic_system")

    args = parser.parse_args()

    connection = mysql.connector.connect(
        host=args.db_host,
        port=args.db_port,
        user=args.db_user,
        password=args.db_password,
        database=args.db_name,
    )

    try:
        cursor = connection.cursor()

        print("=== FORECAST SOURCE COMPARISON ===")
        print("Database:", args.db_name)
        print()

        print("=== TREATMENT USAGE TABLE SCHEMA ===")

        cursor.execute(
            "SHOW COLUMNS FROM tbl_inventory_treatment_usage"
        )

        for row in cursor.fetchall():
            print(row)

        print()
        print("=== TREATMENT USAGE SUMMARY ===")

        cursor.execute(
            """
            SELECT
                MIN(DATE(created_at)) AS first_date,
                MAX(DATE(created_at)) AS last_date,
                COUNT(*) AS total_rows
            FROM tbl_inventory_treatment_usage
            """
        )

        print(cursor.fetchone())

        print()
        print("=== TREATMENT USAGE BY DATE ===")

        cursor.execute(
            """
            SELECT
                DATE(created_at) AS usage_date,
                COUNT(*) AS records,
                SUM(quantity) AS total_quantity
            FROM tbl_inventory_treatment_usage
            GROUP BY DATE(created_at)
            ORDER BY usage_date
            """
        )

        treatment_dates = cursor.fetchall()

        if not treatment_dates:
            print("No treatment usage records found.")
        else:
            print(
                f"{'DATE':<15}"
                f"{'RECORDS':<12}"
                f"{'TOTAL QTY':<12}"
            )

            for row in treatment_dates:
                print(
                    f"{str(row[0]):<15}"
                    f"{str(row[1]):<12}"
                    f"{str(row[2]):<12}"
                )

        print()
        print("=== SAVED DEMAND HISTORY SUMMARY ===")

        cursor.execute(
            """
            SELECT
                MIN(demand_date) AS first_date,
                MAX(demand_date) AS last_date,
                COUNT(*) AS total_rows
            FROM tbl_inventory_demand_history
            """
        )

        print(cursor.fetchone())

        print()
        print("=== SAVED DEMAND HISTORY BY DATE ===")

        cursor.execute(
            """
            SELECT
                demand_date,
                COUNT(*) AS item_records,
                SUM(total_used) AS total_quantity
            FROM tbl_inventory_demand_history
            GROUP BY demand_date
            ORDER BY demand_date
            """
        )

        history_dates = cursor.fetchall()

        if not history_dates:
            print("No demand history records found.")
        else:
            print(
                f"{'DATE':<15}"
                f"{'ITEM RECORDS':<15}"
                f"{'TOTAL QTY':<12}"
            )

            for row in history_dates:
                print(
                    f"{str(row[0]):<15}"
                    f"{str(row[1]):<15}"
                    f"{str(row[2]):<12}"
                )

        print()
        print("=== POSSIBLE HISTORY-ONLY DATES ===")

        cursor.execute(
            """
            SELECT DISTINCT demand_date
            FROM tbl_inventory_demand_history
            WHERE demand_date NOT IN (
                SELECT DISTINCT DATE(created_at)
                FROM tbl_inventory_treatment_usage
            )
            ORDER BY demand_date
            """
        )

        history_only_dates = cursor.fetchall()

        if not history_only_dates:
            print("None.")
        else:
            for row in history_only_dates:
                print(row[0])

        print()
        print("=== CURRENT TREATMENT-DERIVED ITEMS ===")

        cursor.execute(
            """
            SELECT
                item_id,
                SUM(quantity) AS total_quantity,
                MIN(DATE(created_at)) AS first_date,
                MAX(DATE(created_at)) AS last_date
            FROM tbl_inventory_treatment_usage
            GROUP BY item_id
            ORDER BY item_id
            """
        )

        for row in cursor.fetchall():
            print(row)

        print()
        print("=== SAVED HISTORY ITEMS ===")

        cursor.execute(
            """
            SELECT
                item_name,
                SUM(total_used) AS total_quantity,
                MIN(demand_date) AS first_date,
                MAX(demand_date) AS last_date
            FROM tbl_inventory_demand_history
            GROUP BY item_name
            ORDER BY item_name
            """
        )

        for row in cursor.fetchall():
            print(row)

        print()
        print("Comparison completed.")
        print("No database records were inserted, updated, or deleted.")

    finally:
        connection.close()


if __name__ == "__main__":
    main()