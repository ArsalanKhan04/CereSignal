"""
CereSignal Frontend - Simple NiceGUI Application
"""

from nicegui import ui, app
import requests
import json
import os
import tempfile
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
API_BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:8000/api/v1')

# Global state
auth_token: Optional[str] = None
current_user: Optional[Dict[str, Any]] = None


class APIClient:
    """API client for communicating with the backend"""
    
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
    
    def set_auth_token(self, token: str):
        """Set authentication token for requests"""
        self.session.headers.update({'Authorization': f'Bearer {token}'})
    
    def clear_auth(self):
        """Clear authentication"""
        self.session.headers.pop('Authorization', None)
    
    def register(self, username: str, email: str, password: str, confirm_password: str) -> Dict[str, Any]:
        """Register a new user"""
        response = self.session.post(f"{self.base_url}/auth/register", json={
            'username': username,
            'email': email,
            'password': password,
            'confirm_password': confirm_password
        })
        return response.json(), response.status_code
    
    def login(self, username: str, password: str) -> Dict[str, Any]:
        """Login user"""
        response = self.session.post(f"{self.base_url}/auth/login", json={
            'username': username,
            'password': password
        })
        return response.json(), response.status_code
    
    def get_current_user(self) -> Dict[str, Any]:
        """Get current user info"""
        response = self.session.get(f"{self.base_url}/auth/me")
        return response.json(), response.status_code
    
    def get_patients(self) -> Dict[str, Any]:
        """Get all patients"""
        response = self.session.get(f"{self.base_url}/users/")
        return response.json(), response.status_code
    
    def create_patient(self, patient_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new patient"""
        response = self.session.post(f"{self.base_url}/users/", json=patient_data)
        return response.json(), response.status_code
    
    def upload_file(self, file_path: str, original_filename: str, patient_id: int = None) -> Dict[str, Any]:
        """Upload a file for a patient"""
        with open(file_path, 'rb') as f:
            files = {'file': (original_filename, f, 'application/octet-stream')}
            print('patient_id', patient_id)
            data = {'patient_id': patient_id} if patient_id else {}
            response = self.session.post(f"{self.base_url}/signals/upload", files=files, data=data)
        return response.json(), response.status_code
    
    def get_files(self, patient_id: int = None) -> Dict[str, Any]:
        """Get files for a patient or all files"""
        params = {'patient_id': patient_id} if patient_id else {}
        response = self.session.get(f"{self.base_url}/signals/files", params=params)
        return response.json(), response.status_code
    
    def get_file_signals(self, file_id: int) -> Dict[str, Any]:
        """Get signals from a specific file"""
        response = self.session.get(f"{self.base_url}/signals/files/{file_id}/signals")
        return response.json(), response.status_code
    
    def check_inference_status(self, file_id: int) -> Dict[str, Any]:
        """Check inference status for a file"""
        response = self.session.get(f"{self.base_url}/signals/files/{file_id}/inference-status")
        return response.json(), response.status_code
    
    def delete_file(self, file_id: int) -> Dict[str, Any]:
        """Delete a file"""
        response = self.session.delete(f"{self.base_url}/signals/files/{file_id}")
        return response.json(), response.status_code


# Initialize API client
api_client = APIClient(API_BASE_URL)


def show_error(message: str):
    """Show error message"""
    ui.notify(message, type='negative', position='top')


def show_success(message: str):
    """Show success message"""
    ui.notify(message, type='positive', position='top')


@ui.page('/')
def login_page():
    """Login page"""
    ui.page_title('CereSignal - Login')
    
    with ui.column().classes('w-full max-w-md mx-auto mt-8'):
        ui.html('<h1 class="text-3xl font-bold text-center mb-8">CereSignal</h1>')
        ui.html('<h2 class="text-xl text-center mb-6">Doctor Login</h2>')
        
        with ui.card().classes('w-full'):
            username_input = ui.input('Username', placeholder='Enter your username').classes('w-full mb-4')
            password_input = ui.input('Password', password=True, placeholder='Enter your password').classes('w-full mb-4')
            
            with ui.row().classes('w-full justify-between'):
                ui.button('Login', on_click=lambda: handle_login(username_input.value, password_input.value)).classes('flex-1 mr-2')
                ui.button('Sign Up', on_click=lambda: ui.open('/signup')).classes('flex-1 ml-2')


@ui.page('/signup')
def signup_page():
    """Signup page"""
    ui.page_title('CereSignal - Sign Up')
    
    with ui.column().classes('w-full max-w-md mx-auto mt-8'):
        ui.html('<h1 class="text-3xl font-bold text-center mb-8">CereSignal</h1>')
        ui.html('<h2 class="text-xl text-center mb-6">Doctor Registration</h2>')
        
        with ui.card().classes('w-full'):
            username_input = ui.input('Username', placeholder='Choose a username').classes('w-full mb-4')
            email_input = ui.input('Email', placeholder='Enter your email').classes('w-full mb-4')
            password_input = ui.input('Password', password=True, placeholder='Choose a password').classes('w-full mb-4')
            confirm_password_input = ui.input('Confirm Password', password=True, placeholder='Confirm your password').classes('w-full mb-4')
            
            with ui.row().classes('w-full justify-between'):
                ui.button('Register', on_click=lambda: handle_signup(
                    username_input.value, 
                    email_input.value, 
                    password_input.value, 
                    confirm_password_input.value
                )).classes('flex-1 mr-2')
                ui.button('Back to Login', on_click=lambda: ui.open('/')).classes('flex-1 ml-2')


@ui.page('/dashboard')
def dashboard_page():
    """Dashboard page"""
    ui.page_title('CereSignal - Dashboard')
    
    if not auth_token:
        ui.open('/')
        return
    
    with ui.column().classes('w-full'):
        # Header
        with ui.row().classes('w-full justify-between items-center mb-6'):
            ui.html('<h1 class="text-2xl font-bold">CereSignal Dashboard</h1>')
            with ui.row():
                ui.html(f'<span class="mr-4">Welcome, {current_user.get("username", "Doctor")}!</span>')
                ui.button('Logout', on_click=handle_logout).props('outline')
        
        # Navigation tabs
        with ui.tabs().classes('w-full mb-6') as tabs:
            patients_tab = ui.tab('Patients')
            files_tab = ui.tab('Files')
            processing_tab = ui.tab('Processing')
        
        with ui.tab_panels(tabs, value=patients_tab).classes('w-full'):
            with ui.tab_panel(patients_tab):
                show_patients_section()
            with ui.tab_panel(files_tab):
                show_files_section()
            with ui.tab_panel(processing_tab):
                show_processing_section()


def show_patients_section():
    """Show patients management section"""
    with ui.column().classes('w-full'):
        with ui.row().classes('w-full justify-between items-center mb-4'):
            ui.html('<h2 class="text-xl font-semibold">Patient Management</h2>')
            ui.button('Add Patient', on_click=show_add_patient_dialog).props('icon=add')
        
        # Patients list
        patients_container = ui.column().classes('w-full')
        load_patients(patients_container)


def load_patients(container):
    """Load and display patients"""
    try:
        data, status_code = api_client.get_patients()
        
        if status_code == 200:
            patients = data
            
            # Clear container
            container.clear()
            
            if not patients:
                with container:
                    ui.html('<p class="text-gray-500 text-center py-8">No patients found. Add your first patient!</p>')
            else:
                with container:
                    for patient in patients:
                        with ui.card().classes('w-full mb-4'):
                            with ui.column().classes('w-full'):
                                # Patient info header
                                with ui.row().classes('w-full justify-between items-center mb-4'):
                                    with ui.column().classes('flex-1'):
                                        ui.html(f'<h3 class="font-semibold text-lg">{patient["name"]}</h3>')
                                        if patient.get('email'):
                                            ui.html(f'<p class="text-gray-600">{patient["email"]}</p>')
                                        if patient.get('medical_id'):
                                            ui.html(f'<p class="text-sm text-gray-500">ID: {patient["medical_id"]}</p>')
                                    
                                    with ui.row():
                                        ui.button('Edit', on_click=lambda p=patient: show_edit_patient_dialog(p)).props('icon=edit outline')
                                        ui.button('Delete', on_click=lambda p=patient: delete_patient(p['id'])).props('icon=delete outline color=red')
                                
                                # File upload section
                                with ui.expansion('EEG Files', icon='folder').classes('w-full'):
                                    with ui.column().classes('w-full'):
                                        # Upload button
                                        with ui.row().classes('w-full justify-between items-center mb-4'):
                                            ui.html('<h4 class="font-medium">Upload EEG Files</h4>')
                                            ui.button('Upload File', on_click=lambda p=patient: show_upload_dialog(p)).props('icon=upload')
                                        
                                        # Files list
                                        files_container = ui.column().classes('w-full')
                                        load_patient_files(patient['id'], files_container)
        else:
            show_error(f'Failed to load patients: {data.get("detail", "Unknown error")}')
    except Exception as e:
        show_error(f'Error loading patients: {str(e)}')


def show_add_patient_dialog():
    """Show add patient dialog"""
    with ui.dialog() as dialog, ui.card().classes('w-96'):
        ui.html('<h3 class="text-lg font-semibold mb-4">Add New Patient</h3>')
        
        name_input = ui.input('Name', placeholder='Patient full name').classes('w-full mb-4')
        email_input = ui.input('Email', placeholder='Patient email (optional)').classes('w-full mb-4')
        phone_input = ui.input('Phone', placeholder='Phone number (optional)').classes('w-full mb-4')
        medical_id_input = ui.input('Medical ID', placeholder='Medical ID (optional)').classes('w-full mb-4')
        gender_select = ui.select(['M', 'F', 'Other'], value='M', label='Gender').classes('w-full mb-4')
        notes_input = ui.textarea('Notes', placeholder='Medical notes (optional)').classes('w-full mb-4')
        
        with ui.row().classes('w-full justify-end'):
            ui.button('Cancel', on_click=dialog.close).props('outline')
            ui.button('Add Patient', on_click=lambda: add_patient(
                name_input.value,
                email_input.value,
                phone_input.value,
                medical_id_input.value,
                gender_select.value,
                notes_input.value,
                dialog
            ))
    
    dialog.open()


def show_edit_patient_dialog(patient):
    """Show edit patient dialog"""
    with ui.dialog() as dialog, ui.card().classes('w-96'):
        ui.html('<h3 class="text-lg font-semibold mb-4">Edit Patient</h3>')
        
        name_input = ui.input('Name', value=patient.get('name', '')).classes('w-full mb-4')
        email_input = ui.input('Email', value=patient.get('email', '')).classes('w-full mb-4')
        phone_input = ui.input('Phone', value=patient.get('phone', '')).classes('w-full mb-4')
        medical_id_input = ui.input('Medical ID', value=patient.get('medical_id', '')).classes('w-full mb-4')
        gender_select = ui.select(['M', 'F', 'Other'], value=patient.get('gender', 'M'), label='Gender').classes('w-full mb-4')
        notes_input = ui.textarea('Notes', value=patient.get('notes', '')).classes('w-full mb-4')
        
        with ui.row().classes('w-full justify-end'):
            ui.button('Cancel', on_click=dialog.close).props('outline')
            ui.button('Update Patient', on_click=lambda: update_patient(
                patient['id'],
                name_input.value,
                email_input.value,
                phone_input.value,
                medical_id_input.value,
                gender_select.value,
                notes_input.value,
                dialog
            ))
    
    dialog.open()


def show_upload_dialog(patient):
    """Show file upload dialog"""
    with ui.dialog() as dialog, ui.card().classes('w-96'):
        ui.html(f'<h3 class="text-lg font-semibold mb-4">Upload EEG File for {patient["name"]}</h3>')
        
        # File upload
        upload = ui.upload(
            on_upload=lambda e: handle_file_upload(e, patient['id'], dialog),
            max_file_size=100 * 1024 * 1024  # 100MB
        ).classes('w-full mb-4')
        upload.props('accept=.edf,.csv,.json,.txt')
        
        ui.html('<p class="text-sm text-gray-600 mb-4">Supported format: EDF files only (max 100MB)</p>')
        
        with ui.row().classes('w-full justify-end'):
            ui.button('Cancel', on_click=dialog.close).props('outline')
    
    dialog.open()


def handle_file_upload(upload_event, patient_id: int, dialog):
    """Handle file upload"""
    try:
        # Get the uploaded file content and name
        file_content = upload_event.content.read()
        file_name = upload_event.name
        
        # Create a temporary file
        import tempfile
        import os
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file_name)[1]) as temp_file:
            temp_file.write(file_content)
            temp_file_path = temp_file.name
        
        try:
            # Upload to backend using the temporary file with original filename
            data, status_code = api_client.upload_file(temp_file_path, file_name, patient_id)
            
            if status_code == 200:
                show_success(f'File uploaded successfully: {data["filename"]}')
                dialog.close()
                # Refresh the page to show updated files
                ui.open('/dashboard')
            else:
                show_error(f'Upload failed: {data.get("detail", "Unknown error")}')
        finally:
            # Clean up temporary file
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
            
    except Exception as e:
        show_error(f'Upload error: {str(e)}')


def load_patient_files(patient_id: int, container):
    """Load and display files for a specific patient"""
    try:
        data, status_code = api_client.get_files(patient_id)
        
        if status_code == 200:
            files = data
            
            # Clear container
            container.clear()
            
            if not files:
                with container:
                    ui.html('<p class="text-gray-500 text-center py-4">No files uploaded yet.</p>')
            else:
                with container:
                    for file in files:
                        with ui.card().classes('w-full mb-2'):
                            with ui.row().classes('w-full justify-between items-center'):
                                with ui.column().classes('flex-1'):
                                    ui.html(f'<h5 class="font-medium">{file["original_filename"]}</h5>')
                                    ui.html(f'<p class="text-sm text-gray-600">Size: {file["file_size"]} bytes | Type: {file["file_type"]}</p>')
                                    
                                    # Status badge
                                    status = file.get('processing_status', 'unknown')
                                    status_color = {
                                        'pending': 'orange',
                                        'processing': 'blue', 
                                        'completed': 'green',
                                        'failed': 'red'
                                    }.get(status, 'gray')
                                    
                                    ui.html(f'<span class="px-2 py-1 text-xs rounded text-white" style="background-color: {status_color};">{status.upper()}</span>')
                                    
                                    # Condition badge
                                    condition = file.get('condition', 'checking')
                                    condition_color = {
                                        'normal': 'green',
                                        'abnormal': 'red',
                                        'checking': 'gray'
                                    }.get(condition, 'gray')
                                    
                                    condition_display = {
                                        'normal': '✅ Normal',
                                        'abnormal': '❌ Abnormal', 
                                        'checking': '⏳ Checking'
                                    }.get(condition, '⏳ Checking')
                                    
                                    ui.html(f'<span class="px-2 py-1 text-xs rounded ml-2" style="background-color: {condition_color}; color: white;">{condition_display}</span>')
                                
                                with ui.row():
                                    ui.button('View', on_click=lambda f=file: view_file_details(f)).props('icon=visibility outline')
                                    ui.button('Delete', on_click=lambda f=file: delete_file(f['id'])).props('icon=delete outline color=red')
        else:
            with container:
                ui.html('<p class="text-red-500 text-center py-4">Failed to load files.</p>')
    except Exception as e:
        with container:
            ui.html(f'<p class="text-red-500 text-center py-4">Error loading files: {str(e)}</p>')


def view_file_details(file):
    """View file details and signals"""
    with ui.dialog() as dialog, ui.card().classes('w-2xl'):
        ui.html(f'<h3 class="text-lg font-semibold mb-4">File Details: {file["original_filename"]}</h3>')
        
        with ui.column().classes('w-full'):
            ui.html(f'<p><strong>Filename:</strong> {file["original_filename"]}</p>')
            ui.html(f'<p><strong>Size:</strong> {file["file_size"]} bytes</p>')
            ui.html(f'<p><strong>Type:</strong> {file["file_type"]}</p>')
            ui.html(f'<p><strong>Status:</strong> {file.get("processing_status", "unknown")}</p>')
            ui.html(f'<p><strong>Uploaded:</strong> {file.get("upload_time", "unknown")}</p>')
            
            # Load and display signals
            signals_container = ui.column().classes('w-full mt-4')
            load_file_signals(file['id'], signals_container)
        
        with ui.row().classes('w-full justify-end mt-4'):
            ui.button('Close', on_click=dialog.close).props('outline')
    
    dialog.open()


def load_file_signals(file_id: int, container):
    """Load and display signals from a file"""
    try:
        data, status_code = api_client.get_file_signals(file_id)
        
        if status_code == 200:
            signals = data
            
            with container:
                ui.html('<h4 class="font-medium mb-2">Signal Channels:</h4>')
                
                if not signals:
                    ui.html('<p class="text-gray-500">No signals found in this file.</p>')
                else:
                    for signal in signals:
                        with ui.card().classes('w-full mb-2'):
                            ui.html(f'<p><strong>Channel:</strong> {signal["channel_name"]}</p>')
                            ui.html(f'<p><strong>Sampling Rate:</strong> {signal["sampling_rate"]} Hz</p>')
                            ui.html(f'<p><strong>Duration:</strong> {signal["duration"]} seconds</p>')
                            ui.html(f'<p><strong>Data Points:</strong> {signal["data_points"]}</p>')
        else:
            with container:
                ui.html('<p class="text-red-500">Failed to load signals.</p>')
    except Exception as e:
        with container:
            ui.html(f'<p class="text-red-500">Error loading signals: {str(e)}</p>')


def delete_file(file_id: int):
    """Delete a file"""
    try:
        data, status_code = api_client.delete_file(file_id)
        
        if status_code == 200:
            show_success('File deleted successfully!')
            ui.open('/dashboard')
        else:
            show_error(f'Failed to delete file: {data.get("detail", "Unknown error")}')
    except Exception as e:
        show_error(f'Error deleting file: {str(e)}')


def add_patient(name, email, phone, medical_id, gender, notes, dialog):
    """Add a new patient"""
    if not name:
        show_error('Name is required')
        return
    
    try:
        patient_data = {
            'name': name,
            'email': email if email else None,
            'phone': phone if phone else None,
            'medical_id': medical_id if medical_id else None,
            'gender': gender,
            'notes': notes if notes else None
        }
        
        data, status_code = api_client.create_patient(patient_data)
        
        if status_code == 201:
            show_success('Patient added successfully!')
            dialog.close()
            ui.open('/dashboard')
        else:
            show_error(f'Failed to add patient: {data.get("detail", "Unknown error")}')
    except Exception as e:
        show_error(f'Error adding patient: {str(e)}')


def update_patient(patient_id, name, email, phone, medical_id, gender, notes, dialog):
    """Update a patient"""
    if not name:
        show_error('Name is required')
        return
    
    try:
        patient_data = {
            'name': name,
            'email': email if email else None,
            'phone': phone if phone else None,
            'medical_id': medical_id if medical_id else None,
            'gender': gender,
            'notes': notes if notes else None
        }
        
        data, status_code = api_client.update_patient(patient_id, patient_data)
        
        if status_code == 200:
            show_success('Patient updated successfully!')
            dialog.close()
            ui.open('/dashboard')
        else:
            show_error(f'Failed to update patient: {data.get("detail", "Unknown error")}')
    except Exception as e:
        show_error(f'Error updating patient: {str(e)}')


def delete_patient(patient_id):
    """Delete a patient"""
    try:
        data, status_code = api_client.delete_patient(patient_id)
        
        if status_code == 200:
            show_success('Patient deleted successfully!')
            ui.open('/dashboard')
        else:
            show_error(f'Failed to delete patient: {data.get("detail", "Unknown error")}')
    except Exception as e:
        show_error(f'Error deleting patient: {str(e)}')


def show_files_section():
    """Show files management section"""
    with ui.column().classes('w-full'):
        with ui.row().classes('w-full justify-between items-center mb-4'):
            ui.html('<h2 class="text-xl font-semibold">All EEG Files</h2>')
            ui.button('Refresh', on_click=lambda: load_all_files(files_container)).props('icon=refresh')
        
        # All files list
        files_container = ui.column().classes('w-full')
        load_all_files(files_container)


def load_all_files(container):
    """Load and display all files grouped by condition"""
    try:
        data, status_code = api_client.get_files()
        
        if status_code == 200:
            files = data
            
            # Clear container
            container.clear()
            
            if not files:
                with container:
                    ui.html('<p class="text-gray-500 text-center py-8">No files uploaded yet.</p>')
            else:
                # Group files by condition
                normal_files = [f for f in files if f.get('condition') == 'normal']
                abnormal_files = [f for f in files if f.get('condition') == 'abnormal']
                checking_files = [f for f in files if f.get('condition') == 'checking']
                
                with container:
                    # Normal files section
                    if normal_files:
                        ui.html('<h3 class="text-lg font-semibold mb-3 text-green-600">✅ Normal EEG Signals</h3>')
                        for file in normal_files:
                            create_file_card(file, 'green')
                        ui.html('<div class="mb-6"></div>')  # Spacing
                    
                    # Abnormal files section
                    if abnormal_files:
                        ui.html('<h3 class="text-lg font-semibold mb-3 text-red-600">❌ Abnormal EEG Signals</h3>')
                        for file in abnormal_files:
                            create_file_card(file, 'red')
                        ui.html('<div class="mb-6"></div>')  # Spacing
                    
                    # Checking files section
                    if checking_files:
                        ui.html('<h3 class="text-lg font-semibold mb-3 text-gray-600">⏳ Under Review</h3>')
                        for file in checking_files:
                            create_file_card(file, 'gray')
                        
                        # Start polling for checking files
                        if checking_files:
                            start_polling_for_updates(container)
        else:
            with container:
                ui.html('<p class="text-red-500 text-center py-8">Failed to load files.</p>')
    except Exception as e:
        with container:
            ui.html(f'<p class="text-red-500 text-center py-8">Error loading files: {str(e)}</p>')


def start_polling_for_updates(container):
    """Start polling for inference status updates"""
    def poll_updates():
        try:
            data, status_code = api_client.get_files()
            if status_code == 200:
                files = data
                checking_files = [f for f in files if f.get('condition') == 'checking']
                
                # If no more checking files, stop polling
                if not checking_files:
                    return
                
                # Check inference status for each checking file
                for file in checking_files:
                    file_id = file.get('id')
                    if file_id:
                        # This call will update the database if inference is completed
                        api_client.check_inference_status(file_id)
                
                # Reload the files display
                load_all_files(container)
        except Exception as e:
            print(f"Error polling for updates: {e}")
    
    # Poll every 5 seconds
    ui.timer(5.0, poll_updates, active=True)


def create_file_card(file, condition_color):
    """Create a file card with appropriate styling based on condition"""
    with ui.card().classes('w-full mb-4'):
        with ui.row().classes('w-full justify-between items-center'):
            with ui.column().classes('flex-1'):
                ui.html(f'<h5 class="font-medium">{file["original_filename"]}</h5>')
                ui.html(f'<p class="text-sm text-gray-600">Patient: {file.get("user_name", "Unknown")} | Size: {file["file_size"]} bytes | Type: {file["file_type"]}</p>')
                
                # Status badge
                status = file.get('processing_status', 'unknown')
                status_color = {
                    'pending': 'orange',
                    'processing': 'blue', 
                    'completed': 'green',
                    'failed': 'red'
                }.get(status, 'gray')
                
                ui.html(f'<span class="px-2 py-1 text-xs rounded text-white" style="background-color: {status_color};">{status.upper()}</span>')
                
                # Condition badge
                condition = file.get('condition', 'checking')
                condition_display = {
                    'normal': '✅ Normal',
                    'abnormal': '❌ Abnormal', 
                    'checking': '⏳ Checking'
                }.get(condition, '⏳ Checking')
                
                ui.html(f'<span class="px-2 py-1 text-xs rounded ml-2" style="background-color: {condition_color}; color: white;">{condition_display}</span>')
            
            with ui.row():
                ui.button('View', on_click=lambda f=file: view_file_details(f)).props('icon=visibility outline')
                ui.button('Delete', on_click=lambda f=file: delete_file(f['id'])).props('icon=delete outline color=red')


def show_processing_section():
    """Show signal processing section"""
    with ui.column().classes('w-full'):
        ui.html('<h2 class="text-xl font-semibold mb-4">Signal Processing</h2>')
        ui.html('<p class="text-gray-600">Signal processing features will be implemented here.</p>')


def handle_login(username: str, password: str):
    """Handle login"""
    if not username or not password:
        show_error('Please fill in all fields')
        return
    
    try:
        data, status_code = api_client.login(username, password)
        
        if status_code == 200:
            global auth_token, current_user
            auth_token = data['access_token']
            current_user = data
            api_client.set_auth_token(auth_token)
            
            # Get user info
            user_data, user_status = api_client.get_current_user()
            if user_status == 200:
                current_user = user_data
            
            show_success('Login successful!')
            ui.open('/dashboard')
        else:
            show_error(f'Login failed: {data.get("detail", "Unknown error")}')
    except Exception as e:
        show_error(f'Login error: {str(e)}')


def handle_signup(username: str, email: str, password: str, confirm_password: str):
    """Handle signup"""
    if not all([username, email, password, confirm_password]):
        show_error('Please fill in all fields')
        return
    
    if password != confirm_password:
        show_error('Passwords do not match')
        return
    
    if len(password) < 6:
        show_error('Password must be at least 6 characters long')
        return
    
    try:
        data, status_code = api_client.register(username, email, password, confirm_password)
        
        if status_code == 201:
            show_success('Registration successful! Please login.')
            ui.open('/')
        else:
            show_error(f'Registration failed: {data.get("detail", "Unknown error")}')
    except Exception as e:
        show_error(f'Registration error: {str(e)}')


def handle_logout():
    """Handle logout"""
    global auth_token, current_user
    auth_token = None
    current_user = None
    api_client.clear_auth()
    ui.open('/')


def main():
    """Main application entry point"""
    # Add custom CSS
    ui.add_head_html('''
        <style>
            body {
                font-family: 'Inter', sans-serif;
            }
        </style>
    ''')
    
    # Run the application
    ui.run(port=3001, title='CereSignal Frontend')


if __name__ in {"__main__", "__mp_main__"}:
    main()
