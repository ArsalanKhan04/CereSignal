"""
Test script for the frontend
"""

import requests
import sys
sys.path.append('.')
from main import api_client

def test_backend_connection():
    """Test connection to backend"""
    try:
        # Test health endpoint
        response = requests.get('http://localhost:8000/health')
        if response.status_code == 200:
            print("✅ Backend is running and accessible")
            return True
        else:
            print(f"❌ Backend health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Cannot connect to backend: {e}")
        return False

def test_api_client():
    """Test API client functionality"""
    try:
        # Test registration
        data, status = api_client.register('testuser', 'test@example.com', 'testpass123', 'testpass123')
        if status == 201:
            print("✅ User registration works")
        elif status == 400 and "already registered" in str(data):
            print("ℹ️  User already exists (expected)")
        else:
            print(f"❌ Registration failed: {data}")
            return False
        
        # Test login
        data, status = api_client.login('testuser', 'testpass123')
        if status == 200:
            print("✅ User login works")
            api_client.set_auth_token(data['access_token'])
        else:
            print(f"❌ Login failed: {data}")
            return False
        
        # Test getting current user
        data, status = api_client.get_current_user()
        if status == 200:
            print("✅ Get current user works")
        else:
            print(f"❌ Get current user failed: {data}")
            return False
        
        return True
    except Exception as e:
        print(f"❌ API client test failed: {e}")
        return False

def main():
    print("🧪 Testing CereSignal Frontend")
    print("=" * 40)
    
    # Test backend connection
    if not test_backend_connection():
        print("\n❌ Backend is not running. Please start the backend first:")
        print("   cd ../ && pyenv activate cere_env && python -m app.main")
        return
    
    # Test API client
    if test_api_client():
        print("\n🎉 All tests passed! Frontend is ready to use.")
        print("\nTo start the frontend:")
        print("   python main.py")
        print("\nThen open: http://localhost:3000")
    else:
        print("\n❌ Some tests failed. Check the backend and try again.")

if __name__ == "__main__":
    main()