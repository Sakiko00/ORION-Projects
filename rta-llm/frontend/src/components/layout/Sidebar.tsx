'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import anime from 'animejs';
import {
  LayoutDashboard,
  FlaskConical,
  Settings,
  History,
  Menu,
  X,
  ChevronRight,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from '@/lib/ThemeContext';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { href: '/', label: '仪表盘', icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: '/analysis', label: '分析工作台', icon: <FlaskConical className="w-5 h-5" /> },
  { href: '/history', label: '历史记录', icon: <History className="w-5 h-5" /> },
  { href: '/settings', label: 'LLM设置', icon: <Settings className="w-5 h-5" /> },
];

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const navRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (logoRef.current) {
      anime({
        targets: logoRef.current,
        opacity: [0, 1],
        translateY: [-10, 0],
        duration: 600,
        easing: 'easeOutExpo',
      });
    }
    navRefs.current.forEach((el, i) => {
      if (el) {
        anime({
          targets: el,
          opacity: [0, 1],
          translateX: [-20, 0],
          duration: 500,
          delay: 200 + i * 80,
          easing: 'easeOutExpo',
        });
      }
    });
  }, []);

  const toggleSidebar = () => setIsOpen(!isOpen);

  return (
    <>
      <button
        onClick={toggleSidebar}
        className="lg:hidden fixed top-4 left-4 z-50 p-2.5 glass rounded-xl"
      >
        {isOpen ? <X className="w-5 h-5 text-cyan-400" /> : <Menu className="w-5 h-5 text-cyan-400" />}
      </button>

      {isOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30" onClick={toggleSidebar} />
      )}

      <aside
        ref={sidebarRef}
        className={`
          fixed lg:static inset-y-0 left-0 z-40 w-64
          border-r backdrop-blur-2xl
          transform transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          flex flex-col
          bg-white/90 dark:bg-slate-950/90
          border-slate-200 dark:border-cyan-500/10
        `}
      >
        <div className="p-5 border-b border-slate-200 dark:border-cyan-500/10">
          <div ref={logoRef} className="flex items-center gap-3 cursor-pointer group" onClick={() => { if (typeof window !== 'undefined') window.open('https://orion-gzvtc.coze.site/', '_blank'); }} title="访问 ORION 官网">
            <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.3)] group-hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-shadow">
              <img src="/images/icon.png" alt="ORION" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <img src="/images/orion-logo.png" alt="ORION RTA" className="h-5 w-auto object-contain opacity-90 group-hover:opacity-100 transition-opacity" />
              <p className="text-[10px] text-slate-400 dark:text-slate-500 tracking-widest uppercase group-hover:text-cyan-400 transition-colors">Reflexive Thematic Analysis</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item, i) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                ref={el => { navRefs.current[i] = el; }}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                  transition-all duration-300 group relative overflow-hidden
                  ${isActive
                    ? 'bg-gradient-to-r from-cyan-500/15 to-teal-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/20'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/50'
                  }
                `}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-gradient-to-b from-cyan-400 to-teal-400 rounded-full" />
                )}
                <span className={isActive ? 'text-cyan-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-300 transition-colors'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {isActive && (
                  <ChevronRight className="w-4 h-4 text-cyan-400 ml-auto" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-cyan-500/10 space-y-3">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
              transition-all duration-300
              text-slate-500 dark:text-slate-400
              hover:text-slate-800 dark:hover:text-slate-200
              hover:bg-slate-100 dark:hover:bg-slate-900/50"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-5 h-5 text-amber-400" />
                <span>亮色模式</span>
              </>
            ) : (
              <>
                <Moon className="w-5 h-5 text-cyan-400" />
                <span>暗色模式</span>
              </>
            )}
          </button>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-cyan-500/5">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 tracking-widest uppercase mb-2">Specification</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Braun &amp; Clarke 2022</p>
            <div className="mt-3 w-full bg-slate-200 dark:bg-slate-800/50 rounded-full h-0.5 overflow-hidden">
              <div className="bg-gradient-to-r from-cyan-400 to-teal-400 h-0.5 rounded-full w-3/4 animate-shimmer" />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
