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
    contentBlocks?: ContentBlock[];
    modelId?: string;
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
    const { message, threadId, contentBlocks, modelId } = params;

    const request: ChatRequest = {
        message,
        threadId: threadId || createThreadId(),
        modelId,
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
 */
export async function sendMessageStream(
    params: SendMessageParams,
    onUpdate: (content: string) => void,
    onComplete: (response: string) => void,
    onError: (error: Error) => void
): Promise<void> {
    const { message, threadId, contentBlocks, modelId } = params;

    const request: ChatRequest = {
        message,
        threadId: threadId || createThreadId(),
        modelId,
        contentBlocks,
    };

    return chatStrategist(request, onUpdate, onComplete, onError);
}

/**
 * Handle message result - add AI response to messages
 */
export function handleMessageResult(
    result: MessageResult,
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>
): void {
    if (result?.response) {
        setMessages(prev => [...prev, {
            role: 'model',
            content: result.response,
        }]);
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
