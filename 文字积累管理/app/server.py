# -*- coding: utf-8 -*-
"""
文字积累管理 · 服务端
- 启动本地 HTTP 服务（内置 http.server，无第三方依赖）
- 自动打开默认浏览器访问界面
- 关闭浏览器（beforeunload beacon）/心跳超时 → 退出进程，无残留
"""
import os
import sys
import json
import time
import threading
import webbrowser
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DATA = {}  # 存放运行时状态：store, data_dir, last_hb, shutting_down


def _res_dir() -> str:
    if getattr(sys, "frozen", False):
        return getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


def _find_port(prefer=8631) -> int:
    for port in range(prefer, prefer + 60):
        try:
            s = threading.Thread  # noop
            import socket
            with socket.socket() as sock:
                sock.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    return 0


def _send_json(handler, code, obj):
    body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def _send_file(handler, full, mt):
    try:
        with open(full, "rb") as f:
            data = f.read()
    except Exception:
        handler.send_error(404)
        return
    handler.send_response(200)
    handler.send_header("Content-Type", mt)
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):  # 静默日志
        pass

    def _touch(self):
        DATA["last_hb"] = time.time()
        # 页面仍在活动（含刷新后重新加载发出的首个请求）→ 取消“请求停止”。
        # 只有真正关闭窗口/标签页（请求彻底中断）才会由看门狗判定退出。
        DATA.pop("_stop_req", None)

    # ---------- API ----------
    def _api(self):
        path = self.path.split("?", 1)[0]
        store = DATA["store"]
        if path == "/api/init":
            return _send_json(self, 200, {
                "ok": True,
                "store": {
                    "tags": store.get_all_tags(),
                    "sentences": store.get_sentences(),
                    "notes": store.get_notes(),
                },
                "stats": store.stats(),
                "data_dir": store.data_dir,
                "drives": DATA.get("drives", []),
            })
        if path == "/api/stats":
            return _send_json(self, 200, {"ok": True, "stats": store.stats()})
        # 标签
        if path == "/api/tags" and self.command == "GET":
            return _send_json(self, 200, {"ok": True, "tags": store.get_all_tags()})
        if path == "/api/tags" and self.command == "POST":
            b = self._json_body()
            return _send_json(self, 200, store.add_tag(b.get("name", ""), b.get("color", "")))
        if path == "/api/tags" and self.command == "DELETE":
            b = self._json_body()
            return _send_json(self, 200, store.delete_tag(b.get("name", "")))
        # 句子
        if path == "/api/sentences" and self.command == "GET":
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            kw = q.get("keyword", [""])[0]
            tag = q.get("tag", [""])[0]
            fav = q.get("favorite", [""])[0]
            return _send_json(self, 200, {"ok": True, "sentences": store.get_sentences(
                tag or None, kw or None, True if fav == "1" else (False if fav == "0" else None))})
        if path == "/api/sentences" and self.command == "POST":
            b = self._json_body()
            return _send_json(self, 200, store.add_sentence(
                b.get("text"), b.get("source", ""), b.get("author", ""), b.get("tags", []), b.get("favorite", False)))
        if path.startswith("/api/sentences/fav/"):
            sid = path.rsplit("/", 1)[1]
            return _send_json(self, 200, store.toggle_favorite(sid))
        if path.startswith("/api/sentences/del/"):
            sid = path.rsplit("/", 1)[1]
            return _send_json(self, 200, store.delete_sentence(sid))
        if path == "/api/sentences/note" and self.command == "POST":
            b = self._json_body()
            return _send_json(self, 200, store.save_sentence_note(b.get("id", ""), b.get("note", "")))
        if path == "/api/sentences/update" and self.command == "POST":
            b = self._json_body()
            return _send_json(self, 200, store.update_sentence(
                b.get("id", ""), b.get("text"), b.get("source"), b.get("author"), b.get("tags")))
        # 笔记
        if path == "/api/notes" and self.command == "GET":
            return _send_json(self, 200, {"ok": True, "notes": store.get_notes()})
        if path == "/api/notes" and self.command == "POST":
            b = self._json_body()
            return _send_json(self, 200, store.save_note(
                b.get("id"), b.get("title", ""), b.get("content", ""), b.get("new", False)))
        if path == "/api/notes" and self.command == "DELETE":
            b = self._json_body()
            return _send_json(self, 200, store.delete_note(b.get("id", "")))
        # 数据目录 / 导出
        if path == "/api/datadir" and self.command == "GET":
            return _send_json(self, 200, {"ok": True, "data_dir": store.data_dir})
        if path == "/api/datadir" and self.command == "POST":
            b = self._json_body()
            try:
                new_dir = DATA["config"].set_data_dir(b.get("path", ""))
                from store import load_store
                store = load_store(new_dir)
                DATA["store"] = store
                return _send_json(self, 200, {"ok": True, "data_dir": store.data_dir,
                                              "store": {"tags": store.get_all_tags(),
                                                        "sentences": store.get_sentences(),
                                                        "notes": store.get_notes()}})
            except Exception as e:
                return _send_json(self, 200, {"ok": False, "msg": str(e)})
        if path == "/api/export":
            return _send_json(self, 200, {"ok": True,
                                          "store": {"tags": store.get_all_tags(),
                                                    "sentences": store.get_sentences(),
                                                    "notes": store.get_notes()},
                                          "export": _export_md(store)})
        # 心跳 / 关闭
        if path == "/api/heartbeat":
            self._touch()
            return _send_json(self, 200, {"ok": True, "shutting_down": DATA.get("shutting_down", False)})
        if path == "/api/shutdown":
            # 不立即关闭：标记“请求停止”，由看门狗结合心跳判定。
            # 刷新/导航也会触发 beforeunload，但刷新后页面会继续发心跳 → 取消停止；
            # 只有真正关闭窗口/标签页（心跳持续中断）才退出进程。
            DATA["_stop_req"] = True
            try:
                _send_json(self, 200, {"ok": True})
            except Exception:
                pass
            return
        return _send_json(self, 404, {"ok": False, "msg": "not found"})

    def _json_body(self):
        length = int(self.headers.get("Content-Length") or 0) or 4096
        if length:
            raw = self.rfile.read(min(length, 4194304))
        else:
            raw = b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    # ---------- 路由 ----------
    def do_GET(self):
        self._touch()
        path = self.path.split("?", 1)[0]
        if path.startswith("/api/"):
            return self._api()
        if path in ("/", "/index.html"):
            return _send_file(self, os.path.join(_res_dir(), "index.html"), MIME[".html"])
        # 静态资源
        rel = urllib.parse.unquote(path.lstrip("/"))
        full = os.path.normpath(os.path.join(_res_dir(), rel))
        if not full.startswith(_res_dir()):
            return self.send_error(403)
        ext = os.path.splitext(full)[1].lower()
        if os.path.isfile(full):
            return _send_file(self, full, MIME.get(ext, "application/octet-stream"))
        return self.send_error(404)

    def do_POST(self):
        self._touch()
        path = self.path.split("?", 1)[0]
        if path.startswith("/api/"):
            return self._api()
        return self.send_error(404)

    def do_DELETE(self):
        self._touch()
        path = self.path.split("?", 1)[0]
        if path.startswith("/api/"):
            return self._api()
        return self.send_error(404)


