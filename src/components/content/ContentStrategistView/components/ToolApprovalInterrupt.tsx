"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Check, X, AlertCircle } from "lucide-react";
import type { ActionRequest, ReviewConfig } from "../types";
import { cn } from "@/lib/utils";

interface ToolApprovalInterruptProps {
    actionRequest: ActionRequest;
    reviewConfig?: ReviewConfig;
    onResume: (value: any) => void;
    isLoading?: boolean;
}

export const ToolApprovalInterrupt: React.FC<ToolApprovalInterruptProps> = ({
    actionRequest,
    reviewConfig,
    onResume,
    isLoading,
}) => {
    const handleApprove = () => {
        onResume({ action: "approve", actionId: actionRequest.id });
    };

    const handleDeny = () => {
        onResume({ action: "deny", actionId: actionRequest.id });
    };

    return (
        <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-4 dark:border-orange-900/50 dark:bg-orange-950/20">
            <div className="flex items-start gap-3">
                <div className="rounded-full bg-orange-100 p-1.5 dark:bg-orange-900/30">
                    <AlertCircle size={18} className="text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1 space-y-3">
                    <div>
                        <h4 className="text-sm font-semibold text-orange-900 dark:text-orange-400">
                            Tool Approval Required
                        </h4>
                        <p className="mt-1 text-xs text-orange-800/80 dark:text-orange-400/80">
                            The agent wants to execute <strong>{actionRequest.name}</strong>.
                            {actionRequest.description && ` ${actionRequest.description}`}
                        </p>
                    </div>

                    <div className="rounded border border-orange-200/50 bg-white/50 p-3 dark:border-orange-800/30 dark:bg-black/20">
                        <h5 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-orange-900/60 dark:text-orange-400/60">
                            Arguments
                        </h5>
                        <pre className="overflow-x-auto text-[11px] font-mono leading-relaxed text-orange-900 dark:text-orange-300">
                            {JSON.stringify(actionRequest.args, null, 2)}
                        </pre>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                        <Button
                            size="sm"
                            onClick={handleApprove}
                            disabled={isLoading}
                            className="h-8 gap-1.5 bg-orange-600 px-3 text-white hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600"
                        >
                            <Check size={14} />
                            Approve
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleDeny}
                            disabled={isLoading}
                            className="h-8 gap-1.5 border-orange-200 bg-white text-orange-900 hover:bg-orange-100 dark:border-orange-800 dark:bg-transparent dark:text-orange-400 dark:hover:bg-orange-900/30"
                        >
                            <X size={14} />
                            Deny
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
