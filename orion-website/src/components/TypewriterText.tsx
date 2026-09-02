'use client';

import { useState, useEffect, useCallback } from 'react';

interface TypewriterTextProps {
  text: string;
  className?: string;
  speed?: number;
  pauseDuration?: number;
}

export function TypewriterText({
  text,
  className = '',
  speed = 120,
  pauseDuration = 2500,
}: TypewriterTextProps) {
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Cursor blink
  useEffect(() => {
    const blink = setInterval(() => {
      setCursorVisible(v => !v);
    }, 530);
    return () => clearInterval(blink);
  }, []);

  const tick = useCallback(() => {
    if (isPaused) return;

    if (!isDeleting) {
      if (displayText.length < text.length) {
        setDisplayText(text.slice(0, displayText.length + 1));
      } else {
        setIsPaused(true);
        setTimeout(() => {
          setIsPaused(false);
          setIsDeleting(true);
        }, pauseDuration);
      }
    } else {
      if (displayText.length > 0) {
        setDisplayText(displayText.slice(0, -1));
      } else {
        setIsDeleting(false);
      }
    }
  }, [displayText, isDeleting, isPaused, text, pauseDuration]);

  useEffect(() => {
    const timer = setTimeout(tick, isDeleting ? speed / 2 : speed);
    return () => clearTimeout(timer);
  }, [tick, isDeleting, speed]);

  return (
    <span className={className}>
      {displayText}
      <span
        className="inline-block w-[3px] h-[1em] bg-primary ml-1 align-middle transition-opacity duration-100"
        style={{ opacity: cursorVisible ? 1 : 0 }}
      />
    </span>
  );
}
