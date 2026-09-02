# -*- coding: utf-8 -*-
"""百尺方圆 · 桌面版入口

双击 exe 后：
  1. 启动内嵌本地服务（端口自适应：8899 空闲则绑定，被网页版占用则复用，被其他程序占用则顺延）
  2. 后台拉起 nanobot Agent 服务
  3. 用 Chrome / Edge 的「应用模式」打开独立窗口（无地址栏，视觉等同桌面应用）
  4. 关闭窗口后服务自动退出

用法:
  开发模式:  python app.py
  测试模式:  set WB_NO_GUI=1 && python app.py   （只起服务不弹窗，供 CI/验证）
  打包模式:  pyinstaller BaiChiWorkbench.spec 后运行 dist\\BaiChiWorkbench.exe
"""
import os
import sys
import time
import socket
import threading
import subprocess
import urllib.request
import webbrowser

# ---- 端口 ----
SERVE_PORT = 8899          # serve.py 页面托管端口
NANO_DEFAULT_PORT = 8765   # nanobot 后端端口

# ---- 工作台目录：桌面版固定为 exe/脚本所在目录 ----
if getattr(sys, "frozen", False):
    APP_DIR = os.path.dirname(sys.executable)
else:
    APP_DIR = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("APP_DIR", APP_DIR)

_NO_GUI = os.environ.get("WB_NO_GUI", "0") == "1"   # 测试模式：不起窗口

# 常见浏览器路径（应用模式优先 Chrome，其次 Edge；找不到则系统默认浏览器）
_BROWSERS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]


def _port_open(port, timeout=0.6):
    """探测端口是否可连接"""
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


def _is_workbench(port):
    """探测端口上的服务是否为当前工作台页面"""
    try:
        urllib.request.urlopen(
            "http://127.0.0.1:%d/workbench-desktop.html" % port, timeout=1.5
        )
        return True
    except Exception:
        return False


def _probe_nano(port):
    """探测 nanobot 是否在线（OpenAI 兼容 /v1/models）"""
    try:
        urllib.request.urlopen("http://127.0.0.1:%d/v1/models" % port, timeout=1.5)
        return True
    except Exception:
        return False


def start_server():
    """启动 serve.py 的 HTTP 服务。

    端口自适应：
    - 目标端口空闲 → 绑定并启动
    - 目标端口已被本工作台占用（网页版在跑）→ 返回 (None, port) 复用现有服务
    - 被其他程序占用 → 顺延 8900~8914 找空闲端口
    返回 (httpd, port)；httpd 为 None 表示复用现有服务（退出时无需关闭）。
    """
    import serve
    from socketserver import ThreadingTCPServer

    port = serve.PORT
    if _port_open(port):
        if _is_workbench(port):
            return None, port          # 网页版已在跑，直接复用
        for p in range(port + 1, port + 16):
            if not _port_open(p):
                port = p
                break

    serve.PORT = port
    httpd = ThreadingTCPServer(("", port), serve.Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True, name="serve-httpd")
    t.start()
    return httpd, port


def ensure_nanobot():
    """若 nanobot 未运行且 serve 已启动，调用其 start API 拉起（静默失败）"""
    if _probe_nano(NANO_DEFAULT_PORT):
        return
    try:
        urllib.request.urlopen(
            "http://127.0.0.1:%d/api/nanobot/start?port=%d" % (SERVE_PORT, NANO_DEFAULT_PORT),
            timeout=20,
        )
    except Exception:
        pass  # nanobot 未安装时静默，用户可在设置页手动处理


def find_app_browser():
    """返回可用的浏览器可执行文件路径，找不到返回 None"""
    for p in _BROWSERS:
        if os.path.isfile(p):
            return p
    return None


def open_app_window(url):
    """以应用模式打开独立窗口（无地址栏）。

    返回 True 表示已尝试启动；启动失败返回 False（调用方回退系统浏览器）。
    """
    exe = find_app_browser()
    try:
        if exe:
            name = os.path.basename(exe).lower()
            # Chrome/Edge 应用模式：--app=URL 生成独立无边框窗口
            flags = ["--app=" + url]
            if "chrome" in name:
                flags += ["--new-window"]
            subprocess.Popen([exe] + flags)
            return True
        # 无浏览器可执行文件 → 系统默认浏览器
        webbrowser.open(url)
        return True
    except Exception:
        try:
            webbrowser.open(url)
            return True
        except Exception:
            return False


# 页面窗口标题（workbench-desktop.html 的 <title>），用于检测应用窗口是否存活
APP_WINDOW_TITLE = "百尺方圆"


def _app_window_count():
    """统计当前桌面上的顶层窗口标题包含「百尺方圆」的数量（ctypes 枚举，无外部依赖）。

    返回 -1 表示检测失败（保守处理：视为窗口仍存在，不退出）。
    """
    try:
        import ctypes
        user32 = ctypes.windll.user32
        count = [0]

        @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
        def _cb(hwnd, lparam):
            if user32.IsWindowVisible(hwnd):
                n = user32.GetWindowTextLengthW(hwnd)
                if n > 0:
                    buf = ctypes.create_unicode_buffer(n + 1)
                    user32.GetWindowTextW(hwnd, buf, n + 1)
                    if APP_WINDOW_TITLE in buf.value:
                        count[0] += 1
            return True

        user32.EnumWindows(_cb, 0)
        return count[0]
    except Exception:
        return -1


def wait_windows_closed(timeout=12 * 3600):
    """轮询等待：所有「百尺方圆」应用窗口关闭后延时退出。

    - 每 3 秒检测一次窗口数量
    - 窗口全部关闭后再等 10 秒缓冲（避免误判），确认无窗口后返回
    - 超时（默认 12 小时）兜底退出
    """
    t0 = time.time()
    gone_since = None
    while time.time() - t0 < timeout:
        n = _app_window_count()
        if n == 0:
            if gone_since is None:
                gone_since = time.time()
            elif time.time() - gone_since >= 10:
                return
        else:
            gone_since = None
        time.sleep(3)
    return


def main():
    # 1) 启动本地 HTTP 服务（端口自适应：空闲/复用/顺延）
    httpd = None
    port = SERVE_PORT
    try:
        httpd, port = start_server()
    except Exception as e:
        print("启动本地服务失败: %s" % e, file=sys.stderr)
        sys.exit(1)

    for _ in range(30):
        if _port_open(port):
            break
        time.sleep(0.2)

    # 2) 后台拉起 nanobot（不阻塞窗口打开）
    threading.Thread(target=ensure_nanobot, daemon=True).start()

    page_url = "http://127.0.0.1:%d/workbench-desktop.html" % port

    # 3) 测试模式：不起窗口，保持服务运行（供自动化验证）
    if _NO_GUI:
        print("WB_NO_GUI=1 测试模式：服务运行于 %s" % page_url)
        print("按 Ctrl+C 停止")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        if httpd:
            httpd.shutdown()
        return

    # 4) 打开应用窗口（Chrome/Edge 应用模式）
    ok = open_app_window(page_url)
    if not ok:
        print("无法打开浏览器窗口：%s" % page_url, file=sys.stderr)

    # 5) 保持服务运行：等待所有「百尺方圆」应用窗口关闭后自动退出
    try:
        wait_windows_closed()
    except KeyboardInterrupt:
        pass
    finally:
        if httpd:
            try:
                httpd.shutdown()
            except Exception:
                pass


if __name__ == "__main__":
    main()
