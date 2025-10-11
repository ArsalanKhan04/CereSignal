"""
Quick authentication flow example
"""

import requests

BASE_URL = "http://localhost:8000/api/v1"

def main():
    print("🔐 CereSignal Authentication Flow Example")
    print("=" * 50)
    
    # 1. Register a user
    print("\n1. Registering user...")
    register_data = {
        "username": "doctor1",
        "email": "doctor@example.com", 
        "password": "securepassword123",
        "confirm_password": "securepassword123"
    }
    
    response = requests.post(f"{BASE_URL}/auth/register", json=register_data)
    if response.status_code == 201:
        print("✅ User registered successfully!")
    elif response.status_code == 400 and "already registered" in response.text:
        print("ℹ️  User already exists, continuing...")
    else:
        print(f"❌ Registration failed: {response.text}")
        return
    
    # 2. Login
    print("\n2. Logging in...")
    login_data = {
        "username": "doctor1",
        "password": "securepassword123"
    }
    
    response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
    if response.status_code == 200:
        token_data = response.json()
        token = token_data['access_token']
        print(f"✅ Login successful! Token: {token[:20]}...")
    else:
        print(f"❌ Login failed: {response.text}")
        return
    
    # 3. Test authenticated endpoint
    print("\n3. Testing authenticated endpoint...")
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    if response.status_code == 200:
        user_info = response.json()
        print(f"✅ Authenticated as: {user_info['username']} ({user_info['email']})")
    else:
        print(f"❌ Authentication test failed: {response.text}")
    
    # 4. Create a patient
    print("\n4. Creating a patient...")
    patient_data = {
        "name": "John Doe",
        "email": "john@example.com",
        "medical_id": "PAT001"
    }
    
    response = requests.post(f"{BASE_URL}/users/", json=patient_data, headers=headers)
    if response.status_code == 201:
        patient = response.json()
        print(f"✅ Patient created: {patient['name']} (ID: {patient['id']})")
    else:
        print(f"❌ Patient creation failed: {response.text}")
    
    print("\n🎉 Authentication flow completed successfully!")

if __name__ == "__main__":
    main()