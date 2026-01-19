'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    MessageSquare,
    Loader2,
    Sparkles,
    AlertCircle,
    Plus,
    Trash2,
    Volume2,
    ChevronDown,
    Search,
    Info,
} from 'lucide-react';
import { validation, parseAudioError, formatErrorMessage } from './utils/errorHandling';
import { post } from '@/lib/python-backend/client';

// ============================================================================
// TYPES
// ============================================================================

interface Voice {
    voice_id: string;
    name: string;
    category?: string;
    labels?: Record<string, string>;
}

interface DialogLine {
    id: string;
    text: string;
    voiceId: string;
}

interface DialogGeneratorFormProps {
    voices: Voice[];
    isLoadingVoices: boolean;
    onAudioGenerated: (audioBase64: string) => void;
}

// ============================================================================
// AUDIO TAGS
// ============================================================================

const AUDIO_TAGS = [
    { tag: '[laughs]', label: 'Laughs' },
    { tag: '[sighs]', label: 'Sighs' },
    { tag: '[whispers]', label: 'Whispers' },
    { tag: '[gasps]', label: 'Gasps' },
    { tag: '[clears throat]', label: 'Clears throat' },
    { tag: '[cheerfully]', label: 'Cheerfully' },
    { tag: '[sadly]', label: 'Sadly' },
    { tag: '[angrily]', label: 'Angrily' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function DialogGeneratorForm({
    voices,
    isLoadingVoices,
    onAudioGenerated
}: DialogGeneratorFormProps) {
    const [lines, setLines] = useState<DialogLine[]>([
        { id: '1', text: '', voiceId: '' },
        { id: '2', text: '', voiceId: '' },
    ]);
    const [activeLineId, setActiveLineId] = useState<string | null>(null);
    const [voiceSearch, setVoiceSearch] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter voices
    const filteredVoices = voices.filter(v =>
        v.name.toLowerCase().includes(voiceSearch.toLowerCase())
    );

    // Add new line
    const addLine = () => {
        setLines([...lines, { id: Date.now().toString(), text: '', voiceId: '' }]);
    };

    // Remove line
    const removeLine = (id: string) => {
        if (lines.length <= 2) return;
        setLines(lines.filter(l => l.id !== id));
    };

    // Update line
    const updateLine = (id: string, field: 'text' | 'voiceId', value: string) => {
        setLines(lines.map(l => l.id === id ? { ...l, [field]: value } : l));
        if (field === 'voiceId') setActiveLineId(null);
    };

    // Insert audio tag
    const insertTag = (lineId: string, tag: string) => {
        const line = lines.find(l => l.id === lineId);
        if (line) {
            updateLine(lineId, 'text', line.text + ' ' + tag + ' ');
        }
    };

    // Get voice by ID
    const getVoice = (voiceId: string) => voices.find(v => v.voice_id === voiceId);

    // Generate dialog
    const handleGenerate = useCallback(async () => {
        setError(null);

        // Validation
        const linesValidation = validation.dialogLines(lines);
        if (!linesValidation.valid) {
            setError(linesValidation.error);
            return;
        }

        const validLines = lines.filter(l => l.text.trim() && l.voiceId);

        setIsGenerating(true);

        try {
            const data = await post<{ success: boolean; audioBase64?: string; error?: string }>('/media/audio/dialog', {
                inputs: validLines.map(l => ({
                    text: l.text,
                    voiceId: l.voiceId,
                })),
            });

            if (!data.success) {
                throw new Error(data.error || 'Failed to generate dialog');
            }

            onAudioGenerated(data.audioBase64!);
            setError(null);
        } catch (err) {
            const audioError = parseAudioError(err);
            setError(formatErrorMessage(audioError));
        } finally {
            setIsGenerating(false);
        }
    }, [lines, onAudioGenerated]);

    return (
        <div className="space-y-6">

            {/* Dialog Lines */}
            <div className="space-y-4">
                {lines.map((line, index) => (
                    <div key={line.id} className="p-4 border rounded-lg space-y-3 bg-card">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">
                                Speaker {index + 1}
                            </span>
                            {lines.length > 2 && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-red-500"
                                    onClick={() => removeLine(line.id)}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            )}
                        </div>

                        {/* Voice Selector */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setActiveLineId(activeLineId === line.id ? null : line.id)}
                                className="w-full flex items-center justify-between px-3 py-2.5 border rounded-lg bg-background hover:bg-muted/50"
                            >
                                <div className="flex items-center gap-2">
                                    <Volume2 className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm">
                                        {getVoice(line.voiceId)?.name || 'Select voice'}
                                    </span>
                                </div>
                                <ChevronDown className={`w-4 h-4 transition-transform ${activeLineId === line.id ? 'rotate-180' : ''}`} />
                            </button>

                            {activeLineId === line.id && (
                                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-[200px] overflow-hidden">
                                    <div className="p-2 border-b">
                                        <div className="relative">
                                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <input
                                                type="text"
                                                placeholder="Search..."
                                                value={voiceSearch}
                                                onChange={(e) => setVoiceSearch(e.target.value)}
                                                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md bg-background"
                                            />
                                        </div>
                                    </div>
                                    <div className="max-h-[140px] overflow-y-auto p-1">
                                        {filteredVoices.slice(0, 20).map((voice) => (
                                            <button
                                                key={voice.voice_id}
                                                onClick={() => updateLine(line.id, 'voiceId', voice.voice_id)}
                                                className="w-full flex items-center gap-2 p-2 rounded text-left hover:bg-muted text-sm"
                                            >
                                                <Volume2 className="w-4 h-4" />
                                                {voice.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Text Input */}
                        <textarea
                            placeholder="Enter dialog text..."
                            value={line.text}
                            onChange={(e) => updateLine(line.id, 'text', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg bg-background text-sm min-h-[80px] resize-none"
                        />

                        {/* Quick Tags */}
                        <div className="flex flex-wrap gap-1">
                            {AUDIO_TAGS.slice(0, 4).map((t) => (
                                <button
                                    key={t.tag}
                                    onClick={() => insertTag(line.id, t.tag)}
                                    className="px-2 py-1 text-xs rounded border border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Add Line Button */}
            <Button
                variant="outline"
                className="w-full"
                onClick={addLine}
            >
                <Plus className="w-4 h-4 mr-2" />
                Add Speaker
            </Button>

            {/* Error Display */}
            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Generate Button */}
            <Button
                onClick={handleGenerate}
                disabled={isGenerating || lines.filter(l => l.text.trim() && l.voiceId).length < 2}
                className="w-full h-10 text-xs font-medium bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating Dialog...
                    </>
                ) : (
                    <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Dialog
                    </>
                )}
            </Button>
        </div>
    );
}

export default DialogGeneratorForm;
