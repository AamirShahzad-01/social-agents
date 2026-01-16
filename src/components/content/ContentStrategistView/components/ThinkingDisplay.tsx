'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Brain, ChevronDown, Loader2 } from 'lucide-react';

interface ThinkingDisplayProps {
    /** The thinking/reasoning content from the model */
    thinking: string;
    /** Whether the model is currently streaming thinking content */
    isThinking?: boolean;
    /** Whether to start expanded (default: true for streaming, false otherwise) */
    defaultExpanded?: boolean;
}

/**
 * ThinkingDisplay - Collapsible component to show model reasoning
 * 
 * Displays the model's thinking process in a collapsible panel.
 * Auto-expands when streaming and auto-scrolls to show new content.
 */
export const ThinkingDisplay: React.FC<ThinkingDisplayProps> = ({
    thinking,
    isThinking = false,
    defaultExpanded,
}) => {
    // Default to expanded when streaming, collapsed when complete
    const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? isThinking);
    const contentRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when thinking content updates
    useEffect(() => {
        if (isExpanded && contentRef.current && isThinking) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [thinking, isExpanded, isThinking]);

    // Auto-expand when streaming starts
    useEffect(() => {
        if (isThinking && !isExpanded) {
            setIsExpanded(true);
        }
    }, [isThinking]);

    if (!thinking) return null;

    return (
        <div className="mb-3 border border-border/50 rounded-xl overflow-hidden bg-gradient-to-r from-purple-500/5 to-blue-500/5">
            {/* Header - Always visible */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-sm"
            >
                <Brain className="w-4 h-4 text-purple-500" />
                <span className="text-muted-foreground font-medium">Reasoning</span>

                {isThinking && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500 ml-1" />
                )}

                <ChevronDown
                    className={`w-4 h-4 text-muted-foreground ml-auto transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''
                        }`}
                />
            </button>

            {/* Content - Collapsible */}
            <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
                    }`}
            >
                <div
                    ref={contentRef}
                    className="px-4 py-3 bg-muted/10 text-sm text-muted-foreground max-h-48 overflow-y-auto scrollbar-thin"
                >
                    <pre className="whitespace-pre-wrap font-sans leading-relaxed">
                        {thinking}
                    </pre>

                    {isThinking && (
                        <span className="inline-block w-1.5 h-4 bg-purple-500/60 animate-pulse ml-0.5 -mb-0.5" />
                    )}
                </div>
            </div>
        </div>
    );
};

export default ThinkingDisplay;
