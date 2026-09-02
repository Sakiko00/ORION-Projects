import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import { ThemeProvider } from '@/components/ThemeProvider';
import { MusicPlayer } from '@/components/MusicPlayer';
import AudioVisualizer from '@/components/AudioVisualizer';
import ScreenPet from '@/components/ScreenPet';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ORION AI Studio',
    template: '%s | ORION AI Studio',
  },
  description:
    'ORION AI Studio - 前沿人工智能技术研发与创新工作室，专注于大模型应用、智能系统开发与AI解决方案。',
  keywords: [
    'ORION',
    'AI Studio',
    '人工智能',
    '大模型',
    'AI研发',
    '智能系统',
    '科技工作室',
  ],
  authors: [{ name: 'ORION AI Studio' }],
  generator: 'Coze Code',
  icons: {
    icon: '/favicon.ico',
  },
  openGraph: {
    title: 'ORION AI Studio | 探索AI的无限可能',
    description:
      'ORION AI Studio - 前沿人工智能技术研发与创新工作室，专注于大模型应用、智能系统开发与AI解决方案。',
    siteName: 'ORION AI Studio',
    locale: 'zh_CN',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <body className="antialiased bg-background">
        {isDev && <Inspector />}
        <ThemeProvider>
          <AudioVisualizer />
          {children}
          <MusicPlayer />
          <ScreenPet />
        </ThemeProvider>
      </body>
    </html>
  );
}
