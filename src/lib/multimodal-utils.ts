/**
 * Multimodal Utilities
 * 
 * Convert files to LangChain ContentBlock format for multimodal AI input.
 * Based on langchain-ai/agent-chat-ui pattern.
 */

export const SUPPORTED_FILE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
];

export const SUPPORTED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
];

/**
 * Content block for multimodal messages
 */
export interface ContentBlock {
    type: 'image' | 'file' | 'text';
    mimeType?: string;
    data?: string;  // Base64 encoded content (without data: prefix)
    text?: string;  // For text blocks
    metadata?: {
        name?: string;
        filename?: string;
    };
}

/**
 * Convert a File to base64 string (without data: prefix)
 */
export async function fileToBase64(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            // Remove the data:...;base64, prefix
            resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Convert a File to a ContentBlock for multimodal AI
 */
export async function fileToContentBlock(file: File): Promise<ContentBlock> {
    if (!SUPPORTED_FILE_TYPES.includes(file.type)) {
        throw new Error(`Unsupported file type: ${file.type}`);
    }

    const data = await fileToBase64(file);

    if (SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        return {
            type: 'image',
            mimeType: file.type,
            data,
            metadata: { name: file.name },
        };
    }

    // PDF or other document
    return {
        type: 'file',
        mimeType: file.type,
        data,
        metadata: { filename: file.name },
    };
}

/**
 * Convert multiple files to ContentBlocks
 */
export async function filesToContentBlocks(files: File[]): Promise<ContentBlock[]> {
    const validFiles = files.filter(file => SUPPORTED_FILE_TYPES.includes(file.type));
    return Promise.all(validFiles.map(fileToContentBlock));
}

/**
 * Check if a file type is supported
 */
export function isFileTypeSupported(mimeType: string): boolean {
    return SUPPORTED_FILE_TYPES.includes(mimeType);
}

/**
 * Check if a file is an image
 */
export function isImageType(mimeType: string): boolean {
    return SUPPORTED_IMAGE_TYPES.includes(mimeType);
}

/**
 * Type guard for ContentBlock
 */
export function isContentBlock(block: unknown): block is ContentBlock {
    if (typeof block !== 'object' || block === null || !('type' in block)) {
        return false;
    }
    const b = block as { type: unknown };
    return b.type === 'image' || b.type === 'file' || b.type === 'text';
}
