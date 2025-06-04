"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
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
import type { Clip } from '@/lib/videoUtils';
import { hydrateClipWithAIData } from '@/lib/aiToolsHydration';

export default function ReelFluentApp() {
  // Basic UI state
  const [language, setLanguage] = useState<string>("vietnamese");
  const [clipSegmentationDuration, setClipSegmentationDuration] = useState<number>(15);

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

  // Custom hooks
  const mediaSourcesHook = useMediaSources();
  const clipManagementHook = useClipManagement(language);
  const mediaProcessingHook = useMediaProcessing();
  const aiOperationsHook = useAIOperations();

  // Destructure hook values
  const {
    mediaSources,
    activeMediaSourceId,
    sessionClips,
    addMediaSource,
    removeMediaSource,
    selectMediaSource,
    updateMediaSource,
    addSessionClip,
    removeSessionClip,
    updateSessionClip
  } = mediaSourcesHook;

  const {
    clips,
    currentClipIndex,
    focusedClip,
    showClipTrimmer,
    isAnyClipTranscribing,
    generateClipsFromDuration,
    selectClip,
    createCustomClip,
    backToAutoClips,
    updateClip,
    removeClip,
    updateUserTranscription,
    createEnhancedClips,
    setShowClipTrimmer,
    setFocusedClip,
    setIsAnyClipTranscribing
  } = clipManagementHook;

  const {
    isLoading,
    isSaving,
    isYouTubeProcessing,
    processingProgress,
    processingStatus,
    youtubeVideoInfo,
    processFile,
    processYouTubeUrl,
    resetProcessingState,
    cleanupObjectUrl,
    cleanupBlobUrl,
    setIsSaving,
    globalAppBusyState
  } = mediaProcessingHook;

  const {
    transcribeClip,
    translateClip,
    getCorrections,
    isAnyOperationInProgress,
    isClipTranscribing,
    isClipTranslating,
    isClipGettingCorrections
  } = aiOperationsHook;

  // Sync AI operations with clip management
  useEffect(() => {
    setIsAnyClipTranscribing(isAnyOperationInProgress());
  }, [isAnyOperationInProgress, setIsAnyClipTranscribing]);

  // Enhanced clips with session data
  const enhancedClips = useMemo(() => {
    return createEnhancedClips(sessionClips, activeMediaSourceId);
  }, [createEnhancedClips, sessionClips, activeMediaSourceId]);

  // Current clip - use focused clip if available, otherwise use indexed clip
  const currentClip = focusedClip || (enhancedClips[currentClipIndex] || null);
  const isYouTubeVideo = sourceUrl ? isYouTubeUrl(sourceUrl) : false;

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
  }, [mediaSources, selectMediaSource, generateClipsFromDuration, clipSegmentationDuration, sourceUrl, setFocusedClip, setShowClipTrimmer, toast, isYouTubeVideo, selectClip]);

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

  const handleClipDurationChange = useCallback((newDurationValue: string) => {
    const newDuration = parseInt(newDurationValue, 10);
    setClipSegmentationDuration(newDuration);
    if (mediaDuration > 0) {
      generateClipsFromDuration(mediaDuration, newDuration);
    }
  }, [mediaDuration, generateClipsFromDuration]);

  // Clip operations
  const handleSelectClip = useCallback((index: number) => {
    selectClip(index);
  }, [selectClip]);

  const handleUserTranscriptionChange = useCallback((clipId: string, newUserTranscription: string) => {
    updateUserTranscription(clipId, newUserTranscription);
  }, [updateUserTranscription]);

  const handleRemoveClip = useCallback((clipIdToRemove: string) => {
    removeClip(clipIdToRemove);
  }, [removeClip]);

  // AI operations
  const handleTranscribeAudio = useCallback(async (clipId: string) => {
    const clip = clips.find(c => c.id === clipId);
    if (!clip || !mediaSrc || !currentSourceType) return;
    await transcribeClip(clip, mediaSrc, currentSourceType, language, updateClip);
  }, [clips, mediaSrc, currentSourceType, language, transcribeClip, updateClip]);

  const handleTranslate = useCallback(async (clipId: string, targetLanguage: string) => {
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;
    await translateClip(clip, targetLanguage, updateClip);
  }, [clips, translateClip, updateClip]);

  const handleGetCorrections = useCallback(async (clipId: string) => {
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;
    await getCorrections(clip, updateClip);
  }, [clips, getCorrections, updateClip]);

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
  const updateClipData = useCallback((clipId: string, aiContent: any) => {
    updateClip(clipId, aiContent);
  }, [updateClip]);

  const handleSaveToSession = useCallback((overrideUserTranscription?: string) => {
    if (!currentClip || !activeMediaSourceId) return;

    const totalDuration = sessionClips.reduce((acc, clip) => acc + (clip.endTime - clip.startTime), 0);
    const newClipDuration = currentClip.endTime - currentClip.startTime;

    if (totalDuration + newClipDuration > 30 * 60) {
      toast({
        variant: "destructive",
        title: "Session Full",
        description: "Cannot add more clips. Total duration would exceed 30 minutes.",
      });
      return;
    }

    const existingClipIndex = sessionClips.findIndex(clip =>
      clip.startTime === currentClip.startTime &&
      clip.endTime === currentClip.endTime &&
      clip.mediaSourceId === activeMediaSourceId
    );

    const userTrans = overrideUserTranscription !== undefined
      ? overrideUserTranscription
      : (currentClip.userTranscription || "");

    const originalClipNumber = existingClipIndex >= 0
      ? sessionClips[existingClipIndex].originalClipNumber
      : (focusedClip ? undefined : currentClipIndex + 1);

    const sessionClip: SessionClip = {
      id: existingClipIndex >= 0 ? sessionClips[existingClipIndex].id : generateUniqueId(),
      startTime: currentClip.startTime,
      endTime: currentClip.endTime,
      language: currentClip.language || language,
      displayName: existingClipIndex >= 0
        ? sessionClips[existingClipIndex].displayName
        : (currentClip.displayName || (originalClipNumber ? `Clip ${originalClipNumber}` : `Clip ${sessionClips.length + 1}`)),
      mediaSourceId: activeMediaSourceId,
      originalClipNumber: originalClipNumber,
      userTranscription: userTrans,
      automatedTranscription: currentClip.automatedTranscription || null,
      translation: currentClip.translation || null,
      translationTargetLanguage: currentClip.translationTargetLanguage || null,
      englishTranslation: currentClip.englishTranslation || null,
      comparisonResult: currentClip.comparisonResult || null,
    };

      if (existingClipIndex >= 0) {
      updateSessionClip(sessionClip.id, sessionClip);
      } else {
      addSessionClip(sessionClip);
    }

    const isAIOutputUpdate = existingClipIndex >= 0 && (
      currentClip.automatedTranscription !== sessionClips[existingClipIndex].automatedTranscription ||
      currentClip.translation !== sessionClips[existingClipIndex].translation ||
      currentClip.englishTranslation !== sessionClips[existingClipIndex].englishTranslation ||
      currentClip.comparisonResult !== sessionClips[existingClipIndex].comparisonResult
    );

    if (existingClipIndex === -1 || isAIOutputUpdate) {
      toast({
        title: existingClipIndex >= 0 ? "Clip Updated" : "Clip Saved",
        description: existingClipIndex >= 0
          ? "Clip has been updated with the latest AI output."
          : "Clip has been saved to your session.",
      });
    }
  }, [currentClip, activeMediaSourceId, sessionClips, language, toast, focusedClip, currentClipIndex, updateSessionClip, addSessionClip]);

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
        description: "The media source for this clip is no longer available.",
      });
      return;
    }

    if (mediaSource.id !== activeMediaSourceId) {
      handleSelectMediaSource(mediaSource.id);
    }

    // Hydrate the loaded clip with AI tools data from cache and session
    let hydratedClip: Clip = {
      ...clipToLoad,
      id: clipToLoad.id || generateUniqueId(),
      startTime: clipToLoad.startTime,
      endTime: clipToLoad.endTime,
      language: clipToLoad.language || language,
      userTranscription: clipToLoad.userTranscription || "",
      automatedTranscription: clipToLoad.automatedTranscription || null,
      translation: clipToLoad.translation || null,
      translationTargetLanguage: clipToLoad.translationTargetLanguage || null,
      englishTranslation: clipToLoad.englishTranslation || null,
      comparisonResult: clipToLoad.comparisonResult || null,
      isFocusedClip: true,
    };
    try {
      const aiToolsCache = JSON.parse(localStorage.getItem("reel-fluent-ai-tools-cache") || "{}");
      hydratedClip = hydrateClipWithAIData(hydratedClip, clipToLoad.mediaSourceId, sessionClips, aiToolsCache);
    } catch (e) {
      // fallback: use the constructed hydratedClip as above
    }

    // Ensure AI tools cache and unlock state are still updated for consistency
    if (clipToLoad.mediaSourceId && (hydratedClip.automatedTranscription || hydratedClip.translation || hydratedClip.englishTranslation || hydratedClip.comparisonResult)) {
      const cacheKey = `${clipToLoad.mediaSourceId}-${clipToLoad.startTime}-${clipToLoad.endTime}`;
      const aiData: any = {};

      if (hydratedClip.automatedTranscription) {
        aiData.automatedTranscription = hydratedClip.automatedTranscription;
        aiData.language = hydratedClip.language;
      }
      if (hydratedClip.translation) {
        aiData.translation = hydratedClip.translation;
        aiData.translationTargetLanguage = hydratedClip.translationTargetLanguage;
      }
      if (hydratedClip.englishTranslation) {
        aiData.englishTranslation = hydratedClip.englishTranslation;
        aiData.translationTargetLanguage = "english";
      }
      if (hydratedClip.comparisonResult) {
        aiData.comparisonResult = hydratedClip.comparisonResult;
      }

      // Update AI tools cache directly to ensure consistency
      try {
        const currentCache = JSON.parse(localStorage.getItem("reel-fluent-ai-tools-cache") || "{}" );
        currentCache[cacheKey] = { ...currentCache[cacheKey], ...aiData };
        localStorage.setItem("reel-fluent-ai-tools-cache", JSON.stringify(currentCache));
      } catch (error) {
        console.warn("Failed to update AI tools cache:", error);
      }

      // Also unlock the clip if it has AI data
      try {
        const unlockKey = `${clipToLoad.mediaSourceId}-${clipToLoad.startTime}-${clipToLoad.endTime}`;
        const unlockState = JSON.parse(localStorage.getItem("reel-fluent-ai-tools-unlock-state") || "{}" );
        unlockState[unlockKey] = true;
        localStorage.setItem("reel-fluent-ai-tools-unlock-state", JSON.stringify(unlockState));
      } catch (error) {
        console.warn("Failed to update unlock state:", error);
      }

      // CRITICAL: Update the current clip data with AI tools results
      // This ensures the AI tools show up immediately when clip is loaded from saved attempts
      updateClipData(hydratedClip.id, aiData);
    }

    setFocusedClip(hydratedClip);

    toast({
      title: "Clip Loaded",
      description: `Loaded "${clipToLoad.displayName || 'Unnamed Clip'}" (${formatSecondsToMMSS(clipToLoad.startTime)} - ${formatSecondsToMMSS(clipToLoad.endTime)})`,
    });
  }, [isAnyClipTranscribing, mediaSources, activeMediaSourceId, language, toast, handleSelectMediaSource, setFocusedClip, updateClipData, sessionClips]);

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

        {mediaSrc && clips.length > 0 && currentClip && (
          <div className="space-y-4">
            <TranscriptionWorkspace
              currentClip={currentClip}
              clips={enhancedClips}
              mediaSrc={mediaSrc}
              currentClipIndex={currentClipIndex}
              onSelectClip={handleSelectClip}
              onTranscribeAudio={handleTranscribeAudio}
              onGetCorrections={handleGetCorrections}
              onTranslate={handleTranslate}
              onRemoveClip={handleRemoveClip}
              onUserTranscriptionChange={handleUserTranscriptionChange}
              isYouTubeVideo={isYouTubeVideo}
              language={language}
              isAudioSource={currentSourceType === 'audio'}
              clipSegmentationDuration={clipSegmentationDuration}
              onClipDurationChange={handleClipDurationChange}
              isLoadingMedia={isLoading}
              isSavingMedia={isSaving}
              isAnyClipTranscribing={isAnyClipTranscribing}
              isCurrentClipTranscribing={currentClip ? isClipTranscribing(currentClip.id) : false}
              isCurrentClipTranslating={currentClip ? isClipTranslating(currentClip.id) : false}
              isCurrentClipComparing={currentClip ? isClipGettingCorrections(currentClip.id) : false}
              mediaDuration={mediaDuration}
              focusedClip={focusedClip}
              showClipTrimmer={showClipTrimmer}
              onCreateFocusedClip={handleCreateFocusedClip}
              onToggleClipTrimmer={handleToggleClipTrimmer}
              onBackToAutoClips={handleBackToAutoClips}
              onSaveToSession={handleSaveToSession}
              onOpenSessionDrawer={() => setSessionDrawerOpen(true)}
              canSaveToSession={
                currentClip &&
                !sessionClips.some(sessionClip =>
                  sessionClip.mediaSourceId === activeMediaSourceId &&
                  sessionClip.startTime === currentClip.startTime &&
                  sessionClip.endTime === currentClip.endTime
                ) &&
                (sessionClips.reduce((acc, clip) => acc + (clip.endTime - clip.startTime), 0) +
                 (currentClip.endTime - currentClip.startTime)) <= 30 * 60
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
