/**
 * Message Handling for Content Strategist
 * 
 * Handles sending messages with multimodal content (text, images, PDFs).
 */

import { chatStrategist, createThreadId, ChatRequest } from '@/lib/python-backend/api/content';
import { ContentBlock } from '@/lib/multimodal-utils';
import { Message } from '../types';

export interface SendMessageParams {
    message: string;
    threadId: string;
    workspaceId?: string;
    contentBlocks?: ContentBlock[];
    modelId?: string;
    enableReasoning?: boolean;
}

export interface MessageResult {
    response: string;
    threadId: string;
}

/**
 * Send message to content strategist
 * 
 * Internally uses streaming but returns final result.
 * Supports multimodal input via contentBlocks.
 */
export async function sendMessage(params: SendMessageParams): Promise<MessageResult> {
    const { message, threadId, workspaceId, contentBlocks, modelId, enableReasoning } = params;

    const request: ChatRequest = {
        message,
        threadId: threadId || createThreadId(),
        workspaceId,
        modelId,
        enableReasoning,
        contentBlocks,
    };

    return new Promise((resolve, reject) => {
        let finalResponse = '';

        chatStrategist(
            request,
            (content) => {
                finalResponse = content;
            },
            (response) => {
                resolve({
                    response: response || finalResponse,
                    threadId: request.threadId,
                });
            },
            (error) => {
                reject(error);
            }
        );
    });
}

/**
 * Send message with streaming callbacks
 * 
 * Supports thinking/reasoning streaming from Gemini 2.5.
 * 
 * @param params - Message parameters
 * @param onUpdate - Callback for content updates
 * @param onComplete - Callback when complete (response, thinking)
 * @param onError - Callback for errors
 * @param onThinking - Optional callback for thinking/reasoning updates
 */
export async function sendMessageStream(
    params: SendMessageParams,
    onUpdate: (content: string) => void,
    onComplete: (response: string, thinking?: string) => void,
    onError: (error: Error) => void,
    onThinking?: (thinking: string) => void
): Promise<void> {
    const { message, threadId, workspaceId, contentBlocks, modelId, enableReasoning } = params;

    const request: ChatRequest = {
        message,
        threadId: threadId || createThreadId(),
        workspaceId,
        modelId,
        enableReasoning,
        contentBlocks,
    };

    return chatStrategist(request, onUpdate, onComplete, onError, onThinking);
}

/**
 * Handle message result - add AI response to messages
 */
export function handleMessageResult(
    result: MessageResult,
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>
): void {
    console.log('[handleMessageResult] Result:', JSON.stringify(result));
    console.log('[handleMessageResult] Response exists:', !!result?.response);
    console.log('[handleMessageResult] Response length:', result?.response?.length);

    if (result?.response) {
        console.log('[handleMessageResult] Adding AI message:', result.response.substring(0, 200));
        setMessages(prev => {
            const newMessages = [...prev, {
                role: 'model' as const,
                content: result.response,
                isStreaming: false,
            }];
            console.log('[handleMessageResult] New messages count:', newMessages.length);
            return newMessages;
        });
    } else {
        console.error('[handleMessageResult] NO RESPONSE! Result was:', result);
    }
}

/**
 * Format error message for user display
 */
export function formatErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        if (error.message.includes('fetch')) {
            return 'Unable to connect to the AI service. Please check your connection.';
        }
        if (error.message.includes('HTTP')) {
            return `Server error: ${error.message}`;
        }
        return error.message;
    }
    return 'An unexpected error occurred. Please try again.';
}
