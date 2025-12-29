'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
    Mic,
    Upload,
    Loader2,
    AlertCircle,
    Check,
    Trash2,
    Play,
    Square,
    Volume2,
} from 'lucide-react';
import { validation, parseAudioError, formatErrorMessage, createTimeoutController } from './utils/errorHandling';

// ============================================================================
// TYPES
// ============================================================================

interface VoiceCloningFormProps {
    onVoiceCreated: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function VoiceCloningForm({ onVoiceCreated }: VoiceCloningFormProps) {
    // Audio state
    const [audioBase64, setAudioBase64] = useState<string | null>(null);
    const [audioFileName, setAudioFileName] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);

    // Form state
    const [voiceName, setVoiceName] = useState('');
    const [description, setDescription] = useState('');
    const [removeNoise, setRemoveNoise] = useState(false);

    // UI state
    const [isCloning, setIsCloning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Refs
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Handle file upload
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('audio/')) {
            setError('Please upload an audio file (MP3, WAV, etc.)');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = (event.target?.result as string).split(',')[1];
            setAudioBase64(base64);
            setAudioFileName(file.name);
            setError(null);
        };
        reader.readAsDataURL(file);
    };

    // Start recording
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onload = (event) => {
                    const base64 = (event.target?.result as string).split(',')[1];
                    setAudioBase64(base64);
                    setAudioFileName('Recording');
                };
                reader.readAsDataURL(audioBlob);

                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);

            timerRef.current = setInterval(() => {
                setRecordingTime(t => t + 1);
            }, 1000);
        } catch (err) {
            setError('Could not access microphone. Please check permissions.');
        }
    };

    // Stop recording
    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        }
    };

    // Clear audio
    const clearAudio = () => {
        setAudioBase64(null);
        setAudioFileName(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Format time
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Clone voice
    const handleClone = useCallback(async () => {
        setError(null);

        // Validation
        const audioValidation = validation.audioFile(audioBase64);
        if (!audioValidation.valid) {
            setError(audioValidation.error);
            return;
        }

        const nameValidation = validation.name(voiceName);
        if (!nameValidation.valid) {
            setError(nameValidation.error);
            return;
        }

        setIsCloning(true);

        try {
            const { controller, timeoutId } = createTimeoutController(180000); // 3min for cloning

            const response = await fetch('/api/ai/media/audio/voice-cloning', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: voiceName,
                    description,
                    audioBase64,
                    removeBackgroundNoise: removeNoise,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const data = await response.json().catch(() => ({ error: `Server error (${response.status})` }));
                throw new Error(data.error || 'Failed to clone voice');
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to clone voice');
            }

            setSuccess(`✅ Voice "${voiceName}" cloned successfully!`);
            setTimeout(() => setSuccess(null), 3000);

            // Reset form
            setAudioBase64(null);
            setAudioFileName(null);
            setVoiceName('');
            setDescription('');
            setError(null);

            onVoiceCreated();
        } catch (err) {
            const audioError = parseAudioError(err);
            setError(formatErrorMessage(audioError));
        } finally {
            setIsCloning(false);
        }
    }, [audioBase64, voiceName, description, removeNoise, onVoiceCreated]);

    return (
        <div className="space-y-6">

            {/* Instructions */}
            <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-lg text-sm space-y-2">
                <p className="font-medium text-indigo-600">For best results:</p>
                <ul className="text-muted-foreground space-y-1 text-xs">
                    <li>• Provide at least 1 minute of clear audio</li>
                    <li>• Use a quiet environment with no background noise</li>
                    <li>• Speak naturally and consistently</li>
                    <li>• Avoid music or other voices in the background</li>
                </ul>
            </div>

            {/* Audio Input Area */}
            <div className="space-y-4">
                <label className="text-sm font-medium">Voice Sample</label>

                {!audioBase64 ? (
                    <div className="grid grid-cols-2 gap-4">
                        {/* Upload Button */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-8 border-2 border-dashed rounded-xl hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all flex flex-col items-center gap-3"
                        >
                            <div className="w-14 h-14 rounded-full bg-indigo-500/10 flex items-center justify-center">
                                <Upload className="w-6 h-6 text-indigo-500" />
                            </div>
                            <div className="text-center">
                                <p className="font-medium">Upload Audio</p>
                                <p className="text-xs text-muted-foreground">MP3, WAV, M4A</p>
                            </div>
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="audio/*"
                            onChange={handleFileUpload}
                            className="hidden"
                        />

                        {/* Record Button */}
                        <button
                            onClick={isRecording ? stopRecording : startRecording}
                            className={`p-8 border-2 rounded-xl transition-all flex flex-col items-center gap-3 ${isRecording
                                ? 'border-red-500 bg-red-500/5'
                                : 'border-dashed hover:border-indigo-500/50 hover:bg-indigo-500/5'
                                }`}
                        >
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-indigo-500/10'
                                }`}>
                                {isRecording ? (
                                    <Square className="w-6 h-6 text-white" />
                                ) : (
                                    <Mic className="w-6 h-6 text-indigo-500" />
                                )}
                            </div>
                            <div className="text-center">
                                {isRecording ? (
                                    <>
                                        <p className="font-medium text-red-500">Recording...</p>
                                        <p className="text-sm text-red-500">{formatTime(recordingTime)}</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="font-medium">Start Recording</p>
                                        <p className="text-xs text-muted-foreground">Click to record</p>
                                    </>
                                )}
                            </div>
                        </button>
                    </div>
                ) : (
                    /* Audio Preview */
                    <div className="p-4 border rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
                                <Volume2 className="w-5 h-5 text-indigo-500" />
                            </div>
                            <div>
                                <p className="font-medium">{audioFileName}</p>
                                <p className="text-xs text-muted-foreground">Audio ready</p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-red-500"
                            onClick={clearAudio}
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                )}
            </div>

            {/* Voice Name */}
            <div className="space-y-2">
                <label className="text-sm font-medium">Voice Name</label>
                <input
                    type="text"
                    placeholder="My Custom Voice"
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    className="w-full px-4 py-2.5 border rounded-lg bg-background"
                    maxLength={100}
                />
            </div>

            {/* Description */}
            <div className="space-y-2">
                <label className="text-sm font-medium">Description (Optional)</label>
                <input
                    type="text"
                    placeholder="A brief description of this voice..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-4 py-2.5 border rounded-lg bg-background"
                    maxLength={500}
                />
            </div>

            {/* Remove Noise Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                    <p className="font-medium text-sm">Remove Background Noise</p>
                    <p className="text-xs text-muted-foreground">
                        Use AI to clean up the audio (only if needed)
                    </p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={removeNoise}
                    onClick={() => setRemoveNoise(!removeNoise)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${removeNoise ? 'bg-indigo-500' : 'bg-muted'
                        }`}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${removeNoise ? 'translate-x-6' : 'translate-x-1'
                            }`}
                    />
                </button>
            </div>

            {/* Error/Success Messages */}
            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}
            {success && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600 text-sm">
                    <Check className="w-4 h-4 flex-shrink-0" />
                    {success}
                </div>
            )}

            {/* Clone Button */}
            <Button
                onClick={handleClone}
                disabled={isCloning || !audioBase64 || !voiceName.trim()}
                className="w-full h-10 text-xs font-medium bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600"
            >
                {isCloning ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Cloning Voice...
                    </>
                ) : (
                    <>
                        <Mic className="w-4 h-4 mr-2" />
                        Clone Voice
                    </>
                )}
            </Button>
        </div>
    );
}

export default VoiceCloningForm;
