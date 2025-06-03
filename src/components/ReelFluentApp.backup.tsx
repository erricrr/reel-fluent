"use client";

import type * as React from 'react';
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Header from "./Header";
import VideoInputForm from "./VideoInputForm";
import LanguageSelector from "./LanguageSelector";
import ClipDurationSelector from "./ClipDurationSelector";
import TranscriptionWorkspace from "./TranscriptionWorkspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileVideo, X as XIcon, FileAudio, CircleCheckBig, List } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateClips, createFocusedClip, type Clip, extractAudioFromVideoSegment } from "@/lib/videoUtils";
import { formatSecondsToMMSS } from '@/lib/timeUtils';
import { transcribeAudio } from "@/ai/flows/transcribe-audio-resilient";
import { translateTranscriptionFlow } from '@/ai/flows/translate-transcription-flow';
import { compareTranscriptions, type CorrectionToken } from "@/ai/flows/compare-transcriptions-flow";
import { useAuth } from '@/contexts/AuthContext';
import { saveMediaItemAction } from '@/app/actions';
import { isYouTubeUrl, processYouTubeUrl, type YouTubeVideoInfo, type ProgressCallback } from '@/lib/youtubeUtils';
import { Progress } from "@/components/ui/progress";
import SessionClipsManager from './SessionClipsManager';
import { cn } from "@/lib/utils";
import { getLanguageLabel } from "@/lib/languageOptions";
import { ToastAction } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const MAX_MEDIA_DURATION_MINUTES = 30;

interface MediaSource {
  id: string;
  src: string;
  displayName: string;
  type: 'video' | 'audio' | 'url' | 'unknown';
  duration: number;
}

interface SessionClip extends Clip {
  displayName?: string;
  mediaSourceId?: string;  // Make optional for backward compatibility
  originalClipNumber?: number; // Add this to preserve the original auto clip number
  // Legacy fields for backward compatibility
  originalMediaName?: string;
  mediaSrc?: string;
  sourceType?: 'video' | 'audio' | 'url' | 'unknown';
}

