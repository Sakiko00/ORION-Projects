'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/components/ThemeProvider';

import {
  ArrowUpRight,
  Mail,
  MapPin,
  School,
  Cpu,
  Target,
  Lightbulb,
  Users,
  Heart,
  Code2,
  CpuIcon,
  ExternalLink,
  User,
  Calendar,
  FileText,
  Clapperboard,
  Image as ImageIcon,
  Film,
  Wrench,
  MessageCircle,
  BookOpen,
  ArrowRight,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { TypewriterText } from '@/components/TypewriterText';

// 团队成员数据
const teamMembers = [
  { name: '李林燕', role: '负责人', description: '', expertise: [], type: 'leader' },
  { name: '杨光耀', role: '指导老师', description: '', expertise: [], type: 'advisor' },
  { name: '袁立宪', role: '指导老师', description: '', expertise: [], type: 'advisor' },
  { name: '陈清健', role: '核心成员', description: '决策 / 全栈开发 / 视觉设计', expertise: ['全栈开发', '视觉设计', '决策'], type: 'student' },
  { name: '陈嘉仪 (c+1)', role: '核心成员', description: '技术写作 / 运营', expertise: ['技术写作', '运营'], type: 'student' },
  { name: '阿布都乃比 (wade)', role: '核心成员', description: '全栈开发 / 硬件交互', expertise: ['全栈开发', '硬件交互'], type: 'student' },
  { name: '纪广然', role: '核心成员', description: '软件 / 数据', expertise: ['软件开发', '数据分析'], type: 'student' },
  { name: '杨一凡', role: '核心成员', description: '运营 / 包装', expertise: ['运营', '包装设计'], type: 'student' },
];

// 项目数据
const projects: Array<{
  title: string;
  category: string;
  description: string;
  status: string;
  link: string | null;
  icon?: string;
  recruitLink?: string;
  action?: string;
}> = [
  { title: '辅导员智能助手', category: '智能平台', description: '一站式校园服务平台，为辅导员提供智能化工作辅助与高效管理', status: '招募中', link: null, recruitLink: 'https://gitxtyrzx801.feishu.cn/wiki/XVogwBNruizByUktEvNcMlPhnVh?from=from_copylink' },
  { title: '想法行动启动器', category: 'AI Agent', description: '将想法转化为行动的智能启动工具，助力创意落地执行', status: '运营中', link: 'https://orianx.coze.site/' },
  { title: 'AI心理助手', category: 'AI Agent', description: '智能心理健康辅助工具，提供情绪支持与心理疏导', status: '运营中', link: 'https://orianassistant101-gzvtc.coze.site/' },
  { title: '微信公众号推文一键排版', category: '工具', description: '智能排版工具，一键生成美观的公众号推文格式', status: '测试中', link: null },
  { title: '反思性主题分析工具', category: '桌面应用', description: '基于 AI 的质性研究主题分析软件，自动完成从编码到报告的全流程分析', status: '运营中', link: '/rta' },
  { title: '教育智能体', category: 'AI Agent', description: '面向教育场景的智能体解决方案', status: '规划中', link: null },
  { title: '学校管理制度咨询', category: 'AI Agent', description: '基于AI的学校管理制度智能问答系统，随时随地解答管理疑问', status: '运营中', link: 'https://gzvtc-assistant.coze.site', icon: '/logo-icon.png' },
  { title: 'FinalPass', category: '工具', description: '期末考试题库，考前突击刷题必备', status: '运营中', link: 'https://orion-finalpass.netlify.app/' },
  { title: 'MC 服务器', category: '游戏', description: 'ORION Minecraft 服务器，车万女仆/史蒂夫模型模组，免正版验证', status: '运营中', link: '/mc', icon: '/mc-icon.png' },
  { title: '知识库', category: '智能平台', description: '学校学习资料分类导航平台，按学院与课程归类教材、试卷、大纲，支持在线预览下载', status: '运营中', link: 'https://gzvtc-study.coze.site/' },
  { title: '心智地图集', category: 'AI Agent', description: '融合 MBTI、荣格八维、大五人格与九型人格四大体系的多维度人格测评平台，AI 驱动深度解读', status: '运营中', link: 'https://personal-test.coze.site/' },
  { title: '技能技巧', category: 'Agent Skill', description: 'Coze Agent Skill 技能库，提供可复用的 AI 能力组件', status: '测试中', link: null },
];

// 预生成星星位置
const stars = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  left: `${(i * 17 + 31) % 100}%`,
  top: `${(i * 23 + 47) % 100}%`,
  delay: `${(i * 0.7) % 3}s`,
  duration: `${2 + (i % 3)}s`,
}));

// 核心能力
const capabilities = [
  { icon: School, title: '学校平台', description: '广州工程技术职业学院', href: undefined as string | undefined },
  { icon: Cpu, title: '实验平台', description: '信息工程学院', href: undefined as string | undefined },
  { icon: CpuIcon, title: '核心技术平台', description: '飞书 · COZE', href: undefined as string | undefined },
];

// 导航链接
const navLinks = [
  { name: '关于我们', href: '#about', num: '01' },
  { name: '团队成员', href: '#team', num: '02' },
  { name: '项目案例', href: '#projects', num: '03' },
  { name: '知识资源', href: '#knowledge', num: '04' },
  { name: '联系我们', href: '#contact', num: '05' },
];

// AIGC 作品数据
interface AigcWorkMeta { label: string; value: string; icon: React.ReactNode; }
interface AigcWork { id: string; title: string; fullTitle: string; description: string; videoSrc: string; authorized?: boolean; meta: AigcWorkMeta[]; tags: string[]; }

