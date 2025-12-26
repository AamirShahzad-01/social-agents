/**
 * useFileUpload Hook
 * 
 * Handles file uploads for the content strategist.
 * Converts files to LangChain ContentBlock format.
 */

import { useState, useCallback, useRef, ChangeEvent } from 'react';
import {
    ContentBlock,
    fileToContentBlock,
    SUPPORTED_FILE_TYPES
} from '@/lib/multimodal-utils';

export interface AttachedFileDisplay {
    type: 'image' | 'file';
    name: string;
    url: string;
    size: number;
}

export const useFileUpload = () => {
    const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([]);
    const [showUploadMenu, setShowUploadMenu] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // Check for duplicate files
    const isDuplicate = useCallback((file: File) => {
        return contentBlocks.some(block => {
            const name = block.metadata?.name || block.metadata?.filename;
            return name === file.name && block.mimeType === file.type;
        });
    }, [contentBlocks]);

    // Handle file upload from input
    const handleFileUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const fileArray = Array.from(files);

        // Filter files
        const validFiles = fileArray.filter(file => SUPPORTED_FILE_TYPES.includes(file.type));
        const invalidFiles = fileArray.filter(file => !SUPPORTED_FILE_TYPES.includes(file.type));
        const duplicateFiles = validFiles.filter(file => isDuplicate(file));
        const uniqueFiles = validFiles.filter(file => !isDuplicate(file));

        // Check file sizes (max 10MB)
        const oversizedFiles = uniqueFiles.filter(file => file.size > 10 * 1024 * 1024);
        const sizedFiles = uniqueFiles.filter(file => file.size <= 10 * 1024 * 1024);

        // Report errors
        if (invalidFiles.length > 0) {
            setError(`Invalid file type. Supported: JPEG, PNG, GIF, WebP, PDF`);
        }
        if (duplicateFiles.length > 0) {
            setError(`Duplicate file: ${duplicateFiles.map(f => f.name).join(', ')}`);
        }
        if (oversizedFiles.length > 0) {
            setError(`File too large (max 10MB): ${oversizedFiles.map(f => f.name).join(', ')}`);
        }

        // Convert valid files to content blocks
        if (sizedFiles.length > 0) {
            try {
                const newBlocks = await Promise.all(sizedFiles.map(fileToContentBlock));
                setContentBlocks(prev => [...prev, ...newBlocks]);
            } catch (err) {
                setError('Failed to process files');
            }
        }

        // Reset inputs
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (imageInputRef.current) imageInputRef.current.value = '';
        setShowUploadMenu(false);
    }, [isDuplicate]);

    // Handle paste event for files
    const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        const items = e.clipboardData.items;
        if (!items) return;

        const files: File[] = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                const file = items[i].getAsFile();
                if (file) files.push(file);
            }
        }

        if (files.length === 0) return;
        e.preventDefault();

        const validFiles = files.filter(file =>
            SUPPORTED_FILE_TYPES.includes(file.type) &&
            file.size <= 10 * 1024 * 1024 &&
            !isDuplicate(file)
        );

        if (validFiles.length > 0) {
            try {
                const newBlocks = await Promise.all(validFiles.map(fileToContentBlock));
                setContentBlocks(prev => [...prev, ...newBlocks]);
            } catch (err) {
                setError('Failed to process pasted files');
            }
        }
    }, [isDuplicate]);

    // Remove a content block
    const removeBlock = useCallback((index: number) => {
        setContentBlocks(prev => prev.filter((_, i) => i !== index));
    }, []);

    // Clear all content blocks
    const clearBlocks = useCallback(() => {
        setContentBlocks([]);
    }, []);

    // Convert ContentBlocks to display format for UI
    const attachedFiles: AttachedFileDisplay[] = contentBlocks.map((block, index) => ({
        type: block.type === 'image' ? 'image' as const : 'file' as const,
        name: block.metadata?.name || block.metadata?.filename || `file-${index}`,
        url: block.data ? `data:${block.mimeType};base64,${block.data}` : '',
        size: 0,
    }));

    return {
        contentBlocks,
        attachedFiles,
        showUploadMenu,
        fileInputRef,
        imageInputRef,
        error,
        handleFileUpload,
        handlePaste,
        removeAttachment: removeBlock,
        clearBlocks,
        setShowUploadMenu,
        setError,
    };
};
