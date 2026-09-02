# -*- coding: utf-8 -*-
"""百尺方圆 · 本地页面服务 + nanobot 启停管理

- 静态页面托管：http://localhost:8899
- nanobot 管理 API（同源，前端直接 fetch）：
    GET  /api/nanobot/status          查询 nanobot 运行状态
    POST /api/nanobot/start           启动 nanobot（需已安装并加入 PATH）
    POST /api/nanobot/stop            停止 nanobot（按端口结束进程）
  端口参数：?port=8765（默认 8765）
"""
import http.server
import socketserver
import os
import sys
import json
import re
import time
import shutil
import subprocess
import urllib.request
import urllib.parse

# PyInstaller --windowed 模式下 sys.stdout/sys.stderr 可能为 None，
# 日志写入会抛 AttributeError 导致 HTTP 连接被无响应关闭。兜底为 devnull。
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

PORT = 8899        # 页面托管端口（8765 已让给 nanobot 后端）
NANO_DEFAULT_PORT = 8765
NANO_PROC = None   # 记录由本管理器启动的 nanobot 进程

# 工作台目录：优先取环境变量 APP_DIR（桌面版由 app.py 注入），
# 其次取当前脚本所在目录，兼容 PyInstaller 打包（_MEIPASS 与数据目录分离）。
def _resolve_dir():
    env_dir = os.environ.get("APP_DIR", "").strip()
    if env_dir and os.path.isdir(env_dir):
        return env_dir
    try:
        if getattr(sys, "frozen", False):
            return os.path.dirname(sys.executable)
    except Exception:
        pass
    return os.path.dirname(os.path.abspath(__file__))

DIR = _resolve_dir()

# 静态资源目录：PyInstaller 打包时静态文件在 _MEIPASS（随 exe 内嵌）；
# 未打包时与数据目录相同。优先检查 workbench-desktop.html 是否存在于候选目录。
def _resolve_web_dir():
    candidates = []
    try:
        if getattr(sys, "frozen", False):
            candidates.append(getattr(sys, "_MEIPASS", ""))
    except Exception:
        pass
    candidates.append(DIR)
    for c in candidates:
        if c and os.path.isfile(os.path.join(c, "workbench-desktop.html")):
            return c
    return candidates[0] or DIR

WEB_DIR = _resolve_web_dir()

os.chdir(DIR)

def probe_nano(port, timeout=2):
    """探测 nanobot 是否在线（OpenAI 兼容 /v1/models）"""
    try:
        urllib.request.urlopen("http://127.0.0.1:%d/v1/models" % port, timeout=timeout)
        return True
    except Exception:
        return False

def user_nano_bin():
    """用户自定义 nanobot 路径（设置页手动切换，存于 nanobot/bin-path.json 或环境变量 NANOBOT_BIN）"""
    bin_file = os.path.join(DIR, "nanobot", "bin-path.json")
    try:
        with open(bin_file, encoding="utf-8") as f:
            d = json.load(f)
        b = (d.get("bin") or "").strip()
        if b and os.path.isfile(b):
            return b
    except Exception:
        pass
    b = os.environ.get("NANOBOT_BIN", "").strip()
    if b and os.path.isfile(b):
        return b
    return None

def find_nanobot_cmd():
    """定位 nanobot 可执行文件：
    1) 用户自定义路径（设置页手动切换：nanobot/bin-path.json，或环境变量 NANOBOT_BIN）
    2) uv tool 安装的 console script（绕开 uv shim，tempfile 正常）
    3) PATH 中的 nanobot
    4) 常见路径兜底
    """
    # 1) 用户自定义（最高优先）
    custom = user_nano_bin()
    if custom:
        return custom
    # 2) uv tool 安装的 console script（绕开 uv shim，tempfile 正常）
    uv_tool = os.path.join(os.environ.get("APPDATA", ""), "uv", "tools", "nanobot-ai", "Scripts", "nanobot.exe")
    if os.path.isfile(uv_tool):
        return uv_tool
    # 3) PATH 中的 nanobot
    for c in ("nanobot", "nanobot.exe"):
        p = shutil.which(c)
        if p:
            return p
    # 4) 常见路径兜底
    candidates = [
        os.path.join(os.path.expanduser("~"), ".local", "bin", "nanobot.exe"),
        os.path.join(os.path.expanduser("~"), "go", "bin", "nanobot.exe"),
        os.path.join(os.path.expanduser("~"), ".cargo", "bin", "nanobot.exe"),
        os.path.join(os.path.expanduser("~"), "scoop", "shims", "nanobot.exe"),
    ]
    for p in candidates:
        if os.path.isfile(p):
            return p
    return None

