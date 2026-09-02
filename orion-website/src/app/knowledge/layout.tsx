import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '知识&资源库 - ORION AI Studio',
  description: 'AI知识库与工具资源下载',
};

export default function KnowledgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
