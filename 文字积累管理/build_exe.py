# -*- coding: utf-8 -*-
"""
打包脚本：用 PyInstaller 把 app/server.py 打成单文件 EXE
产物：dist/文字积累.exe
双击后启动本地 HTTP 服务并打开默认浏览器。
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PYI = ROOT / ".venv" / "Scripts" / "pyinstaller.exe"

if not PYI.exists():
    print("找不到 pyinstaller，请先在 .venv 里安装：pip install pyinstaller")
    sys.exit(1)

cmd = [
    str(PYI),
    "--noconfirm",
    "--clean",
    "--onefile",
    "--noconsole",
    "--name", "文字积累",
    "--icon", str(ROOT / "assets" / "icon.ico"),
    # 资源（打包后位于 _MEIPASS 根目录）
    "--add-data", f"{ROOT / 'app' / 'index.html'};.",
    "--add-data", f"{ROOT / 'app' / 'assets'};assets",
    "--add-data", f"{ROOT / 'app' / '文字积累整理.md'};.",
    "--hidden-import", "socketserver",
    str(ROOT / "app" / "server.py"),
]

print(" ".join(cmd))
r = subprocess.run(cmd, cwd=str(ROOT))
sys.exit(r.returncode)