const fs = require('fs');
const path = require('path');

function pngToIco(pngPath, icoPath) {
  const pngData = fs.readFileSync(pngPath);
  
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const pngSize = pngData.length;
  const entry = Buffer.alloc(16);
  const img = { width: 256, height: 256 };
  if (img.width >= 256) img.width = 0;
  if (img.height >= 256) img.height = 0;

  entry.writeUInt8(img.width, 0);
  entry.writeUInt8(img.height, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngSize, 8);
  entry.writeUInt32LE(6 + 16, 12);

  const buf = Buffer.concat([header, entry, pngData]);
  fs.writeFileSync(icoPath, buf);
  console.log(`✅ ${path.basename(icoPath)} (${(buf.length / 1024).toFixed(1)} KB)`);
}

const outDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

pngToIco(path.join(__dirname, '..', 'img', '自信微笑.png'), path.join(outDir, 'installer.ico'));
pngToIco(path.join(__dirname, '..', 'img', '哭哭.png'), path.join(outDir, 'uninstaller.ico'));
console.log('✅ 图标转换完成');
