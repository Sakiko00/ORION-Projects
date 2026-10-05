# engine —— 随包内嵌的引擎

这里放的是一份**完整的独立 Python + nanobot**，`npm run dist` 时由
`extraResources` 打进安装包（`resources/engine → engine`），
用户机器上**不需要装 Python、不需要 pip**。

## 现在的布局

```
resources/engine/
└── cpython-3.13.16-windows-x86_64-none/     ← uv 拉的 standalone Python
    ├── python.exe
    └── Lib/site-packages/nanobot/           ← 引擎装在这里，和系统 Python 无关
```

## 怎么重新做一份

```powershell
# 1. 拉一份独立 Python（21MB，uv 会放在 --install-dir 下）
uv python install 3.13 --install-dir resources/engine

# 2. 把引擎装进去（standalone 被 uv 标成 externally managed，要放行）
uv pip install --python resources/engine/cpython-3.13*/python.exe `
               --break-system-packages nanobot-ai

# 3. 删掉 uv 建的那个目录链接（不然打包会跟着复制两份，白白多 200MB）
cmd /c rmdir resources/engine/cpython-3.13-windows-x86_64-none
```

## 隔离（用户机器上也装了 Python/nanobot 时）

- 运行时**永远不读**用户那份：`PYTHONNOUSERSITE=1`，并清掉 `PYTHONPATH` /
  `PYTHONHOME` / `PYTHONSTARTUP` / `PIP_*`（见 `nanobot.ts` 的 `engineEnv()`）
- 探测顺序是**随包优先**；随包那份能跑就绝不会去用系统 Python
- 这份目录是**可写**的（不是冻结的黑盒）：用户想升级引擎，
  设置页点「安装」就是往这里 `pip install`，不碰系统环境

