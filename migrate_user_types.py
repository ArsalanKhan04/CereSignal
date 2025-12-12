#!/usr/bin/env python3
"""
Database migration script to add user_type field to AuthUser and patient_auth_user_id to User
"""

import sqlite3
import os
from pathlib import Path

def migrate_database():
    """Add user_type column to auth_users and patient_auth_user_id to users"""
    
    # Database path - check both root and backend directory
    db_paths = ["cere_signal.db", "backend/cere_signal.db", "./backend/cere_signal.db"]
    db_path = None
    
    for path in db_paths:
        if os.path.exists(path):
            db_path = path
            break
    
    if not db_path:
        print(f"Database not found in any of these locations: {db_paths}")
        return
    
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found!")
        return
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("Starting database migration for user types...")
        
        # Add user_type column to auth_users table
        try:
            cursor.execute("""
                ALTER TABLE auth_users 
                ADD COLUMN user_type TEXT NOT NULL DEFAULT 'doctor' 
                CHECK(user_type IN ('doctor', 'technician', 'patient'))
            """)
            print("Added user_type column to auth_users")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print("Column user_type already exists in auth_users")
            else:
                print(f"Error adding user_type column: {e}")
        
        # Create index on user_type for better query performance
        try:
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_auth_users_user_type ON auth_users(user_type)")
            print("Created index on user_type")
        except sqlite3.OperationalError as e:
            print(f"Error creating index: {e}")
        
        # Add patient_auth_user_id column to users table
        try:
            cursor.execute("""
                ALTER TABLE users 
                ADD COLUMN patient_auth_user_id INTEGER 
                REFERENCES auth_users(id)
            """)
            print("Added patient_auth_user_id column to users")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print("Column patient_auth_user_id already exists in users")
            else:
                print(f"Error adding patient_auth_user_id column: {e}")
        
        # Create unique constraint on patient_auth_user_id (one-to-one relationship)
        try:
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_patient_auth_user_id ON users(patient_auth_user_id) WHERE patient_auth_user_id IS NOT NULL")
            print("Created unique index on patient_auth_user_id")
        except sqlite3.OperationalError as e:
            print(f"Error creating unique index: {e}")
        
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
