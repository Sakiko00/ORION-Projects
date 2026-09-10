'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';

function CodeBlock({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="relative group my-4 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs">
        <span>{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: 0, background: '#0d1117' }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`prose max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: codeClass, children, ...props }) {
            const match = /language-(\w+)/.exec(codeClass || '');
            const codeStr = String(children).replace(/\n$/, '');
            if (match) {
              return <CodeBlock language={match[1]}>{codeStr}</CodeBlock>;
            }
            return (
              <code
                className="bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 px-1.5 py-0.5 rounded text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },
          h1: ({ children, ...props }) => (
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-8 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700/50" {...props}>{children}</h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mt-6 mb-3" {...props}>{children}</h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="text-lg font-medium text-slate-700 dark:text-slate-200 mt-5 mb-2" {...props}>{children}</h3>
          ),
          p: ({ children, ...props }) => (
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed my-3" {...props}>{children}</p>
          ),
          ul: ({ children, ...props }) => (
            <ul className="text-slate-600 dark:text-slate-300 list-disc list-inside space-y-1 my-3" {...props}>{children}</ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="text-slate-600 dark:text-slate-300 list-decimal list-inside space-y-1 my-3" {...props}>{children}</ol>
          ),
          li: ({ children, ...props }) => (
            <li className="text-slate-600 dark:text-slate-300 ml-2" {...props}>{children}</li>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote className="border-l-4 border-cyan-500/30 pl-4 py-2 my-4 bg-slate-100 dark:bg-slate-800/30 rounded-r-lg text-slate-600 dark:text-slate-300 italic" {...props}>{children}</blockquote>
          ),
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-4 rounded-lg border border-slate-200 dark:border-slate-700/50">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700/50" {...props}>{children}</table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-slate-50 dark:bg-slate-800/50" {...props}>{children}</thead>
          ),
          th: ({ children, ...props }) => (
            <th className="px-4 py-2 text-left text-sm font-medium text-slate-700 dark:text-slate-200" {...props}>{children}</th>
          ),
          td: ({ children, ...props }) => (
            <td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-700/30" {...props}>{children}</td>
          ),
          tr: ({ children, ...props }) => (
            <tr className="even:bg-slate-50 dark:even:bg-slate-800/20" {...props}>{children}</tr>
          ),
          a: ({ children, href, ...props }) => (
            <a href={href} className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 underline underline-offset-2 transition-colors" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
          ),
          strong: ({ children, ...props }) => (
            <strong className="text-slate-900 dark:text-slate-100 font-semibold" {...props}>{children}</strong>
          ),
          em: ({ children, ...props }) => (
            <em className="text-slate-700 dark:text-slate-200 italic" {...props}>{children}</em>
          ),
          hr: (props) => (
            <hr className="border-slate-200 dark:border-slate-700/50 my-6" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
