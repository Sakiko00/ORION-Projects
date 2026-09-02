'use client';

import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'neutral',
  securityLevel: 'loose',
  fontFamily: 'inherit',
  flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
  sequence: { useMaxWidth: true },
});

let mermaidCounter = 0;

interface MermaidRendererProps {
  chart: string;
}

export default function MermaidRenderer({ chart }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`mermaid-${++mermaidCounter}`);

  useEffect(() => {
    const render = async () => {
      if (!containerRef.current) return;
      try {
        const { svg } = await mermaid.render(idRef.current, chart);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (containerRef.current) {
          containerRef.current.innerHTML = `<pre style="color:var(--destructive);font-size:0.8rem;padding:0.5rem;">Mermaid 渲染失败</pre>`;
        }
        console.error('Mermaid render error:', err);
      }
    };
    render();
  }, [chart]);

  return (
    <div
      ref={containerRef}
      className="mermaid-container my-6 overflow-x-auto rounded-lg border border-border/50 bg-card/50 p-4"
    />
  );
}
