const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const BACKEND = path.join(ROOT, 'backend');
const RELEASE = path.join(ROOT, 'release');
const NODE_PORTABLE = path.join(ROOT, 'node-portable');

const log = (msg) => console.log(`\x1b[36m${msg}\x1b[0m`);
const success = (msg) => console.log(`\x1b[32m  ✓ ${msg}\x1b[0m`);
const warn = (msg) => console.log(`\x1b[33m  ⚠ ${msg}\x1b[0m`);

function countFiles(dir) {
  let count = 0;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isFile()) count++;
    else if (item.isDirectory()) count += countFiles(path.join(dir, item.name));
  }
  return count;
}

function checkDependencies() {
  const pkgPath = path.join(BACKEND, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error('backend/package.json not found');
  }

  const nmPath = path.join(BACKEND, 'node_modules');
  if (!fs.existsSync(nmPath)) {
    log('  Installing backend dependencies...');
    execSync('npm install', { cwd: BACKEND, stdio: 'inherit' });
    success('Backend dependencies installed');
  } else {
    success('Backend dependencies OK');
  }
}

function prepareNodePortable() {
  const nodeExe = path.join(NODE_PORTABLE, 'node.exe');
  if (fs.existsSync(nodeExe)) {
    success('Node.js 便携版已就绪');
    return;
  }

  log('  准备 Node.js 便携版...');
  try {
    execSync('node scripts/download-node.js', { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    warn('Node.js 便携版下载失败，尝试从系统复制...');
    try {
      const whereResult = execSync('where node', { encoding: 'utf8', timeout: 3000 });
      const systemNode = whereResult.split('\n')[0].trim();
      if (systemNode && fs.existsSync(systemNode)) {
        fs.mkdirSync(NODE_PORTABLE, { recursive: true });
        fs.copyFileSync(systemNode, nodeExe);
        success(`已从系统复制 Node.js: ${systemNode}`);
      }
    } catch (e2) {
      throw new Error('无法获取 Node.js 便携版，且系统未安装 Node.js');
    }
  }
}

async function main() {
  console.log('\n============================================');
  console.log('  RTA-LLM 打包脚本  v4.0');
  console.log('  目标: Windows NSIS 安装包 (内置 Node.js)');
  console.log('============================================\n');

  log('[1/7] 清理旧构建...');
  [RELEASE, path.join(BACKEND, 'dist'), path.join(FRONTEND, 'out')].forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  success('已清理');

  log('[2/7] 准备 Node.js 便携版...');
  try {
    prepareNodePortable();
  } catch (e) {
    warn(`Node.js 准备失败: ${e.message}`);
    process.exit(1);
  }

  log('[3/7] 检查后端依赖...');
  try {
    checkDependencies();
  } catch (e) {
    warn(`依赖检查失败: ${e.message}`);
    process.exit(1);
  }

  log('[4/7] 构建前端静态文件 (Next.js export)...');
  try {
    execSync('npx next build', { cwd: FRONTEND, stdio: 'inherit' });
    success('前端构建成功');
  } catch (e) {
    warn('前端构建失败, 请检查前端依赖');
    process.exit(1);
  }

  log('[4.5/7] 复制前端产物到后端目录...');
  const frontendOut = path.join(FRONTEND, 'out');
  const backendFrontend = path.join(BACKEND, 'frontend-out');
  if (fs.existsSync(frontendOut)) {
    if (fs.existsSync(backendFrontend)) {
      fs.rmSync(backendFrontend, { recursive: true, force: true });
    }
    fs.cpSync(frontendOut, backendFrontend, { recursive: true });
    success(`已复制 -> backend/frontend-out (${countFiles(backendFrontend)} 文件)`);
  } else {
    throw new Error(`frontend/out not found at ${frontendOut}`);
  }

  log('[5/7] 构建后端 (NestJS)...');
  try {
    execSync('npx nest build', { cwd: BACKEND, stdio: 'inherit' });
    success('后端构建成功');
  } catch (e) {
    warn('后端构建失败, 请检查后端依赖');
    process.exit(1);
  }

  log('[6/8] 验证构建产物...');
  const checks = [
    { path: path.join(BACKEND, 'frontend-out', 'index.html'), name: 'Frontend in backend' },
    { path: path.join(BACKEND, 'dist', 'main.js'), name: 'Backend main.js' },
    { path: path.join(BACKEND, 'node_modules', '@nestjs'), name: 'NestJS modules' },
    { path: path.join(NODE_PORTABLE, 'node.exe'), name: 'Node.js portable' },
  ];

  for (const check of checks) {
    if (!fs.existsSync(check.path)) {
      throw new Error(`${check.name} not found at ${check.path}`);
    }
    success(`${check.name} OK`);
  }

  log('[8/8] electron-builder 打包安装包...\n  这一步可能需要 3-8 分钟，请耐心等待...');
  try {
    execSync('npx electron-builder build --win nsis', { 
      cwd: ROOT, 
      stdio: 'inherit',
      env: { ...process.env, ELECTRON_BUILDER_BINARIES_MIRROR: process.env.ELECTRON_BUILDER_BINARIES_MIRROR || 'https://npmmirror.com/mirrors/electron-builder-binaries/' }
    });
    
    console.log('\n============================================');
    success('✅ 打包成功!');
    console.log('============================================\n');
    
    const exePath = path.join(RELEASE, 'RTA-LLM Setup 1.0.0.exe');
    if (fs.existsSync(exePath)) {
      const stats = fs.statSync(exePath);
      console.log(`\n✅ 输出文件: ${path.basename(exePath)}`);
      console.log(`   文件大小: ${(stats.size / 1024 / 1024).toFixed(1)} MB\n`);
      console.log('📝 使用说明:');
      console.log('   1. 双击安装包，选择安装目录');
      console.log('   2. 安装完成后桌面自动创建快捷方式');
      console.log('   3. 双击桌面快捷方式启动程序\n');
    } else {
      const alt = path.join(RELEASE, 'RTA-LLM Setup.exe');
      if (fs.existsSync(alt)) {
        const stats = fs.statSync(alt);
        console.log(`\n✅ 输出文件: ${path.basename(alt)}`);
        console.log(`   文件大小: ${(stats.size / 1024 / 1024).toFixed(1)} MB\n`);
      }
    }
  } catch (e) {
    warn('\n打包失败，可能的原因:');
    warn('  1. 网络问题 - Electron 下载失败');
    warn('  2. 后端 node_modules 过大 (>500MB)');
    warn('  3. Native 模块编译问题\n');
    console.error(e.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});