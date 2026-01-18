"use client";

import React, { useMemo, useRef, useEffect, useState } from "react";
import { Fragment } from "react";
import {
    CheckCircle2,
    Circle,
    Clock,
    FileText,
    ChevronDown,
    ChevronUp,
    Search,
    ExternalLink
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TodoItem } from "../types";

interface TasksFilesSidebarProps {
    todos?: TodoItem[];
    files?: Record<string, string>;
    onFileClick?: (path: string) => void;
    isCollapsed?: boolean;
}

const getStatusIcon = (status: TodoItem["status"]) => {
    switch (status) {
        case "completed":
            return <CheckCircle2 size={16} className="text-success" />;
        case "in_progress":
            return <Clock size={16} className="text-warning animate-pulse" />;
        default:
            return <Circle size={16} className="text-muted-foreground" />;
    }
};

const getStatusBadge = (status: TodoItem["status"]) => {
    switch (status) {
        case "completed":
            return <Badge variant="secondary" className="bg-success/10 text-success border-success/20">Done</Badge>;
        case "in_progress":
            return <Badge variant="secondary" className="bg-warning/10 text-warning border-warning/20">Active</Badge>;
        default:
            return <Badge variant="outline">Pending</Badge>;
    }
};

export const TasksFilesSidebar: React.FC<TasksFilesSidebarProps> = ({
    todos = [],
    files = {},
    onFileClick,
    isCollapsed = false,
}) => {
    const [tasksExpanded, setTasksExpanded] = useState(false);
    const [filesExpanded, setFilesExpanded] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const prevTodosCount = useRef(todos.length);
    const prevFilesCount = useRef(Object.keys(files).length);

    useEffect(() => {
        if (prevTodosCount.current === 0 && todos.length > 0) {
            setTasksExpanded(true);
        }
        prevTodosCount.current = todos.length;
    }, [todos.length]);

    const filesCount = Object.keys(files).length;
    useEffect(() => {
        if (prevFilesCount.current === 0 && filesCount > 0) {
            setFilesExpanded(true);
        }
        prevFilesCount.current = filesCount;
    }, [filesCount]);

    if (isCollapsed) return null;

    const filteredFiles = Object.keys(files).filter(path =>
        path.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const groupedTodos = useMemo(() => {
        return {
            pending: todos.filter((t) => t.status === "pending"),
            in_progress: todos.filter((t) => t.status === "in_progress"),
            completed: todos.filter((t) => t.status === "completed"),
        };
    }, [todos]);

    const groupedLabels: Record<keyof typeof groupedTodos, string> = {
        pending: "Pending",
        in_progress: "In Progress",
        completed: "Completed",
    };

    return (
        <div className="w-80 border-l border-border/60 bg-background/60 flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-border/60 bg-background/70">
                <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <Search size={14} className="text-muted-foreground" />
                    Agents State
                </h2>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-2 space-y-4">
                    {/* Tasks Section */}
                    <div className="space-y-1">
                        <button
                            onClick={() => setTasksExpanded(!tasksExpanded)}
                            className="w-full flex items-center justify-between p-2 hover:bg-muted rounded-md transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-primary" />
                                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tasks</span>
                                <Badge variant="secondary" className="text-[10px] h-4 px-1">{todos.length}</Badge>
                            </div>
                            {tasksExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {tasksExpanded && (
                            <div className="space-y-3 pl-2">
                                {todos.length === 0 ? (
                                    <p className="text-[11px] text-muted-foreground p-3 text-center bg-muted/20 rounded-md italic">
                                        No tasks created yet
                                    </p>
                                ) : (
                                    Object.entries(groupedTodos)
                                        .filter(([_, group]) => group.length > 0)
                                        .map(([status, group]) => (
                                            <div key={status} className="space-y-1">
                                                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                    {groupedLabels[status as keyof typeof groupedTodos]}
                                                </h3>
                                                <div className="grid grid-cols-[auto_1fr] gap-3 rounded-sm p-1 pl-0 text-xs">
                                                    {group.map((todo, index) => (
                                                        <Fragment key={`${status}_${todo.id ?? todo.content}_${index}`}>
                                                            {getStatusIcon(todo.status)}
                                                            <span className="break-words leading-relaxed text-foreground">
                                                                {todo.content}
                                                            </span>
                                                        </Fragment>
                                                    ))}
                                                </div>
                                            </div>
                                        ))
                                )}
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-border mx-2" />

                    {/* Files Section */}
                    <div className="space-y-1">
                        <button
                            onClick={() => setFilesExpanded(!filesExpanded)}
                            className="w-full flex items-center justify-between p-2 hover:bg-muted rounded-md transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <FileText size={16} className="text-primary" />
                                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Files</span>
                                <Badge variant="secondary" className="text-[10px] h-4 px-1">{Object.keys(files).length}</Badge>
                            </div>
                            {filesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {filesExpanded && (
                            <div className="space-y-1 pl-2">
                                <div className="px-2 pb-2">
                                    <div className="relative">
                                        <Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
                                        <input
                                            type="text"
                                            placeholder="Search files..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full bg-background/80 border border-border/60 rounded-md py-1.5 pl-7 pr-3 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary/20"
                                        />
                                    </div>
                                </div>

                                {filteredFiles.length === 0 ? (
                                    <p className="text-[11px] text-muted-foreground p-3 text-center bg-muted/20 rounded-md italic">
                                        No files found
                                    </p>
                                ) : (
                                    filteredFiles.map((path) => (
                                        <button
                                            key={path}
                                            onClick={() => onFileClick?.(path)}
                                            className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-background/80 border border-transparent hover:border-border/60 transition-all group text-left"
                                        >
                                            <FileText size={14} className="text-muted-foreground shrink-0" />
                                            <span className="text-xs text-foreground truncate flex-1">{path}</span>
                                            <ExternalLink size={12} className="opacity-0 group-hover:opacity-40 shrink-0" />
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
};

export const FilesPopover = ({ files, onFileClick }: { files: Record<string, string>, onFileClick?: (path: string) => void }) => {
    return (
        <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
            {Object.keys(files).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center p-4">No files yet</p>
            ) : (
                Object.keys(files).map((path) => (
                    <button
                        key={path}
                        onClick={() => onFileClick?.(path)}
                        className="w-full flex items-center gap-2 p-2 hover:bg-accent rounded-md text-left transition-colors"
                    >
                        <FileText size={14} className="text-muted-foreground" />
                        <span className="text-xs truncate">{path}</span>
                    </button>
                ))
            )}
        </div>
    );
};
