# CereSignal Frontend

A NiceGUI-based frontend for the CereSignal brain signal processing application.

## Features

- **Doctor Authentication**: Secure login and registration for medical professionals
- **Patient Management**: Add, edit, and manage patient records
- **File Upload**: Upload and manage EEG signal files
- **Signal Processing**: Process and analyze brain signals
- **Modern UI**: Clean, responsive interface built with NiceGUI

## Installation

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the backend** (in the main project directory):
   ```bash
   pyenv activate cere_env
   python -m app.main
   ```

4. **Start the frontend**:
   ```bash
   python main.py
   ```

5. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000

## Usage

1. **Register**: Create a new doctor account
2. **Login**: Access your dashboard
3. **Manage Patients**: Add, edit, and view patient records
4. **Upload Files**: Upload EEG signal files for analysis
5. **Process Signals**: Analyze brain signal data

## Development

The frontend is built with NiceGUI and communicates with the FastAPI backend through REST API calls. All authentication is handled via JWT tokens.

## Configuration

- `API_BASE_URL`: Backend API URL (default: http://localhost:8000/api/v1)
- `FRONTEND_PORT`: Frontend port (default: 3000)