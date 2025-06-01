"use client";

import type * as React from 'react';
import { useState, useEffect, useRef, useCallback } from "react";
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
import { Sparkles, FileDiff, Languages, PlayIcon, PauseIcon, Mic, Lock, Unlock, SkipBack, SkipForward, Scissors, Eye, Save, List, BookmarkPlus, XIcon, GripVertical, MoreHorizontal, Film, Trash2 as Trash2Icon } from "lucide-react";
import ClipNavigation from "./ClipNavigation";
import ClipDurationSelector from "./ClipDurationSelector";
import ClipTrimmer from "./ClipTrimmer";
import TranslationLanguageSelector from "./TranslationLanguageSelector";
import type { Clip } from '@/lib/videoUtils';
import type { CorrectionToken } from '@/ai/flows/compare-transcriptions-flow';
import { useToast } from "@/hooks/use-toast";
import { getLanguageLabel } from "@/lib/languageOptions";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  onSaveToSession: (userTranscriptionInput: string) => void;
  onOpenSessionDrawer?: () => void;
  canSaveToSession: boolean;
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
        {isCurrentClipPlaying ? "Playing" : "Paused"} &ndash; {focusedClip ? (focusedClip.displayName || 'Custom Clip') : `Clip ${currentClipIndex + 1}`}
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

