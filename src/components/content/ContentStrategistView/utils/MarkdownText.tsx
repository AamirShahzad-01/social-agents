/**
 * MarkdownText Component
 * 
 * Renders markdown content with syntax highlighting for code blocks.
 * Based on langchain-ai/agent-chat-ui pattern.
 */

import React, { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';

// Custom code block with copy functionality
const CodeBlock: React.FC<{
    language?: string;
    children: string;
}> = ({ language, children }) => {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(children);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group my-3">
            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-md bg-background/80 hover:bg-background border border-border text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy code"
                >
                    {copied ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                        <Copy className="h-3.5 w-3.5" />
                    )}
                </button>
            </div>
            {language && (
                <div className="absolute left-3 top-2 text-xs text-muted-foreground font-mono">
                    {language}
                </div>
            )}
            <pre className="bg-muted rounded-lg p-4 pt-8 overflow-x-auto border border-border">
                <code className="text-sm font-mono text-foreground">{children}</code>
            </pre>
        </div>
    );
};

// Inline code styling
const InlineCode: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <code className="px-1.5 py-0.5 bg-muted text-foreground rounded text-sm font-mono">
        {children}
    </code>
);

// Custom components for ReactMarkdown
const components = {
    h1: ({ children }: { children?: React.ReactNode }) => (
        <h1 className="text-xl font-semibold text-foreground mt-6 mb-3">{children}</h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
        <h2 className="text-lg font-semibold text-foreground mt-5 mb-2">{children}</h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
        <h3 className="text-base font-semibold text-foreground mt-4 mb-2">{children}</h3>
    ),
    h4: ({ children }: { children?: React.ReactNode }) => (
        <h4 className="text-sm font-semibold text-foreground mt-3 mb-1">{children}</h4>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
        <p className="text-[15px] text-foreground leading-[1.7] mb-2">{children}</p>
    ),
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
        >
            {children}
        </a>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
        <ul className="pl-6 space-y-1.5 my-3 list-disc [&_ul]:list-[circle] [&_ul_ul]:list-square marker:text-primary/70">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
        <ol className="pl-6 space-y-1.5 my-3 list-decimal [&_ol]:list-[lower-alpha] [&_ol_ol]:list-[lower-roman] marker:text-primary/70">{children}</ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
        <li className="text-[15px] text-foreground pl-1 leading-relaxed [&>ul]:mt-1.5 [&>ol]:mt-1.5">{children}</li>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
        <blockquote className="border-l-4 border-border pl-4 my-3 text-muted-foreground italic">
            {children}
        </blockquote>
    ),
    hr: () => <hr className="my-4 border-border" />,
    table: ({ children }: { children?: React.ReactNode }) => (
        <div className="my-3 overflow-x-auto">
            <table className="w-full border-collapse border border-border rounded-lg">
                {children}
            </table>
        </div>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
        <th className="border border-border bg-muted px-3 py-2 text-left text-sm font-medium">
            {children}
        </th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
        <td className="border border-border px-3 py-2 text-sm">{children}</td>
    ),
    tr: ({ children }: { children?: React.ReactNode }) => (
        <tr className="even:bg-muted/50">{children}</tr>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
        <strong className="font-semibold text-foreground">{children}</strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => (
        <em className="italic">{children}</em>
    ),
    img: ({ src, alt }: { src?: string; alt?: string }) => (
        <span className="block my-3">
            <img
                src={src}
                alt={alt || 'Image'}
                className="max-w-full h-auto rounded-lg border border-border shadow-sm"
                loading="lazy"
            />
            {alt && (
                <span className="block text-xs text-muted-foreground mt-1 text-center">
                    {alt}
                </span>
            )}
        </span>
    ),
    code: ({ inline, className, children }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
        const match = /language-(\w+)/.exec(className || '');
        const language = match ? match[1] : undefined;
        const code = String(children).replace(/\n$/, '');

        if (!inline && (language || code.includes('\n'))) {
            return <CodeBlock language={language}>{code}</CodeBlock>;
        }

        return <InlineCode>{children}</InlineCode>;
    },
    pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
};

interface MarkdownTextProps {
    children: string;
    className?: string;
}

const MarkdownTextImpl: React.FC<MarkdownTextProps> = ({ children, className }) => {
    const content = useMemo(() => (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={components as any}
        >
            {children}
        </ReactMarkdown>
    ), [children]);

    return (
        <div className={`markdown-content ${className || ''}`}>
            {content}
        </div>
    );
};

export const MarkdownText = memo(MarkdownTextImpl);

// Fallback for cases where react-markdown isn't available
export { renderMarkdown } from './markdown';
