# -*- coding: utf-8 -*-
"""
数据模型定义（JSON 持久化）
JSON 结构：
{
  "version": 1,
  "tags":          [ {"name":"诗词","color":"#f7a8b8","builtin":true}, ... ],
  "sentences":     [ {"id":"...","text":"...","source":"...","author":"...",
                      "tags":["诗词"],"created":"YYYY-MM-DD HH:MM:SS","favorite":false}, ... ],
  "notes":         [ {"id":"...","title":"...","content":"...","created":"...","updated":"..."}, ... ],
  "preset_tags":   [ "诗词","古文","名言","增广贤文","成语典故","文学理论","原创" ]
}
"""
import os
import json
import time
import uuid

DATA_VERSION = 1

# 预设标签（首次创建时可用，用户可删除）
BUILTIN_TAGS = ["诗词", "古文", "名言", "增广贤文", "成语典故", "文学理论", "原创"]

# 预设标签对应的柔和配色（青瓷 · 竹韵系，低饱和，契合整体青碧配色）
TAG_COLORS = {
    "诗词": "#5a9e8a",
    "古文": "#5a8a9e",
    "名言": "#8a7c5a",
    "增广贤文": "#5f8a6d",
    "成语典故": "#7a6f9e",
    "文学理论": "#9e7a5a",
    "原创": "#5a9a84",
}
_DEFAULT_COLOR = "#6f847e"


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def empty_store() -> dict:
    return {
        "version": DATA_VERSION,
        "tags": [],
        "sentences": [],
        "notes": [],
        "preset_tags": BUILTIN_TAGS[:],
    }


