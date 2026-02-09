/**
 * useChat Hook - Enhanced Deep Agents Pattern
 * 
 * Provides streaming chat functionality with patterns from:
 * - deep-agents-ui: https://github.com/langchain-ai/deep-agents-ui
 * - LangGraph SDK useStream patterns
 * 
 * Features:
 * - Optimistic updates (show user message immediately)
 * - Session persistence for stream reconnection
 * - Thread history revalidation
 * - Enhanced interrupt handling with command pattern
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { useContentStrategistStore } from '@/stores/contentStrategistStore';
import { PYTHON_BACKEND_URL } from '@/lib/python-backend/config';
import {
    Message,
    ToolCall,
    ToolCallWithResult,
    SubmitOptions,
    UseChatOptions as UseChatOptionsType,
    UseChatReturn,
    TodoItem,
} from '../types';

// Use the properly normalized backend URL from config
// This handles Render's hostname format (adds https:// prefix as needed)
const STREAMING_API_BASE = PYTHON_BACKEND_URL || 'http://localhost:8000';

// Session storage key prefix for run persistence
const RUN_STORAGE_PREFIX = 'langgraph-run:';

/**
 * useChat - Enhanced streaming chat hook with deep-agents-ui patterns
 */
export function useChat(options: UseChatOptionsType): UseChatReturn {
    const {
        threadId,
        workspaceId,
        modelId,
        enableReasoning = true,
        onThreadCreated,
        reconnectOnMount = false,
        onHistoryRevalidate,
    } = options;

    // Store selectors
    const messages = useContentStrategistStore(state => state.messages);
    const setMessages = useContentStrategistStore(state => state.setMessages);
    const addMessage = useContentStrategistStore(state => state.addMessage);
    const error = useContentStrategistStore(state => state.error);
    const setError = useContentStrategistStore(state => state.setError);
    const setTodoState = useContentStrategistStore(state => state.setTodoState);
    const setFileState = useContentStrategistStore(state => state.setFileState);

    // Local state
    const [isThreadLoading, setIsThreadLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toolCalls, setToolCalls] = useState<ToolCallWithResult[]>([]);

    // Refs
    const abortControllerRef = useRef<AbortController | null>(null);
    const runIdRef = useRef<string | null>(null);

    // Session persistence helpers
    const saveRunId = useCallback((runId: string) => {
        if (threadId) {
            try {
                sessionStorage.setItem(`${RUN_STORAGE_PREFIX}${threadId}`, runId);
            } catch (e) {
                console.warn('[useChat] Failed to save run ID to session storage:', e);
            }
        }
    }, [threadId]);

    const clearRunId = useCallback(() => {
        if (threadId) {
            try {
                sessionStorage.removeItem(`${RUN_STORAGE_PREFIX}${threadId}`);
            } catch (e) {
                console.warn('[useChat] Failed to clear run ID from session storage:', e);
            }
        }
    }, [threadId]);

    const getStoredRunId = useCallback((): string | null => {
        if (!threadId) return null;
        try {
            return sessionStorage.getItem(`${RUN_STORAGE_PREFIX}${threadId}`);
        } catch {
            return null;
        }
    }, [threadId]);

    // Reconnect on mount (from deep-agents-ui pattern)
    useEffect(() => {
        if (reconnectOnMount && threadId) {
            const storedRunId = getStoredRunId();
            if (storedRunId) {
                console.log('[useChat] Found stored run ID for potential reconnection:', storedRunId);
                runIdRef.current = storedRunId;
                // Note: Full reconnection would require backend support
                // For now, we just track the run ID
            }
        }
    }, [reconnectOnMount, threadId, getStoredRunId]);

    /**
     * Submit a message with optimistic update support
     * Based on deep-agents-ui pattern
     */
    const submit = useCallback(async (
        content: string,
        submitOptions?: SubmitOptions
    ): Promise<string> => {
        if (!content.trim() || isSubmitting) {
            return '';
        }

        // Abort any existing request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;
        setIsSubmitting(true);

        // Generate or use existing thread ID
        let currentThreadId = threadId;
        if (!currentThreadId) {
            currentThreadId = crypto.randomUUID();
            console.log('[useChat] Created new thread ID:', currentThreadId);
            onThreadCreated?.(currentThreadId);
        }

        // Generate run ID for persistence
        const runId = crypto.randomUUID();
        runIdRef.current = runId;
        saveRunId(runId);

        // Create user message
        const userMessage: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            type: 'human',
            content,
            attachments: submitOptions?.attachedFiles,
        };

        // Apply optimistic update (from deep-agents-ui pattern)
        if (submitOptions?.optimisticValues) {
            setMessages(prev => {
                const result = submitOptions.optimisticValues!({ messages: prev });
                return result.messages;
            });
        } else {
            // Default optimistic: add user message immediately
            addMessage(userMessage);
        }

        // Add streaming AI message placeholder
        const aiMessage: Message = {
            id: crypto.randomUUID(),
            role: 'model',
            type: 'ai',
            content: '',
            isStreaming: true,
        };
        addMessage(aiMessage);

        // Revalidate thread history (from deep-agents-ui pattern)
        onHistoryRevalidate?.();

        let finalResponse = '';
        let finalThinking = '';

        try {
            const response = await fetch(`${STREAMING_API_BASE}/api/v1/content/strategist/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                },
                body: JSON.stringify({
                    message: content,
                    threadId: currentThreadId,
                    workspaceId,
                    modelId,
                    contentBlocks: submitOptions?.contentBlocks,
                    enableReasoning,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;

                    try {
                        const data = JSON.parse(line.slice(6));
                        const step = data.step || data.type;

                        if (step === 'thinking' && data.content) {
                            finalThinking = data.content;
                            setMessages(prev => {
                                const updated = [...prev];
                                const lastIdx = updated.length - 1;
                                if (lastIdx >= 0 && updated[lastIdx].role === 'model') {
                                    updated[lastIdx] = {
                                        ...updated[lastIdx],
                                        thinking: data.content,
                                        isThinking: !data.summary, // Keep thinking state unless it's a summary
                                    };
                                }
                                return updated;
                            });
                        } else if ((step === 'streaming' || step === 'update') && data.content) {
                            finalResponse = data.content;
                            setMessages(prev => {
                                const updated = [...prev];
                                const lastIdx = updated.length - 1;
                                if (lastIdx >= 0 && updated[lastIdx].role === 'model') {
                                    updated[lastIdx] = {
                                        ...updated[lastIdx],
                                        content: data.content,
                                        isThinking: false,
                                    };
                                }
                                return updated;
                            });
                        } else if (step === 'tool_call') {
                            const toolCall: ToolCallWithResult = {
                                id: data.id || `tc-${Date.now()}`,
                                call: { name: data.name, args: data.args },
                                state: 'pending',
                            };
                            setToolCalls(prev => [...prev, toolCall]);

                            setMessages(prev => {
                                const updated = [...prev];
                                const lastIdx = updated.length - 1;
                                if (lastIdx >= 0 && updated[lastIdx].role === 'model') {
                                    const existingCalls = updated[lastIdx].tool_calls || [];
                                    updated[lastIdx] = {
                                        ...updated[lastIdx],
                                        tool_calls: [...existingCalls, {
                                            id: data.id || `tc-${Date.now()}`,
                                            name: data.name,
                                            args: data.args,
                                            status: 'pending' as const,
                                        }],
                                    };
                                }
                                return updated;
                            });
                        } else if (step === 'tool_result') {
                            setToolCalls(prev => prev.map(tc =>
                                tc.id === data.id
                                    ? { ...tc, result: data.result, state: 'completed' as const }
                                    : tc
                            ));

                            setMessages(prev => {
                                const updated = [...prev];
                                const lastIdx = updated.length - 1;
                                if (lastIdx >= 0 && updated[lastIdx].role === 'model') {
                                    const updatedCalls = (updated[lastIdx].tool_calls || []).map((tc: ToolCall) =>
                                        tc.id === data.id ? { ...tc, result: data.result, status: 'completed' as const } : tc
                                    );
                                    updated[lastIdx] = {
                                        ...updated[lastIdx],
                                        tool_calls: updatedCalls,
                                    };
                                }
                                return updated;
                            });
                        } else if (step === 'sub_agent') {
                            setMessages(prev => {
                                const updated = [...prev];
                                const lastIdx = updated.length - 1;
                                if (lastIdx >= 0 && updated[lastIdx].role === 'model') {
                                    const existingSubAgents = updated[lastIdx].sub_agents || [];
                                    const existingIdx = existingSubAgents.findIndex(
                                        (sa: { id: string }) => sa.id === data.id
                                    );

                                    if (existingIdx >= 0) {
                                        existingSubAgents[existingIdx] = {
                                            ...existingSubAgents[existingIdx],
                                            status: data.status === 'completed' ? 'completed' :
                                                data.status === 'error' ? 'error' : 'active',
                                            output: data.output,
                                        };
                                        updated[lastIdx] = {
                                            ...updated[lastIdx],
                                            sub_agents: [...existingSubAgents],
                                        };
                                    } else {
                                        updated[lastIdx] = {
                                            ...updated[lastIdx],
                                            sub_agents: [...existingSubAgents, {
                                                id: data.id || `sa-${Date.now()}`,
                                                name: data.name || 'researcher',
                                                subAgentName: data.name || 'researcher',
                                                input: { description: data.description || '' },
                                                status: 'active' as const,
                                            }],
                                        };
                                    }
                                }
                                return updated;
                            });
                        } else if (step === 'activity') {
                            setMessages(prev => {
                                const updated = [...prev];
                                const lastIdx = updated.length - 1;
                                if (lastIdx >= 0 && updated[lastIdx].role === 'model') {
                                    updated[lastIdx] = {
                                        ...updated[lastIdx],
                                        activity: data.message,
                                    };
                                }
                                return updated;
                            });
                        } else if (step === 'sync') {
                            if (data.todos) setTodoState(data.todos);
                            if (data.files) setFileState(data.files);
                        } else if (step === 'done') {
                            finalResponse = data.content || data.response || finalResponse;
                            finalThinking = data.thinking || finalThinking;
                            setMessages(prev => {
                                const updated = [...prev];
                                const lastIdx = updated.length - 1;
                                if (lastIdx >= 0 && updated[lastIdx].role === 'model') {
                                    updated[lastIdx] = {
                                        ...updated[lastIdx],
                                        content: finalResponse,
                                        thinking: finalThinking,
                                        isStreaming: false,
                                        isThinking: false,
                                        activity: undefined,
                                    };
                                }
                                return updated;
                            });
                            // Clear run ID on completion
                            clearRunId();
                        } else if (data.type === 'error') {
                            throw new Error(data.message || 'Stream error');
                        }
                    } catch (parseError) {
                        console.warn('[useChat] Parse error:', parseError);
                    }
                }
            }

            // Final message update
            setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].role === 'model') {
                    updated[lastIdx] = {
                        ...updated[lastIdx],
                        content: finalResponse || updated[lastIdx].content,
                        thinking: finalThinking || updated[lastIdx].thinking,
                        isStreaming: false,
                        isThinking: false,
                    };
                }
                return updated;
            });

            // Revalidate on completion
            onHistoryRevalidate?.();
            clearRunId();

            return finalResponse;

        } catch (err) {
            if ((err as Error).name === 'AbortError') {
                return finalResponse;
            }

            const errorMessage = err instanceof Error ? err.message : 'An error occurred';
            setError(errorMessage);

            setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].role === 'model') {
                    updated[lastIdx] = {
                        ...updated[lastIdx],
                        content: `Error: ${errorMessage}`,
                        isStreaming: false,
                        isThinking: false,
                    };
                }
                return updated;
            });

            // Revalidate on error
            onHistoryRevalidate?.();
            clearRunId();

            return '';
        } finally {
            setIsSubmitting(false);
            abortControllerRef.current = null;
        }
    }, [threadId, workspaceId, modelId, enableReasoning, isSubmitting, onThreadCreated, onHistoryRevalidate, addMessage, setMessages, setError, setTodoState, setFileState, saveRunId, clearRunId]);

    /**
     * Stop the current stream
     */
    const stop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsSubmitting(false);
        clearRunId();
    }, [clearRunId]);

    /**
     * Continue from an interrupt point (step-by-step mode)
     * Based on deep-agents-ui continueStream pattern
     */
    const continueStream = useCallback((hasTaskToolCall?: boolean) => {
        // This would continue the stream from an interrupt
        // Requires backend to support continuation
        console.log('[useChat] Continue stream requested, hasTaskToolCall:', hasTaskToolCall);
        onHistoryRevalidate?.();
    }, [onHistoryRevalidate]);

    /**
     * Mark current thread as resolved
     * Based on deep-agents-ui pattern: command: { goto: "__end__" }
     */
    const markThreadResolved = useCallback(() => {
        console.log('[useChat] Thread marked as resolved');
        onHistoryRevalidate?.();
        clearRunId();
    }, [onHistoryRevalidate, clearRunId]);

    /**
     * Resume from an interrupt (tool approval)
     * Enhanced with command pattern from deep-agents-ui
     */
    const resumeInterrupt = useCallback(async (value: unknown): Promise<void> => {
        if (!threadId) return;

        try {
            const response = await fetch(`${STREAMING_API_BASE}/api/v1/deep-agents/threads/${threadId}/resume`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    command: { resume: value },
                }),
            });

            if (!response.ok) {
                throw new Error(`Resume failed: ${response.status}`);
            }

            // Revalidate thread history after resume
            onHistoryRevalidate?.();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to resume';
            setError(errorMessage);
        }
    }, [threadId, setError, onHistoryRevalidate]);

    /**
     * Get tool calls for a specific message
     * Based on useStream getToolCalls pattern
     */
    const getToolCalls = useCallback((message: Message): ToolCallWithResult[] => {
        if (!message.tool_calls) return [];
        return message.tool_calls.map(tc => ({
            id: tc.id,
            call: { name: tc.name, args: tc.args },
            result: tc.result,
            state: (tc.status === 'completed' ? 'completed' :
                tc.status === 'error' ? 'error' : 'pending') as 'pending' | 'completed' | 'error',
        }));
    }, []);

    /**
     * Get reasoning/thinking content from a message
     * Supports both OpenAI o1 and Claude extended thinking
     */
    const getReasoningFromMessage = useCallback((message: Message): string | undefined => {
        return message.thinking;
    }, []);

    /**
     * Get current thread state (todos, files)
     */
    const getThreadState = useCallback(async (): Promise<{
        todos: TodoItem[];
        files: Record<string, string>;
    } | null> => {
        if (!threadId) return null;

        try {
            const response = await fetch(`${STREAMING_API_BASE}/api/v1/deep-agents/threads/${threadId}/state`);
            if (!response.ok) return null;
            return await response.json();
        } catch {
            return null;
        }
    }, [threadId]);

    return {
        messages,
        isLoading: isSubmitting,
        isThreadLoading,
        error,
        toolCalls,
        submit,
        stop,
        continueStream,
        markThreadResolved,
        resumeInterrupt,
        getToolCalls,
        getReasoningFromMessage,
        getThreadState,
    };
}
