# CereSignal React Frontend

A modern React frontend for the CereSignal EEG analysis application, built with TypeScript and Material-UI.

## Features

- **Authentication**: User login and registration with JWT tokens
- **Dashboard**: Statistics and charts showing EEG file analysis results
- **Patient Management**: CRUD operations for patient records
- **File Management**: Upload and manage EEG files with real-time processing status
- **Events Analysis**: Detailed analysis of EEG events by channel and type
- **Responsive Design**: Mobile-friendly interface using Material-UI

## Technology Stack

- **React 18** with TypeScript
- **Material-UI (MUI)** for UI components
- **React Router** for navigation
- **Axios** for API communication
- **Recharts** for data visualization
- **Context API** for state management

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Backend API running on `http://localhost:8000`

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Update the API base URL in `.env` if needed:
```
REACT_APP_API_BASE_URL=http://localhost:8000/api/v1
```

### Development

Start the development server:
```bash
npm start
```

The application will open at `http://localhost:3000`.

### Building for Production

Create a production build:
```bash
npm run build
```

The build files will be in the `build` directory.

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Dashboard.tsx    # Main dashboard with statistics
│   ├── Patients.tsx     # Patient management
│   ├── Files.tsx        # File management
│   ├── Events.tsx       # Events analysis
│   ├── FileUpload.tsx   # File upload component
│   └── FileList.tsx     # File list component
├── pages/               # Page components
│   ├── LoginPage.tsx    # Login page
│   ├── SignupPage.tsx   # Registration page
│   └── DashboardPage.tsx # Main dashboard page
├── services/            # API services
│   └── api.ts           # API client
├── contexts/            # React contexts
│   └── AuthContext.tsx  # Authentication context
├── types/               # TypeScript type definitions
│   └── index.ts         # All type definitions
└── utils/               # Utility functions
```

## API Integration

The frontend communicates with the FastAPI backend through the following endpoints:

- **Authentication**: `/auth/login`, `/auth/register`, `/auth/me`
- **Patients**: `/users/` (CRUD operations)
- **Files**: `/signals/upload`, `/signals/files`, `/signals/stats`
- **Events**: `/signals/files/{id}/events`

## Key Features

### Dashboard
- Real-time statistics of EEG files and patients
- Visual charts showing condition distribution
- Recent files overview
- File statistics (duration, size, etc.)

### Patient Management
- Add, edit, and delete patients
- Upload EEG files for specific patients
- View patient file history

### File Management
- Upload EDF files (max 100MB)
- Real-time processing status updates
- File categorization by condition (normal, abnormal, checking, failed)
- Detailed file information and signal channels

### Events Analysis
- Select processed files for analysis
- View events summary statistics
- Detailed events breakdown by channel
- Event type categorization (normal waves, spike waves, slow waves)

## Environment Variables

- `REACT_APP_API_BASE_URL`: Backend API base URL (default: http://localhost:8000/api/v1)

## Development Notes

- The application uses Material-UI theming for consistent styling
- All API calls are handled through the centralized `apiClient`
- Authentication state is managed through React Context
- File uploads include validation for file type and size
- Real-time updates are implemented for file processing status

## Contributing

1. Follow the existing code structure and naming conventions
2. Use TypeScript for all new components
3. Add proper error handling for API calls
4. Include loading states for better UX
5. Test components thoroughly before submitting

## License

This project is part of the CereSignal application suite.