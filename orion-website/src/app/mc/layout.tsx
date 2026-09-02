import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MC Server',
  description: 'ORION Minecraft 服务器 - 与我们一起探索方块世界',
};

export default function MCLayout({ children }: { children: React.ReactNode }) {
  return children;
}
