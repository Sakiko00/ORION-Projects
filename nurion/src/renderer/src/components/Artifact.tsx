import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useT } from '../i18n'
import { mdClick, renderMarkdown } from '../md'
import type { ArtifactContent, ArtifactMeta } from '../run-types'

/**
 * 产物渲染 —— 「跑出来的东西」长什么样。
 *
 * 三条约定：
 *   1. **展示方式由扩展名定，不由脚本声明**：png 就是图、csv 就是表、md 就是文。
 *      脚本作者不该为了「能展示」多学一套协议。
 *   2. **xlsx / docx / pdf 不在这儿读** —— 那是 Excel 的活。给一个「打开」按钮，
 *      交给系统程序。自己写表格阅读器只会做得比 Excel 差。
 *   3. **什么都不藏**：读不出来的（二进制、超大图）如实说读不了，不要假装有内容。

 * 数据全走 `window.workbench.artifacts.*`，没有第二条路径。
 */

function kb(n: number): string {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`
}

const KIND_LABEL: Record<ArtifactMeta['kind'], string> = {
  image: 'art.kind.image',
  table: 'art.kind.table',
  text: 'art.kind.text',
  sheet: 'art.kind.sheet',
  other: 'art.kind.other'
}

/**
 * CSV → 表格。只按逗号/制表符切，**带引号转义的做最简处理**。
 * 为什么不引 papaparse：我们的 csv 都是自己脚本写出来的，格式可控；
 * 为极端格式引一个库不划算（认不出的地方就原样显示，不装）。
 */
function splitCsv(text: string): string[][] {
  const sep = text.includes('\t') && !text.includes(',') ? '\t' : ','
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const cells: string[] = []
      let cur = ''
      let quoted = false
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (c === '"') {
          if (quoted && line[i + 1] === '"') {
            cur += '"'
            i++
          } else quoted = !quoted
        } else if (c === sep && !quoted) {
          cells.push(cur)
          cur = ''
        } else cur += c
      }
      cells.push(cur)
      return cells
    })
}

/** 一个产物的内容区（不含文件名那一行） */
function Body({ file }: { file: ArtifactContent }): JSX.Element {
  const t = useT()
  if (file.kind === 'image') {
    return file.dataUrl ? (
      <img className="art-img" src={file.dataUrl} alt={file.name} />
    ) : (
      <p className="placeholder">{t('art.toobig', { size: kb(file.size) })}</p>
    )
  }

  if (file.kind === 'table') {
    const rows = splitCsv(file.text || '')
    if (!rows.length) return <p className="placeholder">{t('art.empty')}</p>
    const head = rows[0]
    const body = rows.slice(1, 101)
    return (
      <div className="art-table-wrap scroll">
        <table className="art-table">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} title={c}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 101 && (
          <p className="art-more">{t('art.more', { n: rows.length - 1 })}</p>
        )}
      </div>
    )
  }

  if (file.kind === 'text') {
    const isMd = file.name.toLowerCase().endsWith('.md')
    const text = file.text || ''
    if (!text.trim()) return <p className="placeholder">{t('art.empty')}</p>
    return isMd ? (
      <div
        className="art-md md scroll"
        onClick={(e) => mdClick(e, t)}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(text, t('md.copy')) }}
      />
    ) : (
      <pre className="art-pre scroll">{text.slice(0, 20000)}</pre>
    )
  }

  // sheet / other：不在这儿读，交给系统程序
  return (
    <p className="placeholder">
      {t('art.needapp', { kind: t(KIND_LABEL[file.kind]), size: kb(file.size) })}
    </p>
  )
}

/** 单个产物：列表里只有一行，点开在**浮层**里看内容 */
function Row({
  name,
  meta,
  onOpen,
  notify
}: {
  name: string
  meta?: ArtifactMeta
  onOpen: () => void
  notify?: (t: string, tone?: 'ok' | 'bad' | 'info') => void
}): JSX.Element {
  const t = useT()
  const icon = meta?.kind === 'image' ? 'image' : meta?.kind === 'table' ? 'table' : 'file'
  return (
    <div className="art-item">
      <button className="art-name" onClick={onOpen} title={name}>
        <Icon name={icon} size={13} />
        <span className="art-label">{name}</span>
        <span className="art-size">
          {meta ? `${t(KIND_LABEL[meta.kind])} · ${kb(meta.size)}` : ''}
        </span>
      </button>
      <span className="art-acts">
        <button
          className="mini-run"
          title={t('art.open.hint')}
          onClick={() =>
            void window.workbench?.artifacts.open(name).then((r) => {
              if (!r.ok) notify?.(r.error || t('art.cantopen'), 'bad')
            })
          }
        >
          <Icon name="external" size={12} /> {t('gen.open')}
        </button>
      </span>
    </div>
  )
}

/**
 * 浮层查看器。
 *
 * 为什么不做「就地展开」：产物住在一屏不滚的 Bento 卡里，撑死一百多像素高，
 * 一张报表截图或一张 7 列的表在那个高度里根本没法看 —— 试过，挤成一团。
 * 图和表本来就需要空间，所以给它一块铺满的浮层，Esc / 点背景关掉。
 */
function Viewer({
  name,
  onClose,
  notify
}: {
  name: string
  onClose: () => void
  notify?: (t: string, tone?: 'ok' | 'bad' | 'info') => void
}): JSX.Element {
  const [file, setFile] = useState<ArtifactContent | null>(null)
  const [err, setErr] = useState('')
  const t = useT()

  useEffect(() => {
    let alive = true
    void window.workbench?.artifacts
      .read(name)
      .then((f) => alive && setFile(f))
      .catch((e) => alive && setErr(String((e as Error)?.message || e)))
    return () => {
      alive = false
    }
  }, [name])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="art-viewer" onClick={onClose} role="dialog" aria-modal="true">
      <div className="art-viewer-box" onClick={(e) => e.stopPropagation()}>
        <div className="art-viewer-head">
          <Icon
            name={file?.kind === 'image' ? 'image' : file?.kind === 'table' ? 'table' : 'file'}
            size={14}
          />
          <span className="art-viewer-name">{name}</span>
          <span className="art-size">
            {file ? `${t(KIND_LABEL[file.kind])} · ${kb(file.size)}` : t('art.reading')}
          </span>
          <button
            className="mini-run"
            onClick={() =>
              void window.workbench?.artifacts.open(name).then((r) => {
                if (!r.ok) notify?.(r.error || t('art.cantopen'), 'bad')
              })
            }
          >
            <Icon name="external" size={12} /> {t('art.openapp')}
          </button>
          <button className="icon-btn" title={t('art.close')} onClick={onClose}>
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="art-viewer-body">
          {err ? (
            <p className="placeholder">{err}</p>
          ) : file ? (
            <Body file={file} />
          ) : (
            <p className="placeholder">{t('art.reading')}</p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 一次运行的产物列表。
 * 空的时候**不留空壳** —— 直接说「这次没产出文件」，那本身就是有用的信息
 * （说明脚本没写东西，或者写错地方了）。
 */
export function ArtifactList({
  names,
  notify
}: {
  names: string[]
  notify?: (t: string, tone?: 'ok' | 'bad' | 'info') => void
}): JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const [meta, setMeta] = useState<Record<string, ArtifactMeta>>({})
  const t = useT()

  useEffect(() => {
    void window.workbench?.artifacts
      .list()
      .then((all) => {
        const map: Record<string, ArtifactMeta> = {}
        for (const a of all) map[a.name] = a
        setMeta(map)
      })
      .catch(() => undefined)
  }, [names.join('|')])

  if (!names.length) {
    return <p className="placeholder">{t('art.nofiles')}</p>
  }

  return (
    <>
      <div className="art-list scroll">
        {names.map((n) => (
          <Row key={n} name={n} meta={meta[n]} onOpen={() => setOpen(n)} notify={notify} />
        ))}
      </div>
      {open && <Viewer name={open} onClose={() => setOpen(null)} notify={notify} />}
    </>
  )
}
