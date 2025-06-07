"use client";

import type * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import VideoPlayer, { type VideoPlayerRef } from "./VideoPlayer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CircleCheckBig, GripVertical, Eye, Scissors, Focus, Keyboard, Sparkles } from "lucide-react";
import ClipNavigation from "./ClipNavigation";
import ClipDurationSelector from "./ClipDurationSelector";
import ClipTrimmer from "./ClipTrimmer";
import ClipOptionsDropdown from "./ClipOptionsDropdown";
import type { Clip } from '@/lib/videoUtils';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { hydrateClipWithAIData } from '@/lib/aiToolsHydration';
import type { CorrectionToken } from '@/ai/flows/compare-transcriptions-flow';

// Import the new extracted components
import MediaControls from "./transcription/MediaControls";
import TranscriptionTab from "./transcription/TranscriptionTab";
import AIToolsTab from "./transcription/AIToolsTab";
import { useAIToolsState } from "./transcription/useAIToolsState";

interface SessionClip extends Clip {
  displayName?: string;
  mediaSourceId?: string;
  originalClipNumber?: number;
  originalMediaName?: string;
  mediaSrc?: string;
  sourceType?: 'video' | 'audio' | 'url' | 'unknown';
}

type ClientEventHandler<T extends any[] = []> = (...args: T) => void;
type ClientAsyncEventHandler<T extends any[] = []> = (...args: T) => Promise<void>;

interface TranscriptionWorkspaceProps {
  currentClip: Clip;
  clips: Clip[];
  mediaSrc?: string;
  currentClipIndex: number;
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
  mediaDuration?: number;
  focusedClip?: Clip | null;
  showClipTrimmer?: boolean;
  onCreateFocusedClip?: ClientEventHandler<[startTime: number, endTime: number]>;
  onToggleClipTrimmer?: ClientEventHandler<[]>;
  onBackToAutoClips?: ClientEventHandler<[]>;
  onSaveToSession: ClientEventHandler<[userTranscriptionInput: string]>;
  onOpenSessionDrawer?: ClientEventHandler<[]>;
  canSaveToSession: boolean;
  sessionClips?: SessionClip[];
  activeMediaSourceId?: string | null;
  onUpdateClipData?: (clipId: string, aiContent: any) => void;
}

// Mobile browser detection
const isMobileBrowser = (): boolean => {
  if (typeof window === 'undefined') return false;
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isTablet = /ipad|android(?!.*mobile)/i.test(userAgent);
  return isMobile || isTablet;
};

