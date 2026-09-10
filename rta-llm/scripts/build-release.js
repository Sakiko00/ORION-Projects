const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const BACKEND = path.join(ROOT, 'backend');
const RELEASE = path.join(ROOT, 'release', 'RTA-LLM');

const log = (msg) => console.log(`\x1b[36m${msg}\x1b[0m`);
const ok = (msg) => console.log(`  \x1b[32m\u2714 ${msg}\x1b[0m`);

log('\n=== RTA-LLM \u53D1\u5E03\u5305\u6784\u5EFA ===\n');

[RELEASE, path.join(BACKEND, 'dist'), path.join(FRONTEND, 'out')].forEach(d => {
  fs.rmSync(d, { recursive: true, force: true });
});
ok('\u6E05\u7406\u5B8C\u6210');

log('\u6784\u5EFA\u524D\u7AEF...');
execSync('npx next build', { cwd: FRONTEND, stdio: 'inherit' });
ok('\u524D\u7AEF OK');

log('\u6784\u5EFA\u540E\u7AEF...');
execSync('npx nest build', { cwd: BACKEND, stdio: 'inherit' });
ok('\u540E\u7AEF OK');

log('\u7EC4\u88C5\u53D1\u5E03\u5305...');
fs.mkdirSync(RELEASE, { recursive: true });
fs.mkdirSync(path.join(RELEASE, 'data'), { recursive: true });

copyDir(path.join(FRONTEND, 'out'), path.join(RELEASE, 'frontend', 'out'));
copyDir(path.join(BACKEND, 'dist'), path.join(RELEASE, 'dist'));

const pkg = JSON.parse(fs.readFileSync(path.join(BACKEND, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies);
fs.mkdirSync(path.join(RELEASE, 'node_modules'), { recursive: true });

const srcNM = path.join(BACKEND, 'node_modules');
const destNM = path.join(RELEASE, 'node_modules');
for (const entry of fs.readdirSync(srcNM, { withFileTypes: true })) {
  if (entry.name.startsWith('.') || entry.name === '.bin') continue;
  const src = path.join(srcNM, entry.name);
  const dest = path.join(destNM, entry.name);
  if (fs.existsSync(src)) copyDir(src, dest);
}

fs.writeFileSync(path.join(RELEASE, 'start.bat'),
`@echo off
chcp 65001 >nul
title  RTA-LLM v1.0 - AI\u8D28\u6027\u7814\u7A76\u5DE5\u5177
set NODE_ENV=production
set PORT=4000

echo.
echo   ==============================================================
echo                      RTA-LLM  v1.0
echo              \u53CD\u601D\u6027\u4E3B\u9898\u5206\u6790\u6CD5 - AI \u8D28\u6027\u7814\u7A76\u5DE5\u5177
echo   ==============================================================
echo.
echo   [\u542F\u52A8\u4E2D] \u6B63\u5728\u521D\u59CB\u5316\u540E\u7AEF\u670D\u52A1...
echo.
echo   +\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D+\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D+
echo   |  \u670D\u52A1\u5730\u5740          |  http://localhost:4000                  |
echo   |  \u6570\u636E\u5B58\u50A8          |  SQLite (data/rta.db)                  |
echo   |  \u65E0\u9700 Redis        |  \u5355\u6587\u4EF6\u5939\u81EA\u5305\u542B                       |
echo   +\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D+\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D\u002D+
echo.
echo   \u6D4F\u89C8\u5668\u5C06\u81EA\u52A8\u6253\u5F00\u3002\u5982\u672A\u6253\u5F00\uFF0C\u8BF7\u624B\u52A8\u8BBF\u95EE\u4E0A\u8FF0\u5730\u5740\u3002
echo   \u6309 Ctrl+C \u6216\u5173\u95ED\u6B64\u7A97\u53E3\u505C\u6B62\u670D\u52A1\u3002
echo.

start "" "http://localhost:4000"
node dist/main.js

if %errorlevel% neq 0 (
    echo.
    echo   [\u9519\u8BEF] \u670D\u52A1\u542F\u52A8\u5931\u8D25! \u8BF7\u786E\u8BA4\u7CFB\u7EDF\u5DF2\u5B89\u88C5 Node.js\u3002
    echo.
    pause
)
`.replace(/\n/g, '\r\n'));

ok(`\u2705 \u53D1\u5E03\u5305: ${RELEASE}`);
console.log(`\n  \u590D\u5236 release\\RTA-LLM \u6587\u4EF6\u5939\u5230\u4EFB\u610F\u7535\u8111\uFF0C\u53CC\u51FB start.bat \u5373\u53EF\u8FD0\u884C\n`);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) copyDir(s, d);
    else {
      try { fs.copyFileSync(s, d); } catch {}
    }
  }
}
