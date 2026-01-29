
import duckdb
import os

db_path = "backend/data/student_c.duckdb"

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
else:
    try:
        conn = duckdb.connect(db_path, read_only=True)
        tasks = conn.execute("SELECT id, name, status FROM tasks").fetchall()
        print(f"Found {len(tasks)} tasks:")
        for t in tasks:
            print(t)
    except Exception as e:
        print(f"Error reading DB: {e}")
