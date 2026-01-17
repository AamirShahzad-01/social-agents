"use client";

import React, {
    useState,
    useRef,
    useCallback,
    useMemo,
    FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
    Square,
    ArrowUp,
    CheckCircle2,
    Circle,
    Clock,
    FileText,
} from "lucide-react";
import { ChatMessage } from "./ChatMessage";
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
import { cn } from "@/lib/utils";
import { useStickToBottom } from "use-stick-to-bottom";

interface ChatInterfaceProps {
    messages: Message[];
    onSendMessage: (content: string, options?: { attachedFiles?: any[] }) => void;
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
    const { scrollRef, contentRef } = useStickToBottom();
    const todos = useContentStrategistStore(state => state.todos);
    const files = useContentStrategistStore(state => state.files);

    const submitDisabled = isLoading;

    const handleSubmit = useCallback(
        (e?: FormEvent) => {
            if (e) e.preventDefault();
            const messageText = input.trim();
            if (!messageText || isLoading || submitDisabled) return;
            onSendMessage(messageText);
            setInput("");
        },
        [input, isLoading, onSendMessage, submitDisabled]
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
                className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
                ref={scrollRef}
            >
                <div
                    className="w-full px-4 pb-6 pt-4"
                    ref={contentRef}
                >
                    {processedMessages.length === 0 ? (
                        <div className="flex items-center justify-center p-8 h-[50vh]">
                            <p className="text-muted-foreground text-sm">Start a conversation to see project updates.</p>
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
                <div className="flex-shrink-0 bg-background border-t border-border p-4">
                    <div className="w-full">
                        <form
                            onSubmit={handleSubmit}
                            className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-muted/30 focus-within:ring-1 focus-within:ring-primary/20 transition-all"
                        >
                            {(hasTasks || hasFiles) && (
                                <div className="border-b border-border bg-background">
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
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={isLoading ? "Agent is working..." : inputPlaceholder}
                                className="resize-none border-0 bg-transparent px-4 py-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground min-h-[50px] max-h-[200px]"
                                rows={1}
                            />
                            <div className="flex justify-end p-2 gap-2">
                                {isLoading ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        onClick={onStopStream}
                                        className="h-8 gap-2"
                                    >
                                        <Square size={14} />
                                        <span>Stop</span>
                                    </Button>
                                ) : (
                                    <Button
                                        type="submit"
                                        size="sm"
                                        disabled={submitDisabled || !input.trim()}
                                        className="h-8 gap-2"
                                    >
                                        <ArrowUp size={16} />
                                        <span>Send</span>
                                    </Button>
                                )}
                            </div>
                        </form>
                        <p className="mt-2 text-[10px] text-center text-muted-foreground">
                            Strategist will update the project files and tasks as it works.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
});

ChatInterface.displayName = "ChatInterface";
