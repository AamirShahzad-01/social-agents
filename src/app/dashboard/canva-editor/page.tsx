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
    <div className="min-h-screen bg-transparent">
      {/* Header with Toolbar - Matching Library Page Design */}
      <div className="sticky top-0 z-20 border-b bg-canva-gradient/95 backdrop-blur-sm shadow-sm">
        <div className="relative px-2 pt-0.5 pb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Left: Logo and Title */}
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <Palette className="w-5 h-5 text-primary" />
              </div>

              <div>
                <h1 className="text-base font-bold text-foreground flex items-center gap-2">
                  Editing Studio
                  <Badge variant="secondary" className="px-1.5 py-0 h-5 text-[10px]">
                    Design Tools
                  </Badge>
                </h1>
                <p className="text-muted-foreground text-xs">
                  Edit your media with powerful design tools. Edit designs in Canva or export them back to your media library
                </p>
              </div>
            </div>

            {/* Right: Tab Navigation */}
            <div className="flex gap-0.5 p-0.5 bg-muted/50 rounded-lg">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] transition-all duration-200 flex items-center gap-1.5 ${isActive
                      ? 'bg-primary text-primary-foreground shadow-sm font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                    {tab.count !== null && (
                      <Badge
                        variant="secondary"
                        className={`ml-0.5 text-[9px] px-1 py-0 h-4`}
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
      <div className="flex-1 pt-1 px-6 pb-6 overflow-auto">
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
