'use client'

import React, { useState, useRef, useEffect, FormEvent, useCallback, lazy, Suspense } from 'react';
import { Bot, Loader2, History, PanelLeftClose } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { CenteredInputLayout } from '../CenteredInputLayout';

// Types
import { ContentStrategistViewProps, Message } from './types';

// Global store for state persistence
import { useContentStrategistStore } from '@/stores/contentStrategistStore';

// Hooks
import { useChatHistory } from './hooks/useChatHistory';
import { useThreadManagement } from './hooks/useThreadManagement';
import { useFileUpload } from './hooks/useFileUpload';
import { useVoiceInput } from './hooks/useVoiceInput';

// Handlers
import { handleCreatePost } from './handlers/postCreation';
import { sendMessage, sendMessageStream, handleMessageResult, formatErrorMessage } from './handlers/messageHandling';

// Constants
import { DEFAULT_AI_MODEL_ID } from '@/constants/aiModels';

// Loading component (always loaded - lightweight)
import { LoadingSkeleton } from './components/LoadingSkeleton';

// Lazy load heavy components to reduce initial bundle size
const MessageBubble = lazy(() => import('./components/MessageBubble').then(m => ({ default: m.MessageBubble })));
const ChatInput = lazy(() => import('./components/ChatInput').then(m => ({ default: m.ChatInput })));
const ThreadHistory = lazy(() => import('./components/ThreadHistory').then(m => ({ default: m.ThreadHistory })));

// Voice Agent - floating panel for voice-powered content creation
import { VoiceButton, VoiceButtonRef } from '../VoiceAgent';
import { Mic, MicOff } from 'lucide-react';

