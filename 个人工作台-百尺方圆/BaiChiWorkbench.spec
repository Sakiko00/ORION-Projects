# -*- mode: python ; coding: utf-8 -*-
# BaiChiWorkbench.spec —— 百尺方圆工作台桌面版打包配置
a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('workbench-desktop.html', '.'),
        ('assets', 'assets'),
    ],
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=['tkinter'],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='BaiChiWorkbench',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,          # 无控制台窗口
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
