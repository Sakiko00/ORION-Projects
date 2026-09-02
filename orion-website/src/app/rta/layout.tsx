import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'RTA-LLM — 反思性主题分析工具 | ORION AI STUDIO',
  description: '一款基于 AI 的质性研究主题分析桌面软件，自动完成从编码到报告的全流程分析',
};

export default function RTALayout({ children }: { children: React.ReactNode }) {
  return children;
}
