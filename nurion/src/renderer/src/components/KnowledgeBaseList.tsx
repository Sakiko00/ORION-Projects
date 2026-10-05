import { useMemo } from 'react'
import { Icon } from './Icon'
import { useT } from '../i18n'
import { catText, noteText, type NoteMeta } from './kb-types'

/**
 * 知识库左栏 —— 分类分组 + 就地新建 + 分类改名/删除。
 * 新建不单独占一块表单：在哪个分类的 + 上点，就在哪个分类下弹输入框。
 */
interface Props {
  list: NoteMeta[]
  cats: string[]
  cur: string | null
  curCat: string
  /** 正在哪个分类下新建（null = 没在新建；'' = 未分类） */
  newIn: string | null
  newName: string
  renaming: string | null
  renameTo: string
  onStartNew: (cat: string) => void
  onNewName: (v: string) => void
  onCreate: () => void
  onCancelNew: () => void
  onPick: (name: string, category: string) => void
  onStartRename: (cat: string) => void
  onRenameTo: (v: string) => void
  onCancelRename: () => void
  onCommitRename: () => void
  onDeleteCat: (cat: string) => void
}

export function KnowledgeBaseList({
  list,
  cats,
  cur,
  curCat,
  newIn,
  newName,
  renaming,
  renameTo,
  onStartNew,
  onNewName,
  onCreate,
  onCancelNew,
  onPick,
  onStartRename,
  onRenameTo,
  onCancelRename,
  onCommitRename,
  onDeleteCat
}: Props) {
  const t = useT()
  /** 分组：所有分类都列出来（含空的，保证能往里新建），未分类压底 */
  const groups = useMemo(() => {
    const m = new Map<string, NoteMeta[]>()
    for (const n of list) {
      const key = n.category || ''
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(n)
    }
    for (const c of cats) if (!m.has(c)) m.set(c, [])
    if (!m.has('')) m.set('', [])
    const keys = [...m.keys()].sort((a, b) => {
      if (a === '') return 1
      if (b === '') return -1
      return a.localeCompare(b)
    })
    return keys.map((k) => ({
      cat: k,
      label: k ? catText(k, t) : t('kb.uncategorized'),
      notes: m.get(k)!
    }))
  }, [list, cats, t])

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>{t('kb.title')}</h3>
          <p className="card-sub">{t('kb.count', { n: list.length, m: groups.length })}</p>
        </div>
      </div>

      <div className="kb-list scroll">
        {groups.map((g) => (
          <div key={g.label} className="kb-group">
            <div className="kb-group-head">
              {g.cat && renaming === g.cat ? (
                <input
                  autoFocus
                  value={renameTo}
                  className="kb-cat-input"
                  onChange={(e) => onRenameTo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onCommitRename()
                    if (e.key === 'Escape') onCancelRename()
                  }}
                  onBlur={onCommitRename}
                />
              ) : (
                <>
                  <span className="kb-cat-name">{g.label}</span>
                  <button
                    className="kb-cat-act"
                    title={t('kb.newin')}
                    onClick={() => onStartNew(g.cat)}
                  >
                    <Icon name="plus" size={11} />
                  </button>
                  {g.cat && (
                    <>
                      <button
                        className="kb-cat-act"
                        title={t('kb.rename')}
                        onClick={() => onStartRename(g.cat)}
                      >
                        <Icon name="edit" size={11} />
                      </button>
                      <button
                        className="kb-cat-act"
                        title={t('kb.delfolder')}
                        onClick={() => onDeleteCat(g.cat)}
                      >
                        <Icon name="trash" size={11} />
                      </button>
                    </>
                  )}
                </>
              )}
            </div>

            {/* 就地新建：只一个输入框，分类由「在哪个组点的 +」决定 */}
            {newIn === g.cat && (
              <input
                autoFocus
                value={newName}
                placeholder={t('kb.nameplaceholder')}
                className="kb-new-inline"
                onChange={(e) => onNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCreate()
                  else if (e.key === 'Escape') onCancelNew()
                }}
                onBlur={() => {
                  if (newName.trim()) onCreate()
                  else onCancelNew()
                }}
              />
            )}

            {g.notes.map((n) => (
              <button
                key={n.name}
                className={`pick${cur === n.name && curCat === (n.category || '') ? ' on' : ''}`}
                onClick={() => onPick(n.name, n.category || '')}
              >
                <Icon name="file" size={14} />
                <span className="pick-main">
                  <span className="pick-name">{noteText(n.name, t)}</span>
                  <span className="pick-meta">
                    {(n.size / 1024).toFixed(1)} KB ·{' '}
                    {new Date(n.updatedAt).toLocaleString('zh-CN', { hour12: false }).slice(5)}
                  </span>
                </span>
              </button>
            ))}
            {!g.notes.length && newIn !== g.cat && (
              <p className="kb-empty">{t('kb.emptyslot')}</p>
            )}
          </div>
        ))}
        {!list.length && !cats.length && <p className="placeholder">{t('kb.nonotes')}</p>}
      </div>
    </section>
  )
}
