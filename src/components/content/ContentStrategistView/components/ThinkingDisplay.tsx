'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Brain, ChevronDown, Loader2 } from 'lucide-react';

interface ThinkingDisplayProps {
    /** The thinking/reasoning content from the model */
    thinking: string;
    /** Whether the model is currently streaming thinking content */
    isThinking?: boolean;
    /** Whether to start expanded */
    defaultExpanded?: boolean;
}

/**
 * ThinkingDisplay - Collapsible component to show model reasoning
 * 
 * Auto-expands when first rendered with thinking content,
 * auto-collapses when isThinking becomes false.
 */
export const ThinkingDisplay: React.FC<ThinkingDisplayProps> = ({
    thinking,
    isThinking = false,
    defaultExpanded = true, // Default to expanded so user sees reasoning
}) => {
    // Start expanded by default when there's thinking content
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [userToggled, setUserToggled] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const wasThinking = useRef(isThinking);

    // Auto-collapse when thinking ends (unless user manually toggled)
    useEffect(() => {
        // If isThinking just changed from true to false
        if (wasThinking.current && !isThinking && !userToggled) {
            const timer = setTimeout(() => {
                setIsExpanded(false);
            }, 500);
            return () => clearTimeout(timer);
        }
        wasThinking.current = isThinking;
    }, [isThinking, userToggled]);

    // Auto-scroll to bottom when thinking content updates
    useEffect(() => {
        if (isExpanded && contentRef.current && isThinking) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [thinking, isExpanded, isThinking]);

    // Handle user toggle
    const handleToggle = () => {
        setIsExpanded(!isExpanded);
        setUserToggled(true);
    };

    if (!thinking) return null;

    return (
        <div className="mb-3 border border-border/50 rounded-xl overflow-hidden bg-gradient-to-r from-purple-500/5 to-blue-500/5 max-w-[75%]">
            {/* Header - Always visible */}
            <button
                onClick={handleToggle}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-sm"
            >
                <Brain className="w-4 h-4 text-purple-500" />
                <span className="text-muted-foreground font-medium">Reasoning</span>

                {isThinking && (
                    <span className="flex items-center gap-1 ml-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500" />
                        <span className="text-xs text-purple-500/70 animate-pulse">thinking...</span>
                    </span>
                )}

                <ChevronDown
                    className={`w-4 h-4 text-muted-foreground ml-auto transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''
                        }`}
                />
            </button>

            {/* Content - Collapsible with smooth animation */}
            <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
                    }`}
            >
                <div
                    ref={contentRef}
                    className="px-4 py-3 bg-muted/10 text-sm text-muted-foreground max-h-64 overflow-y-auto scrollbar-hide"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {/* Simple inline text display */}
                    <span className="font-sans leading-relaxed">
                        {thinking}
                    </span>
                    {/* Blinking cursor when thinking */}
                    {isThinking && (
                        <span className="inline-block w-2 h-4 bg-purple-500 animate-pulse rounded-sm ml-1 align-middle" />
                    )}
                </div>
            </div>
        </div>
    );
};

export default ThinkingDisplay;
