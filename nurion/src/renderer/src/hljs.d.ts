/**
 * highlight.js 的子路径导出没带类型（只有主入口 `.` 带）。
 *
 * 为什么非要用子路径：主入口会把**一百多种语言**全打进包里，
 * `lib/common` 只带常用的那几十种（js / ts / python / bash / json / sql / html…）
 * —— 这个应用要的不多，没必要为了省一个声明文件把包撑大一截。
 */
declare module 'highlight.js/lib/common' {
  import type { HLJSApi } from 'highlight.js'
  const hljs: HLJSApi
  export default hljs
}
