/**
 * Markdown —— **全应用唯一**的渲染口（对话 / 产物 / 构建页 / 知识库）。
 *
 * 内核：**markdown-it**（CommonMark + 表格 + 自动链接），代码块交给 **highlight.js** 上色。
 *
 * 为什么把原来手写的那套换掉：
 * 手写的那套只覆盖「看起来常见」的几种 —— 一碰上嵌套列表、任务列表、引用里的列表、
 * 表格里的转义、行尾两个空格换行这些边角，就开始**悄悄渲染错**。
 * 而知识库是给人长期写字的地方：写得越久，越会写到那些边角。
 * **渲染错比渲染少严重得多** —— markdown 是用户的原文，不是模型的输出。
 *
 * ⚠️ 换了内核，安全边界一条都没松：
 *   ① `html: false` —— 正文里的标签一律当**字**渲染，谁都不许往页面里塞 HTML；
 *   ② 链接走 markdown-it 默认的 `validateLink`（`javascript:` / `vbscript:` / `file:` 一律不给）；
 *   ③ 外链统一补上 `target=_blank rel=noreferrer`。
 *
 * 出来的是字符串，调用方用 `dangerouslySetInnerHTML` 塞进去 —— 名字里带 dangerous
 * 是提醒你：上面三条不能破。
 *
 * class 名（`md-codewrap` / `md-code` / `md-copy` / `md-table` / `md-fm`）是
 * `styles/md.css` 按着的契约，改这里就得同时改那边。
 */

import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'

export function esc(s: unknown): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

const md = new MarkdownIt({
  html: false, // 正文里的标签当字看 —— 渲染层唯一的安全边界
  linkify: true, // 光秃秃的网址也认（模型经常直接甩一条 URL 出来）
  breaks: true, // 单换行 = <br>：大家写字就是按屏幕上的换行写的
  typographer: false
})

/* 标题整体降两级：对话和卡片里 `#` 不该比卡片自己的标题还大（md.css 从 h3 起跳） */
const shift = (n: number): string => `h${Math.min(6, n + 2)}`
md.renderer.rules.heading_open = (tokens, idx) => `<${shift(Number(tokens[idx].tag.slice(1)))}>`
md.renderer.rules.heading_close = (tokens, idx) => `</${shift(Number(tokens[idx].tag.slice(1)))}>`

/* 表格挂上 md-table —— md.css 是按这个 class 写的 */
md.renderer.rules.table_open = () => '<table class="md-table">'

/* 图片懒加载 */
md.renderer.rules.image = (tokens, idx) => {
  const tk = tokens[idx]
  return `<img src="${esc(tk.attrGet('src') || '')}" alt="${esc(tk.content || '')}" loading="lazy">`
}

/* 外链一律新窗口 + noopener */
md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noreferrer')
  return self.renderToken(tokens, idx, options)
}

/**
 * 代码块：语言名 + 「复制」按钮一起给出来。
 *
 * 按钮为什么写在这儿：它是 innerHTML 塞进去的节点，React 管不到，
 * 只能在容器上做事件代理（见下面的 `mdClick`）—— 渲染和它自带的交互要配对出现，
 * 不然每多一个渲染点，就多一个「按钮点了没反应」。
 */
md.renderer.rules.fence = (tokens, idx, _opt, env) => {
  const tk = tokens[idx]
  const lang = (tk.info || '').trim().split(/\s+/)[0] || ''
  /* 按钮的文案是**调用方**给的（跟着界面语言走）—— 这个库是全应用共用的，
     自己在里面写死一个「复制」，切英文就露馅了。 */
  const label = esc(String((env as { copy?: string } | undefined)?.copy ?? 'Copy'))
  /* 没标语言就不猜（`highlightAuto` 在大段脚本上很慢，猜错比不猜更烦） */
  const body =
    lang && hljs.getLanguage(lang)
      ? hljs.highlight(tk.content, { language: lang, ignoreIllegals: true }).value
      : esc(tk.content)
  return (
    `<div class="md-codewrap">` +
    `<pre class="md-code" data-lang="${esc(lang)}"><code>${body}</code></pre>` +
    `<button class="md-copy" type="button" title="${label}">${label}</button>` +
    `</div>`
  )
}

/** 开头用 `---` 包起来的那一段当元信息框（模型偶尔会带 frontmatter 出来） */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function renderMarkdown(text: string, copyLabel: string): string {
  const src = String(text ?? '').replace(/\r\n?/g, '\n')
  const fm = FRONTMATTER.exec(src)
  const env = { copy: copyLabel }
  if (!fm) return md.render(src, env)
  const head = `<div class="md-fm">${fm[1]
    .split('\n')
    .map((l) => `<div>${esc(l)}</div>`)
    .join('')}</div>`
  return head + md.render(src.slice(fm[0].length), env)
}

/**
 * 代码块上那个「复制」按钮的**事件代理**。
 *
 * 为什么得代理：markdown 是 `innerHTML` 塞进去的，React 管不到那些节点，
 * 按钮上挂不了 onClick —— 只能在容器上接一下，再往上找 `.md-copy`。
 *
 * 为什么放在这个文件：它是 markdown 渲染出来的东西**自带的**交互。
 * 谁渲染谁就接这一下，按钮才不会变成「点了没反应」。
 *
 * 只收一个 `t`，自己不带 React 依赖 —— 渲染器仍然是纯的。
 * `t` 由调用方传（绑定处不能直接带参），按钮上的字也得跟着语言走。
 */
export function mdClick(e: { target: EventTarget | null }, t: (key: string) => string): void {
  const btn = (e.target as HTMLElement | null)?.closest?.('.md-copy') as HTMLElement | null
  if (!btn) return
  const code = btn.parentElement?.querySelector('code')?.textContent || ''
  const back = (): void => {
    window.setTimeout(() => {
      btn.textContent = t('md.copy')
    }, 1200)
  }
  void navigator.clipboard.writeText(code).then(
    () => {
      btn.textContent = t('md.copied')
      back()
    },
    () => {
      btn.textContent = t('md.copyfail')
      back()
    }
  )
}
