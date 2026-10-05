import * as vault from './vault'

/**
 * agent 工具层 —— 给智能体（nanobot / 子智能体）用的「手脚」。
 *
 * 铁律（来自可复用包 DESIGN.md）：
 *   1. 全部建在 vault.ts 之上 —— agent 和界面用同一套读写，不存在两处真相
 *   2. 破坏性操作默认拦 —— 覆盖 / 删除必须显式带放行标志
 *
 * 每次调用写一行到 runtime/agent.log。
 * 暴露方式不在这里管：mcp-server.ts（MCP over stdio）会把 list()/call() 挂出去。
 */

interface Tool {
  name: string
  describe: string
  inputSchema: Record<string, unknown>
  ready: boolean
  destructive?: boolean
  run: (args: Record<string, unknown>) => Promise<unknown>
}

function brief(args: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args || {})) {
    if (typeof v === 'string' && v.length > 120) out[k] = `${v.slice(0, 120)}…（共 ${v.length} 字）`
    else out[k] = v
  }
  return out
}

const tools: Record<string, Tool> = {
  list_tasks: {
    name: 'list_tasks',
    describe: '列出所有自动化任务（名字 / 机器人 / 调度 / 状态 / 上次运行）。回答「现在有哪些任务」先调它。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    ready: true,
    run: () => vault.listTasks()
  },

  get_task: {
    name: 'get_task',
    describe: '看一个任务的详情',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '来自 list_tasks 的 id' } },
      required: ['id'],
      additionalProperties: false
    },
    ready: true,
    run: (a) => vault.getTask(String(a.id))
  },

  create_task: {
    name: 'create_task',
    describe:
      '新建一个自动化任务。「任务 = 一条命令 + 工作目录」：cmd 里写 python/node/ps1 都行，{date} 会被换成当天日期。帮用户把脚本接成任务时就调它。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '任务名' },
        cmd: { type: 'string', description: '要执行的命令行，如 python collect.py --date {date}' },
        cwd: { type: 'string', description: '工作目录（绝对路径）；不填按库根' },
        agent: { type: 'string', description: '挂到哪个机器人（collector/reporter/validator/notifier）' },
        schedule: { type: 'string', description: '调度，如 每天 08:30；默认手动触发' }
      },
      required: ['name'],
      additionalProperties: false
    },
    ready: true,
    run: (a) =>
      vault.createTask({
        name: String(a.name),
        cmd: a.cmd === undefined ? undefined : String(a.cmd),
        cwd: a.cwd === undefined ? undefined : String(a.cwd),
        agent: a.agent === undefined ? undefined : String(a.agent),
        schedule: a.schedule === undefined ? undefined : String(a.schedule)
      })
  },

  update_task: {
    name: 'update_task',
    describe: '改一个任务（名字 / 命令行 / 工作目录 / 机器人 / 调度 / 启停）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        cmd: { type: 'string', description: '要执行的命令行' },
        cwd: { type: 'string', description: '工作目录' },
        agent: { type: 'string' },
        schedule: { type: 'string' },
        enabled: { type: 'boolean' }
      },
      required: ['id'],
      additionalProperties: false
    },
    ready: true,
    run: (a) => {
      const patch: Partial<vault.Task> = {}
      if (a.name !== undefined) patch.name = String(a.name)
      if (a.cmd !== undefined) patch.cmd = String(a.cmd)
      if (a.cwd !== undefined) patch.cwd = String(a.cwd)
      if (a.agent !== undefined) patch.agent = String(a.agent)
      if (a.schedule !== undefined) patch.schedule = String(a.schedule)
      if (a.enabled !== undefined) patch.enabled = !!a.enabled
      return vault.updateTask(String(a.id), patch)
    }
  },

  delete_task: {
    name: 'delete_task',
    describe: '删一个任务（不可逆，必须带 allowDelete: true 才执行）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        allowDelete: { type: 'boolean', description: '必须为 true 才允许删除' }
      },
      required: ['id'],
      additionalProperties: false
    },
    ready: true,
    destructive: true,
    run: (a) => vault.deleteTask(String(a.id), a.allowDelete === true)
  },


  list_agents: {
    name: 'list_agents',
    describe: '列出所有机器人及其在线状态、任务数',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    ready: true,
    run: () => vault.listAgents()
  },

  read_log: {
    name: 'read_log',
    describe: '看 agent 最近的操作日志（谁、什么时候、动了什么）',
    inputSchema: {
      type: 'object',
      properties: { n: { type: 'integer', description: '最近多少条，默认 50' } },
      additionalProperties: false
    },
    ready: true,
    run: (a) => vault.readAgentLog(typeof a.n === 'number' ? a.n : 50)
  },

  list_runs: {
    name: 'list_runs',
    describe:
      '看运行历史（哪天、哪个任务、成没成、跑了多久）。界面上的今日时间轴和 3 周热力图就建在它之上；回答「最近跑得怎么样」先调它。',
    inputSchema: {
      type: 'object',
      properties: {
        n: { type: 'integer', description: '只取最近多少条，默认全部（最多 90 天）' },
        taskId: { type: 'string', description: '只看某个任务' }
      },
      additionalProperties: false
    },
    ready: true,
    run: async (a) => {
      let all = await vault.listRuns()
      if (a.taskId !== undefined) all = all.filter((r) => r.taskId === String(a.taskId))
      // n=0 时 slice(-0) 会返回全部 —— 这里显式：n>0 取最近 n 条，n=0 取空，没传取全部
      if (typeof a.n === 'number') return a.n > 0 ? all.slice(-a.n) : []
      return all
    }
  },

  read_run_log: {
    name: 'read_run_log',
    describe:
      '读某一次运行的完整日志（stdout+stderr）。runId 从 list_runs 或 run_task 拿。任务失败、用户问「刚才为什么挂了」时调它。',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        tail: { type: 'integer', description: '只取最后多少行，默认 200' }
      },
      required: ['runId'],
      additionalProperties: false
    },
    ready: true,
    run: (a) => vault.readRunLog(String(a.runId), typeof a.tail === 'number' ? a.tail : 200)
  },

  /* ---------------- 知识库 ---------------- */

  list_notes: {
    name: 'list_notes',
    describe:
      '列出知识库里的笔记名（带分类 / 最近修改）。**只给名字，不给正文** —— 想找相关内容用 search_notes 召回，别一上来就把整库读进上下文。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    ready: true,
    run: () => vault.listNotes()
  },

  search_notes: {
    name: 'search_notes',
    describe:
      '按关键词在知识库里检索（搜正文全文），返回命中的笔记名 + 片段（**不是全文**）。构建任务前用它召回相关经验，命中后再用 read_note 读全文 —— 别把整个知识库读进来。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词，空格分隔多个（如「豆瓣 超时 登录」）' },
        n: { type: 'integer', description: '最多返回几条，默认 5' }
      },
      required: ['query'],
      additionalProperties: false
    },
    ready: true,
    run: (a) => vault.searchNotes(String(a.query), typeof a.n === 'number' ? a.n : 5)
  },

  read_note: {
    name: 'read_note',
    describe: '读一篇笔记的正文（Markdown）。同名笔记在不同分类下是不同文件，靠 category 区分。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '不带 .md' },
        category: { type: 'string', description: '分类（可选，空 = 未分类）' }
      },
      required: ['name'],
      additionalProperties: false
    },
    ready: true,
    run: (a) => vault.readNote(String(a.name), a.category ? String(a.category) : '')
  },

  write_note: {
    name: 'write_note',
    describe:
      '写一篇笔记（新建或覆盖）。**覆盖已有内容的笔记必须显式带 overwrite: true** —— 否则会回一句「这需要确认」。把踩过的坑、口径、排查结论沉淀下来时就调它。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        text: { type: 'string', description: 'Markdown 正文' },
        overwrite: { type: 'boolean', description: '覆盖已有内容必须为 true' },
        category: { type: 'string', description: '分类（可选，空 = 未分类）' }
      },
      required: ['name', 'text'],
      additionalProperties: false
    },
    ready: true,
    destructive: true,
    run: (a) =>
      vault.writeNote(String(a.name), String(a.text), a.overwrite === true, a.category ? String(a.category) : '')
  },

  delete_note: {
    name: 'delete_note',
    describe: '删一篇笔记（不可逆，必须带 allowDelete: true）。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        category: { type: 'string', description: '分类（可选，空 = 未分类）' },
        allowDelete: { type: 'boolean' }
      },
      required: ['name'],
      additionalProperties: false
    },
    ready: true,
    destructive: true,
    run: (a) => {
      if (a.allowDelete !== true) {
        throw new Error('删笔记是不可逆操作，要删请显式带 allowDelete: true')
      }
      return vault.deleteNote(String(a.name), a.category ? String(a.category) : '')
    }
  },

  /* ---------------- 分类 ---------------- */

  list_categories: {
    name: 'list_categories',
    describe: '列出知识库里的所有分类（kb/ 下的一级子目录）。建笔记前先看有哪些分类。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    ready: true,
    run: () => vault.listCategories()
  },

  create_category: {
    name: 'create_category',
    describe: '建一个新分类（就是一个空文件夹）。',
    inputSchema: {
      type: 'object',
      properties: { category: { type: 'string', description: '分类名' } },
      required: ['category'],
      additionalProperties: false
    },
    ready: true,
    run: (a) => vault.createCategory(String(a.category))
  },

  rename_category: {
    name: 'rename_category',
    describe: '给分类改名（它下面的笔记一起挪过去）。',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string', description: '新分类名' }
      },
      required: ['from', 'to'],
      additionalProperties: false
    },
    ready: true,
    destructive: true,
    run: (a) => vault.renameCategory(String(a.from), String(a.to))
  },

  delete_category: {
    name: 'delete_category',
    describe: '删一个分类。**下面还有笔记时必须显式带 allowDelete: true**（会连笔记一起删）。',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        allowDelete: { type: 'boolean' }
      },
      required: ['category'],
      additionalProperties: false
    },
    ready: true,
    destructive: true,
    run: (a) => vault.deleteCategory(String(a.category), a.allowDelete === true)
  },

  /* ---------------- 警 ---------------- */

  list_alerts: {
    name: 'list_alerts',
    describe:
      '看收到的警（告警平台推来的、或我们自己发现的）。新的在前。回答「有什么要处理的」先调它。ack=false 的是还没人处置的。',
    inputSchema: {
      type: 'object',
      properties: { n: { type: 'integer', description: '最近多少条，默认 50' } },
      additionalProperties: false
    },
    ready: true,
    run: (a) => vault.listAlerts(typeof a.n === 'number' ? a.n : 50)
  },

  ack_alert: {
    name: 'ack_alert',
    describe:
      '把一条警标成「已处置」。**处置完再调** —— 标了之后它就不在待办里了。处置过程/结论请同时写进知识库（write_note）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '来自 list_alerts' },
        ack: { type: 'boolean', description: '默认 true；传 false 可以撤销' }
      },
      required: ['id'],
      additionalProperties: false
    },
    ready: true,
    run: (a) => vault.ackAlert(String(a.id), a.ack !== false)
  },

  /* ---------------- 脚本（可复用的自动化资产） ---------------- */

  list_scripts: {
    name: 'list_scripts',
    describe:
      '列出已经写好的可复用脚本（scripts/*.py）。**动手写新脚本前先看这里** —— 能复用就别重写。returns 里带 taskId 表示它已经挂成任务了。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    ready: true,
    run: () => vault.listScripts()
  },

  read_script: {
    name: 'read_script',
    describe: '读一个脚本的完整代码。改之前先读，别凭记忆改。',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: '不带 .py' } },
      required: ['name'],
      additionalProperties: false
    },
    ready: true,
    run: (a) => vault.readScript(String(a.name))
  },

  write_script: {
    name: 'write_script',
    describe:
      '写一个可复用的 Python 脚本到 scripts/<name>.py。脚本要能**独立跑**（命令行直接执行）、**打印关键过程**、把产物落到 output/ 下。覆盖已有脚本必须显式带 overwrite: true。写完用 create_task 挂成任务（cmd 写 `python scripts/<name>.py`，cwd 留空即可）。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '英文字母、数字、- 和 _' },
        code: { type: 'string', description: '完整 Python 源码' },
        overwrite: { type: 'boolean', description: '覆盖已有脚本必须为 true' }
      },
      required: ['name', 'code'],
      additionalProperties: false
    },
    ready: true,
    destructive: true,
    run: (a) => vault.writeScript(String(a.name), String(a.code), a.overwrite === true)
  },

  delete_script: {
    name: 'delete_script',
    describe: '删一个脚本（不可逆，必须带 allowDelete: true）。已经挂成任务的脚本不要删，先把任务停掉。',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, allowDelete: { type: 'boolean' } },
      required: ['name'],
      additionalProperties: false
    },
    ready: true,
    destructive: true,
    run: (a) => {
      if (a.allowDelete !== true) {
        throw new Error('删脚本是不可逆操作，要删请显式带 allowDelete: true')
      }
      return vault.deleteScript(String(a.name))
    }
  },

  /* ---------------- 构建流程（固定 6 步，每步都有门槛） ----------------
   *
   * ⚠️ 这里**故意没有**「放行」和「打回」两个工具。
   * 那不是忘了 —— 放行是人做的（渲染进程的 build:pass / build:reject，不挂在 MCP 上）。
   * 把口子留在工具层，只靠 AGENTS.md 叮嘱「不要自己放行」，迟早上演
   * “我自己审核通过了”。**边界要靠接口形状，不靠自觉。**
   */

  get_build: {
    name: 'get_build',
    describe:
      '看这件事建到第几步了、每一步交了什么、用户上一句批注是什么，以及你是不是正停在他点头上。' +
      '**每次动手之前先调它** —— 不然你不知道自己是在接着干、还是在等他放行。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    ready: true,
    run: async () => {
      const b = await vault.getBuild()
      if (!b) {
        return {
          doing: false,
          note: '现在没有进行中的构建。用户说要做一件新事时，用 start_build 开一件。',
          steps: vault.BUILD_STEPS.map((s, i) => `${i + 1}. ${s.name} —— ${s.does}；交：${s.handOver}`)
        }
      }
      return {
        doing: !b.finishedAt,
        title: b.title,
        brief: b.brief,
        step: b.step,
        state: b.state,
        /** 正等你点头时，你上一步交了什么、等的是什么 */
        waitingOnUser: b.state === 'wait' || b.state === 'rejected',
        ask: b.ask,
        steps: b.steps.map((s) => ({ i: s.i, name: s.name, state: s.state, note: s.note, evidence: s.evidence })),
        history: b.history.slice(-12),
        finishedAt: b.finishedAt,
        taskId: b.taskId
      }
    }
  },

  start_build: {
    name: 'start_build',
    describe:
      '开一件新事（就是用户刚说的那句要做什么）。会把它拆成固定 6 步：接单 → 摸底 → 动手 → 试跑 → 验收 → 上线。' +
      '**上一件没走完不能开新的** —— 先看 get_build。',
    inputSchema: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: '用户原话，照抄，别改写' },
        title: { type: 'string', description: '这件事叫什么，短一点（如「豆瓣Top250评分报表」）' }
      },
      required: ['brief'],
      additionalProperties: false
    },
    ready: true,
    run: (a) => vault.startBuild(String(a.brief), String(a.title || ''))
  },

  advance_build: {
    name: 'advance_build',
    describe:
      '推进**当前这一步**。state 只能给 doing（还在干）或 wait（干完了、停下等用户点头）。\n' +
      '⚠️ **你没有放行的权力**：传 passed 会被拒。放行只有用户能做 —— 这是设计，不是故障，别试第二次。\n' +
      'state=wait 时必须带 ask，写清三句：这一步干完了什么 / 下一步打算干什么 / 要用户拍板什么。',
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['doing', 'wait'], description: 'doing = 还在干；wait = 干完了，等他点头' },
        title: { type: 'string', description: '第 1 步用来定这件事的名字' },
        note: { type: 'string', description: '这一步交出了什么，一句人话' },
        evidence: {
          type: 'array',
          items: { type: 'string' },
          description: '证据：脚本名 / 产物文件名 / 任务 id / 笔记名。**拿不出东西就别标 wait**'
        },
        ask: { type: 'string', description: 'state=wait 时必填：干完了什么 / 下一步干什么 / 要他拍板什么' }
      },
      required: ['state'],
      additionalProperties: false
    },
    ready: true,
    run: (a) => {
      const st = String(a.state)
      if (st !== 'doing' && st !== 'wait') {
        throw new Error('state 只能是 doing 或 wait。放行（passed）只能由用户点 —— 你没有这个权力。')
      }
      return vault.advanceBuild({
        state: st,
        title: a.title === undefined ? undefined : String(a.title),
        note: a.note === undefined ? undefined : String(a.note),
        evidence: Array.isArray(a.evidence) ? a.evidence.map(String) : undefined,
        ask: a.ask === undefined ? undefined : String(a.ask)
      })
    }
  },

  /* ---------------- 产物（output/ 下的文件） ---------------- */

  list_artifacts: {
    name: 'list_artifacts',
    describe:
      '看任务产出了什么 —— 就是 output/ 目录下的文件。**跑完脚本后必须调它确认东西真的落下来了**，别只看退出码 0 就说成功。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    ready: true,
    run: () => vault.listArtifacts()
  },

  read_artifact: {
    name: 'read_artifact',
    describe:
      '读一个产物的内容（csv / md / txt / json 这类能直接看懂；图只回元信息）。**这是你自查的方式**：跑完报表，读一眼 csv，确认列对不对、有没有空值，再告诉用户做好了。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '来自 list_artifacts，相对 output/ 的路径' }
      },
      required: ['name'],
      additionalProperties: false
    },
    ready: true,
    run: async (a) => {
      const f = await vault.readArtifact(String(a.name))
      if (f.kind === 'image' || f.kind === 'sheet' || f.kind === 'other') {
        return {
          name: f.name,
          kind: f.kind,
          size: f.size,
          note:
            f.kind === 'image'
              ? '这是张图，你看不了像素 —— 想知道画得对不对，请读同名的 csv/md，或者自己再算一遍。'
              : '这个格式这里读不了。要自查就让它同时落一份 csv。'
        }
      }
      const text = f.text || ''
      return {
        name: f.name,
        kind: f.kind,
        size: f.size,
        truncated: text.length > 8000,
        text: text.slice(0, 8000)
      }
    }
  }
}

export function list(): Tool[] {
  return Object.values(tools)
}

export async function call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const tool = tools[name]
  if (!tool) throw new Error(`没有这个工具：${name}`)
  if (!tool.ready) throw new Error(`工具 ${name} 还没就绪`)
  await vault.writeAgentLog({ tool: name, args: brief(args) })
  return tool.run(args)
}
