"""
Test signal endpoints
"""

import pytest
from fastapi.testclient import TestClient
from io import BytesIO


def test_get_signal_files_empty(client: TestClient):
    """Test getting signal files when none exist"""
    response = client.get("/api/v1/signals/files")
    assert response.status_code == 200
    assert response.json() == []


def test_upload_signal_file(client: TestClient):
    """Test uploading a signal file"""
    # Create a test file
    test_content = b"test,data\n1,2\n3,4"
    test_file = BytesIO(test_content)
    
    response = client.post(
        "/api/v1/signals/upload",
        files={"file": ("test.csv", test_file, "text/csv")}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "file_id" in data
    assert data["filename"] == "test.csv"
    assert data["file_size"] == len(test_content)


def test_upload_invalid_file_type(client: TestClient):
    """Test uploading invalid file type"""
    test_content = b"test data"
    test_file = BytesIO(test_content)
    
    response = client.post(
        "/api/v1/signals/upload",
        files={"file": ("test.txt", test_file, "text/plain")}
    )
    
    assert response.status_code == 400
    assert "File type" in response.json()["detail"]


def test_get_signal_file_not_found(client: TestClient):
    """Test getting non-existent signal file"""
    response = client.get("/api/v1/signals/files/999")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]