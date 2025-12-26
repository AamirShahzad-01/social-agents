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
    // Media generation
    generatedImage?: string;
    generatedVideo?: string;
    isGeneratingMedia?: boolean;
    // Post creation (legacy)
    postData?: any;
    parameters?: any;
}

export interface CarouselSlide {
    number: number;
    prompt: string;
}
