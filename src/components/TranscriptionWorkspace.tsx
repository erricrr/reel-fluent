"use client";

import type * as React from 'react';
import { useState, useEffect, useRef, useCallback } from "react";
import VideoPlayer, { type VideoPlayerRef } from "./VideoPlayer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, FileDiff, Languages, PlayIcon, PauseIcon, Mic, Lock, Unlock, SkipBack, SkipForward, Scissors, Eye, Save, List } from "lucide-react";
import ClipNavigation from "./ClipNavigation";
import ClipDurationSelector from "./ClipDurationSelector";
import ClipTrimmer from "./ClipTrimmer";
import TranslationLanguageSelector from "./TranslationLanguageSelector";
import type { Clip } from '@/lib/videoUtils';
import type { CorrectionToken } from '@/ai/flows/compare-transcriptions-flow';
import { useToast } from "@/hooks/use-toast";
import { getLanguageLabel } from "@/lib/languageOptions";
import { cn } from "@/lib/utils";

interface TranscriptionWorkspaceProps {
  currentClip: Clip;
  clips: Clip[];
  mediaSrc?: string;
  currentClipIndex: number;
  onSelectClip: (index: number) => void;
  onTranscribeAudio: (clipId: string) => Promise<void>;
  onGetCorrections: (clipId: string) => Promise<void>;
  onTranslate: (clipId: string, targetLanguage: string) => Promise<void>;
  onRemoveClip: (clipId: string) => void;
  onUserTranscriptionChange: (clipId: string, newUserTranscription: string) => void;
  isYouTubeVideo: boolean;
  language: string;
  isAudioSource?: boolean;
  clipSegmentationDuration: number;
  onClipDurationChange: (duration: string) => void;
  isLoadingMedia: boolean;
  isSavingMedia: boolean;
  isAnyClipTranscribing: boolean;
  // Focused clip functionality
  mediaDuration?: number;
  focusedClip?: Clip | null;
  showClipTrimmer?: boolean;
  onCreateFocusedClip?: (startTime: number, endTime: number) => void;
  onToggleClipTrimmer?: () => void;
  onBackToAutoClips?: () => void;
  onSaveToSession: () => void;
  canSaveToSession: boolean;
}

// Character threshold constants
const MIN_CHAR_THRESHOLD = 15;

// Helper function to determine if AI tools should be enabled
const shouldEnableAITools = (userInput: string, automatedTranscription?: string | null): boolean => {
  const hasMinimumUserInput = userInput.trim().length >= MIN_CHAR_THRESHOLD;

  // AI tools unlock ONLY when user has typed enough characters
  // Automated transcription availability should not unlock AI tools
  return hasMinimumUserInput;
};

const formatSecondsToMMSS = (totalSeconds: number): string => {
  if (!isFinite(totalSeconds) || totalSeconds < 0) {
    return "--:--";
  }
  try {
    const date = new Date(0);
    date.setSeconds(totalSeconds);
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } catch (e) {
    console.error("Error formatting seconds to MM:SS:", totalSeconds, e);
    return "!!:!!";
  }
};

// Three dots loader component
const ThreeDotsLoader = ({ className = "" }: { className?: string }) => (
  <div className={`flex justify-center space-x-1 ${className}`}>
    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
  </div>
);

// Mobile browser detection (same as in videoUtils.ts)
const isMobileBrowser = (): boolean => {
  if (typeof window === 'undefined') return false;

  const userAgent = navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isTablet = /ipad|android(?!.*mobile)/i.test(userAgent);

  return isMobile || isTablet;
};

