# -*- coding: utf-8 -*-
"""
文字积累管理 · 全局配置
负责数据目录的解析 / 记忆，尽量把读写都放在非系统盘，减少 C 盘占用。
"""
import os
import sys
import json


def _app_root() -> str:
    """程序所在目录（打包后为 exe 所在目录，开发时为项目目录）。"""
    if getattr(sys, "frozen", False):  # PyInstaller 打包
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


APP_ROOT = _app_root()

# 记忆数据目录的配置文件（放在 exe 旁边，默认 D/WORKDIR 之外）。
# 注意：不要放在 C 盘，默认也跟随 exe 所在盘。
_CFG_FILE = os.path.join(APP_ROOT, "app_cfg.json")


def system_drives():
    """返回本机可用盘符列表（大写字母）。"""
    drives = []
    for letter in "CDEFGHIJKLMNOPQRSTUVWXYZ":
        if os.path.exists(f"{letter}:\\"):
            drives.append(letter)
    return drives or ["C"]


def _default_data_dir() -> str:
    """
    默认数据目录策略：
    1) 优先使用 D 盘（通常空间大且不是系统盘）；
    2) 否则回退到 exe 所在盘；
    3) 尽量避开 C 盘。
    """
    drives = system_drives()
    # exe 所在盘的盘符
    exe_drive = os.path.splitdrive(APP_ROOT)[0].rstrip(":").upper()
    # 用户上次自定义目录已记录在 app_cfg.json
    for candidate in ["D", "E", "F"]:
        if candidate in drives:
            return os.path.join(f"{candidate}:\\", "文字积累管理", "data")
    # 回退到 exe 所在盘（如果不是 C 盘）
    if exe_drive and exe_drive != "C":
        return os.path.join(APP_ROOT, "data")
    # 实在不行用 D 盘或 C 盘用户目录，但优先非系统盘
    for letter in system_drives():
        if letter != "C":
            return os.path.join(f"{letter}:\\", "文字积累管理", "data")
    return os.path.join(os.path.expanduser("~"), ".wenzi_memo", "data")


def _user_drive() -> str:
    """用户主目录所在的盘符。"""
    home = os.path.expanduser("~") or APP_ROOT
    return os.path.splitdrive(home)[0].rstrip(":").upper()


def get_data_dir() -> str:
    """读取当前生效的数据目录。"""
    cfg = {}
    try:
        if os.path.exists(_CFG_FILE):
            with open(_CFG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        custom = cfg.get("data_dir")
        if custom and os.path.isdir(custom):
            return custom
        if custom:
            # 自定义目录失效（盘不存在等），仍尽量重建
            try:
                os.makedirs(custom, exist_ok=True)
                return custom
            except Exception:
                pass
    except Exception:
        pass
    return _default_data_dir()


def set_data_dir(path: str) -> str:
    """保存用户指定的数据目录。返回规范化后的路径。"""
    path = os.path.normpath(path) if path else ""
    if not path:
        path = _default_data_dir()
    try:
        os.makedirs(path, exist_ok=True)
        cfg = {"data_dir": path}
        try:
            with open(_CFG_FILE, "w", encoding="utf-8") as f:
                json.dump(cfg, f, ensure_ascii=False, indent=2)
        except Exception:
            pass  # 无法写入配置也继续用当前路径
    except Exception:
        raise
    return path