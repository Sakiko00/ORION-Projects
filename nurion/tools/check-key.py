# -*- coding: utf-8 -*-
"""
一次把「key 能不能用」这条链测清。

从项目根目录的 .env 读 DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL，
然后做三组测试，每组都只打印状态码和错误正文 —— **不打印 key 本身**。

为什么是三组：直连 DeepSeek 我们拿到了 200，但 nanobot 拿到 402，
   差别只可能在"客户端"和"请求形状"这两处。分三组就能定住是哪一处。
   1) 裸 httpx + 最小请求
   2) 裸 httpx + nanobot 真实请求体（.tmp/captured.json，没有就跳过）
   3) openai SDK + 同样参数（nanobot 用的就是 openai SDK）

用法：python tools/check-key.py
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    f = ROOT / ".env"
    if not f.exists():
        print("没有 .env —— 先在项目根目录建一个，把 key 填进去")
        sys.exit(1)
    for line in f.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


env = load_env()
key = env.get("DEEPSEEK_API_KEY", "")
base = (env.get("DEEPSEEK_BASE_URL") or "https://api.deepseek.com/v1").rstrip("/")
model = env.get("DEEPSEEK_MODEL") or "deepseek-chat"

# .env 没填就退回 nanobot 配置里的那把 —— 这样这个脚本今天就能用
if not key:
    try:
        from nanobot.config.loader import load_config

        p = dict(load_config().providers.model_dump()["custom"])
        key = p.get("api_key") or ""
        base = (p.get("api_base") or base).rstrip("/")
        print("（.env 是空的，用 nanobot 配置里的 key）")
    except Exception as e:
        print(f"（读不到 nanobot 配置：{e}）")

print(f"key   : {'已填（' + str(len(key)) + ' 字符）' if key else '**空的 —— 打开 .env 填进去**'}")
print(f"base  : {base}")
print(f"model : {model}")
if not key:
    sys.exit(1)
print()

import httpx  # noqa: E402

print("── 1) 裸 httpx + 最小请求 ─────────────────────────────")
r = httpx.post(
    f"{base}/chat/completions",
    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    json={"model": model, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1},
    timeout=60,
)
print(f"   HTTP {r.status_code}  {r.text[:200]}")

print()
print("── 2) 裸 httpx + nanobot 真实请求体 ───────────────────")
cap = ROOT / ".tmp" / "captured.json"
if cap.exists():
    body = json.loads(cap.read_text(encoding="utf-8"))
    print(f"   （{len(cap.read_text(encoding='utf-8'))} 字节，tools={len(body.get('tools') or [])}，"
          f"max_tokens={body.get('max_tokens')}，temperature={body.get('temperature')}）")
    r2 = httpx.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=body,
        timeout=90,
    )
    print(f"   HTTP {r2.status_code}  {r2.text[:200]}")
else:
    print("   （跳过：没有 .tmp/captured.json，要的话先用回显服务抓一次）")

print()
print("── 3) openai SDK（nanobot 用的就是它）─────────────────")
try:
    from openai import OpenAI

    c = OpenAI(api_key=key, base_url=base)
    resp = c.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": "hi"}],
        max_tokens=1,
    )
    print(f"   OK  {resp.choices[0].message.content!r}")
except Exception as e:
    print(f"   FAIL {type(e).__name__}: {str(e)[:400]}")
