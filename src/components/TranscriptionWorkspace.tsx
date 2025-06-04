"use client";

import type * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import VideoPlayer, { type VideoPlayerRef } from "./VideoPlayer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, FileDiff, Languages, PlayIcon, PauseIcon, Mic, Lock, Unlock, SkipBack, SkipForward, Scissors, Eye, Save, List, BookmarkPlus, CircleCheckBig, GripVertical, Edit3, AlertTriangle, Focus } from "lucide-react";
import ClipNavigation from "./ClipNavigation";
import ClipDurationSelector from "./ClipDurationSelector";
import ClipTrimmer from "./ClipTrimmer";
import ClipOptionsDropdown from "./ClipOptionsDropdown";
import TranslationLanguageSelector from "./TranslationLanguageSelector";
import type { Clip } from '@/lib/videoUtils';
import type { CorrectionToken } from '@/ai/flows/compare-transcriptions-flow';
import { useToast } from "@/hooks/use-toast";
import { getLanguageLabel } from "@/lib/languageOptions";
import { cn } from "@/lib/utils";

interface SessionClip extends Clip {
  displayName?: string;
  mediaSourceId?: string;
  originalClipNumber?: number;
  // Legacy fields for backward compatibility
  originalMediaName?: string;
  mediaSrc?: string;
  sourceType?: 'video' | 'audio' | 'url' | 'unknown';
}

// Client-side event handler types
type ClientEventHandler<T extends any[] = []> = (...args: T) => void;
type ClientAsyncEventHandler<T extends any[] = []> = (...args: T) => Promise<void>;

