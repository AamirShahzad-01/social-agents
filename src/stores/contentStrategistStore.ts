/**
 * Content Strategist Global Store
 * 
 * Persists chat state across page navigation using Zustand.
 * This allows the Content Strategist UI to maintain its state
 * when the user navigates to other pages and returns.
 */

import { create } from 'zustand';

// Re-use types from ContentStrategistView
interface AttachedFile {
    type: 'image' | 'file';
    name: string;
    url: string;
    size?: number;
}

interface Message {
    role: 'user' | 'model' | 'system';
    content: string;
    attachments?: AttachedFile[];
    isStreaming?: boolean;
    suggestions?: string[];
    // Thinking/reasoning (Gemini 2.5)
    thinking?: string;
    isThinking?: boolean;
    // Media generation
    generatedImage?: string;
    generatedVideo?: string;
    isGeneratingMedia?: boolean;
    // Post creation (legacy)
    postData?: any;
    parameters?: any;
    // Voice generated content
    isVoiceGenerated?: boolean;
}

interface ContentStrategistState {
    // Chat state
    messages: Message[];
    hasUserSentMessage: boolean;
    error: string | null;

    // Thread state
    activeThreadId: string | null;
    langThreadId: string | null;

    // Voice agent state
    isVoiceActive: boolean;

    // Actions
    setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
    addMessage: (message: Message) => void;
    setHasUserSentMessage: (value: boolean) => void;
    setError: (error: string | null) => void;
    setActiveThreadId: (id: string | null) => void;
    setLangThreadId: (id: string | null) => void;
    setIsVoiceActive: (active: boolean) => void;

    // Reset for new conversation
    resetConversation: () => void;
}

export const useContentStrategistStore = create<ContentStrategistState>((set) => ({
    // Initial state
    messages: [],
    hasUserSentMessage: false,
    error: null,
    activeThreadId: null,
    langThreadId: null,
    isVoiceActive: false,

    // Actions
    setMessages: (messagesOrUpdater) => set((state) => ({
        messages: typeof messagesOrUpdater === 'function'
            ? messagesOrUpdater(state.messages)
            : messagesOrUpdater
    })),

    addMessage: (message) => set((state) => ({
        messages: [...state.messages, message]
    })),

    setHasUserSentMessage: (value) => set({ hasUserSentMessage: value }),

    setError: (error) => set({ error }),

    setActiveThreadId: (id) => set({ activeThreadId: id }),

    setLangThreadId: (id) => set({ langThreadId: id }),

    setIsVoiceActive: (active) => set({ isVoiceActive: active }),

    resetConversation: () => set({
        messages: [],
        hasUserSentMessage: false,
        error: null,
        activeThreadId: null,
        langThreadId: null,
    }),
}));