const aigcWorks: AigcWork[] = [
  {
    id: 'warm-sunshine',
    title: '暖阳下的守护',
    fullTitle: '《暖阳下的守护》',
    description: 'AI 生成短片，用温暖的镜头语言讲述守护的故事。作者授权展示。',
    videoSrc: '/aigc/暖阳下的守护.mp4',
    authorized: true,
    meta: [
      { label: '作者', value: '杨一凡', icon: <User className="w-3.5 h-3.5" /> },
      { label: '生图', value: 'Seedream', icon: <ImageIcon className="w-3.5 h-3.5" /> },
      { label: '生视频', value: 'Seedance', icon: <Film className="w-3.5 h-3.5" /> },
    ],
    tags: ['Seedream', 'Seedance'],
  },
  {
    id: 'mengxing',
    title: '梦醒',
    fullTitle: '《梦醒｜所立皆为未来》',
    description: 'ORION AI Studio 出品 — AI 生成视频作品，探索梦境与未来的交织。从脚本到成片，全流程 AI 协作创作。',
    videoSrc: '/aigc/梦醒.mp4',
    meta: [
      { label: '作者', value: '陈清健 (Arken)', icon: <User className="w-3.5 h-3.5" /> },
      { label: '创作时间', value: '2025-12-20', icon: <Calendar className="w-3.5 h-3.5" /> },
      { label: '脚本', value: 'GPT-5.3', icon: <FileText className="w-3.5 h-3.5" /> },
      { label: '分镜', value: '闪电分镜', icon: <Clapperboard className="w-3.5 h-3.5" /> },
      { label: '生图', value: 'Seedream 4.0 / 4.1 / 4.5', icon: <ImageIcon className="w-3.5 h-3.5" /> },
      { label: '生视频', value: '可灵 2.5 · Seedance 1.5 · ViduQ2', icon: <Film className="w-3.5 h-3.5" /> },
      { label: '后期', value: 'PS · PR · 剪映', icon: <Wrench className="w-3.5 h-3.5" /> },
    ],
    tags: ['GPT-5.3', 'Seedream', '可灵', 'Seedance', 'ViduQ2'],
  },
];

// AIGC 图片集数据
const galleryImages = [
  { src: '/aigc/gallery/elf-portrait-floral.png' },
  { src: '/aigc/gallery/tang-portrait-1.png' },
  { src: '/aigc/gallery/tang-portrait-2.png' },
  { src: '/aigc/gallery/elf-portrait-minimal.png' },
  { src: '/aigc/gallery/elf-mountain.jpg' },
  { src: '/aigc/gallery/elf-cosplay.jpg' },
  { src: '/aigc/gallery/cultural-site.png' },
];

