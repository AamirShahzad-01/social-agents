import React, { FormEvent, useState, useRef, useEffect } from 'react';
import { Bot, PlusCircle, Mic, MicOff, Send, X, FileText, Paperclip, Sparkles, Lightbulb, BookOpen, ChevronRight, History, PanelLeftClose, Image as ImageIcon, ChevronDown, Check, AlertCircle, Brain } from 'lucide-react';
import { AI_MODELS, DEFAULT_AI_MODEL_ID } from '@/constants/aiModels';
import Image from 'next/image';

import logoImage from '../../../public/zaik_light.png';

// Supported file types
const SUPPORTED_IMAGE_TYPES = '.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.ico,.tiff,.heic,.heif';
const SUPPORTED_DOC_TYPES = '.pdf,.doc,.docx,.ppt,.pptx,.txt,.csv,.json';

interface CenteredInputLayoutProps {
    userInput: string;
    setUserInput: (value: string) => void;
    handleSubmit: (e: FormEvent) => void;
    isLoading: boolean;
    isCreatingNewChat: boolean;
    error: string | null;
    attachedFiles: Array<{ type: 'image' | 'file', name: string, url: string, size: number }>;
    removeAttachment: (index: number) => void;
    showUploadMenu: boolean;
    setShowUploadMenu: (value: boolean) => void;
    isRecording: boolean;
    toggleVoiceInput: () => void;
    imageInputRef: React.RefObject<HTMLInputElement | null>;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    inputRef: React.RefObject<HTMLInputElement | null>;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => void;
    isHistoryVisible: boolean;
    setIsHistoryVisible: (value: boolean) => void;
    selectedModelId: string;
    setSelectedModelId: (modelId: string) => void;
    enableReasoning: boolean;
    setEnableReasoning: (enabled: boolean) => void;
}

