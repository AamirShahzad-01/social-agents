/**
 * MessageBubble Component
 * 
 * Renders chat messages with support for:
 * - Human messages with attachments
 * - AI messages with markdown rendering
 * - Generated images/videos
 * - Loading states
 * - Copy functionality
 * 
 * Based on langchain-ai/agent-chat-ui patterns.
 */

import React, { useState } from 'react';
import { Loader2, Copy, Check, Sparkles, User } from 'lucide-react';
import { Message } from '../types';
import { MarkdownText } from '../utils/MarkdownText';
import { AttachmentsPreview } from './MultimodalPreview';
import { ThinkingDisplay } from './ThinkingDisplay';

interface MessageBubbleProps {
    msg: Message;
    isLoading: boolean;
    onSuggestionClick?: (suggestion: string) => void;
}

// AI Loading indicator with animated dots
const AILoadingIndicator: React.FC = () => (
    <div className="flex items-start gap-3 py-4">
        <div className="flex-shrink-0">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
            </div>
        </div>
        <div className="bg-muted rounded-2xl px-4 py-2.5">
            <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-[pulse_1.5s_ease-in-out_infinite]" />
                <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-[pulse_1.5s_ease-in-out_0.3s_infinite]" />
                <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-[pulse_1.5s_ease-in-out_0.6s_infinite]" />
            </div>
        </div>
    </div>
);

// Human message component
const HumanMessage: React.FC<{ msg: Message }> = ({ msg }) => {
    return (
        <div className="flex items-start gap-3 py-4 justify-end">
            <div className="flex flex-col items-end gap-2 max-w-[80%]">
                {/* Attachments */}
                {msg.attachments && msg.attachments.length > 0 && (
                    <AttachmentsPreview attachments={msg.attachments} size="md" />
                )}

                {/* Text content */}
                {msg.content && (
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-md px-4 py-2.5">
                        <p className="text-[15px] whitespace-pre-wrap">{msg.content}</p>
                    </div>
                )}
            </div>

            {/* User avatar */}
            <div className="flex-shrink-0">
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-4 h-4 text-muted-foreground" />
                </div>
            </div>
        </div>
    );
};

// AI message component
const AIMessage: React.FC<{
    msg: Message;
    onSuggestionClick?: (suggestion: string) => void;
}> = ({ msg, onSuggestionClick }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!msg.content) return;
        await navigator.clipboard.writeText(msg.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex items-start gap-3 py-4 group">
            {/* AI avatar */}
            <div className="flex-shrink-0">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                </div>
            </div>

            <div className="flex-1 min-w-0 space-y-2">
                {/* AI-Generated Image */}
                {msg.generatedImage && (
                    <div className="my-2">
                        <div className="relative inline-block max-w-lg group/img">
                            <img
                                src={msg.generatedImage}
                                alt="AI Generated"
                                className="rounded-xl border border-border shadow-lg max-w-full h-auto"
                            />
                            <div className="absolute top-2 right-2 px-2 py-1 bg-black/70 text-white text-xs rounded-lg backdrop-blur-sm">
                                AI Generated
                            </div>
                        </div>
                    </div>
                )}

                {/* AI-Generated Video */}
                {msg.generatedVideo && (
                    <div className="my-2">
                        <div className="relative inline-block max-w-lg">
                            <video
                                src={msg.generatedVideo}
                                controls
                                className="rounded-xl border border-border shadow-lg max-w-full"
                                playsInline
                            />
                            <div className="absolute top-2 right-2 px-2 py-1 bg-black/70 text-white text-xs rounded-lg backdrop-blur-sm">
                                AI Generated
                            </div>
                        </div>
                    </div>
                )}

                {/* Media Generation Loading */}
                {msg.isGeneratingMedia && (
                    <div className="p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl border border-primary/20">
                        <div className="flex items-center gap-3">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            <div>
                                <p className="text-sm font-medium text-foreground">Generating media...</p>
                                <p className="text-xs text-muted-foreground">This may take a few moments</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Thinking/Reasoning Display (Gemini 2.5) */}
                {msg.thinking && (
                    <ThinkingDisplay
                        thinking={msg.thinking}
                        isThinking={msg.isThinking}
                    />
                )}

                {/* Message content with markdown - render during both streaming and complete */}
                {msg.content && (
                    <div className="text-[15px] leading-[1.7]">
                        <MarkdownText>{msg.content}</MarkdownText>
                        {/* Typing cursor for streaming */}
                        {msg.isStreaming && (
                            <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5 align-middle" />
                        )}
                    </div>
                )}

                {/* Copy button - appears on hover */}
                {msg.content && !msg.isStreaming && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                        >
                            {copied ? (
                                <>
                                    <Check className="w-3 h-3 text-green-500" />
                                    <span>Copied!</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* AI Suggestions */}
                {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="mt-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Suggestions
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {msg.suggestions.map((suggestion, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => onSuggestionClick?.(suggestion)}
                                    className="px-3 py-1.5 text-sm bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-full text-primary transition-colors"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// System message (errors, etc.)
const SystemMessage: React.FC<{ msg: Message }> = ({ msg }) => (
    <div className="flex justify-center py-3">
        <div className="px-4 py-2 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">{msg.content}</p>
        </div>
    </div>
);

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({
    msg,
    isLoading,
    onSuggestionClick
}) => {
    // Don't render empty model messages - parent handles loading state
    if (msg.role === 'model' && !msg.content && !msg.generatedImage && !msg.generatedVideo && !msg.isGeneratingMedia) {
        return null;
    }

    // Human message
    if (msg.role === 'user') {
        return <HumanMessage msg={msg} />;
    }

    // AI message
    if (msg.role === 'model') {
        return <AIMessage msg={msg} onSuggestionClick={onSuggestionClick} />;
    }

    // System message
    if (msg.role === 'system') {
        return <SystemMessage msg={msg} />;
    }

    return null;
});

MessageBubble.displayName = 'MessageBubble';
