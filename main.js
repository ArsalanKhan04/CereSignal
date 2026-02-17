const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;
let workerProcess;
let redisProcess;

function getBinaryPath(binaryName) {
    // Helper to find files in both Dev (local) and Prod (installed) modes
    if (app.isPackaged) {
        // Installed App: resources/binaryName
        return path.join(process.resourcesPath, binaryName);
    }
    // Dev Mode: resources/binaryName
    return path.join(__dirname, 'resources', binaryName);
}

function startRedis() {
    const redisPath = getBinaryPath('redis-server.exe');
    console.log("Starting Redis from:", redisPath);
    redisProcess = spawn(redisPath, [], { stdio: 'ignore', windowsHide: true });
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

    console.log("Starting Backend API from:", backendExe);
    
    // CRITICAL: cwd must be set so Python finds its internal files
    backendProcess = spawn(backendExe, [], { 
        cwd: backendDir,
        stdio: 'ignore', // Change to 'inherit' to see logs in terminal
        windowsHide: true 
    });
}

function startWorker() {
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

    console.log("Starting Celery Worker from:", workerExe);

    // CRITICAL: Pass "worker" arg so entry_point.py knows to run Celery instead of Uvicorn
    workerProcess = spawn(workerExe, ["worker"], { 
        cwd: workerDir,
        stdio: 'ignore', 
        windowsHide: true 
    });
}

function createWindow() {
    // 1. Start Background Services
    startRedis();
    startBackend();
    startWorker();

    // 2. Create the Window
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: { 
            nodeIntegration: false,
            contextIsolation: true 
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

// CLEANUP: Kill ALL processes when app closes
app.on('will-quit', () => {
    if (redisProcess) redisProcess.kill();
    if (backendProcess) backendProcess.kill();
    if (workerProcess) workerProcess.kill();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});