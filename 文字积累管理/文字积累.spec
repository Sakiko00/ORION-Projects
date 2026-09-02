# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['D:/项目Project/文字积累管理/app/server.py'],
    pathex=[],
    binaries=[],
    datas=[('D:/项目Project/文字积累管理/app/index.html', '.'), ('D:/项目Project/文字积累管理/app/assets', 'assets'), ('D:/项目Project/文字积累管理/app/文字积累整理.md', '.')],
    hiddenimports=['socketserver'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='文字积累',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['D:/项目Project/文字积累管理/assets/icon.ico'],
)
