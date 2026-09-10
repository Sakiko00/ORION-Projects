import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import { ThemeProvider } from '@/lib/ThemeContext';

export const metadata: Metadata = {
  title: 'ORION RTA | 反思性主题分析法',
  description: '基于Braun & Clarke RTA规范的AI驱动质性分析工具',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <body className="antialiased min-h-screen">
        <ThemeProvider>
          <div className="flex min-h-screen relative">
            <Sidebar />
            <main className="flex-1 lg:ml-64 min-h-screen relative">
              <div className="relative z-10 min-h-screen">
                {children}
              </div>
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
