/**
 * useChat Hook - Deep Agents Pattern
 * 
 * Provides streaming chat functionality that works with the Zustand store.
 * Reference: https://github.com/langchain-ai/deep-agents-ui
 */

import { useCallback, useRef } from 'react';
import { useContentStrategistStore } from '@/stores/contentStrategistStore';
import { Message, ContentBlock, ToolCall } from '../types';

interface UseChatOptions {
    threadId: string | null;
    workspaceId?: string;
    modelId?: string;
    enableReasoning?: boolean;
    onThreadCreated?: (threadId: string) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'http://localhost:8000';

/**
 * useChat - Streaming chat hook that works with Zustand store
 */
export function useChat(options: UseChatOptions) {
    const { threadId, workspaceId, modelId, enableReasoning = true, onThreadCreated } = options;

    const setMessages = useContentStrategistStore(state => state.setMessages);
    const addMessage = useContentStrategistStore(state => state.addMessage);
    const setError = useContentStrategistStore(state => state.setError);
    const setTodoState = useContentStrategistStore(state => state.setTodoState);
    const setFileState = useContentStrategistStore(state => state.setFileState);

    const abortControllerRef = useRef<AbortController | null>(null);
    const isSubmittingRef = useRef(false);

    const submit = useCallback(async (
        content: string,
        options?: {
            contentBlocks?: ContentBlock[];
            attachedFiles?: Array<{ type: 'image' | 'file'; name: string; url: string; size?: number }>;
        }
    ): Promise<string> => {
        if (!content.trim() || isSubmittingRef.current) {
            return '';
        }

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;
        isSubmittingRef.current = true;

        let currentThreadId = threadId;
        if (!currentThreadId) {
            currentThreadId = crypto.randomUUID();
            console.log('[useChat] Created new thread ID:', currentThreadId);
            onThreadCreated?.(currentThreadId);
        }
        console.log('[useChat] Using thread ID:', currentThreadId);

        const userMessage: Message = {
            role: 'user',
            content,
            attachments: options?.attachedFiles,
        };
        addMessage(userMessage);

        const aiMessage: Message = {
            role: 'model',
            content: '',
            isStreaming: true,
        };
        addMessage(aiMessage);

        let finalResponse = '';
        let finalThinking = '';

        try {
            const response = await fetch(`${API_BASE}/api/v1/content/strategist/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                },
                body: JSON.stringify({
                    message: content,
                    threadId: currentThreadId,
                    workspaceId,
                    contentBlocks: options?.contentBlocks,
                    modelId,
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
                                        isThinking: true,
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
                            // Update message with current activity status
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
                                        activity: undefined, // Clear activity on done
                                    };
                                }
                                return updated;
                            });
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

            return finalResponse;

        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                return finalResponse;
            }

            const errorMessage = error instanceof Error ? error.message : 'An error occurred';
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

            return '';
        } finally {
            isSubmittingRef.current = false;
            abortControllerRef.current = null;
        }
    }, [threadId, workspaceId, modelId, enableReasoning, onThreadCreated, addMessage, setMessages, setError]);

    const abort = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        isSubmittingRef.current = false;
    }, []);

    /**
     * Resume from an interrupt (tool approval)
     * Sends approval/denial to continue the agent
     */
    const resumeInterrupt = useCallback(async (
        decision: 'approve' | 'deny',
        actionId: string,
        reason?: string
    ): Promise<void> => {
        if (!threadId) return;

        try {
            const response = await fetch(`${API_BASE}/api/v1/deep-agents/threads/${threadId}/resume`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    decision,
                    actionId,
                    reason,
                }),
            });

            if (!response.ok) {
                throw new Error(`Resume failed: ${response.status}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to resume';
            setError(errorMessage);
        }
    }, [threadId, setError]);

    /**
     * Stop the current stream
     */
    const stopStream = useCallback(() => {
        abort();
    }, [abort]);

    /**
     * Get current thread state (todos, files)
     */
    const getThreadState = useCallback(async (): Promise<{
        todos: Array<{ id: string; content: string; status: string }>;
        files: Record<string, string>;
    } | null> => {
        if (!threadId) return null;

        try {
            const response = await fetch(`${API_BASE}/api/v1/deep-agents/threads/${threadId}/state`);
            if (!response.ok) return null;
            return await response.json();
        } catch {
            return null;
        }
    }, [threadId]);

    return {
        submit,
        abort,
        stopStream,
        resumeInterrupt,
        getThreadState,
        isSubmitting: isSubmittingRef.current,
        isLoading: isSubmittingRef.current,
    };
}

