# -*- coding: utf-8 -*-
"""
前端 <-> 后端桥接（pywebview js_api 暴露给前端调用的方法）。
"""
import os
import config
from config import get_data_dir, set_data_dir


class Br:
    def __init__(self, store):
        self.store = store
        self._last_snapshot = None
        self._window = None  # 由 main 注入 webview 窗口实例

    # ---------- 窗口控制（无边框窗口自绘控制按钮） ----------
    def minimize(self):
        if self._window is not None:
            self._window.minimize()
        return {"ok": True}

    def toggle_maximize(self):
        if self._window is not None:
            if self._window.maximized:
                self._window.restore()
            else:
                self._window.maximize()
        return {"ok": True}

    def close(self):
        if self._window is not None:
            self._window.destroy()
        return {"ok": True}

    # ---------- 启动 / 数据目录 ----------
    def init(self):
        return {
            "ok": True,
            "store": self.snapshot(),
            "stats": self.store.stats(),
            "data_dir": self.store.data_dir,
            "drives": config.system_drives(),
        }

    def snapshot(self):
        return {
            "tags": self.store.get_all_tags(),
            "sentences": self.store.get_sentences(),
            "notes": self.store.get_notes(),
        }

    def set_data_dir(self, path: str):
        try:
            new_dir = set_data_dir(path)
            # 数据目录变化后，重新加载 store
            from store import load_store
            self.store = load_store(new_dir)
            return {
                "ok": True, "data_dir": self.store.data_dir,
                "stats": self.store.stats(), "store": self.snapshot(),
            }
        except Exception as e:
            return {"ok": False, "msg": str(e)}

    def open_data_folder(self):
        datadir = self.store.data_dir
        try:
            os.makedirs(datadir, exist_ok=True)
        except Exception:
            pass
        os.startfile(datadir)  # type: ignore[attr-defined]
        return {"ok": True, "data_dir": datadir}

    def data_dir_info(self):
        return {"ok": True, "data_dir": self.store.data_dir}

    # ---------- 标签 ----------
    def get_tags(self):
        return {"ok": True, "tags": self.store.get_all_tags()}

    def add_tag(self, name, color=""):
        return self.store.add_tag(name, color)

    def delete_tag(self, name):
        return self.store.delete_tag(name)

    # ---------- 句子 ----------
    def get_sentences(self, tag=None, keyword=None, favorite=None):
        return {"ok": True, "sentences": self.store.get_sentences(tag, keyword, favorite)}

    def add_sentence(self, text, source="", author="", tags=None, favorite=False):
        r = self.store.add_sentence(text, source, author, tags, favorite)
        if r.get("ok"):
            r["stats"] = self.store.stats()
        return r

    def toggle_favorite(self, sid):
        r = self.store.toggle_favorite(sid)
        if r.get("ok"):
            r["stats"] = self.store.stats()
        return r

    def delete_sentence(self, sid):
        r = self.store.delete_sentence(sid)
        if r.get("ok"):
            r["stats"] = self.store.stats()
        return r

    # ---------- 长笔记 ----------
    def get_notes(self):
        return {"ok": True, "notes": self.store.get_notes()}

    def get_note(self, nid):
        return {"ok": True, "note": self.store.get_note(nid)}

    def save_note(self, nid=None, title="", content="", new=False):
        r = self.store.save_note(nid, title, content, new)
        if r.get("ok"):
            r["stats"] = self.store.stats()
        return r

    def delete_note(self, nid):
        r = self.store.delete_note(nid)
        if r.get("ok"):
            r["stats"] = self.store.stats()
        return r

    # ---------- 统计 ----------
    def get_stats(self):
        return {"ok": True, "stats": self.store.stats()}