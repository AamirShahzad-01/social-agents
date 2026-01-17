/**
 * Content Strategist View Types
 * 
 * Type definitions following LangGraph message format.
 * Reference: https://github.com/langchain-ai/deep-agents-ui
 */
import { Post } from '@/types';

export interface ContentStrategistViewProps {
    onPostCreated: (post: Post) => void;
}

/**
 * Attached file for multimodal messages
 */
export interface AttachedFile {
    type: 'image' | 'file';
    name: string;
    url: string;
    size?: number;
}

/**
 * Tool call from AI message
 * Reference: https://github.com/langchain-ai/deep-agents-ui
 */
export interface ToolCall {
    id: string;
    name: string;
    args: Record<string, unknown>;
    result?: string;
    status?: 'pending' | 'completed' | 'error' | 'interrupted';
}

/**
 * Sub-agent activity indicator
 * Tracks when the agent delegates to a sub-agent (task tool calls)
 */
export interface SubAgent {
    id: string;
    name: string;
    subAgentName: string;
    input: Record<string, unknown>;
    output?: Record<string, unknown>;
    status: 'pending' | 'active' | 'completed' | 'error';
}

/**
 * Content block for multimodal input
 */
export interface ContentBlock {
    type: 'text' | 'image' | 'file';
    mimeType?: string;
    data?: string;
    text?: string;
}

/**
 * Chat message following LangGraph format
 */
export interface Message {
    id?: string;
    type?: 'human' | 'ai' | 'tool';
    role: 'user' | 'assistant' | 'model' | 'system' | 'tool';
    content: string | any[];
    attachments?: AttachedFile[];
    isStreaming?: boolean;
    suggestions?: string[];
    thinking?: string;
    isThinking?: boolean;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    sub_agents?: SubAgent[];
    files?: Array<{ path: string; name: string; type: string }>;
    generatedImage?: string;
    generatedVideo?: string;
    isGeneratingMedia?: boolean;
    postData?: unknown;
    parameters?: unknown;
    isVoiceGenerated?: boolean;
    activity?: string;
}

/**
 * Carousel slide for multi-image prompts
 */
export interface CarouselSlide {
    number: number;
    prompt: string;
}

/**
 * Thread info for chat history
 */
export interface ThreadInfo {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
}

/**
 * Streaming event types from deep-agents backend
 */
export interface StreamEvent {
    step: 'thinking' | 'streaming' | 'tool_call' | 'tool_result' | 'sub_agent' | 'done' | 'error' | 'interrupt' | 'sync';
    content?: string;
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
    result?: string;
    status?: string;
    interrupt_data?: ToolApprovalInterruptData;
    todos?: TodoItem[];
    files?: Record<string, string>;
}

/**
 * Interrupt data from LangGraph human-in-the-loop
 */
export interface InterruptData {
    value: unknown;
    ns?: string[];
    scope?: string;
}

/**
 * Action request for tool approval
 */
export interface ActionRequest {
    id: string;
    name: string;
    args: Record<string, unknown>;
    description?: string;
}

/**
 * Review configuration for tool approval
 */
export interface ReviewConfig {
    actionName: string;
    allowedDecisions?: string[];
}

/**
 * Tool approval interrupt data
 */
export interface ToolApprovalInterruptData {
    action_requests: ActionRequest[];
    review_configs?: ReviewConfig[];
}

/**
 * File item from agent file operations
 */
export interface FileItem {
    path: string;
    content: string;
}

/**
 * Todo item from agent task management
 */
export interface TodoItem {
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    updatedAt?: Date;
}

