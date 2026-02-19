const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let backendProcess;
let workerProcess;
let desktopLogPath;

const isWindowsPackaged = process.platform === 'win32' && app.isPackaged;
const isDesktopMode = isWindowsPackaged || process.env.DESKTOP_MODE === 'true' || process.env.REACT_APP_DESKTOP === 'true';

// We assume your FastAPI server runs on port 8000 by default.
// If your .env changes this, update this URL accordingly!
const BACKEND_HEALTH_URL = 'http://127.0.0.1:8000/health';

function getBinaryPath(binaryName) {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, binaryName);
    }
    return path.join(__dirname, 'resources', binaryName);
}

function startBackend() {
    let backendExe;
    let backendDir;

    if (app.isPackaged) {
        backendDir = path.join(process.resourcesPath, 'backend');
        backendExe = path.join(backendDir, 'cere-engine.exe');
    } else {
        backendDir = path.join(__dirname, 'backend', 'dist', 'cere-engine');
        backendExe = path.join(backendDir, 'cere-engine.exe');
    }

    writeDesktopLog({
        level: 'info',
        message: 'Starting Backend API',
        context: 'BOOT',
        data: { path: backendExe }
    });
    
    const backendLogDir = path.join(app.getPath('userData'), 'backend-logs');
    backendProcess = spawn(backendExe, [], { 
        cwd: backendDir,
        stdio: 'ignore', // Change to 'inherit' to see logs in terminal during dev
        windowsHide: true,
        env: {
            ...process.env,
            DESKTOP_MODE: isDesktopMode ? 'true' : 'false',
            CERE_LOG_DIR: backendLogDir,
            CERE_LOG_KEEP_FOREVER: '1'
        }
    });
    
    backendProcess.on('exit', (code, signal) => {
        writeDesktopLog({
            level: 'error',
            message: 'Backend process exited',
            context: 'BOOT',
            data: { code, signal }
        });
    });
}

function startWorker() {
    if (isDesktopMode) {
        return;
    }
    let workerExe;
    let workerDir;

    if (app.isPackaged) {
        workerDir = path.join(process.resourcesPath, 'backend');
        workerExe = path.join(workerDir, 'cere-engine.exe');
    } else {
        workerDir = path.join(__dirname, 'backend', 'dist', 'cere-engine');
        workerExe = path.join(workerDir, 'cere-engine.exe');
    }

    writeDesktopLog({
        level: 'info',
        message: 'Starting Celery Worker',
        context: 'BOOT',
        data: { path: workerExe }
    });

    const backendLogDir = path.join(app.getPath('userData'), 'backend-logs');
    workerProcess = spawn(workerExe, ["worker"], { 
        cwd: workerDir,
        stdio: 'ignore', 
        windowsHide: true,
        env: {
            ...process.env,
            CERE_LOG_DIR: backendLogDir,
            CERE_LOG_KEEP_FOREVER: '1'
        }
    });
    
    workerProcess.on('exit', (code, signal) => {
        writeDesktopLog({
            level: 'error',
            message: 'Worker process exited',
            context: 'BOOT',
            data: { code, signal }
        });
    });
}

/**
 * Pings the backend health endpoint until it responds with a 200 OK.
 */
async function waitForServer(url, maxRetries = 30, retryDelayMs = 500) {
    let attempts = 0;
    while (attempts < maxRetries) {
        try {
            const response = await fetch(url);
            if (response.status === 200) {
                writeDesktopLog({ level: 'info', message: 'Backend server is healthy and ready.', context: 'BOOT' });
                return true;
            }
        } catch (error) {
            // Fetch failed, server is not fully booted yet
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
    
    writeDesktopLog({ level: 'error', message: 'Timeout waiting for backend to start', context: 'BOOT' });
    throw new Error('Backend server did not start in time.');
}

async function createWindow() {
    // 1. Start Background Services
    startBackend();
    startWorker();

    // 2. Create the Window immediately (but don't load the UI yet)
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: { 
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Optional: You could load a simple HTML "Loading Splash Screen" here while waiting
    // mainWindow.loadFile('splash.html');

    // 3. Wait for the Python server to fully boot up
    try {
        writeDesktopLog({ level: 'info', message: 'Waiting for backend server...', context: 'BOOT' });
        await waitForServer(BACKEND_HEALTH_URL);
        
        // 4. Load the actual Frontend once the green light is given
        const startUrl = path.join(__dirname, 'frontend', 'build', 'index.html');
        mainWindow.loadFile(startUrl);
        
    } catch (err) {
        console.error("Failed to connect to backend:", err);
        // Fallback: If it completely fails, still try loading or show an error
        const startUrl = path.join(__dirname, 'frontend', 'build', 'index.html');
        mainWindow.loadFile(startUrl); 
    }

    mainWindow.on('closed', () => mainWindow = null);
}

function ensureDesktopLogFile() {
    const logDir = path.join(app.getPath('userData'), 'logs');
    try {
        fs.mkdirSync(logDir, { recursive: true });
    } catch (err) {
        console.error('Failed to create log directory:', err);
    }
    desktopLogPath = path.join(logDir, 'cere-signal.log');
}

function writeDesktopLog(entry) {
    if (!desktopLogPath) {
        ensureDesktopLogFile();
    }
    const safeEntry = sanitizeLogEntry(entry);
    if (!safeEntry) {
        return;
    }
    try {
        const line = `${JSON.stringify(safeEntry)}\n`;
        fs.appendFile(desktopLogPath, line, (err) => {
            if (err) {
                console.error('Failed to write desktop log:', err);
            }
        });
    } catch (err) {
        console.error('Failed to serialize desktop log entry:', err);
    }
}

function sanitizeLogEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const safeEntry = {
        timestamp: entry.timestamp || new Date().toISOString(),
        level: entry.level || 'info',
        message: typeof entry.message === 'string' ? entry.message : String(entry.message),
        context: entry.context || undefined,
        data: entry.data || undefined
    };
    return safeEntry;
}

// Single initialization point
app.whenReady().then(() => {
    ensureDesktopLogFile();
    createWindow();
});

ipcMain.on('desktop-log', (_event, entry) => {
    writeDesktopLog(entry);
});

// CLEANUP: Kill ALL processes when app closes
app.on('will-quit', () => {
    if (backendProcess) backendProcess.kill();
    if (workerProcess) workerProcess.kill();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});