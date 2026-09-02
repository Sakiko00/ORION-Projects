'use client';

import { useTheme } from '@/components/ThemeProvider';
import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
  variant?: 'icon' | 'button';
  className?: string;
}

export function ThemeToggle({ variant = 'icon', className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  if (variant === 'button') {
    return (
      <button
        onClick={toggleTheme}
        className={`
          inline-flex items-center gap-2 px-3 py-1.5 rounded-full
          text-sm font-medium transition-all duration-300
          border border-border bg-card hover:bg-accent
          ${className}
        `}
        aria-label={theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'}
      >
        {theme === 'light' ? (
          <>
            <Moon className="w-4 h-4" />
            <span>暗色</span>
          </>
        ) : (
          <>
            <Sun className="w-4 h-4" />
            <span>亮色</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className={`
        inline-flex items-center justify-center
        w-9 h-9 rounded-full transition-all duration-300
        border border-border/50 bg-card/80 backdrop-blur-sm
        hover:bg-accent hover:scale-105 active:scale-95
        ${className}
      `}
      aria-label={theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'}
    >
      {theme === 'light' ? (
        <Moon className="w-4 h-4 text-muted-foreground" />
      ) : (
        <Sun className="w-4 h-4 text-primary" />
      )}
    </button>
  );
}