interface TranscriptionWorkspaceProps {
  currentClip: Clip;
  clips: Clip[];
  mediaSrc?: string;
  currentClipIndex: number;
  // Client-side event handlers (not Server Actions)
  onSelectClip: ClientEventHandler<[index: number]>;
  onTranscribeAudio: ClientAsyncEventHandler<[clipId: string]>;
  onGetCorrections: ClientAsyncEventHandler<[clipId: string]>;
  onTranslate: ClientAsyncEventHandler<[clipId: string, targetLanguage: string]>;
  onRemoveClip: ClientEventHandler<[clipId: string]>;
  onUserTranscriptionChange: ClientEventHandler<[clipId: string, newUserTranscription: string]>;
  isYouTubeVideo: boolean;
  language: string;
  isAudioSource?: boolean;
  clipSegmentationDuration: number;
  onClipDurationChange: ClientEventHandler<[duration: string]>;
  isLoadingMedia: boolean;
  isSavingMedia: boolean;
  isAnyClipTranscribing: boolean;
  isCurrentClipTranscribing?: boolean;
  isCurrentClipTranslating?: boolean;
  isCurrentClipComparing?: boolean;
  // Focused clip functionality
  mediaDuration?: number;
  focusedClip?: Clip | null;
  showClipTrimmer?: boolean;
  onCreateFocusedClip?: ClientEventHandler<[startTime: number, endTime: number]>;
  onToggleClipTrimmer?: ClientEventHandler<[]>;
  onBackToAutoClips?: ClientEventHandler<[]>;
  onSaveToSession: ClientEventHandler<[userTranscriptionInput: string]>;
  onOpenSessionDrawer?: ClientEventHandler<[]>;
  canSaveToSession: boolean;
  // Session clips for showing saved indicators
  sessionClips?: SessionClip[];
  activeMediaSourceId?: string | null;
  onUpdateClipData?: (clipId: string, aiContent: any) => void;
}

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
  clipDisplayName,
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
  clipDisplayName: string;
}) => (
  <div className="space-y-2 sm:space-y-3 p-2 sm:p-3 bg-muted/30 rounded-lg border">
    {/* Timeline Controls Header */}
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-2">
      <span className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-[60%]">
        {isCurrentClipPlaying ? "Playing" : "Paused"} &ndash; {clipDisplayName}
      </span>
      <span className="text-sm font-mono text-muted-foreground whitespace-nowrap">
        {formatSecondsToMMSS(Math.max(effectiveClip.startTime, currentPlaybackTime))} / {formatSecondsToMMSS(effectiveClip.endTime)}
      </span>
    </div>

    {/* Timeline Slider */}
    <div>
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

    {/* Transport Controls - Flexible responsive layout */}
    <div className="flex flex-wrap items-center justify-between gap-2 min-h-[2rem]">
      {/* Loop Control */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <Checkbox
          id={`loop-toggle-${effectiveClip.id}`}
          checked={isLooping}
          onCheckedChange={(checked) => setIsLooping(Boolean(checked))}
          disabled={disableTextarea || !mediaSrc}
          className="h-3 w-3 sm:h-4 sm:w-4"
        />
        <Label htmlFor={`loop-toggle-${effectiveClip.id}`} className="text-sm font-normal text-muted-foreground whitespace-nowrap">
          Loop
        </Label>
      </div>

      {/* Playback Controls - Center with flex-grow to take available space */}
      <div className="flex items-center justify-center gap-2 flex-grow min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0"
          onClick={skipBackward}
          disabled={disableTextarea || !mediaSrc}
        >
          <SkipBack className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0"
          onClick={togglePlayPause}
          disabled={disableTextarea || !mediaSrc}
        >
          {isCurrentClipPlaying ? (
            <PauseIcon className="h-3 w-3 sm:h-4 sm:w-4" />
          ) : (
            <PlayIcon className="h-3 w-3 sm:h-4 sm:w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0"
          onClick={skipForward}
          disabled={disableTextarea || !mediaSrc}
        >
          <SkipForward className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
      </div>

      {/* Speed Control */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <Label htmlFor={`speed-select-${effectiveClip.id}`} className="text-sm font-normal text-muted-foreground whitespace-nowrap">
          Speed
        </Label>
        <Select
          value={playbackRate.toString()}
          onValueChange={handlePlaybackRateChange}
          disabled={disableTextarea || !mediaSrc}
        >
          <SelectTrigger id={`speed-select-${effectiveClip.id}`} className="h-7 sm:h-8 w-[3.5rem] sm:w-[4.5rem] text-xs flex-shrink-0">
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

// Helper function to determine if AI tools should be enabled
const shouldEnableAITools = (userInput: string, automatedTranscription?: string | null, userActivelyUsingAITools: boolean = false): boolean => {
  const hasTranscription = userInput.trim().length > 0;
  const hasExistingTranscription = Boolean(
    automatedTranscription &&
    !automatedTranscription.startsWith("Error:")
  );

  // Allow access if user is actively using AI tools (e.g., clicking TRANSCRIBE)
  return hasTranscription || hasExistingTranscription || userActivelyUsingAITools;
};

// Add a new session storage cache at the component level (outside the component function)
// This ensures data persists across component unmounts/remounts
const AI_TOOLS_CACHE_KEY = "reel-fluent-ai-tools-cache";

// Helper function to get cached data (outside component)
const getAIToolsCache = (): Record<string, any> => {
  if (typeof window === 'undefined') return {};
  try {
    const cached = localStorage.getItem(AI_TOOLS_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (e) {
    console.error("Error reading AI tools cache:", e);
    return {};
  }
};

// Helper function to update cached data (outside component)
const updateAIToolsCache = (key: string, data: any): void => {
  if (typeof window === 'undefined') return;
  try {
    const cache = getAIToolsCache();
    cache[key] = data;
    localStorage.setItem(AI_TOOLS_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error("Error updating AI tools cache:", e);
  }
};

// Helper function to clear specific cached data
const clearAIToolsCacheForClip = (key: string, fieldsToRemove: string[]): void => {
  if (typeof window === 'undefined') return;
  try {
    const cache = getAIToolsCache();
    if (cache[key]) {
      fieldsToRemove.forEach(field => {
        delete cache[key][field];
      });
      localStorage.setItem(AI_TOOLS_CACHE_KEY, JSON.stringify(cache));
    }
  } catch (e) {
    console.error("Error clearing AI tools cache:", e);
  }
};

// Helper function to get comprehensive transcription data from all sources
const getComprehensiveTranscriptionData = (
  currentClip: Clip,
  userTranscriptionInput: string,
  sessionClips: SessionClip[],
  activeMediaSourceId: string | null,
  localCache: Record<string, any>
): {
  userTranscription: string;
  automatedTranscription: string | null;
  hasValidUserTranscription: boolean;
  hasValidAutomatedTranscription: boolean;
  isTranscriptionSaved: boolean;
} => {
  // Get user transcription from multiple sources
  const localUserTranscription = userTranscriptionInput.trim();
  const clipUserTranscription = currentClip.userTranscription?.trim() || "";

  // Check session data
  const savedClip = sessionClips?.find(sessionClip =>
    activeMediaSourceId &&
    sessionClip.mediaSourceId === activeMediaSourceId &&
    sessionClip.startTime === currentClip.startTime &&
    sessionClip.endTime === currentClip.endTime
  );
  const sessionUserTranscription = savedClip?.userTranscription?.trim() || "";

  // Priority: local input > session data > clip data
  const finalUserTranscription = localUserTranscription || sessionUserTranscription || clipUserTranscription;

  // Get automated transcription from multiple sources
  const clipAutomatedTranscription = currentClip.automatedTranscription;
  const cacheKey = activeMediaSourceId ? `${activeMediaSourceId}-${currentClip.id}` : null;
  const cachedAutomatedTranscription = cacheKey ? localCache[cacheKey]?.automatedTranscription : null;
  const sessionAutomatedTranscription = savedClip?.automatedTranscription;

  // Priority: current clip > session data > cache
  const finalAutomatedTranscription = clipAutomatedTranscription || sessionAutomatedTranscription || cachedAutomatedTranscription || null;

  const hasValidUserTranscription = finalUserTranscription.length > 0;
  const hasValidAutomatedTranscription = Boolean(
    finalAutomatedTranscription &&
    finalAutomatedTranscription !== "Transcribing..." &&
    !finalAutomatedTranscription.startsWith("Error:")
  );

  const isTranscriptionSaved = Boolean(savedClip) || Boolean(sessionUserTranscription);

  return {
    userTranscription: finalUserTranscription,
    automatedTranscription: finalAutomatedTranscription,
    hasValidUserTranscription,
    hasValidAutomatedTranscription,
    isTranscriptionSaved
  };
};

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
  isCurrentClipTranscribing,
  isCurrentClipTranslating,
  isCurrentClipComparing,
  mediaDuration = 0,
  focusedClip = null,
  showClipTrimmer = false,
  onCreateFocusedClip,
  onToggleClipTrimmer,
  onBackToAutoClips,
  onSaveToSession,
  onOpenSessionDrawer,
  canSaveToSession,
  sessionClips = [],
  activeMediaSourceId,
  onUpdateClipData,
}: TranscriptionWorkspaceProps) {

  const [userTranscriptionInput, setUserTranscriptionInput] = useState(currentClip.userTranscription || "");
  const [activeTab, setActiveTab] = useState<string>("manual");
  const [hasUserManuallyChangedTab, setHasUserManuallyChangedTab] = useState(false);
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [practiceText, setPracticeText] = useState("");
  const [lastUserSelectedTab, setLastUserSelectedTab] = useState<string>("manual");
  const [isTranscriptionComplete, setIsTranscriptionComplete] = useState(false);
  const [isTranscriptionInProgress, setIsTranscriptionInProgress] = useState(false);
  const [localTranscribingState, setLocalTranscribingState] = useState<string | null>(null);
  const [userActivelyUsingAITools, setUserActivelyUsingAITools] = useState(false);
  const [aiToolsButtonClicked, setAiToolsButtonClicked] = useState(false);
  const [lastUserTranscriptionForComparison, setLastUserTranscriptionForComparison] = useState<string>("");
  const { toast } = useToast();

  const videoPlayerRef = useRef<VideoPlayerRef>(null);
  const [isCurrentClipPlaying, setIsCurrentClipPlaying] = useState(false);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(currentClip?.startTime || 0);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [translationTargetLanguage, setTranslationTargetLanguage] = useState(currentClip.translationTargetLanguage || "english");
  const [previewClip, setPreviewClip] = useState<{ startTime: number; endTime: number } | null>(null);
  const [isInPreviewMode, setIsInPreviewMode] = useState(false);
  const [isTranscriptionSaved, setIsTranscriptionSaved] = useState(false);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Store an expanded reference map of all processed media+clip combinations
  // This avoids the need to reset lastLoadedStateRef when media source changes
  const processedClipsMapRef = useRef<Record<string, {
    savedClipId: string | null,
    notified: boolean
  }>>({});

  // Inside component function, add a local cache ref:
  const localAIToolsCache = useRef<Record<string, any>>(getAIToolsCache());

  const withAIToolsProtection = useCallback(async (action: () => Promise<void>) => {
    setUserActivelyUsingAITools(true);
    try {
      await action();
    } finally {
      setTimeout(() => setUserActivelyUsingAITools(false), 1000);
    }
  }, []);

  // Helper function to force refresh AI content from session storage
  // This is used when the user explicitly uses an AI tool
  const forceRefreshAIContent = useCallback(() => {
    if (!currentClip || !activeMediaSourceId) return;

    const currentClipContextId = `${activeMediaSourceId}-${currentClip.id}`;
    // Clear from the processed clips map to force re-evaluation
    delete processedClipsMapRef.current[currentClipContextId];
  }, [currentClip, activeMediaSourceId]);

  useEffect(() => {
    const handleResize = () => {
      if (leftPaneRef.current && window.innerWidth < 768) {
        leftPaneRef.current.style.removeProperty('width');
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !leftPaneRef.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = startWidth.current + delta;
      const minWidth = 15 * 16;
      const maxWidth = window.innerWidth * 0.5;
      const clamped = Math.min(Math.max(newWidth, minWidth), maxWidth);
      leftPaneRef.current.style.width = `${clamped}px`;
    };
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth < 768) return;
    isDragging.current = true;
    startX.current = e.clientX;
    if (leftPaneRef.current) {
      startWidth.current = leftPaneRef.current.getBoundingClientRect().width;
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handlePlayerTimeUpdate = useCallback((time: number) => {
    setCurrentPlaybackTime(time);
  }, []);

  useEffect(() => {
    if (mediaSrc) {
      setActiveTab("manual");
      setHasUserManuallyChangedTab(false);
      setLastUserSelectedTab("manual");
      setIsTranscriptionComplete(false);
      setIsTranscriptionInProgress(false);
      setUserTranscriptionInput("");
    }
  }, [mediaSrc]);

  useEffect(() => {
    setUserTranscriptionInput(currentClip.userTranscription || "");
    setTranslationTargetLanguage(currentClip.translationTargetLanguage || "english");
    setIsTranscriptionComplete(
      !!(currentClip.automatedTranscription &&
         !currentClip.automatedTranscription.startsWith("Error:") &&
         currentClip.automatedTranscription !== "Transcribing...")
    );
    setIsTranscriptionInProgress(currentClip.automatedTranscription === "Transcribing...");
    setIsPracticeMode(false);
    setPracticeText("");

    // Determine if the "AI Tools" tab should be selected by default
    const shouldResetTabToManual = (!currentClip.automatedTranscription || currentClip.automatedTranscription === "Transcribing...") &&
        !userActivelyUsingAITools && !aiToolsButtonClicked;

    if (shouldResetTabToManual) {
      setActiveTab("manual");
      setHasUserManuallyChangedTab(false);
      setLastUserSelectedTab("manual");
    }
    // If currentClip has saved AI data, and user hasn't manually changed tabs, consider switching to "ai" tab.
    // This is handled by another useEffect further down.

  }, [currentClip.id, currentClip.userTranscription, currentClip.translationTargetLanguage, currentClip.automatedTranscription, userActivelyUsingAITools, aiToolsButtonClicked]);

  useEffect(() => {
    if (currentClip.automatedTranscription === "Transcribing...") {
      setIsTranscriptionInProgress(true);
      setIsTranscriptionComplete(false);
    } else if (currentClip.automatedTranscription &&
        !currentClip.automatedTranscription.startsWith("Error:") &&
        currentClip.automatedTranscription !== "Transcribing...") {
      setIsTranscriptionComplete(true);
      setIsTranscriptionInProgress(false);
    } else {
      setIsTranscriptionComplete(false);
      setIsTranscriptionInProgress(false);
    }
  }, [currentClip.automatedTranscription]);

  const handleTabChange = useCallback((newTab: string) => {
    if (isTranscriptionInProgress && !userActivelyUsingAITools) {
      // Don't allow tab changes during transcription unless user is actively using AI tools
      return;
    }

    // Check if trying to access AI tab without saving transcription first
    if (newTab === "ai" && !isTranscriptionSaved && !userActivelyUsingAITools) {
      // Allow if AI tools are already enabled (meaning transcription might be from AI)
      // or if user is actively clicking an AI tool button (handled by userActivelyUsingAITools)
      const canProceedToAITab = shouldEnableAITools(userTranscriptionInput, currentClip.automatedTranscription, true);
      if (!canProceedToAITab) {
        toast({
          variant: "destructive",
          title: "Save Required",
          description: "Please save your transcription before accessing AI tools."
        });
        return;
      }
    }

    setActiveTab(newTab);
    setHasUserManuallyChangedTab(true); // Mark that user has interacted
    setLastUserSelectedTab(newTab); // Remember the last tab user explicitly chose

    // If user switches to AI tab, mark as actively using them
    // This helps prevent being auto-switched out if AI results load quickly
    if (newTab === "ai") {
      setUserActivelyUsingAITools(true);
    } else {
      // If switching to manual, don't immediately clear userActivelyUsingAITools
      // as they might be going back and forth. Let the withAIToolsProtection timeout handle it.
    }
  }, [isTranscriptionInProgress, isTranscriptionSaved, userActivelyUsingAITools, userTranscriptionInput, currentClip.automatedTranscription, toast]);

  useEffect(() => {
    setCurrentPlaybackTime(currentClip?.startTime || 0);
    setPlaybackRate(1.0); // Reset to normal speed when switching clips
    setPreviewClip(null); // Clear any preview clip when the main clip changes
  }, [currentClip.id]); // Only run when clip ID changes

  useEffect(() => {
    // Clear preview clip when ClipTrimmer is hidden (no longer relevant)
    if (!showClipTrimmer) {
      setPreviewClip(null);
      if (videoPlayerRef.current) {
        videoPlayerRef.current.pause(); // Also pause if it was playing the preview
      }
    }
  }, [showClipTrimmer]);

  useEffect(() => {
    if (!videoPlayerRef.current) {
      return;
    }

    // Poll for current time continuously
    const interval = setInterval(() => {
      if (videoPlayerRef.current) { // Check ref again inside interval
        const currentTime = videoPlayerRef.current.getCurrentTime();
        // Only update if it's a meaningful change to avoid excessive re-renders
        if (Math.abs(currentTime - currentPlaybackTime) > 0.1) {
             setCurrentPlaybackTime(currentTime);
        }
      }
    }, 250); // Poll every 250ms

    return () => clearInterval(interval);
  // Reduced dependencies: currentClip.startTime might not be needed if effectiveClip handles boundaries
  }, [isCurrentClipPlaying, currentPlaybackTime]);

  const handleUserInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const previousValue = userTranscriptionInput;

    setUserTranscriptionInput(newValue);
    setIsTranscriptionSaved(false); // Any change invalidates saved state for current edit

    // CRITICAL: Clear comparison results when user transcription changes significantly
    // This ensures stale comparison data doesn't persist
    if (activeMediaSourceId && currentClip && previousValue.trim() !== newValue.trim()) {
      const clipCacheKey = `${activeMediaSourceId}-${currentClip.id}`;

      // Clear comparison results from cache
      clearAIToolsCacheForClip(clipCacheKey, ['comparisonResult']);

      // Clear comparison results from parent component
      if (onUpdateClipData) {
        onUpdateClipData(currentClip.id, { comparisonResult: null });
      }

      // Update the tracking variable
      setLastUserTranscriptionForComparison(newValue.trim());
    }
  };

  // Add autosave functionality for AI tools
  const handleAutoSave = useCallback((clipId: string, aiContent: any) => {
    if (!activeMediaSourceId) return;

    const clipCacheKey = `${activeMediaSourceId}-${clipId}`;
    const currentCache = localAIToolsCache.current[clipCacheKey] || {};

    // Merge new content with existing cache
    const updatedCache = {
      ...currentCache,
      ...aiContent
    };

    // Update both local ref and localStorage
    localAIToolsCache.current[clipCacheKey] = updatedCache;
    updateAIToolsCache(clipCacheKey, updatedCache);

    // Also update parent component state to ensure consistency
    if (onUpdateClipData) {
      onUpdateClipData(clipId, updatedCache);
    }

    // If we can save to session, do that too
    if (onSaveToSession && canSaveToSession) {
      onSaveToSession(userTranscriptionInput);
    }
  }, [activeMediaSourceId, onUpdateClipData, onSaveToSession, canSaveToSession, userTranscriptionInput]);

  // Modify the transcribe handler to include autosave
  const handleTranscribeClip = async () => {
    if (!currentClip || (isAudioSource && !mediaSrc)) {
      toast({variant: "destructive", title: "Cannot Transcribe", description: "Please ensure media is loaded and a clip is selected."});
      return;
    }

    // Check if already transcribed
    if (currentClip.automatedTranscription &&
        currentClip.automatedTranscription !== "Transcribing..." &&
        !currentClip.automatedTranscription.startsWith("Error:")) {
      toast({
        title: "Already Transcribed",
        description: "This clip has already been transcribed. You can use the result directly."
      });
      return;
    }

    setAiToolsButtonClicked(true);
    setUserActivelyUsingAITools(true);
    setHasUserManuallyChangedTab(true);

    const clipId = currentClip.id;
    setLocalTranscribingState(() => clipId);
    setIsTranscriptionInProgress(true);

    await withAIToolsProtection(async () => {
      try {
        await onTranscribeAudio(clipId);

        // Autosave the transcription result
        if (currentClip.automatedTranscription &&
            !currentClip.automatedTranscription.startsWith("Error:") &&
            currentClip.automatedTranscription !== "Transcribing...") {
          handleAutoSave(clipId, {
            automatedTranscription: currentClip.automatedTranscription,
            language: currentClip.language || language
          });
        }

      } catch (error) {
        console.warn("Transcription error in workspace:", error);
        toast({
          variant: "destructive",
          title: "Transcription Failed",
          description: "Failed to transcribe the clip. Please try again."
        });
      } finally {
        setLocalTranscribingState(() => null);
        setIsTranscriptionInProgress(false);
        setTimeout(() => setAiToolsButtonClicked(false), 2000);
      }
    });
  };

  // Enhanced translate handler with comprehensive validation and auto-save
  const handleTranslate = async () => {
    // Get comprehensive data from all sources
    const comprehensiveData = getComprehensiveTranscriptionData(
      currentClip,
      userTranscriptionInput,
      sessionClips,
      activeMediaSourceId ?? null,
      localAIToolsCache.current
    );

    if (!comprehensiveData.hasValidAutomatedTranscription) {
      toast({
        variant: "destructive",
        title: "No Text to Translate",
        description: "Please ensure automated transcription is successful first."
      });
      return;
    }

    const currentTranslation = getTranslationForCurrentTarget();
    if (currentTranslation &&
        currentTranslation !== "Translating..." &&
        !currentTranslation.startsWith("Error:")) {
      toast({
        title: "Already Translated",
        description: `This clip has already been translated to ${getLanguageLabel(translationTargetLanguage)}.`
      });
      return;
    }

    setAiToolsButtonClicked(true);

    await withAIToolsProtection(async () => {
      try {
        await onTranslate(currentClip.id, translationTargetLanguage);

        // Autosave the translation result
        if (currentClip.translation &&
            !currentClip.translation.startsWith("Error:") &&
            currentClip.translation !== "Translating...") {
          handleAutoSave(currentClip.id, {
            translation: currentClip.translation,
            translationTargetLanguage
          });
        } else if (currentClip.englishTranslation &&
                  !currentClip.englishTranslation.startsWith("Error:") &&
                  currentClip.englishTranslation !== "Translating...") {
          handleAutoSave(currentClip.id, {
            englishTranslation: currentClip.englishTranslation,
            translationTargetLanguage: "english"
          });
        }

      } catch (error) {
        console.warn("Translation error in workspace:", error);
      } finally {
        setTimeout(() => setAiToolsButtonClicked(false), 2000);
      }
    });
  };

  // Enhanced corrections handler with comprehensive validation and auto-save
  const handleGetCorrections = useCallback(async () => {
    // Get comprehensive data from all sources
    const comprehensiveData = getComprehensiveTranscriptionData(
      currentClip,
      userTranscriptionInput,
      sessionClips,
      activeMediaSourceId ?? null,
      localAIToolsCache.current
    );

    // Enhanced validation that checks all data sources
    if (!comprehensiveData.hasValidUserTranscription) {
      toast({
        variant: "destructive",
        title: "Missing User Transcription",
        description: "Please enter and save your transcription before comparing with AI."
      });
      return;
    }

    if (!comprehensiveData.hasValidAutomatedTranscription) {
      toast({
        variant: "destructive",
        title: "Missing AI Transcription",
        description: "Please ensure automated transcription is successful first."
      });
      return;
    }

    // Check if we already have valid comparison results
    if (currentClip.comparisonResult &&
        Array.isArray(currentClip.comparisonResult) &&
        currentClip.comparisonResult.length > 0 &&
        currentClip.comparisonResult[0].token !== "Comparing..." &&
        !currentClip.comparisonResult[0].token.startsWith("Error:")) {
      toast({
        title: "Corrections Already Generated",
        description: "Corrections have already been generated for this clip."
      });
      return;
    }

    setAiToolsButtonClicked(true);

    await withAIToolsProtection(async () => {
      try {
        await onGetCorrections(currentClip.id);

        // Autosave the comparison result
        if (currentClip.comparisonResult &&
            Array.isArray(currentClip.comparisonResult) &&
            currentClip.comparisonResult.length > 0 &&
            currentClip.comparisonResult[0].token !== "Comparing..." &&
            !currentClip.comparisonResult[0].token.startsWith("Error:")) {
          handleAutoSave(currentClip.id, {
            comparisonResult: currentClip.comparisonResult
          });

          // Update the tracking variable
          setLastUserTranscriptionForComparison(comprehensiveData.userTranscription);
        }

      } catch (error) {
        console.warn("Corrections error in workspace:", error);
      } finally {
        setTimeout(() => setAiToolsButtonClicked(false), 2000);
      }
    });
  }, [currentClip, userTranscriptionInput, onGetCorrections, sessionClips, activeMediaSourceId, withAIToolsProtection, toast, handleAutoSave]);

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
    const newTime = Math.max(currentClip.startTime, currentTime - 5);
    videoPlayerRef.current.seek(newTime);
    setCurrentPlaybackTime(newTime);
  };

  const skipForward = () => {
    if (!videoPlayerRef.current) return;
    const currentTime = videoPlayerRef.current.getCurrentTime();
    const newTime = Math.min(currentClip.endTime, currentTime + 5);
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

  const getTranslationForCurrentTarget = (): string | null | undefined => {
    if (currentClip.translation !== undefined && currentClip.translationTargetLanguage === translationTargetLanguage) {
      return currentClip.translation;
    }

    if (translationTargetLanguage === 'english' && currentClip.englishTranslation !== undefined) {
      return currentClip.englishTranslation;
    }

    return null;
  };

  const handlePreviewClip = useCallback((startTime: number, endTime: number) => {
    setPreviewClip({ startTime, endTime });
    setIsInPreviewMode(true);

    if (videoPlayerRef.current) {
      videoPlayerRef.current.seek(startTime);
      videoPlayerRef.current.play();
    }
  }, []);

  const handleStopPreview = useCallback(() => {
    setPreviewClip(null);
    setIsInPreviewMode(false);
    if (videoPlayerRef.current) {
      videoPlayerRef.current.pause();
      const resetClip = focusedClip || currentClip;
      videoPlayerRef.current.seek(resetClip.startTime);
    }
  }, [currentClip, focusedClip]);

  useEffect(() => {
    if (!isInPreviewMode || !previewClip) return;

    const monitorInterval = setInterval(() => {
      if (videoPlayerRef.current) {
        const currentTime = videoPlayerRef.current.getCurrentTime();
        if (currentTime >= previewClip.endTime) {
          if (!videoPlayerRef.current.getIsPlaying()) {
            try {
              videoPlayerRef.current.play();
            } catch (err) {
              console.warn("Preview continuation error:", err);
            }
          }
        }
      }
    }, 100);

    return () => clearInterval(monitorInterval);
  }, [isInPreviewMode, previewClip]);

  const effectiveClip = previewClip
    ? { ...currentClip, startTime: previewClip.startTime, endTime: previewClip.endTime }
    : focusedClip
      ? focusedClip
      : currentClip;

  const tabsEffectiveClip = previewClip
    ? { ...currentClip, startTime: previewClip.startTime, endTime: previewClip.endTime }
    : currentClip;

  const handleSaveOrUpdate = useCallback(() => {
    if (!currentClip || !onSaveToSession) return;

    const hasTranscription = userTranscriptionInput.trim().length > 0;

    if (!hasTranscription) {
      toast({
        title: "Nothing to Save",
        description: "Please write a transcription before saving."
      });
      return;
    }

    onUserTranscriptionChange(currentClip.id, userTranscriptionInput);
    onSaveToSession(userTranscriptionInput);
    setIsTranscriptionSaved(true);

    if (canSaveToSession) {
      toast({
        title: "Transcription Attempt Saved",
        description: "Your transcription attempt is saved! Use the Saved Attempts button to the left of the AI Tools to review or make changes anytime."
      });
    }
  }, [currentClip, userTranscriptionInput, onUserTranscriptionChange, onSaveToSession, canSaveToSession, toast]);

  const isCurrentClipSaved = useMemo(() => {
    return sessionClips?.some(sessionClip =>
      activeMediaSourceId &&
      sessionClip.mediaSourceId === activeMediaSourceId &&
      sessionClip.startTime === currentClip.startTime &&
      sessionClip.endTime === currentClip.endTime
    ) || false;
  }, [sessionClips, activeMediaSourceId, currentClip.startTime, currentClip.endTime]);

  useEffect(() => {
    setIsTranscriptionSaved(isCurrentClipSaved);
    setUserActivelyUsingAITools(false);
    setAiToolsButtonClicked(false);
  }, [currentClip.id, isCurrentClipSaved]);

  // Add back the previously removed helper functions
  const handleClipClick = useCallback((index: number) => {
    onSelectClip(index);
    // The main useEffect for loading session data will handle restoring AI content
    // when currentClip.id changes as a result of onSelectClip.
  }, [onSelectClip]);

  const isClipSaved = useCallback((clip: Clip): boolean => {
    if (!sessionClips || !activeMediaSourceId) return false;

    return sessionClips.some(sessionClip =>
      sessionClip.mediaSourceId === activeMediaSourceId &&
      sessionClip.startTime === clip.startTime &&
      sessionClip.endTime === clip.endTime
    );
  }, [sessionClips, activeMediaSourceId]);

  const getSavedClipInfo = useCallback((clip: Clip, index: number): { displayName: string; fullName: string; isTruncated: boolean } => {
    if (!sessionClips || !activeMediaSourceId) {
      const defaultName = `Clip ${index + 1}`;
      return { displayName: defaultName, fullName: defaultName, isTruncated: false };
    }

    const savedClip = sessionClips.find(sessionClip =>
      sessionClip.mediaSourceId === activeMediaSourceId &&
      sessionClip.startTime === clip.startTime &&
      sessionClip.endTime === clip.endTime
    );

    if (savedClip && savedClip.displayName) {
      const fullName = savedClip.displayName;
      // Truncate if display name is too long for the button
      const isTruncated = fullName.length > (isMobileBrowser() ? 10 : 12);
      const displayName = isTruncated ? `${fullName.substring(0, (isMobileBrowser() ? 10 : 12))}...` : fullName;
      return { displayName, fullName, isTruncated };
    }

    const defaultName = `Clip ${index + 1}`;
    return { displayName: defaultName, fullName: defaultName, isTruncated: false };
  }, [sessionClips, activeMediaSourceId]);

  const getCurrentClipDisplayName = useCallback((): string => {
    if (!currentClip) return "Clip"; // Fallback if currentClip is somehow null
    if (!sessionClips || !activeMediaSourceId ) {
      return `Clip ${currentClipIndex + 1}`;
    }

    const savedClip = sessionClips.find(sessionClip =>
      sessionClip.mediaSourceId === activeMediaSourceId &&
      sessionClip.startTime === currentClip.startTime &&
      sessionClip.endTime === currentClip.endTime
    );

    return savedClip?.displayName || `Clip ${currentClipIndex + 1}`;
  }, [sessionClips, activeMediaSourceId, currentClip, currentClipIndex]);

  // This useEffect handles automatic tab switching based on transcription state
  // and whether the user has manually interacted with tabs.
  useEffect(() => {
    if (aiToolsButtonClicked || userActivelyUsingAITools) {
      // If user explicitly clicked an AI tool or is marked as actively using them, don't auto-switch.
      return;
    }

    if (!hasUserManuallyChangedTab) {
      // If user hasn't picked a tab yet for this clip context
      const canAccessAITools = shouldEnableAITools(userTranscriptionInput, currentClip.automatedTranscription, false);
      if (isTranscriptionComplete && !isTranscriptionInProgress && canAccessAITools) {
        // If transcription is done and AI tools are accessible, switch to AI tab.
        setActiveTab("ai");
      } else if (!canAccessAITools && activeTab === "ai") {
        // If AI tools became inaccessible (e.g., transcription cleared) and user was on AI tab, switch to manual.
        setActiveTab("manual");
      }
      // Otherwise, leave tab as is (likely "manual" by default).
    } else if (isTranscriptionComplete && !isTranscriptionInProgress && lastUserSelectedTab === "ai") {
      // If user had previously selected AI tab, and transcription is now complete, restore it.
      setActiveTab("ai");
    }
  }, [
    hasUserManuallyChangedTab,
    userTranscriptionInput,
    activeTab,
    isTranscriptionComplete,
    isTranscriptionInProgress,
    lastUserSelectedTab,
    currentClip.automatedTranscription,
    userActivelyUsingAITools,
    aiToolsButtonClicked
  ]);

  // Reset lastLoadedStateRef when activeMediaSourceId changes,
  // to ensure that when user switches back to a media source,
  // the clips for that source are freshly evaluated against sessionClips.
  useEffect(() => {
    // Instead of resetting lastLoadedStateRef, just reset local UI state
    // but preserve our knowledge of which clips have been processed
    setUserActivelyUsingAITools(false);
    setAiToolsButtonClicked(false);

    // We don't reset lastLoadedStateRef.current = null here anymore
    // This allows the main useEffect below to recognize previously processed clips
  }, [activeMediaSourceId]);

  // Add this new effect to handle saving AI tool results to cache
  useEffect(() => {
    if (!currentClip || !activeMediaSourceId) return;

    const clipCacheKey = `${activeMediaSourceId}-${currentClip.id}`;

    // Check if we have AI tool results to cache
    const cacheData: any = {};
    let shouldUpdateCache = false;

    if (currentClip.automatedTranscription &&
        currentClip.automatedTranscription !== "Transcribing..." &&
        !String(currentClip.automatedTranscription).startsWith("Error:")) {
      cacheData.automatedTranscription = currentClip.automatedTranscription;
      cacheData.language = currentClip.language || language;
      shouldUpdateCache = true;
    }

    if (currentClip.translation &&
        currentClip.translation !== "Translating..." &&
        !String(currentClip.translation).startsWith("Error:")) {
      cacheData.translation = currentClip.translation;
      cacheData.translationTargetLanguage = currentClip.translationTargetLanguage;
      shouldUpdateCache = true;
    } else if (currentClip.englishTranslation &&
              currentClip.englishTranslation !== "Translating..." &&
              !String(currentClip.englishTranslation).startsWith("Error:")) {
      cacheData.englishTranslation = currentClip.englishTranslation;
      cacheData.translationTargetLanguage = "english";
      shouldUpdateCache = true;
    }

    if (currentClip.comparisonResult &&
        Array.isArray(currentClip.comparisonResult) &&
        currentClip.comparisonResult.length > 0 &&
        currentClip.comparisonResult[0].token !== "Comparing..." &&
        !String(currentClip.comparisonResult[0].token).startsWith("Error:")) {
      cacheData.comparisonResult = currentClip.comparisonResult;
      shouldUpdateCache = true;
    }

    if (shouldUpdateCache) {
      // Update both local ref and localStorage
      localAIToolsCache.current[clipCacheKey] = cacheData;
      updateAIToolsCache(clipCacheKey, cacheData);
    }
  }, [
    currentClip?.automatedTranscription,
    currentClip?.translation,
    currentClip?.englishTranslation,
    currentClip?.comparisonResult,
    currentClip?.id,
    activeMediaSourceId,
    language
  ]);

  // Handle media source changes - this will run when the user selects a different media source
  useEffect(() => {
    if (!activeMediaSourceId) return;

    // When media source changes, force reload of all AI tools cache data
    // This ensures the cache is fresh and ready for the clip loading effect
    localAIToolsCache.current = getAIToolsCache();

    // Reset interaction state flags only
    setUserActivelyUsingAITools(false);
    setAiToolsButtonClicked(false);
  }, [activeMediaSourceId]);

  // Modify the consolidated data restoration effect to NOT override user input while typing
  useEffect(() => {
    if (!currentClip || !activeMediaSourceId) return;

    // We have two potential sources of saved data:
    // 1. sessionClips (server-side/DB saved data)
    // 2. localAIToolsCache (client-side/localStorage saved data)

    // First check session data
    const savedClip = sessionClips?.find(sessionClip =>
      sessionClip.mediaSourceId === activeMediaSourceId &&
      sessionClip.startTime === currentClip.startTime &&
      sessionClip.endTime === currentClip.endTime
    );

    // Then check local cache
    const clipCacheKey = `${activeMediaSourceId}-${currentClip.id}`;
    const cachedData = localAIToolsCache.current[clipCacheKey];

    // Track whether we've shown notifications
    const currentClipContextId = `${activeMediaSourceId}-${currentClip.id}`;
    const previouslyProcessed = processedClipsMapRef.current[currentClipContextId];
    const isNewContext = !previouslyProcessed;

    // Combined data object that merges sessionClip and cachedData
    // Priority: current data -> sessionClip -> cachedData
    const combinedData: Partial<Clip> = {};
    const notificationMessages: string[] = [];

    // --- Handle user transcription --- ONLY on initial load or clip change
    // CRITICAL FIX: Only set userTranscriptionInput if this is a new context
    // This prevents overriding what the user is actively typing
    if (isNewContext) {
      if (savedClip?.userTranscription !== undefined) {
        setUserTranscriptionInput(savedClip.userTranscription || "");
        setIsTranscriptionSaved(true);
      } else {
        const propUserTranscription = currentClip.userTranscription || "";
        setUserTranscriptionInput(propUserTranscription);
        setIsTranscriptionSaved(!!savedClip);
      }
    } else {
      // For non-new contexts, just update the saved state if a saved clip exists
      if (savedClip) {
        setIsTranscriptionSaved(true);
      }
    }

    // --- Handle translation target language ---
    if (savedClip?.translationTargetLanguage && savedClip.translationTargetLanguage !== translationTargetLanguage) {
      setTranslationTargetLanguage(savedClip.translationTargetLanguage);
    } else if (cachedData?.translationTargetLanguage && cachedData.translationTargetLanguage !== translationTargetLanguage) {
      setTranslationTargetLanguage(cachedData.translationTargetLanguage);
    }

    // --- CRITICAL: Restore AI tool data by merging session and cache data ---

    // 1. Automated Transcription
    if (savedClip?.automatedTranscription &&
        savedClip.automatedTranscription !== "Transcribing..." &&
        !String(savedClip.automatedTranscription).startsWith("Error:")) {
      // Session data takes priority
      combinedData.automatedTranscription = savedClip.automatedTranscription;
      combinedData.language = savedClip.language || language;
      if (isNewContext) notificationMessages.push("Transcription");
    } else if (cachedData?.automatedTranscription &&
              !currentClip.automatedTranscription &&
              cachedData.automatedTranscription !== "Transcribing..." &&
              !String(cachedData.automatedTranscription).startsWith("Error:")) {
      // Use cached data if no session data and no current data
      combinedData.automatedTranscription = cachedData.automatedTranscription;
      combinedData.language = cachedData.language || language;
      if (isNewContext) notificationMessages.push("Transcription (from cache)");
    }

    // 2. Translation
    let translationRestored = false;
    if (savedClip?.translation &&
        savedClip.translation !== "Translating..." &&
        !String(savedClip.translation).startsWith("Error:")) {
      // Session translation data
      combinedData.translation = savedClip.translation;
      combinedData.translationTargetLanguage = savedClip.translationTargetLanguage;
      translationRestored = true;
      if (isNewContext) {
        notificationMessages.push(`Translation to ${getLanguageLabel(savedClip.translationTargetLanguage || "english")}`);
      }
    } else if (cachedData?.translation &&
              !currentClip.translation &&
              cachedData.translation !== "Translating..." &&
              !String(cachedData.translation).startsWith("Error:")) {
      // Cached translation data
      combinedData.translation = cachedData.translation;
      combinedData.translationTargetLanguage = cachedData.translationTargetLanguage;
      translationRestored = true;
      if (isNewContext) {
        notificationMessages.push(`Translation to ${getLanguageLabel(cachedData.translationTargetLanguage || "english")} (from cache)`);
      }
    }

    // 3. Legacy English Translation
    if (!translationRestored) {
      if (savedClip?.englishTranslation &&
          savedClip.englishTranslation !== "Translating..." &&
          !String(savedClip.englishTranslation).startsWith("Error:")) {
        // Session english translation
        combinedData.englishTranslation = savedClip.englishTranslation;
        if (!combinedData.translationTargetLanguage) {
          combinedData.translationTargetLanguage = "english";
        }
        if (isNewContext) notificationMessages.push("Translation to English");
      } else if (cachedData?.englishTranslation &&
                !currentClip.englishTranslation &&
                cachedData.englishTranslation !== "Translating..." &&
                !String(cachedData.englishTranslation).startsWith("Error:")) {
        // Cached english translation
        combinedData.englishTranslation = cachedData.englishTranslation;
        if (!combinedData.translationTargetLanguage) {
          combinedData.translationTargetLanguage = "english";
        }
        if (isNewContext) notificationMessages.push("Translation to English (from cache)");
      }
    }

    // 4. Comparison Results
    if (savedClip?.comparisonResult &&
        Array.isArray(savedClip.comparisonResult) &&
        savedClip.comparisonResult.length > 0 &&
        savedClip.comparisonResult[0].token !== "Comparing..." &&
        !String(savedClip.comparisonResult[0].token).startsWith("Error:")) {
      // Session comparison data
      combinedData.comparisonResult = savedClip.comparisonResult;
      if (isNewContext) notificationMessages.push("Comparison");
    } else if (cachedData?.comparisonResult &&
              !currentClip.comparisonResult &&
              Array.isArray(cachedData.comparisonResult) &&
              cachedData.comparisonResult.length > 0 &&
              cachedData.comparisonResult[0].token !== "Comparing..." &&
              !String(cachedData.comparisonResult[0].token).startsWith("Error:")) {
      // Cached comparison data
      combinedData.comparisonResult = cachedData.comparisonResult;
      if (isNewContext) notificationMessages.push("Comparison (from cache)");
    }

    // CRITICAL: Update parent component with combined data
    // This ensures the parent component reflects our merged session+cache data
    if (Object.keys(combinedData).length > 0 && onUpdateClipData) {
      console.log(`Restoring AI content for clip ${currentClipContextId}:`, {
        source: savedClip ? "session" : (cachedData ? "cache" : "none"),
        hasTranscription: !!combinedData.automatedTranscription,
        hasTranslation: !!(combinedData.translation || combinedData.englishTranslation),
        hasComparison: !!combinedData.comparisonResult
      });

      // Update parent component state
      onUpdateClipData(currentClip.id, combinedData);
    }

    // Show notification if needed
    if (isNewContext && notificationMessages.length > 0) {
      toast({
        title: `"${savedClip?.displayName || `Clip ${currentClipIndex + 1}`}" Loaded`,
        description: `Previously processed: ${notificationMessages.join(", ")}.`,
      });
    }

    // Record that we've processed this clip
    processedClipsMapRef.current[currentClipContextId] = {
      savedClipId: savedClip?.id || null,
      notified: notificationMessages.length > 0
    };

  }, [
    // CRITICAL FIX: Remove userTranscriptionInput from dependencies to prevent
    // this effect from firing on every keystroke
    activeMediaSourceId || null,
    currentClip?.id || null,
    JSON.stringify(sessionClips || []),
    currentClip?.userTranscription || "",
    // userTranscriptionInput || "", <-- REMOVED THIS DEPENDENCY
    translationTargetLanguage || "english",
    onUpdateClipData,
    toast,
    language || "",
    currentClipIndex || 0,
    // The next two are placeholders to ensure a stable array size
    null,
    null,
    null // Added an extra null to maintain the same array size
  ]);

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

  const disableTextarea = isLoadingMedia || isSavingMedia;
  const disableCurrentClipAIActions = isAutomatedTranscriptionLoading || isLoadingMedia || isSavingMedia;

  // CRITICAL FIX: Use comprehensive validation that checks ALL data sources
  const comprehensiveValidationData = useMemo(() => {
    const data = getComprehensiveTranscriptionData(
      currentClip,
      userTranscriptionInput,
      sessionClips,
      activeMediaSourceId ?? null,
      localAIToolsCache.current
    );

    // Debug logging to help troubleshoot validation issues
    console.log(`Comprehensive validation for clip ${currentClip.id}:`, {
      hasValidUserTranscription: data.hasValidUserTranscription,
      hasValidAutomatedTranscription: data.hasValidAutomatedTranscription,
      isTranscriptionSaved: data.isTranscriptionSaved,
      userTranscription: data.userTranscription.substring(0, 50) + (data.userTranscription.length > 50 ? '...' : ''),
      automatedTranscription: data.automatedTranscription?.substring(0, 50) + (data.automatedTranscription && data.automatedTranscription.length > 50 ? '...' : ''),
      activeMediaSourceId,
      sessionClipsCount: sessionClips.length,
      localCacheKeys: Object.keys(localAIToolsCache.current)
    });

    return data;
  }, [currentClip, userTranscriptionInput, sessionClips, activeMediaSourceId]);

  const canGetCorrections = comprehensiveValidationData.hasValidUserTranscription &&
                           comprehensiveValidationData.hasValidAutomatedTranscription &&
                           !isAutomatedTranscriptionError;
  const canTranslate = comprehensiveValidationData.hasValidAutomatedTranscription &&
                      !isAutomatedTranscriptionError &&
                      !isAutomatedTranscriptionLoading;

  const aiToolsEnabled = shouldEnableAITools(userTranscriptionInput, currentClip.automatedTranscription, userActivelyUsingAITools);

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
      <div className="flex flex-col md:flex-row gap-y-4 md:gap-y-0 md:gap-x-2 p-3 sm:p-4 md:p-6">
        <div ref={leftPaneRef} className="w-full space-y-4 resize-none overflow-visible md:w-auto md:min-w-[15rem] md:max-w-[50%] md:overflow-auto">
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
            isLooping={previewClip ? false : isLooping}
            onEnded={previewClip ? handleStopPreview : undefined}
          />

          {focusedClip ? (
            <div className="space-y-4">
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-2 -ml-1">
                    <Eye className="h-4 w-4" />
                    {focusedClip.displayName || 'Custom Clip'} (Focused)
                  </span>
                  {onBackToAutoClips && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onBackToAutoClips}
                      className="hover:bg-primary/10"
                    >
                      Back to Auto Clips
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3 p-3 bg-card rounded-lg shadow">
                <div className="flex justify-between items-center mb-2">
                  <ClipDurationSelector
                    selectedDuration={clipSegmentationDuration}
                    onDurationChange={onClipDurationChange}
                    disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
                  />
                  {currentClip && clips.length > 1 && (
                    <ClipOptionsDropdown
                      currentClipIndex={currentClipIndex}
                      onRemoveClip={onRemoveClip}
                      clipId={currentClip.id}
                      disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
                    />
                  )}
                </div>

                <ClipNavigation
                  clips={clips}
                  currentClipIndex={currentClipIndex}
                  onSelectClip={handleClipClick}
                  onRemoveClip={onRemoveClip}
                  isYouTubeVideo={isYouTubeVideo}
                  formatSecondsToMMSS={formatSecondsToMMSS}
                  disableRemove={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
                  getClipInfo={getSavedClipInfo}
                  isClipSaved={isClipSaved}
                  showHeader={false}
                  className="p-0 bg-transparent shadow-none"
                />
              </div>

              {onToggleClipTrimmer && (
                <Button
                  variant={showClipTrimmer ? "outline" : "secondary"}
                  onClick={onToggleClipTrimmer}
                  disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
                  className={cn(
                    "w-full transition-all duration-300",
                    showClipTrimmer
                      ? "border-primary/30 text-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/40"
                      : "bg-muted hover:bg-primary hover:text-primary-foreground hover:border-primary/40 text-muted-foreground border border-border"
                  )}
                >
                  <Scissors className="mr-2 h-4 w-4" />
                  {isAnyClipTranscribing
                    ? "Create Custom Clip"
                    : showClipTrimmer
                      ? "Hide Clip Trimmer"
                      : "Create Custom Clip"
                  }
                </Button>
              )}

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
            </div>
          )}
        </div>

        <div className="hidden md:flex items-center justify-center px-1 cursor-col-resize select-none" onMouseDown={onMouseDown}>
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="w-full md:flex-1 md:min-w-0 relative">
          {showClipTrimmer && (
            <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm rounded-lg border-2 border-primary/20 flex items-center justify-center">
              <div className="text-center p-8 max-w-md">
                <div className="mb-4 mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <Focus className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-primary mb-3">Focus on Clip Trimmer</h3>
                <p className="text-muted-foreground mb-4 leading-relaxed">
                  Use the <strong>Clip Trimmer</strong> on the left to select your custom clip range.
                  Preview your selection and create a focused clip for AI processing.
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Scissors className="h-4 w-4" />
                  <span>Custom clip creation in progress...</span>
                </div>
              </div>
            </div>
          )}
          <Tabs defaultValue="manual" value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="flex w-full gap-1 md:gap-2 whitespace-nowrap md:grid md:grid-cols-[1fr_1fr_auto] md:overflow-visible min-h-[2.25rem] overflow-x-hidden">
              <TabsTrigger value="manual" disabled={disableTextarea} className="flex-1 text-sm px-1 md:px-3 min-w-0">
                <span className="truncate block">Your Transcription</span>
              </TabsTrigger>
              <TabsTrigger
                value="ai"
                disabled={disableTextarea || !aiToolsEnabled}
                className="flex-1 flex items-center justify-center gap-1 md:gap-2 text-sm px-1 md:px-3 min-w-0"
              >
                {aiToolsEnabled ? <Unlock className="h-3 w-3 flex-shrink-0" /> : <Lock className="h-3 w-3 flex-shrink-0" />}
                <span className="truncate block">AI Tools</span>
              </TabsTrigger>
              <Button
                variant="ghost"
                onClick={onOpenSessionDrawer}
                className={cn(
                  "flex-1 h-[29px] flex items-center justify-center gap-1 md:gap-2 text-sm px-1 md:px-3 min-w-0",
                  "transition-all duration-200",
                  "hover:bg-accent hover:rounded-sm hover:text-accent-foreground",
                  "data-[state=active]:bg-background data-[state=active]:shadow-sm"
                )}
              >
                <CircleCheckBig className="hidden lg:inline-block h-3 w-3 flex-shrink-0" />
                <span className="truncate block">Saved Attempts</span>
              </Button>
            </TabsList>

            <TabsContent value="manual" className="mt-4">
              <Card>
                <CardHeader className="pb-3 md:pb-6">
                  <CardTitle className="text-base md:text-lg">Type What You Hear</CardTitle>
                  <CardDescription className="text-sm">
                    Listen to {focusedClip ? (focusedClip.displayName || 'Custom Clip') : getCurrentClipDisplayName()} ({formatSecondsToMMSS(currentClip.startTime)} - {formatSecondsToMMSS(currentClip.endTime)}) and type the dialogue.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 md:space-y-4">
                  <MediaControls
                    effectiveClip={tabsEffectiveClip}
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
                    clipDisplayName={focusedClip ? (focusedClip.displayName || 'Custom Clip') : getCurrentClipDisplayName()}
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
                   <Button
                     onClick={() => {
                      if (!isTranscriptionSaved) {
                        if (!currentClip || !onSaveToSession) return;

                        const hasTranscription = userTranscriptionInput.trim().length > 0;

                        if (!hasTranscription) {
                          toast({
                            title: "Nothing to Save",
                            description: "Please write a transcription before saving."
                          });
                          return;
                        }

                        onUserTranscriptionChange(currentClip.id, userTranscriptionInput);
                        onSaveToSession(userTranscriptionInput);
                        setIsTranscriptionSaved(true);

                        setActiveTab("ai");
                        setHasUserManuallyChangedTab(true);
                        setLastUserSelectedTab("ai");
                        setUserActivelyUsingAITools(true);
                      } else {
                        handleTabChange("ai");
                      }
                     }}
                     disabled={disableTextarea}
                     variant="default"
                     className="text-sm"
                   >
                     {isTranscriptionSaved ? <Unlock className="mr-1 md:mr-2 h-3 md:h-4 w-3 md:w-4" /> : <Save className="mr-1 md:mr-2 h-3 md:h-4 w-3 md:w-4" />}
                     <span className="hidden md:inline">{isTranscriptionSaved ? "Access AI Tools" : "Save & Unlock AI Tools"}</span>
                     <span className="md:hidden">{isTranscriptionSaved ? "Access AI" : "Save & Unlock AI"}</span>
                   </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="ai" className="mt-4">
              <Card>
                <CardHeader className="pb-3 md:pb-6">
                  <CardTitle className="text-base md:text-lg">Transcription Support</CardTitle>
                  <CardDescription className="text-sm">
                  Compare the Automated Transcription with your version and translate to available languages.                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 md:space-y-6">
                  <MediaControls
                    effectiveClip={tabsEffectiveClip}
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
                    clipDisplayName={focusedClip ? (focusedClip.displayName || 'Custom Clip') : getCurrentClipDisplayName()}
                  />

                  <div className="space-y-2">
                    <h3 className="font-semibold mb-2 text-foreground text-sm md:text-base">Automated Transcription:</h3>
                    <Button
                      onClick={handleTranscribeClip}
                      className="w-full mb-2 text-sm"
                      disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
                    >
                      <Sparkles className="mr-1 md:mr-2 h-3 md:h-4 w-3 md:w-4" />
                      <span className="hidden md:inline">{isAnyClipTranscribing ? "Transcribing..." : focusedClip ? "Transcribe Focused Clip" : `Transcribe Clip ${currentClipIndex + 1}`}</span>
                      <span className="md:hidden">{isAnyClipTranscribing ? "Transcribing..." : "Transcribe"}</span>
                    </Button>
                    <ScrollArea className="h-[100px] w-full rounded-md border p-3 bg-muted/50" resizable>
                      {currentClip.automatedTranscription === "Transcribing..." && <ThreeDotsLoader className="mx-auto my-4" />}
                      {currentClip.automatedTranscription && currentClip.automatedTranscription !== "Transcribing..." ? <p className="text-sm">{currentClip.automatedTranscription}</p> : null}
                      {!currentClip.automatedTranscription && <p className="text-sm text-muted-foreground">Click "Transcribe" above to generate.</p>}
                    </ScrollArea>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-foreground text-sm md:text-base">Your Transcription:</h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (isPracticeMode) {
                            setPracticeText("");
                          } else {
                            setPracticeText(userTranscriptionInput);
                          }
                          setIsPracticeMode(!isPracticeMode);
                        }}
                        className="h-6 px-1 md:px-2 text-xs"
                      >
                        <Edit3 className="h-3 w-3 mr-1" />
                        <span className="hidden md:inline">{isPracticeMode ? "Exit Practice" : "Practice"}</span>
                        <span className="md:hidden">{isPracticeMode ? "Exit" : "Practice"}</span>
                      </Button>
                    </div>
                    {isPracticeMode ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md">
                          <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Practice mode: Changes won't be saved and will revert to your original transcription.
                          </p>
                        </div>
                        <Textarea
                          className="h-[70px] text-sm resize-y"
                          placeholder="Practice typing here..."
                          value={practiceText}
                          onChange={(e) => setPracticeText(e.target.value)}
                        />
                      </div>
                    ) : (
                      <ScrollArea className="h-[70px] w-full rounded-md border p-3 bg-muted/30" resizable>
                         {userTranscriptionInput ?
                            <p className="text-sm whitespace-pre-wrap">{userTranscriptionInput}</p> :
                            <p className="text-sm text-muted-foreground">You haven't typed anything for this clip yet.</p>
                         }
                      </ScrollArea>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground text-sm md:text-base">Transcription Comparison:</h3>
                     <Button
                      onClick={handleGetCorrections}
                      disabled={!canGetCorrections || isCorrectionsLoading || isAnyClipTranscribing}
                      className="w-full text-sm"
                    >
                      <FileDiff className="mr-1 md:mr-2 h-3 md:h-4 w-3 md:w-4" />
                      <span className="hidden md:inline">{isCorrectionsLoading ? "Comparing..." : "Get Corrections"}</span>
                      <span className="md:hidden">{isCorrectionsLoading ? "Comparing..." : "Compare"}</span>
                    </Button>
                    <ScrollArea className="h-[120px] w-full rounded-md border p-3 bg-muted/50" resizable>
                       {isCurrentClipComparing ? (
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
                      <h3 className="font-semibold text-foreground text-sm md:text-base">Translation:</h3>
                      <TranslationLanguageSelector
                        selectedLanguage={translationTargetLanguage}
                        onLanguageChange={setTranslationTargetLanguage}
                        disabled={!canTranslate || isTranslationLoading || isAnyClipTranscribing}
                        label=""
                        className="w-[100px] md:w-[140px]"
                      />
                    </div>
                     <Button
                      onClick={handleTranslate}
                      disabled={!canTranslate || isTranslationLoading || isAnyClipTranscribing}
                      className="w-full text-sm"
                    >
                      <Languages className="mr-1 md:mr-2 h-3 md:h-4 w-3 md:w-4" />
                      <span className="hidden md:inline">{isTranslationLoading ? "Translating..." : `Translate to ${getLanguageLabel(translationTargetLanguage)}`}</span>
                      <span className="md:hidden">{isTranslationLoading ? "Translating..." : "Translate"}</span>
                    </Button>
                    <ScrollArea className="h-[100px] w-full rounded-md border p-3 bg-muted/50" resizable>
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
                  <p className="text-xs text-muted-foreground italic mt-6 pt-2 border-t">Note: While AI tools may not be 100% accurate, they provide helpful guidance for learning.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  );
}