export default function HomePage() {
  const [activeWorkIdx, setActiveWorkIdx] = useState(1);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const cozeClientRef = useRef<unknown>(null);
  const cozeInitializing = useRef(false);
  const cozeObserverRef = useRef<MutationObserver | null>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);

  // 修复Coze SDK插入的遮罩层
  const fixCozeOverlays = useCallback(() => {
    document.documentElement.style.setProperty(
      '--coze-chat-sdk-semi-color-overlay-bg', 'transparent', 'important'
    );
    const maskSelectors = [
      '.coze-chat-sdk-semi-modal-mask',
      '.coze-chat-sdk-semi-sidesheet-mask',
      '.coz-mg-mask',
    ];
    maskSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.setProperty('background-color', 'transparent', 'important');
        htmlEl.style.setProperty('background', 'transparent', 'important');
        htmlEl.style.setProperty('opacity', '0', 'important');
      });
    });
  }, []);

  // 初始化Coze Chat SDK
  const openCozeChat = useCallback(async () => {
    try {
      if (cozeClientRef.current) {
        const client = cozeClientRef.current as { showChatBot?: () => void };
        if (typeof client.showChatBot === 'function') {
          client.showChatBot();
        }
        setTimeout(fixCozeOverlays, 100);
        setTimeout(fixCozeOverlays, 500);
        setTimeout(fixCozeOverlays, 1000);
        return;
      }
      if (cozeInitializing.current) return;
      cozeInitializing.current = true;

      if (!cozeObserverRef.current) {
        const observer = new MutationObserver((mutations) => {
          let shouldFix = false;
          for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) { shouldFix = true; break; }
          }
          if (shouldFix) {
            setTimeout(fixCozeOverlays, 50);
            setTimeout(fixCozeOverlays, 300);
            setTimeout(fixCozeOverlays, 800);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        cozeObserverRef.current = observer;
      }

      const tokenRes = await fetch('/api/coze/token');
      const tokenData = await tokenRes.json();
      if (!tokenData.token) {
        console.error('Failed to get token');
        cozeInitializing.current = false;
        return;
      }

      const loadSDK = (): Promise<void> => {
        if ((window as unknown as Record<string, unknown>).CozeWebSDK) {
          return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
          const existing = document.querySelector('script[src*="chat-app-sdk"]');
          if (existing) { existing.addEventListener('load', () => resolve()); return; }
          const script = document.createElement('script');
          script.src = 'https://lf-cdn.coze.cn/obj/unpkg/flow-platform/chat-app-sdk/1.2.0-beta.19/libs/cn/index.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load SDK'));
          document.body.appendChild(script);
        });
      };

      await loadSDK();

      const CozeWebSDK = (window as unknown as Record<string, unknown>).CozeWebSDK as unknown as {
        WebChatClient: new (config: Record<string, unknown>) => unknown;
      };

      let userId = localStorage.getItem('coze_user_id');
      if (!userId) {
        userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        localStorage.setItem('coze_user_id', userId);
      }

      const isDark = document.documentElement.classList.contains('dark');

      const client = new CozeWebSDK.WebChatClient({
        config: { bot_id: '7619237637442060298' },
        componentProps: { title: '学校管理制度咨询' },
        userInfo: { id: userId, nickname: '访客' },
        auth: {
          type: 'token',
          token: tokenData.token,
          onRefreshToken: async () => {
            const res = await fetch('/api/coze/token');
            const data = await res.json();
            return data.token;
          },
        },
        ui: {
          asstBtn: { isNeed: true },
          conversations: { isNeed: false },
          chatBot: { enableNewConversation: true },
          base: { theme: isDark ? 'dark' : 'light' },
        },
      });

      const setCozeTheme = () => {
        const dark = document.documentElement.classList.contains('dark');
        const cozeRoot = document.querySelector('[id*="coze-web-chat"]') as HTMLElement | null;
        if (cozeRoot) { cozeRoot.setAttribute('data-theme', dark ? 'dark' : 'light'); }
        document.documentElement.style.setProperty('--coze-chat-sdk-semi-color-bg-0', dark ? 'oklch(0.17 0.025 200)' : 'oklch(1 0.002 200)', 'important');
        document.documentElement.style.setProperty('--coze-chat-sdk-semi-color-bg-1', dark ? 'oklch(0.13 0.025 200)' : 'oklch(0.98 0.006 200)', 'important');
        document.documentElement.style.setProperty('--coze-chat-sdk-semi-color-text-0', dark ? 'oklch(0.95 0.008 195)' : 'oklch(0.20 0.02 200)', 'important');
        document.documentElement.style.setProperty('--coze-chat-sdk-semi-color-border', dark ? 'oklch(0.26 0.02 200)' : 'oklch(0.89 0.015 200)', 'important');
      };
      setTimeout(setCozeTheme, 300);
      setTimeout(setCozeTheme, 1000);

      cozeClientRef.current = client;
      cozeInitializing.current = false;

      setTimeout(fixCozeOverlays, 200);
      setTimeout(fixCozeOverlays, 500);
      setTimeout(fixCozeOverlays, 1500);
    } catch (err) {
      console.error('Failed to init Coze Chat:', err);
      cozeInitializing.current = false;
    }
  }, [fixCozeOverlays]);

  // 滚动动画观察器
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );
    const elements = document.querySelectorAll('.animate-on-scroll');
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // 监听主题变化
  useEffect(() => {
    const html = document.documentElement;
    const observer = new MutationObserver(() => {
      const dark = html.classList.contains('dark');
      document.documentElement.style.setProperty('--coze-chat-sdk-semi-color-bg-0', dark ? 'oklch(0.17 0.025 200)' : 'oklch(1 0.002 200)', 'important');
      document.documentElement.style.setProperty('--coze-chat-sdk-semi-color-bg-1', dark ? 'oklch(0.13 0.025 200)' : 'oklch(0.98 0.006 200)', 'important');
      document.documentElement.style.setProperty('--coze-chat-sdk-semi-color-text-0', dark ? 'oklch(0.95 0.008 195)' : 'oklch(0.20 0.02 200)', 'important');
      document.documentElement.style.setProperty('--coze-chat-sdk-semi-color-border', dark ? 'oklch(0.26 0.02 200)' : 'oklch(0.89 0.015 200)', 'important');
      const cozeRoot = document.querySelector('[id*="coze-web-chat"]') as HTMLElement | null;
      if (cozeRoot) { cozeRoot.setAttribute('data-theme', dark ? 'dark' : 'light'); }
    });
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // 画廊自动横向滚动 — 用 CSS animation 驱动，悬停暂停
  useEffect(() => {
    const el = galleryScrollRef.current;
    if (!el) return;

    const onEnter = () => { el.style.animationPlayState = 'paused'; };
    const onLeave = () => { el.style.animationPlayState = 'running'; };

    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);

    return () => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* ═══ 导航栏 — 构成主义工业风 ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/85 backdrop-blur-xl border-b border-primary/15">
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-primary/40 via-primary/10 to-transparent" />
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="#" className="flex items-center gap-3 group">
            <div className="relative">
              <Image src="/logo-icon.png" alt="ORION" width={36} height={36} className="rounded-md transition-transform duration-300 group-hover:scale-110" />
              <div className="absolute -inset-1 border border-primary/0 group-hover:border-primary/30 rounded-lg transition-all duration-300" />
            </div>
            <Image src="/logo-text.png" alt="ORION" width={72} height={28} className="transition-opacity duration-300 group-hover:opacity-70" />
          </a>
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <a key={link.name} href={link.href} className="nav-link-construct group/nav relative text-sm text-muted-foreground hover:text-foreground transition-colors duration-300 flex items-center gap-2 px-3 py-2">
                <span className="font-mono text-[10px] text-primary/70 group-hover/nav:text-primary transition-colors">{link.num}</span>
                <span className="tracking-wide">{link.name}</span>
                <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-primary scale-x-0 group-hover/nav:scale-x-100 transition-transform duration-300 origin-left" />
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <a href="https://gitxtyrzx801.feishu.cn/share/base/form/shrcndiecAStaG2RQVe61zc8IHh" target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="gap-2 transition-all duration-300 hover:gap-3 font-mono text-xs tracking-wider uppercase rounded-none border border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90">
                开始合作
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </a>
          </div>
        </div>
      </nav>

      {/* ═══ Hero 区 — 构成主义非对称构图 ═══ */}
      <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
        {/* 网格背景 */}
        <div className="absolute inset-0 grid-bg opacity-60" />
        {/* 装饰纹理叠加 */}
        <div className="decor-texture" />
        {/* 背景图 — 右侧区域，角色完整显示，z-1 在频谱之上 */}
        <div
          className="absolute right-0 top-0 bottom-0 w-[55%] z-[1] hidden md:block"
          style={{
            backgroundImage: 'url(/hero-bg.png)',
            backgroundSize: 'cover',
            backgroundPosition: '70% center',
            backgroundRepeat: 'no-repeat',
            opacity: 0.4,
          }}
        />

        {/* ═ 构成主义对角线红色条 — 核心视觉元素 ═ */}
        <div className="absolute top-[10%] left-[5%] w-40 h-[3px] bg-primary/40 hidden md:block" style={{ transform: 'skewY(-12deg)' }} />
        {/* 交叉对角线 */}
        <div className="absolute top-[20%] right-[5%] w-32 h-[2px] bg-primary/15 hidden lg:block" style={{ transform: 'rotate(-35deg)' }} />

        {/* ═ 大型几何装饰 — 构成主义圆与方 ═ */}
        <div className="absolute top-16 right-8 md:right-24 w-48 h-48 md:w-72 md:h-72 rounded-full border border-primary/15 animate-rotate-slow" />
        <div className="absolute top-24 right-16 md:right-36 w-24 h-24 md:w-36 md:h-36 rounded-full border-2 border-primary/25" />
        {/* 构成主义填充方块 — 红色色块 */}
        <div className="absolute top-32 right-12 md:right-28 w-8 h-8 md:w-12 md:h-12 bg-primary/8 hidden md:block" />
        {/* 构成主义方块 */}
        <div className="absolute bottom-24 left-8 md:left-16 w-20 h-20 md:w-32 md:h-32 border border-primary/20 rotate-12" />
        <div className="absolute bottom-36 left-12 md:left-24 w-12 h-12 md:w-20 md:h-20 bg-primary/8 rotate-45" />
        {/* 构成主义三角形装饰 — 更明显 */}
        <div className="absolute bottom-28 left-28 md:left-44 w-0 h-0 hidden md:block" style={{ borderLeft: '20px solid transparent', borderRight: '20px solid transparent', borderBottom: '36px solid var(--primary)', opacity: '0.15' }} />
        {/* 构成主义填充圆 — 右侧 */}
        <div className="absolute top-1/2 right-[8%] w-3 h-3 rounded-full bg-primary/30 hidden md:block" />

        {/* ═ 垂直文字标签 — 工业感 ═ */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 hidden lg:flex flex-col items-center gap-3">
          <span className="vertical-text">EST · 2024 · GUANGZHOU</span>
          <div className="w-[1px] h-16 bg-gradient-to-b from-primary/30 to-transparent" />
        </div>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden lg:flex flex-col items-center gap-3">
          <div className="w-[1px] h-16 bg-gradient-to-t from-primary/30 to-transparent" />
          <span className="vertical-text" style={{ writingMode: 'vertical-rl' }}>AI · INNOVATION · STUDIO</span>
        </div>

        {/* 星星装饰 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {stars.map((star) => (
            <div key={star.id} className="absolute w-[2px] h-[2px] bg-primary/50 rounded-full animate-pulse" style={{ left: star.left, top: star.top, animationDelay: star.delay, animationDuration: star.duration }} />
          ))}
        </div>

        {/* ═ 非对称内容布局 — 左偏移 ═ */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-16 w-full">
          <div className="max-w-2xl">
            {/* Section marker — 左对齐 */}
            <div className="flex items-center gap-3 mb-10 animate-fade-in-down">
              <div className="h-[1px] w-16 bg-primary" />
              <span className="section-num">00 / INDEX</span>
              <div className="h-[1px] w-6 bg-primary/40" />
            </div>

            {/* ═ 大型背景编号 — 构成主义排版 ═ */}
            <div className="relative">
              <span className="section-num-large top-0 left-0" style={{ opacity: '0.06' }}>00</span>

              {/* 主标题 — 左对齐，更大胆 */}
              <h1 className="display-heading text-6xl md:text-8xl lg:text-9xl mb-4 animate-fade-in-up relative" style={{ animationDelay: '0.15s' }}>
                <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/50 bg-clip-text text-transparent">
                  <TypewriterText text="ORION" speed={140} pauseDuration={2500} />
                </span>
              </h1>

              {/* ═ 构成主义红色条 — 标题下方 ═ */}
              <div className="flex items-center gap-4 mb-6 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
                <div className="h-[3px] w-20 bg-primary" />
                <span className="font-mono text-xs tracking-[0.25em] text-primary uppercase">AI · STUDIO · 工作室</span>
              </div>
            </div>

            <p className="display-heading text-2xl md:text-4xl text-foreground mb-4 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
              探索人工智能的
              <br className="md:hidden" />
              <span className="text-primary">无限可能</span>
            </p>

            <p className="text-sm md:text-base text-muted-foreground max-w-md mb-10 leading-relaxed animate-fade-in-up font-sans" style={{ animationDelay: '0.55s' }}>
              广州工程技术职业学院 · 信息工程学院
              <br />
              专注于AI应用开发与智能化解决方案
            </p>

            {/* CTA — 左对齐 */}
            <div className="flex flex-col sm:flex-row gap-4 animate-fade-in-up" style={{ animationDelay: '0.7s' }}>
              <a href="#projects">
                <Button size="lg" className="gap-2 px-8 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/20 font-mono text-xs tracking-wider uppercase">
                  了解我们的项目
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              </a>
              <a href="#contact">
                <Button size="lg" variant="outline" className="gap-2 px-8 transition-all duration-300 hover:scale-[1.02] font-mono text-xs tracking-wider uppercase">
                  联系我们
                  <Mail className="h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
        </div>

        {/* ═ 构成主义底部信息条 ═ */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-border/30 bg-background/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 md:px-16 py-3 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/50 uppercase">N23°06′ · E113°19′</span>
              <div className="hidden md:block dotted-line w-24" />
              <span className="hidden md:inline font-mono text-[10px] tracking-[0.2em] text-muted-foreground/50 uppercase">SCROLL TO EXPLORE</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="font-mono text-[10px] tracking-[0.2em] text-primary/70 uppercase">LIVE</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 构成主义滚动横幅 ═══ */}
      <div className="relative border-y border-border/40 bg-background py-4 overflow-hidden">
        <div className="marquee-track gap-8">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center gap-8 shrink-0">
              {['AI INNOVATION', '智能系统开发', '大模型应用', 'ORION STUDIO', '教育科技', 'AGENT SKILL', 'AIGC CREATIVE', '广州工程技术职业学院'].map((text, j) => (
                <div key={j} className="flex items-center gap-8 shrink-0">
                  <span className="font-display font-bold text-lg md:text-2xl tracking-tight text-foreground/80">{text}</span>
                  <div className="w-2 h-2 bg-primary rotate-45 shrink-0" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ 关于我们 — 构成主义排版 ═══ */}
      <section id="about" className="py-28 md:py-36 relative overflow-hidden">
        {/* 大型背景编号 */}
        <span className="section-num-large top-8 right-8 md:right-16" style={{ fontSize: 'clamp(4rem, 12vw, 10rem)' }}>01</span>
        {/* 对角线装饰 */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-primary/30 via-border to-transparent" />
        {/* 装饰纹理叠加 */}
        <div className="decor-texture" />
        
        <div className="max-w-7xl mx-auto px-6 relative">
          {/* Section header — 左对齐构成主义风格 */}
          <div className="flex items-center gap-4 mb-16 animate-on-scroll">
            <span className="section-num text-lg">01</span>
            <div className="h-[2px] w-12 bg-primary" />
            <span className="mono-label">关于我们 · About</span>
            <div className="flex-1 h-[1px] bg-border/40" />
          </div>

          <div className="grid lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 animate-on-scroll relative">
              <h2 className="display-heading text-4xl md:text-5xl lg:text-6xl mb-8 leading-[1.1]">
                以AI之名
                <br />
                <span className="text-muted-foreground">创造</span>
                <span className="text-primary">无限可能</span>
              </h2>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-10 max-w-xl">
                ORION AI Studio 是广州工程技术职业学院信息工程学院旗下的AI技术创新工作室。在指导老师的带领下，我们专注于人工智能应用开发、智能系统设计与创新实践，致力于将AI技术融入教育与实际应用场景。
              </p>
              <div className="grid grid-cols-3 gap-4">
                {capabilities.map((cap, index) => {
                  const content = (
                    <>
                      <cap.icon className="w-6 h-6 text-primary mb-3 transition-transform duration-300 group-hover:scale-110" />
                      <div className="mono-label mb-1">{cap.title}</div>
                      <div className="text-xs text-muted-foreground">{cap.description}</div>
                    </>
                  );
                  return cap.href ? (
                    <Link key={index} href={cap.href} className="construct-card-bold group bg-card border border-border/60 p-4 block">
                      <div className="corner-mark corner-mark-tl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      {content}
                    </Link>
                  ) : (
                    <div key={index} className="construct-card-bold group bg-card border border-border/60 p-4">
                      <div className="corner-mark corner-mark-tl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-5 relative animate-on-scroll" style={{ transitionDelay: '0.15s' }}>
              <div className="relative aspect-[4/5] rounded-lg overflow-hidden bg-gradient-to-br from-primary/8 to-primary/3">
                <Image src="/about-portrait.png" alt="ORION Studio" fill className="object-cover transition-transform duration-700 hover:scale-105" />
                {/* 构成主义角标 — 更大胆 */}
                <div className="absolute top-0 left-0 w-20 h-20 border-t-[3px] border-l-[3px] border-primary pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-20 h-20 border-b-[3px] border-r-[3px] border-primary pointer-events-none" />
                {/* 构成主义对角线条 */}
                <div className="absolute top-0 right-0 w-[2px] h-full bg-primary/20 pointer-events-none" style={{ transform: 'skewX(-8deg)' }} />
              </div>
              {/* 装饰圆 — 双层 */}
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full border border-primary/20 animate-rotate-slow" />
              <div className="absolute -top-2 -right-2 w-16 h-16 rounded-full border-2 border-primary/15" />
              {/* 构成主义方块装饰 */}
              <div className="absolute -bottom-4 -left-4 w-12 h-12 border border-primary/20 rotate-12" />
              <div className="absolute -bottom-8 -left-8 font-mono text-[10px] text-muted-foreground/40 tracking-wider">
                EST. 2024
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 团队成员 — 构成主义网格 ═══ */}
      <section id="team" className="py-28 md:py-36 bg-muted/30 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        {/* 装饰纹理叠加 */}
        <div className="decor-texture" />
        {/* 大型背景编号 */}
        <span className="section-num-large bottom-8 left-8 md:left-16" style={{ fontSize: 'clamp(4rem, 12vw, 10rem)' }}>02</span>
        {/* 对角线装饰 */}
        <div className="absolute top-0 right-0 w-[2px] h-full bg-primary/10 hidden md:block" style={{ transform: 'skewX(-6deg)' }} />
        
        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="flex items-center gap-4 mb-4 animate-on-scroll">
            <span className="section-num text-lg">02</span>
            <div className="h-[2px] w-12 bg-primary" />
            <span className="mono-label">核心团队 · Team</span>
            <div className="flex-1 h-[1px] bg-border/40" />
          </div>
          <h2 className="display-heading text-4xl md:text-5xl mb-4 animate-on-scroll">
            认识我们的<span className="text-primary">团队</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mb-16 animate-on-scroll">
            一群对AI充满热情的技术爱好者，用专业与执着推动每一次创新
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {teamMembers.map((member, index) => (
              <div
                key={index}
                className={`construct-card-bold group bg-card border border-border/60 p-6 animate-on-scroll ${
                  member.type === 'leader' ? 'ring-1 ring-primary/20' : ''
                } ${member.type === 'advisor' ? 'border-primary/15' : ''}`}
                style={{ transitionDelay: `${index * 0.06}s` }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${
                    member.type === 'leader' ? 'bg-primary/15' : member.type === 'advisor' ? 'bg-primary/10' : 'bg-muted'
                  }`}>
                    {member.type === 'leader' ? (
                      <Users className="w-5 h-5 text-primary" />
                    ) : member.type === 'advisor' ? (
                      <School className="w-5 h-5 text-primary" />
                    ) : (
                      <Code2 className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground/40">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="text-base font-semibold mb-1">{member.name}</h3>
                <p className={`text-xs mb-3 font-mono tracking-wide ${
                  member.type === 'leader' ? 'text-primary' : member.type === 'advisor' ? 'text-primary/80' : 'text-muted-foreground'
                }`}>{member.role}</p>
                {member.description && (
                  <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{member.description}</p>
                )}
                {member.expertise.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {member.expertise.map((exp, i) => (
                      <span key={i} className="construct-tag">{exp}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 项目展示 — 构成主义卡片网格 ═══ */}
      <section id="projects" className="py-28 md:py-36 relative overflow-hidden">
        {/* 大型背景编号 */}
        <span className="section-num-large top-8 right-8 md:right-16" style={{ fontSize: 'clamp(4rem, 12vw, 10rem)' }}>03</span>
        {/* 对角线装饰 */}
        <div className="absolute top-0 left-0 w-[2px] h-full bg-primary/8 hidden md:block" style={{ transform: 'skewX(-6deg)' }} />
        {/* 装饰纹理叠加 */}
        <div className="decor-texture" />
        
        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="flex items-center gap-4 mb-4 animate-on-scroll">
            <span className="section-num text-lg">03</span>
            <div className="h-[2px] w-12 bg-primary" />
            <span className="mono-label">项目案例 · Projects</span>
            <div className="flex-1 h-[1px] bg-border/40" />
          </div>
          <h2 className="display-heading text-4xl md:text-5xl mb-4 animate-on-scroll">
            我们的产品与<span className="text-primary">项目</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mb-16 animate-on-scroll">
            从概念到落地，每一个项目都承载着我们对AI技术的探索
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project, index) => (
              <div
                key={index}
                className="construct-card-bold group bg-card border border-border/60 p-6 animate-on-scroll flex flex-col"
                style={{ transitionDelay: `${index * 0.05}s` }}
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    {project.icon && (
                      <Image src={project.icon} alt={project.title} width={32} height={32} className="rounded" />
                    )}
                    <span className="construct-tag">{project.category}</span>
                  </div>
                  {project.status === '运营中' ? (
                    <span className="status-active">{project.status}</span>
                  ) : (
                    <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">{project.status}</span>
                  )}
                </div>
                <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors duration-300">{project.title}</h3>
                <p className="text-sm text-muted-foreground mb-5 flex-1 leading-relaxed">{project.description}</p>
                <div className="flex items-center gap-3 pt-4 border-t border-border/40">
                  {project.action === 'coze-chat' ? (
                    <button onClick={openCozeChat} className="inline-flex items-center gap-1 text-xs text-primary hover:gap-2 transition-all duration-300 font-mono tracking-wide">
                      开始咨询 <MessageCircle className="w-3.5 h-3.5" />
                    </button>
                  ) : project.recruitLink ? (
                    <a href={project.recruitLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:gap-2 transition-all duration-300 font-mono tracking-wide">
                      查看招募 <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : project.link && (
                    project.link.startsWith('/') ? (
                      <Link href={project.link} className="inline-flex items-center gap-1 text-xs text-primary hover:gap-2 transition-all duration-300 font-mono tracking-wide">
                        查看详情 <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <a href={project.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:gap-2 transition-all duration-300 font-mono tracking-wide">
                        访问项目 <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )
                  )}
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground/30">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ AIGC 作品展示 — 构成主义媒体区 ═══ */}
      <section className="py-24 md:py-32 bg-muted/30 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        {/* 装饰纹理叠加 */}
        <div className="decor-texture" />
        {/* 大型背景编号 */}
        <span className="section-num-large bottom-8 right-8 md:right-16" style={{ fontSize: 'clamp(4rem, 12vw, 10rem)' }}>04</span>
        {/* 对角线装饰 */}
        <div className="absolute top-0 right-0 w-[2px] h-full bg-primary/10 hidden md:block" style={{ transform: 'skewX(-6deg)' }} />
        
        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="flex items-center gap-4 mb-4 animate-on-scroll">
            <span className="section-num text-lg">04</span>
            <div className="h-[2px] w-12 bg-primary" />
            <span className="mono-label">AIGC · 创意作品</span>
            <div className="flex-1 h-[1px] bg-border/40" />
          </div>
          <h2 className="display-heading text-4xl md:text-5xl mb-4 animate-on-scroll">
            AI 生成<span className="text-primary">创意作品</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mb-12 animate-on-scroll">
            探索 AI 与创意的交汇，每一帧都是技术与艺术的融合
          </p>

          <div className="flex gap-6 animate-on-scroll">
            {/* 作品列表 */}
            <div className="w-52 shrink-0 hidden md:block">
              <div className="bg-card border border-border/50 rounded-lg p-2 sticky top-20">
                <div className="mono-label px-3 pt-2.5 pb-1.5">作品列表</div>
                {aigcWorks.map((work, idx) => (
                  <button
                    key={work.id}
                    onClick={() => setActiveWorkIdx(idx)}
                    className={`w-full text-left rounded-md px-3 py-3 mb-1 last:mb-0 transition-all duration-200 border-l-2 ${
                      activeWorkIdx === idx
                        ? 'bg-primary/8 border-primary'
                        : 'hover:bg-muted/50 border-transparent'
                    }`}
                  >
                    <div className={`text-sm font-medium leading-snug ${activeWorkIdx === idx ? 'text-primary' : 'text-foreground'}`}>
                      {work.fullTitle}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground mt-1 tracking-wide">
                      {work.authorized ? '授权展示' : 'ORION 出品'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 视频 + 信息 */}
            <div className="flex-1 min-w-0">
              <div className="rounded-lg overflow-hidden bg-black border border-border/30 shadow-xl max-w-3xl relative">
                <video key={aigcWorks[activeWorkIdx].videoSrc} controls className="w-full aspect-video" preload="metadata">
                  <source src={aigcWorks[activeWorkIdx].videoSrc} type="video/mp4" />
                  您的浏览器不支持视频播放
                </video>
                {/* 几何角标 */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary/60 pointer-events-none" />
              </div>

              {/* 作品信息 */}
              <div className="mt-6 max-w-3xl">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-bold">{aigcWorks[activeWorkIdx].fullTitle}</h3>
                  {aigcWorks[activeWorkIdx].authorized && (
                    <span className="construct-tag">授权展示</span>
                  )}
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed mb-5">
                  {aigcWorks[activeWorkIdx].description}
                </p>

                <div className="flex flex-wrap gap-x-6 gap-y-2 mb-4">
                  {aigcWorks[activeWorkIdx].meta.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
                        {item.icon}
                      </div>
                      <div>
                        <span className="font-mono text-[10px] text-muted-foreground/60 tracking-wider uppercase">{item.label}</span>
                        <span className="text-xs font-medium ml-1.5">{item.value}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {aigcWorks[activeWorkIdx].tags.map((tag) => (
                    <span key={tag} className="construct-tag">{tag}</span>
                  ))}
                </div>
              </div>

              {/* 移动端切换 */}
              <div className="flex gap-2 mt-6 md:hidden">
                {aigcWorks.map((work, idx) => (
                  <button
                    key={work.id}
                    onClick={() => setActiveWorkIdx(idx)}
                    className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all font-mono ${
                      activeWorkIdx === idx ? 'bg-primary text-primary-foreground' : 'bg-card border border-border/50 text-muted-foreground'
                    }`}
                  >
                    {work.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ AIGC 图片集 — 构成主义画廊 ═══ */}
      <section className="py-24 md:py-32 relative overflow-hidden">
        {/* 装饰纹理叠加 */}
        <div className="decor-texture" />
        {/* 大型背景编号 */}
        <span className="section-num-large top-8 left-8 md:left-16" style={{ fontSize: 'clamp(3rem, 10vw, 8rem)' }}>04.1</span>
        {/* 对角线装饰 */}
        <div className="absolute top-0 left-0 w-[2px] h-full bg-primary/8 hidden md:block" style={{ transform: 'skewX(-6deg)' }} />
        
        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="flex items-center gap-4 mb-4 animate-on-scroll">
            <span className="section-num text-lg">04.1</span>
            <div className="h-[2px] w-12 bg-primary" />
            <span className="mono-label">AIGC 画廊 · Gallery</span>
            <div className="flex-1 h-[1px] bg-border/40" />
          </div>
          <h2 className="display-heading text-4xl md:text-5xl mb-4 animate-on-scroll">
            AI 生成<span className="text-primary">创意图片</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mb-12 animate-on-scroll">
            精灵幻想、古风剧照与创意摄影，探索 AI 与艺术的交汇
          </p>

          <div className="relative animate-on-scroll">
            {/* 渐变遮罩 — 左右淡出 */}
            <div className="absolute left-0 top-0 bottom-4 w-16 z-10 pointer-events-none bg-gradient-to-r from-background to-transparent" />
            <div className="absolute right-0 top-0 bottom-4 w-16 z-10 pointer-events-none bg-gradient-to-l from-background to-transparent" />
            <div className="overflow-hidden pb-4 gallery-scroll">
              <div ref={galleryScrollRef} className="flex gap-4 gallery-track">
                {[...galleryImages, ...galleryImages].map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setLightboxIdx(idx % galleryImages.length)}
                    className="shrink-0 w-60 group relative rounded-none overflow-hidden border border-primary/20 hover:border-primary/50 transition-all duration-300 cursor-pointer"
                  >
                    <div className="aspect-[3/4] overflow-hidden bg-muted relative">
                      <Image src={img.src} alt={`AIGC 作品 ${(idx % galleryImages.length) + 1}`} width={240} height={320} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      {/* 编号 */}
                      <div className="absolute top-2 left-2 font-mono text-[10px] text-primary/80 tracking-wider">
                        {String((idx % galleryImages.length) + 1).padStart(2, '0')}
                      </div>
                      {/* 角标 */}
                      <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-primary/40" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-primary/40" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 mt-4 text-muted-foreground/40 text-xs font-mono tracking-wider">
              <span>自动滚动 · 悬停暂停 · 点击查看大图</span>
            </div>
          </div>

          {/* Lightbox */}
          {lightboxIdx !== null && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in" onClick={() => setLightboxIdx(null)}>
              <button onClick={() => setLightboxIdx(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10" aria-label="关闭">
                <X className="w-5 h-5" />
              </button>
              {lightboxIdx > 0 && (
                <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10" aria-label="上一张">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {lightboxIdx < galleryImages.length - 1 && (
                <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10" aria-label="下一张">
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
              <Image src={galleryImages[lightboxIdx].src} alt={`AIGC 作品 ${lightboxIdx + 1}`} width={800} height={1067} className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
            </div>
          )}
        </div>
      </section>

      {/* ═══ 价值观 — 构成主义三联画 ═══ */}
      <section className="py-28 md:py-36 bg-muted/30 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        {/* 装饰纹理叠加 */}
        <div className="decor-texture" />
        {/* 大型背景编号 */}
        <span className="section-num-large top-8 right-8 md:right-16" style={{ fontSize: 'clamp(4rem, 12vw, 10rem)' }}>05</span>
        {/* 对角线装饰 */}
        <div className="absolute top-0 left-0 w-[2px] h-full bg-primary/10 hidden md:block" style={{ transform: 'skewX(-6deg)' }} />
        
        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="flex items-center gap-4 mb-16 animate-on-scroll">
            <span className="section-num text-lg">05</span>
            <div className="h-[2px] w-12 bg-primary" />
            <span className="mono-label">价值观 · Values</span>
            <div className="flex-1 h-[1px] bg-border/40" />
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Target, title: '精准', desc: '像猎户座的弓箭手一样，精准把握每一次技术机会', num: '01' },
              { icon: Lightbulb, title: '创新', desc: '打破常规思维，用创新的方法解决技术难题', num: '02' },
              { icon: Heart, title: '热爱', desc: '对技术的热爱驱动我们不断探索与进步', num: '03' },
            ].map((item, index) => (
              <div key={index} className="construct-card-bold group bg-card border border-border/60 p-8 animate-on-scroll relative" style={{ transitionDelay: `${index * 0.1}s` }}>
                <div className="corner-mark corner-mark-tl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="flex items-start justify-between mb-6">
                  <div className="w-14 h-14 rounded-lg bg-primary/8 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                    <item.icon className="w-7 h-7 text-primary" />
                  </div>
                  <span className="font-mono text-3xl font-bold text-muted-foreground/10">{item.num}</span>
                </div>
                <h3 className="display-heading text-2xl mb-3">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 知识&资源库 — 构成主义双联 ═══ */}
      <section id="knowledge" className="py-28 md:py-36 relative overflow-hidden">
        {/* 装饰纹理叠加 */}
        <div className="decor-texture" />
        {/* 大型背景编号 */}
        <span className="section-num-large bottom-8 left-8 md:left-16" style={{ fontSize: 'clamp(4rem, 12vw, 10rem)' }}>06</span>
        {/* 对角线装饰 */}
        <div className="absolute top-0 right-0 w-[2px] h-full bg-primary/8 hidden md:block" style={{ transform: 'skewX(-6deg)' }} />
        
        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="flex items-center gap-4 mb-4 animate-on-scroll">
            <span className="section-num text-lg">06</span>
            <div className="h-[2px] w-12 bg-primary" />
            <span className="mono-label">知识&资源库 · Resources</span>
            <div className="flex-1 h-[1px] bg-border/40" />
          </div>
          <h2 className="display-heading text-4xl md:text-5xl mb-4 animate-on-scroll">
            学习资源 · <span className="text-primary">工具下载</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mb-16 animate-on-scroll">
            精选 AI 学习资料与实用工具，助力你的技术成长之路
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <Link href="/knowledge" className="group animate-on-scroll">
              <div className="construct-card-bold bg-card border border-border/60 p-8 h-full relative">
                <div className="corner-mark corner-mark-tl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="flex items-start justify-between mb-6">
                  <div className="w-14 h-14 rounded-lg bg-primary/8 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <BookOpen className="w-7 h-7 text-primary" />
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground/40 tracking-wider">01</span>
                </div>
                <h3 className="display-heading text-2xl mb-3">知识库</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed text-sm">
                  AI 提示词技巧、基础工具导航等精选学习资料，以图文形式系统呈现，帮助快速掌握 AI 应用方法。
                </p>
                <div className="flex flex-wrap gap-2 mb-6">
                  <span className="construct-tag">提示词工程</span>
                  <span className="construct-tag">AI工具导航</span>
                  <span className="construct-tag">飞书知识库</span>
                </div>
                <span className="text-xs text-primary font-medium inline-flex items-center gap-1 group-hover:gap-2 transition-all font-mono tracking-wide">
                  查看知识库 <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
            <Link href="/knowledge?tab=resources" className="group animate-on-scroll" style={{ transitionDelay: '0.1s' }}>
              <div className="construct-card-bold bg-card border border-border/60 p-8 h-full relative">
                <div className="corner-mark corner-mark-tl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="flex items-start justify-between mb-6">
                  <div className="w-14 h-14 rounded-lg bg-primary/8 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Wrench className="w-7 h-7 text-primary" />
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground/40 tracking-wider">02</span>
                </div>
                <h3 className="display-heading text-2xl mb-3">资源库</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed text-sm">
                  Obsidian 知识管理、Hyperdown 网盘下载、Project Graph 项目结构图等实用工具，即下即用。
                </p>
                <div className="flex flex-wrap gap-2 mb-6">
                  <span className="construct-tag">Obsidian</span>
                  <span className="construct-tag">Hyperdown</span>
                  <span className="construct-tag">Project Graph</span>
                </div>
                <span className="text-xs text-primary font-medium inline-flex items-center gap-1 group-hover:gap-2 transition-all font-mono tracking-wide">
                  查看资源库 <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ 联系我们 — 构成主义终章 ═══ */}
      <section id="contact" className="py-28 md:py-36 bg-muted/30 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        {/* 装饰纹理叠加 */}
        <div className="decor-texture" />
        {/* 大型背景编号 */}
        <span className="section-num-large top-8 right-8 md:right-16" style={{ fontSize: 'clamp(4rem, 12vw, 10rem)' }}>07</span>
        {/* 对角线装饰 */}
        <div className="absolute top-0 left-0 w-[2px] h-full bg-primary/10 hidden md:block" style={{ transform: 'skewX(-6deg)' }} />
        {/* 构成主义大方块装饰 */}
        <div className="absolute bottom-10 right-10 w-24 h-24 border border-primary/10 rotate-12 hidden md:block" />
        
        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="flex items-center gap-4 mb-4 animate-on-scroll">
            <span className="section-num text-lg">07</span>
            <div className="h-[2px] w-12 bg-primary" />
            <span className="mono-label">联系我们 · Contact</span>
            <div className="flex-1 h-[1px] bg-border/40" />
          </div>
          <h2 className="display-heading text-4xl md:text-5xl mb-16 animate-on-scroll">
            开启AI<span className="text-primary">合作之旅</span>
          </h2>

          <div className="grid lg:grid-cols-12 gap-12">
            <div className="lg:col-span-6 animate-on-scroll">
              <p className="text-base text-muted-foreground mb-10 max-w-md leading-relaxed">
                无论您是想了解我们的技术方案，还是探讨合作机会，我们都期待与您交流。
              </p>

              <div className="space-y-6">
                <div className="flex items-start gap-4 group">
                  <div className="w-10 h-10 rounded-lg bg-primary/8 flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:bg-primary/15 group-hover:scale-110">
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="mono-label mb-1">工作室地址</div>
                    <p className="text-sm text-foreground">综合楼 209</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 group">
                  <div className="w-10 h-10 rounded-lg bg-primary/8 flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:bg-primary/15 group-hover:scale-110">
                    <Mail className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="mono-label mb-1">电子邮箱</div>
                    <p className="text-sm text-foreground font-mono">1394870766@qq.com</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 group">
                  <div className="w-10 h-10 rounded-lg bg-primary/8 flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:bg-primary/15 group-hover:scale-110">
                    <School className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="mono-label mb-1">所属平台</div>
                    <p className="text-sm text-foreground">广州工程技术职业学院 · 信息工程学院</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 animate-on-scroll" style={{ transitionDelay: '0.15s' }}>
              <Card className="bg-card/60 backdrop-blur border-border/50">
                <CardContent className="p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-[#3370FF]/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#3370FF]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M21.362 9.354H11.93a.5.5 0 0 0-.5.5v2.228a.5.5 0 0 0 .5.5h4.891c.477 0 .65.62.318.937l-7.357 7.03a.5.5 0 0 0-.149.356v2.228a.5.5 0 0 0 .5.5h9.432a.5.5 0 0 0 .5-.5v-2.228a.5.5 0 0 0-.5-.5h-4.891c-.477 0-.65-.62-.318-.937l7.357-7.03a.5.5 0 0 0 .149-.356V9.854a.5.5 0 0 0-.5-.5zM6.9 2.354H2.738a.5.5 0 0 0-.5.5v2.228a.5.5 0 0 0 .5.5h2.38c.477 0 .65.62.318.937l-3.42 3.27a.5.5 0 0 0-.149.356v2.228a.5.5 0 0 0 .5.5h4.162a.5.5 0 0 0 .5-.5V9.854a.5.5 0 0 0-.5-.5H4.038c-.477 0-.65-.62-.318-.937l3.42-3.27a.5.5 0 0 0 .149-.356V2.854a.5.5 0 0 0-.5-.5z"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">飞书表单</h3>
                      <p className="text-xs text-muted-foreground font-mono tracking-wide">快速填写，即时提交</p>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    {[
                      { title: '填写联系信息', desc: '姓名、微信、邮箱等基本信息' },
                      { title: '选择合作意向', desc: '技术咨询 / 项目合作 / 学习交流' },
                      { title: '提交留言', desc: '描述您的需求，我们将尽快回复' },
                    ].map((step, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                        <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold text-primary font-mono">{i + 1}</div>
                        <div>
                          <p className="text-sm font-medium">{step.title}</p>
                          <p className="text-xs text-muted-foreground">{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <a href="https://gitxtyrzx801.feishu.cn/share/base/form/shrcndiecAStaG2RQVe61zc8IHh" target="_blank" rel="noopener noreferrer" className="block">
                    <Button className="w-full gap-2 transition-all duration-300 hover:gap-3 hover:shadow-lg hover:shadow-primary/20 font-mono text-xs tracking-wider uppercase">
                      打开飞书表单
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </a>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Footer — 构成主义终页 ═══ */}
      <footer className="py-12 border-t border-border bg-background relative overflow-hidden">
        {/* 装饰纹理叠加 */}
        <div className="decor-texture" />
        {/* 顶部构成主义红线条 */}
        <div className="absolute top-0 left-0 h-[3px] bg-primary" style={{ width: '30%' }} />
        <div className="absolute top-0 right-0 h-[1px] bg-primary/30" style={{ width: '40%' }} />
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <a href="#" className="flex items-center gap-3 group">
              <Image src="/logo-icon.png" alt="ORION" width={28} height={28} className="rounded transition-transform duration-300 group-hover:scale-110" />
              <span className="font-semibold text-sm">ORION AI Studio</span>
            </a>

            <div className="flex items-center gap-6 text-xs text-muted-foreground font-mono">
              {navLinks.map((link) => (
                <a key={link.name} href={link.href} className="hover:text-primary transition-colors duration-300 flex items-center gap-1.5">
                  <span className="text-[10px] text-primary/50">{link.num}</span>
                  {link.name}
                </a>
              ))}
            </div>

            <Separator orientation="vertical" className="hidden md:block h-6" />

            <p className="text-xs text-muted-foreground font-mono tracking-wide">
              © 2026 ORION AI Studio
            </p>
          </div>

          {/* 底部构成主义信息条 */}
          <div className="mt-8 pt-6 border-t border-border/30 flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/40 uppercase">
              DESIGNED WITH DIETER RAMS PRINCIPLES × CONSTRUCTIVIST GEOMETRY
            </span>
            <div className="flex items-center gap-3">
              <div className="w-8 h-[2px] bg-primary/30" />
              <div className="w-4 h-[2px] bg-primary/50" />
              <div className="w-2 h-[2px] bg-primary" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
