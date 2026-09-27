const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const net = require('net');

let mainWindow;
let backendProcess;
let workerProcess;
let llmProcess;
let desktopLogPath;

const isWindowsPackaged = process.platform === 'win32' && app.isPackaged;
const isDesktopMode = isWindowsPackaged || process.env.DESKTOP_MODE === 'true' || process.env.REACT_APP_DESKTOP === 'true';

// Handed to the backend and to this app's own window only. The window trades it for a
// session token (POST /auth/desktop-session), so the desktop app signs itself in while
// every API route still requires a token.
const desktopSecret = isDesktopMode ? crypto.randomBytes(32).toString('hex') : null;

// We assume your FastAPI server runs on port 8000 by default.
// If your .env changes this, update this URL accordingly!
const BACKEND_HEALTH_URL = 'http://127.0.0.1:8000/health';

function getBinaryPath(binaryName) {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, binaryName);
    }
    return path.join(__dirname, 'resources', binaryName);
}

// The model name the backend asks llama-server for (OLLAMA_MODEL).
const LLM_ALIAS = 'ceresignal-llm';

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

/**
 * Starts the bundled llama-server (backend/fetch-desktop-llm.ps1 stages it) for report
 * text, and returns the environment that points the backend at it. The backend talks
 * to it through its Ollama settings, since both speak the OpenAI API.
 *
 * Loopback only, on a free port, behind a per-launch API key passed through the
 * environment rather than argv. Without the staged files (an unpackaged checkout that
 * never ran the fetch script) it returns nothing, and reports are left for manual entry.
 */
async function startLlm() {
    const llmDir = app.isPackaged ? path.join(process.resourcesPath, 'llm') : path.join(__dirname, 'desktop-llm');
    const serverExe = path.join(llmDir, 'llama-server.exe');
    const modelPath = path.join(llmDir, 'model.gguf');

    if (!isDesktopMode || !fs.existsSync(serverExe) || !fs.existsSync(modelPath)) {
        writeDesktopLog({ level: 'warn', message: 'Local LLM not found; report text will need manual entry', context: 'BOOT', data: { path: llmDir } });
        return {};
    }

    const port = await getFreePort();
    const apiKey = crypto.randomBytes(32).toString('hex');
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const logFd = fs.openSync(path.join(logDir, 'llama-server.log'), 'w');

    writeDesktopLog({ level: 'info', message: 'Starting local LLM', context: 'BOOT', data: { path: serverExe, port } });

    // --reasoning off: the backend's JSON response_format leaves no room for a
    // thinking preamble. Threads are left to llama.cpp, which uses the physical cores.
    llmProcess = spawn(serverExe, [
        '-m', modelPath,
        '--host', '127.0.0.1',
        '--port', String(port),
        '--alias', LLM_ALIAS,
        '-c', '4096',
        '--no-webui',
        '--reasoning', 'off'
    ], {
        cwd: llmDir,
        stdio: ['ignore', logFd, logFd],
        windowsHide: true,
        env: { ...process.env, LLAMA_API_KEY: apiKey }
    });
    fs.closeSync(logFd);

    llmProcess.on('exit', (code, signal) => {
        writeDesktopLog({ level: 'error', message: 'Local LLM process exited', context: 'BOOT', data: { code, signal } });
    });

    return {
        OLLAMA_BASE_URL: `http://127.0.0.1:${port}/v1`,
        OLLAMA_MODEL: LLM_ALIAS,
        OLLAMA_API_KEY: apiKey
    };
}

function startBackend(extraEnv = {}) {
    let backendExe;
    let backendDir;
    let backendArgs = [];

    if (app.isPackaged) {
        backendDir = path.join(process.resourcesPath, 'backend');
        backendExe = path.join(backendDir, 'cere-engine.exe');
    } else if (process.platform === 'win32') {
        backendDir = path.join(__dirname, 'backend', 'dist', 'cere-engine');
        backendExe = path.join(backendDir, 'cere-engine.exe');
    } else {
        // No PyInstaller build off Windows: run the source entry point with the dev
        // virtualenv that ./scripts/setup.sh creates.
        backendDir = path.join(__dirname, 'backend');
        backendExe = path.join(backendDir, 'cere_env', 'bin', 'python');
        backendArgs = ['entry_point.py'];
    }

    writeDesktopLog({
        level: 'info',
        message: 'Starting Backend API',
        context: 'BOOT',
        data: { path: backendExe }
    });
    
    const backendLogDir = path.join(app.getPath('userData'), 'backend-logs');
    backendProcess = spawn(backendExe, backendArgs, { 
        cwd: backendDir,
        stdio: 'ignore', // Change to 'inherit' to see logs in terminal during dev
        windowsHide: true,
        env: {
            ...process.env,
            DESKTOP_MODE: isDesktopMode ? 'true' : 'false',
            DESKTOP_SESSION_SECRET: desktopSecret || '',
            CERE_DATA_DIR: app.getPath('userData'),
            CERE_LOG_DIR: backendLogDir,
            CERE_LOG_KEEP_FOREVER: '1',
            ...extraEnv
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
    // 1. Start Background Services. The LLM loads its model in the background; the
    // backend only needs its address, and first calls it after inference.
    let llmEnv = {};
    try {
        llmEnv = await startLlm();
    } catch (err) {
        writeDesktopLog({ level: 'error', message: 'Failed to start local LLM', context: 'BOOT', data: { error: String(err) } });
    }
    startBackend(llmEnv);
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

ipcMain.on('desktop-session-secret', (event) => {
    event.returnValue = mainWindow && event.sender === mainWindow.webContents ? desktopSecret : null;
});

// CLEANUP: Kill ALL processes when app closes
app.on('will-quit', () => {
    if (backendProcess) backendProcess.kill();
    if (workerProcess) workerProcess.kill();
    if (llmProcess) llmProcess.kill();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});