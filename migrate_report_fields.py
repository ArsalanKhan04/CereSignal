#!/usr/bin/env python3
"""
Database migration script to add report-related fields to SignalFile model
"""

import sqlite3
import os

def migrate_database():
    """Add report task ID and report content fields to signal_files table"""
    
    # Database path
    db_path = "backend/cere_signal.db"
    
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found!")
        return
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("Starting database migration for report fields...")
        
        # Add new columns to signal_files table
        signal_file_columns = [
            "report_task_id TEXT",
            "factual_report TEXT",
            "impression TEXT"
        ]
        
        for column in signal_file_columns:
            try:
                cursor.execute(f"ALTER TABLE signal_files ADD COLUMN {column}")
                print(f"Added column to signal_files: {column.split()[0]}")
            except sqlite3.OperationalError as e:
                if "duplicate column name" in str(e):
                    print(f"Column already exists in signal_files: {column.split()[0]}")
                else:
                    print(f"Error adding column to signal_files: {e}")
        
        # Commit changes
        conn.commit()
        print("Database migration completed successfully!")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database()
