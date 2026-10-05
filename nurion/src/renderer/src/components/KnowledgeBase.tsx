import { useCallback, useEffect, useState } from 'react'
import { useT } from '../i18n'
import { KnowledgeBaseList } from './KnowledgeBaseList'
import { KnowledgeBaseEditor } from './KnowledgeBaseEditor'
import type { NoteMeta } from './kb-types'

/**
 * 知识库页 —— 纯 Markdown 文件，不建表、不建索引。
 *
 * 为什么是文件：用户拿 Obsidian / 记事本打开，看到的应该是同一份东西（DESIGN 第 0 条）。
 * 所以这里没有标签、没有引用、没有版本 —— 只有 名称 + 正文。
 *
 * 拆法：本文件只当**容器**（状态 + 数据流），两块各一个文件：
 *   KnowledgeBaseList   ① 左栏（新建 + 分类分组 + 分类管理）
 *   KnowledgeBaseEditor ② 右栏（标题 + 保存/删除 + 左写右看）
 *
 * Markdown **不在这里** —— 走全应用同一个 `src/md.ts`。以前这里挂着第二套
 * （`kb-md`），结果同一段 markdown 在对话里和在笔记里长得不一样，代码块连
 * 「复制」都不一样。渲染器只能有一套。
 */

interface KnowledgeBaseProps {
  notify: (text: string, tone?: 'ok' | 'bad' | 'info') => void
}

/* ---------------- 页面 ---------------- */

export function KnowledgeBase({ notify }: KnowledgeBaseProps) {
  const t = useT()
  const [list, setList] = useState<NoteMeta[]>([])
  const [cur, setCur] = useState<string | null>(null)
  const [curCat, setCurCat] = useState('')
  const [cats, setCats] = useState<string[]>([])
  const [text, setText] = useState('')
  const [savedText, setSavedText] = useState('')
  const [newName, setNewName] = useState('')
  /** 正在哪个分类下新建（null = 没在新建；'' = 未分类） */
  const [newIn, setNewIn] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** 正在改名的分类（进入内联编辑态） */
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')

  const dirty = cur !== null && text !== savedText

  const load = useCallback(async (): Promise<NoteMeta[]> => {
    const wb = window.workbench
    if (!wb) return []
    const l = (await wb.agent.call('list_notes', {})) as NoteMeta[]
    setList(l)
    const c = (await wb.agent.call('list_categories', {}).catch(() => [])) as string[]
    setCats(c)
    return l
  }, [])

  const open = useCallback(
    async (name: string, category = ''): Promise<void> => {
      try {
        const n = (await window.workbench.agent.call('read_note', { name, category })) as { text: string }
        setCur(name)
        setCurCat(category)
        setText(n.text)
        setSavedText(n.text)
      } catch (e) {
        notify(t('kb.open.bad', { err: String((e as Error)?.message || e) }), 'bad')
      }
    },
    [notify, t]
  )

  // 首次进来：拉清单，顺手打开最近改的那篇
  useEffect(() => {
    void (async () => {
      const l = await load()
      if (l.length) void open(l[0].name, l[0].category || '')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async (): Promise<void> => {
    if (!cur) return
    setBusy(true)
    try {
      // 界面上是人盯着内容改的，所以 overwrite 直接放行；
      // agent 走工具层时必须自己显式带这个标志（DESIGN 3.1）
      await window.workbench.agent.call('write_note', { name: cur, category: curCat, text, overwrite: true })
      setSavedText(text)
      await load()
      notify(t('kb.savedx', { name: cur }), 'ok')
    } catch (e) {
      notify(t('kb.save.bad', { err: String((e as Error)?.message || e) }), 'bad')
    } finally {
      setBusy(false)
    }
  }

  const create = async (): Promise<void> => {
    const name = newName.trim()
    if (!name) return
    const cat = newIn ?? ''
    setBusy(true)
    try {
      const head = `# ${name}\n\n`
      await window.workbench.agent.call('write_note', { name, category: cat, text: head, overwrite: true })
      setNewName('')
      setNewIn(null)
      await load()
      await open(name, cat)
      notify(t('kb.created', { name, cat: cat ? t('kb.created.cat', { cat }) : '' }), 'ok')
    } catch (e) {
      notify(t('kb.create.bad', { err: String((e as Error)?.message || e) }), 'bad')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!cur) return
    setBusy(true)
    try {
      await window.workbench.agent.call('delete_note', { name: cur, category: curCat, allowDelete: true })
      notify(t('kb.deleted', { name: cur }), 'ok')
      setCur(null)
      setCurCat('')
      setText('')
      setSavedText('')
      const l = await load()
      if (l.length) void open(l[0].name, l[0].category || '')
    } catch (e) {
      notify(t('kb.del.bad', { err: String((e as Error)?.message || e) }), 'bad')
    } finally {
      setBusy(false)
    }
  }

  /** 分类改名 —— 内联输入框回车 / 失焦时提交 */
  const renameCat = async (): Promise<void> => {
    if (!renaming) return
    const to = renameTo.trim()
    if (!to || to === renaming) {
      setRenaming(null)
      return
    }
    setBusy(true)
    try {
      await window.workbench.agent.call('rename_category', { from: renaming, to })
      notify(t('kb.renamed', { from: renaming, to }), 'ok')
      if (curCat === renaming) setCurCat(to)
      setRenaming(null)
      await load()
    } catch (e) {
      notify(t('kb.rename.bad', { err: String((e as Error)?.message || e) }), 'bad')
    } finally {
      setBusy(false)
    }
  }

  /** 删分类（连同下面所有笔记，不可逆） */
  const deleteCat = async (cat: string): Promise<void> => {
    setBusy(true)
    try {
      await window.workbench.agent.call('delete_category', { category: cat, allowDelete: true })
      notify(t('kb.folder.deleted', { cat }), 'ok')
      if (curCat === cat) {
        setCur(null)
        setCurCat('')
        setText('')
        setSavedText('')
      }
      await load()
    } catch (e) {
      notify(t('kb.folder.del.bad', { err: String((e as Error)?.message || e) }), 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pane-page kb">
      <KnowledgeBaseList
        list={list}
        cats={cats}
        cur={cur}
        curCat={curCat}
        newIn={newIn}
        newName={newName}
        renaming={renaming}
        renameTo={renameTo}
        onStartNew={(cat) => {
          setNewIn(cat)
          setNewName('')
        }}
        onNewName={setNewName}
        onCreate={() => void create()}
        onCancelNew={() => {
          setNewIn(null)
          setNewName('')
        }}
        onPick={(name, category) => void open(name, category)}
        onStartRename={(cat) => {
          setRenaming(cat)
          setRenameTo(cat)
        }}
        onRenameTo={setRenameTo}
        onCancelRename={() => setRenaming(null)}
        onCommitRename={() => void renameCat()}
        onDeleteCat={(cat) => void deleteCat(cat)}
      />
      <KnowledgeBaseEditor
        cur={cur}
        curCat={curCat}
        dirty={dirty}
        busy={busy}
        text={text}
        onText={setText}
        onSave={() => void save()}
        onRemove={() => void remove()}
      />
    </div>
  )
}
