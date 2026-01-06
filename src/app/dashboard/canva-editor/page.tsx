'use client';

import React, { useState } from 'react';
import { CanvaEditor } from '../media-studio/components/CanvaEditor';
import { Badge } from '@/components/ui/badge';
import { Palette, Zap, Sparkles, Film } from 'lucide-react';

export default function CanvaEditorPage() {
  const [activeTab, setActiveTab] = useState<'designs' | 'video-editor'>('video-editor');
  const [designsCount, setDesignsCount] = useState(0);

  const tabs = [
    { id: 'designs' as const, label: 'Canva Designs', icon: Sparkles, count: designsCount },
    { id: 'video-editor' as const, label: 'Video Editor', icon: Film, count: null },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header with Toolbar - Matching Library Page Design */}
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-900 via-orange-900 to-amber-900 dark:from-amber-950 dark:via-orange-950 dark:to-amber-950">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-orange-500/30 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-amber-500/30 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: '1s', animationDuration: '3s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-orange-600/20 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: '1.5s', animationDuration: '4s' }} />
          <div className="absolute top-10 right-1/4 w-32 h-32 bg-orange-400/25 rounded-full blur-2xl animate-pulse"
            style={{ animationDelay: '0.5s', animationDuration: '2.5s' }} />
          <div className="absolute bottom-10 left-1/3 w-40 h-40 bg-amber-400/25 rounded-full blur-2xl animate-pulse"
            style={{ animationDelay: '2s', animationDuration: '3.5s' }} />
        </div>

        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/10" />

        <div className="relative px-6 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Left: Logo and Title */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 rounded-xl blur-lg opacity-75 animate-pulse group-hover:opacity-100 transition-opacity" />
                <div className="absolute inset-0 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400 rounded-xl blur-xl opacity-50 animate-pulse"
                  style={{ animationDelay: '0.5s' }} />
                <div className="relative bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 p-3 rounded-xl shadow-xl transform transition-transform group-hover:scale-105">
                  <Palette className="w-6 h-6 text-white" />
                </div>
              </div>

              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-3">
                  Editing Studio
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 text-[11px] px-2 py-0.5 h-6 shadow-lg hover:shadow-orange-500/50 transition-shadow">
                    <Zap className="w-3 h-3 mr-1 animate-pulse" />
                    Design Tools
                  </Badge>
                </h1>
                <p className="text-white/80 text-[13px] mt-0.5">
                  Edit your media with powerful design tools
                </p>
              </div>
            </div>

            {/* Right: Tab Navigation */}
            <div className="flex gap-1.5 p-1.5 bg-white/10 rounded-xl">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 rounded-lg text-[13px] transition-all duration-200 flex items-center gap-2 ${isActive
                      ? 'bg-white text-amber-900 shadow-sm font-medium'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                      }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                    {tab.count !== null && (
                      <Badge
                        className={`ml-1 text-[10px] px-1.5 py-0 h-5 ${isActive
                          ? 'bg-amber-100 text-amber-900 border-0'
                          : 'bg-white/20 text-white border-0'
                          }`}
                      >
                        {tab.count}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 pt-2 px-6 pb-6 bg-gradient-to-b from-muted/30 to-background overflow-auto">
        <CanvaEditor
          onMediaSaved={(url) => {
          }}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onCountsChange={(_library, designs) => {
            setDesignsCount(designs);
          }}
        />
      </div>
    </div>
  );
}
