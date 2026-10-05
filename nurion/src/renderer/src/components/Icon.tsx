interface IconProps {
  name: string
  size?: number
}

const PATHS: Record<string, React.ReactElement> = {
  overview: <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5" />,
  tasks: <path d="M12 3 3 8v8l9 5 9-5V8l-9-5Z" />,
  agents: <path d="M12 2a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5ZM8 15h8a4 4 0 0 1 4 4v2H4v-2a4 4 0 0 1 4-4Z" />,
  pipeline: <path d="M4 12h16M14 6l6 6-6 6" />,
  settings: (
    <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  ),
  search: <path d="M21 21l-4.3-4.3M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" />,
  sun: (
    <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  ),
  moon: <path d="M21 13A8.5 8.5 0 1 1 11 3a7 7 0 0 0 10 10Z" />,
  bell: <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6ZM10 20a2 2 0 0 0 4 0" />,
  plus: <path d="M12 5v14M5 12h14" />,
  download: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  collapse: <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />,
  expand: <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />,

  // 重设计新增
  play: <path d="M7 4.5v15l12-7.5-12-7.5Z" />,
  stop: <path d="M6 6h12v12H6z" />,
  grip: <path d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  edit: <path d="M4 20h4l10-10-4-4L4 16v4ZM14 6l4 4" />,
  clock: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="M5 12.5 10 17.5 19 7" />,
  robot: <path d="M12 3v3M7 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM9.5 11h.01M14.5 11h.01M9 15h6" />,
  chart: <path d="M4 20V10M10 20V5M16 20v-7M22 20H2" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6" />,
  layers: <path d="M12 3 3 7.5 12 12l9-4.5L12 3ZM3 12.5 12 17l9-4.5M3 17 12 21.5 21 17" />,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,

  // 任务搭建 / 知识库
  book: <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22V4.5ZM4 17.5A2.5 2.5 0 0 1 6.5 15H20" />,
  save: <path d="M5 3h11l3 3v15H5V3ZM8 3v6h7V3M8 15h8" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  file: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5" />,

  // 产物
  image: (
    <path d="M4 5h16v14H4V5ZM4 15l4-4 4 4 3-3 5 5M9 9.5h.01" />
  ),
  table: <path d="M4 5h16v14H4V5ZM4 10h16M4 15h16M10 5v14" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />,
  /* 发送 —— 向上的箭头。现代对话输入框里这个形状已经等同于「发出去」 */
  arrowUp: <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />,

  /* markdown 编辑器工具栏 —— 都画成「记号本身」的样子，不用猜 */
  heading: <path d="M6 5v14M18 5v14M6 12h12" />,
  bold: <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7V5ZM7 12h7a3.5 3.5 0 0 1 0 7H7v-7Z" />,
  italic: <path d="M10 5h7M7 19h7M14.5 5 9.5 19" />,
  list: <path d="M4 6h.01M4 12h.01M4 18h.01M9 6h11M9 12h11M9 18h11" />,
  quote: <path d="M5 5v14M10 8h9M10 12h9M10 16h5" />,
  code: <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />,
  block: <path d="M5 7l4 5-4 5M13 17h6" />,
  link: (
    <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1 1M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1-1" />
  ),
  eye: (
    <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12ZM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z" />
  )
}

export function Icon({ name, size = 18 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? null}
    </svg>
  )
}
