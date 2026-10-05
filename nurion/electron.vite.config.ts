import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, join, dirname } from 'path'
import { promises as fs } from 'node:fs'
import type { Dirent } from 'node:fs'
import os from 'node:os'

/**
 * 浏览器标签页预览用：把 vault 数据暴露成 /api/vault 接口。
 *
 * 浏览器标签页没有 preload 桥，拿不到 window.workbench —— 界面数据全空。
 * 这个中间件让纯浏览器也能走 HTTP 读到**同一份 vault**（真数据，不是 mock），
 * 配合 renderer 里的 browser-workbench 替身，就能在浏览器里预览整体功能。
 */
function vaultApi(): Plugin {
  const vault =
    process.env.WORKBENCH_VAULT ||
    join(os.homedir(), 'AppData', 'Roaming', 'automation-workbench', 'vault')
  const send = (res: import('node:http').ServerResponse, code: number, body: unknown): void => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
  }
  // 纯文本（.md / .py / .txt …）直接回原文，**不能 JSON 化** —— 否则会被包成带引号、
  // 换行变字面 \n 的字符串，前端拿到的整篇就成了「一行」，Markdown 全渲染不出来。
  const sendText = (res: import('node:http').ServerResponse, code: number, text: string): void => {
    res.statusCode = code
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(text)
  }
  // 写操作 —— 浏览器预览也能改真实 vault（和读是同一份库）
  const kbDir = join(vault, 'kb')
  const notePath = (name: unknown, category: unknown): string => {
    const clean = String(name || '').trim().replace(/\.md$/i, '')
    const cat = String(category || '').trim().replace(/^\/+|\/+$/g, '')
    if (!clean || /[\\/:*?"<>|]/.test(clean) || clean.startsWith('.')) throw new Error('笔记名不合法')
    if (cat && (/[\\/:*?"<>|]/.test(cat) || cat.startsWith('.'))) throw new Error('分类名不合法')
    return cat ? join(kbDir, cat, clean + '.md') : join(kbDir, clean + '.md')
  }
  const readBody = (req: import('node:http').IncomingMessage): Promise<string> =>
    new Promise((res2) => {
      let d = ''
      req.on('data', (c: Buffer) => (d += c.toString()))
      req.on('end', () => res2(d))
    })
  const applyOp = async (op: string, a: Record<string, unknown>): Promise<void> => {
    switch (op) {
      case 'write_note': {
        const p = notePath(a.name, a.category)
        await fs.mkdir(dirname(p), { recursive: true })
        await fs.writeFile(p, String(a.text ?? ''), 'utf8')
        return
      }
      case 'delete_note':
        await fs.rm(notePath(a.name, a.category), { force: true })
        return
      case 'create_category': {
        const c = String(a.category || '').trim()
        if (!c || /[\\/:*?"<>|]/.test(c)) throw new Error('分类名不合法')
        await fs.mkdir(join(kbDir, c), { recursive: true })
        return
      }
      case 'rename_category': {
        const f = String(a.from || '').trim()
        const t = String(a.to || '').trim()
        if (!f || !t) throw new Error('分类名不能为空')
        await fs.rename(join(kbDir, f), join(kbDir, t))
        return
      }
      case 'delete_category':
        await fs.rm(join(kbDir, String(a.category || '').trim()), { recursive: true, force: true })
        return
      default:
        throw new Error(`未知操作：${op}`)
    }
  }
  return {
    name: 'vault-api',
    configureServer(server) {
      server.middlewares.use('/api/vault', async (req, res) => {
        try {
          const rel = decodeURIComponent((req.url || '').replace(/^\//, '')).replace(/\.\./g, '')
          // 写操作：统一 POST /api/vault/op，body 是 { op, ...args }
          if (req.method === 'POST' && rel === 'op') {
            const body = await readBody(req)
            const { op, ...a } = JSON.parse(body || '{}') as { op: string } & Record<string, unknown>
            await applyOp(op, a)
            send(res, 200, { ok: true })
            return
          }
          // 库根 —— 设置页要显示「数据存在哪」，预览里也得是真路径，不能写死一个样例
          if (rel === 'root') {
            send(res, 200, { path: vault })
            return
          }
          // 分类列表：kb/ 下的一级子目录（含空目录）
          if (rel === 'categories') {
            const root = join(vault, 'kb')
            const ents = await fs.readdir(root, { withFileTypes: true }).catch(() => [] as Dirent[])
            send(
              res,
              200,
              ents
                .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
                .map((e) => e.name)
                .sort()
            )
            return
          }
          // 知识库：递归列出（一级子目录 = 分类），返回带 category 的列表
          if (rel === 'kb') {
            const root = join(vault, 'kb')
            const out: { name: string; category?: string; size: number; updatedAt: string }[] = []
            const walk = async (dir: string, cat: string): Promise<void> => {
              const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as Dirent[])
              for (const e of ents) {
                if (e.name.startsWith('.')) continue
                if (e.isDirectory()) continue // 子目录由外层单独列，避免重复
                if (!e.name.toLowerCase().endsWith('.md')) continue
                const st = await fs.stat(join(dir, e.name)).catch(() => null)
                if (!st) continue
                out.push({
                  name: e.name.slice(0, -3),
                  category: cat || undefined,
                  size: st.size,
                  updatedAt: st.mtime.toISOString()
                })
              }
            }
            await walk(root, '')
            const subs = await fs.readdir(root, { withFileTypes: true }).catch(() => [] as Dirent[])
            for (const s of subs) {
              if (s.isDirectory() && !s.name.startsWith('.')) await walk(join(root, s.name), s.name)
            }
            out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            send(res, 200, out)
            return
          }
          // 目录列举：/scripts /output /（根）
          if (rel === '' || rel === 'scripts' || rel === 'output') {
            const dir = rel ? join(vault, rel) : vault
            const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
            const list = await Promise.all(
              ents
                .filter((e) => e.isFile())
                .map(async (e) => {
                  const st = await fs.stat(join(dir, e.name)).catch(() => null)
                  return { name: e.name, size: st?.size ?? 0, updatedAt: st?.mtime.toISOString() ?? '' }
                })
            )
            send(res, 200, list)
            return
          }
          // 单文件：kb/<name> / scripts/<name> / output/<name> / <file>.json
          const abs = join(vault, rel)
          if (!abs.startsWith(vault)) return send(res, 403, { error: '越界' })
          const raw = await fs.readFile(abs, 'utf8')
          if (abs.endsWith('.json')) send(res, 200, JSON.parse(raw.replace(/^\uFEFF/, '')))
          else sendText(res, 200, raw)
        } catch (e) {
          // 状态文件（build.json 之类）还没写过 → 回 null，**别回 {}**。
          // {} 是 truthy，前端会以为「有一份状态」，然后 build.steps 读成 undefined 当场崩。
          const rel2 = decodeURIComponent((req.url || '').replace(/^\//, '')).replace(/\.\./g, '')
          if ((e as NodeJS.ErrnoException).code === 'ENOENT' && rel2.endsWith('.json'))
            return send(res, 200, null)
          send(res, 404, { error: (e as Error).message })
        }
      })
    }
  }
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // mcp-server 要被引擎以独立进程拉起（ELECTRON_RUN_AS_NODE=1），
          // 所以单独打成一个入口文件，放到 out/main/agent/mcp-server.js
          'agent/mcp-server': resolve(__dirname, 'src/main/agent/mcp-server.ts')
        }
      }
    }
  },
  preload: {},
  renderer: {
    plugins: [react(), vaultApi()],
    server: {
      proxy: {
        // 浏览器预览时把引擎接口代理成同源，躲开 CORS（引擎本身没发 CORS 头）
        '/api/engine': {
          target: 'http://127.0.0.1:8900',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/engine/, '')
        }
      }
    }
  }
})
