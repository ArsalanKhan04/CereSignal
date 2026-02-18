const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let backendProcess;
let workerProcess;
let desktopLogPath;

const isDesktopMode = process.env.DESKTOP_MODE === 'true' || process.env.REACT_APP_DESKTOP === 'true';

function getBinaryPath(binaryName) {
    // Helper to find files in both Dev (local) and Prod (installed) modes
    if (app.isPackaged) {
        // Installed App: resources/binaryName
        return path.join(process.resourcesPath, binaryName);
    }
    // Dev Mode: resources/binaryName
    return path.join(__dirname, 'resources', binaryName);
}


function startBackend() {
    let backendExe;
    let backendDir;

    if (app.isPackaged) {
        // PROD: resources/backend/cere-engine.exe
        backendDir = path.join(process.resourcesPath, 'backend');
        backendExe = path.join(backendDir, 'cere-engine.exe');
    } else {
        // DEV: backend/dist/cere-engine/cere-engine.exe
        backendDir = path.join(__dirname, 'backend', 'dist', 'cere-engine');
        backendExe = path.join(backendDir, 'cere-engine.exe');
    }

    writeDesktopLog({
        level: 'info',
        message: 'Starting Backend API',
        context: 'BOOT',
        data: { path: backendExe }
    });
    
    // CRITICAL: cwd must be set so Python finds its internal files
    const backendLogDir = path.join(app.getPath('userData'), 'backend-logs');
    backendProcess = spawn(backendExe, [], { 
        cwd: backendDir,
        stdio: 'ignore', // Change to 'inherit' to see logs in terminal
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

    // Reuse the same path logic as the backend, since it's the same EXE file
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

    // CRITICAL: Pass "worker" arg so entry_point.py knows to run Celery instead of Uvicorn
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

function createWindow() {
    // 1. Start Background Services
    startBackend();
    startWorker();

    // 2. Create the Window
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: { 
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // 3. Load the Frontend
    // Wait 3 seconds for Python services to boot up before loading the page
    setTimeout(() => {
        const startUrl = path.join(__dirname, 'frontend', 'build', 'index.html');
        mainWindow.loadFile(startUrl);
    }, 3000);

    mainWindow.on('closed', () => mainWindow = null);
}

app.whenReady().then(createWindow);

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

app.whenReady().then(() => {
    ensureDesktopLogFile();
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
