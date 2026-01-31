'use client'

import React from 'react';
import { Sidebar } from './Sidebar';

interface DashboardLayoutProps {
    children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
    return (
        <div className="flex h-screen overflow-hidden bg-canva-gradient">
            <aside className="hidden md:block">
                <Sidebar />
            </aside>
            <div className="flex flex-1 flex-col overflow-hidden">
                <main className="relative flex-1 overflow-y-auto scrollbar-hide">
                    {children}
                </main>
            </div>
        </div>
    );
}