export default function ReelFluentApp() {
  // Media and UI state
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined);
  const [mediaSrc, setMediaSrc] = useState<string | undefined>(undefined);
  const [mediaDisplayName, setMediaDisplayName] = useState<string | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number>(0);
  const [currentSourceType, setCurrentSourceType] = useState<'video' | 'audio' | 'url' | 'unknown' | null>(null);

  // App settings
  const [language, setLanguage] = useState<string>("vietnamese");
  const [clipSegmentationDuration, setClipSegmentationDuration] = useState<number>(15);

  // Custom clip naming state
  const [showCustomClipNaming, setShowCustomClipNaming] = useState<boolean>(false);
  const [pendingCustomClip, setPendingCustomClip] = useState<{ startTime: number; endTime: number } | null>(null);
  const [customClipName, setCustomClipName] = useState<string>("");

  // Session drawer state
  const [isSessionDrawerOpen, setSessionDrawerOpen] = useState<boolean>(false);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [pendingDeleteSourceId, setPendingDeleteSourceId] = useState<string | null>(null);

  // Hooks
  const { user } = useAuth();
  const { toast } = useToast();

  // Media handling
  const handleFileUpload = useCallback(async (file: File) => {
    await processFile(file, (src, displayName, duration, type) => {
      const mediaSource: MediaSource = {
        id: generateUniqueId(),
        src,
        displayName,
        type,
        duration
      };

      if (addMediaSource(mediaSource)) {
        selectMediaSource(mediaSource.id);
        setMediaSrc(src);
        setMediaDisplayName(displayName);
        setMediaDuration(duration);
        setCurrentSourceType(type);
        setSourceFile(file);
        setSourceUrl(undefined);

        // Generate initial clips
        generateClipsFromDuration(duration, clipSegmentationDuration);
      }
    });
  }, [processFile, addMediaSource, selectMediaSource, generateClipsFromDuration, clipSegmentationDuration]);

  const handleUrlSubmit = useCallback(async (url: string) => {
    setSourceUrl(url);
    await processYouTubeUrl(url, (src, displayName, duration, videoInfo) => {
      const mediaSource: MediaSource = {
        id: generateUniqueId(),
        src,
        displayName,
        type: 'url',
        duration
      };

      if (addMediaSource(mediaSource)) {
        selectMediaSource(mediaSource.id);
        setMediaSrc(src);
        setMediaDisplayName(displayName);
        setMediaDuration(duration);
        setCurrentSourceType('url');
        setSourceFile(null);

        // Generate initial clips
        generateClipsFromDuration(duration, clipSegmentationDuration);
      }
    });
  }, [processYouTubeUrl, addMediaSource, selectMediaSource, generateClipsFromDuration, clipSegmentationDuration]);

  // Media source management
  const handleSelectMediaSource = useCallback((sourceId: string) => {
    const source = mediaSources.find(s => s.id === sourceId);
    if (!source) return;

    selectMediaSource(sourceId);
    setMediaSrc(source.src);
    setMediaDisplayName(source.displayName);
    setMediaDuration(source.duration);
    setCurrentSourceType(source.type);

    // Generate clips for this source
    generateClipsFromDuration(source.duration, clipSegmentationDuration);
  }, [mediaSources, selectMediaSource, generateClipsFromDuration, clipSegmentationDuration]);

  const handleRemoveMediaSource = useCallback((sourceId: string) => {
    if (isAnyClipTranscribing) {
      toast({
        variant: "destructive",
        title: "Action Disabled",
        description: "Cannot remove media while transcription is in progress.",
      });
      return;
    }

    // Check if any session clips use this media source
    const hasClipsUsingSource = sessionClips.some(clip => clip.mediaSourceId === sourceId);
    const result = removeMediaSource(sourceId, () => hasClipsUsingSource);

    if (result.requiresConfirmation) {
      setPendingDeleteSourceId(sourceId);
      setDeleteDialogOpen(true);
      return;
    }

    // If we removed the active source, clear current state
    if (sourceId === activeMediaSourceId) {
      setActiveMediaSourceId(null);
      setMediaSrc(undefined);
      setMediaDisplayName(null);
      setCurrentSourceType(null);
      setClips([]);
      setCurrentClipIndex(0);
    }
  }, [isAnyClipTranscribing, sessionClips, removeMediaSource, activeMediaSourceId, toast]);

  // Clip management
  const handleSelectClip = useCallback((index: number) => {
    selectClip(index);
  }, [selectClip]);

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

  const handleUserTranscriptionChange = useCallback((clipId: string, newUserTranscription: string) => {
    updateUserTranscription(clipId, newUserTranscription);
  }, [updateUserTranscription]);

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

  const handleRemoveClip = useCallback((clipIdToRemove: string) => {
    removeClip(clipIdToRemove);
  }, [removeClip]);

  // Custom clip creation
  const handleCreateFocusedClip = useCallback((startTime: number, endTime: number) => {
    setPendingCustomClip({ startTime, endTime });
    setShowCustomClipNaming(true);
  }, []);

  const handleConfirmCustomClipName = useCallback(() => {
    if (!pendingCustomClip) return;

    const clipName = customClipName.trim() || `Custom Clip ${Date.now()}`;
    createCustomClip(pendingCustomClip.startTime, pendingCustomClip.endTime, clipName);

    // Reset state
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
  const handleSaveToSession = useCallback((overrideUserTranscription?: string) => {
    if (!currentClip || !activeMediaSourceId) return;

    // Calculate total duration including the new clip
    const totalDuration = sessionClips.reduce((acc, clip) =>
      acc + (clip.endTime - clip.startTime), 0
    );
    const newClipDuration = currentClip.endTime - currentClip.startTime;

    // Check if adding this clip would exceed 30 minutes
    if (totalDuration + newClipDuration > 30 * 60) {
      toast({
        variant: "destructive",
        title: "Session Full",
        description: "Cannot add more clips. Total duration would exceed 30 minutes.",
      });
      return;
    }

    // Check if we're updating an existing session clip
    const existingClipIndex = sessionClips.findIndex(clip =>
      clip.startTime === currentClip.startTime &&
      clip.endTime === currentClip.endTime &&
      clip.mediaSourceId === activeMediaSourceId
    );

    // Determine user transcription to save
    const userTrans = overrideUserTranscription !== undefined
      ? overrideUserTranscription
      : (currentClip.userTranscription || "");

    // Determine original clip number - for auto clips, use currentClipIndex + 1, for focused clips use existing or undefined
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
      // Ensure all transcription data is properly formatted
      userTranscription: userTrans,
      automatedTranscription: currentClip.automatedTranscription || null,
      translation: currentClip.translation || null,
      translationTargetLanguage: currentClip.translationTargetLanguage || null,
      englishTranslation: currentClip.englishTranslation || null,
      comparisonResult: currentClip.comparisonResult || null,
    };

    // Update or add the clip
    if (existingClipIndex >= 0) {
      updateSessionClip(sessionClip.id, sessionClip);
    } else {
      addSessionClip(sessionClip);
    }

    // Only show toast for new clips or AI output updates
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

    // Find the media source for this clip
    const mediaSource = mediaSources.find(source => source.id === clipToLoad.mediaSourceId);
    if (!mediaSource) {
      toast({
        variant: "destructive",
        title: "Media Not Found",
        description: "The media source for this clip is no longer available.",
      });
      return;
    }

    // Switch to the correct media source if needed
    if (mediaSource.id !== activeMediaSourceId) {
      handleSelectMediaSource(mediaSource.id);
    }

    // Create a new focused clip with all necessary data
    const loadedClip: Clip = {
      ...clipToLoad,
      id: clipToLoad.id || generateUniqueId(), // Ensure we have a valid ID
      startTime: clipToLoad.startTime,
      endTime: clipToLoad.endTime,
      language: clipToLoad.language || language,
      // Ensure all transcription data is properly initialized
      userTranscription: clipToLoad.userTranscription || "",
      automatedTranscription: clipToLoad.automatedTranscription || null,
      translation: clipToLoad.translation || null,
      translationTargetLanguage: clipToLoad.translationTargetLanguage || null,
      englishTranslation: clipToLoad.englishTranslation || null,
      comparisonResult: clipToLoad.comparisonResult || null,
      isFocusedClip: true, // Mark this as a focused clip
    };

    // Set this as the only clip and focus on it
    setFocusedClip(loadedClip);
    // Note: We'll need to update the clips in the clip management hook

    toast({
      title: "Clip Loaded",
      description: `Loaded "${clipToLoad.displayName || 'Unnamed Clip'}" (${formatSecondsToMMSS(clipToLoad.startTime)} - ${formatSecondsToMMSS(clipToLoad.endTime)})`,
    });
  }, [isAnyClipTranscribing, mediaSources, activeMediaSourceId, language, toast, handleSelectMediaSource, setFocusedClip]);

  const handleRemoveFromSession = useCallback((clipId: string) => {
    removeSessionClip(clipId);
  }, [removeSessionClip]);

  // Delete confirmation handlers
  const handleConfirmDelete = useCallback(() => {
    if (!pendingDeleteSourceId) return;

    // Delete associated clips from Saved Attempts
    sessionClips
      .filter(clip => clip.mediaSourceId === pendingDeleteSourceId)
      .forEach(clip => removeSessionClip(clip.id));

    // Remove the media source (this will handle clearing current state if needed)
    removeMediaSource(pendingDeleteSourceId);

    // Clear current state if we removed the active source
    if (pendingDeleteSourceId === activeMediaSourceId) {
      setMediaSrc(undefined);
      setMediaDisplayName(null);
      setCurrentSourceType(null);
    }

    // Close dialog and clear pending delete
    setDeleteDialogOpen(false);
    setPendingDeleteSourceId(null);
  }, [pendingDeleteSourceId, sessionClips, removeSessionClip, removeMediaSource, activeMediaSourceId]);

  // Save media functionality
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
        displayName: mediaDisplayName,
        duration: mediaDuration,
        sourceType: currentSourceType || 'unknown',
        language: language,
        youtubeVideoInfo: youtubeVideoInfo || undefined,
        sourceUrl: isYouTubeVideo ? sourceUrl : undefined,
      };

      const result = await saveMediaItemAction(mediaData);

      if (result.success) {
        toast({
          title: "Media Saved Successfully",
          description: `"${mediaDisplayName}" has been saved to your library.`,
        });
      } else {
        throw new Error(result.error || "Failed to save media");
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
  }, [user, sourceFile, sourceUrl, mediaDisplayName, mediaDuration, currentSourceType, language, youtubeVideoInfo, isYouTubeVideo, setIsSaving, toast]);

  // Reset app functionality
  const handleResetAppWithCheck = () => {
    if (isAnyClipTranscribing) {
      toast({
        variant: "destructive",
        title: "Cannot Reset",
        description: "Please wait for any ongoing transcriptions to complete before resetting.",
      });
      return;
    }

    // Reset all state
    setSourceFile(null);
    setSourceUrl(undefined);
    setMediaSrc(undefined);
    setMediaDisplayName(null);
    setMediaDuration(0);
    setCurrentSourceType(null);
    resetProcessingState();
    cleanupObjectUrl();

    // Clear session drawer state
    setSessionDrawerOpen(false);
  };

  // Update clip data function for TranscriptionWorkspace
  const updateClipData = useCallback((clipId: string, aiContent: any) => {
    updateClip(clipId, aiContent);
  }, [updateClip]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-grow container mx-auto px-4 md:px-6 py-8 space-y-8">
        <Card className="shadow-lg border-border">
          <CardHeader className="pb-0">
            <CardTitle>Upload Your Media</CardTitle>
            <CardDescription>Select language and upload media</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="lg:flex lg:gap-6">
              {mediaSources.length < 3 && (
                <div className={cn(
                  "w-full grid gap-4 sm:gap-6 transition-all duration-300 ease-in-out",
                  mediaSources.length > 0
                    ? "grid-cols-1 sm:grid-cols-[1.2fr_2fr] lg:grid-cols-3 lg:w-2/3"
                    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                )}>
                  <div className="space-y-4">
                    <LanguageSelector
                      language={language}
                      onLanguageChange={handleLanguageChange}
                      disabled={globalAppBusyState || isAnyClipTranscribing}
                    />
                  </div>
                  <div className="space-y-4">
                    <VideoInputForm
                      onFileUpload={handleFileUpload}
                      onUrlSubmit={handleUrlSubmit}
                      disabled={globalAppBusyState || isAnyClipTranscribing}
                    />
                    {isYouTubeProcessing && (
                      <YouTubeProcessingLoader status={processingStatus} />
                    )}
                  </div>
                  {mediaSources.length > 0 && (
                    <div className="lg:col-span-1">
                      <ClipDurationSelector
                        value={clipSegmentationDuration.toString()}
                        onChange={handleClipDurationChange}
                        disabled={globalAppBusyState || isAnyClipTranscribing}
                      />
                    </div>
                  )}
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
              language={currentClip.language || language}
              isAudioSource={currentSourceType === 'audio'}
              clipSegmentationDuration={clipSegmentationDuration}
              onClipDurationChange={handleClipDurationChange}
              isLoadingMedia={isLoading}
              isSavingMedia={isSaving}
              isAnyClipTranscribing={isAnyClipTranscribing}
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

      {/* Session Drawer Overlay */}
      <div
        className={`fixed inset-0 bg-black/80 transition-opacity duration-300 ease-in-out ${isSessionDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ zIndex: 100 }}
        onClick={() => setSessionDrawerOpen(false)}
      />
      {/* Session Drawer */}
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
