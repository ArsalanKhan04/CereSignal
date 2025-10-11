# CereSignal API

A FastAPI-based backend for brain signal processing and analysis.

## Features

- **JWT Authentication**: Secure JWT-based authentication system for API access
- **User Management**: Separate authentication users and patient management
- **Patient Management**: Patient/user management with required name field and optional profile information
- **File Upload**: Support for EDF, CSV, JSON, and TXT signal files with patient association
- **EEG Data Storage**: Automatic extraction and storage of signal data from uploaded files
- **Signal Processing**: FFT analysis, filtering, feature extraction, and spectral analysis
- **Database Storage**: SQLite database for storing users, files, signals, and processing results
- **RESTful API**: Clean REST API with automatic documentation
- **File Management**: Upload, download, and delete signal files with patient filtering
- **Processing Results**: Store and retrieve signal processing results

## Project Structure

```
CereSignal/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI application entry point
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py          # Configuration management
│   │   ├── database.py        # Database connection and session
│   │   └── middleware.py      # Custom middleware
│   ├── models/
│   │   ├── __init__.py
│   │   └── signal.py          # SQLAlchemy models
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── signal.py          # Pydantic schemas
│   ├── api/
│   │   ├── __init__.py
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── api.py         # Main API router
│   │       └── endpoints/
│   │           ├── __init__.py
│   │           ├── signals.py     # Signal management endpoints
│   │           └── processing.py  # Signal processing endpoints
│   └── utils/
│       ├── __init__.py
│       ├── file_processing.py    # File handling utilities
│       └── signal_processing.py  # Signal processing utilities
├── tests/
│   ├── __init__.py
│   ├── conftest.py            # Test configuration
│   ├── test_main.py           # Main app tests
│   └── test_signals.py        # Signal endpoint tests
├── requirements.txt           # Python dependencies
├── .env.example              # Environment variables template
├── .gitignore               # Git ignore rules
└── README.md                # This file
```

## Installation

1. **Activate your environment**:
   ```bash
   pyenv activate cere_env
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run the application**:
   ```bash
   python -m app.main
   # or
   uvicorn app.main:app --reload
   ```

## API Documentation

Once the server is running, you can access:

- **Interactive API docs**: http://localhost:8000/api/v1/docs
- **ReDoc documentation**: http://localhost:8000/api/v1/redoc
- **OpenAPI schema**: http://localhost:8000/api/v1/openapi.json

## API Endpoints

### Authentication

- `POST /api/v1/auth/register` - Register a new authentication user
- `POST /api/v1/auth/login` - Login and get JWT token
- `GET /api/v1/auth/me` - Get current user information
- `PUT /api/v1/auth/change-password` - Change user password
- `POST /api/v1/auth/logout` - Logout user

### Patient Management (Requires Authentication)

- `POST /api/v1/users/` - Create a new patient
- `GET /api/v1/users/` - Get list of patients (with search)
- `GET /api/v1/users/{user_id}` - Get specific patient details
- `PUT /api/v1/users/{user_id}` - Update patient information
- `DELETE /api/v1/users/{user_id}` - Deactivate patient
- `GET /api/v1/users/{user_id}/files` - Get patient's signal files

### Signal Management (Requires Authentication)

- `POST /api/v1/signals/upload` - Upload a signal file (optional patient_id)
- `GET /api/v1/signals/files` - Get list of uploaded files (with patient filtering)
- `GET /api/v1/signals/files/{file_id}` - Get specific file details
- `GET /api/v1/signals/files/{file_id}/signals` - Get signals from a file
- `DELETE /api/v1/signals/files/{file_id}` - Delete a file

### Signal Processing (Requires Authentication)

- `POST /api/v1/processing/process` - Process signal data
- `GET /api/v1/processing/results` - Get processing results
- `GET /api/v1/processing/results/{result_id}` - Get specific result
- `DELETE /api/v1/processing/results/{result_id}` - Delete result

## Supported File Types

- **EDF files** (.edf) - European Data Format for biomedical signals
- **CSV files** (.csv) - Comma-separated values
- **JSON files** (.json) - JavaScript Object Notation
- **TXT files** (.txt) - Plain text files

## Processing Types

- **FFT** - Fast Fourier Transform analysis
- **Filter** - Signal filtering (lowpass, highpass, bandpass)
- **Feature Extraction** - Statistical and signal features
- **Spectral Analysis** - Power spectral density analysis

## Development

### Running Tests

```bash
pytest
```

### Code Formatting

```bash
black app/ tests/
```

### Type Checking

```bash
mypy app/
```

## Configuration

The application can be configured through environment variables. See `.env.example` for available options.

Key configuration options:
- `DATABASE_URL` - Database connection string
- `MAX_FILE_SIZE` - Maximum file upload size
- `ALLOWED_FILE_TYPES` - Allowed file extensions
- `BACKEND_CORS_ORIGINS` - CORS allowed origins

## License

This project is licensed under the MIT License.