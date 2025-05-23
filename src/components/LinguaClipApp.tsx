
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
  const [mediaSrc, setMediaSrc] = useState<string | undefined>(undefined); // This will hold the blob URL or direct URL
  const objectUrlRef = useRef<string | undefined>(undefined); // Specifically for managing created object URLs
  const [mediaDisplayName, setMediaDisplayName] = useState<string | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number>(0);
  
  const [clips, setClips] = useState<Clip[]>([]);
  const [currentClipIndex, setCurrentClipIndex] = useState<number>(0);
  
  const [language, setLanguage] = useState<string>("vietnamese");
  const [clipSegmentationDuration, setClipSegmentationDuration] = useState<number>(60); 

  const [isLoading, setIsLoading] = useState<boolean>(false); 
  const [isSaving, setIsSaving] = useState<boolean>(false); 
  const [isAnyClipTranscribing, setIsAnyClipTranscribing] = useState<boolean>(false); 
  
  const [currentSourceType, setCurrentSourceType] = useState<'video' | 'audio' | 'url' | 'unknown' | null>(null);
  
  const processingIdRef = useRef<number>(0);
  const { user } = useAuth();
  const { toast } = useToast();

  const isYouTubeVideo = sourceUrl?.includes("youtube.com") || sourceUrl?.includes("youtu.be") || false;

  useEffect(() => {
    const currentlyTranscribing = clips.some(clip => clip.automatedTranscription === "Transcribing...");
    setIsAnyClipTranscribing(currentlyTranscribing);
  }, [clips]);

  const updateClipData = useCallback((clipId: string, data: Partial<Omit<Clip, 'id' | 'startTime' | 'endTime'>>) => {
    setClips(prevClips =>
      prevClips.map(clip =>
        clip.id === clipId ? { ...clip, ...data, language: clip.language || language } : clip 
      )
    );
  }, [language]); // Added language dependency

  const resetAppState = useCallback(() => {
    processingIdRef.current += 1; 
    console.log("LinguaClipApp: resetAppState called. Current isAnyClipTranscribing:", isAnyClipTranscribing);

    if (objectUrlRef.current) {
      if (!isAnyClipTranscribing) {
        console.log("LinguaClipApp: resetAppState revoking object URL:", objectUrlRef.current);
        URL.revokeObjectURL(objectUrlRef.current);
      } else {
        console.warn("LinguaClipApp: resetAppState SKIPPED revoking object URL due to ongoing transcription:", objectUrlRef.current);
      }
      objectUrlRef.current = undefined;
    }

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
    // language state persists
  }, [isAnyClipTranscribing]); // isAnyClipTranscribing is crucial here for the guard

  const handleSourceLoad = useCallback(async (source: { file?: File; url?: string }) => {
    const localProcessingId = processingIdRef.current + 1;
    processingIdRef.current = localProcessingId;

    // Revoke previous object URL if it exists, before setting new state
    if (objectUrlRef.current) {
      console.log("LinguaClipApp: handleSourceLoad revoking PREVIOUS object URL:", objectUrlRef.current);
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = undefined;
    }
    
    // Call resetAppState to clear everything else BUT AFTER old URL is revoked
    // This resetAppState call is fine because it won't revoke again (objectUrlRef.current is now undefined)
    // or if it somehow had a value and transcription was ongoing, its internal guard would prevent revocation.
    resetAppState(); // This will set a new processingIdRef.current
    
    // Recapture processingId after resetAppState
    const currentProcessingId = processingIdRef.current; 


    setIsLoading(true);
    let newMediaSrc: string | undefined = undefined; 
    let displayName: string | null = null;
    let determinedSourceType: 'video' | 'audio' | 'url' | 'unknown' = 'unknown';
    let mediaElementTypeForLoad: 'video' | 'audio' = 'video';

    if (source.file) {
      setSourceFile(source.file); // Keep the file reference
      displayName = source.file.name;
      try {
        newMediaSrc = URL.createObjectURL(source.file);
        objectUrlRef.current = newMediaSrc; // Store the newly created object URL
        console.log("LinguaClipApp: handleSourceLoad CREATED new object URL:", newMediaSrc);
      } catch (error) {
        if (processingIdRef.current !== currentProcessingId) return;
        toast({ variant: "destructive", title: "File Error", description: "Could not create a URL for the file." });
        setIsLoading(false);
        resetAppState();
        return;
      }
      
      if (source.file.type.startsWith('video/')) {
        determinedSourceType = 'video';
        mediaElementTypeForLoad = 'video';
      } else if (source.file.type.startsWith('audio/')) {
        determinedSourceType = 'audio';
        mediaElementTypeForLoad = 'audio';
      } else {
        if (processingIdRef.current !== currentProcessingId) {
           if (newMediaSrc) {
            console.log("LinguaClipApp: handleSourceLoad (unsupported file type) revoking new object URL due to processingId mismatch:", newMediaSrc);
            URL.revokeObjectURL(newMediaSrc);
            objectUrlRef.current = undefined;
           }
           return;
        }
        toast({ variant: "destructive", title: "Unsupported File", description: "Please upload a valid video or audio file." });
        setIsLoading(false);
        resetAppState(); 
        return;
      }
    } else if (source.url) {
      setSourceUrl(source.url);
      displayName = source.url;
      newMediaSrc = source.url; // Direct URL, no object URL to manage here
      determinedSourceType = 'url';
      mediaElementTypeForLoad = 'video'; 
      
      if (isYouTubeVideo) { // Check isYouTubeVideo based on source.url
        if (processingIdRef.current !== currentProcessingId) return; 
        setMediaSrc(source.url);
        setMediaDisplayName(displayName);
        setCurrentSourceType('url');
        setMediaDuration(Infinity); 
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

    if (processingIdRef.current !== currentProcessingId) {
      if (source.file && newMediaSrc && objectUrlRef.current === newMediaSrc) {
        console.log("LinguaClipApp: handleSourceLoad (processingId mismatch post-file-load) revoking object URL:", newMediaSrc);
        URL.revokeObjectURL(newMediaSrc);
        objectUrlRef.current = undefined;
      }
      return;
    }
    setMediaSrc(newMediaSrc); 
    setMediaDisplayName(displayName);
    setCurrentSourceType(determinedSourceType);

    if (newMediaSrc) {
      const tempMediaElement = document.createElement(mediaElementTypeForLoad);
      tempMediaElement.onloadedmetadata = () => {
          if (processingIdRef.current !== currentProcessingId) {
             if (source.file && newMediaSrc?.startsWith('blob:') && objectUrlRef.current === newMediaSrc) {
                console.log("LinguaClipApp: onloadedmetadata (processingId mismatch) revoking object URL:", newMediaSrc);
                URL.revokeObjectURL(newMediaSrc);
                objectUrlRef.current = undefined;
             }
             return;
          }
          setMediaDuration(tempMediaElement.duration);
          setIsLoading(false); 
      };
      tempMediaElement.onerror = (e) => {
          if (processingIdRef.current !== currentProcessingId) {
            if (source.file && newMediaSrc?.startsWith('blob:') && objectUrlRef.current === newMediaSrc) {
              console.log("LinguaClipApp: onerror (processingId mismatch) revoking object URL:", newMediaSrc);
              URL.revokeObjectURL(newMediaSrc);
              objectUrlRef.current = undefined;
            }
            return;
          }
          console.warn(`Error loading ${mediaElementTypeForLoad} metadata for ${displayName}:`, e, tempMediaElement.error);
          toast({ variant: "destructive", title: "Error", description: `Could not load ${determinedSourceType === 'audio' ? 'audio' : 'video'} metadata. The file might be corrupt or in an unsupported format.` });
          setIsLoading(false);
          resetAppState(); 
      };
      tempMediaElement.src = newMediaSrc; // Use the potentially new blob URL
      tempMediaElement.load(); 
    } else { 
        if (processingIdRef.current !== currentProcessingId) return;
        setIsLoading(false);
        toast({ variant: "destructive", title: "Error", description: "Media source became unavailable." });
    }
  }, [resetAppState, toast, isYouTubeVideo]);


  useEffect(() => {
    if (mediaSrc && mediaDuration > 0 && !isYouTubeVideo) { 
      const currentProcessingId = processingIdRef.current; // Use existing processingIdRef
      setIsLoading(true); 

      const newGeneratedClips = generateClips(mediaDuration, clipSegmentationDuration, language);
      
      if (processingIdRef.current !== currentProcessingId) {
        setIsLoading(false); 
        return;
      }

      setClips(newGeneratedClips.map(clip => ({
        ...clip, 
        language: language, 
        comparisonResult: null, 
        feedback: null, 
        automatedTranscription: null, 
        userTranscription: null 
      })));
      setCurrentClipIndex(0); 

      if (newGeneratedClips.length > 0) {
        const mediaTypeForToast = currentSourceType || "media";
        toast({ title: "Media Processed", description: `${newGeneratedClips.length} clip(s) generated for ${mediaTypeForToast}.` });
      } else if (mediaDuration > 0) { 
        toast({ variant: "destructive", title: "Processing Error", description: "Could not generate clips for the media." });
      }
      setIsLoading(false);
    } else if (!mediaSrc && clips.length > 0 && !isYouTubeVideo) { 
      setClips([]);
      setCurrentClipIndex(0);
    }
  // IMPORTANT: Removed resetAppState from this dependency array
  // Added currentSourceType to ensure it re-runs if source type changes but other deps don't
  }, [mediaSrc, mediaDuration, clipSegmentationDuration, language, isYouTubeVideo, toast, currentSourceType]);


  // Effect for component unmount cleanup
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        console.log("LinguaClipApp: Component unmounting, revoking object URL:", objectUrlRef.current);
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = undefined;
      }
    };
  }, []); // Empty dependency array ensures this runs only on unmount

  const handleSelectClip = (index: number) => {
    if (index >= 0 && index < clips.length) {
      setCurrentClipIndex(index);
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
    // Crucially use `objectUrlRef.current` if sourceFile was used, or mediaSrc if it's a direct URL
    const actualMediaSrcForExtraction = sourceFile ? objectUrlRef.current : mediaSrc;

    if (!actualMediaSrcForExtraction || isYouTubeVideo || !currentClipToTranscribe || !currentSourceType || (currentSourceType === 'url' && isYouTubeVideo) || currentSourceType === 'unknown') {
      toast({variant: "destructive", title: "Transcription Error", description: "Cannot transcribe. Ensure an uploaded media file (audio or video) or a direct non-YouTube URL is loaded and a clip is active."});
      return;
    }
    
    updateClipData(clipId, { automatedTranscription: "Transcribing...", feedback: null, comparisonResult: null }); 

    let audioDataUri: string | null = null;
    try {
        console.log(`LinguaClipApp: Calling extractAudioFromVideoSegment with src: ${actualMediaSrcForExtraction?.substring(0,100)}, type: ${currentSourceType}`);
        audioDataUri = await extractAudioFromVideoSegment(
          actualMediaSrcForExtraction, 
          currentClipToTranscribe.startTime, 
          currentClipToTranscribe.endTime,
          currentSourceType === 'audio' ? 'audio' : 'video' // Pass the correct determined source type
        );
    } catch (error) {
        console.warn("LinguaClipApp: Audio extraction failed in LinguaClipApp:", error);
        toast({variant: "destructive", title: "Audio Extraction Failed", description: (error as Error).message || "Could not extract audio for transcription."});
        updateClipData(clipId, { automatedTranscription: "Error: Audio extraction failed." });
        return;
    }

    if (!audioDataUri) {
        toast({variant: "destructive", title: "Transcription Error", description: "Failed to obtain audio data for transcription."});
        updateClipData(clipId, { automatedTranscription: "Error: No audio data." });
        return;
    }
    
    console.log("LinguaClipApp: Audio Data URI prefix for AI:", audioDataUri.substring(0, 100));
    const clipLanguage = (currentClipToTranscribe.language || language).trim();
    console.log("LinguaClipApp: Language for AI transcription:", clipLanguage);


    try {
      const result = await transcribeAudio({ audioDataUri, language: clipLanguage });
      updateClipData(clipId, { automatedTranscription: result.transcription });
      toast({ title: "Transcription Successful" });
    } catch (error) {
      console.warn("LinguaClipApp: AI Transcription error in LinguaClipApp:", error); 
      toast({ variant: "destructive", title: "AI Error", description: "Failed to transcribe audio. Check console for details." });
      updateClipData(clipId, { automatedTranscription: "Error: Could not transcribe audio." });
    }
  };

  const handleGetFeedback = async (clipId: string): Promise<void> => {
    const currentClipForFeedback = clips.find(c => c.id === clipId);
    if (isYouTubeVideo || !currentClipForFeedback || !currentClipForFeedback.userTranscription || !currentClipForFeedback.automatedTranscription || currentClipForFeedback.automatedTranscription.startsWith("Error:") || currentClipForFeedback.automatedTranscription === "Transcribing...") {
      toast({variant: "destructive", title: "Feedback Error", description: "Ensure automated transcription is successful and you've typed something."});
      return;
    }
    updateClipData(clipId, { feedback: "Generating feedback..." });
    try {
      const result = await transcriptionFeedback({
        userTranscription: currentClipForFeedback.userTranscription,
        automatedTranscription: currentClipForFeedback.automatedTranscription,
        language: (currentClipForFeedback.language || language).trim(),
      });
      updateClipData(clipId, { feedback: result.feedback });
      toast({ title: "Feedback Generated" });
    } catch (error) {
      console.warn("LinguaClipApp: AI Feedback error:", error);
      toast({ variant: "destructive", title: "AI Error", description: "Failed to generate feedback." });
      updateClipData(clipId, { feedback: "Error: Could not generate feedback." });
    }
  };

  const handleGetCorrections = async (clipId: string): Promise<void> => {
    const currentClipForCorrections = clips.find(c => c.id === clipId);
     if (isYouTubeVideo || !currentClipForCorrections || !currentClipForCorrections.userTranscription || !currentClipForCorrections.automatedTranscription || currentClipForCorrections.automatedTranscription.startsWith("Error:") || currentClipForCorrections.automatedTranscription === "Transcribing...") {
      toast({variant: "destructive", title: "Comparison Error", description: "Ensure automated transcription is successful and you've typed something."});
      return;
    }
    updateClipData(clipId, { comparisonResult: [{token: "Comparing...", status: "correct"}] }); 
    try {
      const result = await compareTranscriptions({
        userTranscription: currentClipForCorrections.userTranscription,
        automatedTranscription: currentClipForCorrections.automatedTranscription,
        language: (currentClipForCorrections.language || language).trim(),
      });
      updateClipData(clipId, { comparisonResult: result.comparisonResult });
      toast({ title: "Comparison Complete" });
    } catch (error) {
      console.warn("LinguaClipApp: AI Comparison error:", error);
      toast({ variant: "destructive", title: "AI Error", description: "Failed to generate comparison." });
      updateClipData(clipId, { comparisonResult: [{ token: "Error generating comparison.", status: "incorrect", suggestion: "N/A" }] });
    }
  };

  const handleRemoveClip = (clipIdToRemove: string) => {
    if (isAnyClipTranscribing) { 
      toast({variant: "destructive", title: "Action Disabled", description: "Cannot remove clips while transcription is in progress."});
      return;
    }
    processingIdRef.current += 1; 
    const removedClipOriginalIndex = clips.findIndex(clip => clip.id === clipIdToRemove);
    if (removedClipOriginalIndex === -1) return;

    const newClips = clips.filter(clip => clip.id !== clipIdToRemove);

    if (newClips.length === 0) {
      // If removing the last clip of an uploaded file, reset everything
      if (currentSourceType === 'video' || currentSourceType === 'audio') {
        console.log("LinguaClipApp: handleRemoveClip - all clips removed, resetting app state.");
        resetAppState(); // This will revoke objectUrlRef.current if not transcribing
        toast({ title: "Media Cleared", description: "All clips have been removed and the media file has been cleared." });
        return;
      }
      // If it was a URL source or something else, just clear clips
      setClips([]); 
      setCurrentClipIndex(0);
      toast({ title: "All Clips Removed" });
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
            comparisonResult: (c.comparisonResult as CorrectionToken[] | null) || null, 
            // language: c.language || language, // Clip language already set during generation/update
        })),
      });
      if (result.success) {
        toast({ title: "Media Saved", description: result.message });
      } else {
        toast({ variant: "destructive", title: "Save Failed", description: result.message });
      }
    } catch (error) {
      console.warn("LinguaClipApp: Error saving media:", error);
      toast({ variant: "destructive", title: "Save Error", description: "An unexpected error occurred while saving." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetAppWithCheck = () => {
    if (isAnyClipTranscribing) {
      toast({variant: "destructive", title: "Action Disabled", description: "Cannot clear media while transcription is in progress."});
      return;
    }
    console.log("LinguaClipApp: handleResetAppWithCheck calling resetAppState.");
    resetAppState();
  }

  const LoadedMediaIcon = currentSourceType === 'audio' ? FileAudio : FileVideo;
  const currentClip = clips[currentClipIndex];
  const globalAppBusyState = isLoading || isSaving; // For disabling inputs during critical global ops

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
                  <Button variant="ghost" size="icon" onClick={handleResetAppWithCheck} aria-label="Remove media" disabled={globalAppBusyState || isAnyClipTranscribing}>
                    <XIcon className="h-5 w-5 text-muted-foreground hover:text-foreground" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <LanguageSelector 
                        selectedLanguage={language} 
                        onLanguageChange={handleLanguageChange} 
                        disabled={globalAppBusyState || isAnyClipTranscribing || !mediaSrc} 
                    />
                </div>
                 {user && mediaSrc && clips.length > 0 && (currentSourceType !== 'url' || !isYouTubeVideo) && (
                    <Button onClick={handleSaveMedia} disabled={globalAppBusyState || isAnyClipTranscribing} className="w-full sm:w-auto">
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? "Saving..." : "Save Media"}
                    </Button>
                  )}
              </div>
            ) : (
              <>
                <VideoInputForm onSourceLoad={handleSourceLoad} isLoading={isLoading} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <LanguageSelector 
                        selectedLanguage={language} 
                        onLanguageChange={handleLanguageChange} 
                        disabled={isLoading} 
                    />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {mediaSrc && clips.length > 0 && currentClip && (
          <TranscriptionWorkspace
            key={currentClip.id + '-' + (currentClip.language || language) + '-' + currentClipIndex} 
            currentClip={currentClip}
            clips={clips} 
            mediaSrc={mediaSrc} // This is the direct URL or the blob URL from objectUrlRef.current
            currentClipIndex={currentClipIndex}
            onSelectClip={handleSelectClip} 
            onTranscribeAudio={handleTranscribeAudio}
            onGetFeedback={handleGetFeedback}
            onGetCorrections={handleGetCorrections}
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
    
