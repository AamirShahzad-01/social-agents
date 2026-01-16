import React, { FormEvent, RefObject, useState, useEffect, useRef } from 'react';
import { Send, PlusCircle, X, FileText, Image, File, ChevronDown, Check, Sparkles, AlertCircle, Brain } from 'lucide-react';
import { AttachedFile } from '../types';
import { AI_MODELS, DEFAULT_AI_MODEL_ID, getModelDisplayName } from '@/constants/aiModels';

// Supported file types
const SUPPORTED_IMAGE_TYPES = '.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.ico,.tiff,.heic,.heif';
const SUPPORTED_DOC_TYPES = '.pdf,.doc,.docx,.ppt,.pptx,.txt,.csv,.json';

interface ChatInputProps {
    userInput: string;
    setUserInput: (input: string) => void;
    handleSubmit: (e: FormEvent) => void;
    isLoading: boolean;
    isCreatingNewChat: boolean;
    error: string | null;
    attachedFiles: AttachedFile[];
    removeAttachment: (index: number) => void;
    showUploadMenu: boolean;
    setShowUploadMenu: (show: boolean) => void;
    isRecording: boolean;
    toggleVoiceInput: () => void;
    imageInputRef: RefObject<HTMLInputElement | null>;
    fileInputRef: RefObject<HTMLInputElement | null>;
    inputRef: RefObject<HTMLInputElement | null>;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => void;
    selectedModelId: string;
    setSelectedModelId: (modelId: string) => void;
    enableReasoning: boolean;
    setEnableReasoning: (enabled: boolean) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
    userInput,
    setUserInput,
    handleSubmit,
    isLoading,
    isCreatingNewChat,
    error,
    attachedFiles,
    removeAttachment,
    showUploadMenu,
    setShowUploadMenu,
    isRecording,
    toggleVoiceInput,
    imageInputRef,
    fileInputRef,
    inputRef,
    handleFileUpload,
    selectedModelId,
    setSelectedModelId,
    enableReasoning,
    setEnableReasoning
}) => {
    const [localShowMenu, setLocalShowMenu] = useState(false);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const modelMenuRef = useRef<HTMLDivElement>(null);

    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setLocalShowMenu(false);
            }
            if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
                setShowModelDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getFileIcon = (fileName: string) => {
        const ext = fileName.toLowerCase().split('.').pop();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'heic', 'heif'].includes(ext || '')) {
            return <Image className="w-4 h-4 text-blue-500" />;
        }
        if (ext === 'pdf') {
            return <FileText className="w-4 h-4 text-red-500" />;
        }
        if (['doc', 'docx'].includes(ext || '')) {
            return <FileText className="w-4 h-4 text-blue-600" />;
        }
        if (['ppt', 'pptx'].includes(ext || '')) {
            return <FileText className="w-4 h-4 text-orange-500" />;
        }
        if (ext === 'csv') {
            return <FileText className="w-4 h-4 text-green-500" />;
        }
        if (ext === 'json') {
            return <FileText className="w-4 h-4 text-yellow-500" />;
        }
        return <File className="w-4 h-4 text-muted-foreground" />;
    };

    return (
        <>
            {/* File Inputs - placed at root level outside form */}
            <input
                type="file"
                multiple
                accept={SUPPORTED_IMAGE_TYPES}
                onChange={(e) => { handleFileUpload(e, 'image'); setLocalShowMenu(false); }}
                id="image-upload-input"
                style={{ display: 'none' }}
            />
            <input
                type="file"
                multiple
                accept={SUPPORTED_DOC_TYPES}
                onChange={(e) => { handleFileUpload(e, 'file'); setLocalShowMenu(false); }}
                id="document-upload-input"
                style={{ display: 'none' }}
            />

            <div className="bg-transparent sticky bottom-0">
                <div className="max-w-4xl mx-auto px-6 py-4">
                    {error && (
                        <div className="mb-3 p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-destructive">{error}</p>
                                <p className="text-xs text-muted-foreground mt-1">Try selecting a different model or check your settings.</p>
                            </div>
                        </div>
                    )}

                    {/* Attached Files Preview */}
                    {attachedFiles.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-2">
                            {attachedFiles.map((file, idx) => (
                                <div key={idx} className="relative group">
                                    {file.type === 'image' ? (
                                        <div className="relative">
                                            <img src={file.url} alt={file.name} className="h-20 w-20 object-cover rounded-lg border border-border" />
                                            <button
                                                onClick={() => removeAttachment(idx)}
                                                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg border border-border">
                                            {getFileIcon(file.name)}
                                            <span className="text-sm text-muted-foreground max-w-[150px] truncate">{file.name}</span>
                                            <button
                                                onClick={() => removeAttachment(idx)}
                                                className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                                            >
                                                <X className="w-3 h-3 text-muted-foreground" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="relative">
                        <div className="flex items-center gap-2 bg-card rounded-[20px] px-3.5 py-2.5 shadow-sm border border-border hover:border-border/80 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                            {/* Plus Button with Dropdown Menu */}
                            <div className="relative" ref={menuRef}>
                                <button
                                    type="button"
                                    onClick={() => setLocalShowMenu(!localShowMenu)}
                                    disabled={isLoading || isCreatingNewChat}
                                    className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                                    title="Attach files"
                                >
                                    <PlusCircle className="w-5 h-5" />
                                </button>

                                {/* Upload Menu Dropdown */}
                                {localShowMenu && (
                                    <div className="absolute bottom-full left-0 mb-2 bg-card rounded-xl shadow-lg border border-border py-1 min-w-[200px] z-50">
                                        <div className="px-3 py-2 border-b border-border">
                                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Upload Files</p>
                                        </div>

                                        {/* Images Option - using label */}
                                        <label
                                            htmlFor="image-upload-input"
                                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left cursor-pointer"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                                <Image className="w-4 h-4 text-blue-600" />
                                            </div>
                                            <div>
                                                <span className="text-sm font-medium text-foreground block">Images</span>
                                                <span className="text-xs text-muted-foreground">JPG, PNG, GIF, WebP, SVG</span>
                                            </div>
                                        </label>

                                        {/* Documents Option - using label */}
                                        <label
                                            htmlFor="document-upload-input"
                                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left cursor-pointer"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                                                <FileText className="w-4 h-4 text-orange-600" />
                                            </div>
                                            <div>
                                                <span className="text-sm font-medium text-foreground block">Documents</span>
                                                <span className="text-xs text-muted-foreground">PDF, DOC, PPT, TXT, CSV, JSON</span>
                                            </div>
                                        </label>

                                        <div className="px-3 py-2 border-t border-border mt-1">
                                            <p className="text-xs text-muted-foreground">Max 10MB per file • Up to 5 files</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Text Input */}
                            <input
                                ref={inputRef}
                                type="text"
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                placeholder={isCreatingNewChat ? "Creating new chat..." : isRecording ? "Listening..." : "How can I help you today?"}
                                className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-foreground font-normal text-[15px] placeholder:text-muted-foreground/70 disabled:text-muted-foreground"
                                disabled={isLoading || isCreatingNewChat}
                                autoFocus
                            />

                            {/* Send Button */}
                            <button
                                type="submit"
                                disabled={isLoading || isCreatingNewChat}
                                className="p-2 rounded-lg text-white gradient-primary hover:shadow-md disabled:bg-muted disabled:cursor-not-allowed transition-all flex-shrink-0"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </form>

                    <div className="mt-2 flex justify-end gap-2">
                        <div className="relative" ref={modelMenuRef}>
                            <button
                                type="button"
                                onClick={() => setShowModelDropdown(!showModelDropdown)}
                                disabled={isLoading || isCreatingNewChat}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
                                title="Select AI Model"
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span className="max-w-[140px] truncate">{AI_MODELS.find(m => m.id === selectedModelId)?.name || 'Model'}</span>
                                <ChevronDown className={`w-3 h-3 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {showModelDropdown && (
                                <div className="absolute bottom-full right-0 mb-2 bg-card rounded-xl shadow-lg border border-border py-1 min-w-[220px] max-h-64 overflow-y-auto z-50">
                                    <div className="px-3 py-2 border-b border-border">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI Model</p>
                                    </div>
                                    {AI_MODELS.map((model) => (
                                        <button
                                            key={model.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedModelId(model.id);
                                                setShowModelDropdown(false);
                                            }}
                                            className={`w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors text-left ${selectedModelId === model.id ? 'bg-primary/10' : ''}`}
                                        >
                                            <div>
                                                <span className="text-sm font-medium text-foreground block">{model.name}</span>
                                                <span className="text-xs text-muted-foreground">{model.providerLabel}</span>
                                            </div>
                                            {selectedModelId === model.id && (
                                                <Check className="w-4 h-4 text-primary" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Reasoning Toggle */}
                        <button
                            type="button"
                            onClick={() => setEnableReasoning(!enableReasoning)}
                            disabled={isLoading || isCreatingNewChat}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed ${enableReasoning
                                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                            title={enableReasoning ? "Reasoning enabled" : "Reasoning disabled"}
                        >
                            <Brain className="w-3.5 h-3.5" />
                            <span>Thinking</span>
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};
