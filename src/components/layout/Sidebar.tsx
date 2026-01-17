'use client'

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
// Professional React Icons - using Phosphor (Pi), Remix (Ri), and Heroicons (Hi)
import {
    PenLine,
    CalendarCheck,
    Clapperboard,
    PenTool,
    FolderOpen,
    Send,
    LineChart,
    MessageCircle,
    Megaphone,
    Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ModeToggle } from '@/components/ui/mode-toggle';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import NotificationBell from '@/components/ui/NotificationBell';

const sidebarItems = [
    {
        icon: PenLine,
        label: 'Create Content',
        href: '/dashboard/create',
        tint: 'before:from-rose-500/25 before:via-rose-400/10',
    },
    {
        icon: CalendarCheck,
        label: 'Content Calendar',
        href: '/dashboard/content-calendar',
        tint: 'before:from-amber-400/25 before:via-amber-300/10',
    },
    {
        icon: Clapperboard,
        label: 'Media Studio',
        href: '/dashboard/media-studio',
        tint: 'before:from-indigo-400/25 before:via-indigo-300/10',
    },
    {
        icon: PenTool,
        label: 'Editing Studio',
        href: '/dashboard/canva-editor',
        tint: 'before:from-emerald-400/25 before:via-emerald-300/10',
    },
    {
        icon: FolderOpen,
        label: 'Assets',
        href: '/dashboard/library',
        tint: 'before:from-sky-400/25 before:via-sky-300/10',
    },
    {
        icon: Send,
        label: 'Publish',
        href: '/dashboard/history',
        tint: 'before:from-cyan-400/25 before:via-cyan-300/10',
    },
    {
        icon: LineChart,
        label: 'Analytics',
        href: '/dashboard/analytics',
        tint: 'before:from-blue-500/20 before:via-blue-400/10',
    },
    {
        icon: MessageCircle,
        label: 'Inbox',
        href: '/dashboard/comments',
        tint: 'before:from-teal-400/25 before:via-teal-300/10',
    },
    {
        icon: Megaphone,
        label: 'Meta Ads',
        href: '/dashboard/meta-ads',
        tint: 'before:from-orange-400/25 before:via-orange-300/10',
    },
];



export function Sidebar() {
    const pathname = usePathname();
    const { user } = useAuth();

    return (
        <TooltipProvider delayDuration={0}>
            <div className="flex h-full w-[72px] flex-col items-center bg-white/10 backdrop-blur-xl border-r border-white/20 pt-1 pb-2 shadow-sm z-40">
                {/* Logo - Enterprise Style */}
                <div className="mb-0">
                    <Link href="/dashboard" className="group">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl overflow-hidden bg-white/20 border border-white/30 shadow-md transition-all duration-300 group-hover:shadow-lg group-hover:scale-105">
                            <img
                                src="/frappe-framework-logo.svg"
                                alt="Logo"
                                className="h-11 w-11"
                            />
                        </div>
                    </Link>
                </div>

                {/* Dark/Light Mode Toggle - Below Logo */}
                <div className="mb-0">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 text-foreground/70 hover:text-foreground hover:bg-white/20">
                                <ModeToggle />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8} className="bg-slate-800 border-slate-700 text-white shadow-xl px-3 py-2">
                            <p className="font-medium text-[13px]">Toggle Theme</p>
                        </TooltipContent>
                    </Tooltip>
                </div>

                {/* Main Navigation - Enterprise Standard */}
                <nav className="flex flex-1 flex-col items-center gap-1.5">
                    {sidebarItems.map((item, index) => {
                        const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                        return (
                            <Tooltip key={index}>
                                <TooltipTrigger asChild>
                                    <Link
                                        href={item.href}
                                        className={cn(
                                            "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-br before:to-transparent before:opacity-0 before:transition before:duration-200 before:content-['']",
                                            isActive
                                                ? "bg-gradient-to-br from-white/70 to-white/25 text-foreground shadow-[0_12px_24px_rgba(15,23,42,0.18)] border border-white/70 ring-1 ring-white/60 before:opacity-100"
                                                : "text-foreground/70 hover:text-foreground hover:bg-white/30 hover:shadow-[0_10px_20px_rgba(15,23,42,0.16)] hover:-translate-y-0.5",
                                            item.tint
                                        )}
                                    >
                                        {/* Active indicator bar */}
                                        {isActive && (
                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r-full shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                                        )}
                                        <item.icon
                                            className="relative h-[22px] w-[22px] transition-all duration-200 group-hover:scale-[1.06]"
                                            strokeWidth={1.7}
                                        />
                                    </Link>
                                </TooltipTrigger>
                                <TooltipContent side="right" sideOffset={8} className="bg-slate-800 border-slate-700 text-white shadow-xl px-3 py-2">
                                    <p className="font-medium text-[13px]">{item.label}</p>
                                </TooltipContent>
                            </Tooltip>
                        );
                    })}
                </nav>

                {/* Bottom Section - Enterprise Standard */}
                <div className="flex flex-col items-center gap-1.5 pt-4 border-t border-slate-200/80 mt-2">

                    {/* Notifications */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 text-teal-600 bg-white/10 hover:text-teal-700 hover:bg-teal-50 hover:shadow-md">
                                <NotificationBell
                                    side="right"
                                    className="p-0 text-inherit hover:text-inherit hover:bg-transparent [&_svg]:h-5 [&_svg]:w-5"
                                />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8} className="bg-slate-800 border-slate-700 text-white shadow-xl px-3 py-2">
                            <p className="font-medium text-[13px]">Notifications</p>
                        </TooltipContent>
                    </Tooltip>

                    {/* Settings */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Link
                                href="/settings"
                                className={cn(
                                    "flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200",
                                    pathname?.startsWith('/settings')
                                        ? "bg-gradient-to-br from-white/60 to-white/20 text-primary shadow-md border border-white/60 ring-1 ring-white/40"
                                        : "text-foreground/70 hover:text-primary hover:bg-white/25 hover:shadow-md"
                                )}
                            >
                                <Settings className="h-5 w-5" />
                            </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8} className="bg-slate-800 border-slate-700 text-white shadow-xl px-3 py-2">
                            <p className="font-medium text-[13px]">Settings</p>
                        </TooltipContent>
                    </Tooltip>


                    {/* User Avatar - Enterprise Style */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Link href="/settings?tab=profile" className="mt-3">
                                <Avatar className="h-10 w-10 ring-2 ring-slate-200 ring-offset-2 ring-offset-white transition-all hover:ring-teal-400/50 hover:scale-105">
                                    <AvatarImage src={user?.user_metadata?.avatar_url} />
                                    <AvatarFallback className="bg-gradient-to-br from-teal-500 to-cyan-600 text-white text-sm font-semibold">
                                        {user?.user_metadata?.full_name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                                    </AvatarFallback>
                                </Avatar>
                            </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8} className="bg-slate-800 border-slate-700 text-white shadow-xl px-3 py-2">
                            <p className="font-medium text-[13px]">{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Profile'}</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>
        </TooltipProvider >
    );
}
