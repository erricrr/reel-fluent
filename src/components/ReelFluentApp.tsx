"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Header from "./Header";
import VideoInputForm from "./VideoInputForm";
import LanguageSelector from "./LanguageSelector";
import ClipDurationSelector from "./ClipDurationSelector";
import TranscriptionWorkspace from "./TranscriptionWorkspace";
import MediaSourceList from "./MediaSourceList";
import { MediaProcessingLoader, YouTubeProcessingLoader } from "./ProcessingLoader";
import SessionClipsManager from './SessionClipsManager';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CircleCheckBig, X as XIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatSecondsToMMSS } from '@/lib/timeUtils';
import { useAuth } from '@/contexts/AuthContext';
import { saveMediaItemAction } from '@/app/actions';
import { isYouTubeUrl } from '@/lib/youtubeUtils';
import { cn } from "@/lib/utils";
import { ToastAction } from "@/components/ui/toast";

// Import our custom hooks
import { useMediaSources, type MediaSource, type SessionClip } from "@/hooks/useMediaSources";
import { useClipManagement } from "@/hooks/useClipManagement";
import { useMediaProcessing } from "@/hooks/useMediaProcessing";
import { useAIOperations } from "@/hooks/useAIOperations";
import { generateClips, createFocusedClip, extractAudioFromVideoSegment, type Clip } from '@/lib/videoUtils';
import { hydrateClipWithAIData } from '@/lib/aiToolsHydration';

const SEGMENTATION_PREFS_KEY = "reel-fluent-segmentation-prefs";
const DEFAULT_SEGMENTATION_DURATION_MS = 15000; // Default to 15 seconds

// Helper to get segmentation preferences
const getSegmentationPreferences = (): Record<string, number> => {
  if (typeof window === 'undefined') return {};
  try {
    const prefs = localStorage.getItem(SEGMENTATION_PREFS_KEY);
    return prefs ? JSON.parse(prefs) : {};
  } catch (e) {
    console.error("Error reading segmentation preferences:", e);
    return {};
  }
};

// Helper to get a specific preference
const getSegmentationPreference = (mediaSourceId: string): number | null => {
  const prefs = getSegmentationPreferences();
  return prefs[mediaSourceId] || null;
};