export default function TranscriptionWorkspace({
  currentClip: initialCurrentClip,
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

  const { toast } = useToast();
  const videoPlayerRef = useRef<VideoPlayerRef>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const prevActiveMediaSourceIdRef = useRef<string | null | undefined>(); // For detecting media source change

  // Core state
  const [userTranscriptionInput, setUserTranscriptionInput] = useState(initialCurrentClip.userTranscription || "");
  const [activeTab, setActiveTab] = useState<string>("manual");
  const [hasUserManuallyChangedTab, setHasUserManuallyChangedTab] = useState(false);
  const [isTranscriptionSaved, setIsTranscriptionSaved] = useState(false);
  const [clipNavScrollToTopKey, setClipNavScrollToTopKey] = useState<number>(Date.now()); // Key to trigger scroll

  // State for the fully hydrated clip to be used by child components
  const [displayClip, setDisplayClip] = useState<Clip>(initialCurrentClip);

  // Media playback state
  const [isCurrentClipPlaying, setIsCurrentClipPlaying] = useState(false);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(initialCurrentClip?.startTime || 0);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [translationTargetLanguage, setTranslationTargetLanguage] = useState(initialCurrentClip.translationTargetLanguage || "english");
  const [previewClip, setPreviewClip] = useState<{ startTime: number; endTime: number } | null>(null);
  const [isInPreviewMode, setIsInPreviewMode] = useState(false);

  // AI Tools state management
  const aiToolsState = useAIToolsState({
    currentClip: displayClip,
    sessionClips,
    activeMediaSourceId,
    onUpdateClipData,
    onSaveToSession,
    userTranscriptionInput,
    language
  });

  // Helper to check for active loading states or error states (consistent with aiToolsHydration.ts)
  const isLoadingOrErrorState = (value: any): boolean => {
    if (typeof value === 'string') {
      return value.endsWith('...') || value.startsWith('Error:');
    }
    if (Array.isArray(value) && value.length > 0 && typeof (value[0] as CorrectionToken)?.token === 'string') {
        if (value.length === 1 && ((value[0] as CorrectionToken).token === "Comparing..." || (value[0] as CorrectionToken).token.startsWith("Error:"))) {
            return true;
        }
    }
    return false;
  };

  // Resize handler for left pane
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

  // Mouse drag handler for pane resize
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

  // Reset state when clip changes (mainly for displayClip hydration)
  useEffect(() => {
    let clipToHydrate: Clip | null = null;

    if (focusedClip) {
      clipToHydrate = focusedClip;
    } else if (initialCurrentClip) {
      clipToHydrate = initialCurrentClip;
    }

    if (!clipToHydrate) {
      setDisplayClip({ id: '', startTime: 0, endTime: 0, userTranscription: '', automatedTranscription: null, translation: null, englishTranslation: null, comparisonResult: null, language: language || 'en' });
      return;
    }

    // We pass the clipToHydrate directly. hydrateClipWithAIData will prioritize its fields
    // (loading states, then actual data) before looking at cache/session.
    // This relies on initialCurrentClip being correctly populated by ReelFluentApp
    // (e.g., with new transcription data after an operation, or as a clean clip after media source change).
    let hydratedClipResult = clipToHydrate; // Start with the assumption it might be the final, or will be hydrated
    try {
      const aiToolsCache = JSON.parse(localStorage.getItem("reel-fluent-ai-tools-cache") || "{}");
      hydratedClipResult = hydrateClipWithAIData(clipToHydrate, activeMediaSourceId, sessionClips, aiToolsCache);
    } catch (e) {
      console.warn("Error hydrating clip in TranscriptionWorkspace:", e);
      // Fallback to the clip we started with if hydration fails
      hydratedClipResult = clipToHydrate;
    }
    setDisplayClip(hydratedClipResult);

  }, [
    // Identity of the clips and context
    initialCurrentClip?.id,
    focusedClip?.id,
    activeMediaSourceId,
    language,
    sessionClips, // Assumed to be stable from the custom hook if content hasn't changed

    // Stringified relevant data of the clip that will be chosen for hydration.
    // This ensures the effect runs if the content of these fields changes for the active clip.
    focusedClip ? JSON.stringify({
      at: focusedClip.automatedTranscription,
      t: focusedClip.translation,
      et: focusedClip.englishTranslation,
      cr: focusedClip.comparisonResult,
      l: focusedClip.language,
      ttl: focusedClip.translationTargetLanguage,
      ut: focusedClip.userTranscription // User transcription is also key for display
    }) : null,

    initialCurrentClip && !focusedClip ? JSON.stringify({
      at: initialCurrentClip.automatedTranscription,
      t: initialCurrentClip.translation,
      et: initialCurrentClip.englishTranslation,
      cr: initialCurrentClip.comparisonResult,
      l: initialCurrentClip.language,
      ttl: initialCurrentClip.translationTargetLanguage,
      ut: initialCurrentClip.userTranscription
    }) : null
  ]);

  // Effect to initialize UI elements when displayClip fundamentally changes
  useEffect(() => {
    if (displayClip) {
      setUserTranscriptionInput(displayClip.userTranscription || "");
      setTranslationTargetLanguage(displayClip.translationTargetLanguage || "english");
      setCurrentPlaybackTime(displayClip.startTime || 0);
      setPlaybackRate(1.0);
      setPreviewClip(null);
      setHasUserManuallyChangedTab(false);
    }
  }, [displayClip?.id, displayClip?.startTime, displayClip?.endTime]); // Only run when the clip truly changes

  // Separate effect for checking if clip is saved (doesn't reset playback)
  useEffect(() => {
    const isClipSaved = sessionClips?.some(sessionClip =>
      activeMediaSourceId &&
      sessionClip.mediaSourceId === activeMediaSourceId &&
      sessionClip.startTime === displayClip.startTime &&
      sessionClip.endTime === displayClip.endTime
    ) || false;

    setIsTranscriptionSaved(isClipSaved);
  }, [activeMediaSourceId, sessionClips, displayClip?.startTime, displayClip?.endTime]);

  // Consolidated Tab Management Logic
  useEffect(() => {
    // If a manual tab choice has been made for the current clip session, respect it.
    if (hasUserManuallyChangedTab) {
      return;
    }

    // Condition 1: AI tools are NOT accessible (e.g. transcription not saved)
    // This is the strongest condition to force "manual" tab.
    if (!aiToolsState.canAccessAITools) {
      if (activeTab !== "manual") {
        setActiveTab("manual");
      }
      return; // Stop further automatic tab changes
    }

    // At this point, AI tools ARE accessible.

    // Condition 2: An AI operation is actively processing.
    // If AI is processing, we generally don't want to auto-switch tabs.
    // This prevents flickering if the user started an operation on the AI Tools tab.
    if (aiToolsState.isProcessing) {
      return; // Maintain current tab while processing
    }

    // Condition 3: No AI operation is processing, and AI tools are accessible.
    // Decide tab based on AI content.
    if (aiToolsState.hasValidAIContent) {
      if (activeTab !== "ai") {
        setActiveTab("ai");
      }
    } else {
      // No valid AI content, not processing, AI tools accessible -> default to manual.
      if (activeTab !== "manual") {
        setActiveTab("manual");
      }
    }
  }, [
    activeTab,
    aiToolsState.canAccessAITools,
    aiToolsState.hasValidAIContent,
    aiToolsState.isProcessing,
    hasUserManuallyChangedTab,
    displayClip?.id // Re-evaluate when the fundamental clip context changes
  ]);

  // useEffect for scrolling ClipNavigation to top when media source changes
  useEffect(() => {
    const mediaSourceHasChanged = prevActiveMediaSourceIdRef.current !== activeMediaSourceId && activeMediaSourceId !== undefined;

    if (
      mediaSourceHasChanged &&
      clips.length > 0 &&
      currentClipIndex === 0 &&
      !focusedClip
    ) {
      setClipNavScrollToTopKey(Date.now()); // Update the key to trigger scroll in ClipNavigation
    }

    // Store current activeMediaSourceId for the next render comparison
    prevActiveMediaSourceIdRef.current = activeMediaSourceId;
  }, [clips, currentClipIndex, focusedClip, activeMediaSourceId]);

  const handlePlayerTimeUpdate = useCallback((time: number) => {
    setCurrentPlaybackTime(time);
  }, []);

  const handleUserInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setUserTranscriptionInput(newValue);
    setIsTranscriptionSaved(false);

    // Clear comparison results when user transcription changes
    aiToolsState.handleUserTranscriptionChange(newValue);
  };

  const handleTabChange = useCallback((newTab: string) => {
    // The toast logic for "Save Required" that was here previously was for the old unlock system.
    // The AI Tools tab's own `disabled` prop now handles preventing access if conditions aren't met.
    // if (newTab === "ai" && !aiToolsState.canAccessAITools) { ... }

    setActiveTab(newTab);
    setHasUserManuallyChangedTab(true);

    // DO NOT set userActivelyUsingAITools here. This flag is for active AI operations,
    // not for merely viewing the tab.
    // if (newTab === "ai") {
    //   aiToolsState.setUserActivelyUsingAITools(true);
    // }
  }, [aiToolsState, setActiveTab, setHasUserManuallyChangedTab]); // Removed toast and aiToolsState.canAccessAITools from deps as direct check is gone

  const handleSaveOrUpdate = useCallback(() => {
    if (!displayClip || !onSaveToSession) return;

    const hasTranscription = userTranscriptionInput.trim().length > 0;
    if (!hasTranscription) {
      toast({
        title: "Nothing to Save",
        description: "Please write a transcription before saving."
      });
      return;
    }

    const existingAIData = {
      automatedTranscription: displayClip.automatedTranscription,
      translation: displayClip.translation,
      englishTranslation: displayClip.englishTranslation,
      comparisonResult: displayClip.comparisonResult,
      translationTargetLanguage: displayClip.translationTargetLanguage,
      language: displayClip.language
    };

    const aiDataToSave = Object.fromEntries(
      Object.entries(existingAIData).filter(([, value]) => value != null)
    );

    if (Object.keys(aiDataToSave).length > 0) {
      aiToolsState.handleAutoSave(displayClip.id, aiDataToSave, true);
    }

    onUserTranscriptionChange(displayClip.id, userTranscriptionInput);
    onSaveToSession(userTranscriptionInput);
    setIsTranscriptionSaved(true);

  }, [displayClip, userTranscriptionInput, onUserTranscriptionChange, onSaveToSession, toast, aiToolsState, setIsTranscriptionSaved]);

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
      const resetClip = focusedClip || displayClip;
      videoPlayerRef.current.seek(resetClip.startTime);
    }
  }, [displayClip, focusedClip]);

  // Helper functions for clip management
  const handleClipClick = useCallback((index: number) => {
    onSelectClip(index);
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
      const isTruncated = fullName.length > (isMobileBrowser() ? 10 : 12);
      const displayName = isTruncated ? `${fullName.substring(0, (isMobileBrowser() ? 10 : 12))}...` : fullName;
      return { displayName, fullName, isTruncated };
    }

    const defaultName = `Clip ${index + 1}`;
    return { displayName: defaultName, fullName: defaultName, isTruncated: false };
  }, [sessionClips, activeMediaSourceId]);

  const getCurrentClipDisplayName = useCallback((): string => {
    if (!displayClip) return "Clip";
    if (!sessionClips || !activeMediaSourceId) {
      return `Clip ${currentClipIndex + 1}`;
    }

    const savedClip = sessionClips.find(sessionClip =>
      sessionClip.mediaSourceId === activeMediaSourceId &&
      sessionClip.startTime === displayClip.startTime &&
      sessionClip.endTime === displayClip.endTime
    );

    return savedClip?.displayName || `Clip ${currentClipIndex + 1}`;
  }, [sessionClips, activeMediaSourceId, displayClip, currentClipIndex]);

  if (!displayClip) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p>Load a video or audio file and ensure clips are generated to begin.</p>
      </div>
    );
  }

  const effectiveClip = previewClip
    ? { ...displayClip, startTime: previewClip.startTime, endTime: previewClip.endTime }
    : displayClip;

  // Debug logging for clip issues
  console.log('TranscriptionWorkspace render:', {
    focusedClip: focusedClip ? { id: focusedClip.id, startTime: focusedClip.startTime, endTime: focusedClip.endTime } : null,
    displayClip: displayClip ? { id: displayClip.id, startTime: displayClip.startTime, endTime: displayClip.endTime } : null,
    effectiveClip: effectiveClip ? { id: effectiveClip.id, startTime: effectiveClip.startTime, endTime: effectiveClip.endTime } : null,
    initialCurrentClip: initialCurrentClip ? { id: initialCurrentClip.id, startTime: initialCurrentClip.startTime, endTime: initialCurrentClip.endTime } : null
  });

  const disableTextarea = isLoadingMedia || isSavingMedia;
  const clipDisplayName = focusedClip ? (focusedClip.displayName || 'Custom Clip') : getCurrentClipDisplayName();

  // Inline formatSecondsToMMSS for now
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

  return (
    <TooltipProvider>
    <div className="w-full flex flex-col md:flex-row gap-y-4 md:gap-y-0 md:gap-x-2">
    {/* Left Pane */}
        <div ref={leftPaneRef} className="w-full space-y-4 resize-none overflow-visible md:w-auto md:min-w-[15rem] md:max-w-[50%] md:overflow-auto">
          <VideoPlayer
            key={`${mediaSrc}-${effectiveClip.startTime}-${effectiveClip.endTime}`}
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
                  {displayClip && clips.length > 1 && (
                    <ClipOptionsDropdown
                      currentClipIndex={currentClipIndex}
                      onRemoveClip={onRemoveClip}
                      clipId={displayClip.id}
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
                  triggerScrollToFirstClipKey={clipNavScrollToTopKey}
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

        {/* Resize Handle */}
        <div className="-mx-1.5 hidden md:flex items-center justify-center cursor-col-resize select-none" onMouseDown={onMouseDown}>
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>

        {/* Right Pane */}
        <div className="w-full md:flex-1 md:min-w-0 relative">
          {showClipTrimmer && (
            <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm rounded-lg border-2 border-primary/20 flex items-center justify-center">
              <div className="text-center p-8 max-w-md">
                <div className="mb-4 mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <Focus className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-primary mb-3">Focus on Clip Trimmer</h3>
                <p className="text-muted-foreground mb-4 leading-relaxed">
                  Use the <strong>Clip Trimmer</strong> to select your custom clip range.
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
              <Keyboard className="h-4 w-4 md:h-5 md:w-5 pr-1 flex-shrink-0" />
                <span className="truncate block">Your Transcription</span>
              </TabsTrigger>
              <TabsTrigger
                value="ai"
                disabled={disableTextarea || !aiToolsState.canAccessAITools}
                className="flex-1 flex items-center justify-center gap-1 md:gap-2 text-sm px-1 md:px-3 min-w-0"
              >
                <Sparkles className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
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
                <CircleCheckBig className="lg:inline-block h-3 w-3 flex-shrink-0" />
                <span className="truncate block">Saved Attempts</span>
              </Button>
            </TabsList>

            <TabsContent value="manual" className="mt-4">
              <TranscriptionTab
                currentClip={displayClip}
                userTranscriptionInput={userTranscriptionInput}
                onUserInputChange={handleUserInputChange}
                onSaveAndUnlockAI={handleSaveOrUpdate}
                isTranscriptionSaved={isTranscriptionSaved}
                videoPlayerRef={videoPlayerRef}
                effectiveClip={effectiveClip}
                currentPlaybackTime={currentPlaybackTime}
                isCurrentClipPlaying={isCurrentClipPlaying}
                isLooping={isLooping}
                setIsLooping={setIsLooping}
                playbackRate={playbackRate}
                setPlaybackRate={setPlaybackRate}
                mediaSrc={mediaSrc}
                language={language}
                clipDisplayName={clipDisplayName}
                disableTextarea={disableTextarea}
                onTabChange={handleTabChange}
              />
            </TabsContent>

            <TabsContent value="ai" className="mt-4">
              <AIToolsTab
                currentClip={displayClip}
                userTranscriptionInput={userTranscriptionInput}
                videoPlayerRef={videoPlayerRef}
                effectiveClip={effectiveClip}
                currentPlaybackTime={currentPlaybackTime}
                isCurrentClipPlaying={isCurrentClipPlaying}
                isLooping={isLooping}
                setIsLooping={setIsLooping}
                playbackRate={playbackRate}
                setPlaybackRate={setPlaybackRate}
                mediaSrc={mediaSrc}
                clipDisplayName={clipDisplayName}
                disableTextarea={disableTextarea}
                translationTargetLanguage={translationTargetLanguage}
                setTranslationTargetLanguage={setTranslationTargetLanguage}
                currentClipIndex={currentClipIndex}
                isLoadingMedia={isLoadingMedia}
                isSavingMedia={isSavingMedia}
                isAnyClipTranscribing={isAnyClipTranscribing}
                isCurrentClipTranscribing={isCurrentClipTranscribing}
                isCurrentClipTranslating={isCurrentClipTranslating}
                isCurrentClipComparing={isCurrentClipComparing}
                onTranscribeAudio={onTranscribeAudio}
                onGetCorrections={onGetCorrections}
                onTranslate={onTranslate}
                focusedClip={focusedClip}
                isAudioSource={isAudioSource}
                aiToolsState={aiToolsState}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  );
}
