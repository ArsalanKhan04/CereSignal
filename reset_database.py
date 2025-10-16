#!/usr/bin/env python3
"""
Database and file reset script for CereSignal
This script will:
1. Drop all database tables
2. Recreate all tables
3. Delete all uploaded files
4. Optionally create a test doctor account
"""

import os
import sys
import shutil
from pathlib import Path

# Add the app directory to Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.core.database import engine, Base, get_db
from app.models import user, signal, auth
from app.core.auth import get_password_hash
from sqlalchemy import text

def reset_database():
    """Reset the database by dropping and recreating all tables"""
    print("🗑️  Resetting database...")
    
    try:
        # Drop all tables
        Base.metadata.drop_all(bind=engine)
        print("✅ Dropped all database tables")
        
        # Recreate all tables
        Base.metadata.create_all(bind=engine)
        print("✅ Recreated all database tables")
        
        return True
    except Exception as e:
        print(f"❌ Error resetting database: {e}")
        return False

def clear_upload_files():
    """Delete all files from the uploads directory"""
    print("🗑️  Clearing uploaded files...")
    
    uploads_dir = Path("uploads")
    
    if not uploads_dir.exists():
        print("ℹ️  No uploads directory found")
        return True
    
    try:
        # Count files before deletion
        file_count = sum(1 for _ in uploads_dir.rglob('*') if _.is_file())
        
        if file_count == 0:
            print("ℹ️  No files to delete")
            return True
        
        # Delete all files and directories
        shutil.rmtree(uploads_dir)
        print(f"✅ Deleted {file_count} files from uploads directory")
        
        # Recreate empty uploads directory
        uploads_dir.mkdir(parents=True, exist_ok=True)
        print("✅ Recreated empty uploads directory")
        
        return True
    except Exception as e:
        print(f"❌ Error clearing upload files: {e}")
        return False

def create_test_doctor():
    """Create a test doctor account for development"""
    print("👨‍⚕️  Creating test doctor account...")
    
    try:
        from app.models.auth import AuthUser
        from app.core.database import SessionLocal
        
        db = SessionLocal()
        
        # Check if doctor already exists
        existing_doctor = db.query(AuthUser).filter(AuthUser.username == "doctor1").first()
        if existing_doctor:
            print("ℹ️  Test doctor already exists")
            db.close()
            return True
        
        # Create test doctor
        doctor = AuthUser(
            username="doctor1",
            email="doctor@cresignal.com",
            hashed_password=get_password_hash("securepassword123"),
            is_active=True,
            is_superuser=False
        )
        
        db.add(doctor)
        db.commit()
        db.close()
        
        print("✅ Created test doctor account:")
        print("   Username: doctor1")
        print("   Password: securepassword123")
        print("   Email: doctor@cresignal.com")
        
        return True
    except Exception as e:
        print(f"❌ Error creating test doctor: {e}")
        return False

def main():
    """Main reset function"""
    print("🔄 CereSignal Database & File Reset")
    print("=" * 40)
    
    # Confirm action
    response = input("⚠️  This will delete ALL data and files. Continue? (y/N): ")
    if response.lower() != 'y':
        print("❌ Reset cancelled")
        return
    
    print("\n🚀 Starting reset process...")
    
    # Step 1: Reset database
    if not reset_database():
        print("❌ Database reset failed. Aborting.")
        return
    
    # Step 2: Clear uploaded files
    if not clear_upload_files():
        print("❌ File cleanup failed. Aborting.")
        return
    
    # Step 3: Create test doctor
    create_test_doctor()
    
    print("\n🎉 Reset completed successfully!")
    print("\n📋 Next steps:")
    print("1. Start backend: cd /home/krakar/Files/Projects/CereSignal && pyenv activate cere_env && python -m app.main")
    print("2. Start frontend: cd frontend/ && pyenv activate cere_env && python simple_main.py")
    print("3. Login with: doctor1 / securepassword123")

if __name__ == "__main__":
    main()