const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");

const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT = 8000;
const HEALTH_ENDPOINT = "/health";
const HEALTH_TIMEOUT_MS = 30000;
const HEALTH_INTERVAL_MS = 500;

let backendProcess = null;

function ensureRuntimeDirs() {
  const dataDir = app.getPath("userData");
  const uploadsDir = path.join(dataDir, "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  return dataDir;
}

function resolveBackendPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "backend", "cere-backend.exe");
  }

  const devWinPath = path.join(app.getAppPath(), "dist", "backend", "cere-backend.exe");
  const devPath = path.join(app.getAppPath(), "dist", "backend", "cere-backend");
  if (fs.existsSync(devWinPath)) return devWinPath;
  if (fs.existsSync(devPath)) return devPath;
  return null;
}

function waitForHealth() {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed > HEALTH_TIMEOUT_MS) {
        reject(new Error("Backend health check timed out"));
        return;
      }

      const req = http.get(
        {
          hostname: BACKEND_HOST,
          port: BACKEND_PORT,
          path: HEALTH_ENDPOINT,
          timeout: HEALTH_INTERVAL_MS,
        },
        (res) => {
          if (res.statusCode === 200) {
            res.resume();
            resolve();
          } else {
            res.resume();
            setTimeout(attempt, HEALTH_INTERVAL_MS);
          }
        }
      );

      req.on("error", () => {
        setTimeout(attempt, HEALTH_INTERVAL_MS);
      });
      req.on("timeout", () => {
        req.destroy();
        setTimeout(attempt, HEALTH_INTERVAL_MS);
      });
    };

    attempt();
  });
}

function startBackend() {
  const backendPath = resolveBackendPath();
  if (!backendPath) {
    dialog.showErrorBox(
      "Backend Not Found",
      "Could not find the backend executable. Make sure it is built and bundled."
    );
    app.quit();
    return null;
  }

  const dataDir = ensureRuntimeDirs();
  const logPath = path.join(dataDir, "backend.log");
  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  const env = {
    ...process.env,
    HOST: BACKEND_HOST,
    PORT: String(BACKEND_PORT),
    BACKEND_CORS_ORIGINS: "[\"*\"]",
  };

  const child = spawn(backendPath, [], {
    cwd: dataDir,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  child.on("exit", (code) => {
    if (!app.isQuiting) {
      dialog.showErrorBox(
        "Backend Stopped",
        `The backend process exited with code ${code}. See ${logPath} for details.`
      );
      app.quit();
    }
  });

  return child;
}

async function createWindow() {
  backendProcess = startBackend();
  if (!backendProcess) return;

  try {
    await waitForHealth();
  } catch (error) {
    dialog.showErrorBox(
      "Backend Unavailable",
      `Failed to start backend on ${BACKEND_HOST}:${BACKEND_PORT}. ${error.message}`
    );
    app.quit();
    return;
  }

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const indexPath = path.join(app.getAppPath(), "frontend", "build", "index.html");
  await mainWindow.loadFile(indexPath);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  app.isQuiting = true;
  if (backendProcess) {
    backendProcess.kill();
  }
});