// Add this component before the main TranscriptionWorkspace component
const MediaControls = ({
  effectiveClip,
  currentPlaybackTime,
  isCurrentClipPlaying,
  isLooping,
  setIsLooping,
  playbackRate,
  handleSeek,
  handlePlaybackRateChange,
  skipBackward,
  skipForward,
  togglePlayPause,
  disableTextarea,
  mediaSrc,
  currentClipIndex,
  focusedClip,
}: {
  effectiveClip: Clip;
  currentPlaybackTime: number;
  isCurrentClipPlaying: boolean;
  isLooping: boolean;
  setIsLooping: (value: boolean) => void;
  playbackRate: number;
  handleSeek: (value: number[]) => void;
  handlePlaybackRateChange: (value: string) => void;
  skipBackward: () => void;
  skipForward: () => void;
  togglePlayPause: () => void;
  disableTextarea: boolean;
  mediaSrc?: string;
  currentClipIndex: number;
  focusedClip?: Clip | null;
}) => (
  <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
    {/* Timeline Controls Header */}
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-0">
      <span className="text-sm font-medium text-foreground">
        {isCurrentClipPlaying ? "Playing" : "Paused"} - {focusedClip ? "Focused Clip" : `Clip ${currentClipIndex + 1}`}
      </span>
      <span className="text-sm font-mono text-primary">
        {formatSecondsToMMSS(Math.max(effectiveClip.startTime, currentPlaybackTime))} / {formatSecondsToMMSS(effectiveClip.endTime)}
      </span>
    </div>

    {/* Timeline Slider */}
    <div className="space-y-2">
      <Slider
        value={[Math.max(effectiveClip.startTime, currentPlaybackTime)]}
        onValueChange={handleSeek}
        min={effectiveClip.startTime}
        max={effectiveClip.endTime}
        step={0.1}
        className="w-full"
        disabled={disableTextarea || !mediaSrc}
      />
    </div>

    {/* Transport Controls */}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      {/* Mobile: Top row with Loop and Speed, Desktop: Left side with Loop */}
      <div className="flex items-center justify-between sm:justify-start sm:space-x-2">
        <div className="flex items-center space-x-2">
          <Checkbox
            id={`loop-toggle-${effectiveClip.id}`}
            checked={isLooping}
            onCheckedChange={(checked) => setIsLooping(Boolean(checked))}
            disabled={disableTextarea || !mediaSrc}
          />
          <Label htmlFor={`loop-toggle-${effectiveClip.id}`} className="text-sm font-normal text-muted-foreground">
            Loop
          </Label>
        </div>

        {/* Speed selector - shows on mobile top row, hidden on desktop (will show in right section) */}
        <div className="flex items-center space-x-2 sm:hidden">
          <Select
            value={playbackRate.toString()}
            onValueChange={handlePlaybackRateChange}
            disabled={disableTextarea || !mediaSrc}
          >
            <SelectTrigger className="w-20 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.25">0.25x</SelectItem>
              <SelectItem value="0.5">0.5x</SelectItem>
              <SelectItem value="0.75">0.75x</SelectItem>
              <SelectItem value="1">1x</SelectItem>
              <SelectItem value="1.25">1.25x</SelectItem>
              <SelectItem value="1.5">1.5x</SelectItem>
              <SelectItem value="1.75">1.75x</SelectItem>
              <SelectItem value="2">2x</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mobile: Bottom row with play controls, Desktop: Center with play controls */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={skipBackward}
          disabled={disableTextarea || !mediaSrc}
          aria-label="Skip back 5 seconds"
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={togglePlayPause}
          disabled={disableTextarea || !mediaSrc}
          aria-label={isCurrentClipPlaying ? "Pause clip" : "Play clip"}
          className="px-4"
        >
          {isCurrentClipPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={skipForward}
          disabled={disableTextarea || !mediaSrc}
          aria-label="Skip forward 5 seconds"
        >
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>

      {/* Desktop only: Right side with speed selector */}
      <div className="hidden sm:flex items-center space-x-2">
        <span className="text-xs text-muted-foreground">Speed</span>
        <Select
          value={playbackRate.toString()}
          onValueChange={handlePlaybackRateChange}
          disabled={disableTextarea || !mediaSrc}
        >
          <SelectTrigger className="w-20 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0.25">0.25x</SelectItem>
            <SelectItem value="0.5">0.5x</SelectItem>
            <SelectItem value="0.75">0.75x</SelectItem>
            <SelectItem value="1">1x</SelectItem>
            <SelectItem value="1.25">1.25x</SelectItem>
            <SelectItem value="1.5">1.5x</SelectItem>
            <SelectItem value="1.75">1.75x</SelectItem>
            <SelectItem value="2">2x</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  </div>
);

export default function TranscriptionWorkspace({
  currentClip,
  clips,
  mediaSrc,
  currentClipIndex,
  onSelectClip,
  onTranscribeAudio,
  onGetCorrections,
  onTranslate,
  onRemoveClip,
  onUserTranscriptionChange,
  isYouTubeVideo,
  language,
  isAudioSource = false,
  clipSegmentationDuration,
  onClipDurationChange,
  isLoadingMedia,
  isSavingMedia,
  isAnyClipTranscribing,
  // Focused clip functionality
  mediaDuration = 0,
  focusedClip = null,
  showClipTrimmer = false,
  onCreateFocusedClip,
  onToggleClipTrimmer,
  onBackToAutoClips,
  onSaveToSession,
  canSaveToSession,
}: TranscriptionWorkspaceProps) {
  const [userTranscriptionInput, setUserTranscriptionInput] = useState(currentClip.userTranscription || "");
  const [activeTab, setActiveTab] = useState<string>("manual");
  const [hasUserManuallyChangedTab, setHasUserManuallyChangedTab] = useState(false);
  const { toast } = useToast();
  const videoPlayerRef = useRef<VideoPlayerRef>(null);
  const [isCurrentClipPlaying, setIsCurrentClipPlaying] = useState(false);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(currentClip?.startTime || 0);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [translationTargetLanguage, setTranslationTargetLanguage] = useState("english");

  // Preview clip state
  const [previewClip, setPreviewClip] = useState<{ startTime: number; endTime: number } | null>(null);

  // Stable callback for media time updates to prevent remount flicker
  const handlePlayerTimeUpdate = useCallback((time: number) => {
    setCurrentPlaybackTime(time);
  }, []);

  useEffect(() => {
    setUserTranscriptionInput(currentClip.userTranscription || "");
  }, [currentClip]);

  // Custom tab change handler to track manual user interactions
  const handleTabChange = useCallback((newTab: string) => {
    setActiveTab(newTab);
    setHasUserManuallyChangedTab(true);
  }, []);

  // Reset manual tab change tracking when switching clips
  useEffect(() => {
    setHasUserManuallyChangedTab(false);
  }, [currentClip.id]);

  // Separate useEffect for tab switching logic to avoid circular dependencies
  useEffect(() => {
    // Only auto-switch tabs if the user hasn't manually changed them
    if (hasUserManuallyChangedTab) {
      // If user manually changed tabs, only force them back to manual if AI tools are disabled
      // and they're currently on the AI tab (to prevent getting stuck)
      const shouldForceToManual = activeTab === "ai" &&
        !shouldEnableAITools(userTranscriptionInput, currentClip.automatedTranscription);

      if (shouldForceToManual) {
        setActiveTab("manual");
        setHasUserManuallyChangedTab(false); // Reset so they can try again later
      }
      return;
    }

    // No auto-switching to AI tab - user must manually switch after typing 15+ characters
  }, [activeTab, userTranscriptionInput, hasUserManuallyChangedTab, currentClip.automatedTranscription]);

  // Separate useEffect for resetting playback time only when clip changes
  useEffect(() => {
    setCurrentPlaybackTime(currentClip?.startTime || 0);
    setPlaybackRate(1.0); // Reset to normal speed when switching clips
  }, [currentClip.id]); // Only run when clip ID changes

  // Poll for current time continuously (less frequent to avoid interference)
  useEffect(() => {
    if (!videoPlayerRef.current) {
      return;
    }

    const interval = setInterval(() => {
      if (videoPlayerRef.current) {
        const currentTime = videoPlayerRef.current.getCurrentTime();
        setCurrentPlaybackTime(currentTime);
      }
    }, 500); // Update every 500ms - much less frequent than onTimeUpdate

    return () => clearInterval(interval);
  }, [isCurrentClipPlaying, currentClip?.startTime]); // Keep original dependencies to maintain array size

  const handleUserInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setUserTranscriptionInput(newValue);
    onUserTranscriptionChange(currentClip.id, newValue);
  };

  const handleTranscribe = async () => {
    if (!currentClip || (isAudioSource && !mediaSrc)) {
      toast({variant: "destructive", title: "Cannot Transcribe", description: "Please ensure media is loaded and a clip is selected."});
      return;
    }
    try {
      await onTranscribeAudio(currentClip.id);
    } catch (error) {
      console.warn("Transcription error in workspace:", error);
    }
  };

  const handleTranslate = async () => {
    if (!currentClip.automatedTranscription || currentClip.automatedTranscription.startsWith("Error:") || currentClip.automatedTranscription === "Transcribing...") {
      toast({variant: "destructive", title: "Cannot Translate", description: "Please ensure automated transcription is successful first."});
      return;
    }
    try {
      await onTranslate(currentClip.id, translationTargetLanguage);
    } catch (error) {
      console.warn("Translation error in workspace:", error);
    }
  };

  const handleCorrections = async () => {
    if (!userTranscriptionInput.trim() || !currentClip.automatedTranscription || currentClip.automatedTranscription.startsWith("Error:")) {
      toast({variant: "destructive", title: "Cannot Show Corrections", description: "Please ensure automated transcription is successful and you've entered your transcription."});
      return;
    }
     if (currentClip.automatedTranscription === "Transcribing...") {
      toast({variant: "destructive", title: "Processing...", description: "Transcription for this clip is in progress. Please wait."});
      return;
    }
    try {
      await onGetCorrections(currentClip.id);
    } catch (error) {
      console.warn("Corrections error in workspace:", error);
    }
  };

  const togglePlayPause = () => {
    if (!videoPlayerRef.current) return;
    if (videoPlayerRef.current.getIsPlaying()) {
      videoPlayerRef.current.pause();
    } else {
      videoPlayerRef.current.play();
    }
  };

  const handleSeek = (value: number[]) => {
    if (!videoPlayerRef.current || value.length === 0) return;
    const seekTime = value[0];
    videoPlayerRef.current.seek(seekTime);
    setCurrentPlaybackTime(seekTime);
  };

  const skipBackward = () => {
    if (!videoPlayerRef.current) return;
    const currentTime = videoPlayerRef.current.getCurrentTime();
    const newTime = Math.max(effectiveClip.startTime, currentTime - 5); // Skip back 5 seconds
    videoPlayerRef.current.seek(newTime);
    setCurrentPlaybackTime(newTime);
  };

  const skipForward = () => {
    if (!videoPlayerRef.current) return;
    const currentTime = videoPlayerRef.current.getCurrentTime();
    const newTime = Math.min(effectiveClip.endTime, currentTime + 5); // Skip forward 5 seconds
    videoPlayerRef.current.seek(newTime);
    setCurrentPlaybackTime(newTime);
  };

  const handlePlaybackRateChange = (value: string) => {
    const rate = parseFloat(value);
    setPlaybackRate(rate);
    if (videoPlayerRef.current) {
      videoPlayerRef.current.setPlaybackRate(rate);
    }
  };

  // Helper function to get translation for current target language
  const getTranslationForCurrentTarget = (): string | null | undefined => {
    // If target language is english and we have the legacy englishTranslation field, use it
    if (translationTargetLanguage === 'english' && currentClip.englishTranslation !== undefined) {
      return currentClip.englishTranslation;
    }

    // If we have a translation and it matches our target language, use it
    if (currentClip.translation !== undefined && currentClip.translationTargetLanguage === translationTargetLanguage) {
      return currentClip.translation;
    }

    // No translation available for current target
    return null;
  };

  // Handle preview clip start
  const handlePreviewClip = useCallback((startTime: number, endTime: number) => {
    setPreviewClip({ startTime, endTime });
    // Start playing the preview
    setTimeout(() => {
      if (videoPlayerRef.current) {
        videoPlayerRef.current.play();
      }
    }, 100);
  }, []);

  // Handle preview clip stop
  const handleStopPreview = useCallback(() => {
    setPreviewClip(null);
    if (videoPlayerRef.current) {
      videoPlayerRef.current.pause();
    }
  }, []);

  // Determine which clip times to use for the VideoPlayer
  const effectiveClip = previewClip ? { ...currentClip, startTime: previewClip.startTime, endTime: previewClip.endTime } : currentClip;

  if (!currentClip) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p>Load a video or audio file and ensure clips are generated to begin.</p>
      </div>
    );
  }

  const isAutomatedTranscriptionError = currentClip.automatedTranscription && (currentClip.automatedTranscription.startsWith("Error:"));
  const isAutomatedTranscriptionLoading = currentClip.automatedTranscription === "Transcribing...";
  const isTranslationLoading = currentClip.englishTranslation === "Translating..." || currentClip.translation === "Translating...";
  const isCorrectionsLoading = Array.isArray(currentClip.comparisonResult) && currentClip.comparisonResult.length === 1 && currentClip.comparisonResult[0].token === "Comparing...";

  // Character threshold logic
  const currentCharCount = userTranscriptionInput.trim().length;
  const aiToolsEnabled = shouldEnableAITools(userTranscriptionInput, currentClip.automatedTranscription);
  const remainingChars = Math.max(0, MIN_CHAR_THRESHOLD - currentCharCount);

  const canGetCorrections = userTranscriptionInput.trim() && currentClip.automatedTranscription && !isAutomatedTranscriptionError;
  const canTranslate = currentClip.automatedTranscription && !isAutomatedTranscriptionError && !isAutomatedTranscriptionLoading;

  const disableTextarea = isLoadingMedia || isSavingMedia;
  const disableCurrentClipAIActions = isAutomatedTranscriptionLoading || isLoadingMedia || isSavingMedia;


  const renderCorrectionToken = (token: CorrectionToken, index: number) => {
    let userTokenStyle = "";
    let suggestionSpan: React.ReactNode = null;

    switch (token.status) {
      case 'correct':
        userTokenStyle = "text-green-600 dark:text-green-400";
        break;
      case 'incorrect':
        userTokenStyle = "text-red-600 dark:text-red-400 line-through";
        if (token.suggestion) {
          suggestionSpan = <span className="text-green-600 dark:text-green-400"> {token.suggestion}</span>;
        }
        break;
      case 'extra':
        userTokenStyle = "text-blue-600 dark:text-blue-400 opacity-80 italic";
        break;
      case 'missing':
         userTokenStyle = "text-gray-500 dark:text-gray-400 opacity-70";
        break;
      default:
        break;
    }

    let displayToken = token.token;
    if (token.status === 'extra') displayToken = `+${token.token}`;
    if (token.status === 'missing') displayToken = `[${token.token}]`;

    return (
      <span key={index}>
        <span className={userTokenStyle}>{displayToken}</span>
        {suggestionSpan}
        {' '}
      </span>
    );
  };


  return (
    <TooltipProvider>
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 p-3 sm:p-4 md:p-6">
        <div className="lg:w-1/2 w-full space-y-4">
          <VideoPlayer
            ref={videoPlayerRef}
            src={mediaSrc}
            startTime={effectiveClip.startTime}
            endTime={effectiveClip.endTime}
            onTimeUpdate={handlePlayerTimeUpdate}
            onPlaybackRateChange={setPlaybackRate}
            playbackRate={playbackRate}
            className="shadow-lg rounded-lg"
            isAudioSource={isAudioSource}
            currentClipIndex={currentClipIndex}
            onPlayStateChange={setIsCurrentClipPlaying}
            isLooping={isLooping}
          />

          {/* Clip Controls - Show different UI based on focused clip mode */}
          {focusedClip ? (
            <div className="space-y-4">
              {/* Focused Clip Info */}
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-primary flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Focused Clip Mode
                  </span>
                  {onBackToAutoClips && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onBackToAutoClips}
                      disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
                    >
                      Back to Auto Clips
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Working on your custom clip: {formatSecondsToMMSS(focusedClip.startTime)} - {formatSecondsToMMSS(focusedClip.endTime)}
                </p>
              </div>

              {/* Save to Session Button */}
              <div className="flex gap-2">
                <Button
                  onClick={onSaveToSession}
                  disabled={!canSaveToSession || disableTextarea}
                  variant="secondary"
                  className="flex-1 flex items-center justify-center gap-2 h-auto py-3"
                >
                  <Save className="h-4 w-4" />
                  Save Current Clip to Session
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center justify-center gap-2 h-auto py-3"
                  onClick={() => {
                    const drawer = document.getElementById('session-drawer');
                    if (drawer) {
                      drawer.classList.remove('translate-y-full');
                      drawer.classList.add('translate-y-0');
                    }
                  }}
                >
                  <List className="h-4 w-4" />
                  Saved Clips
                </Button>
              </div>

              {/* Transcribe Button */}
              <Button
                onClick={handleTranscribe}
                className="w-full"
                disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {isAutomatedTranscriptionLoading ? "Transcribing..." : "Transcribe Focused Clip"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Auto Clip Controls */}
              <div className="space-y-3 p-3 bg-card rounded-lg shadow">
                <ClipDurationSelector
                    selectedDuration={clipSegmentationDuration}
                    onDurationChange={onClipDurationChange}
                    disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
                />
              </div>

              {/* Clip Trimmer Toggle */}
              {onToggleClipTrimmer && (
                <Button
                  variant={showClipTrimmer ? "outline" : "default"}
                  onClick={onToggleClipTrimmer}
                  disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
                  className={cn(
                    "w-full transition-all duration-500",
                    showClipTrimmer
                      ? "border-primary/30 text-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/40"
                      : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl ring-2 ring-primary/30 hover:ring-primary/50"
                  )}
                >
                  <Scissors className="mr-2 h-4 w-4" />
                  {showClipTrimmer ? "Hide Clip Trimmer" : "Create Custom Clip"}
                </Button>
              )}

              {/* Clip Trimmer */}
              {showClipTrimmer && onCreateFocusedClip && (
                <ClipTrimmer
                  mediaDuration={mediaDuration}
                  videoPlayerRef={videoPlayerRef}
                  onTrimmedClipCreate={onCreateFocusedClip}
                  disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
                  onPreviewClip={handlePreviewClip}
                  onStopPreview={handleStopPreview}
                />
              )}

              <ClipNavigation
                clips={clips}
                currentClipIndex={currentClipIndex}
                onSelectClip={onSelectClip}
                onRemoveClip={onRemoveClip}
                isYouTubeVideo={isYouTubeVideo}
                formatSecondsToMMSS={formatSecondsToMMSS}
                disableRemove={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
              />

              {/* Save to Session Button */}
              <div className="flex gap-2">
                <Button
                  onClick={onSaveToSession}
                  disabled={!canSaveToSession || disableTextarea}
                  variant="secondary"
                  className="flex-1 flex items-center justify-center gap-2 h-auto py-3"
                >
                  <Save className="h-4 w-4" />
                  Save Current Clip to Session
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center justify-center gap-2 h-auto py-3"
                  onClick={() => {
                    const drawer = document.getElementById('session-drawer');
                    if (drawer) {
                      drawer.classList.remove('translate-y-full');
                      drawer.classList.add('translate-y-0');
                    }
                  }}
                >
                  <List className="h-4 w-4" />
                  Saved Clips
                </Button>
              </div>

              {/* Transcribe Button */}
              <Button
                onClick={handleTranscribe}
                className="w-full"
                disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {isAutomatedTranscriptionLoading ? "Transcribing..." : `Transcribe Clip ${currentClipIndex + 1}`}
              </Button>
            </div>
          )}
          {isMobileBrowser() && (
            <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/20 p-2 rounded border border-blue-200 dark:border-blue-800">
              <span className="font-medium text-blue-700 dark:text-blue-300">📱 Mobile Device Detected:</span>
              <span className="text-blue-600 dark:text-blue-400"> Using server-side audio processing for better compatibility.</span>
            </div>
          )}
        </div>

        <div className="lg:w-1/2 w-full">
          <Tabs defaultValue="manual" value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual" disabled={disableTextarea}>Your Transcription</TabsTrigger>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center w-full">
                    <TabsTrigger
                      value="ai"
                      disabled={disableTextarea || !aiToolsEnabled}
                      className="w-full flex items-center gap-2"
                    >
                      {aiToolsEnabled ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                      AI Tools
                    </TabsTrigger>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {aiToolsEnabled
                      ? "AI tools are now available!"
                      : `Complete your listening attempt first (${remainingChars} more characters needed)`
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            </TabsList>

            <TabsContent value="manual" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Type What You Hear</CardTitle>
                  <CardDescription>
                    {focusedClip ? (
                      <>
                        Listen to your focused clip ({formatSecondsToMMSS(currentClip.startTime)} - {formatSecondsToMMSS(currentClip.endTime)})
                        and type the dialogue. The "AI Tools" tab unlocks after you type at least {MIN_CHAR_THRESHOLD} characters.
                      </>
                    ) : (
                      <>
                        Listen to Clip {currentClipIndex + 1} ({formatSecondsToMMSS(currentClip.startTime)} - {formatSecondsToMMSS(currentClip.endTime)})
                        and type the dialogue. The "AI Tools" tab unlocks after you type at least {MIN_CHAR_THRESHOLD} characters.
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <MediaControls
                    effectiveClip={effectiveClip}
                    currentPlaybackTime={currentPlaybackTime}
                    isCurrentClipPlaying={isCurrentClipPlaying}
                    isLooping={isLooping}
                    setIsLooping={setIsLooping}
                    playbackRate={playbackRate}
                    handleSeek={handleSeek}
                    handlePlaybackRateChange={handlePlaybackRateChange}
                    skipBackward={skipBackward}
                    skipForward={skipForward}
                    togglePlayPause={togglePlayPause}
                    disableTextarea={disableTextarea}
                    mediaSrc={mediaSrc}
                    currentClipIndex={currentClipIndex}
                    focusedClip={focusedClip}
                  />

                  <Textarea
                    className="min-h-24 resize-y"
                    disabled={disableTextarea || !mediaSrc}
                    placeholder={`Type what you hear in the clip to practice ${language.charAt(0).toUpperCase() + language.slice(1)}...`}
                    value={userTranscriptionInput}
                    onChange={handleUserInputChange}
                  />
                </CardContent>
                 <CardFooter className="flex-col items-stretch gap-2">
                   <Tooltip>
                     <TooltipTrigger asChild>
                       <div>
                         <Button
                            onClick={() => handleTabChange("ai")}
                            disabled={disableTextarea || !aiToolsEnabled}
                            variant="outline"
                            className="w-full flex items-center gap-2"
                          >
                           {aiToolsEnabled ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                           Go to AI Tools
                          </Button>
                       </div>
                     </TooltipTrigger>
                     <TooltipContent>
                       <p>
                         {aiToolsEnabled
                           ? "Access AI transcription, translation, and correction tools"
                           : `Complete your listening attempt first (${remainingChars} more characters needed)`
                         }
                       </p>
                     </TooltipContent>
                   </Tooltip>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="ai" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Automated Transcription & Analysis</CardTitle>
                   <CardDescription>View the AI-generated transcription, compare with your input, and translate to your preferred language.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <MediaControls
                    effectiveClip={effectiveClip}
                    currentPlaybackTime={currentPlaybackTime}
                    isCurrentClipPlaying={isCurrentClipPlaying}
                    isLooping={isLooping}
                    setIsLooping={setIsLooping}
                    playbackRate={playbackRate}
                    handleSeek={handleSeek}
                    handlePlaybackRateChange={handlePlaybackRateChange}
                    skipBackward={skipBackward}
                    skipForward={skipForward}
                    togglePlayPause={togglePlayPause}
                    disableTextarea={disableTextarea}
                    mediaSrc={mediaSrc}
                    currentClipIndex={currentClipIndex}
                    focusedClip={focusedClip}
                  />

                  <div>
                    <h3 className="font-semibold mb-2 text-foreground">Automated Transcription:</h3>
                    <ScrollArea className="h-[100px] w-full rounded-md border p-3 bg-muted/50">
                      {isAutomatedTranscriptionLoading ? <ThreeDotsLoader className="mx-auto my-4" /> : null}
                      {!isAutomatedTranscriptionLoading && currentClip.automatedTranscription ? <p className="text-sm">{currentClip.automatedTranscription}</p> : null}
                      {!isAutomatedTranscriptionLoading && !currentClip.automatedTranscription && <p className="text-sm text-muted-foreground">Select "{focusedClip ? "Transcribe Focused Clip" : `Transcribe Clip ${currentClipIndex + 1}`}" to generate.</p>}
                    </ScrollArea>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-1 text-foreground">Your Input:</h3>
                    <ScrollArea className="h-[70px] w-full rounded-md border p-3 bg-muted/30">
                       {userTranscriptionInput ?
                          <p className="text-sm whitespace-pre-wrap">{userTranscriptionInput}</p> :
                          <p className="text-sm text-muted-foreground">You haven't typed anything for this clip yet.</p>
                       }
                    </ScrollArea>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Transcription Comparison:</h3>
                     <Button
                      onClick={handleCorrections}
                      disabled={!canGetCorrections || isCorrectionsLoading || isAnyClipTranscribing}
                      className="w-full"
                    >
                      <FileDiff className="mr-2 h-4 w-4" />
                      {isCorrectionsLoading ? "Comparing..." : "Get Corrections"}
                    </Button>
                    <ScrollArea className="h-[120px] w-full rounded-md border p-3 bg-muted/50">
                       {isCorrectionsLoading ? (
                         <ThreeDotsLoader className="mx-auto my-4" />
                       ) : currentClip.comparisonResult === null || currentClip.comparisonResult === undefined ? (
                         <p className="text-sm text-muted-foreground">Click "Get Corrections" above after entering your transcription and generating the AI transcription.</p>
                       ) : currentClip.comparisonResult.length === 1 && currentClip.comparisonResult[0].token === "Error generating comparison." ? (
                          <p className="text-sm text-destructive">{currentClip.comparisonResult[0].token}</p>
                       ) : (
                         <p className="text-sm whitespace-pre-wrap leading-relaxed">
                           {currentClip.comparisonResult.map(renderCorrectionToken)}
                          </p>
                       )}
                    </ScrollArea>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-foreground">Translation:</h3>
                      <TranslationLanguageSelector
                        selectedLanguage={translationTargetLanguage}
                        onLanguageChange={setTranslationTargetLanguage}
                        disabled={!canTranslate || isTranslationLoading || isAnyClipTranscribing}
                        label=""
                        className="w-[140px]"
                      />
                    </div>
                     <Button
                      onClick={handleTranslate}
                      disabled={!canTranslate || isTranslationLoading || isAnyClipTranscribing}
                      className="w-full"
                    >
                      <Languages className="mr-2 h-4 w-4" />
                      {isTranslationLoading ? "Translating..." : `Translate to ${getLanguageLabel(translationTargetLanguage)}`}
                    </Button>
                    <ScrollArea className="h-[100px] w-full rounded-md border p-3 bg-muted/50">
                       {isTranslationLoading ? (
                         <ThreeDotsLoader className="mx-auto my-4" />
                       ) : !getTranslationForCurrentTarget() ? (
                         <p className="text-sm text-muted-foreground">Click "Translate to {getLanguageLabel(translationTargetLanguage)}" above after AI transcription is complete.</p>
                       ) : getTranslationForCurrentTarget() === "" ? (
                          <p className="text-sm">Translation complete. No specific output or translation was empty.</p>
                       ) : getTranslationForCurrentTarget()?.startsWith("Error:") ? (
                          <p className="text-sm text-destructive">{getTranslationForCurrentTarget()}</p>
                       ) : (
                         <p className="text-sm whitespace-pre-wrap">{getTranslationForCurrentTarget()}</p>
                       )}
                    </ScrollArea>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  );
}
