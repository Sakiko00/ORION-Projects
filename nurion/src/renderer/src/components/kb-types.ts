/** 知识库笔记的元信息（kb/ 下的一级子目录 = 分类） */
export interface NoteMeta {
  name: string
  /** 分类。空 = 未分类 */
  category?: string
  size: number
  updatedAt: string
}

/**
 * 种子分类 / 种子笔记名 → 当前语言。
 *
 * 这三个分类（思路 / 经验 / 自省）和三篇起步笔记，是**应用自己种下去的**
 * （见 main/agent/vault.ts 的 ensureSeed），不是用户起的名字 —— 所以切英文时
 * 它们该跟着变。但它们在磁盘上就是目录名和文件名，**不能改数据**，
 * 只能在显示层换一层皮；用户自己新建或改过名的，不在表里，原样返回。
 */
const SEED_CAT: Record<string, string> = {
  思路: 'cat.ideas',
  经验: 'cat.experience',
  自省: 'cat.reflection'
}

const SEED_NOTE: Record<string, string> = {
  开发工作流: 'note.workflow',
  任务怎么写: 'note.howto',
  失败排查: 'note.trouble'
}

type Tr = (key: string) => string

export function catText(c: string, t: Tr): string {
  return SEED_CAT[c] ? t(SEED_CAT[c]) : c
}

export function noteText(n: string, t: Tr): string {
  return SEED_NOTE[n] ? t(SEED_NOTE[n]) : n
}
