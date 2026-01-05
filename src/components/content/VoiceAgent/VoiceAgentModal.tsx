'use client';

/**
 * VoiceAgentModal - Gemini Live API Voice Interface
 * 
 * Connects directly to Gemini Live API via WebSocket from the browser.
 * Uses ephemeral token from backend to keep API key secure.
 * Supports real-time bidirectional audio streaming and tool calling.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Mic, MicOff, Loader2, Volume2, Settings, ChevronDown, Video, VideoOff, Monitor, Camera, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GoogleGenAI, Modality } from '@google/genai';

// Available voices for Gemini Live API - Optimized for Social Media Strategist
export const VOICE_OPTIONS = [
  { id: 'Sulafat', name: 'Sulafat', description: 'Woman - Warm, perfect for friendly guidance' },
  { id: 'Achird', name: 'Achird', description: 'Woman - Friendly, approachable expert' },
  { id: 'Puck', name: 'Puck', description: 'Man - Upbeat, energetic & engaging' },
  { id: 'Charon', name: 'Charon', description: 'Man - Informative, strategy advisor' },
  { id: 'Aoede', name: 'Aoede', description: 'Woman - Breezy, casual & creative' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Man - Excitable, enthusiastic ideas' },
  { id: 'Sadachbia', name: 'Sadachbia', description: 'Woman - Lively, dynamic conversations' },
  { id: 'Laomedeia', name: 'Laomedeia', description: 'Woman - Upbeat, positive energy' },
  { id: 'Rasalgethi', name: 'Rasalgethi', description: 'Man - Informative, teaching mode' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', description: 'Woman - Gentle, calm guidance' },
];

// Supported languages for Gemini Live API native audio
// Note: Language detection is handled automatically by the model
const LANGUAGE_OPTIONS = [
  { id: 'en-US', name: 'English' },
  { id: 'en-IN', name: 'English (India)' },
  { id: 'hi-IN', name: 'Hindi' },
  { id: 'ur-PK', name: 'Urdu' },
  { id: 'ar-XA', name: 'Arabic' },
  { id: 'de-DE', name: 'German' },
  { id: 'es-US', name: 'Spanish' },
];

interface VoiceAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContentGenerated: (content: any) => void;
  userId: string;
  initialVoice?: string;
  initialLanguage?: string;
}

type VoiceState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'error';

interface TranscriptEntry {
  id: string;
  text: string;
  isUser: boolean;
}

// Audio Processor Worklet code
const AUDIO_PROCESSOR_WORKLET = `
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      // Convert Float32 to Int16 PCM
      const pcmData = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        pcmData[i] = Math.max(-32768, Math.min(32767, channelData[i] * 32768));
      }
      // Send the Int16 buffer to the main thread
      this.port.postMessage(pcmData.buffer, [pcmData.buffer]);
    }
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
`;

// Gemini Live WebSocket URL (Fallback if SDK not used directly)
const GEMINI_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

// Session resumption storage key
const SESSION_HANDLE_KEY = 'gemini-live-session-handle';

// Retry configuration
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// Preferred model for native audio
const PREFERRED_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

export function VoiceAgentModal({
  isOpen,
  onClose,
  onContentGenerated,
  userId,
  initialVoice = 'Sulafat',
  initialLanguage = 'en-US',
}: VoiceAgentModalProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [selectedVoice] = useState(initialVoice);
  const [selectedLanguage] = useState(initialLanguage);
  const [hasGeneratedContent, setHasGeneratedContent] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Retry and reconnection state
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showRetryButton, setShowRetryButton] = useState(false);

  // Video sharing state
  const [showVideoMenu, setShowVideoMenu] = useState(false);
  const [videoMode, setVideoMode] = useState<'none' | 'webcam' | 'screen'>('none');
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);

  // Refs for WebSocket and audio
  const sdkRef = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isActiveRef = useRef(false);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0); // For seamless audio scheduling
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]); // Track active audio sources for interruption
  const sessionHandleRef = useRef<string | null>(null); // For session resumption
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null); // For retry scheduling
  const shouldResumeRef = useRef(false); // Whether to attempt session resumption

  // Video sharing refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoFrameIntervalRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setTranscripts([]);
      setError(null);
      setVoiceState('idle');
      setStatusText('');
      setRetryCount(0);
      setShowRetryButton(false);

      // Try to load existing session handle for resumption
      const storedHandle = localStorage.getItem(SESSION_HANDLE_KEY);
      if (storedHandle) {
        sessionHandleRef.current = storedHandle;
        shouldResumeRef.current = true;
      }
    }
  }, [isOpen]);

  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Start Gemini Live session
   */
  const startSession = useCallback(async (isRetry: boolean = false) => {
    setVoiceState('connecting');
    setError(null);
    setShowRetryButton(false);
    setStatusText(isRetry ? `Reconnecting (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})...` : 'Getting credentials...');
    isActiveRef.current = true;

    try {
      // Get API credentials and config from backend
      const tokenResponse = await fetch('/api/ai/content/strategist/voice/token', {
        method: 'POST',
      });
      const tokenData = await tokenResponse.json();

      if (!tokenData.success) {
        throw new Error(tokenData.error || 'Failed to get credentials');
      }

      const { apiKey, config } = tokenData;
      // Use preferred native audio model
      const model = PREFERRED_MODEL;
      setStatusText(shouldResumeRef.current ? 'Resuming session...' : 'Connecting to Gemini...');

      // Initialize Google Gen AI SDK with v1alpha for native audio features
      const genAI = new GoogleGenAI({
        apiKey,
        httpOptions: { apiVersion: 'v1alpha' }
      });
      sdkRef.current = genAI;

      // Extract system instruction text
      const systemInstruction = config.systemInstruction?.parts?.[0]?.text || '';

      // Prepare Live API configuration using official SDK format
      const liveConfig = {
        model: `models/${model}`,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: selectedVoice
              }
            },
          },
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          tools: config.tools || [],
          // Enable Native Audio capabilities
          enableAffectiveDialog: true,
          // Enable Proactive Audio for smarter VAD and response timing
          enableProactiveAudio: true,
        },
        // Session resumption config (if we have a previous handle)
        ...(shouldResumeRef.current && sessionHandleRef.current ? {
          sessionResumptionConfig: {
            handle: sessionHandleRef.current
          }
        } : {})
      };

      // Connect using the SDK
      const session = await genAI.live.connect({
        model: liveConfig.model,
        config: liveConfig.config,
        callbacks: {
          onopen: () => {
            console.log('[Gemini Live] Connected via SDK');
            setStatusText('Ready');
            startAudioCapture();
            setVoiceState('listening');
          },
          onmessage: async (message: any) => {
            console.log('[Gemini Live] Message:', message);

            // Handle server content (audio/text response)
            if (message.serverContent) {
              const content = message.serverContent;

              // Handle VAD interruption - user started speaking, stop playback
              if (content.interrupted) {
                console.log('[Gemini Live] VAD interrupted - stopping playback');
                stopAudioPlayback();
                setVoiceState('listening');
              }

              if (content.modelTurn?.parts) {
                for (const part of content.modelTurn.parts) {
                  // Handle audio response - stream immediately
                  if (part.inlineData?.data) {
                    const audioData = base64ToArrayBuffer(part.inlineData.data);
                    scheduleAudioChunk(audioData);
                  }

                  // Handle text response
                  if (part.text) {
                    setTranscripts(prev => [
                      ...prev,
                      { id: `ai_${Date.now()}`, text: part.text, isUser: false }
                    ]);
                  }
                }
              }

              // Handle user transcript
              if (content.inputTranscript) {
                setTranscripts(prev => [
                  ...prev,
                  { id: `user_${Date.now()}`, text: content.inputTranscript, isUser: true }
                ]);
              }

              // Handle turn complete
              if (content.turnComplete) {
                if (!isPlayingRef.current) {
                  setVoiceState('listening');
                }
              }
            }

            // Handle tool calls
            if (message.toolCall) {
              await handleToolCall(message.toolCall);
            }

            // Handle session resumption update - persist to localStorage
            if (message.sessionResumptionUpdate) {
              const update = message.sessionResumptionUpdate;
              if (update.resumable && update.newHandle) {
                sessionHandleRef.current = update.newHandle;
                localStorage.setItem(SESSION_HANDLE_KEY, update.newHandle);
                console.log('[Gemini Live] Session handle saved for resumption');
              }
            }

            // Handle proactive audio events (when model decides to speak unsolicited)
            if (message.serverContent?.proactiveAudio) {
              console.log('[Gemini Live] Proactive audio received');
              // The audio data will come through the normal audio handling path
            }
          },
          onerror: (e: any) => {
            console.error('[Gemini Live] SDK Error:', e);
            handleConnectionError(e.message || 'SDK connection failed');
          },
          onclose: (e: any) => {
            console.log('[Gemini Live] SDK Closed:', e);
            if (isActiveRef.current) {
              // Attempt auto-reconnect if unexpectedly closed
              handleConnectionError('Connection closed unexpectedly');
            }
          }
        }
      });

      sessionRef.current = session;

    } catch (err: any) {
      console.error('[Gemini Live] Error starting session:', err);
      handleConnectionError(err.message || 'Failed to connect');
    }
  }, [selectedVoice, selectedLanguage, retryCount]);

  /**
   * Handle connection errors with exponential backoff retry
   */
  const handleConnectionError = useCallback((errorMessage: string) => {
    // Clear session handle if connection failed (might be stale)
    if (shouldResumeRef.current) {
      shouldResumeRef.current = false;
      localStorage.removeItem(SESSION_HANDLE_KEY);
      sessionHandleRef.current = null;
    }

    if (retryCount < MAX_RETRY_ATTEMPTS && isActiveRef.current) {
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.log(`[Gemini Live] Retry attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS} in ${delay}ms`);

      setIsRetrying(true);
      setError(`Connection failed. Retrying in ${delay / 1000}s...`);
      setVoiceState('connecting');
      setStatusText(`Retrying (${retryCount + 1}/${MAX_RETRY_ATTEMPTS})...`);

      retryTimeoutRef.current = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        startSession(true);
        setIsRetrying(false);
      }, delay);
    } else {
      // Max retries reached or user stopped
      setError(errorMessage + '. Please try again.');
      setVoiceState('error');
      setShowRetryButton(true);
      setIsRetrying(false);
    }
  }, [retryCount, startSession]);

  /**
   * Manual retry after max retries exhausted
   */
  const handleManualRetry = useCallback(() => {
    setRetryCount(0);
    shouldResumeRef.current = false;
    startSession(false);
  }, [startSession]);

  /**
   * Start audio capture and send to Gemini
   */
  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      // Create audio context for capture
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);

      // Analyser for visualization
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      startVisualization();

      // Register and initialize AudioWorklet (Modern approach)
      const workletBlob = new Blob([AUDIO_PROCESSOR_WORKLET], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(workletBlob);

      await audioContextRef.current.audioWorklet.addModule(workletUrl);
      const workletNode = new AudioWorkletNode(audioContextRef.current, 'audio-processor');
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        if (!isActiveRef.current || !sessionRef.current) return;

        const pcmBuffer = event.data;
        const base64Audio = arrayBufferToBase64(pcmBuffer);

        // Send audio to Gemini via SDK
        sessionRef.current.sendRealtimeInput({
          audio: {
            mimeType: 'audio/pcm;rate=16000',
            data: base64Audio,
          },
        });
      };

      source.connect(workletNode);
      workletNode.connect(audioContextRef.current.destination);

    } catch (err: any) {
      console.error('[Gemini Live] Error starting audio capture:', err);
      setError('Microphone access denied or audio initialization failed');
      setVoiceState('error');
    }
  };

  /**
   * Handle tool calls from Gemini
   */
  const handleToolCall = async (toolCall: any) => {
    console.log('[Gemini Live] Tool call:', toolCall);
    setVoiceState('processing');

    const functionCalls = toolCall.functionCalls || [];
    const functionResponses: any[] = [];

    for (const fc of functionCalls) {
      try {
        // Execute tool via backend
        const response = await fetch('/api/ai/content/strategist/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolName: fc.name,
            args: fc.args,
            userId,
          }),
        });

        const data = await response.json();

        if (data.success) {
          functionResponses.push({
            id: fc.id,
            name: fc.name,
            response: { result: JSON.stringify(data.result) },
          });

          // Notify parent of generated content
          if (data.result) {
            onContentGenerated(data.result);
            setHasGeneratedContent(true);
          }
        } else {
          functionResponses.push({
            id: fc.id,
            name: fc.name,
            response: { error: data.error },
          });
        }
      } catch (err: any) {
        functionResponses.push({
          id: fc.id,
          name: fc.name,
          response: { error: err.message },
        });
      }
    }

    // Send tool responses back to Gemini via SDK
    if (sessionRef.current) {
      sessionRef.current.sendToolResponse({
        functionResponses,
      });
    }

    setVoiceState('listening');
  };

  /**
   * Stop audio playback immediately (for VAD interruption)
   */
  const stopAudioPlayback = () => {
    // Stop all active audio sources
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch (e) {
        // Source may have already ended
      }
    }
    activeSourcesRef.current = [];

    // Clear the audio queue
    audioQueueRef.current = [];

    // Reset playback state
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;
  };

  /**
   * Schedule audio chunk for seamless playback (low latency streaming)
   */
  const scheduleAudioChunk = async (audioData: ArrayBuffer) => {
    try {
      // Initialize playback context at 24kHz (Gemini output rate)
      if (!playbackContextRef.current || playbackContextRef.current.state === 'closed') {
        playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
        nextPlayTimeRef.current = 0;
      }

      const ctx = playbackContextRef.current;

      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      setVoiceState('speaking');
      isPlayingRef.current = true;

      // Use DataView for proper little-endian PCM16 handling
      const dataView = new DataView(audioData);
      const numSamples = audioData.byteLength / 2;
      const float32Array = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const int16 = dataView.getInt16(i * 2, true);
        float32Array[i] = int16 / 32768;
      }

      // Create audio buffer at 24kHz
      const audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      // Create source and connect
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      // Track active source for interruption handling
      activeSourcesRef.current.push(source);

      // Schedule seamlessly - no gaps between chunks
      const now = ctx.currentTime;
      const startTime = Math.max(now, nextPlayTimeRef.current);
      nextPlayTimeRef.current = startTime + audioBuffer.duration;

      source.onended = () => {
        // Remove from active sources
        activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);

        // Check if this was the last scheduled chunk
        if (activeSourcesRef.current.length === 0) {
          isPlayingRef.current = false;
          if (isActiveRef.current) {
            setVoiceState('listening');
          }
        }
      };

      source.start(startTime);
    } catch (e) {
      console.error('[Gemini Live] Playback error:', e);
    }
  };

  /**
   * Audio visualization
   */
  const startVisualization = () => {
    const update = () => {
      if (!analyserRef.current || !isActiveRef.current) {
        setAudioLevel(0);
        return;
      }

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setAudioLevel(avg / 255);

      animationFrameRef.current = requestAnimationFrame(update);
    };
    update();
  };

  /**
   * Stop session
   */
  const stopSession = useCallback(() => {
    isActiveRef.current = false;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    sdkRef.current = null;

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => { });
      audioContextRef.current = null;
    }

    if (playbackContextRef.current) {
      playbackContextRef.current.close().catch(() => { });
      playbackContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }

    analyserRef.current = null;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;
    setVoiceState('idle');
    setAudioLevel(0);
    setStatusText('');
    setIsPaused(false);

    // Stop video capture
    if (videoFrameIntervalRef.current) {
      clearInterval(videoFrameIntervalRef.current);
      videoFrameIntervalRef.current = null;
    }
    setVideoMode('none');
    setVideoStream(null);
    setShowVideoMenu(false);

    // Cancel any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setRetryCount(0);
    setIsRetrying(false);
    setShowRetryButton(false);
  }, []);

  /**
   * Toggle pause/resume (mute/unmute microphone)
   */
  const togglePause = useCallback(() => {
    if (!mediaStreamRef.current) return;

    const audioTracks = mediaStreamRef.current.getAudioTracks();
    const newPausedState = !isPaused;

    // Mute/unmute all audio tracks
    audioTracks.forEach(track => {
      track.enabled = !newPausedState;
    });

    setIsPaused(newPausedState);

    if (newPausedState) {
      setStatusText('Paused');
      setVoiceState('processing'); // Show paused visual state
    } else {
      setStatusText('');
      setVoiceState('listening');
    }
  }, [isPaused]);

  /**
   * Start webcam capture
   */
  const startWebcam = useCallback(async () => {
    try {
      // ADK Recommendation: Request ideal resolution of 768x768
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 768 },
          height: { ideal: 768 },
          facingMode: 'user'
        }
      });
      setVideoStream(stream);
      setVideoMode('webcam');
      setShowVideoMenu(false);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Start sending video frames
      startVideoFrameCapture();
    } catch (err) {
      console.error('[Video] Webcam access failed:', err);
    }
  }, []);

  /**
   * Start screen capture
   */
  const startScreenCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setVideoStream(stream);
      setVideoMode('screen');
      setShowVideoMenu(false);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Handle stream end (user stops sharing)
      stream.getTracks().forEach(track => {
        track.addEventListener('ended', () => {
          stopVideoCapture();
        });
      });

      // Start sending video frames
      startVideoFrameCapture();
    } catch (err) {
      console.error('[Video] Screen capture failed:', err);
    }
  }, []);

  /**
   * Stop video capture
   */
  const stopVideoCapture = useCallback(() => {
    if (videoFrameIntervalRef.current) {
      clearInterval(videoFrameIntervalRef.current);
      videoFrameIntervalRef.current = null;
    }

    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setVideoMode('none');
  }, [videoStream]);

  /**
   * Start capturing and sending video frames to Gemini
   */
  const startVideoFrameCapture = useCallback(() => {
    if (videoFrameIntervalRef.current) {
      clearInterval(videoFrameIntervalRef.current);
    }

    // Send frames every 1 second (1 FPS) as per ADK recommended maximum
    videoFrameIntervalRef.current = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const session = sessionRef.current;

      if (!video || !canvas || !session) {
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // ADK Recommendation: 768px resolution for optimal processing
      const MAX_DIMENSION = 768;
      let width = video.videoWidth;
      let height = video.videoHeight;

      if (width > height) {
        if (width > MAX_DIMENSION) {
          height = (height * MAX_DIMENSION) / width;
          width = MAX_DIMENSION;
        }
      } else {
        if (height > MAX_DIMENSION) {
          width = (width * MAX_DIMENSION) / height;
          height = MAX_DIMENSION;
        }
      }

      canvas.width = width;
      canvas.height = height;

      if (canvas.width > 0 && canvas.height > 0) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // ADK Recommendation: Use 0.85 quality for optimal detail/bandwidth balance
        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        const data = base64.slice(base64.indexOf(',') + 1);

        // Send video frame to Gemini Live API via SDK - Using official mediaChunks format
        if (sessionRef.current) {
          sessionRef.current.sendRealtimeInput({
            mediaChunks: [{
              mimeType: 'image/jpeg',
              data: data
            }]
          });
          console.log(`[Video] Frame sent via SDK (${width}x${height} @ 1 FPS)`);
        }
      }
    }, 1000); // 1 FPS as per ADK recommendation
  }, []);

  // Helper: Base64 to ArrayBuffer
  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // Helper: ArrayBuffer to Base64
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const handleClose = () => {
    stopSession();
    onClose();
  };

  // Auto-start session when modal opens
  useEffect(() => {
    if (isOpen && voiceState === 'idle') {
      startSession();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Get status text
  const getStatusText = () => {
    switch (voiceState) {
      case 'idle': return 'Ready';
      case 'connecting': return 'Connecting...';
      case 'listening': return 'Listening...';
      case 'processing': return 'Processing...';
      case 'speaking': return 'Speaking...';
      case 'error': return 'Error';
      default: return '';
    }
  };

  const isActive = voiceState === 'listening' || voiceState === 'speaking' || voiceState === 'processing' || voiceState === 'connecting';

  // Get shadow color based on state
  const getShadowColor = () => {
    switch (voiceState) {
      case 'speaking': return 'rgba(139, 92, 246, 0.6)';
      case 'listening': return 'rgba(59, 130, 246, 0.6)';
      case 'processing': return 'rgba(245, 158, 11, 0.6)';
      case 'connecting': return 'rgba(249, 115, 22, 0.6)';
      case 'error': return 'rgba(239, 68, 68, 0.6)';
      default: return 'rgba(59, 130, 246, 0.5)';
    }
  };

  // Determine if orb should be centered (active conversation, no content yet)
  const shouldCenter = isActive && !hasGeneratedContent;
  const orbSize = shouldCenter ? 'w-40 h-40' : 'w-20 h-20';
  const iconSize = shouldCenter ? 'h-16 w-16' : 'h-9 w-9';
  const statusSize = shouldCenter ? 'text-base' : 'text-xs';

  return (
    <div className={`fixed z-50 transition-all duration-500 ease-in-out ${shouldCenter
      ? 'inset-0 flex items-center justify-center'
      : 'bottom-8 right-8'
      }`}>
      <div className={`relative flex flex-col items-center ${shouldCenter ? 'gap-3' : 'gap-3'}`}>
        {/* Voice orb - click to toggle start/stop */}
        <div className={`relative ${isActive ? 'animate-pulse-glow' : ''}`}>
          {isActive && (
            <>
              <div
                className={`absolute rounded-full border-2 animate-orb-ring pointer-events-none ${shouldCenter ? '-inset-8 border-cyan-400/50 dark:border-cyan-300/40' : '-inset-3 border-cyan-400/50 dark:border-cyan-300/40'}`}
                style={{ '--ring-delay': '0ms', boxShadow: '0 0 25px rgba(159, 72, 52, 0.93), 0 0 50px rgba(190, 60, 46, 0.97)' } as any}
              />
              <div
                className={`absolute rounded-full border-2 animate-orb-ring pointer-events-none ${shouldCenter ? '-inset-16 border-blue-400/35 dark:border-blue-300/25' : '-inset-6 border-blue-400/35 dark:border-blue-300/25'}`}
                style={{ '--ring-delay': '800ms', boxShadow: '0 0 20px rgba(99, 171, 79, 0.91), 0 0 40px rgba(77, 175, 50, 0.63)' } as any}
              />
              {shouldCenter && (
                <div
                  className="absolute -inset-24 rounded-full border border-indigo-400/20 dark:border-indigo-300/15 animate-orb-ring pointer-events-none"
                  style={{ '--ring-delay': '1600ms', boxShadow: '0 0 15px rgba(99, 111, 215, 0.84), 0 0 30px rgba(63, 109, 190, 0.75)' } as any}
                />
              )}
            </>
          )}

          <button
            onClick={() => {
              if (voiceState === 'idle' || voiceState === 'error') {
                startSession();
              } else {
                // Toggle pause/resume (mute/unmute mic)
                togglePause();
              }
            }}
            className={`${orbSize} rounded-full flex items-center justify-center transition-all duration-500 cursor-pointer ${voiceState === 'idle' ? 'bg-gradient-to-br from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600'
              : voiceState === 'connecting' ? 'bg-gradient-to-br from-orange-500 to-amber-500'
                : isPaused ? 'bg-gradient-to-br from-gray-500 to-slate-400'
                  : voiceState === 'listening' ? 'bg-gradient-to-br from-blue-500 to-cyan-300'
                    : voiceState === 'processing' ? 'bg-gradient-to-br from-amber-500 to-yellow-300'
                      : voiceState === 'speaking' ? 'bg-gradient-to-br from-violet-500 to-purple-300'
                        : 'bg-gradient-to-br from-red-500 to-rose-500'
              }`}
            style={{
              transform: `scale(${1 + audioLevel * 0.2})`,
            }}
          >
            {voiceState === 'connecting' ? (
              <Loader2 className={`${iconSize} text-white animate-spin`} />
            ) : isPaused ? (
              <MicOff className={`${iconSize} text-white`} />
            ) : voiceState === 'processing' ? (
              <Loader2 className={`${iconSize} text-white animate-spin`} />
            ) : voiceState === 'speaking' ? (
              <Volume2 className={`${iconSize} text-white animate-pulse`} />
            ) : voiceState === 'error' ? (
              <MicOff className={`${iconSize} text-white`} />
            ) : (
              <Mic className={`${iconSize} text-white`} />
            )}
          </button>
        </div>

        {/* Camera button - only show when voice is active */}
        {isActive && (
          <div className="relative">
            <button
              onClick={() => {
                if (videoMode !== 'none') {
                  stopVideoCapture();
                } else {
                  setShowVideoMenu(!showVideoMenu);
                }
              }}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 shadow-md ${videoMode !== 'none'
                ? 'bg-gradient-to-br from-green-500 to-emerald-500 text-white'
                : 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600'
                }`}
              title={videoMode !== 'none' ? 'Stop sharing' : 'Share video'}
            >
              {videoMode !== 'none' ? (
                <div className="relative">
                  <VideoOff className="h-4 w-4" />
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                </div>
              ) : (
                <Video className="h-4 w-4" />
              )}
            </button>

            {/* Video options dropdown */}
            {showVideoMenu && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[140px] z-50">
                <button
                  onClick={startScreenCapture}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  <Monitor className="h-4 w-4" />
                  Share Screen
                </button>
                <button
                  onClick={startWebcam}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  <Camera className="h-4 w-4" />
                  Webcam
                </button>
              </div>
            )}
          </div>
        )}

        {/* Status text with X button */}
        <div className="flex items-center gap-2 relative z-50">
          <span className={`${shouldCenter ? 'text-xs font-normal' : statusSize + ' font-medium'} transition-all duration-500 ${voiceState === 'listening' ? 'text-blue-700 dark:text-blue-300'
            : voiceState === 'speaking' ? 'text-violet-700 dark:text-violet-300'
              : voiceState === 'processing' ? 'text-amber-700 dark:text-amber-300'
                : voiceState === 'connecting' ? 'text-orange-700 dark:text-orange-300'
                  : voiceState === 'error' ? 'text-red-700 dark:text-red-300'
                    : 'text-gray-700 dark:text-gray-300'
            }`}>
            {getStatusText()}
          </span>

          {/* Retry button - shown when max retries exhausted */}
          {showRetryButton && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleManualRetry();
              }}
              className="w-6 h-6 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition-colors cursor-pointer shadow-md z-50"
              title="Retry connection"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            className={`${shouldCenter ? 'w-6 h-6' : 'w-4 h-4'} rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors cursor-pointer shadow-md z-50`}
            title="Stop session"
          >
            <X className={`${shouldCenter ? 'h-3 w-3' : 'h-2.5 w-2.5'}`} />
          </button>
        </div>
      </div>


      {/* Pulsing glow animation styles */}
      <style jsx>{`
        @keyframes pulse-glow {
          0%, 100% { 
            filter: brightness(1);
          }
          50% { 
            filter: brightness(1.1);
          }
        }
        @keyframes orb-ring {
          0% {
            transform: scale(0.85);
            opacity: 0;
          }
          30% {
            opacity: 0.6;
          }
          100% {
            transform: scale(1.4);
            opacity: 0;
          }
        }
        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
        .animate-orb-ring {
          animation: orb-ring 2.5s ease-out infinite;
          animation-delay: var(--ring-delay, 0ms);
        }
      `}</style>

      {/* Hidden video element for capturing frames */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="hidden"
      />

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Video preview - small thumbnail when sharing */}
      {videoMode !== 'none' && videoStream && (
        <div className="fixed bottom-4 right-4 w-32 h-24 rounded-lg overflow-hidden shadow-lg border-2 border-green-500 z-50">
          <video
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            ref={(el) => {
              if (el && videoStream) {
                el.srcObject = videoStream;
              }
            }}
          />
          <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-green-500 text-white text-[10px] rounded font-medium">
            {videoMode === 'screen' ? 'Screen' : 'Camera'}
          </div>
        </div>
      )}
    </div>
  );
}
