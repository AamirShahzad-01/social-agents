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
    modelId?: string;
    /** Content blocks for multimodal input (images, PDFs) */
    contentBlocks?: ContentBlock[];
}

export interface StreamEvent {
    type: 'update' | 'done' | 'error';
    step?: string;
    content?: string;
    response?: string;
    message?: string;
}

/**
 * Chat with content strategist (streaming)
 * 
 * Opens SSE connection and streams response.
 * Supports multimodal input via contentBlocks.
 * 
 * @param request - Chat request with message, threadId, and optional contentBlocks
 * @param onUpdate - Callback for each content update
 * @param onComplete - Callback when stream completes
 * @param onError - Callback for errors
 */
export async function chatStrategist(
    request: ChatRequest,
    onUpdate: (content: string) => void,
    onComplete: (response: string) => void,
    onError: (error: Error) => void
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
                        const data: StreamEvent = JSON.parse(line.slice(6));

                        if (data.type === 'update' && data.content) {
                            fullResponse = data.content;
                            onUpdate(data.content);
                        } else if (data.type === 'done') {
                            onComplete(data.response || fullResponse);
                            return;
                        } else if (data.type === 'error') {
                            throw new Error(data.message || 'Stream error');
                        }
                    } catch (parseError) {
                        // Skip invalid JSON
                    }
                }
            }
        }

        onComplete(fullResponse);

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
