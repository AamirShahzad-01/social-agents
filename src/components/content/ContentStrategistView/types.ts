import { Post } from '@/types';

export interface ContentStrategistViewProps {
    onPostCreated: (post: Post) => void;
}

export interface AttachedFile {
    type: 'image' | 'file';
    name: string;
    url: string;
    size?: number;
}

export interface Message {
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

export interface CarouselSlide {
    number: number;
    prompt: string;
}