class Store:
    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        self.filepath = os.path.join(data_dir, "wenji.json")
        self._tag_pools = TAG_COLORS.copy()

    # ---------- 标签 ----------
    def _ensure_tags(self):
        """确保内置标签都存在，并让内置标签始终跟随最新的柔和配色。"""
        existing = {t.get("name") for t in self._data["tags"] if isinstance(t, dict)}
        for name in BUILTIN_TAGS:
            if name not in existing:
                self._data["tags"].append({
                    "name": name,
                    "color": self._tag_pools.get(name, _DEFAULT_COLOR),
                    "builtin": True,
                })
            else:
                for t in self._data["tags"]:
                    if t.get("name") == name and t.get("builtin"):
                        t["color"] = self._tag_pools.get(name, _DEFAULT_COLOR)
                        break

    def get_all_tags(self):
        return self._data["tags"]

    def add_tag(self, name: str, color: str = ""):
        name = (name or "").strip()
        if not name:
            return {"ok": False, "msg": "标签名不能为空"}
        tags = self._data["tags"]
        for t in tags:
            if t.get("name") == name:
                return {"ok": False, "msg": "标签已存在"}
        tags.append({
            "name": name,
            "color": color or self._tag_pools.get(name, _DEFAULT_COLOR),
            "builtin": False,
        })
        self.save()
        return {"ok": True, "tag": tags[-1]}

    def delete_tag(self, name: str):
        """删除标签：不删除被此标签引用的句子/笔记，仅移除该标签。"""
        self._data["tags"] = [
            t for t in self._data["tags"] if t.get("name") != name
        ]
        # 从句子中移除
        for s in self._data["sentences"]:
            if name in s.get("tags", []):
                s["tags"] = [x for x in s["tags"] if x != name]
        self.save()
        return {"ok": True}

    # ---------- 句子 ----------
    def get_sentences(self, tag=None, keyword=None, favorite=None):
        items = list(self._data["sentences"])
        if tag:
            items = [s for s in items if tag in s.get("tags", [])]
        if keyword:
            kw = keyword.lower()
            items = [s for s in items if kw in (s.get("text", "") + s.get("source", "") + s.get("author", "")).lower()]
        if favorite is not None:
            items = [s for s in items if bool(s.get("favorite")) == favorite]
        # 新到旧
        items.sort(key=lambda s: s.get("created", ""), reverse=True)
        return items

    def add_sentence(self, text, source="", author="", tags=None, favorite=False):
        text = (text or "").strip()
        if not text:
            return {"ok": False, "msg": "内容不能为空"}
        s = {
            "id": uuid.uuid4().hex[:12],
            "text": text,
            "source": (source or "").strip(),
            "author": (author or "").strip(),
            "tags": [t for t in (tags or []) if t],
            "created": _now(),
            "favorite": bool(favorite),
        }
        self._data["sentences"].append(s)
        self.save()
        return {"ok": True, "sentence": s}

    def update_sentence(self, sid, text=None, source=None, author=None, tags=None):
        """更新某句词的内容/出处/作者/标签（仅更新传入的字段）。"""
        for s in self._data["sentences"]:
            if s.get("id") == sid:
                if text is not None:
                    text = (text or "").strip()
                    if not text:
                        return {"ok": False, "msg": "内容不能为空"}
                    s["text"] = text
                if source is not None:
                    s["source"] = (source or "").strip()
                if author is not None:
                    s["author"] = (author or "").strip()
                if tags is not None:
                    s["tags"] = [t for t in tags if t]
                self.save()
                return {"ok": True, "sentence": s}
        return {"ok": False, "msg": "未找到"}

    def toggle_favorite(self, sid):
        for s in self._data["sentences"]:
            if s.get("id") == sid:
                s["favorite"] = not s.get("favorite", False)
                self.save()
                return {"ok": True, "favorite": s["favorite"]}
        return {"ok": False, "msg": "未找到"}

    def save_sentence_note(self, sid, note):
        """为某句词附加/更新一条随句札记。"""
        for s in self._data["sentences"]:
            if s.get("id") == sid:
                s["sentNote"] = (note or "").strip()
                self.save()
                return {"ok": True, "sentNote": s["sentNote"]}
        return {"ok": False, "msg": "未找到"}

    def delete_sentence(self, sid):
        before = len(self._data["sentences"])
        self._data["sentences"] = [
            s for s in self._data["sentences"] if s.get("id") != sid
        ]
        self.save()
        return {"ok": True, "changed": before - len(self._data["sentences"])}

    # ---------- 长笔记 ----------
    def get_notes(self):
        items = list(self._data["notes"])
        items.sort(key=lambda n: n.get("updated", ""), reverse=True)
        return items

    def get_note(self, nid):
        for n in self._data["notes"]:
            if n.get("id") == nid:
                return n
        return None

    def save_note(self, nid=None, title="", content="", new=False):
        title = (title or "").strip() or "未命名笔记"
        if nid and not new:
            for n in self._data["notes"]:
                if n.get("id") == nid:
                    n["title"] = title
                    n["content"] = content or ""
                    n["updated"] = _now()
                    self.save()
                    return {"ok": True, "note": n}
            return {"ok": False, "msg": "未找到笔记"}
        # 新增
        n = {
            "id": nid or uuid.uuid4().hex[:12],
            "title": title,
            "content": content or "",
            "created": _now(),
            "updated": _now(),
        }
        self._data["notes"].append(n)
        self.save()
        return {"ok": True, "note": n}

    def delete_note(self, nid):
        before = len(self._data["notes"])
        self._data["notes"] = [
            n for n in self._data["notes"] if n.get("id") != nid
        ]
        self.save()
        return {"ok": True, "changed": before - len(self._data["notes"])}

    # ---------- 统计 ----------
    def stats(self):
        tags = self._data["tags"]
        sentences = self._data["sentences"]
        notes = self._data["notes"]

        # 各标签句子数
        by_tag = {t["name"]: 0 for t in tags}
        for s in sentences:
            for tname in s.get("tags", []):
                if tname in by_tag:
                    by_tag[tname] += 1
        tag_counts = [{"name": k, "value": v} for k, v in by_tag.items() if v > 0]
        tag_counts.sort(key=lambda x: x["value"], reverse=True)

        # 按月新增句子
        from collections import Counter, OrderedDict
        month_counter = Counter()
        for s in sentences:
            month_counter[s.get("created", "")[:7]] += 1
        months = OrderedDict(sorted(month_counter.items()))
        monthly = [{"month": m, "value": v} for m, v in months.items()]

        sources = Counter()
        for s in sentences:
            src = (s.get("source") or "").strip() or "佚名/未标注"
            sources[src] += 1
        source_list = [{"name": k, "count": v} for k, v in sources.items()]
        source_list.sort(key=lambda x: x["count"], reverse=True)

        favs = sum(1 for s in sentences if s.get("favorite"))

        return {
            "total": len(sentences),
            "tags": len(tags),
            "notes": len(notes),
            "favorites": favs,
            "tag_counts": tag_counts,
            "monthly": monthly,
            "sources": source_list[:10],
            "data_dir": self.data_dir,
        }

    # ---------- 持久化 ----------
    def load(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    self._data = json.load(f)
            except Exception:
                self._data = empty_store()
        else:
            self._data = empty_store()
        # 保证字段完整
        for k in ("version", "tags", "sentences", "notes", "preset_tags"):
            if k not in self._data:
                self._data[k] = empty_store().get(k)
        self._data["version"] = DATA_VERSION
        self._ensure_tags()
        self.save()
        return self

    def save(self):
        os.makedirs(self.data_dir, exist_ok=True)
        tmp = self.filepath + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, self.filepath)

    # ---------- 导入外部 md 数据（一次性） ----------
    def import_md(self, md_text: str):
        """从 markdown 文本提取句子并入库。返回新增数量。"""
        lines = [ln.rstrip("\n") for ln in md_text.splitlines()]
        current_section = ""
        section_map = {
            "一": "诗词", "二": "诗词", "三": "古文", "四": "增广贤文",
            "五": "名言", "六": "成语典故", "七": "文学理论", "八": "原创",
        }
        added = 0
        for ln in lines:
            s = ln.strip()
            if not s:
                continue
            if s.startswith("###"):
                # 作者/篇目行，可作为 source 记录（仅提示性，不单独存）
                continue
            if s.startswith("##"):
                # 识别大类，决定标签
                for k, v in section_map.items():
                    if ("、" + k in s) or (k + "、" in s):
                        current_section = v
                        break
                if "一、" in s: current_section = "诗词"
                elif "二、" in s: current_section = "诗词"
                elif "三、" in s: current_section = "古文"
                elif "四、" in s: current_section = "增广贤文"
                elif "五、" in s: current_section = "名言"
                elif "六、" in s: current_section = "成语典故"
                elif "七、" in s: current_section = "文学理论"
                elif "八、" in s: current_section = "原创"
                continue
            # 跳过标题/引用说明
            if s.startswith("#") or s.startswith("[") or s.startswith(">"):
                continue
            # 跳过关键词行（形如 **吉光片羽**：...）
            if s.startswith("**"):
                continue
            text = s.lstrip("- ").strip()
            # 分离出处 —— 查找 "——" / "——" 或结尾出处
            author, source = "", ""
            for sep in ("——", "———", "----"):
                if sep in text:
                    idx = text.find(sep)
                    rest = text[idx + len(sep):].strip()
                    # 形如 "Author《Source》"
                    if "《" in rest and "》" in rest:
                        ac, sc = rest.split("《", 1)
                        author = ac.strip()
                        source = "《" + sc
                    else:
                        author = rest
                    text = text[:idx].strip()
                    break
            if not text or len(text) < 2:
                continue
            # 去重
            if any(x.get("text") == text for x in self._data["sentences"]):
                continue
            tag = current_section or "诗词"
            # 确保标签存在
            if tag not in {t.get("name") for t in self._data["tags"]}:
                self._data["tags"].append({
                    "name": tag,
                    "color": self._tag_pools.get(tag, _DEFAULT_COLOR),
                    "builtin": True,
                })
            self._data["sentences"].append({
                "id": uuid.uuid4().hex[:12],
                "text": text,
                "source": source,
                "author": author,
                "tags": [tag],
                "created": _now(),
                "favorite": False,
            })
            added += 1
        self.save()
        return added


def load_store(data_dir: str) -> Store:
    return Store(data_dir).load()