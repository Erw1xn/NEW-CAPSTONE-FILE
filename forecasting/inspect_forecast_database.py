import argparse
import mysql.connector


def print_table(cursor, table_name):
    print()
    print(f"=== {table_name} SCHEMA ===")

    cursor.execute(f"SHOW COLUMNS FROM {table_name}")

    columns = cursor.fetchall()

    for column in columns:
        print(column)


def print_rows(cursor, table_name, limit=50):
    print()
    print(f"=== {table_name} ROWS ===")

    cursor.execute(
        f"""
        SELECT *
        FROM {table_name}
        ORDER BY 1 DESC
        LIMIT {limit}
        """
    )

    rows = cursor.fetchall()

    if not rows:
        print("No rows found.")
        return

    column_names = [column[0] for column in cursor.description]

    print("Columns:")
    print(column_names)
    print()

    for row in rows:
        print(row)

    print()
    print("Rows displayed:", len(rows))


def main():
    parser = argparse.ArgumentParser(
        description="Inspect forecast database tables."
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

        print("=== FORECAST DATABASE INSPECTION ===")
        print("Database:", args.db_name)

        cursor.execute("SHOW TABLES")

        tables = {
            row[0]
            for row in cursor.fetchall()
        }

        print()
        print("Forecast tables found:")

        for table_name in [
            "tbl_inventory_demand_history",
            "tbl_inventory_forecast_runs",
        ]:
            print(
                f"  {table_name}: "
                f"{'FOUND' if table_name in tables else 'NOT FOUND'}"
            )

        if "tbl_inventory_demand_history" in tables:
            print_table(
                cursor,
                "tbl_inventory_demand_history",
            )

            print_rows(
                cursor,
                "tbl_inventory_demand_history",
            )

        if "tbl_inventory_forecast_runs" in tables:
            print_table(
                cursor,
                "tbl_inventory_forecast_runs",
            )

            print_rows(
                cursor,
                "tbl_inventory_forecast_runs",
            )

    finally:
        connection.close()

    print()
    print("Inspection completed.")
    print("No database records were inserted, updated, or deleted.")


if __name__ == "__main__":
    main()