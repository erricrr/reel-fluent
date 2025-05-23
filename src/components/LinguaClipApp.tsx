
"use client";

import type * as React from 'react';
import { useState, useCallback, useEffect, useRef } from "react";
import Header from "./Header";
import VideoInputForm from "./VideoInputForm";
import LanguageSelector from "./LanguageSelector";
import ClipDurationSelector from "./ClipDurationSelector"; // New import
import TranscriptionWorkspace from "./TranscriptionWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileVideo, X as XIcon, FileAudio, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateClips, type Clip } from "@/lib/videoUtils";
import { transcribeAudio } from "@/ai/flows/transcribe-audio";
import { transcriptionFeedback } from "@/ai/flows/transcription-feedback";
import { compareTranscriptions, type CompareTranscriptionsOutput } from "@/ai/flows/compare-transcriptions-flow";
import { useAuth } from '@/contexts/AuthContext';
import { saveMediaItemAction } from '@/app/actions';

const MAX_MEDIA_DURATION_MINUTES = 10;

export default function LinguaClipApp() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined);
  const [mediaSrc, setMediaSrc] = useState<string | undefined>(undefined);
  const [mediaDisplayName, setMediaDisplayName] = useState<string | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number>(0);
  
  const [clips, setClips] = useState<Clip[]>([]);
  const [currentClipIndex, setCurrentClipIndex] = useState<number>(0);
  
  const [language, setLanguage] = useState<string>("vietnamese");
  const [clipSegmentationDuration, setClipSegmentationDuration] = useState<number>(60); // New state, default 60s

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [currentSourceType, setCurrentSourceType] = useState<'video' | 'audio' | 'url' | null>(null);
  
  const processingIdRef = useRef<number>(0);
  const { user } = useAuth();
  const { toast } = useToast();

  const isYouTubeVideo = sourceUrl?.includes("youtube.com") || sourceUrl?.includes("youtu.be") || false;

  const updateClipData = (clipId: string, data: Partial<Omit<Clip, 'id' | 'startTime' | 'endTime'>>) => {
    setClips(prevClips =>
      prevClips.map(clip =>
        clip.id === clipId ? { ...clip, ...data } : clip
      )
    );
  };

  const resetAppState = useCallback(() => {
    processingIdRef.current += 1; 

    setSourceFile(null);
    setSourceUrl(undefined);
    setMediaSrc(undefined);
    setMediaDisplayName(null);
    setMediaDuration(0);
    setClips([]);
    setCurrentClipIndex(0);
    setIsLoading(false);
    setCurrentSourceType(null);
    setClipSegmentationDuration(60); // Reset clip duration on clear
  }, []);

  const handleSourceLoad = useCallback(async (source: { file?: File; url?: string }) => {
    resetAppState(); 
    const currentProcessingId = processingIdRef.current;
    setIsLoading(true);
    let currentMediaSrc: string | undefined = undefined;
    let displayName: string | null = null;

    if (source.file) {
      setSourceFile(source.file);
      displayName = source.file.name;
      const objectURL = URL.createObjectURL(source.file);
      setMediaSrc(objectURL);
      currentMediaSrc = objectURL;
      setCurrentSourceType(source.file.type.startsWith('video/') ? 'video' : 'audio');
    } else if (source.url) {
      setSourceUrl(source.url);
      displayName = source.url;
      setMediaSrc(source.url);
      currentMediaSrc = source.url;
      setCurrentSourceType('url');
      if (isYouTubeVideo) {
        if (processingIdRef.current !== currentProcessingId) return; 
        setMediaDisplayName(displayName);
        const initialYtClips = generateClips(Infinity, clipSegmentationDuration); // Use selected duration
        setClips(initialYtClips.map(clip => ({...clip, userTranscription: '', automatedTranscription: null, feedback: null, comparisonResult: null})));
        setMediaDuration(Infinity); // Placeholder for YouTube duration
        setIsLoading(false);
        toast({ title: "YouTube Video Loaded", description: "Viewing YouTube video. Transcription/clip features are limited." });
        return;
      }
    } else {
      if (processingIdRef.current !== currentProcessingId) return; 
      toast({ variant: "destructive", title: "Error", description: "No media source provided." });
      setIsLoading(false);
      return;
    }

    if (processingIdRef.current !== currentProcessingId) return; 
    setMediaDisplayName(displayName);

    if (currentMediaSrc && !isYouTubeVideo) {
      const mediaElement = document.createElement(currentSourceType === 'audio' ? 'audio' : 'video');
      mediaElement.onloadedmetadata = () => {
          if (processingIdRef.current !== currentProcessingId) return;
          setMediaDuration(mediaElement.duration);
          const generatedClips = generateClips(mediaElement.duration, clipSegmentationDuration); // Use selected duration
          setClips(generatedClips.map(clip => ({...clip, userTranscription: '', automatedTranscription: null, feedback: null, comparisonResult: null})));

          if (generatedClips.length > 0) {
            toast({ title: `${currentSourceType === 'audio' ? 'Audio' : 'Video'} Processed`, description: `${generatedClips.length} clips generated.` });
          } else {
            toast({ variant: "destructive", title: "Processing Error", description: `Could not generate clips. ${currentSourceType === 'audio' ? 'Audio' : 'Video'} may be too short or invalid.` });
          }
          setIsLoading(false);
      };
      mediaElement.onerror = () => {
          if (processingIdRef.current !== currentProcessingId) return;
          toast({ variant: "destructive", title: "Error", description: `Could not load ${currentSourceType === 'audio' ? 'audio' : 'video'} metadata.` });
          setIsLoading(false);
          resetAppState();
      };
      mediaElement.src = currentMediaSrc;
      mediaElement.load();
    } else if (!currentMediaSrc && !isYouTubeVideo) { 
        if (processingIdRef.current !== currentProcessingId) return;
        setIsLoading(false);
        toast({ variant: "destructive", title: "Error", description: "Media source became unavailable." });
    }
  }, [resetAppState, isYouTubeVideo, toast, clipSegmentationDuration, currentSourceType]);

  // Effect to regenerate clips when clipSegmentationDuration changes and media is loaded
  useEffect(() => {
    if (mediaSrc && mediaDuration > 0 && !isYouTubeVideo) {
      processingIdRef.current += 1; // Invalidate previous attempts
      const currentProcessingId = processingIdRef.current;

      setIsLoading(true);
      const generatedClips = generateClips(mediaDuration, clipSegmentationDuration);
      
      if (processingIdRef.current !== currentProcessingId) return; // Check if stale

      setClips(generatedClips.map(clip => ({...clip, userTranscription: '', automatedTranscription: null, feedback: null, comparisonResult: null})));
      setCurrentClipIndex(0); // Reset to first clip
      if (generatedClips.length > 0) {
        toast({ title: "Clips Regenerated", description: `${generatedClips.length} clips generated with new duration.` });
      } else {
        toast({ variant: "destructive", title: "Processing Error", description: "Could not regenerate clips with new duration." });
      }
      setIsLoading(false);
    } else if (mediaSrc && isYouTubeVideo && mediaDuration === Infinity) { // Handle YouTube duration change
        processingIdRef.current += 1;
        const currentProcessingId = processingIdRef.current;
        setIsLoading(true);
        const generatedClips = generateClips(Infinity, clipSegmentationDuration);
         if (processingIdRef.current !== currentProcessingId) return;
        setClips(generatedClips.map(clip => ({...clip, userTranscription: '', automatedTranscription: null, feedback: null, comparisonResult: null})));
        setCurrentClipIndex(0);
        toast({ title: "Clip View Updated", description: "YouTube clip segment view updated for new duration." });
        setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipSegmentationDuration, mediaSrc]); // Rerun when clipSegmentationDuration or mediaSrc changes

  useEffect(() => {
    let objectUrlToRevoke: string | undefined;
    if (sourceFile && mediaSrc?.startsWith('blob:')) {
      objectUrlToRevoke = mediaSrc;
    }
    return () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [sourceFile, mediaSrc]);

  const handleNextClip = () => {
    if (currentClipIndex < clips.length - 1) {
      setCurrentClipIndex(currentClipIndex + 1);
    }
  };

  const handlePrevClip = () => {
    if (currentClipIndex > 0) {
      setCurrentClipIndex(currentClipIndex - 1);
    }
  };

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    // Reset transcriptions and feedback for all clips if language changes
    setClips(prevClips => prevClips.map(clip => ({
      ...clip,
      userTranscription: clip.language === newLanguage ? clip.userTranscription : '', // Keep user input if lang is same, else clear
      automatedTranscription: null,
      feedback: null,
      comparisonResult: null,
      language: newLanguage // Store language with clip if desired
    })));
  };
  
  const handleClipDurationChange = (newDurationValue: string) => {
    const newDuration = parseInt(newDurationValue, 10);
    if (!isNaN(newDuration) && (newDuration === 30 || newDuration === 60)) {
      setClipSegmentationDuration(newDuration);
    }
  };

  const handleUserTranscriptionChange = (clipId: string, newUserTranscription: string) => {
    updateClipData(clipId, { userTranscription: newUserTranscription });
  };

  const handleTranscribeAudio = async (clipId: string): Promise<void> => {
    const currentClipToTranscribe = clips.find(c => c.id === clipId);
    if (!mediaSrc || isYouTubeVideo || !currentClipToTranscribe) {
      toast({variant: "destructive", title: "Transcription Error", description: "Cannot transcribe. Ensure an uploaded media file and clip are active."});
      return;
    }
    
    updateClipData(clipId, { automatedTranscription: null, feedback: null, comparisonResult: null }); // Clear previous results

    let audioDataUri: string | null = null;
    try {
        audioDataUri = await extractAudioFromVideoSegment(mediaSrc, currentClipToTranscribe.startTime, currentClipToTranscribe.endTime);
    } catch (error) {
        console.error("Audio extraction failed:", error);
        toast({variant: "destructive", title: "Audio Extraction Failed", description: (error as Error).message || "Could not extract audio for transcription."});
        updateClipData(clipId, { automatedTranscription: "Error: Audio extraction failed." });
        return;
    }

    if (!audioDataUri) {
        toast({variant: "destructive", title: "Transcription Error", description: "Failed to obtain audio data for transcription."});
        updateClipData(clipId, { automatedTranscription: "Error: No audio data." });
        return;
    }

    try {
      const result = await transcribeAudio({ audioDataUri, language });
      updateClipData(clipId, { automatedTranscription: result.transcription });
      toast({ title: "Transcription Successful" });
    } catch (error) {
      console.error("AI Transcription error:", error);
      toast({ variant: "destructive", title: "AI Error", description: "Failed to transcribe audio." });
      updateClipData(clipId, { automatedTranscription: "Error: Could not transcribe audio." });
    }
  };

  const handleGetFeedback = async (clipId: string): Promise<void> => {
    const currentClipForFeedback = clips.find(c => c.id === clipId);
    if (isYouTubeVideo || !currentClipForFeedback || !currentClipForFeedback.userTranscription || !currentClipForFeedback.automatedTranscription) {
      toast({variant: "destructive", title: "Feedback Error", description: "Ensure transcription is available and you've typed something."});
      return;
    }
    updateClipData(clipId, { feedback: null });
    try {
      const result = await transcriptionFeedback({
        userTranscription: currentClipForFeedback.userTranscription,
        automatedTranscription: currentClipForFeedback.automatedTranscription,
        language,
      });
      updateClipData(clipId, { feedback: result.feedback });
      toast({ title: "Feedback Generated" });
    } catch (error) {
      console.error("AI Feedback error:", error);
      toast({ variant: "destructive", title: "AI Error", description: "Failed to generate feedback." });
      updateClipData(clipId, { feedback: "Error: Could not generate feedback." });
    }
  };

  const handleGetCorrections = async (clipId: string): Promise<void> => {
    const currentClipForCorrections = clips.find(c => c.id === clipId);
     if (isYouTubeVideo || !currentClipForCorrections || !currentClipForCorrections.userTranscription || !currentClipForCorrections.automatedTranscription) {
      toast({variant: "destructive", title: "Comparison Error", description: "Ensure transcription is available and you've typed something."});
      return;
    }
    updateClipData(clipId, { comparisonResult: null });
    try {
      const result = await compareTranscriptions({
        userTranscription: currentClipForCorrections.userTranscription,
        automatedTranscription: currentClipForCorrections.automatedTranscription,
        language,
      });
      updateClipData(clipId, { comparisonResult: result.comparisonResult });
      toast({ title: "Comparison Complete" });
    } catch (error) {
      console.error("AI Comparison error:", error);
      toast({ variant: "destructive", title: "AI Error", description: "Failed to generate comparison." });
      updateClipData(clipId, { comparisonResult: [{ token: "Error generating comparison.", status: "incorrect", suggestion: "N/A" }] });
    }
  };

  const handleRemoveClip = (clipIdToRemove: string) => {
    processingIdRef.current += 1; 
    const removedClipOriginalIndex = clips.findIndex(clip => clip.id === clipIdToRemove);
    if (removedClipOriginalIndex === -1) return;

    const newClips = clips.filter(clip => clip.id !== clipIdToRemove);

    if (newClips.length === 0) {
      if (currentSourceType === 'video' || currentSourceType === 'audio') {
        resetAppState();
        toast({ title: "Media Cleared", description: "All clips have been removed and the media file has been cleared." });
        return;
      }
      setClips([]); // For URLs, just clear clips, don't reset everything.
      setCurrentClipIndex(0);
    } else {
      let newCurrentIdx = currentClipIndex;
      if (removedClipOriginalIndex < currentClipIndex) {
        newCurrentIdx = Math.max(0, currentClipIndex - 1);
      } else if (removedClipOriginalIndex === currentClipIndex) {
        newCurrentIdx = Math.min(currentClipIndex, newClips.length - 1);
      }
      newCurrentIdx = Math.max(0, Math.min(newCurrentIdx, newClips.length - 1));

      setClips(newClips);
      setCurrentClipIndex(newCurrentIdx);
    }
    toast({ title: "Clip Removed", description: "The selected clip has been removed from the list." });
  };
  
  const handleSaveMedia = async () => {
    if (!user || !mediaSrc || !mediaDisplayName || clips.length === 0) {
      toast({ variant: "destructive", title: "Cannot Save", description: "Ensure you are logged in and media is loaded with clips." });
      return;
    }
    if (mediaDuration > MAX_MEDIA_DURATION_MINUTES * 60 && !isYouTubeVideo) {
      toast({ variant: "destructive", title: "Cannot Save", description: `Media duration exceeds the ${MAX_MEDIA_DURATION_MINUTES}-minute limit.` });
      return;
    }
    setIsSaving(true);
    try {
      const result = await saveMediaItemAction({
        userId: user.uid,
        mediaUrl: sourceUrl || (sourceFile ? 'uploaded_file' : 'unknown_source'), // For uploaded, might store path from Firebase Storage later
        mediaDisplayName: mediaDisplayName,
        mediaDuration: mediaDuration,
        mediaType: currentSourceType || 'unknown',
        language: language,
        clipSegmentationDuration: clipSegmentationDuration,
        clips: clips.map(c => ({ // Only save relevant fields, not the full object if it has internal state
            id: c.id,
            startTime: c.startTime,
            endTime: c.endTime,
            userTranscription: c.userTranscription,
            automatedTranscription: c.automatedTranscription,
            feedback: c.feedback,
            comparisonResult: c.comparisonResult,
        })),
      });
      if (result.success) {
        toast({ title: "Media Saved", description: result.message });
      } else {
        toast({ variant: "destructive", title: "Save Failed", description: result.message });
      }
    } catch (error) {
      console.error("Error saving media:", error);
      toast({ variant: "destructive", title: "Save Error", description: "An unexpected error occurred while saving." });
    } finally {
      setIsSaving(false);
    }
  };

  const LoadedMediaIcon = currentSourceType === 'audio' ? FileAudio : FileVideo;
  const currentClip = clips[currentClipIndex];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 md:px-6 py-8 space-y-8">
        <Card className="shadow-lg">
          <CardContent className="p-6 space-y-6">
            {mediaSrc && mediaDisplayName ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <LoadedMediaIcon className="h-6 w-6 text-primary flex-shrink-0" />
                    <span className="text-sm font-medium truncate" title={mediaDisplayName}>
                      {mediaDisplayName}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={resetAppState} aria-label="Remove media">
                    <XIcon className="h-5 w-5" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <LanguageSelector selectedLanguage={language} onLanguageChange={handleLanguageChange} disabled={isLoading || !mediaSrc} />
                   <ClipDurationSelector selectedDuration={clipSegmentationDuration} onDurationChange={handleClipDurationChange} disabled={isLoading || !mediaSrc} />
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <Button onClick={resetAppState} variant="outline" className="w-full sm:w-auto">
                        Clear Loaded Media
                    </Button>
                    {user && mediaSrc && clips.length > 0 && (
                        <Button onClick={handleSaveMedia} disabled={isSaving || isLoading} className="w-full sm:w-auto">
                        <Save className="mr-2 h-4 w-4" />
                        {isSaving ? "Saving..." : "Save Media"}
                        </Button>
                    )}
                </div>
              </div>
            ) : (
              <>
                <VideoInputForm onSourceLoad={handleSourceLoad} isLoading={isLoading} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <LanguageSelector selectedLanguage={language} onLanguageChange={handleLanguageChange} disabled={isLoading || !mediaSrc} />
                    <ClipDurationSelector selectedDuration={clipSegmentationDuration} onDurationChange={handleClipDurationChange} disabled={isLoading || !mediaSrc} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {mediaSrc && clips.length > 0 && currentClip && (
          <TranscriptionWorkspace
            key={currentClip.id} // Ensure re-render when clip changes substantially
            currentClip={currentClip}
            clips={clips}
            currentClipIndex={currentClipIndex}
            onNextClip={handleNextClip}
            onPrevClip={handlePrevClip}
            onTranscribeAudio={handleTranscribeAudio}
            onGetFeedback={handleGetFeedback}
            onGetCorrections={handleGetCorrections}
            onRemoveClip={handleRemoveClip}
            onUserTranscriptionChange={handleUserTranscriptionChange}
            isYouTubeVideo={isYouTubeVideo}
            language={language}
            isAudioSource={currentSourceType === 'audio'}
          />
        )}
        {isLoading && mediaSrc === undefined && (
          <div className="text-center py-10">
            <p className="text-lg text-primary animate-pulse">Processing media...</p>
          </div>
        )}
      </main>
      <footer className="py-4 px-4 md:px-8 border-t text-center">
        <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} LinguaClip. Happy learning!</p>
      </footer>
    </div>
  );
}