export const CenteredInputLayout: React.FC<CenteredInputLayoutProps> = ({
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
    isHistoryVisible,
    setIsHistoryVisible,
    selectedModelId,
    setSelectedModelId,
    enableReasoning,
    setEnableReasoning,
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

    return (
        <div className="flex-1 flex flex-col items-center justify-center px-6 relative">
            {/* History Toggle Button - Top Left */}
            <div className="absolute top-8 left-6 z-20">
                <button
                    onClick={() => setIsHistoryVisible(!isHistoryVisible)}
                    className="p-2 rounded-lg bg-white/80 hover:bg-white border border-white/40 shadow-sm backdrop-blur-sm transition-all"
                    title={isHistoryVisible ? "Hide sidebar" : "Show sidebar"}
                >
                    {isHistoryVisible ? <PanelLeftClose className="w-5 h-5 text-gray-600" /> : <History className="w-5 h-5 text-gray-600" />}
                </button>
            </div>

            {/* Centered Content */}
            <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-center space-y-6">
                {/* Canva-style Greeting Message with Gradient Text */}
                <div className="text-center space-y-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center mx-auto bg-white/60 backdrop-blur-sm border border-white/40 shadow-lg">
                        <Image src={logoImage} alt="Zaik" width={36} height={36} className="object-cover" />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-semibold italic bg-gradient-to-r from-[#5B3FFF] via-[#8B6DFF] to-[#B8A3FF] bg-clip-text text-transparent">
                        What will you design today?
                    </h1>
                </div>

                {/* Centered Input Area - Canva Style */}
                <div className="w-full max-w-2xl">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-red-600">{error}</p>
                                <p className="text-xs text-red-400 mt-1">Try selecting a different model or check your settings.</p>
                            </div>
                        </div>
                    )}

                    {/* Attached Files Preview */}
                    {attachedFiles.length > 0 && (
                        <div className="mb-4 flex flex-wrap gap-2">
                            {attachedFiles.map((file: any, idx: number) => (
                                <div key={idx} className="relative group">
                                    {file.type === 'image' ? (
                                        <div className="relative">
                                            <img src={file.url} alt={file.name} className="h-16 w-16 object-cover rounded-xl border border-gray-200 shadow-sm" />
                                            <button
                                                onClick={() => removeAttachment(idx)}
                                                className="absolute -top-1.5 -right-1.5 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-sm"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-gray-200 shadow-sm">
                                            <FileText className="w-4 h-4 text-gray-500" />
                                            <span className="text-sm text-gray-600 max-w-[120px] truncate">{file.name}</span>
                                            <button
                                                onClick={() => removeAttachment(idx)}
                                                className="p-0.5 hover:bg-gray-100 rounded transition-colors"
                                            >
                                                <X className="w-3 h-3 text-gray-400" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* File Inputs - hidden */}
                    <input
                        type="file"
                        multiple
                        accept={SUPPORTED_IMAGE_TYPES}
                        onChange={(e) => { handleFileUpload(e, 'image'); setLocalShowMenu(false); }}
                        id="centered-image-upload-input"
                        style={{ display: 'none' }}
                    />
                    <input
                        type="file"
                        multiple
                        accept={SUPPORTED_DOC_TYPES}
                        onChange={(e) => { handleFileUpload(e, 'file'); setLocalShowMenu(false); }}
                        id="centered-document-upload-input"
                        style={{ display: 'none' }}
                    />

                    {/* Main Input Form - Canva-style clean white card */}
                    <form onSubmit={handleSubmit} className="relative">
                        <div className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-gray-100 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-shadow">
                            {/* Plus Button with Dropdown Menu */}
                            <div className="relative" ref={menuRef}>
                                <button
                                    type="button"
                                    onClick={() => setLocalShowMenu(!localShowMenu)}
                                    disabled={isLoading || isCreatingNewChat}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                                    title="Attach files"
                                >
                                    <PlusCircle className="w-5 h-5" />
                                </button>

                                {/* Upload Menu Dropdown */}
                                {localShowMenu && (
                                    <div className="absolute bottom-full left-0 mb-2 bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-gray-100 py-2 min-w-[220px] z-50">
                                        <div className="px-4 py-2 border-b border-gray-100">
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Upload Files</p>
                                        </div>

                                        {/* Images Option */}
                                        <label
                                            htmlFor="centered-image-upload-input"
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
                                        >
                                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center">
                                                <ImageIcon className="w-4.5 h-4.5 text-blue-500" />
                                            </div>
                                            <div>
                                                <span className="text-sm font-medium text-gray-700 block">Images</span>
                                                <span className="text-xs text-gray-400">JPG, PNG, GIF, SVG</span>
                                            </div>
                                        </label>

                                        {/* Documents Option */}
                                        <label
                                            htmlFor="centered-document-upload-input"
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
                                        >
                                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center">
                                                <FileText className="w-4.5 h-4.5 text-orange-500" />
                                            </div>
                                            <div>
                                                <span className="text-sm font-medium text-gray-700 block">Documents</span>
                                                <span className="text-xs text-gray-400">PDF, DOC, PPT, TXT</span>
                                            </div>
                                        </label>

                                        <div className="px-4 py-2 border-t border-gray-100 mt-1">
                                            <p className="text-xs text-gray-400">Max 10MB per file</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Text Input - Canva style */}
                            <input
                                ref={inputRef}
                                type="text"
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                placeholder="How can I help you today?"
                                className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-gray-700 text-[15px] placeholder:text-gray-400 disabled:text-gray-400"
                                disabled={isLoading || isCreatingNewChat}
                                autoFocus
                            />

                            {/* Voice Input Button */}
                            <button
                                type="button"
                                onClick={toggleVoiceInput}
                                disabled={isLoading || isCreatingNewChat}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                                title={isRecording ? "Stop recording" : "Voice input"}
                            >
                                {isRecording ? <MicOff className="w-5 h-5 text-red-500" /> : <Mic className="w-5 h-5" />}
                            </button>

                            {/* Send Button - Canva purple gradient style */}
                            <button
                                type="submit"
                                disabled={isLoading || isCreatingNewChat || !userInput.trim()}
                                className="p-2.5 rounded-xl text-white bg-gradient-to-r from-[#8b3dff] to-[#7d2ae8] hover:from-[#7a35e6] hover:to-[#6c25cc] disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-all flex-shrink-0 shadow-sm"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </form>

                    {/* Model Selector - Cleaner Canva style */}
                    <div className="mt-3 flex justify-end">
                        <div className="relative" ref={modelMenuRef}>
                            <button
                                type="button"
                                onClick={() => setShowModelDropdown(!showModelDropdown)}
                                disabled={isLoading || isCreatingNewChat}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-gray-500 hover:text-gray-700 hover:bg-white/60 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs font-medium"
                                title="Select AI Model"
                            >
                                <Sparkles className="w-3.5 h-3.5 text-[#8b3dff]" />
                                <span className="max-w-[160px] truncate">{AI_MODELS.find(m => m.id === selectedModelId)?.name || 'Select Model'}</span>
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {showModelDropdown && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-gray-100 py-2 min-w-[240px] max-h-72 overflow-y-auto z-50">
                                    <div className="px-4 py-2 border-b border-gray-100">
                                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">AI Model</p>
                                    </div>
                                    {AI_MODELS.map((model) => (
                                        <button
                                            key={model.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedModelId(model.id);
                                                setShowModelDropdown(false);
                                            }}
                                            className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left ${selectedModelId === model.id ? 'bg-purple-50' : ''}`}
                                        >
                                            <div>
                                                <span className="text-sm font-medium text-gray-700 block">{model.name}</span>
                                                <span className="text-xs text-gray-400">{model.providerLabel}</span>
                                            </div>
                                            {selectedModelId === model.id && (
                                                <Check className="w-4 h-4 text-[#8b3dff]" />
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
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed ${enableReasoning
                                ? 'text-[#8b3dff] bg-purple-50 hover:bg-purple-100'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'}`}
                            title={enableReasoning ? "Reasoning enabled" : "Reasoning disabled"}
                        >
                            <Brain className="w-3.5 h-3.5" />
                            <span>Thinking</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