def _export_md(store):
    md = "# 文字积累整理\n\n"
    data = store._data
    by_tag = {}
    for s in data["sentences"]:
        for t in (s.get("tags") or []):
            by_tag.setdefault(t, []).append(s)
    for t in data["tags"]:
        items = by_tag.get(t["name"], [])
        if not items:
            continue
        md += "## " + t["name"] + "\n\n"
        for s in items:
            line = "- " + (s.get("text") or "")
            if s.get("author"):
                line += " —— " + s["author"]
            if s.get("source"):
                line += " " + s["source"]
            md += line + "\n"
        md += "\n"
    return md


def main():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from config import get_data_dir
    from store import load_store
    import config as cfg

    data_dir = get_data_dir()
    os.makedirs(data_dir, exist_ok=True)
    store = load_store(data_dir)

    # 首次运行自动导入种子
    seed_md = os.path.join(_res_dir(), "文字积累整理.md")
    if os.path.exists(seed_md) and not store.get_sentences():
        with open(seed_md, "r", encoding="utf-8") as f:
            added = store.import_md(f.read())
        print(f"[init] 从 markdown 导入 {added} 条词句")

    DATA.update({
        "store": store,
        "config": cfg,
        "last_hb": time.time(),
        "shutting_down": False,
        "drives": cfg.system_drives(),
        "res_dir": _res_dir(),
    })

    port = _find_port()
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/"

    # 先启动服务线程（serve_forever 必须尽早占用端口，主线程才能看门狗循环）
    def _serve():
        server.serve_forever()

    threading.Thread(target=_serve, daemon=True).start()

    # 再打开默认浏览器（放后台线程，避免 webbrowser.open 阻塞主线程导致服务空转）
    def _open_browser():
        try:
            webbrowser.open(url)
        except Exception:
            pass

    threading.Thread(target=_open_browser, daemon=True).start()

    print(f"[server] 服务已启动 {url}  （关闭浏览器后进程自动退出）")
    # 看门狗：只有“请求停止”且心跳持续中断才退出；刷新/导航会继续心跳，因此不会误杀进程。
    _STOP_GRACE = 14   # 秒：请求停止后的宽限期，需大于心跳间隔 5s，保证刷新来得及续心跳
    _HB_TIMEOUT = 25   # 秒：完全无心跳的最长容忍（真关窗兜底）
    while True:
        time.sleep(2)
        if DATA.get("shutting_down"):
            break
        idle = time.time() - DATA["last_hb"]
        if DATA.get("_stop_req") and idle > _STOP_GRACE:
            print("[server] 请求停止且心跳已中断，浏览器确已关闭，退出")
            break
        if idle > _HB_TIMEOUT:
            print("[server] 心跳超时，浏览器已关闭，退出")
            break
    try:
        server.shutdown()
        server.server_close()
    except Exception:
        pass
    print("[server] 已退出，无残留")


def _log_path():
    try:
        return os.path.join(get_data_dir(), "server.log")
    except Exception:
        return os.path.join(os.path.expanduser("~"), "wenzi_server.log")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception:
        import traceback
        try:
            with open(_log_path(), "a", encoding="utf-8") as f:
                f.write("=" * 30 + "\n" + time.strftime("%Y-%m-%d %H:%M:%S") + "\n")
                traceback.print_exc(file=f)
        except Exception:
            try:
                traceback.print_exc()
            except Exception:
                pass