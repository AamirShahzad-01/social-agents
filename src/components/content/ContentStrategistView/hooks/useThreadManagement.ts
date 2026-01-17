import { useState, useCallback } from 'react';
import { ThreadService, ChatMessage, ContentThread } from '@/services/database/threadService.client';
import { useContentStrategistStore } from '@/stores/contentStrategistStore';
import { Message } from '../types';

export const useThreadManagement = () => {
    const [activeThreadId, setActiveThreadId] = useState<string | 'new'>('new');
    const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
    const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
    
    // Use Zustand store for langThreadId - initialized in store, persists across component remounts
    const langThreadId = useContentStrategistStore(state => state.langThreadId);
    const setLangThreadId = useContentStrategistStore(state => state.setLangThreadId);

    const startNewChat = useCallback(async () => {
        try {
            setIsCreatingNewChat(true);

            // Generate new LangGraph thread ID
            const newLangThreadId = crypto.randomUUID();

            // Reset to initial state
            setActiveThreadId('new');
            setLangThreadId(newLangThreadId);
            setCurrentThreadId(null);

            return newLangThreadId;
        } finally {
            setIsCreatingNewChat(false);
        }
    }, []);

    const loadThread = useCallback(async (thread: ContentThread): Promise<Message[]> => {
        // Fetch messages from LangGraph checkpoints
        const messages = await ThreadService.getThreadMessages(thread.lang_thread_id);

        // Convert to UI format
        const uiMessages = messages.map((msg: any) => {
            const message: Message = {
                role: (msg.role === 'assistant' ? 'model' : msg.role) as 'user' | 'model' | 'system',
                content: msg.content,
            };

            // Include attachments if present
            if (msg.attachments && msg.attachments.length > 0) {
                message.attachments = msg.attachments;
            }

            return message;
        });

        setActiveThreadId(thread.id);
        setCurrentThreadId(thread.id);
        setLangThreadId(thread.lang_thread_id);

        return uiMessages;
    }, []);

    const createThread = useCallback(async (
        title: string,
        workspaceId: string,
        userId: string,
        langThreadId: string
    ): Promise<ContentThread> => {
        const newThread = await ThreadService.createThread(
            title,
            workspaceId,
            userId,
            langThreadId
        );
        setCurrentThreadId(newThread.id);
        setActiveThreadId(newThread.id);

        return newThread;
    }, []);

    const updateThreadMetadata = useCallback(async (
        threadId: string,
        workspaceId: string,
        messages: Message[]
    ) => {
        if (!threadId) return;

        try {
            const lastMessage = messages[messages.length - 1];
            const contentStr = typeof lastMessage?.content === 'string' 
                ? lastMessage.content 
                : Array.isArray(lastMessage?.content) 
                    ? lastMessage.content.join('') 
                    : '';
            const preview = contentStr.substring(0, 100) || '';

            await ThreadService.updateThreadMetadata(threadId, workspaceId, {
                preview,
                messageCount: messages.length,
                lastMessageAt: new Date().toISOString()
            });
        } catch (e) {
        }
    }, []);

    return {
        activeThreadId,
        currentThreadId,
        langThreadId,
        isCreatingNewChat,
        startNewChat,
        loadThread,
        createThread,
        updateThreadMetadata,
        setActiveThreadId,
        setCurrentThreadId,
        setLangThreadId
    };
};
