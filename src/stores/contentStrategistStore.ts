/**
 * Content Strategist Global Store
 * 
 * Persists chat state across page navigation using Zustand.
 */

import { create } from 'zustand';
import {
    Message,
    TodoItem,
    ToolCall,
    SubAgent,
    AttachedFile
} from '@/components/content/ContentStrategistView/types';

// Generate initial thread ID for session persistence
const generateThreadId = () => {
    if (typeof window !== 'undefined') {
        return crypto.randomUUID();
    }
    return null;
};

interface ContentStrategistState {
    messages: Message[];
    hasUserSentMessage: boolean;
    error: string | null;
    activeThreadId: string | null;
    langThreadId: string | null;
    isVoiceActive: boolean;
    todos: TodoItem[];
    files: Record<string, string>;

    setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
    addMessage: (message: Message) => void;
    setHasUserSentMessage: (value: boolean) => void;
    setError: (error: string | null) => void;
    setActiveThreadId: (id: string | null) => void;
    setLangThreadId: (id: string | null) => void;
    setIsVoiceActive: (active: boolean) => void;
    setTodoState: (todos: TodoItem[]) => void;
    setFileState: (files: Record<string, string>) => void;
    clearChat: () => void;
}

export const useContentStrategistStore = create<ContentStrategistState>((set) => ({
    messages: [],
    hasUserSentMessage: false,
    error: null,
    activeThreadId: null,
    langThreadId: generateThreadId(),
    isVoiceActive: false,
    todos: [],
    files: {},

    setMessages: (messages) =>
        set((state) => ({
            messages: typeof messages === 'function' ? messages(state.messages) : messages,
        })),

    addMessage: (message) =>
        set((state) => ({
            messages: [...state.messages, message],
            hasUserSentMessage: message.role === 'user' ? true : state.hasUserSentMessage,
        })),

    setHasUserSentMessage: (value) => set({ hasUserSentMessage: value }),
    setError: (error) => set({ error }),
    setActiveThreadId: (id) => set({ activeThreadId: id }),
    setLangThreadId: (id) => set({ langThreadId: id }),
    setIsVoiceActive: (active) => set({ isVoiceActive: active }),
    setTodoState: (todos) => set({ todos }),
    setFileState: (files) => set({ files }),
    clearChat: () => set({ messages: [], hasUserSentMessage: false, error: null, todos: [], files: {} }),
}));
