'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Screen Pet — Lumi (像素宠物)
 *
 * 状态帧图：
 *   cling-right (扒右边框)  cling-left (扒左边框)
 *   orb (手搓光球)  happy (跳跃欢呼)  sleep (打坐休息)
 *
 * 交互：
 *   - 初始：扒在右侧边框，半透明缩小状态
 *   - hover：唤出宠物，完全显示并开始做动作
 *   - mouseleave：回到扒边框状态
 *   - 单击：循环切换动作 (orb → happy → sleep → orb)
 *   - 拖拽：按住拖动到任意位置
 *   - 释放时靠近左/右边框：自动吸附 + 切换到对应扒边框状态
 */

type PetState = 'cling-right' | 'cling-left' | 'orb' | 'happy' | 'sleep';

const SPRITES: Record<PetState, string> = {
  'cling-right': '/pet-cling.png',
  'cling-left':  '/pet-cling-left.png',
  'orb':         '/pet-orb.png',
  'happy':       '/pet-happy.png',
  'sleep':       '/pet-sleep.png',
};

// 点击循环的动作（不含 cling 状态）
const CLICK_STATES: PetState[] = ['orb', 'happy', 'sleep'];
const SNAP_THRESHOLD = 60; // 距离边框多少像素内触发吸附

export default function ScreenPet() {
  const [state, setState] = useState<PetState>('cling-right');
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false); // 是否被唤出
  const [pos, setPos] = useState({ x: -1, y: 80 }); // -1 = 右边默认位置
  const [dragging, setDragging] = useState(false);

  const clickIdxRef = useRef(0);
  const dragStartRef = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const movedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 获取容器尺寸用于计算位置
  const getSize = () => ({ w: 100, h: 140 });

  // 初始化右侧位置
  useEffect(() => {
    const x = window.innerWidth - getSize().w;
    setPos({ x, y: 80 });
  }, []);

  // hover 唤出 / 离开收回
  useEffect(() => {
    if (hovered) {
      setActive(true);
      if (state === 'cling-right' || state === 'cling-left') {
        setState('orb');
      }
    } else if (!dragging) {
      setActive(false);
      // 只有位置靠近边栏时才切换扒拉状态，否则保持当前动作
      const nearLeft = pos.x < SNAP_THRESHOLD;
      const nearRight = pos.x + getSize().w > window.innerWidth - SNAP_THRESHOLD;
      if (nearLeft) {
        setState('cling-left');
      } else if (nearRight) {
        setState('cling-right');
      }
      // 不靠近边栏：保持当前 orb/happy/sleep 状态（仅收回半透明）
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, dragging]);

  // 单击切换动作
  const handleClick = (e: React.MouseEvent) => {
    if (movedRef.current) return; // 拖拽中不触发点击
    clickIdxRef.current = (clickIdxRef.current + 1) % CLICK_STATES.length;
    setState(CLICK_STATES[clickIdxRef.current]);
  };

  // 拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    movedRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      px: pos.x,
      py: pos.y,
    };
    setDragging(true);

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStartRef.current.x;
      const dy = ev.clientY - dragStartRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
      const nx = Math.max(0, Math.min(window.innerWidth - getSize().w, dragStartRef.current.px + dx));
      const ny = Math.max(0, Math.min(window.innerHeight - getSize().h, dragStartRef.current.py + dy));
      setPos({ x: nx, y: ny });
    };

    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);

      // 吸附检测
      const { w } = getSize();
      const currentX = pos.x;
      // 用最新的 pos，但由于 setPos 是异步的，需要从 ref 读取
      // 实际上 onMove 里已经 setPos 了，但闭包里的 pos 是旧的
      // 所以用 dragStartRef + 计算来获取最终位置
      setTimeout(() => {
        // 重新从 DOM 读取位置
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const nearLeft = rect.left < SNAP_THRESHOLD;
        const nearRight = rect.right > window.innerWidth - SNAP_THRESHOLD;

        if (nearLeft) {
          setPos({ x: 0, y: rect.top });
          setState('cling-left');
          setActive(false);
        } else if (nearRight) {
          setPos({ x: window.innerWidth - w, y: rect.top });
          setState('cling-right');
          setActive(false);
        }
      }, 0);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // 触摸支持
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    movedRef.current = false;
    dragStartRef.current = { x: t.clientX, y: t.clientY, px: pos.x, py: pos.y };
    setDragging(true);

    const onMove = (ev: TouchEvent) => {
      const t2 = ev.touches[0];
      const dx = t2.clientX - dragStartRef.current.x;
      const dy = t2.clientY - dragStartRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
      const nx = Math.max(0, Math.min(window.innerWidth - getSize().w, dragStartRef.current.px + dx));
      const ny = Math.max(0, Math.min(window.innerHeight - getSize().h, dragStartRef.current.py + dy));
      setPos({ x: nx, y: ny });
    };

    const onEnd = () => {
      setDragging(false);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      setTimeout(() => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const { w } = getSize();
        if (rect.left < SNAP_THRESHOLD) {
          setPos({ x: 0, y: rect.top });
          setState('cling-left');
          setActive(false);
        } else if (rect.right > window.innerWidth - SNAP_THRESHOLD) {
          setPos({ x: window.innerWidth - w, y: rect.top });
          setState('cling-right');
          setActive(false);
        }
      }, 0);
    };

    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  };

  const isCling = state === 'cling-right' || state === 'cling-left';

  return (
    <div
      ref={containerRef}
      className={`screen-pet-container screen-pet-${state} ${active ? 'screen-pet-active' : ''} ${dragging ? 'screen-pet-dragging' : ''}`}
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        right: 'auto',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      title="拖拽移动 · 单击切换 · 靠边吸附"
    >
      <div className="screen-pet-inner">
        <img
          key={state}
          src={SPRITES[state]}
          alt={`Lumi ${state}`}
          className="screen-pet-sprite"
          draggable={false}
        />
        {/* 睡眠 Zzz */}
        {state === 'sleep' && active && (
          <div className="screen-pet-zzz">
            <span style={{ animationDelay: '0s' }}>Z</span>
            <span style={{ animationDelay: '0.6s' }}>z</span>
            <span style={{ animationDelay: '1.2s' }}>z</span>
          </div>
        )}
        {/* 开心星星 */}
        {state === 'happy' && active && (
          <div className="screen-pet-sparkle">
            <span style={{ left: '5%', top: '0%', animationDelay: '0s' }}>✦</span>
            <span style={{ left: '75%', top: '-5%', animationDelay: '0.15s' }}>✦</span>
            <span style={{ left: '90%', top: '25%', animationDelay: '0.3s' }}>✦</span>
            <span style={{ left: '-5%', top: '35%', animationDelay: '0.1s' }}>✦</span>
            <span style={{ left: '50%', top: '-8%', animationDelay: '0.25s' }}>✦</span>
          </div>
        )}
        {/* 光球辉光 */}
        {state === 'orb' && active && (
          <div className="screen-pet-orb-glow" />
        )}
      </div>
    </div>
  );
}
