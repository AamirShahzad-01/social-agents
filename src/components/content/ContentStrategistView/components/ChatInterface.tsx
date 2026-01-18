"use client";

import React, {
    useState,
    useRef,
    useCallback,
    useMemo,
    useEffect,
    FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
    Square,
    CheckCircle2,
    Circle,
    Clock,
    FileText,
    PlusCircle,
    X,
    Image,
    File,
} from "lucide-react";
import { FiSend } from "react-icons/fi";
import { ChatMessage } from "./ChatMessage";
import {
    ContentPromptSuggestion,
    contentPromptSuggestions,
    getRandomPromptSuggestions,
} from "../data/contentPrompts";
import type {
    ToolCall,
    ActionRequest,
    ReviewConfig,
    Message,
} from "../types";
import {
    extractStringFromMessageContent,
} from "../utils";
import { useContentStrategistStore } from "@/stores/contentStrategistStore";
import { useChat } from "../hooks/useChat";
import { useFileUpload } from "../hooks/useFileUpload";
import { cn } from "@/lib/utils";
import { useStickToBottom } from "use-stick-to-bottom";
import type { ContentBlock } from "@/lib/multimodal-utils";

// Supported file types
const SUPPORTED_IMAGE_TYPES = '.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.ico,.tiff,.heic,.heif';
const SUPPORTED_DOC_TYPES = '.pdf,.doc,.docx,.ppt,.pptx,.txt,.csv,.json';

interface ChatInterfaceProps {
    messages: Message[];
    onSendMessage: (content: string, options?: {
        attachedFiles?: any[];
        contentBlocks?: ContentBlock[];
    }) => void;
    isLoading: boolean;
    error: string | null;
    showInput?: boolean;
    inputPlaceholder?: string;
    onStopStream?: () => void;
    onResumeInterrupt?: (value: any) => void;
}