def nano_config_path():
    """nanobot 配置文件（工作台打包）"""
    p = os.path.join(DIR, "nanobot", "config.json")
    if os.path.isfile(p):
        return p
    return os.path.join(os.path.expanduser("~"), ".nanobot", "config.json")

class Handler(http.server.SimpleHTTPRequestHandler):
    # 常见静态资源类型
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update({".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
                           ".webp": "image/webp", ".js": "application/javascript"})

    def __init__(self, *args, **kwargs):
        # 静态文件从 WEB_DIR 提供（打包时 _MEIPASS，未打包时 DIR）
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    # ---- 工具方法 ----
    def _query_port(self):
        try:
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            return max(1, min(65535, int(q.get("port", [NANO_DEFAULT_PORT])[0])))
        except Exception:
            return NANO_DEFAULT_PORT

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---- nanobot 管理 API ----
    def _api_status(self):
        port = self._query_port()
        running = probe_nano(port)
        self._json({"ok": True, "running": running, "port": port,
                    "cmd": find_nanobot_cmd() or ""})

    def _api_start(self):
        port = self._query_port()
        if probe_nano(port):
            self._json({"ok": True, "running": True, "port": port, "msg": "nanobot 已在运行"})
            return
        cmd = find_nanobot_cmd()
        if not cmd:
            self._json({"ok": False, "running": False, "port": port,
                        "msg": "未找到 nanobot。请先安装：uv tool install --python 3.11 nanobot-ai"})
            return
        cfg = nano_config_path()
        global NANO_PROC
        try:
            # uv 沙箱会导致 Python tempfile 失败，这里显式设置临时目录并禁用沙箱
            env = dict(os.environ)
            env["TEMP"] = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "Temp")
            env["TMP"] = env["TEMP"]
            env["UV_NO_SANDBOX"] = "1"
            args = [cmd, "serve", "-p", str(port), "-c", cfg]
            flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            NANO_PROC = subprocess.Popen(args, creationflags=flags, env=env,
                                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            # 轮询等待就绪（最多 30 秒，首次启动要建数据库/加载工具）
            running = False
            for _ in range(30):
                time.sleep(1)
                if probe_nano(port):
                    running = True
                    break
            if running:
                self._json({"ok": True, "running": True, "port": port,
                            "msg": "nanobot 启动成功（%s）" % cfg})
            else:
                self._json({"ok": True, "running": False, "port": port,
                            "msg": "启动命令已执行（%s），但服务暂未响应，请检查 nanobot 配置与 API Key" % cmd})
        except Exception as e:
            self._json({"ok": False, "running": False, "port": port, "msg": "启动失败: %s" % e})

    def _api_stop(self):
        port = self._query_port()
        global NANO_PROC
        killed = False
        # 1) 优先结束由本管理器启动的进程
        if NANO_PROC is not None and NANO_PROC.poll() is None:
            try:
                NANO_PROC.terminate()
                NANO_PROC.wait(timeout=5)
                killed = True
            except Exception:
                pass
        # 2) 按端口查找监听进程并结束（Windows）
        if os.name == "nt":
            try:
                out = subprocess.check_output(["netstat", "-ano"], text=True, errors="ignore")
                pids = set()
                for line in out.splitlines():
                    if (":%d" % port) in line and "LISTENING" in line:
                        parts = line.split()
                        if parts:
                            pids.add(parts[-1])
                for pid in pids:
                    try:
                        subprocess.run(["taskkill", "/F", "/PID", pid],
                                       capture_output=True, timeout=10)
                        killed = True
                    except Exception:
                        pass
            except Exception:
                pass
        running = probe_nano(port)
        if killed or not running:
            self._json({"ok": True, "running": False, "port": port, "msg": "nanobot 已停止"})
        else:
            self._json({"ok": True, "running": True, "port": port, "msg": "停止失败，服务仍在运行"})

    def _api_sync(self):
        """把前端设置同步写入 nanobot config.json（providers api_key/api_base + 模型 + tools 开关）"""
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            cfg_path = nano_config_path()
            with open(cfg_path, encoding="utf-8") as f:
                cfg = json.load(f)
            providers = cfg.setdefault("providers", {})
            for pid, p in (payload.get("providers") or {}).items():
                if not isinstance(p, dict):
                    continue
                entry = providers.get(pid)
                if not isinstance(entry, dict):
                    entry = {}
                    providers[pid] = entry
                if p.get("api_key") is not None:
                    entry["api_key"] = p.get("api_key") or ""
                if p.get("api_base") is not None:
                    entry["api_base"] = p.get("api_base") or ""
            if payload.get("model"):
                cfg.setdefault("agents", {}).setdefault("defaults", {})["model"] = payload["model"]
            # 同步工具开关（nanobot 使用 enable 字段）
            if payload.get("tools") is not None:
                tools = cfg.setdefault("tools", {})
                t = payload["tools"]
                if isinstance(t, dict):
                    for key, val in (("web", "web"), ("exec", "exec"), ("file", "file"),
                                     ("image_generation", "image_generation")):
                        if val in t:
                            tools.setdefault(key, {})["enable"] = bool(t[val])
                    if "restrict_to_workspace" in t:
                        tools["restrict_to_workspace"] = bool(t["restrict_to_workspace"])
                    if "my" in t:
                        tools.setdefault("my", {})["enable"] = bool(t["my"])
                    # 联网搜索提供商（tools.web.search：provider + api_key，如 Tavily）
                    if "web_search" in t and isinstance(t["web_search"], dict):
                        ws = t["web_search"]
                        search = tools.setdefault("web", {}).setdefault("search", {})
                        prov = str(ws.get("provider") or "duckduckgo").strip()
                        if prov:
                            search["provider"] = prov
                        key = str(ws.get("api_key") or "").strip()
                        if key:
                            search["api_key"] = key
                        else:
                            search.pop("api_key", None)
            with open(cfg_path, "w", encoding="utf-8") as f:
                json.dump(cfg, f, ensure_ascii=False, indent=2)
            # 用户自定义 nanobot 路径（设置页手动切换）→ 存到独立文件，供 find_nanobot_cmd 读取
            if payload.get("nanobot_bin") is not None:
                bin_path = str(payload.get("nanobot_bin") or "").strip()
                bin_file = os.path.join(DIR, "nanobot", "bin-path.json")
                try:
                    with open(bin_file, "w", encoding="utf-8") as f:
                        json.dump({"bin": bin_path}, f, ensure_ascii=False, indent=2)
                except Exception:
                    pass
            self._json({"ok": True, "path": cfg_path})
        except Exception as e:
            self._json({"ok": False, "msg": "同步失败: %s" % e})

    def _api_data(self, name):
        """读取磁盘上的工作台数据文件（AI 写入后的最新内容），供前端合并刷新。"""
        try:
            if not re.match(r"^[a-z]+$", name or ""):
                self._json({"ok": False, "msg": "非法文件名"}, code=400)
                return
            fpath = os.path.join(DIR, "data", name + ".json")
            if not os.path.isfile(fpath):
                self._json({"ok": False, "msg": "文件不存在: %s.json" % name}, code=404)
                return
            with open(fpath, encoding="utf-8") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(content.encode("utf-8"))))
            self.end_headers()
            self.wfile.write(content.encode("utf-8"))
        except Exception as e:
            self._json({"ok": False, "msg": "读取失败: %s" % e}, code=500)

    # ---- 路由 ----
    def do_GET(self):
        if self.path.startswith("/api/nanobot/"):
            self._api_status()
            return
        if self.path.startswith("/api/data/"):
            name = self.path[len("/api/data/"):].split("?", 1)[0].split("/")[0]
            self._api_data(name)
            return
        if self.path.startswith("/v1/"):
            self._proxy_nano()
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/nanobot/start"):
            self._api_start()
            return
        if self.path.startswith("/api/nanobot/stop"):
            self._api_stop()
            return
        if self.path.startswith("/api/nanobot/sync"):
            self._api_sync()
            return
        if self.path.startswith("/v1/"):
            self._proxy_nano()
            return
        self.send_error(404)

    # ---- OpenAI 兼容 API 反向代理（同源，规避 CORS） ----
    def _recover_empty_reply(self, data, session_id):
        """nanobot 的 agent 循环在 AI 用 message 工具发附件后，process_direct
        可能返回空 content，serve 层会替换为 fallback 文本。
        此处检测 fallback，并从会话 jsonl 恢复 AI 实际生成的最终回复。"""
        try:
            empty_msg = "I completed the tool steps but couldn't produce a final answer"
            payload = json.loads(data.decode("utf-8"))
            choices = payload.get("choices") or []
            content = (choices[0] or {}).get("message", {}).get("content") or ""
            if empty_msg not in content:
                return data
            # 计算会话文件名：base64(session_key) + .jsonl
            session_key = "api:" + (session_id or "default")
            import base64
            fname = base64.b64encode(session_key.encode("utf-8")).decode("utf-8") + ".jsonl"
            fpath = os.path.join(DIR, "data", "sessions", fname)
            recovered = None
            if os.path.isfile(fpath):
                with open(fpath, encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            entry = json.loads(line)
                        except Exception:
                            continue
                        if entry.get("role") != "assistant":
                            continue
                        c = entry.get("content") or ""
                        if c.strip() and empty_msg not in c:
                            recovered = c
            if recovered:
                choices[0]["message"]["content"] = recovered
                choices[0]["finish_reason"] = "stop"
                print("[nanobot] fallback 回复已替换为真实回复 (%d 字符)" % len(recovered))
                return json.dumps(payload, ensure_ascii=False).encode("utf-8")
        except Exception:
            pass
        return data

    def _proxy_nano(self):
        try:
            port = self._query_port()
            url = "http://127.0.0.1:%d%s" % (port, self.path)
            headers = {k: v for k, v in self.headers.items()
                       if k.lower() in ("content-type", "authorization")}
            body = None
            session_id = None
            if self.command == "POST":
                length = int(self.headers.get("Content-Length", 0) or 0)
                body = self.rfile.read(length) if length else b"{}"
                try:
                    req_json = json.loads(body.decode("utf-8"))
                    session_id = req_json.get("session_id")
                except Exception:
                    pass
            req = urllib.request.Request(url, data=body, headers=headers, method=self.command)
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = resp.read()
                # chat/completions：兜底替换 fallback 空回复
                if self.command == "POST" and "/chat/completions" in self.path:
                    data = self._recover_empty_reply(data, session_id)
                self.send_response(resp.status)
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self._json({"ok": False, "error": "nanobot 未运行或不可达: %s" % e}, code=502)

    def log_message(self, fmt, *args):
        # 过滤掉 nanobot 探测的噪音日志，其余照常输出
        try:
            first = str(args[0]) if args else ""
        except Exception:
            first = ""
        if "/api/nanobot/status" in first or "/v1/models" in first:
            return
        super().log_message(fmt, *args)


if __name__ == "__main__":
    with socketserver.ThreadingTCPServer(("", PORT), Handler) as httpd:
        print("Server running at http://localhost:%d  (nanobot API: /api/nanobot/*)" % PORT)
        httpd.serve_forever()
