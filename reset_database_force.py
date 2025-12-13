#!/usr/bin/env python3
"""
Force reset script for CereSignal (no confirmation required)
Use this for automated testing or when you're sure you want to reset everything
"""

import os
import sys
import shutil
from pathlib import Path

# Ensure backend directory is on Python path so 'app' package imports resolve
project_root = os.path.dirname(__file__)
# Add backend folder so imports like 'app.core...' work
sys.path.insert(0, os.path.join(project_root, 'backend'))
# Also add project root for local imports
sys.path.insert(0, project_root)

from app.core.database import engine, Base
from app.models import user, signal, auth
from app.core.auth import get_password_hash
from app.models.auth import AuthUser
from app.core.database import SessionLocal

def force_reset():
    """Force reset everything without confirmation"""
    print("🔄 Force resetting CereSignal database and files...")
    
    try:
        # 1. Reset database
        print("🗑️  Dropping all tables...")
        Base.metadata.drop_all(bind=engine)
        
        print("🏗️  Recreating all tables...")
        Base.metadata.create_all(bind=engine)
        
        # 2. Clear uploads
        print("🗑️  Clearing upload files...")
        uploads_dir = Path(os.path.join(os.path.dirname(__file__), 'uploads'))
        if uploads_dir.exists():
            shutil.rmtree(uploads_dir)
        uploads_dir.mkdir(parents=True, exist_ok=True)
        
        # 3. Create test doctor
        print("👨‍⚕️  Creating test doctor...")
        db = SessionLocal()
        
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
        
        print("✅ Reset completed successfully!")
        print("🔑 Test credentials: doctor1 / securepassword123")
        
    except Exception as e:
        print(f"❌ Reset failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    force_reset()
