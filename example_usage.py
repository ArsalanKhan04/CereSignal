"""
Example usage of CereSignal API with Authentication
"""

import requests
import json

# API base URL
BASE_URL = "http://localhost:8000/api/v1"

# Global variable to store auth token
auth_token = None

def register_user():
    """Register a new authentication user"""
    user_data = {
        "username": "doctor1",
        "email": "doctor@example.com",
        "password": "securepassword123",
        "confirm_password": "securepassword123"
    }
    
    response = requests.post(f"{BASE_URL}/auth/register", json=user_data)
    if response.status_code == 201:
        user = response.json()
        print(f"User registered: {user['username']} (ID: {user['id']})")
        return True
    else:
        print(f"Error registering user: {response.text}")
        return False

def login_user():
    """Login and get authentication token"""
    global auth_token
    
    login_data = {
        "username": "doctor1",
        "password": "securepassword123"
    }
    
    response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
    if response.status_code == 200:
        token_data = response.json()
        auth_token = token_data['access_token']
        print(f"Login successful! Token expires in {token_data['expires_in']} seconds")
        return True
    else:
        print(f"Error logging in: {response.text}")
        return False

def get_auth_headers():
    """Get headers with authentication token"""
    if not auth_token:
        raise Exception("Not authenticated. Please login first.")
    return {"Authorization": f"Bearer {auth_token}"}

def create_patient():
    """Create a new patient (requires authentication)"""
    patient_data = {
        "name": "John Doe",
        "email": "john.doe@example.com",
        "phone": "+1234567890",
        "gender": "M",
        "medical_id": "PAT001",
        "notes": "Patient with epilepsy monitoring"
    }
    
    response = requests.post(
        f"{BASE_URL}/users/", 
        json=patient_data,
        headers=get_auth_headers()
    )
    if response.status_code == 201:
        user = response.json()
        print(f"Patient created: {user['name']} (ID: {user['id']})")
        return user['id']
    else:
        print(f"Error creating patient: {response.text}")
        return None

def upload_eeg_file(patient_id, file_path):
    """Upload an EEG file for a patient (requires authentication)"""
    with open(file_path, 'rb') as f:
        files = {'file': f}
        data = {'patient_id': patient_id} if patient_id else {}
        
        response = requests.post(
            f"{BASE_URL}/signals/upload", 
            files=files, 
            data=data,
            headers=get_auth_headers()
        )
        if response.status_code == 200:
            result = response.json()
            print(f"File uploaded: {result['filename']} (File ID: {result['file_id']})")
            return result['file_id']
        else:
            print(f"Error uploading file: {response.text}")
            return None

def get_patient_files(patient_id=None):
    """Get all files for patients (requires authentication)"""
    params = {'patient_id': patient_id} if patient_id else {}
    response = requests.get(
        f"{BASE_URL}/signals/files", 
        params=params,
        headers=get_auth_headers()
    )
    if response.status_code == 200:
        files = response.json()
        print(f"Found {len(files)} files")
        for file in files:
            print(f"  - {file['original_filename']} ({file['file_type']}) - Status: {file['processing_status']} - Patient: {file['user_name']}")
        return files
    else:
        print(f"Error getting files: {response.text}")
        return []

def process_signal(file_id, processing_type="fft"):
    """Process a signal file (requires authentication)"""
    processing_data = {
        "file_id": file_id,
        "processing_type": processing_type,
        "parameters": {
            "sampling_rate": 1000,
            "duration": 10
        }
    }
    
    response = requests.post(
        f"{BASE_URL}/processing/process", 
        json=processing_data,
        headers=get_auth_headers()
    )
    if response.status_code == 200:
        result = response.json()
        print(f"Processing completed: {result['processing_type']} (Result ID: {result['id']})")
        return result['id']
    else:
        print(f"Error processing signal: {response.text}")
        return None

def main():
    """Main example workflow with authentication"""
    print("CereSignal API Example Usage with Authentication")
    print("=" * 50)
    
    # 1. Register a user
    print("\n1. Registering authentication user...")
    if not register_user():
        print("   (User might already exist, continuing...)")
    
    # 2. Login
    print("\n2. Logging in...")
    if not login_user():
        return
    
    # 3. Create a patient
    print("\n3. Creating patient...")
    patient_id = create_patient()
    if not patient_id:
        return
    
    # 4. Upload a file (you would need an actual EDF/CSV file)
    print("\n4. Uploading file...")
    # file_id = upload_eeg_file(patient_id, "path/to/your/eeg_file.edf")
    print("   (Skipping file upload - no file provided)")
    
    # 5. Get patient's files
    print("\n5. Getting patient files...")
    files = get_patient_files(patient_id)
    
    # 6. Process a signal (if files exist)
    if files:
        print("\n6. Processing signal...")
        file_id = files[0]['id']
        result_id = process_signal(file_id)
    
    print("\nExample completed!")

if __name__ == "__main__":
    main()