export const ChatInterface = React.memo((props: ChatInterfaceProps) => {
    const {
        messages,
        onSendMessage,
        isLoading,
        error,
        showInput = true,
        inputPlaceholder = "Ask the strategist anything...",
        onStopStream,
        onResumeInterrupt,
    } = props;

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [input, setInput] = useState("");
    const [metaOpen, setMetaOpen] = useState<"tasks" | "files" | null>(null);
    const [promptSuggestions, setPromptSuggestions] = useState<ContentPromptSuggestion[]>(() =>
        contentPromptSuggestions.slice(0, 6)
    );
    const { scrollRef, contentRef } = useStickToBottom();
    const todos = useContentStrategistStore(state => state.todos);
    const files = useContentStrategistStore(state => state.files);

    // File upload hook
    const {
        contentBlocks,
        attachedFiles,
        showUploadMenu,
        handleFileUpload,
        removeAttachment,
        clearBlocks,
        setShowUploadMenu,
    } = useFileUpload();
    const [localShowMenu, setLocalShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const submitDisabled = isLoading;

    const resizeTextarea = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = "0px";
        const nextHeight = Math.min(Math.max(textarea.scrollHeight, 44), 240);
        textarea.style.height = `${nextHeight}px`;
    }, []);

    useEffect(() => {
        resizeTextarea();
    }, [input, resizeTextarea]);

    useEffect(() => {
        setPromptSuggestions(getRandomPromptSuggestions(6));
    }, []);

    const handleSubmit = useCallback(
        (e?: FormEvent) => {
            if (e) e.preventDefault();
            const messageText = input.trim();
            if (!messageText || isLoading || submitDisabled) return;
            onSendMessage(messageText, {
                attachedFiles: attachedFiles.length > 0 ? attachedFiles : undefined,
                contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
            });
            setInput("");
            clearBlocks();
        },
        [input, isLoading, onSendMessage, submitDisabled, attachedFiles, contentBlocks, clearBlocks]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (submitDisabled) return;
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
            }
        },
        [handleSubmit, submitDisabled]
    );

    const processedMessages = useMemo(() => {
        const messageMap = new Map<
            string,
            { message: Message; toolCalls: ToolCall[] }
        >();

        messages.forEach((message: Message, index: number) => {
            const msgId = message.id || `msg-${index}`;

            if (message.role === 'assistant' || message.role === 'model') {
                messageMap.set(msgId, {
                    message,
                    toolCalls: message.tool_calls || [],
                });
            } else if (message.role === 'user') {
                messageMap.set(msgId, {
                    message,
                    toolCalls: [],
                });
            }
        });

        return Array.from(messageMap.values());
    }, [messages]);

    const groupedTodos = useMemo(() => ({
        pending: todos.filter((t) => t.status === "pending"),
        in_progress: todos.filter((t) => t.status === "in_progress"),
        completed: todos.filter((t) => t.status === "completed"),
    }), [todos]);

    const groupedLabels: Record<keyof typeof groupedTodos, string> = {
        pending: "Pending",
        in_progress: "In Progress",
        completed: "Completed",
    };

    const hasTasks = todos.length > 0;
    const hasFiles = Object.keys(files).length > 0;

    return (
        <div className="flex flex-1 flex-col overflow-hidden bg-background">
            <div
                className="scrollbar-hide flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
                ref={scrollRef}
            >
                <div
                    className="w-full px-6 pb-6 pt-4 md:px-8"
                    ref={contentRef}
                >
                    {processedMessages.length === 0 ? (
                        <div className="flex h-[52vh] flex-col items-center justify-center px-6 text-center">
                            <div className="w-full max-w-3xl rounded-[28px] p-6 sm:p-8">
                                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-sm">
                                    ✨
                                </div>
                                <div className="mt-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">
                                        Content strategist
                                    </p>
                                    <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">
                                        What will you design today?
                                    </h2>
                                </div>
                                <div className="mt-6 flex flex-col items-center gap-3">
                                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                                        Quick starts
                                        <span className="h-px w-12 bg-border" />
                                    </div>
                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                        {promptSuggestions.map((suggestion) => (
                                            <button
                                                key={suggestion.label}
                                                type="button"
                                                onClick={() => {
                                                    setInput(suggestion.prompt);
                                                    textareaRef.current?.focus();
                                                }}
                                                className="inline-flex items-center justify-center rounded-2xl border border-primary/40 px-4 py-2 text-xs font-medium text-foreground transition hover:-translate-y-0.5 hover:border-primary hover:text-primary"
                                            >
                                                {suggestion.label}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setPromptSuggestions(getRandomPromptSuggestions(6))}
                                        className="rounded-full px-4 py-1.5 text-xs font-semibold text-primary transition hover:text-primary/80"
                                    >
                                        Shuffle ideas
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {processedMessages.map((data, index) => {
                                const isLastMessage = index === processedMessages.length - 1;
                                return (
                                    <ChatMessage
                                        key={data.message.id || index}
                                        message={data.message}
                                        toolCalls={data.toolCalls}
                                        isLoading={isLoading && isLastMessage}
                                        onResumeInterrupt={onResumeInterrupt}
                                    />
                                );
                            })}
                        </div>
                    )}
                    {error && (
                        <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
                            {error}
                        </div>
                    )}
                </div>
            </div>

            {showInput && (
                <div className="flex-shrink-0 bg-background px-4 pb-12 pt-4">
                    <div className="mx-auto w-full max-w-3xl">
                        <form
                            onSubmit={handleSubmit}
                            className="relative flex w-full flex-col overflow-visible rounded-[18px] border border-border bg-muted/30 focus-within:ring-1 focus-within:ring-primary/20 transition-all"
                        >
                            {(hasTasks || hasFiles) && (
                                <div className="border-b border-border bg-background rounded-t-[18px]">
                                    {!metaOpen && (
                                        <div className="flex items-center gap-2 px-4 py-2 text-xs">
                                            {hasTasks && (
                                                <button
                                                    type="button"
                                                    onClick={() => setMetaOpen("tasks")}
                                                    className="flex items-center gap-2 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted"
                                                >
                                                    <CheckCircle2 size={12} className="text-primary" />
                                                    Tasks
                                                    <span className="rounded-full bg-muted px-1.5 text-[10px]">
                                                        {todos.length}
                                                    </span>
                                                </button>
                                            )}
                                            {hasFiles && (
                                                <button
                                                    type="button"
                                                    onClick={() => setMetaOpen("files")}
                                                    className="flex items-center gap-2 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted"
                                                >
                                                    <FileText size={12} className="text-primary" />
                                                    Files
                                                    <span className="rounded-full bg-muted px-1.5 text-[10px]">
                                                        {Object.keys(files).length}
                                                    </span>
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    {metaOpen && (
                                        <div className="px-4 py-2">
                                            <div className="flex items-center gap-3 text-xs">
                                                {hasTasks && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setMetaOpen(metaOpen === "tasks" ? null : "tasks")}
                                                        className={cn(
                                                            "rounded-md px-2 py-1",
                                                            metaOpen === "tasks" ? "bg-muted text-foreground" : "text-muted-foreground"
                                                        )}
                                                    >
                                                        Tasks
                                                    </button>
                                                )}
                                                {hasFiles && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setMetaOpen(metaOpen === "files" ? null : "files")}
                                                        className={cn(
                                                            "rounded-md px-2 py-1",
                                                            metaOpen === "files" ? "bg-muted text-foreground" : "text-muted-foreground"
                                                        )}
                                                    >
                                                        Files
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setMetaOpen(null)}
                                                    className="ml-auto text-muted-foreground hover:text-foreground"
                                                >
                                                    Close
                                                </button>
                                            </div>
                                            {metaOpen === "tasks" && (
                                                <div className="mt-2 max-h-48 overflow-y-auto text-xs">
                                                    {Object.entries(groupedTodos)
                                                        .filter(([_, group]) => group.length > 0)
                                                        .map(([status, group]) => (
                                                            <div key={status} className="mb-2">
                                                                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                                    {groupedLabels[status as keyof typeof groupedTodos]}
                                                                </h3>
                                                                <div className="grid grid-cols-[auto_1fr] gap-2">
                                                                    {group.map((todo, index) => (
                                                                        <React.Fragment key={`${status}_${todo.id ?? todo.content}_${index}`}>
                                                                            {todo.status === "completed" ? (
                                                                                <CheckCircle2 size={10} className="text-success" />
                                                                            ) : todo.status === "in_progress" ? (
                                                                                <Clock size={10} className="text-warning" />
                                                                            ) : (
                                                                                <Circle size={10} className="text-muted-foreground" />
                                                                            )}
                                                                            <span className="break-words text-foreground">
                                                                                {todo.content}
                                                                            </span>
                                                                        </React.Fragment>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                            )}
                                            {metaOpen === "files" && (
                                                <div className="mt-2 max-h-48 overflow-y-auto text-xs">
                                                    {Object.keys(files).length === 0 ? (
                                                        <p className="text-muted-foreground">No files yet</p>
                                                    ) : (
                                                        <div className="space-y-1">
                                                            {Object.keys(files).map((path) => (
                                                                <div key={path} className="flex items-center gap-2 text-foreground">
                                                                    <FileText size={12} className="text-muted-foreground" />
                                                                    <span className="truncate">{path}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            {/* Hidden file inputs */}
                            <input
                                type="file"
                                multiple
                                accept={SUPPORTED_IMAGE_TYPES}
                                onChange={(e) => { handleFileUpload(e); setLocalShowMenu(false); }}
                                id="chat-image-upload"
                                style={{ display: 'none' }}
                            />
                            <input
                                type="file"
                                multiple
                                accept={SUPPORTED_DOC_TYPES}
                                onChange={(e) => { handleFileUpload(e); setLocalShowMenu(false); }}
                                id="chat-document-upload"
                                style={{ display: 'none' }}
                            />

                            {/* Attached Files Preview */}
                            {attachedFiles.length > 0 && (
                                <div className="px-4 pt-3 flex flex-wrap gap-2">
                                    {attachedFiles.map((file, idx) => (
                                        <div key={idx} className="relative group">
                                            {file.type === 'image' ? (
                                                <div className="relative">
                                                    <img src={file.url} alt={file.name} className="h-16 w-16 object-cover rounded-lg border border-border" />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeAttachment(idx)}
                                                        className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg border border-border">
                                                    <FileText className="w-4 h-4 text-muted-foreground" />
                                                    <span className="text-sm text-muted-foreground max-w-[120px] truncate">{file.name}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeAttachment(idx)}
                                                        className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                                                    >
                                                        <X className="w-3 h-3 text-muted-foreground" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="relative flex items-end px-4 py-2">
                                {/* Plus Button with Dropdown Menu */}
                                <div className="relative mr-2" ref={menuRef}>
                                    <button
                                        type="button"
                                        onClick={() => setLocalShowMenu(!localShowMenu)}
                                        disabled={isLoading}
                                        className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                                        title="Attach files"
                                    >
                                        <PlusCircle className="w-5 h-5" />
                                    </button>

                                    {/* Upload Menu Dropdown */}
                                    {localShowMenu && (
                                        <div className="absolute bottom-full left-0 mb-2 bg-card rounded-xl shadow-lg border border-border py-1 min-w-[200px] z-50">
                                            <div className="px-3 py-2 border-b border-border">
                                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Upload Files</p>
                                            </div>

                                            <label
                                                htmlFor="chat-image-upload"
                                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left cursor-pointer"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                                    <Image className="w-4 h-4 text-blue-600" />
                                                </div>
                                                <div>
                                                    <span className="text-sm font-medium text-foreground block">Images</span>
                                                    <span className="text-xs text-muted-foreground">JPG, PNG, GIF, WebP</span>
                                                </div>
                                            </label>

                                            <label
                                                htmlFor="chat-document-upload"
                                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left cursor-pointer"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                                                    <File className="w-4 h-4 text-orange-600" />
                                                </div>
                                                <div>
                                                    <span className="text-sm font-medium text-foreground block">Documents</span>
                                                    <span className="text-xs text-muted-foreground">PDF, DOC, PPT, TXT</span>
                                                </div>
                                            </label>

                                            <div className="px-3 py-2 border-t border-border mt-1">
                                                <p className="text-xs text-muted-foreground">Max 10MB per file</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <textarea
                                    ref={textareaRef}
                                    value={input}
                                    onChange={(e) => {
                                        setInput(e.target.value);
                                        requestAnimationFrame(resizeTextarea);
                                    }}
                                    onKeyDown={handleKeyDown}
                                    placeholder={isLoading ? "Agent is working..." : inputPlaceholder}
                                    className="scrollbar-hide flex-1 resize-none border-0 bg-transparent py-2 pr-12 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground min-h-[44px] max-h-[240px] overflow-y-auto"
                                    rows={1}
                                />
                                {isLoading ? (
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="destructive"
                                        onClick={onStopStream}
                                        className="absolute bottom-2 right-3 h-9 w-9 rounded-full"
                                    >
                                        <Square size={14} />
                                    </Button>
                                ) : (
                                    <Button
                                        type="submit"
                                        size="icon"
                                        disabled={submitDisabled || (!input.trim() && attachedFiles.length === 0)}
                                        className="absolute bottom-2 right-3 h-9 w-9 rounded-[12px] bg-blue-600 text-white shadow-[0_6px_16px_rgba(37,99,235,0.35)] hover:bg-blue-700"
                                    >
                                        <FiSend className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
});

ChatInterface.displayName = "ChatInterface";
