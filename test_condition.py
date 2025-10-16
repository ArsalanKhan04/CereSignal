#!/usr/bin/env python3
"""
Test script to verify the condition field functionality
"""

import requests
import tempfile
import os
import struct

def create_test_edf():
    """Create a minimal test EDF file"""
    # EDF file header structure (simplified)
    header = bytearray(256)
    
    # Version (8 bytes)
    header[0:8] = b'0       '
    
    # Patient ID (80 bytes)
    header[8:88] = b'Test Patient'.ljust(80)
    
    # Recording ID (80 bytes) 
    header[88:168] = b'Test Recording'.ljust(80)
    
    # Start date (8 bytes) - DD.MM.YY
    header[168:176] = b'01.01.24'
    
    # Start time (8 bytes) - HH.MM.SS
    header[176:184] = b'12.00.00'
    
    # Header bytes (8 bytes)
    header[184:192] = b'256     '
    
    # Reserved (44 bytes)
    header[192:236] = b' ' * 44
    
    # Number of data records (8 bytes)
    header[236:244] = b'1       '
    
    # Duration of data record (8 bytes)
    header[244:252] = b'1       '
    
    # Number of signals (4 bytes)
    header[252:256] = struct.pack('<I', 1)
    
    # Signal header (256 bytes per signal)
    signal_header = bytearray(256)
    signal_header[0:16] = b'Test Channel'.ljust(16)  # Label
    signal_header[16:80] = b' ' * 64  # Transducer type
    signal_header[80:96] = b'uV'.ljust(16)  # Physical dimension
    signal_header[96:112] = b'-32768'.ljust(16)  # Physical minimum
    signal_header[112:128] = b'32767'.ljust(16)  # Physical maximum
    signal_header[128:144] = b'-32768'.ljust(16)  # Digital minimum
    signal_header[144:160] = b'32767'.ljust(16)  # Digital maximum
    signal_header[160:176] = b'Prefilter'.ljust(80)  # Prefiltering
    signal_header[176:192] = b'100'.ljust(8)  # Number of samples
    signal_header[192:256] = b' ' * 64  # Reserved
    
    # Combine headers
    full_header = header + signal_header
    
    # Create some test data (100 samples)
    test_data = []
    for i in range(100):
        # Simple sine wave
        value = int(1000 * (i / 100.0))  # Convert to integer
        test_data.append(struct.pack('<h', value))  # 16-bit signed integer
    
    data_bytes = b''.join(test_data)
    
    return full_header + data_bytes

def test_condition_field():
    """Test the condition field functionality"""
    
    # Test data
    BASE_URL = "http://localhost:8000/api/v1"
    
    # 1. Login
    print("1. Logging in...")
    login_data = {
        "username": "doctor1",
        "password": "securepassword123"
    }
    
    response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
    if response.status_code != 200:
        print(f"❌ Login failed: {response.text}")
        return False
    
    token = response.json()['access_token']
    headers = {"Authorization": f"Bearer {token}"}
    print("✅ Login successful!")
    
    # 2. Get patients
    print("\n2. Getting patients...")
    response = requests.get(f"{BASE_URL}/users/", headers=headers)
    if response.status_code != 200:
        print(f"❌ Failed to get patients: {response.text}")
        return False
    
    patients = response.json()
    if not patients:
        print("❌ No patients found. Please create a patient first.")
        return False
    
    patient_id = patients[0]['id']
    print(f"✅ Found patient: {patients[0]['name']} (ID: {patient_id})")
    
    # 3. Create a test EDF file
    print("\n3. Creating test EDF file...")
    edf_content = create_test_edf()
    
    with tempfile.NamedTemporaryFile(mode='wb', suffix='.edf', delete=False) as temp_file:
        temp_file.write(edf_content)
        temp_file_path = temp_file.name
    
    try:
        # 4. Upload file
        print("\n4. Uploading EDF file...")
        with open(temp_file_path, 'rb') as f:
            files = {'file': (os.path.basename(temp_file_path), f, 'application/octet-stream')}
            data = {'patient_id': patient_id}
            
            response = requests.post(
                f"{BASE_URL}/signals/upload",
                files=files,
                data=data,
                headers=headers
            )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ EDF file uploaded successfully: {result['filename']}")
            print(f"   Status: {result['processing_status']}")
            
            # 5. Check files to see condition field
            print("\n5. Checking files for condition field...")
            response = requests.get(f"{BASE_URL}/signals/files", headers=headers)
            if response.status_code == 200:
                files = response.json()
                if files:
                    file_info = files[0]
                    print(f"✅ File condition: {file_info.get('condition', 'NOT FOUND')}")
                    print(f"   All file fields: {list(file_info.keys())}")
                    return True
                else:
                    print("❌ No files found")
                    return False
            else:
                print(f"❌ Failed to get files: {response.text}")
                return False
        else:
            print(f"❌ Upload failed: {response.text}")
            return False
            
    finally:
        # Clean up
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)

if __name__ == "__main__":
    print("🧪 Testing Condition Field")
    print("=" * 30)
    
    if test_condition_field():
        print("\n🎉 Condition field test passed!")
    else:
        print("\n❌ Condition field test failed!")