// Helper function to determine if AI tools should be enabled
const shouldEnableAITools = (userInput: string, automatedTranscription?: string | null): boolean => {
  const hasTranscription = userInput.trim().length > 0;
  const hasExistingTranscription = Boolean(
    automatedTranscription &&
    !automatedTranscription.startsWith("Error:") &&
    automatedTranscription !== "Transcribing..."
  );

  return hasTranscription || hasExistingTranscription;
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
  // Focused clip functionality
  mediaDuration = 0,
  focusedClip = null,
  showClipTrimmer = false,
  onCreateFocusedClip,
  onToggleClipTrimmer,
  onBackToAutoClips,
  onSaveToSession,
  onOpenSessionDrawer,
  canSaveToSession,
}: TranscriptionWorkspaceProps) {
  // DRY: Extracted Saved Attempts button
  const reviewPracticeButton = (
    <div className="flex gap-2">
      <Button
        variant="secondary"
        className="w-full flex items-center justify-center gap-2 h-auto py-3 transition-all duration-200 hover:bg-primary/90 hover:text-primary-foreground hover:shadow-lg"
        onClick={onOpenSessionDrawer}
      >
        <List className="h-4 w-4" />
        Saved Attempts
      </Button>
    </div>
  );
  const [userTranscriptionInput, setUserTranscriptionInput] = useState(currentClip.userTranscription || "");
  const [activeTab, setActiveTab] = useState<string>("manual");
  const [hasUserManuallyChangedTab, setHasUserManuallyChangedTab] = useState(false);
  const [lastUserSelectedTab, setLastUserSelectedTab] = useState<string>("manual");
  const [isTranscriptionComplete, setIsTranscriptionComplete] = useState(false);
  const [isTranscriptionInProgress, setIsTranscriptionInProgress] = useState(false);
  const [localTranscribingState, setLocalTranscribingState] = useState<string | null>(null);
  const { toast } = useToast();
  const videoPlayerRef = useRef<VideoPlayerRef>(null);
  const [isCurrentClipPlaying, setIsCurrentClipPlaying] = useState(false);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(currentClip?.startTime || 0);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [translationTargetLanguage, setTranslationTargetLanguage] = useState(currentClip.translationTargetLanguage || "english");

  // Preview clip state
  const [previewClip, setPreviewClip] = useState<{ startTime: number; endTime: number } | null>(null);

  // Add a new state to track if current transcription is saved
  const [isTranscriptionSaved, setIsTranscriptionSaved] = useState(true);

  // Ref for left pane to reset width on small screens
  const leftPaneRef = useRef<HTMLDivElement>(null);
  // Dragging state for split-handle
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  // Clear inline width when viewport is narrower than large breakpoint
  useEffect(() => {
    const handleResize = () => {
      if (leftPaneRef.current && window.innerWidth < 1024) {
        leftPaneRef.current.style.removeProperty('width');
      }
    };
    window.addEventListener('resize', handleResize);
    // initial check
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  // Set up global mousemove/up for dragging
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !leftPaneRef.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = startWidth.current + delta;
      const minWidth = 15 * 16; // 15rem
      const maxWidth = window.innerWidth * 0.5; // 50%
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
  // Mouse-down on gutter starts dragging
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth < 1024) return;
    isDragging.current = true;
    startX.current = e.clientX;
    if (leftPaneRef.current) {
      startWidth.current = leftPaneRef.current.getBoundingClientRect().width;
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Stable callback for media time updates to prevent remount flicker
  const handlePlayerTimeUpdate = useCallback((time: number) => {
    setCurrentPlaybackTime(time);
  }, []);

  // Reset to manual tab when media source changes
  useEffect(() => {
    if (mediaSrc) {
      setActiveTab("manual");
      setHasUserManuallyChangedTab(false);
      setLastUserSelectedTab("manual");
      setIsTranscriptionComplete(false);
      setIsTranscriptionInProgress(false);
      // Reset user input when media changes
      setUserTranscriptionInput("");
    }
  }, [mediaSrc]);

  // Reset states when clip changes
  useEffect(() => {
    setUserTranscriptionInput(currentClip.userTranscription || "");
    setTranslationTargetLanguage(currentClip.translationTargetLanguage || "english");
    setIsTranscriptionComplete(false);
    setIsTranscriptionInProgress(false);

    // Only reset tab if there's no transcription data
    if (!currentClip.automatedTranscription || currentClip.automatedTranscription === "Transcribing...") {
      setActiveTab("manual");
      setHasUserManuallyChangedTab(false);
      setLastUserSelectedTab("manual");
    } else {
      // If there is transcription data, restore the last user selected tab
      setActiveTab(lastUserSelectedTab);
    }
  }, [currentClip.id]);

  // Watch for transcription state changes
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

  // Custom tab change handler to track manual user interactions
  const handleTabChange = useCallback((newTab: string) => {
    if (isTranscriptionInProgress) {
      // Don't allow tab changes during transcription
      return;
    }

    if (newTab === "ai" && !isTranscriptionSaved) {
      toast({
        variant: "destructive",
        title: "Save Required",
        description: "Please save your transcription before accessing AI tools."
      });
      return;
    }

    setActiveTab(newTab);
    setHasUserManuallyChangedTab(true);
    setLastUserSelectedTab(newTab);
  }, [isTranscriptionInProgress, isTranscriptionSaved]);

  // Modified tab switching logic
  useEffect(() => {
    // Only switch tabs in specific cases:
    // 1. When user hasn't manually changed tabs AND
    // 2. When AI tools should be locked (not enough user input and no transcription)
    if (!hasUserManuallyChangedTab) {
      const aiToolsEnabled = shouldEnableAITools(userTranscriptionInput, currentClip.automatedTranscription);
      if (!aiToolsEnabled && activeTab === "ai") {
        setActiveTab("manual");
      }
    } else if (isTranscriptionComplete && !isTranscriptionInProgress) {
      // If transcription is complete and user had previously selected AI tab, restore it
      if (lastUserSelectedTab === "ai") {
        setActiveTab("ai");
      }
    }
  }, [hasUserManuallyChangedTab, userTranscriptionInput, activeTab, isTranscriptionComplete, isTranscriptionInProgress, lastUserSelectedTab, currentClip.automatedTranscription]);

  // Separate useEffect for resetting playback time only when clip changes
  useEffect(() => {
    setCurrentPlaybackTime(currentClip?.startTime || 0);
    setPlaybackRate(1.0); // Reset to normal speed when switching clips
    // Only clear preview clip when actually switching between different clips
    // Don't clear it when just re-rendering the same clip
    setPreviewClip(null);
  }, [currentClip.id]); // Only run when clip ID changes

  // Clear preview clip when ClipTrimmer is hidden
  useEffect(() => {
    if (!showClipTrimmer) {
      setPreviewClip(null);
      if (videoPlayerRef.current) {
        videoPlayerRef.current.pause();
      }
    }
  }, [showClipTrimmer]); // Removed previewClip dependency to prevent infinite loops

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

  // Update handleUserInputChange to mark transcription as unsaved
  const handleUserInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setUserTranscriptionInput(newValue);
    setIsTranscriptionSaved(false);
  };

  const handleTranscribeClip = async () => {
    if (!currentClip || (isAudioSource && !mediaSrc)) {
      toast({variant: "destructive", title: "Cannot Transcribe", description: "Please ensure media is loaded and a clip is selected."});
      return;
    }

    // Set loading state immediately
    const clipId = currentClip.id;
    setLocalTranscribingState(clipId);
    setIsTranscriptionInProgress(true);

    try {
      await onTranscribeAudio(clipId);
      // Only auto-save if this is a new clip (not already in session) and canSaveToSession is true
      if (onSaveToSession && canSaveToSession) {
        onSaveToSession(userTranscriptionInput);
      }
    } catch (error) {
      console.warn("Transcription error in workspace:", error);
      toast({
        variant: "destructive",
        title: "Transcription Failed",
        description: "Failed to transcribe the clip. Please try again."
      });
    } finally {
      setLocalTranscribingState(null);
      setIsTranscriptionInProgress(false);
    }
  };

  const handleTranslate = async () => {
    if (currentClip.automatedTranscription === null ||
        currentClip.automatedTranscription === undefined ||
        currentClip.automatedTranscription.startsWith("Error:") ||
        currentClip.automatedTranscription === "Transcribing...") {
      toast({variant: "destructive", title: "Cannot Translate", description: "Please ensure automated transcription is successful first."});
      return;
    }

    try {
      await onTranslate(currentClip.id, translationTargetLanguage);
      // Only auto-save if this is a new clip (not already in session) and canSaveToSession is true
      if (onSaveToSession && canSaveToSession) {
        onSaveToSession(userTranscriptionInput);
      }
    } catch (error) {
      console.warn("Translation error in workspace:", error);
    }
  };

  // Update handleGetCorrections to check for saved state
  const handleGetCorrections = useCallback(async () => {
    if (!isTranscriptionSaved) {
      toast({
        variant: "destructive",
        title: "Save Required",
        description: "Please save your transcription before comparing with AI."
      });
      return;
    }

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
      // Only auto-save if this is a new clip (not already in session) and canSaveToSession is true
      if (onSaveToSession && canSaveToSession) {
        onSaveToSession(userTranscriptionInput);
      }
    } catch (error) {
      console.warn("Corrections error in workspace:", error);
    }
  }, [currentClip, userTranscriptionInput, onGetCorrections, onSaveToSession, canSaveToSession, isTranscriptionSaved]);

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
    // If we have a translation and it matches our target language, use it
    if (currentClip.translation !== undefined && currentClip.translationTargetLanguage === translationTargetLanguage) {
      return currentClip.translation;
    }

    // If target language is english and we have the legacy englishTranslation field, use it
    if (translationTargetLanguage === 'english' && currentClip.englishTranslation !== undefined) {
      return currentClip.englishTranslation;
    }

    // No translation available for current target
    return null;
  };

  // Handle preview clip start
  const handlePreviewClip = useCallback((startTime: number, endTime: number) => {
    setPreviewClip({ startTime, endTime });
    // Start playing the preview after a small delay to ensure state is set
    setTimeout(() => {
      if (videoPlayerRef.current) {
        videoPlayerRef.current.seek(startTime);
        videoPlayerRef.current.play(); // VideoPlayerRef.play() handles errors internally
      }
    }, 50);
  }, []);

  // Handle preview clip stop
  const handleStopPreview = useCallback(() => {
    setPreviewClip(null);
    if (videoPlayerRef.current) {
      videoPlayerRef.current.pause();
      // Reset to the original clip's start time
      setTimeout(() => {
        if (videoPlayerRef.current && currentClip) {
          videoPlayerRef.current.seek(currentClip.startTime);
        }
      }, 50);
    }
  }, [currentClip]);

  // Determine which clip times to use for the VideoPlayer
  const effectiveClip = previewClip ? { ...currentClip, startTime: previewClip.startTime, endTime: previewClip.endTime } : currentClip;

  // Consolidated save function: saves clip and transcription or updates transcription
  const handleSaveOrUpdate = useCallback(() => {
    if (!currentClip || !onSaveToSession) return;

    // Check if there's any transcription to save
    const hasTranscription = userTranscriptionInput.trim().length > 0;

    // If there's no transcription, show error and return
    if (!hasTranscription) {
      toast({
        title: "Nothing to Save",
        description: "Please write a transcription before saving."
      });
      return;
    }

    // Update clip with user's transcription
    onUserTranscriptionChange(currentClip.id, userTranscriptionInput);
    // Save or update session clip, passing newest transcription
    onSaveToSession(userTranscriptionInput);
    setIsTranscriptionSaved(true);

    // Only show notification for new clips being added to session
    if (canSaveToSession) {
      toast({
        title: "Transcription Attempt Saved",
        description: "Your transcription attempt is saved! Use the Saved Attempts button to the left of the AI Tools to review or make changes anytime."
      });
    }
    // No notification needed for updates - UI feedback is sufficient
  }, [currentClip, userTranscriptionInput, onUserTranscriptionChange, onSaveToSession, canSaveToSession, toast]);

  // Reset saved state when clip changes
  useEffect(() => {
    setIsTranscriptionSaved(true);
  }, [currentClip.id]);

  // Add refs for clip navigation
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeClipRef = useRef<HTMLButtonElement>(null);

  // Add handleClipClick function
  const handleClipClick = useCallback((index: number) => {
    onSelectClip(index);
    // Ensure clip is visible after selection
    setTimeout(() => {
      if (activeClipRef.current && scrollContainerRef.current) {
        const scrollAreaViewport = scrollContainerRef.current.closest('[data-radix-scroll-area-viewport]') as HTMLElement;
        if (scrollAreaViewport) {
          const clipButton = activeClipRef.current;
          const clipLeftRelative = clipButton.offsetLeft;
          const clipWidth = clipButton.offsetWidth;
          const scrollLeft = scrollAreaViewport.scrollLeft;
          const viewportWidth = scrollAreaViewport.clientWidth;
          const margin = 16;
          const isClippedLeft = clipLeftRelative < scrollLeft + margin;
          const isClippedRight = clipLeftRelative + clipWidth > scrollLeft + viewportWidth - margin;
          if (isClippedLeft || isClippedRight) {
            let newScrollLeft = scrollLeft;
            if (isClippedLeft) {
              newScrollLeft = clipLeftRelative - margin;
            } else if (isClippedRight) {
              newScrollLeft = clipLeftRelative + clipWidth - viewportWidth + margin;
            }
            scrollAreaViewport.scrollTo({
              left: Math.max(0, newScrollLeft),
              behavior: 'smooth'
            });
          }
        }
      }
    }, 10);
  }, [onSelectClip]);

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

  // Basic state checks
  const disableTextarea = isLoadingMedia || isSavingMedia;
  const disableCurrentClipAIActions = isAutomatedTranscriptionLoading || isLoadingMedia || isSavingMedia;
  const canGetCorrections = userTranscriptionInput.trim() && currentClip.automatedTranscription && !isAutomatedTranscriptionError;
  const canTranslate = currentClip.automatedTranscription && !isAutomatedTranscriptionError && !isAutomatedTranscriptionLoading;

  // AI tools enabled check depends only on saved state and basic validation
  const aiToolsEnabled = isTranscriptionSaved && shouldEnableAITools(userTranscriptionInput, currentClip.automatedTranscription);

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
      <div className="flex flex-col lg:flex-row gap-y-4 lg:gap-y-0 lg:gap-x-2 p-3 sm:p-4 md:p-6">
        <div ref={leftPaneRef} className="w-full space-y-4 resize-none overflow-visible lg:w-auto lg:min-w-[15rem] lg:max-w-[50%] lg:overflow-auto">
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
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-primary flex items-center gap-2 -ml-1">
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
              {/* Auto Clip Controls */}
              <div className="space-y-3 p-3 bg-card rounded-lg shadow">
                <div className="flex justify-between items-center mb-2">
                  <ClipDurationSelector
                    selectedDuration={clipSegmentationDuration}
                    onDurationChange={onClipDurationChange}
                    disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
                  />
                  {currentClip && clips.length > 1 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                          disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
                          aria-label="Clip options"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="left" align="center" className="w-48">
                        <DropdownMenuItem
                          onClick={() => onRemoveClip(currentClip.id)}
                          className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                        >
                          <Trash2Icon className="h-4 w-4 mr-2" />
                          Remove Clip {currentClipIndex + 1}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                <ScrollArea className="w-full whitespace-nowrap rounded-md">
                  <div ref={scrollContainerRef} className="flex space-x-3 px-1 pt-1 pb-3.5">
                    {clips.map((clip, index) => (
                      <Button
                        key={clip.id}
                        ref={index === currentClipIndex ? activeClipRef : null}
                        variant={index === currentClipIndex ? "default" : "outline"}
                        className={cn(
                          "h-auto py-2 px-3 flex-shrink-0 shadow-sm hover:shadow-md transition-all duration-150 ease-in-out group",
                          index === currentClipIndex ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border"
                        )}
                        onClick={() => handleClipClick(index)}
                      >
                        <div className="flex flex-col items-start text-left">
                          <div className="flex items-center gap-1.5">
                            <Film className="h-4 w-4 text-inherit" />
                            <span className="font-semibold text-xs">
                              Clip {index + 1}
                            </span>
                          </div>
                          <span className={cn(
                            "text-xs",
                            index === currentClipIndex
                              ? "text-primary-foreground/80"
                              : "text-muted-foreground group-hover:text-accent-foreground"
                          )}>
                            {formatSecondsToMMSS(clip.startTime)} - {formatSecondsToMMSS(clip.endTime)}
                          </span>
                        </div>
                      </Button>
                    ))}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
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
                  {isAnyClipTranscribing
                    ? "Create Custom Clip"
                    : showClipTrimmer
                      ? "Hide Clip Trimmer"
                      : "Create Custom Clip"
                  }
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
            </div>
          )}
        </div>

        {/* Gutter handle for resizing */}
        <div className="hidden lg:flex items-center justify-center px-1 cursor-col-resize select-none" onMouseDown={onMouseDown}>
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="w-full lg:flex-1 lg:min-w-0">
          <Tabs defaultValue="manual" value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="flex w-full gap-2 whitespace-nowrap lg:grid lg:grid-cols-[1fr_1fr_auto] lg:overflow-visible min-h-[2.25rem]">
              <TabsTrigger value="manual" disabled={disableTextarea} className="flex-1 text-xs sm:text-sm">Your Transcription</TabsTrigger>
              <TabsTrigger
                value="ai"
                disabled={disableTextarea || !aiToolsEnabled}
                className="flex-1 flex items-center justify-center gap-2 text-xs sm:text-sm"
              >
                {aiToolsEnabled ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                AI Tools
              </TabsTrigger>
              <Button
                variant="ghost"
                onClick={onOpenSessionDrawer}
                className={cn(
                  "flex-1 h-9 flex items-center justify-center gap-2 text-xs sm:text-sm rounded-none",
                  "transition-all duration-200",
                  "hover:bg-primary/10 hover:text-primary hover:shadow-sm",
                  "data-[state=active]:bg-background data-[state=active]:shadow-sm"
                )}
              >
                <List className="hidden sm:inline-block h-3 w-3" />
                Saved Attempts
              </Button>
            </TabsList>

            <TabsContent value="manual" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Type What You Hear</CardTitle>
                  <CardDescription>
                    Listen to {focusedClip ? (focusedClip.displayName || 'Custom Clip') : `Clip ${currentClipIndex + 1}`} ({formatSecondsToMMSS(currentClip.startTime)} - {formatSecondsToMMSS(currentClip.endTime)}) and type the dialogue.
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
                   <Button
                     onClick={() => {
                       handleSaveOrUpdate();
                       if (isTranscriptionSaved) {
                         handleTabChange("ai");
                       }
                     }}
                     disabled={disableTextarea}
                     variant="secondary"
                     className="w-full flex items-center justify-center gap-2 transition-all duration-200 hover:bg-primary/90 hover:text-primary-foreground hover:shadow-lg"
                   >
                     {isTranscriptionSaved ? <Unlock className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                     Save & Unlock AI Tools
                   </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="ai" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Transcription Support</CardTitle>
                  <CardDescription>
                  Compare the Automated Transcription with your version and translate to available languages.                  </CardDescription>
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

                  <div className="space-y-2">
                    <h3 className="font-semibold mb-2 text-foreground">Automated Transcription:</h3>
                    <Button
                      onClick={handleTranscribeClip}
                      className="w-full mb-2"
                      disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      {isAnyClipTranscribing ? "Transcribing..." : focusedClip ? "Transcribe Focused Clip" : `Transcribe Clip ${currentClipIndex + 1}`}
                    </Button>
                    <ScrollArea className="h-[100px] w-full rounded-md border p-3 bg-muted/50" resizable>
                      {currentClip.automatedTranscription === "Transcribing..." && <ThreeDotsLoader className="mx-auto my-4" />}
                      {currentClip.automatedTranscription && currentClip.automatedTranscription !== "Transcribing..." ? <p className="text-sm">{currentClip.automatedTranscription}</p> : null}
                      {!currentClip.automatedTranscription && <p className="text-sm text-muted-foreground">Click "Transcribe" above to generate.</p>}
                    </ScrollArea>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-1 text-foreground">Your Transcription:</h3>
                    <ScrollArea className="h-[70px] w-full rounded-md border p-3 bg-muted/30" resizable>
                       {userTranscriptionInput ?
                          <p className="text-sm whitespace-pre-wrap">{userTranscriptionInput}</p> :
                          <p className="text-sm text-muted-foreground">You haven't typed anything for this clip yet.</p>
                       }
                    </ScrollArea>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Transcription Comparison:</h3>
                     <Button
                      onClick={handleGetCorrections}
                      disabled={!canGetCorrections || isCorrectionsLoading || isAnyClipTranscribing}
                      className="w-full"
                    >
                      <FileDiff className="mr-2 h-4 w-4" />
                      {isCorrectionsLoading ? "Comparing..." : "Get Corrections"}
                    </Button>
                    <ScrollArea className="h-[120px] w-full rounded-md border p-3 bg-muted/50" resizable>
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
