/**
 * ContentStrategistView - Main view component
 * Reference: https://github.com/langchain-ai/deep-agents-ui
 */
'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useContentStrategistStore } from '@/stores/contentStrategistStore';
import { useChat } from './hooks/useChat';
import { useThreadManagement } from './hooks/useThreadManagement';
import { useChatHistory } from './hooks/useChatHistory';
import { ContentStrategistViewProps, Message, FileItem } from './types';
import { ContentThread } from '@/services/database/threadService.client';
import type { ContentBlock } from '@/lib/multimodal-utils';

// Components
import { ChatInterface } from './components/ChatInterface';
import { ThreadHistory } from './components/ThreadHistory';
import { TasksFilesSidebar } from './components/TasksFilesSidebar';
import { FileViewDialog } from './components/FileViewDialog';
import { ConfigDialog } from './components/ConfigDialog';


export default function ContentStrategistView({ onPostCreated }: ContentStrategistViewProps) {
    // Store state
    const messages = useContentStrategistStore(state => state.messages);
    const setMessages = useContentStrategistStore(state => state.setMessages);
    const error = useContentStrategistStore(state => state.error);
    const setError = useContentStrategistStore(state => state.setError);
    const clearChat = useContentStrategistStore(state => state.clearChat);
    const storeTodos = useContentStrategistStore(state => state.todos);
    const storeFiles = useContentStrategistStore(state => state.files);

    // Local state
    const [isLoading, setIsLoading] = useState(false);
    const [workspaceId, setWorkspaceId] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [isHistoryVisible, setIsHistoryVisible] = useState(false);
    const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
    const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);
    const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);

    // Get workspace ID and user ID from localStorage
    useEffect(() => {
        const storedWorkspaceId = localStorage.getItem('workspaceId');
        const storedUserId = localStorage.getItem('userId');
        if (storedWorkspaceId) setWorkspaceId(storedWorkspaceId);
        if (storedUserId) setUserId(storedUserId);
    }, []);

    // Thread management
    const {
        activeThreadId,
        langThreadId,
        isCreatingNewChat,
        startNewChat,
        loadThread,
        createThread,
        setActiveThreadId,
        setLangThreadId,
    } = useThreadManagement();

    // Chat history - uses correct signature
    const { chatHistory, isLoadingHistory, deleteThread, renameThread, refreshHistory } = useChatHistory(isHistoryVisible, workspaceId);

    // Chat hook
    const { submit, abort, resumeInterrupt } = useChat({
        threadId: langThreadId,
        workspaceId: workspaceId || undefined,
        enableReasoning: true,
        onThreadCreated: (newThreadId) => {
            setLangThreadId(newThreadId);
        },
    });

    // Handle new chat creation
    const handleNewChat = useCallback(async () => {
        await startNewChat();
        clearChat();
    }, [startNewChat, clearChat]);

    // Handle thread selection
    const handleSelectThread = useCallback(async (thread: ContentThread) => {
        try {
            const loadedMessages = await loadThread(thread);
            setMessages(loadedMessages as Message[]);
        } catch (error) {
            console.error('Failed to load thread:', error);
            setError('Failed to load conversation');
        }
    }, [loadThread, setMessages, setError]);

    // Handle delete thread
    const handleDeleteThread = useCallback(async (threadId: string) => {
        try {
            await deleteThread(threadId);
            // If we deleted the active thread, clear chat
            if (activeThreadId === threadId) {
                clearChat();
            }
        } catch (error) {
            console.error('Failed to delete thread:', error);
            setError('Failed to delete conversation');
        }
    }, [deleteThread, activeThreadId, clearChat, setError]);

    // Handle rename thread
    const handleRenameThread = useCallback((threadId: string, newTitle: string) => {
        renameThread(threadId, newTitle);
    }, [renameThread]);

    // Handle send message
    const handleSendMessage = useCallback(async (
        message: string,
        options?: {
            attachedFiles?: Array<{ type: 'image' | 'file'; name: string; url: string; size?: number }>;
            contentBlocks?: ContentBlock[];
        }
    ) => {
        if (!message.trim() || isLoading) return;

        setIsLoading(true);
        setError(null);

        try {
            await submit(message, {
                attachedFiles: options?.attachedFiles,
                contentBlocks: options?.contentBlocks,
            });

            // If this was the first message, create a thread entry in the database
            if (activeThreadId === 'new' && workspaceId && userId && langThreadId) {
                const title = message.substring(0, 50) + (message.length > 50 ? '...' : '');
                await createThread(title, workspaceId, userId, langThreadId);
                refreshHistory();
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            setError(error instanceof Error ? error.message : 'Failed to send message');
        } finally {
            setIsLoading(false);
        }
    }, [submit, isLoading, activeThreadId, workspaceId, userId, createThread, langThreadId, refreshHistory, setError]);

    // Extract files from messages for sidebar - convert to Record format
    const filesRecord = messages.flatMap(m => m.files || []).reduce((acc, file) => {
        acc[file.path] = file.name;
        return acc;
    }, {} as Record<string, string>);

    return (
        <div className="relative h-full bg-canva-gradient">
            <div className="flex h-full rounded-2xl border border-border/60 bg-background/80 shadow-sm backdrop-blur">
                {/* Left Sidebar - Thread History */}
                {isHistoryVisible ? (
                    <div className="w-64 border-r border-border/60 bg-background/70 flex-shrink-0 hidden md:block">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
                            <span className="text-xs font-semibold text-muted-foreground">Chats</span>
                            <button
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
                                onClick={() => setIsHistoryVisible(false)}
                                aria-label="Hide chat history"
                            >
                                <PanelLeftClose className="h-4 w-4" />
                            </button>
                        </div>
                        <ThreadHistory
                            threads={chatHistory}
                            activeThreadId={activeThreadId}
                            onSelectThread={handleSelectThread}
                            onNewChat={handleNewChat}
                            onDeleteThread={handleDeleteThread}
                            onRenameThread={handleRenameThread}
                            isLoading={isLoadingHistory}
                            isCreatingNewChat={isCreatingNewChat}
                            workspaceId={workspaceId}
                        />
                    </div>
                ) : (
                    <div className="hidden md:flex w-12 border-r border-border/60 bg-background/70 flex-shrink-0 items-start justify-center py-2">
                        <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                            onClick={() => setIsHistoryVisible(true)}
                            aria-label="Show chat history"
                        >
                            <PanelLeftOpen className="h-4 w-4" />
                        </button>
                    </div>
                )}

                {/* Main Chat Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    <ChatInterface
                        messages={messages}
                        onSendMessage={handleSendMessage}
                        isLoading={isLoading}
                        error={error}
                        showInput={true}
                        inputPlaceholder="What content would you like to create today?"
                        onStopStream={abort}
                        onResumeInterrupt={(value) => resumeInterrupt(value.action || value.decision, value.actionId, value.reason)}
                    />
                </div>

                {/* Right Sidebar - Tasks & Files */}
                <div className="w-72 border-l border-border/60 bg-background/70 flex-shrink-0 hidden lg:block mr-0 my-0 rounded-lg overflow-hidden shadow-sm">
                    <TasksFilesSidebar
                        todos={storeTodos}
                        files={storeFiles}
                        onFileClick={(path) => {
                            // Find file content from store
                            const content = storeFiles[path];
                            if (content !== undefined) {
                                setSelectedFile({
                                    path,
                                    content: content, // Now we have the content from the store!
                                });
                                setIsFileDialogOpen(true);
                            }
                        }}
                    />
                </div>

                {/* File View Dialog */}
                <FileViewDialog
                    file={selectedFile}
                    isOpen={isFileDialogOpen}
                    onClose={() => {
                        setIsFileDialogOpen(false);
                        setSelectedFile(null);
                    }}
                    onSaveFile={async (fileName, content) => {
                        // Update file in store
                        const setFileState = useContentStrategistStore.getState().setFileState;
                        setFileState({ ...storeFiles, [fileName]: content });
                        // Update selected file to reflect changes
                        setSelectedFile({ path: fileName, content });
                    }}
                />

                {/* Config Dialog */}
                <ConfigDialog
                    isOpen={isConfigDialogOpen}
                    onClose={() => setIsConfigDialogOpen(false)}
                    threadId={langThreadId}
                    workspaceId={workspaceId}
                    onReset={handleNewChat}
                />
            </div>
        </div>
    );
}

