
import sys
import os
import sqlite3
import duckdb
import json

sys.path.append(os.path.join(os.getcwd(), 'backend'))
from services.db_service import get_db_service

def debug_data():
    db = get_db_service()
    
    print("\n=== 1. Checking analysis_results table ===")
    results = db.conn.execute("SELECT * FROM analysis_results LIMIT 5").fetchall()
    columns = ["id", "task_id", "email_id", "analysis_type", "model_provider", "result", "created_at"]
    
    if not results:
        print("Table 'analysis_results' is empty.")
    else:
        for row in results:
            print(f"Type: {row[3]}, Result Preview: {str(row[5])[:50]}...")

    print("\n=== 2. Checking for 'batch_summary' specifically ===")
    batch_results = db.conn.execute("SELECT count(*) FROM analysis_results WHERE analysis_type = 'batch_summary'").fetchone()
    print(f"Count of 'batch_summary': {batch_results[0]}")
    
    if batch_results[0] > 0:
        sample = db.conn.execute("SELECT result FROM analysis_results WHERE analysis_type = 'batch_summary' LIMIT 1").fetchone()
        print(f"Sample 'batch_summary' result: {sample[0]}")
        print(f"Type of result column: {type(sample[0])}")

    print("\n=== 3. Testing get_emails_by_task logic ===")
    tasks = db.get_tasks()
    if not tasks:
        print("No tasks found.")
        return

    # Find a task with batch analysis
    target_task_id = None
    for task in tasks:
        count = db.conn.execute(
            "SELECT count(*) FROM analysis_results WHERE task_id = ? AND analysis_type = 'batch_summary'", 
            [task['id']]
        ).fetchone()[0]
        if count > 0:
            target_task_id = task['id']
            print(f"Found task {task['id']} with {count} batch analyses.")
            break
    
    if not target_task_id:
        print("No task has 'batch_summary' analysis results.")
        # Try finding ANY task to just test the JOIN syntax even if null
        target_task_id = tasks[0]['id']
        print(f"Fallback to task {target_task_id} (no batch analysis found).")

    emails = db.get_emails_by_task(target_task_id, limit=5)
    print(f"\nRetrieved {len(emails)} emails for task {target_task_id}")
    for email in emails:
        print(f"Email {email.get('id')}: batch_analysis_result = {email.get('batch_analysis_result')}")

if __name__ == "__main__":
    debug_data()