const ContentStrategistView: React.FC<ContentStrategistViewProps> = ({ onPostCreated }) => {
    const { workspaceId, user, loading: authLoading } = useAuth();

    // Use Zustand store for persisted state (survives page navigation)
    const messages = useContentStrategistStore(state => state.messages);
    const setMessages = useContentStrategistStore(state => state.setMessages);
    const hasUserSentMessage = useContentStrategistStore(state => state.hasUserSentMessage);
    const setHasUserSentMessage = useContentStrategistStore(state => state.setHasUserSentMessage);
    const error = useContentStrategistStore(state => state.error);
    const setError = useContentStrategistStore(state => state.setError);
    const isVoiceActive = useContentStrategistStore(state => state.isVoiceActive);
    const setIsVoiceActive = useContentStrategistStore(state => state.setIsVoiceActive);

    // Local state (doesn't need to persist)
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [isHistoryVisible, setIsHistoryVisible] = useState(false);
    const [selectedModelId, setSelectedModelId] = useState(DEFAULT_AI_MODEL_ID);
    const [enableReasoning, setEnableReasoning] = useState(true);  // Reasoning toggle
    const voiceButtonRef = useRef<VoiceButtonRef>(null);

    // Use refs to prevent unnecessary re-runs of effects when auth context updates
    const workspaceIdRef = useRef(workspaceId);
    const userRef = useRef(user);
    const isInitializedRef = useRef(false);
    const isMountedRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const isVisibleRef = useRef(true);

    // Custom hooks
    const { chatHistory, isLoadingHistory, deleteThread, renameThread, addThread } = useChatHistory(isHistoryVisible, workspaceId);
    const {
        activeThreadId,
        currentThreadId,
        langThreadId,
        isCreatingNewChat,
        startNewChat: startNewChatHook,
        loadThread,
        createThread,
        updateThreadMetadata,
        setActiveThreadId
    } = useThreadManagement();

    const {
        contentBlocks,
        attachedFiles,
        showUploadMenu,
        fileInputRef,
        imageInputRef,
        error: fileError,
        handleFileUpload,
        removeAttachment,
        clearBlocks,
        setShowUploadMenu,
        setError: setFileError
    } = useFileUpload();

    const { isRecording, toggleVoiceInput } = useVoiceInput(setUserInput, setError);

    // Mark component as mounted on first render
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Update refs when values change
    useEffect(() => {
        const workspaceChanged = workspaceIdRef.current !== workspaceId;
        const userChanged = userRef.current !== user;

        if (workspaceChanged) {
            workspaceIdRef.current = workspaceId;
        }

        if (userChanged) {
            userRef.current = user;
        }

        if (workspaceId && user && !isInitializedRef.current) {
            isInitializedRef.current = true;
        }
    }, [workspaceId, user]);

    // Track component visibility
    useEffect(() => {
        const handleVisibilityChange = () => {
            isVisibleRef.current = !document.hidden;
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    // Scroll to bottom when messages change
    useEffect(() => {
        console.log('[Messages] Updated, count:', messages.length, 'Messages:', messages.map(m => ({ role: m.role, content: m.content?.substring?.(0, 50) || m.content })));
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    // Auto-focus input after loading completes
    useEffect(() => {
        if (!isLoading && !isCreatingNewChat && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isLoading, isCreatingNewChat]);

    // Update thread metadata when messages change
    useEffect(() => {
        if (!currentThreadId || !langThreadId || activeThreadId !== currentThreadId || isLoading || isCreatingNewChat) {
            return;
        }

        const currentWorkspaceId = workspaceIdRef.current;
        if (!currentWorkspaceId) return;

        const updateMetadata = async () => {
            if (!isMountedRef.current) return;
            await updateThreadMetadata(currentThreadId, currentWorkspaceId, messages);
        };

        const metadataTimer = setTimeout(updateMetadata, 5000);
        return () => clearTimeout(metadataTimer);
    }, [messages.length, currentThreadId, activeThreadId, isLoading, isCreatingNewChat, langThreadId, updateThreadMetadata]);

    // Close upload menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (showUploadMenu && !target.closest('.upload-menu-container')) {
                setShowUploadMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showUploadMenu, setShowUploadMenu]);

    const startNewChat = useCallback(async () => {
        await startNewChatHook();
        setMessages([]);
        setError(null);
        setHasUserSentMessage(false);
    }, [startNewChatHook]);

    const handleSelectThread = useCallback(async (thread: any) => {
        setIsLoading(true);
        setError(null);

        try {
            const uiMessages = await loadThread(thread);
            setMessages(uiMessages);
            setHasUserSentMessage(uiMessages.length > 1);
        } catch (error) {
            setError('Failed to load conversation history');
        } finally {
            setIsLoading(false);
        }
    }, [loadThread]);

    const handleDeleteThread = useCallback(async (threadId: string) => {
        try {
            await deleteThread(threadId);

            if (activeThreadId === threadId) {
                await startNewChat();
            }
        } catch (e) {
            setError("Failed to delete thread");
        }
    }, [activeThreadId, startNewChat, deleteThread]);

    const handlePostCreation = useCallback((postData: any) => {
        handleCreatePost(postData, onPostCreated, setError);
        startNewChat();
    }, [onPostCreated, startNewChat]);

    const handleSubmit = useCallback(async (e: FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading || isCreatingNewChat) return;

        const currentMessage = userInput;
        const userMessage: Message = {
            role: 'user',
            content: userInput,
            attachments: attachedFiles.length > 0 ? attachedFiles : undefined
        };
        setMessages(prev => [...prev, userMessage]);
        setUserInput('');
        clearBlocks();
        setIsLoading(true);
        setError(null);

        if (!hasUserSentMessage) {
            setHasUserSentMessage(true);
        }

        // Add a placeholder AI message for streaming
        const aiMessageIndex = messages.length; // Position after user message
        setMessages(prev => [...prev, {
            role: 'model',
            content: '',
            isStreaming: true,
            thinking: '',
            isThinking: false,
        }]);

        try {
            await sendMessageStream(
                {
                    message: currentMessage,
                    threadId: langThreadId ?? '',
                    workspaceId: workspaceId ?? undefined,
                    contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
                    modelId: selectedModelId,
                    enableReasoning,
                },
                // onUpdate - called for each content chunk
                (content: string) => {
                    setMessages(prev => prev.map((msg, idx) =>
                        idx === aiMessageIndex + 1
                            ? { ...msg, content, isStreaming: true, isThinking: false }
                            : msg
                    ));
                },
                // onComplete - called when done (response, thinking)
                (response: string, thinking?: string) => {
                    setMessages(prev => prev.map((msg, idx) =>
                        idx === aiMessageIndex + 1
                            ? {
                                ...msg,
                                content: response,
                                isStreaming: false,
                                thinking: thinking || msg.thinking,
                                isThinking: false
                            }
                            : msg
                    ));

                    // Create thread on first successful response
                    const currentWorkspaceId = workspaceIdRef.current;
                    const currentUser = userRef.current;
                    if (!currentThreadId && currentWorkspaceId && currentUser && langThreadId) {
                        const title = currentMessage.substring(0, 50) + (currentMessage.length > 50 ? '...' : '');
                        createThread(title, currentWorkspaceId, currentUser.id, langThreadId)
                            .then(newThread => addThread(newThread))
                            .catch(() => { });
                    }
                },
                // onError
                (error: Error) => {
                    setMessages(prev => prev.map((msg, idx) =>
                        idx === aiMessageIndex + 1
                            ? { role: 'system', content: formatErrorMessage(error), isStreaming: false }
                            : msg
                    ));
                    setError(formatErrorMessage(error));
                },
                // onThinking - called for each thinking chunk
                (thinking: string) => {
                    setMessages(prev => prev.map((msg, idx) =>
                        idx === aiMessageIndex + 1
                            ? { ...msg, thinking, isThinking: true }
                            : msg
                    ));
                }
            );
        } catch (err: any) {
            const userFriendlyMessage = formatErrorMessage(err);
            setError(userFriendlyMessage);
            // Remove the streaming placeholder and add error
            setMessages(prev => {
                const filtered = prev.filter((_, idx) => idx !== aiMessageIndex + 1);
                return [...filtered, { role: 'system', content: userFriendlyMessage }];
            });
        } finally {
            setIsLoading(false);
        }
    }, [messages.length, userInput, isLoading, isCreatingNewChat, contentBlocks, attachedFiles, hasUserSentMessage, langThreadId, currentThreadId, createThread, addThread, clearBlocks, selectedModelId]);

    // Send a message directly (used by suggestion clicks)
    const sendMessageDirect = useCallback(async (messageText: string) => {
        if (isLoading || isCreatingNewChat) return;

        const userMessage: Message = {
            role: 'user',
            content: messageText,
        };
        setMessages(prev => [...prev, userMessage]);
        setUserInput('');
        setIsLoading(true);
        setError(null);

        if (!hasUserSentMessage) {
            setHasUserSentMessage(true);
        }

        try {
            const result = await sendMessage({
                message: messageText,
                threadId: langThreadId ?? '',
                workspaceId: workspaceId ?? undefined,
            });

            handleMessageResult(result, setMessages);
        } catch (err: any) {
            const userFriendlyMessage = formatErrorMessage(err);
            setError(userFriendlyMessage);
            setMessages(prev => [...prev, { role: 'system', content: userFriendlyMessage }]);
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, isCreatingNewChat, hasUserSentMessage, langThreadId]);

    // Handle suggestion click - send suggestion as message
    const handleSuggestionClick = useCallback((suggestion: string) => {
        sendMessageDirect(suggestion);
    }, [sendMessageDirect]);

    // Handle voice-generated content
    const handleVoiceContentGenerated = useCallback((content: any) => {
        // Extract the actual content text from the generated content object
        // The object has structure: { type: 'written_content', platform: 'text', content: '...' }
        let contentText: string;

        if (typeof content === 'string') {
            contentText = content;
        } else if (content?.content) {
            // Extract the content field from the object (this is where the actual markdown is)
            contentText = content.content;
        } else if (content?.text) {
            // Alternative field name
            contentText = content.text;
        } else {
            // Fallback - stringify only if we can't find the content
            contentText = JSON.stringify(content, null, 2);
        }

        // Add a model message with the generated content (will be rendered as markdown)
        setMessages(prev => [...prev, {
            role: 'model',
            content: contentText,
            isVoiceGenerated: true
        }]);
        setHasUserSentMessage(true);
    }, []);

    // Handle voice active change - switch to conversation UI when voice starts
    const handleVoiceActiveChange = useCallback((isActive: boolean) => {
        setIsVoiceActive(isActive);
        // Switch to conversation UI when voice becomes active
        if (isActive && !hasUserSentMessage) {
            setHasUserSentMessage(true);
        }
    }, [hasUserSentMessage]);

    const handleConfirmGeneration = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const result = await sendMessage({
                message: 'yes',
                threadId: langThreadId ?? '',
                workspaceId: workspaceId ?? undefined,
            });

            const aiResponse = result?.response;

            if (aiResponse) {
                setMessages(prev => [...prev, {
                    role: 'model',
                    content: aiResponse,
                }]);
            }
        } catch (err: any) {
            const userFriendlyMessage = formatErrorMessage(err);
            setError(userFriendlyMessage);
        } finally {
            setIsLoading(false);
        }
    }, [langThreadId]);

    // Show loading skeleton while authentication is initializing
    if (authLoading || !workspaceId || !user) {
        return <LoadingSkeleton />;
    }

    return (
        <div ref={containerRef} className="flex h-full bg-background relative">
            {isHistoryVisible && (
                <Suspense fallback={
                    <div className="w-64 bg-card border-r border-border animate-pulse">
                        <div className="p-3 border-b border-border">
                            <div className="h-10 bg-muted rounded-lg"></div>
                        </div>
                        <div className="p-3 border-b border-border">
                            <div className="h-9 bg-muted rounded-lg"></div>
                        </div>
                    </div>
                }>
                    <ThreadHistory
                        threads={chatHistory}
                        activeThreadId={activeThreadId}
                        isCreatingNewChat={isCreatingNewChat}
                        isLoading={isLoadingHistory}
                        workspaceId={workspaceId}
                        onNewChat={startNewChat}
                        onSelectThread={handleSelectThread}
                        onDeleteThread={handleDeleteThread}
                        onRenameThread={renameThread}
                    />
                </Suspense>
            )}

            <div className="flex-1 flex flex-col h-full">
                {!hasUserSentMessage ? (
                    <CenteredInputLayout
                        userInput={userInput}
                        setUserInput={setUserInput}
                        handleSubmit={handleSubmit}
                        isLoading={isLoading}
                        isCreatingNewChat={isCreatingNewChat}
                        error={error || fileError}
                        attachedFiles={attachedFiles}
                        removeAttachment={removeAttachment}
                        showUploadMenu={showUploadMenu}
                        setShowUploadMenu={setShowUploadMenu}
                        isRecording={isRecording}
                        toggleVoiceInput={toggleVoiceInput}
                        imageInputRef={imageInputRef}
                        fileInputRef={fileInputRef}
                        inputRef={inputRef}
                        handleFileUpload={handleFileUpload}
                        isHistoryVisible={isHistoryVisible}
                        setIsHistoryVisible={setIsHistoryVisible}
                        selectedModelId={selectedModelId}
                        setSelectedModelId={setSelectedModelId}
                        enableReasoning={enableReasoning}
                        setEnableReasoning={setEnableReasoning}
                    />
                ) : (
                    <>
                        <div ref={chatContainerRef} className="flex-1 overflow-y-auto relative scrollbar-hide">
                            <div className="absolute top-8 left-6 z-20">
                                <button
                                    onClick={() => setIsHistoryVisible(!isHistoryVisible)}
                                    className="p-2 rounded-lg bg-card hover:bg-card/90 border border-border shadow-sm transition-all hover:shadow-md"
                                    title={isHistoryVisible ? "Hide sidebar" : "Show sidebar"}
                                >
                                    {isHistoryVisible ? <PanelLeftClose className="w-5 h-5 text-foreground" /> : <History className="w-5 h-5 text-foreground" />}
                                </button>
                            </div>

                            <div className="max-w-4xl mx-auto px-6 pt-8 pb-4">
                                <Suspense fallback={null}>
                                    {messages.map((msg, index) => (
                                        <MessageBubble
                                            key={index}
                                            msg={msg}
                                            isLoading={isLoading}
                                            onSuggestionClick={handleSuggestionClick}
                                        />
                                    ))}
                                </Suspense>
                                {isLoading && (
                                    <div className="flex items-start gap-3 py-4">
                                        <div className="flex-shrink-0">
                                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                                                <Loader2 className="w-4 h-4 text-white animate-spin" />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-muted-foreground pt-1">
                                            <span className="text-sm">Thinking...</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ChatInput - full width */}
                        {!isVoiceActive && (
                            <Suspense fallback={
                                <div className="bg-white sticky bottom-0">
                                    <div className="max-w-4xl mx-auto px-6 py-4">
                                        <div className="h-14 bg-card rounded-[20px] border border-border animate-pulse"></div>
                                    </div>
                                </div>
                            }>
                                <ChatInput
                                    userInput={userInput}
                                    setUserInput={setUserInput}
                                    handleSubmit={handleSubmit}
                                    isLoading={isLoading}
                                    isCreatingNewChat={isCreatingNewChat}
                                    error={error || fileError}
                                    attachedFiles={attachedFiles}
                                    removeAttachment={removeAttachment}
                                    showUploadMenu={showUploadMenu}
                                    setShowUploadMenu={setShowUploadMenu}
                                    isRecording={isRecording}
                                    toggleVoiceInput={toggleVoiceInput}
                                    imageInputRef={imageInputRef}
                                    fileInputRef={fileInputRef}
                                    inputRef={inputRef}
                                    handleFileUpload={handleFileUpload}
                                    selectedModelId={selectedModelId}
                                    setSelectedModelId={setSelectedModelId}
                                    enableReasoning={enableReasoning}
                                    setEnableReasoning={setEnableReasoning}
                                />
                            </Suspense>
                        )}
                    </>
                )}
            </div>

            {/* Voice Agent - Floating panel (only shows when active) */}
            <VoiceButton
                ref={voiceButtonRef}
                userId={user.id}
                onContentGenerated={handleVoiceContentGenerated}
                onVoiceActiveChange={handleVoiceActiveChange}
            />
        </div>
    );
};

export default React.memo(ContentStrategistView);
