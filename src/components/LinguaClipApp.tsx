
"use client";

import type * as React from 'react';
import { useState, useCallback, useEffect, useRef } from "react";
import Header from "./Header";
import VideoInputForm from "./VideoInputForm";
import LanguageSelector from "./LanguageSelector";
import ClipDurationSelector from "./ClipDurationSelector";
import TranscriptionWorkspace from "./TranscriptionWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileVideo, X as XIcon, FileAudio, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateClips, type Clip, extractAudioFromVideoSegment } from "@/lib/videoUtils";
import { transcribeAudio } from "@/ai/flows/transcribe-audio";
import { transcriptionFeedback } from "@/ai/flows/transcription-feedback";
import { compareTranscriptions, type CorrectionToken } from "@/ai/flows/compare-transcriptions-flow";
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
  const [clipSegmentationDuration, setClipSegmentationDuration] = useState<number>(60); // Default to 1 minute

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [currentSourceType, setCurrentSourceType] = useState<'video' | 'audio' | 'url' | 'unknown' | null>(null);
  
  const processingIdRef = useRef<number>(0);
  const { user } = useAuth();
  const { toast } = useToast();

  const isYouTubeVideo = sourceUrl?.includes("youtube.com") || sourceUrl?.includes("youtu.be") || false;

  const updateClipData = (clipId: string, data: Partial<Omit<Clip, 'id' | 'startTime' | 'endTime'>>) => {
    setClips(prevClips =>
      prevClips.map(clip =>
        clip.id === clipId ? { ...clip, ...data, language: clip.language || language } : clip 
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
    setIsSaving(false);
    setCurrentSourceType(null);
    setClipSegmentationDuration(60); 
    // Language is intentionally not reset
  }, []);

  const handleSourceLoad = useCallback(async (source: { file?: File; url?: string }) => {
    resetAppState(); 
    const currentProcessingId = processingIdRef.current;
    setIsLoading(true);
    let currentMediaSrcVal: string | undefined = undefined; 
    let displayName: string | null = null;
    let determinedSourceType: 'video' | 'audio' | 'url' | 'unknown' = 'unknown';
    let mediaElementTypeForLoad: 'video' | 'audio' = 'video'; // Element type for initial metadata load


    if (source.file) {
      setSourceFile(source.file);
      displayName = source.file.name;
      const objectURL = URL.createObjectURL(source.file);
      currentMediaSrcVal = objectURL;
      
      if (source.file.type.startsWith('video/')) {
        determinedSourceType = 'video';
        mediaElementTypeForLoad = 'video';
      } else if (source.file.type.startsWith('audio/')) {
        determinedSourceType = 'audio';
        mediaElementTypeForLoad = 'audio';
      } else {
        if (processingIdRef.current !== currentProcessingId) return; 
        toast({ variant: "destructive", title: "Unsupported File", description: "Please upload a valid video or audio file." });
        setIsLoading(false);
        resetAppState(); 
        return;
      }
    } else if (source.url) {
      setSourceUrl(source.url);
      displayName = source.url;
      currentMediaSrcVal = source.url;
      determinedSourceType = 'url';
      mediaElementTypeForLoad = 'video'; // Assume URL is video for metadata load
      
      const isYt = source.url?.includes("youtube.com") || source.url?.includes("youtu.be") || false;
      if (isYt) {
        if (processingIdRef.current !== currentProcessingId) return; 
        setMediaSrc(source.url);
        setMediaDisplayName(displayName);
        setCurrentSourceType('url');
        setMediaDuration(Infinity); // Special value for YouTube duration
        const initialYtClips = generateClips(Infinity, clipSegmentationDuration, language);
        setClips(initialYtClips);
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
    setMediaSrc(currentMediaSrcVal);
    setMediaDisplayName(displayName);
    setCurrentSourceType(determinedSourceType);

    if (currentMediaSrcVal) {
      const tempMediaElement = document.createElement(mediaElementTypeForLoad);
      tempMediaElement.onloadedmetadata = () => {
          if (processingIdRef.current !== currentProcessingId) return;
          setMediaDuration(tempMediaElement.duration);
          const generatedClips = generateClips(tempMediaElement.duration, clipSegmentationDuration, language);
          setClips(generatedClips);

          if (generatedClips.length > 0) {
            toast({ title: `${determinedSourceType === 'audio' ? 'Audio' : 'Video'} Processed`, description: `${generatedClips.length} clip(s) generated.` });
          } else {
            toast({ variant: "destructive", title: "Processing Error", description: `${determinedSourceType === 'audio' ? 'Audio' : 'Video'} may be too short or invalid.` });
          }
          setIsLoading(false);
          if (source.file && currentMediaSrcVal?.startsWith('blob:')) { /* Do not revoke here, let useEffect handle it */ }
      };
      tempMediaElement.onerror = (e) => {
          if (processingIdRef.current !== currentProcessingId) return;
          console.warn(`Error loading ${mediaElementTypeForLoad} metadata for ${displayName}:`, e, tempMediaElement.error);
          toast({ variant: "destructive", title: "Error", description: `Could not load ${determinedSourceType === 'audio' ? 'audio' : 'video'} metadata. The file might be corrupt or in an unsupported format.` });
          setIsLoading(false);
          resetAppState();
          if (source.file && currentMediaSrcVal?.startsWith('blob:')) { /* Do not revoke here */ }
      };
      tempMediaElement.src = currentMediaSrcVal;
      tempMediaElement.load(); // Explicitly call load
    } else { 
        if (processingIdRef.current !== currentProcessingId) return;
        setIsLoading(false);
        toast({ variant: "destructive", title: "Error", description: "Media source became unavailable." });
    }
  }, [resetAppState, toast, clipSegmentationDuration, language]);

  useEffect(() => {
    if (mediaSrc && mediaDuration > 0 && !isYouTubeVideo) { // mediaDuration > 0 ensures metadata loaded
      processingIdRef.current += 1; 
      const currentProcessingId = processingIdRef.current;

      setIsLoading(true); 
      const newGeneratedClips = generateClips(mediaDuration, clipSegmentationDuration, language);
      
      if (processingIdRef.current !== currentProcessingId) return; 

      setClips(newGeneratedClips.map(clip => ({...clip, language: language, comparisonResult: null, feedback: null, automatedTranscription: null, userTranscription: null })));
      setCurrentClipIndex(0); 
      if (newGeneratedClips.length > 0) {
        toast({ title: "Clips Regenerated", description: `${newGeneratedClips.length} clip(s) generated with new settings.` });
      } else if (mediaDuration > 0) { // Only show error if media was actually loaded
        toast({ variant: "destructive", title: "Processing Error", description: "Could not regenerate clips with new settings." });
      }
      setIsLoading(false);
    } else if (mediaSrc && isYouTubeVideo && mediaDuration === Infinity) { 
        processingIdRef.current += 1;
        const currentProcessingId = processingIdRef.current;
        setIsLoading(true);
        const newGeneratedClips = generateClips(Infinity, clipSegmentationDuration, language);
         if (processingIdRef.current !== currentProcessingId) return;
        setClips(newGeneratedClips.map(clip => ({...clip, language: language, comparisonResult: null, feedback: null, automatedTranscription: null, userTranscription: null })));
        setCurrentClipIndex(0);
        toast({ title: "Clip View Updated", description: "YouTube clip segment view updated for new settings." });
        setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipSegmentationDuration, language, mediaDuration]); // Added mediaDuration to re-run if it changes after initial load. MediaSrc is not needed because it's implied by mediaDuration > 0.


  useEffect(() => {
    let objectUrlToRevoke: string | undefined;
    if (sourceFile && mediaSrc?.startsWith('blob:')) {
      objectUrlToRevoke = mediaSrc;
    }
    // This cleanup function runs when the component unmounts OR when dependencies change
    // It's important for preventing memory leaks from Object URLs
    return () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
        console.log("Revoked Object URL:", objectUrlToRevoke);
      }
    };
  }, [sourceFile, mediaSrc]); // Rerun if sourceFile or mediaSrc changes

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
    if (!mediaSrc || isYouTubeVideo || !currentClipToTranscribe || !currentSourceType || currentSourceType === 'url' || currentSourceType === 'unknown') {
      toast({variant: "destructive", title: "Transcription Error", description: "Cannot transcribe. Ensure an uploaded media file (audio or video) and clip are active."});
      return;
    }
    
    updateClipData(clipId, { automatedTranscription: "Transcribing...", feedback: null, comparisonResult: null }); 

    let audioDataUri: string | null = null;
    try {
        audioDataUri = await extractAudioFromVideoSegment(
          mediaSrc, 
          currentClipToTranscribe.startTime, 
          currentClipToTranscribe.endTime,
          currentSourceType // No assertion needed if currentSourceType is correctly 'audio' | 'video' | 'url'
        );
    } catch (error) {
        console.warn("Audio extraction failed in LinguaClipApp:", error);
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
      const result = await transcribeAudio({ audioDataUri, language: currentClipToTranscribe.language || language });
      updateClipData(clipId, { automatedTranscription: result.transcription });
      toast({ title: "Transcription Successful" });
    } catch (error) {
      console.warn("AI Transcription error:", error);
      toast({ variant: "destructive", title: "AI Error", description: "Failed to transcribe audio." });
      updateClipData(clipId, { automatedTranscription: "Error: Could not transcribe audio." });
    }
  };

  const handleGetFeedback = async (clipId: string): Promise<void> => {
    const currentClipForFeedback = clips.find(c => c.id === clipId);
    if (isYouTubeVideo || !currentClipForFeedback || !currentClipForFeedback.userTranscription || !currentClipForFeedback.automatedTranscription || currentClipForFeedback.automatedTranscription.startsWith("Error:")) {
      toast({variant: "destructive", title: "Feedback Error", description: "Ensure automated transcription is successful and you've typed something."});
      return;
    }
    updateClipData(clipId, { feedback: "Generating feedback..." });
    try {
      const result = await transcriptionFeedback({
        userTranscription: currentClipForFeedback.userTranscription,
        automatedTranscription: currentClipForFeedback.automatedTranscription,
        language: currentClipForFeedback.language || language,
      });
      updateClipData(clipId, { feedback: result.feedback });
      toast({ title: "Feedback Generated" });
    } catch (error) {
      console.warn("AI Feedback error:", error);
      toast({ variant: "destructive", title: "AI Error", description: "Failed to generate feedback." });
      updateClipData(clipId, { feedback: "Error: Could not generate feedback." });
    }
  };

  const handleGetCorrections = async (clipId: string): Promise<void> => {
    const currentClipForCorrections = clips.find(c => c.id === clipId);
     if (isYouTubeVideo || !currentClipForCorrections || !currentClipForCorrections.userTranscription || !currentClipForCorrections.automatedTranscription || currentClipForCorrections.automatedTranscription.startsWith("Error:")) {
      toast({variant: "destructive", title: "Comparison Error", description: "Ensure automated transcription is successful and you've typed something."});
      return;
    }
    updateClipData(clipId, { comparisonResult: [{token: "Comparing...", status: "correct"}] }); 
    try {
      const result = await compareTranscriptions({
        userTranscription: currentClipForCorrections.userTranscription,
        automatedTranscription: currentClipForCorrections.automatedTranscription,
        language: currentClipForCorrections.language || language,
      });
      updateClipData(clipId, { comparisonResult: result.comparisonResult });
      toast({ title: "Comparison Complete" });
    } catch (error) {
      console.warn("AI Comparison error:", error);
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
      // If all clips are removed from an uploaded file, clear the media source
      if (currentSourceType === 'video' || currentSourceType === 'audio') {
        resetAppState(); // This will also revoke the object URL if applicable
        toast({ title: "Media Cleared", description: "All clips have been removed and the media file has been cleared." });
        return;
      }
      // If it was a URL source or something else, just clear clips
      setClips([]); 
      setCurrentClipIndex(0);
      toast({ title: "All Clips Removed" });
    } else {
      let newCurrentIdx = currentClipIndex;
      // Adjust currentClipIndex if the removed clip affected it
      if (removedClipOriginalIndex < currentClipIndex) {
        newCurrentIdx = Math.max(0, currentClipIndex - 1);
      } else if (removedClipOriginalIndex === currentClipIndex) {
        // If the current clip was removed, try to stay at the same index (now pointing to the next clip)
        // or move to the new last clip if the removed clip was the last one.
        newCurrentIdx = Math.min(currentClipIndex, newClips.length - 1);
      }
      // Ensure newCurrentIdx is within bounds
      newCurrentIdx = Math.max(0, Math.min(newCurrentIdx, newClips.length - 1));

      setClips(newClips);
      setCurrentClipIndex(newCurrentIdx);
      toast({ title: "Clip Removed", description: "The selected clip has been removed from the list." });
    }
  };
  
  const handleSaveMedia = async () => {
    if (!user || !mediaSrc || !mediaDisplayName || clips.length === 0) {
      toast({ variant: "destructive", title: "Cannot Save", description: "Ensure you are logged in and media is loaded with clips." });
      return;
    }
    if (currentSourceType !== 'url' && mediaDuration > MAX_MEDIA_DURATION_MINUTES * 60 ) { 
      toast({ variant: "destructive", title: "Cannot Save", description: `Media duration exceeds the ${MAX_MEDIA_DURATION_MINUTES}-minute limit for uploaded files.` });
      return;
    }
    setIsSaving(true);
    try {
      const result = await saveMediaItemAction({
        userId: user.uid,
        mediaUrl: sourceUrl || (sourceFile ? `uploaded/${sourceFile.name}` : 'unknown_source'), 
        mediaDisplayName: mediaDisplayName,
        mediaDuration: mediaDuration,
        mediaType: currentSourceType || 'unknown',
        language: language,
        clipSegmentationDuration: clipSegmentationDuration,
        clips: clips.map(c => ({ 
            id: c.id,
            startTime: c.startTime,
            endTime: c.endTime,
            userTranscription: c.userTranscription || null, 
            automatedTranscription: c.automatedTranscription || null,
            feedback: c.feedback || null,
            comparisonResult: (c.comparisonResult as CorrectionToken[] | null) || null, // Ensure type correctness
            language: c.language || language, 
        })),
      });
      if (result.success) {
        toast({ title: "Media Saved", description: result.message });
      } else {
        toast({ variant: "destructive", title: "Save Failed", description: result.message });
      }
    } catch (error) {
      console.warn("Error saving media:", error);
      toast({ variant: "destructive", title: "Save Error", description: "An unexpected error occurred while saving." });
    } finally {
      setIsSaving(false);
    }
  };

  const LoadedMediaIcon = currentSourceType === 'audio' ? FileAudio : FileVideo;
  const currentClip = clips[currentClipIndex];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-grow container mx-auto px-4 md:px-6 py-8 space-y-8">
        <Card className="shadow-lg border-border">
          <CardContent className="p-6 space-y-6">
            {mediaSrc && mediaDisplayName ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/50 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <LoadedMediaIcon className="h-6 w-6 text-primary flex-shrink-0" />
                    <span className="text-sm font-medium truncate text-foreground" title={mediaDisplayName}>
                      {mediaDisplayName}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={resetAppState} aria-label="Remove media">
                    <XIcon className="h-5 w-5 text-muted-foreground hover:text-foreground" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <LanguageSelector selectedLanguage={language} onLanguageChange={handleLanguageChange} disabled={isLoading || !mediaSrc || isSaving} />
                   <ClipDurationSelector selectedDuration={clipSegmentationDuration} onDurationChange={handleClipDurationChange} disabled={isLoading || !mediaSrc || isSaving} />
                </div>
                 {user && mediaSrc && clips.length > 0 && (currentSourceType !== 'url' || !isYouTubeVideo) && (
                    <Button onClick={handleSaveMedia} disabled={isSaving || isLoading} className="w-full sm:w-auto">
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? "Saving..." : "Save Media"}
                    </Button>
                  )}
              </div>
            ) : (
              <>
                <VideoInputForm onSourceLoad={handleSourceLoad} isLoading={isLoading} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <LanguageSelector selectedLanguage={language} onLanguageChange={handleLanguageChange} disabled={isLoading || !mediaSrc || isSaving} />
                    <ClipDurationSelector selectedDuration={clipSegmentationDuration} onDurationChange={handleClipDurationChange} disabled={isLoading || !mediaSrc || isSaving} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {mediaSrc && clips.length > 0 && currentClip && (
          <TranscriptionWorkspace
            key={currentClip.id + '-' + (currentClip.language || language)} 
            currentClip={currentClip}
            clips={clips} 
            mediaSrc={mediaSrc} 
            currentClipIndex={currentClipIndex}
            onNextClip={handleNextClip}
            onPrevClip={handlePrevClip}
            onTranscribeAudio={handleTranscribeAudio}
            onGetFeedback={handleGetFeedback}
            onGetCorrections={handleGetCorrections}
            onRemoveClip={handleRemoveClip}
            onUserTranscriptionChange={handleUserTranscriptionChange}
            isYouTubeVideo={isYouTubeVideo}
            language={currentClip.language || language} 
            isAudioSource={currentSourceType === 'audio'}
          />
        )}
        {isLoading && !mediaDisplayName && ( 
          <div className="text-center py-10">
            <p className="text-lg text-primary animate-pulse">Processing media...</p>
          </div>
        )}
      </main>
      <footer className="py-4 px-4 md:px-8 border-t border-border text-center">
        <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} LinguaClip. Happy learning!</p>
      </footer>
    </div>
  );
}

