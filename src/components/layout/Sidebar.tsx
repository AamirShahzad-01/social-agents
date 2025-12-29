'use client'

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Edit3,
    History,
    BarChart3,
    Settings,
    User,
    Sparkles,
    FolderOpen,
    Megaphone,
    MessageSquare,
    Video,
    Palette,
    Send,
    Users,
    Star,
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

const sidebarItems = [
    { icon: Edit3, label: 'Create Content', href: '/dashboard/create' },
    { icon: Video, label: 'Media Studio', href: '/dashboard/media-studio' },
    { icon: Palette, label: 'Canva Editor', href: '/dashboard/canva-editor' },
    { icon: FolderOpen, label: 'Library', href: '/dashboard/library' },
    { icon: Send, label: 'Publish', href: '/dashboard/history' },
    { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics' },
    { icon: MessageSquare, label: 'Comments', href: '/dashboard/comments' },
    { icon: Megaphone, label: 'Meta Ads', href: '/dashboard/meta-ads' },
];

const bottomItems = [
    { icon: Users, label: 'Team', href: '/settings?tab=members' },
    { icon: Star, label: 'Favorites', href: '/dashboard/favorites' },
];

export function Sidebar() {
    const pathname = usePathname();
    const { user } = useAuth();

    return (
        <TooltipProvider delayDuration={0}>
            <div className="flex h-full w-[72px] flex-col items-center bg-gradient-to-b from-emerald-950 via-teal-950 to-slate-950 border-r border-emerald-900/30 py-5">
                {/* Logo - Enterprise Style */}
                <div className="mb-8">
                    <Link href="/dashboard" className="group">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl overflow-hidden shadow-lg shadow-emerald-500/10 transition-all duration-300 group-hover:shadow-xl group-hover:shadow-emerald-500/25 group-hover:scale-105 ring-1 ring-emerald-500/20">
                            <img
                                src="/frappe-framework-logo.svg"
                                alt="Logo"
                                className="h-11 w-11"
                            />
                        </div>
                    </Link>
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
                                            "relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200",
                                            isActive
                                                ? "bg-gradient-to-br from-emerald-500/20 via-teal-500/15 to-cyan-500/20 text-emerald-100 shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-400/30"
                                                : "text-emerald-300/60 hover:text-emerald-100 hover:bg-emerald-500/10"
                                        )}
                                    >
                                        {/* Active indicator bar */}
                                        {isActive && (
                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-gradient-to-b from-emerald-400 to-teal-500 rounded-r-full" />
                                        )}
                                        <item.icon className="relative h-[22px] w-[22px] transition-all duration-200" />
                                    </Link>
                                </TooltipTrigger>
                                <TooltipContent side="right" sideOffset={8} className="bg-emerald-950 border-emerald-800 text-emerald-50 shadow-xl px-3 py-2">
                                    <p className="font-medium text-[13px]">{item.label}</p>
                                </TooltipContent>
                            </Tooltip>
                        );
                    })}
                </nav>

                {/* Bottom Section - Enterprise Standard */}
                <div className="flex flex-col items-center gap-1.5 pt-4 border-t border-emerald-900/30 mt-2">
                    {/* Bottom Navigation Items */}
                    {bottomItems.map((item, index) => {
                        const isActive = pathname === item.href;
                        return (
                            <Tooltip key={index}>
                                <TooltipTrigger asChild>
                                    <Link
                                        href={item.href}
                                        className={cn(
                                            "flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200",
                                            isActive
                                                ? "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/30"
                                                : "text-emerald-400/50 hover:text-emerald-100 hover:bg-emerald-500/10"
                                        )}
                                    >
                                        <item.icon className="h-5 w-5" />
                                    </Link>
                                </TooltipTrigger>
                                <TooltipContent side="right" sideOffset={8} className="bg-emerald-950 border-emerald-800 text-emerald-50 shadow-xl px-3 py-2">
                                    <p className="font-medium text-[13px]">{item.label}</p>
                                </TooltipContent>
                            </Tooltip>
                        );
                    })}

                    {/* Dark/Light Mode Toggle */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 text-emerald-400/50 hover:text-emerald-100 hover:bg-emerald-500/10">
                                <ModeToggle />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8} className="bg-emerald-950 border-emerald-800 text-emerald-50 shadow-xl px-3 py-2">
                            <p className="font-medium text-[13px]">Toggle Theme</p>
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
                                        ? "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/30"
                                        : "text-emerald-400/50 hover:text-emerald-100 hover:bg-emerald-500/10"
                                )}
                            >
                                <Settings className="h-5 w-5" />
                            </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8} className="bg-emerald-950 border-emerald-800 text-emerald-50 shadow-xl px-3 py-2">
                            <p className="font-medium text-[13px]">Settings</p>
                        </TooltipContent>
                    </Tooltip>

                    {/* User Avatar - Enterprise Style */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Link href="/settings?tab=profile" className="mt-3">
                                <Avatar className="h-10 w-10 ring-2 ring-emerald-800 ring-offset-2 ring-offset-emerald-950 transition-all hover:ring-emerald-500/50 hover:scale-105">
                                    <AvatarImage src={user?.user_metadata?.avatar_url} />
                                    <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm font-semibold">
                                        {user?.user_metadata?.full_name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                                    </AvatarFallback>
                                </Avatar>
                            </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8} className="bg-emerald-950 border-emerald-800 text-emerald-50 shadow-xl px-3 py-2">
                            <p className="font-medium text-[13px]">{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Profile'}</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>
        </TooltipProvider>
    );
}
