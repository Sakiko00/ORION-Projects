const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE_PORTABLE_DIR = path.join(ROOT, 'node-portable');
const NODE_VERSION = 'v24.14.0';
const NODE_URL = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`;
const ZIP_PATH = path.join(ROOT, 'node-temp.zip');

const log = (msg) => console.log(`\x1b[36m${msg}\x1b[0m`);
const success = (msg) => console.log(`\x1b[32m  ✓ ${msg}\x1b[0m`);
const warn = (msg) => console.log(`\x1b[33m  ⚠ ${msg}\x1b[0m`);

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const total = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total) {
          const percent = ((downloaded / total) * 100).toFixed(1);
          process.stdout.write(`\r  下载中... ${percent}% (${(downloaded / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB)`);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log('');
        resolve();
      });

      file.on('error', (err) => {
        file.close();
        fs.unlinkSync(dest);
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  console.log('\n============================================');
  console.log('  Node.js 便携版下载脚本');
  console.log(`  版本: ${NODE_VERSION} (Windows x64)`);
  console.log('============================================\n');

  if (fs.existsSync(NODE_PORTABLE_DIR)) {
    const nodeExe = path.join(NODE_PORTABLE_DIR, 'node.exe');
    if (fs.existsSync(nodeExe)) {
      success(`Node.js 便携版已存在: ${nodeExe}`);
      return;
    }
    fs.rmSync(NODE_PORTABLE_DIR, { recursive: true, force: true });
  }

  fs.mkdirSync(NODE_PORTABLE_DIR, { recursive: true });

  log(`下载 Node.js ${NODE_VERSION} 便携版...`);
  log(`  URL: ${NODE_URL}`);

  try {
    await downloadFile(NODE_URL, ZIP_PATH);
    success('下载完成');

    log('解压 node.exe...');
    try {
      execSync(`powershell -Command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${NODE_PORTABLE_DIR}' -Force"`, {
        stdio: 'pipe',
        timeout: 30000
      });
    } catch (e) {
      warn('PowerShell 解压失败，尝试使用 tar...');
      execSync(`tar -xf "${ZIP_PATH}" -C "${NODE_PORTABLE_DIR}"`, { stdio: 'pipe', timeout: 30000 });
    }

    const extractedDir = path.join(NODE_PORTABLE_DIR, `node-${NODE_VERSION}-win-x64`);
    if (fs.existsSync(extractedDir)) {
      const nodeExe = path.join(extractedDir, 'node.exe');
      if (fs.existsSync(nodeExe)) {
        fs.copyFileSync(nodeExe, path.join(NODE_PORTABLE_DIR, 'node.exe'));
        fs.rmSync(extractedDir, { recursive: true, force: true });
      }
    }

    fs.unlinkSync(ZIP_PATH);

    const finalNodeExe = path.join(NODE_PORTABLE_DIR, 'node.exe');
    if (fs.existsSync(finalNodeExe)) {
      const stats = fs.statSync(finalNodeExe);
      success(`Node.js 便携版就绪: ${finalNodeExe} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
    } else {
      throw new Error('node.exe 提取失败');
    }
  } catch (e) {
    warn(`下载失败: ${e.message}`);
    warn('尝试使用本地 Node.js 副本...');

    try {
      const whereResult = execSync('where node', { encoding: 'utf8', timeout: 3000 });
      const systemNode = whereResult.split('\n')[0].trim();
      if (systemNode && fs.existsSync(systemNode)) {
        fs.copyFileSync(systemNode, path.join(NODE_PORTABLE_DIR, 'node.exe'));
        success(`已从系统复制 Node.js: ${systemNode}`);
      } else {
        throw new Error('未找到系统 Node.js');
      }
    } catch (e2) {
      warn('无法获取 Node.js 便携版，打包后将依赖系统 Node.js');
      if (fs.existsSync(NODE_PORTABLE_DIR)) {
        fs.rmSync(NODE_PORTABLE_DIR, { recursive: true, force: true });
      }
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});