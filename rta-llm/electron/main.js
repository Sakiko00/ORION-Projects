const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require('electron');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

const isDev = process.env.NODE_ENV === 'dev';
const PORT = 4000;
const APP_URL = `http://localhost:${PORT}`;

let mainWindow = null;
let backendProcess = null;

const LOG_DIR = path.join(os.homedir(), 'AppData', 'Roaming', 'RTA-LLM', 'logs');
let logStream = null;

function initLogger() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const logFile = path.join(LOG_DIR, `rta-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    logStream = fs.createWriteStream(logFile, { flags: 'a' });
    logStream.write(`=== RTA-LLM Startup ${new Date().toISOString()} ===\n`);
    logStream.write(`Platform: ${process.platform} ${os.release()}\n`);
    logStream.write(`Arch: ${process.arch}\n`);
    logStream.write(`Electron: ${process.versions.electron}\n`);
    logStream.write(`Node: ${process.versions.node}\n`);
    logStream.write(`isPackaged: ${app.isPackaged}\n`);
    logStream.write(`resourcesPath: ${process.resourcesPath}\n`);
    logStream.write(`exePath: ${process.execPath}\n`);
    logStream.write(`cwd: ${process.cwd()}\n\n`);
  } catch (e) {
    // can't log, but that's OK
  }
}

function log(level, msg) {
  const line = `[${level}] ${msg}`;
  console.log(line);
  if (logStream) {
    logStream.write(line + '\n');
  }
}

function findNodeExecutable() {
  if (isDev) {
    return process.execPath;
  }

  const possiblePaths = [];

  possiblePaths.push(
    path.join(process.resourcesPath, 'node-portable', 'node.exe'),
    path.join(process.resourcesPath, 'node.exe'),
    path.join(path.dirname(process.execPath), 'node.exe')
  );

  possiblePaths.push(
    path.join(__dirname, '..', 'node-portable', 'node.exe'),
    path.join(process.cwd(), 'node-portable', 'node.exe'),
    path.join(process.cwd(), 'node.exe')
  );

  if (process.env.NODE_PATH) {
    possiblePaths.push(path.join(process.env.NODE_PATH, '..', 'node.exe'));
  }

  try {
    const whereResult = execFileSync('where', ['node'], { encoding: 'utf8', timeout: 3000 });
    const nodePath = whereResult.split('\n')[0].trim();
    if (nodePath && fs.existsSync(nodePath)) {
      possiblePaths.push(nodePath);
    }
  } catch (e) {}

  if (process.env.APPDATA) {
    possiblePaths.push(
      path.join(process.env.APPDATA, 'nvim', 'node.exe'),
      path.join('C:\\Program Files\\nodejs', 'node.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe')
    );
  }

  for (const p of possiblePaths) {
    let resolved = p;
    if (resolved && fs.existsSync(resolved)) {
      log('INFO', `Found Node: ${resolved}`);
      return resolved;
    }
  }

  log('ERROR', 'Node not found. Checked:');
  possiblePaths.forEach(p => log('ERROR', `  ${p}`));
  return null;
}

function resolveBackendPath() {
  const candidates = [];

  candidates.push(
    path.join(process.resourcesPath, 'backend', 'dist', 'main.js'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', 'dist', 'main.js')
  );

  candidates.push(
    path.join(__dirname, '..', 'backend', 'dist', 'main.js'),
    path.join(__dirname, 'backend', 'dist', 'main.js'),
    path.join(process.cwd(), 'backend', 'dist', 'main.js'),
    path.join(process.cwd(), 'dist', 'main.js')
  );

  for (const p of candidates) {
    log('INFO', `Checking backend: ${p}`);
    if (fs.existsSync(p)) {
      log('INFO', `Backend found: ${p}`);
      return { entry: p, cwd: path.dirname(path.dirname(p)) };
    }
  }

  log('ERROR', 'Backend not found. Checked all candidates.');
  return null;
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const resolved = resolveBackendPath();
    if (!resolved) {
      reject(new Error('未找到后端文件'));
      return;
    }

    const nodeExec = findNodeExecutable();
    if (!nodeExec) {
      reject(new Error('未找到 Node.js 运行时'));
      return;
    }

    log('INFO', `Starting backend: ${nodeExec} ${resolved.entry}`);
    log('INFO', `Backend cwd: ${resolved.cwd}`);

    backendProcess = spawn(nodeExec, [resolved.entry], {
      cwd: resolved.cwd,
      env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let started = false;

    const onData = (data) => {
      const text = data.toString().trim();
      if (text) {
        log('BACKEND', text);
      }
      if (!started && (text.includes('successfully started') || text.includes('running on'))) {
        started = true;
        log('INFO', 'Backend process reported ready');
        showLoading(2);
        setTimeout(() => resolve(), 500);
      }
    };

    backendProcess.stdout.on('data', onData);
    backendProcess.stderr.on('data', onData);

    backendProcess.on('error', (err) => {
      log('ERROR', `Spawn error: ${err.message}`);
      reject(new Error(`无法启动后端进程: ${err.message}`));
    });

    backendProcess.on('close', (code) => {
      log('ERROR', `Backend process exited with code ${code}`);
      if (!started) reject(new Error(`后端进程意外退出 (代码: ${code})`));
    });

    setTimeout(() => {
      if (!started) {
        log('WARN', 'Backend startup timeout (10s), continuing anyway');
        started = true;
        resolve();
      }
    }, 10000);
  });
}

function waitForServer(maxRetries = 15) {
  return new Promise((resolve) => {
    let retries = 0;
    const check = () => {
      const req = http.get(`${APP_URL}/api/llm/config`, (res) => {
        log('INFO', `Server health check: HTTP ${res.statusCode}`);
        if (res.statusCode === 200) {
          log('INFO', 'Server ready');
          resolve(true);
        } else {
          log('INFO', `Server responded ${res.statusCode}, treating as ready`);
          resolve(true);
        }
      });
      req.on('error', (err) => {
        retries++;
        if (retries <= maxRetries) {
          if (retries % 3 === 0) {
            log('INFO', `Server wait retry ${retries}/${maxRetries}: ${err.message}`);
          }
          setTimeout(check, 1000);
        } else {
          log('WARN', `Server wait timeout after ${maxRetries} retries`);
          resolve(false);
        }
      });
      req.setTimeout(2000, () => {
        req.destroy();
        retries++;
        if (retries <= maxRetries) {
          setTimeout(check, 1000);
        } else {
          log('WARN', `Server wait timeout after ${maxRetries} retries`);
          resolve(false);
        }
      });
    };
    check();
  });
}

function getLoadingHTML(status) {
  const stepDot = (n) => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${status >= n ? '#14B8A6' : 'rgba(255,255,255,0.08)'};${status === n ? 'box-shadow:0 0 8px rgba(6,182,212,0.6);' : ''}"></span>`;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Microsoft YaHei',sans-serif;background:#060B14;color:#E2E8F0;display:flex;align-items:center;justify-content:center;height:100vh;user-select:none}
.c{text-align:center;padding:48px;max-width:480px}
.logo{width:80px;height:80px;margin:0 auto 24px;background:linear-gradient(135deg,#06B6D4,#14B8A6);border-radius:20px;display:flex;align-items:center;justify-content:center}
.logo svg{width:44px;height:44px}
h1{font-size:30px;font-weight:800;background:linear-gradient(135deg,#06B6D4,#22D3EE);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
.sub{font-size:13px;color:#64748B;margin-bottom:36px}
.bar{width:100%;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;margin-bottom:6px}
.fill{height:100%;border-radius:2px;transition:width 1s ease;background:linear-gradient(90deg,#06B6D4,#14B8A6);width:${status===0?'10%':status===1?'30%':status===2?'60%':status===3?'80%':'100%'}}
.steps{display:flex;justify-content:space-between;margin:12px 8px 0}
.status{font-size:14px;color:#94A3B8;margin-top:20px}
.err{color:#EF4444!important}.fill.red{background:#EF4444}
</style></head><body><div class="c">
<div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/><circle cx="12" cy="12" r="2" fill="white"/></svg></div>
<h1>RTA-LLM</h1><p class="sub">反思性主体分析 · AI 质性研究工具</p>
<div class="bar"><div class="fill${status<0?' red':''}"></div></div>
<div class="steps">${stepDot(1)}${stepDot(2)}${stepDot(3)}${stepDot(4)}</div>
<p class="status${status<0?' err':''}">${status<0?'启动失败':status===0?'正在初始化…':status===1?'正在检查运行环境…':status===2?'正在启动后端服务…':status===3?'等待服务就绪…':'正在加载应用…'}</p>
</div></body></html>`;
}

function showLoading(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getLoadingHTML(status))}`);
  }
}

function createMainWindow() {
  try {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 900,
      minHeight: 600,
      frame: true,
      autoHideMenuBar: true,
      backgroundColor: '#060B14',
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });

    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getLoadingHTML(0))}`);

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      mainWindow.focus();
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    mainWindow.webContents.on('did-fail-load', (event, code, desc) => {
      log('ERROR', `Page load failed: ${code} - ${desc}`);
    });

    const menuTemplate = [
      {
        label: 'RTA-LLM',
        submenu: [
          { label: '关于', click: () => showAbout() },
          { type: 'separator' },
          { label: '退出', accelerator: 'Alt+F4', click: () => app.quit() },
        ],
      },
      {
        label: '视图',
        submenu: [
          { label: '刷新', accelerator: 'F5', click: () => mainWindow?.reload() },
          { label: '开发者工具', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() },
        ],
      },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
    log('INFO', 'Main window created');
  } catch (err) {
    log('ERROR', `Window creation failed: ${err.message}`);
    try { dialog.showErrorBox('启动失败', `窗口创建失败:\n${err.message}`); } catch (e) {}
  }
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '关于 RTA-LLM',
    message: 'RTA-LLM v1.0',
    detail: '基于反思性主题分析法(RTA)的质性研究LLM分析工具。\n\n支持 OpenAI / Claude / Gemini / DeepSeek / Kimi / 豆包 / MiniMax 等大模型。\n\n© 2025 RTA-LLM',
  });
}

async function boot() {
  initLogger();
  log('INFO', '=== Boot sequence started ===');

  showLoading(1);

  try {
    await startBackend();
  } catch (err) {
    log('ERROR', `Backend start failed: ${err.message}`);
    showLoading(-1);
    return;
  }

  showLoading(3);

  const ready = await waitForServer();

  if (ready) {
    log('INFO', 'Loading app UI');
    showLoading(4);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(APP_URL);
      }
    }, 500);
  } else {
    log('WARN', 'Server not ready, attempting to load anyway');
    showLoading(4);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(APP_URL);
      }
    }, 500);
  }

  log('INFO', '=== Boot sequence finished ===');
}

app.whenReady().then(() => {
  createMainWindow();
  if (mainWindow) {
    setTimeout(() => boot(), 300);
  } else {
    try { dialog.showErrorBox('启动失败', '无法创建应用窗口，请查看日志。\n\n日志位置: %APPDATA%\\RTA-LLM\\logs\\'); } catch (e) {}
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  log('INFO', 'Shutting down');
  if (logStream) {
    logStream.end();
  }
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        backendProcess.kill('SIGKILL');
      }
    }, 3000);
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
    setTimeout(() => boot(), 200);
  }
});

ipcMain.handle('open-external', async (_event, url) => {
  await shell.openExternal(url);
});
