/**
 * Content Agent API
 * 
 * Streaming chat with the Python backend content strategist agent.
 * Supports multimodal input (text, images, PDFs).
 */

import { ENDPOINTS, getEndpointUrl } from '../config';
import { ContentBlock } from '@/lib/multimodal-utils';

export interface ChatRequest {
    message: string;
    threadId: string;
    workspaceId?: string;
    modelId?: string;
    /** Enable thinking/reasoning for supported models (default: true) */
    enableReasoning?: boolean;
    /** Content blocks for multimodal input (images, PDFs) */
    contentBlocks?: ContentBlock[];
}

export interface StreamEvent {
    type: 'update' | 'done' | 'error' | 'thinking';
    step?: string;
    content?: string;
    response?: string;
    thinking?: string;  // Thinking/reasoning content from model
    message?: string;
}

/**
 * Chat with content strategist (streaming)
 * 
 * Opens SSE connection and streams response.
 * Supports multimodal input via contentBlocks.
 * Supports thinking/reasoning streaming from Gemini 2.5.
 * 
 * @param request - Chat request with message, threadId, and optional contentBlocks
 * @param onUpdate - Callback for each content update
 * @param onComplete - Callback when stream completes (response, thinking)
 * @param onError - Callback for errors
 * @param onThinking - Optional callback for thinking/reasoning updates
 */
export async function chatStrategist(
    request: ChatRequest,
    onUpdate: (content: string) => void,
    onComplete: (response: string, thinking?: string) => void,
    onError: (error: Error) => void,
    onThinking?: (thinking: string) => void
): Promise<void> {
    const url = getEndpointUrl(ENDPOINTS.content.chat);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
            },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';
        let fullThinking = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE messages
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const jsonStr = line.slice(6);
                        console.log('[Stream] Received:', jsonStr);
                        const data: StreamEvent = JSON.parse(jsonStr);

                        // Handle thinking/reasoning stream
                        if (data.type === 'thinking' && data.content) {
                            fullThinking = data.content;
                            console.log('[Stream] Thinking:', data.content.substring(0, 100) + '...');
                            if (onThinking) {
                                onThinking(data.content);
                            }
                        }
                        // Handle regular content stream
                        else if (data.type === 'update' && data.content) {
                            fullResponse = data.content;
                            console.log('[Stream] Update:', data.content.substring(0, 100) + '...');
                            onUpdate(data.content);
                        } else if (data.type === 'done') {
                            console.log('[Stream] Done:', data.response?.substring(0, 100) || fullResponse.substring(0, 100) + '...');
                            onComplete(data.response || fullResponse, data.thinking || fullThinking);
                            return;
                        } else if (data.type === 'error') {
                            console.error('[Stream] Error:', data.message);
                            throw new Error(data.message || 'Stream error');
                        }
                    } catch (parseError) {
                        console.warn('[Stream] Parse error:', parseError, 'Line:', line);
                    }
                }
            }
        }

        onComplete(fullResponse, fullThinking);

    } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
    }
}

/**
 * Create a unique thread ID
 */
export function createThreadId(): string {
    return `thread-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
