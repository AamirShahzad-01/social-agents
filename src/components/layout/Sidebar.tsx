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
    Wand2,
    Sparkles,
    Palette,
    FolderOpen,
    Megaphone,
    MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import NotificationBell from '@/components/ui/NotificationBell';
import { ModeToggle } from '@/components/ui/mode-toggle';

const sidebarItems = [
    { icon: Edit3, label: 'Create Content', href: '/dashboard/create' },
    { icon: Wand2, label: 'Media Studio', href: '/dashboard/media-studio' },
    { icon: Palette, label: 'Canva Editor', href: '/dashboard/canva-editor' },
    { icon: FolderOpen, label: 'Library', href: '/dashboard/library' },
    { icon: History, label: 'Publish', href: '/dashboard/history' },
    { icon: MessageSquare, label: 'Comments', href: '/dashboard/comments' },
    { icon: Megaphone, label: 'Meta Ads', href: '/dashboard/meta-ads' },
    { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics' },
];

export function Sidebar() {
    const pathname = usePathname();
    const { signOut, user, userRole } = useAuth();

    return (
        <div className="flex h-full w-56 flex-col border-r border-border bg-card text-card-foreground font-sans shadow-sm pb-4">
            {/* Header Section - Premium Modern */}
            <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2 mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-primary text-white shadow-md shadow-primary/20 transition-all hover:scale-105">
                        <Sparkles className="h-4 w-4" />
                    </div>
                    <span className="text-base font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Content OS</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <ModeToggle />
                    <NotificationBell />
                </div>
            </div>

            {/* Navigation Section - Once UI inspired */}
            <div className="flex-1 overflow-auto py-4">
                <nav className="grid gap-1.5 px-3">
                    {sidebarItems.map((item, index) => {
                        const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                        const isHighlight = 'highlight' in item && item.highlight;
                        return (
                            <React.Fragment key={index}>
                                <Link
                                    href={item.href}
                                    className={cn(
                                        "group relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ease-in-out",
                                        isActive
                                            ? "bg-primary/10 text-primary shadow-sm border border-primary/20"
                                            : isHighlight
                                                ? "bg-gradient-to-r from-primary/5 to-primary/10 text-foreground hover:from-primary/10 hover:to-primary/20 border border-primary/10 hover:border-primary/20"
                                                : "text-muted-foreground hover:text-foreground hover:bg-muted hover:shadow-sm"
                                    )}
                                >
                                    {/* Active indicator line */}
                                    {isActive && (
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 gradient-primary rounded-r-full shadow-sm shadow-primary/30" />
                                    )}
                                    <item.icon className={cn(
                                        "h-4 w-4 transition-all duration-200",
                                        isActive ? "text-primary" : isHighlight ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                                    )} />
                                    <span>{item.label}</span>
                                    {/* Hover arrow indicator */}
                                    {!isActive && !isHighlight && (
                                        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                            <div className="w-1 h-1 rounded-full bg-muted-foreground" />
                                        </div>
                                    )}
                                </Link>
                            </React.Fragment>
                        );
                    })}
                </nav>
            </div>

            {/* Footer Section - Premium Modern */}
            <div className="border-t border-border p-4">
                {/* Secondary Navigation */}
                <div className="space-y-1 mb-3">
                    <Link
                        href="/settings?tab=members"
                        className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted hover:shadow-sm transition-all duration-200"
                    >
                        <Settings className="h-4 w-4 text-muted-foreground transition-colors" />
                        <span>Settings</span>
                    </Link>
                </div>

                {/* User Info Card with Sign Out Button */}
                <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-muted border border-border shadow-sm hover:shadow-md transition-all duration-200">
                    <Avatar className="h-10 w-10 ring-2 ring-primary/20 ring-offset-2 transition-all hover:ring-primary/30 flex-shrink-0">
                        <AvatarImage src={user?.user_metadata?.avatar_url} />
                        <AvatarFallback className="gradient-primary text-white">
                            <User className="h-5 w-5" />
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-none truncate text-foreground">
                            {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1.5 font-medium">
                            {userRole || 'User'}
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        className="h-8 px-3 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-200 flex-shrink-0"
                        onClick={() => {
                            if (confirm('Are you sure you want to sign out?')) {
                                signOut();
                            }
                        }}
                    >
                        <span className="text-xs font-semibold">Logout</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