// Helper to set a specific preference
const setSegmentationPreference = (mediaSourceId: string, durationMs: number): void => {
  if (typeof window === 'undefined' || !mediaSourceId) return;
  try {
    const prefs = getSegmentationPreferences();
    prefs[mediaSourceId] = durationMs;
    localStorage.setItem(SEGMENTATION_PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error("Error saving segmentation preference:", e);
  }
};

export default function ReelFluentApp() {
  // Basic UI state
  const [language, setLanguage] = useState<string>("vietnamese");
  const [clipSegmentationDuration, setClipSegmentationDuration] = useState<number>(DEFAULT_SEGMENTATION_DURATION_MS);

  // Destructure from useMediaSources first
  const mediaSourcesHookValues = useMediaSources();
  const {
    mediaSources, activeMediaSourceId, sessionClips,
    addMediaSource, removeMediaSource, selectMediaSource, updateMediaSource,
    addSessionClip, removeSessionClip, updateSessionClip,
  } = mediaSourcesHookValues;

  // Then destructure from useClipManagement
  const clipManagementHookValues = useClipManagement(language);
  const {
    clips, currentClipIndex, focusedClip, showClipTrimmer,
    isAnyClipTranscribing, workInProgressClips, clipsRef,
    generateClipsFromDuration,
    selectClip, createCustomClip, backToAutoClips, updateClip,
    removeClip: removeClipFromManager,
    updateUserTranscription, setTranscribingState, setTranslatingState, getCurrentClip,
    createEnhancedClips, enhanceClipWithSessionData,
    setClips, setCurrentClipIndex, setFocusedClip, setShowClipTrimmer, setIsAnyClipTranscribing, setWorkInProgressClips
  } = clipManagementHookValues;

  const mediaProcessingHookValues = useMediaProcessing();
  const {
    isLoading, isSaving, isYouTubeProcessing, processingProgress, processingStatus,
    youtubeVideoInfo, processFile, processYouTubeUrl, resetProcessingState,
    cleanupObjectUrl, cleanupBlobUrl, setIsSaving, globalAppBusyState
  } = mediaProcessingHookValues;

  const aiOperationsHookValues = useAIOperations();
  const {
    transcribeClip, translateClip, getCorrections, isAnyOperationInProgress,
    isClipTranscribing, isClipTranslating, isClipGettingCorrections
  } = aiOperationsHookValues;

  // Current media state
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined);
  const [mediaSrc, setMediaSrc] = useState<string | undefined>(undefined);
  const [mediaDisplayName, setMediaDisplayName] = useState<string | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number>(0);
  const [currentSourceType, setCurrentSourceType] = useState<'video' | 'audio' | 'url' | 'unknown' | null>(null);

  // Dialog states
  const [showCustomClipNaming, setShowCustomClipNaming] = useState<boolean>(false);
  const [pendingCustomClip, setPendingCustomClip] = useState<{ startTime: number; endTime: number } | null>(null);
  const [customClipName, setCustomClipName] = useState<string>("");
  const [isSessionDrawerOpen, setSessionDrawerOpen] = useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [pendingDeleteSourceId, setPendingDeleteSourceId] = useState<string | null>(null);

  // Hooks
  const { user } = useAuth();
  const { toast } = useToast();

  // Drawer refs
  const drawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  // Enhanced clips with session data
  const enhancedClips = useMemo(() => {
    return createEnhancedClips(sessionClips, activeMediaSourceId);
  }, [createEnhancedClips, sessionClips, activeMediaSourceId]);

  // Current clip - use focused clip if available, otherwise use indexed clip
  const currentClipToDisplay = focusedClip || (clips[currentClipIndex] || null);
  const isYouTubeVideoCheck = sourceUrl ? isYouTubeUrl(sourceUrl) : false;

  // Utility functions
  const generateUniqueId = () => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Media upload handlers
  const handleFileUpload = useCallback(async (file: File) => {
    await processFile(file, (src, displayName, duration, type) => {
      const mediaSource: MediaSource = {
        id: generateUniqueId(),
        src,
        displayName,
        type,
        duration,
        language
      };

      if (addMediaSource(mediaSource)) {
        selectMediaSource(mediaSource.id);
        setMediaSrc(src);
        setMediaDisplayName(displayName);
        setMediaDuration(duration);
        setCurrentSourceType(type);
        setSourceFile(file);
        setSourceUrl(undefined);
        generateClipsFromDuration(duration, clipSegmentationDuration);
      }
    });
  }, [processFile, addMediaSource, selectMediaSource, generateClipsFromDuration, clipSegmentationDuration, language]);

  const handleUrlSubmit = useCallback(async (url: string) => {
    setSourceUrl(url);

    if (isYouTubeUrl(url)) {
      // Handle YouTube URLs
      await processYouTubeUrl(url, (src, displayName, duration, videoInfo) => {
        const mediaSource: MediaSource = {
          id: generateUniqueId(),
          src,
          displayName,
          type: 'audio', // YouTube videos are processed as audio files
          duration,
          language // Add the selected language
        };

        if (addMediaSource(mediaSource)) {
          selectMediaSource(mediaSource.id);
          setMediaSrc(src);
          setMediaDisplayName(displayName);
          setMediaDuration(duration);
          setCurrentSourceType('audio'); // Set as audio since we extract audio from YouTube
          setSourceFile(null);
          generateClipsFromDuration(duration, clipSegmentationDuration);
        }
      });
    } else {
      // Handle direct media URLs (MP3, WAV, MP4, WebM, etc.)
      try {
        // Extract filename from URL for display name
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').pop() || 'Media File';
        const displayName = decodeURIComponent(filename);

        // Determine media type from URL extension
        const extension = pathname.toLowerCase().split('.').pop() || '';
        const isVideoExtension = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(extension);
        const isAudioExtension = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(extension);

        let mediaType: 'video' | 'audio' | 'url' = 'url';
        if (isVideoExtension) {
          mediaType = 'video';
        } else if (isAudioExtension) {
          mediaType = 'audio';
        }

        // Load the media to get its actual duration
        const getDuration = (): Promise<number> => {
          return new Promise((resolve, reject) => {
            const media = mediaType === 'video' ? document.createElement('video') : document.createElement('audio');
            media.crossOrigin = 'anonymous';
            media.preload = 'metadata';

            const timeout = setTimeout(() => {
              media.src = '';
              reject(new Error('Timeout loading media metadata'));
            }, 10000); // 10 second timeout

            media.onloadedmetadata = () => {
              clearTimeout(timeout);
              const duration = media.duration;
              media.src = ''; // Clean up
              if (isNaN(duration) || duration <= 0) {
                reject(new Error('Invalid media duration'));
              } else {
                resolve(duration);
              }
            };

            media.onerror = () => {
              clearTimeout(timeout);
              media.src = ''; // Clean up
              reject(new Error('Failed to load media from URL. The server may not allow cross-origin requests.'));
            };

            media.src = url;
          });
        };

        const duration = await getDuration();

        const mediaSource: MediaSource = {
          id: generateUniqueId(),
          src: url, // Use the URL directly
          displayName,
          type: mediaType,
          duration: duration, // Use the actual duration we just got
          language // Add the selected language
        };

        if (addMediaSource(mediaSource)) {
          selectMediaSource(mediaSource.id);
          setMediaSrc(url);
          setMediaDisplayName(displayName);
          setMediaDuration(duration); // Set the actual duration
          setCurrentSourceType(mediaType);
          setSourceFile(null);
          generateClipsFromDuration(duration, clipSegmentationDuration); // Generate clips immediately since we have duration
        }

        toast({
          title: "Direct Media URL Added",
          description: `Added "${displayName}" (${formatSecondsToMMSS(duration)}) from direct URL.`,
        });
      } catch (error) {
        console.error('Direct URL processing error:', error);
        toast({
          variant: "destructive",
          title: "Invalid URL",
          description: error instanceof Error ? error.message : "Please enter a valid YouTube URL or direct media file URL.",
        });
      }
    }
  }, [processYouTubeUrl, addMediaSource, selectMediaSource, generateClipsFromDuration, clipSegmentationDuration, toast, language]);

  // Media source management
  const handleSelectMediaSource = useCallback((sourceId: string) => {
    const source = mediaSources.find(s => s.id === sourceId);
    if (!source) return;

    // Clear current state first
    setFocusedClip(null);
    setShowClipTrimmer(false);

    // Update to new source
    selectMediaSource(sourceId);
    setMediaSrc(source.src);
    setMediaDisplayName(source.displayName);
    setMediaDuration(source.duration);
    setCurrentSourceType(source.type);

    // Reset clip selection to first clip
    selectClip(0);

    // Update source file/url appropriately
    setSourceFile(null); // Always clear the file since we don't store original files

    // Set sourceUrl based on whether this was originally from a URL
    if (source.type === 'url' || (source.type === 'audio' && source.src.startsWith('blob:'))) {
      // This is either a direct URL or YouTube (which creates blob URLs)
      // For YouTube, we'll lose the original URL but that's okay
      setSourceUrl(source.type === 'url' ? source.src : undefined);
    } else {
      // This was a file upload
      setSourceUrl(undefined);
    }

    // Generate clips for this source
    if (source.duration > 0) {
      generateClipsFromDuration(source.duration, clipSegmentationDuration);
    }

    // toast({
    //   title: "Media Source Selected",
    //   description: `Switched to "${source.displayName}"`,
    // });
  }, [mediaSources, selectMediaSource, generateClipsFromDuration, clipSegmentationDuration, sourceUrl, setFocusedClip, setShowClipTrimmer, toast, isYouTubeVideoCheck, selectClip]);

  const handleRemoveMediaSource = useCallback((sourceId: string) => {
    if (isAnyClipTranscribing) {
      toast({
        variant: "destructive",
        title: "Action Disabled",
        description: "Cannot remove media while transcription is in progress.",
      });
      return;
    }

    const hasClipsUsingSource = sessionClips.some(clip => clip.mediaSourceId === sourceId);
    const result = removeMediaSource(sourceId, () => hasClipsUsingSource);

    if (result.requiresConfirmation) {
      setPendingDeleteSourceId(sourceId);
      setDeleteDialogOpen(true);
      return;
    }

    // Clean up if we removed the active source
    if (sourceId === activeMediaSourceId) {
      const sourceToRemove = mediaSources.find(s => s.id === sourceId);
      if (sourceToRemove) {
        cleanupBlobUrl(sourceToRemove.src); // Clean up the specific blob URL
      }
      setMediaSrc(undefined);
      setMediaDisplayName(null);
      setCurrentSourceType(null);
      setMediaDuration(0);
      setSourceFile(null);
      setSourceUrl(undefined);
      resetProcessingState();
    }
  }, [isAnyClipTranscribing, sessionClips, removeMediaSource, activeMediaSourceId, toast, cleanupBlobUrl, resetProcessingState]);

  // Settings handlers
  const handleLanguageChange = useCallback((newLanguage: string) => {
    setLanguage(newLanguage);
  }, []);

  const handleClipDurationChange = useCallback((durationString: string) => {
    if (!activeMediaSourceId || !mediaDuration) return;

    let newDurationMs: number;
    if (durationString.endsWith('s')) {
      newDurationMs = parseInt(durationString.slice(0, -1), 10) * 1000;
    } else if (durationString.endsWith('m')) {
      newDurationMs = parseInt(durationString.slice(0, -1), 10) * 60 * 1000;
    } else {
      console.error("Invalid duration string format:", durationString);
      return;
    }

    if (isNaN(newDurationMs) || newDurationMs <= 0) {
        console.error("Parsed duration is invalid:", newDurationMs);
        return;
    }

    setSegmentationPreference(activeMediaSourceId, newDurationMs);
    setClipSegmentationDuration(newDurationMs);

    const newClips = generateClips(mediaDuration, newDurationMs / 1000, language);
    setClips(newClips);
    setCurrentClipIndex(0);
    setFocusedClip(null);
    setShowClipTrimmer(false);

    toast({
      title: "Clip Segmentation Updated",
      description: `Clips are now segmented to ${durationString}.`,
      duration: 3000,
    });

  }, [activeMediaSourceId, mediaDuration, language, toast, setClips, setCurrentClipIndex, setFocusedClip, setShowClipTrimmer]);

  // Clip operations
  const handleSelectClip = useCallback((index: number) => {
    selectClip(index);
  }, [selectClip]);

  const handleUserTranscriptionChange = useCallback((clipId: string, newUserTranscription: string) => {
    updateUserTranscription(clipId, newUserTranscription);
  }, [updateUserTranscription]);

  const handleRemoveClip = useCallback((clipIdToRemove: string) => {
    removeClipFromManager(clipIdToRemove);
  }, [removeClipFromManager]);

  // AI operations
  const handleTranscribeAudio = useCallback(async (clipId: string) => {
    const targetClip = (focusedClip && focusedClip.id === clipId) ? focusedClip : clips.find(c => c.id === clipId);
    if (!targetClip || !mediaSrc || !currentSourceType) {
      console.warn("Transcribe: Target clip or media details not found", { clipId, targetClipId: targetClip?.id, mediaSrcExists: !!mediaSrc, currentSourceType });
      toast({ variant: "destructive", title: "Cannot Transcribe", description: "Required media information is missing." });
      return;
    }
    await transcribeClip(targetClip, mediaSrc, currentSourceType, language, updateClip);
  }, [focusedClip, clips, mediaSrc, currentSourceType, language, transcribeClip, updateClip, toast]);

  const handleTranslate = useCallback(async (clipId: string, targetLanguage: string) => {
    const targetClip = (focusedClip && focusedClip.id === clipId) ? focusedClip : clips.find(c => c.id === clipId);
    if (!targetClip) {
      console.warn("Translate: Target clip not found", { clipId });
      toast({ variant: "destructive", title: "Cannot Translate", description: "Clip to translate not found." });
      return;
    }
    await translateClip(targetClip, targetLanguage, updateClip);
  }, [focusedClip, clips, translateClip, updateClip, toast]);

  const handleGetCorrections = useCallback(async (clipId: string) => {
    const targetClip = (focusedClip && focusedClip.id === clipId) ? focusedClip : clips.find(c => c.id === clipId);
    if (!targetClip) {
      console.warn("Get Corrections: Target clip not found", { clipId });
      toast({ variant: "destructive", title: "Cannot Get Corrections", description: "Clip for corrections not found." });
      return;
    }
    await getCorrections(targetClip, updateClip);
  }, [focusedClip, clips, getCorrections, updateClip, toast]);

  // Custom clip creation
  const handleCreateFocusedClip = useCallback((startTime: number, endTime: number) => {
    setPendingCustomClip({ startTime, endTime });
    setShowCustomClipNaming(true);
  }, []);

  const handleConfirmCustomClipName = useCallback(() => {
    if (!pendingCustomClip) return;
    const clipName = customClipName.trim() || `Custom Clip ${Date.now()}`;
    createCustomClip(pendingCustomClip.startTime, pendingCustomClip.endTime, clipName);
    setShowCustomClipNaming(false);
    setPendingCustomClip(null);
    setCustomClipName("");
  }, [pendingCustomClip, customClipName, createCustomClip]);

  const handleCancelCustomClipName = useCallback(() => {
    setShowCustomClipNaming(false);
    setPendingCustomClip(null);
    setCustomClipName("");
  }, []);

  const handleToggleClipTrimmer = useCallback(() => {
    setShowClipTrimmer(!showClipTrimmer);
  }, [showClipTrimmer, setShowClipTrimmer]);

  const handleBackToAutoClips = useCallback(() => {
    if (mediaDuration > 0) {
      backToAutoClips(mediaDuration, clipSegmentationDuration);
    }
  }, [mediaDuration, clipSegmentationDuration, backToAutoClips]);

  // Session management

  // Update clip data for TranscriptionWorkspace
  const updateClipData = useCallback((clipId: string, aiContent: Partial<Clip>) => {
    updateClip(clipId, aiContent);
  }, [updateClip]);

  const handleSaveToSession = useCallback((overrideUserTranscription?: string) => {
    if (!currentClipToDisplay || !activeMediaSourceId) return;

    const totalDuration = sessionClips.reduce((acc, clip) => acc + (clip.endTime - clip.startTime), 0);
    const newClipDuration = currentClipToDisplay.endTime - currentClipToDisplay.startTime;

    if (totalDuration + newClipDuration > 30 * 60) {
      toast({
        variant: "destructive",
        title: "Session Full",
        description: "Cannot add more clips. Total duration would exceed 30 minutes.",
      });
      return;
    }

    const existingClipIndex = sessionClips.findIndex(clip =>
      clip.startTime === currentClipToDisplay.startTime &&
      clip.endTime === currentClipToDisplay.endTime &&
      clip.mediaSourceId === activeMediaSourceId
    );

    const userTrans = overrideUserTranscription !== undefined
      ? overrideUserTranscription
      : (currentClipToDisplay.userTranscription || "");

    const originalClipNumber = existingClipIndex >= 0
      ? sessionClips[existingClipIndex].originalClipNumber
      : (focusedClip ? undefined : currentClipIndex + 1);

    const sessionClip: SessionClip = {
      id: existingClipIndex >= 0 ? sessionClips[existingClipIndex].id : generateUniqueId(),
      startTime: currentClipToDisplay.startTime,
      endTime: currentClipToDisplay.endTime,
      language: currentClipToDisplay.language || language,
      displayName: existingClipIndex >= 0
        ? sessionClips[existingClipIndex].displayName
        : (currentClipToDisplay.displayName || (originalClipNumber ? `Clip ${originalClipNumber}` : `Clip ${sessionClips.length + 1}`)),
      mediaSourceId: activeMediaSourceId,
      originalClipNumber: originalClipNumber,
      userTranscription: userTrans,
      automatedTranscription: currentClipToDisplay.automatedTranscription || null,
      translation: currentClipToDisplay.translation || null,
      translationTargetLanguage: currentClipToDisplay.translationTargetLanguage || null,
      englishTranslation: currentClipToDisplay.englishTranslation || null,
      comparisonResult: currentClipToDisplay.comparisonResult || null,
    };

      if (existingClipIndex >= 0) {
      updateSessionClip(sessionClip.id, sessionClip);
      } else {
      addSessionClip(sessionClip);
    }

    const isAIOutputUpdate = existingClipIndex >= 0 && (
      currentClipToDisplay.automatedTranscription !== sessionClips[existingClipIndex].automatedTranscription ||
      currentClipToDisplay.translation !== sessionClips[existingClipIndex].translation ||
      currentClipToDisplay.englishTranslation !== sessionClips[existingClipIndex].englishTranslation ||
      currentClipToDisplay.comparisonResult !== sessionClips[existingClipIndex].comparisonResult
    );

    if (existingClipIndex === -1 || isAIOutputUpdate) {
      toast({
        title: existingClipIndex >= 0 ? "Clip Updated" : "Clip Saved",
        description: existingClipIndex >= 0
          ? "Clip has been updated with the latest AI output."
          : "Clip has been saved to your session.",
      });
    }
  }, [currentClipToDisplay, activeMediaSourceId, sessionClips, language, toast, focusedClip, currentClipIndex, updateSessionClip, addSessionClip]);

  const handleRenameClip = useCallback((clipId: string, newName: string) => {
    updateSessionClip(clipId, { displayName: newName });
  }, [updateSessionClip]);

  const handleLoadFromSession = useCallback((clipToLoad: SessionClip) => {
    if (isAnyClipTranscribing) {
      toast({
        variant: "destructive",
        title: "Cannot Load Clip",
        description: "Please wait for any ongoing transcriptions to complete.",
      });
      return;
    }

    const mediaSource = mediaSources.find(source => source.id === clipToLoad.mediaSourceId);
    if (!mediaSource) {
      toast({
        variant: "destructive",
        title: "Media Not Found",
        description: "The media associated with this saved clip could not be found.",
      });
      return;
    }

    if (activeMediaSourceId !== clipToLoad.mediaSourceId) {
      handleSelectMediaSource(mediaSource.id); // Pass the ID (string)
      toast({
        title: "Media Source Switched",
        description: `Switched to "${mediaSource.displayName}". Please click the saved clip again to load it.`,
        duration: 5000,
      });
      if (drawerCloseRef.current) {
        drawerCloseRef.current.click();
      }
      return;
    }

    let clipToHydrate: Clip = {
      ...clipToLoad,
      id: clipToLoad.id || generateUniqueId(),
      isFocusedClip: true,
      language: clipToLoad.language || language,
      userTranscription: clipToLoad.userTranscription || "",
      automatedTranscription: clipToLoad.automatedTranscription || null,
      translation: clipToLoad.translation || null,
      translationTargetLanguage: clipToLoad.translationTargetLanguage || null,
      englishTranslation: clipToLoad.englishTranslation || null,
      comparisonResult: clipToLoad.comparisonResult || null,
    };

    const hydratedClip = hydrateClipWithAIData(
      clipToHydrate,
      clipToLoad.mediaSourceId,
      sessionClips,
      getAIToolsCache()
    );

    setFocusedClip(hydratedClip);
    setShowClipTrimmer(false);

    if (clipToLoad.mediaSourceId && (hydratedClip.automatedTranscription || hydratedClip.translation || hydratedClip.englishTranslation || hydratedClip.comparisonResult)) {
      const cacheKey = `${clipToLoad.mediaSourceId}-${clipToLoad.startTime}-${clipToLoad.endTime}`;
      const aiDataToCache: Partial<Clip> = {};
      if (hydratedClip.automatedTranscription) aiDataToCache.automatedTranscription = hydratedClip.automatedTranscription;
      if (hydratedClip.language) aiDataToCache.language = hydratedClip.language;
      if (hydratedClip.translation) aiDataToCache.translation = hydratedClip.translation;
      if (hydratedClip.translationTargetLanguage) aiDataToCache.translationTargetLanguage = hydratedClip.translationTargetLanguage;
      if (hydratedClip.englishTranslation) aiDataToCache.englishTranslation = hydratedClip.englishTranslation;
      if (hydratedClip.comparisonResult) aiDataToCache.comparisonResult = hydratedClip.comparisonResult;

      if (Object.keys(aiDataToCache).length > 0) {
        try {
          const currentCache = getAIToolsCache();
          currentCache[cacheKey] = { ...currentCache[cacheKey], ...aiDataToCache };
          localStorage.setItem("reel-fluent-ai-tools-cache", JSON.stringify(currentCache));
        } catch (error) {
          console.warn("Failed to update AI tools cache on load from session:", error);
        }
      }
      updateClipData(hydratedClip.id, aiDataToCache);
    }

    toast({
      title: "Clip Loaded",
      description: `Loaded "${clipToLoad.displayName || 'Unnamed Clip'}" (${formatSecondsToMMSS(clipToLoad.startTime)} - ${formatSecondsToMMSS(clipToLoad.endTime)})`,
    });

    if (drawerCloseRef.current) {
      drawerCloseRef.current.click();
    }
    if (playerContainerRef.current) {
      playerContainerRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [
    isAnyClipTranscribing,
    mediaSources,
    activeMediaSourceId,
    sessionClips,
    toast,
    handleSelectMediaSource,
    setFocusedClip,
    setShowClipTrimmer,
    language,
    updateClipData,
    drawerCloseRef,
    playerContainerRef,
  ]);

  const handleRemoveFromSession = useCallback((clipId: string) => {
    removeSessionClip(clipId);
  }, [removeSessionClip]);

  // Delete confirmation
  const handleConfirmDelete = useCallback(() => {
    if (!pendingDeleteSourceId) return;

    sessionClips
      .filter(clip => clip.mediaSourceId === pendingDeleteSourceId)
      .forEach(clip => removeSessionClip(clip.id));

    removeMediaSource(pendingDeleteSourceId);

    if (pendingDeleteSourceId === activeMediaSourceId) {
      const sourceToRemove = mediaSources.find(s => s.id === pendingDeleteSourceId);
      if (sourceToRemove) {
        cleanupBlobUrl(sourceToRemove.src); // Clean up the specific blob URL
      }
      setMediaSrc(undefined);
      setMediaDisplayName(null);
      setCurrentSourceType(null);
      setMediaDuration(0);
      setSourceFile(null);
      setSourceUrl(undefined);
      resetProcessingState();
    }

    setDeleteDialogOpen(false);
    setPendingDeleteSourceId(null);
  }, [pendingDeleteSourceId, sessionClips, removeSessionClip, removeMediaSource, activeMediaSourceId, cleanupBlobUrl, resetProcessingState]);

  // Save media
  const handleSaveMedia = useCallback(async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to save your media.",
        action: <ToastAction altText="Sign in">Sign in</ToastAction>,
      });
      return;
    }

    if (!sourceFile && !sourceUrl) {
      toast({
        variant: "destructive",
        title: "No Media to Save",
        description: "Please upload a media file or enter a YouTube URL first.",
      });
      return;
    }

    if (!mediaDisplayName) {
      toast({
        variant: "destructive",
        title: "No Media Name",
        description: "Media name is required to save.",
      });
      return;
    }

    try {
      setIsSaving(true);

      const mediaData = {
        userId: user.uid,
        mediaUrl: sourceUrl || '',
        mediaDisplayName: mediaDisplayName,
        mediaDuration: mediaDuration,
        mediaType: currentSourceType || 'unknown',
        language: language,
        clipSegmentationDuration: clipSegmentationDuration,
        clips: sessionClips.map(clip => ({
          id: clip.id,
          startTime: clip.startTime,
          endTime: clip.endTime,
          userTranscription: clip.userTranscription || null,
          automatedTranscription: clip.automatedTranscription || null,
          feedback: null,
          englishTranslation: clip.englishTranslation || null,
          comparisonResult: clip.comparisonResult || null,
        })),
      };

      const result = await saveMediaItemAction(mediaData);

      if (result.success) {
        toast({
          title: "Media Saved Successfully",
          description: `"${mediaDisplayName}" has been saved to your library.`,
        });
      } else {
        throw new Error(result.message || "Failed to save media");
      }
    } catch (error) {
      console.error('Save media error:', error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error instanceof Error ? error.message : "Failed to save media to your library.",
      });
    } finally {
      setIsSaving(false);
    }
  }, [user, sourceFile, sourceUrl, mediaDisplayName, mediaDuration, currentSourceType, language, clipSegmentationDuration, sessionClips, setIsSaving, toast]);

  // Handle duration updates for direct URLs (when duration becomes available)
  useEffect(() => {
    if (mediaDuration > 0 && clips.length === 0 && mediaSrc) {
      // Generate clips when duration becomes available (e.g., for direct URLs)
      generateClipsFromDuration(mediaDuration, clipSegmentationDuration);
    }
  }, [mediaDuration, clips.length, mediaSrc, generateClipsFromDuration, clipSegmentationDuration]);

  // Separate effect to update MediaSource duration when it becomes available
  useEffect(() => {
    if (mediaDuration > 0 && activeMediaSourceId) {
      const activeSource = mediaSources.find(source => source.id === activeMediaSourceId);
      if (activeSource && activeSource.duration === 0) {
        updateMediaSource(activeMediaSourceId, { duration: mediaDuration });
      }
    }
  }, [mediaDuration, activeMediaSourceId, mediaSources, updateMediaSource]);

  // Effect for initializing and re-generating clips when media source or critical params change
  useEffect(() => {
    if (activeMediaSourceId && mediaDuration > 0 && language) {
      let durationForClipsMs = getSegmentationPreference(activeMediaSourceId);
      if (durationForClipsMs === null) {
        durationForClipsMs = DEFAULT_SEGMENTATION_DURATION_MS;
      }
      setClipSegmentationDuration(durationForClipsMs);

      const newClips = generateClips(mediaDuration, durationForClipsMs / 1000, language);
      setClips(newClips);
      setCurrentClipIndex(0);
      setFocusedClip(null);
      setShowClipTrimmer(false);
    } else {
      setClips([]);
      setCurrentClipIndex(0);
      setFocusedClip(null);
      setShowClipTrimmer(false);
      setClipSegmentationDuration(DEFAULT_SEGMENTATION_DURATION_MS);
    }
  }, [activeMediaSourceId, mediaDuration, language, setClips, setCurrentClipIndex, setFocusedClip, setShowClipTrimmer]);

  function getAIToolsCache(): Record<string, any> {
    if (typeof window === 'undefined') return {};
    try {
      const cached = localStorage.getItem("reel-fluent-ai-tools-cache");
      return cached ? JSON.parse(cached) : {};
    } catch (e) {
      console.error("Error reading AI tools cache from ReelFluentApp:", e);
      return {};
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-grow container mx-auto px-4 md:px-6 py-8 space-y-8">
        <Card className="shadow-lg border-border">
          <CardHeader className="pb-0">
            <CardTitle className="text-xl md:text-2xl">Upload Your Media</CardTitle>
            <CardDescription>Select language and upload media</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="lg:flex lg:gap-6">
              {mediaSources.length < 3 && (
                <div className={cn(
                  "w-full grid gap-4 sm:gap-6 transition-all duration-300 ease-in-out",
                  "grid-cols-1 md:grid-cols-[1fr_2fr]"
                )}>
                  <div className="space-y-4">
                    <LanguageSelector
                      selectedLanguage={language}
                      onLanguageChange={handleLanguageChange}
                      disabled={globalAppBusyState || isAnyClipTranscribing}
                    />
                  </div>
                  <div className="space-y-4">
                    <VideoInputForm
                      onSourceLoad={({ file, url }) => {
                        if (file) {
                          handleFileUpload(file);
                        } else if (url) {
                          handleUrlSubmit(url);
                        }
                      }}
                      isLoading={globalAppBusyState || isAnyClipTranscribing}
                    />
                    {isYouTubeProcessing && (
                      <YouTubeProcessingLoader status={processingStatus} />
                    )}
                  </div>
                </div>
              )}
              {mediaSources.length > 0 && (
                <div className={cn(
                  "transition-all duration-300 ease-in-out",
                  mediaSources.length < 3 ? "lg:w-1/3" : "w-full"
                )}>
                  <MediaSourceList
                    sources={mediaSources}
                    activeSourceId={activeMediaSourceId}
                    onSelectSource={handleSelectMediaSource}
                    onRemoveSource={handleRemoveMediaSource}
                    disabled={globalAppBusyState || isAnyClipTranscribing}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {mediaSrc && clips.length > 0 && currentClipToDisplay && (
          <div className="space-y-4">
            <TranscriptionWorkspace
              currentClip={currentClipToDisplay}
              clips={clips}
              mediaSrc={mediaSrc}
              currentClipIndex={currentClipIndex}
              onSelectClip={handleSelectClip}
              onTranscribeAudio={handleTranscribeAudio}
              onGetCorrections={handleGetCorrections}
              onTranslate={handleTranslate}
              onRemoveClip={handleRemoveClip}
              onUserTranscriptionChange={handleUserTranscriptionChange}
              isYouTubeVideo={isYouTubeVideoCheck}
              language={language}
              isAudioSource={currentSourceType === 'audio'}
              clipSegmentationDuration={clipSegmentationDuration}
              onClipDurationChange={handleClipDurationChange}
              isLoadingMedia={isLoading}
              isSavingMedia={isSaving}
              isAnyClipTranscribing={isAnyClipTranscribing}
              isCurrentClipTranscribing={currentClipToDisplay ? isClipTranscribing(currentClipToDisplay.id) : false}
              isCurrentClipTranslating={currentClipToDisplay ? isClipTranslating(currentClipToDisplay.id) : false}
              isCurrentClipComparing={currentClipToDisplay ? isClipGettingCorrections(currentClipToDisplay.id) : false}
              mediaDuration={mediaDuration}
              focusedClip={focusedClip}
              showClipTrimmer={showClipTrimmer}
              onCreateFocusedClip={handleCreateFocusedClip}
              onToggleClipTrimmer={handleToggleClipTrimmer}
              onBackToAutoClips={handleBackToAutoClips}
              onSaveToSession={handleSaveToSession}
              onOpenSessionDrawer={() => setSessionDrawerOpen(true)}
              canSaveToSession={
                currentClipToDisplay &&
                !sessionClips.some(sessionClip =>
                  sessionClip.mediaSourceId === activeMediaSourceId &&
                  sessionClip.startTime === currentClipToDisplay.startTime &&
                  sessionClip.endTime === currentClipToDisplay.endTime
                ) &&
                (sessionClips.reduce((acc, clip) => acc + (clip.endTime - clip.startTime), 0) +
                 (currentClipToDisplay.endTime - currentClipToDisplay.startTime)) <= 30 * 60
              }
              sessionClips={sessionClips}
              activeMediaSourceId={activeMediaSourceId}
              onUpdateClipData={updateClipData}
            />
          </div>
        )}

        {isLoading && !mediaDisplayName && !isYouTubeProcessing && (
          <MediaProcessingLoader
            status={processingStatus}
            progress={processingProgress}
          />
        )}
      </main>

      <footer className="py-4 px-4 md:px-8 border-t border-border text-center bg-background relative z-40">
        <div className="mb-2">
          <span className="text-xs text-muted-foreground">
            By using this service you accept the{' '}
            <a href="/terms" className="underline hover:text-primary transition-colors">Terms of Service</a> and{' '}
            <a href="/privacy" className="underline hover:text-primary transition-colors">Privacy Policy</a>
          </span>
        </div>
      </footer>

      {/* Session Drawer */}
      <div
        className={`fixed inset-0 bg-black/80 transition-opacity duration-300 ease-in-out ${isSessionDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ zIndex: 100 }}
        onClick={() => setSessionDrawerOpen(false)}
      />
      <div
        className={`fixed inset-x-0 bottom-0 bg-background transform transition-transform duration-300 ease-in-out ${isSessionDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{
          height: 'calc(100vh - 120px)',
          maxHeight: 'calc(100vh - 120px)',
          willChange: 'transform',
          zIndex: 101
        }}
      >
        <div className="h-full flex flex-col border-t border-border rounded-t-xl shadow-lg">
          <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <CircleCheckBig className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Saved Attempts</h3>
              <span className="text-sm text-muted-foreground">({sessionClips.length})</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSessionDrawerOpen(false)}>
              <XIcon className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain p-4">
            <SessionClipsManager
              sessionClips={sessionClips}
              onLoadFromSession={handleLoadFromSession}
              onRemoveFromSession={handleRemoveFromSession}
              onRenameClip={handleRenameClip}
              disabled={isLoading || isSaving || isAnyClipTranscribing}
              mediaSources={mediaSources}
              focusedClipId={focusedClip?.id || null}
            />
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Deleting this media file will also delete all associated saved attempts. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setPendingDeleteSourceId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              Delete All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Clip Naming Dialog */}
      <Dialog open={showCustomClipNaming} onOpenChange={setShowCustomClipNaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name Your Custom Clip</DialogTitle>
            <DialogDescription>
              {pendingCustomClip &&
                `Give your custom clip (${formatSecondsToMMSS(pendingCustomClip.startTime)} - ${formatSecondsToMMSS(pendingCustomClip.endTime)}) a memorable name.`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              value={customClipName}
              onChange={(e) => setCustomClipName(e.target.value)}
              placeholder="Enter clip name (optional)"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleConfirmCustomClipName();
                } else if (e.key === 'Escape') {
                  handleCancelCustomClipName();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleCancelCustomClipName}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCustomClipName}
            >
              Create Clip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
