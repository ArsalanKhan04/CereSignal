#!/usr/bin/env python3
"""
Database migration script to add new fields to AuthUser and User models
"""

import sqlite3
import os
from pathlib import Path

def migrate_database():
    """Add new columns to existing tables"""
    
    # Database path
    db_path = "cere_signal.db"
    
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found!")
        return
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("Starting database migration...")
        
        # Add new columns to auth_users table
        auth_user_columns = [
            "first_name TEXT NOT NULL DEFAULT ''",
            "last_name TEXT NOT NULL DEFAULT ''", 
            "title TEXT",
            "specialization TEXT",
            "license_number TEXT UNIQUE",
            "phone TEXT",
            "about TEXT",
            "hospital_affiliation TEXT",
            "years_experience INTEGER",
            "profile_picture TEXT"
        ]
        
        for column in auth_user_columns:
            try:
                cursor.execute(f"ALTER TABLE auth_users ADD COLUMN {column}")
                print(f"Added column to auth_users: {column.split()[0]}")
            except sqlite3.OperationalError as e:
                if "duplicate column name" in str(e):
                    print(f"Column already exists in auth_users: {column.split()[0]}")
                else:
                    print(f"Error adding column to auth_users: {e}")
        
        # Add new columns to users table
        user_columns = [
            "address TEXT",
            "emergency_contact_name TEXT",
            "emergency_contact_phone TEXT", 
            "blood_type TEXT CHECK(blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'))",
            "allergies TEXT",
            "medical_conditions TEXT",
            "current_medications TEXT"
        ]
        
        for column in user_columns:
            try:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {column}")
                print(f"Added column to users: {column.split()[0]}")
            except sqlite3.OperationalError as e:
                if "duplicate column name" in str(e):
                    print(f"Column already exists in users: {column.split()[0]}")
                else:
                    print(f"Error adding column to users: {e}")
        
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