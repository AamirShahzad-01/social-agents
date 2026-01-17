'use client';

import React, { useMemo, useCallback, useState, useEffect } from "react";
import { FileText, Copy, Download, Edit, Save, X, Loader2, FileDown } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { toast } from "react-hot-toast";
import { MarkdownContent } from "./MarkdownContent";
import type { FileItem } from "../types";
import useSWRMutation from "swr/mutation";

const LANGUAGE_MAP: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    json: "json",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    ini: "ini",
    dockerfile: "dockerfile",
    makefile: "makefile",
};

export const FileViewDialog = React.memo<{
    file: FileItem | null;
    isOpen: boolean;
    onSaveFile?: (fileName: string, content: string) => Promise<void>;
    onClose: () => void;
    editDisabled?: boolean;
}>(({ file, isOpen, onSaveFile, onClose, editDisabled = false }) => {
    const [isEditingMode, setIsEditingMode] = useState(false);
    const [fileName, setFileName] = useState(String(file?.path || ""));
    const [fileContent, setFileContent] = useState(String(file?.content || ""));

    const fileUpdate = useSWRMutation(
        { kind: "files-update", fileName, fileContent },
        async ({ fileName, fileContent }) => {
            if (!fileName || !fileContent || !onSaveFile) return;
            return await onSaveFile(fileName, fileContent);
        },
        {
            onSuccess: () => setIsEditingMode(false),
            onError: (error) => toast.error(`Failed to save file: ${error}`),
        }
    );

    useEffect(() => {
        if (file) {
            setFileName(String(file.path || ""));
            setFileContent(String(file.content || ""));
            setIsEditingMode(false);
        }
    }, [file]);

    const fileExtension = useMemo(() => {
        const fileNameStr = String(fileName || "");
        return fileNameStr.split(".").pop()?.toLowerCase() || "";
    }, [fileName]);

    const isMarkdown = useMemo(() => {
        return fileExtension === "md" || fileExtension === "markdown";
    }, [fileExtension]);

    const language = useMemo(() => {
        return LANGUAGE_MAP[fileExtension] || "text";
    }, [fileExtension]);

    const handleCopy = useCallback(() => {
        if (fileContent) {
            navigator.clipboard.writeText(fileContent);
            toast.success("Copied to clipboard");
        }
    }, [fileContent]);

    const handleDownload = useCallback(() => {
        if (fileContent && fileName) {
            const blob = new Blob([fileContent], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName.split('/').pop() || fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }, [fileContent, fileName]);

    const handleDownloadPDF = useCallback(async () => {
        if (!fileContent || !fileName) return;
        
        try {
            // Dynamic import for PDF generation
            const html2pdf = (await import('html2pdf.js')).default;
            
            // Create a styled HTML container for the content
            const container = document.createElement('div');
            container.style.cssText = `
                font-family: Arial, sans-serif;
                font-size: 11pt;
                line-height: 1.5;
                color: #000;
                background: white;
            `;
            
            // Convert markdown to HTML directly from fileContent
            if (isMarkdown) {
                // Simple markdown to HTML conversion for PDF
                let htmlContent = fileContent
                    // Headers
                    .replace(/^### (.*$)/gm, '<h3 style="font-size: 14pt; margin: 16px 0 8px;">$1</h3>')
                    .replace(/^## (.*$)/gm, '<h2 style="font-size: 16pt; margin: 20px 0 10px;">$1</h2>')
                    .replace(/^# (.*$)/gm, '<h1 style="font-size: 20pt; margin: 24px 0 12px;">$1</h1>')
                    // Bold and italic
                    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    // Lists
                    .replace(/^\- (.*$)/gm, '<li style="margin: 4px 0;">$1</li>')
                    .replace(/^\d+\. (.*$)/gm, '<li style="margin: 4px 0;">$1</li>')
                    // Line breaks to paragraphs
                    .replace(/\n\n/g, '</p><p style="margin: 12px 0;">')
                    .replace(/\n/g, '<br/>');
                
                container.innerHTML = `<p style="margin: 12px 0;">${htmlContent}</p>`;
            } else {
                container.innerHTML = `<pre style="white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 10pt; line-height: 1.5;">${fileContent}</pre>`;
            }
            
            document.body.appendChild(container);
            
            const opt = {
                margin: 10,
                filename: (fileName.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'document') + '.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            
            await html2pdf().set(opt as any).from(container).save();
            document.body.removeChild(container);
            toast.success('PDF downloaded successfully');
        } catch (error) {
            console.error('PDF generation error:', error);
            toast.error('Failed to generate PDF. Please try downloading as text.');
        }
    }, [fileContent, fileName, isMarkdown]);

    const handleEdit = useCallback(() => {
        setIsEditingMode(true);
    }, []);

    const handleCancel = useCallback(() => {
        if (file === null) {
            onClose();
        } else {
            setFileName(String(file.path));
            setFileContent(String(file.content));
            setIsEditingMode(false);
        }
    }, [file, onClose]);

    const fileNameIsValid = useMemo(() => {
        return (
            fileName.trim() !== "" &&
            !fileName.includes(" ")
        );
    }, [fileName]);

    if (!isOpen) return null;

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => !open && onClose()}
        >
            <DialogContent className="flex h-[80vh] max-h-[80vh] min-w-[70vw] flex-col p-6 overflow-hidden">
                <DialogTitle className="sr-only">
                    {file?.path || "View File"}
                </DialogTitle>
                <div className="mb-4 flex items-center justify-between border-b border-border pb-4">
                    <div className="flex min-w-0 items-center gap-2">
                        <FileText className="text-primary/50 h-5 w-5 shrink-0" />
                        {isEditingMode ? (
                            <Input
                                value={fileName}
                                onChange={(e) => setFileName(e.target.value)}
                                placeholder="Enter filename..."
                                className="text-base font-medium h-8"
                                aria-invalid={!fileNameIsValid}
                            />
                        ) : (
                            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-base font-medium text-foreground">
                                {file?.path}
                            </span>
                        )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        {!isEditingMode && (
                            <>
                                <Button
                                    onClick={handleEdit}
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2"
                                    disabled={editDisabled || !onSaveFile}
                                >
                                    <Edit size={16} className="mr-1" />
                                    Edit
                                </Button>
                                <Button
                                    onClick={handleCopy}
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2"
                                >
                                    <Copy size={16} className="mr-1" />
                                    Copy
                                </Button>
                                <Button
                                    onClick={handleDownload}
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2"
                                >
                                    <Download size={16} className="mr-1" />
                                    Download
                                </Button>
                                <Button
                                    onClick={handleDownloadPDF}
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2"
                                >
                                    <FileDown size={16} className="mr-1" />
                                    PDF
                                </Button>
                            </>
                        )}
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                    {isEditingMode ? (
                        <Textarea
                            value={fileContent}
                            onChange={(e) => setFileContent(e.target.value)}
                            placeholder="Enter file content..."
                            className="h-full min-h-[400px] resize-none font-mono text-sm"
                        />
                    ) : (
                        <ScrollArea className="bg-muted/30 h-full rounded-md border">
                            <div className="p-4">
                                {fileContent ? (
                                    isMarkdown ? (
                                        <div className="rounded-md">
                                            <MarkdownContent content={fileContent} />
                                        </div>
                                    ) : (
                                        <SyntaxHighlighter
                                            language={language}
                                            style={oneDark}
                                            customStyle={{
                                                margin: 0,
                                                borderRadius: "0.5rem",
                                                fontSize: "0.875rem",
                                                background: 'transparent',
                                            }}
                                            showLineNumbers
                                            wrapLines={true}
                                        >
                                            {fileContent}
                                        </SyntaxHighlighter>
                                    )
                                ) : (
                                    <div className="flex items-center justify-center p-12">
                                        <p className="text-sm text-muted-foreground">
                                            File is empty
                                        </p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    )}
                </div>
                {isEditingMode && (
                    <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
                        <Button
                            onClick={handleCancel}
                            variant="outline"
                            size="sm"
                        >
                            <X size={16} className="mr-1" />
                            Cancel
                        </Button>
                        <Button
                            onClick={() => fileUpdate.trigger()}
                            size="sm"
                            disabled={
                                fileUpdate.isMutating ||
                                !fileName.trim() ||
                                !fileContent.trim() ||
                                !fileNameIsValid
                            }
                        >
                            {fileUpdate.isMutating ? (
                                <Loader2 size={16} className="mr-1 animate-spin" />
                            ) : (
                                <Save size={16} className="mr-1" />
                            )}
                            Save
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
});

FileViewDialog.displayName = "FileViewDialog";

export default FileViewDialog;
