#!/usr/bin/env python3
"""
Test script to verify filename preservation in upload
"""

import requests
import json
import os
import tempfile

def test_upload_with_original_filename():
    """Test uploading a file with original filename"""
    
    # Login first
    login_response = requests.post('http://localhost:8000/api/v1/auth/login', json={
        'username': 'doctor1',
        'password': 'securepassword123'
    })
    
    if login_response.status_code != 200:
        print(f"Login failed: {login_response.text}")
        return
    
    token = login_response.json()['access_token']
    headers = {'Authorization': f'Bearer {token}'}
    
    # Create a test EDF file
    test_content = b"test eeg data for filename test"
    original_filename = "patient_brain_scan_2024.edf"
    
    # Create a temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.edf') as temp_file:
        temp_file.write(test_content)
        temp_file_path = temp_file.name
    
    try:
        # Upload the file
        with open(temp_file_path, 'rb') as f:
            files = {'file': (original_filename, f, 'application/octet-stream')}
            data = {'patient_id': 1}  # Use patient ID 1
            response = requests.post('http://localhost:8000/api/v1/signals/upload', 
                                  files=files, data=data, headers=headers)
        
        print(f"Upload Status: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"Upload Response: {json.dumps(result, indent=2)}")
            
            # Check the database to see the actual filename
            files_response = requests.get('http://localhost:8000/api/v1/signals/files', headers=headers)
            if files_response.status_code == 200:
                files = files_response.json()
                print(f"\nFiles in database:")
                for file in files:
                    print(f"  ID: {file['id']}, Filename: {file['filename']}")
        else:
            print(f"Upload failed: {response.text}")
    
    finally:
        # Clean up temporary file
        os.unlink(temp_file_path)

if __name__ == "__main__":
    test_upload_with_original_filename()