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

  // Core state
  const [userTranscriptionInput, setUserTranscriptionInput] = useState(initialCurrentClip.userTranscription || "");
  const [activeTab, setActiveTab] = useState<string>("manual");
  const [hasUserManuallyChangedTab, setHasUserManuallyChangedTab] = useState(false);
  const [isTranscriptionSaved, setIsTranscriptionSaved] = useState(false);

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
    let hydratedClip = initialCurrentClip;
    if (!hydratedClip) {
      // If initialCurrentClip is null/undefined, try to create a default empty clip structure
      // to prevent errors, though this scenario should ideally be handled upstream.
      setDisplayClip({ id: '', startTime: 0, endTime: 0 });
      return;
    }
    try {
      const aiToolsCache = JSON.parse(localStorage.getItem("reel-fluent-ai-tools-cache") || "{}");
      hydratedClip = hydrateClipWithAIData(initialCurrentClip, activeMediaSourceId, sessionClips, aiToolsCache);
    } catch (e) {
      console.warn("Error hydrating clip in TranscriptionWorkspace:", e);
      hydratedClip = initialCurrentClip; // Fallback
    }
    setDisplayClip(hydratedClip);
    // DO NOT set userTranscriptionInput or other UI states here directly from hydratedClip
    // to avoid interrupting user input. Let another useEffect handle initial population.

  }, [initialCurrentClip, activeMediaSourceId, sessionClips]);

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
    : focusedClip || displayClip;

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
      <div className="flex flex-col md:flex-row gap-y-4 md:gap-y-0 md:gap-x-2 p-3 sm:p-4 md:p-6">
        {/* Left Pane */}
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
        <div className="hidden md:flex items-center justify-center px-1 cursor-col-resize select-none" onMouseDown={onMouseDown}>
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
