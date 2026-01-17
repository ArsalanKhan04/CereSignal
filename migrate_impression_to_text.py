"""
Migration script to convert impression field from String to Text
and migrate existing 'normal'/'abnormal' values to descriptive text
"""

import sys
import os
from pathlib import Path

# Add the backend directory to the Python path
backend_path = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_path))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.models.report import EEGReport
from app.core.database import Base

def migrate_impression_field():
    """Migrate impression field from String to Text and update existing values"""
    
    print("Starting impression field migration...")
    
    # Create engine
    engine = create_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Step 1: Check if column exists and get its type
        print("\n1. Checking current schema...")
        result = db.execute(text("""
            SELECT column_name, data_type, character_maximum_length 
            FROM information_schema.columns 
            WHERE table_name = 'eeg_reports' AND column_name = 'impression'
        """))
        column_info = result.fetchone()
        
        if column_info:
            print(f"   Current impression column: {column_info[1]} (max length: {column_info[2]})")
        else:
            print("   Impression column not found!")
            return
        
        # Step 2: Get all existing reports with 'normal' or 'abnormal' values
        print("\n2. Migrating existing impression values...")
        reports = db.query(EEGReport).all()
        
        updated_count = 0
        for report in reports:
            old_value = report.impression
            
            # Only update if it's the old format (normal/abnormal)
            if old_value == 'normal':
                report.impression = 'Normal study — no epileptiform abnormalities detected.'
                updated_count += 1
                print(f"   Report ID {report.id}: 'normal' → 'Normal study — no epileptiform abnormalities detected.'")
            elif old_value == 'abnormal':
                # Create a more descriptive impression based on factual report if available
                if report.factual_report:
                    excerpt = report.factual_report.strip().replace('\n', ' ')[:200]
                    report.impression = f'Abnormalities detected. {excerpt}...'
                else:
                    report.impression = 'Abnormalities detected — see factual report for details.'
                updated_count += 1
                print(f"   Report ID {report.id}: 'abnormal' → updated with details")
        
        # Commit the value updates
        db.commit()
        print(f"\n   Updated {updated_count} reports")
        
        # Step 3: Alter the column type to TEXT
        print("\n3. Altering column type to TEXT...")
        
        # For PostgreSQL
        if 'postgresql' in settings.DATABASE_URL:
            db.execute(text("""
                ALTER TABLE eeg_reports 
                ALTER COLUMN impression TYPE TEXT
            """))
            print("   PostgreSQL: Column type changed to TEXT")
        
        # For SQLite
        elif 'sqlite' in settings.DATABASE_URL:
            print("   SQLite: Column type is flexible, no ALTER needed")
            # SQLite doesn't enforce column types strictly, so we just need to ensure
            # the model is updated (which we already did)
        
        db.commit()
        print("\n✅ Migration completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Error during migration: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 80)
    print("IMPRESSION FIELD MIGRATION")
    print("=" * 80)
    print("\nThis script will:")
    print("  1. Check the current impression column schema")
    print("  2. Migrate existing 'normal'/'abnormal' values to descriptive text")
    print("  3. Change the column type from VARCHAR(50) to TEXT")
    print("\n" + "=" * 80)
    
    response = input("\nProceed with migration? (yes/no): ")
    if response.lower() in ['yes', 'y']:
        migrate_impression_field()
    else:
        print("Migration cancelled.")
