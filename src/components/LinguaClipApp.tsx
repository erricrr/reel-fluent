
"use client";

import type * as React from 'react';
import { useState, useCallback, useEffect, useRef } from "react";
import Header from "./Header";
import VideoInputForm from "./VideoInputForm";
import LanguageSelector from "./LanguageSelector";
import TranscriptionWorkspace from "./TranscriptionWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileVideo, X as XIcon, FileAudio } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateClips, extractAudioFromVideoSegment, type Clip } from "@/lib/videoUtils";
import { transcribeAudio } from "@/ai/flows/transcribe-audio";
import { transcriptionFeedback } from "@/ai/flows/transcription-feedback";
import { compareTranscriptions, type CompareTranscriptionsOutput } from "@/ai/flows/compare-transcriptions-flow";

export default function LinguaClipApp() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined); // Used for YouTube or direct video URLs
  const [mediaSrc, setMediaSrc] = useState<string | undefined>(undefined); // Object URL for files, or direct URL
  const [mediaDisplayName, setMediaDisplayName] = useState<string | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number>(0);
  const [clips, setClips] = useState<Clip[]>([]);
  const [currentClipIndex, setCurrentClipIndex] = useState<number>(0);
  const [language, setLanguage] = useState<string>("vietnamese");
  const [comparisonResult, setComparisonResult] = useState<CompareTranscriptionsOutput['comparisonResult'] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentSourceType, setCurrentSourceType] = useState<'video' | 'audio' | 'url' | null>(null);


  const processingIdRef = useRef<number>(0);

  const { toast } = useToast();

  const isYouTubeVideo = sourceUrl?.includes("youtube.com") || sourceUrl?.includes("youtu.be") || false;

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
    setComparisonResult(null);
    setCurrentSourceType(null);
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
        setClips([{ id: 'yt-full', startTime: 0, endTime: Infinity }]);
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

    if (processingIdRef.current !== currentProcessingId) return; 
    setMediaDisplayName(displayName);

    if (currentMediaSrc && !isYouTubeVideo) {
      if (source.file?.type.startsWith("video/")) {
        const tempVideo = document.createElement('video');
        tempVideo.onloadedmetadata = () => {
            if (processingIdRef.current !== currentProcessingId) return;
            setMediaDuration(tempVideo.duration);
            const generatedClips = generateClips(tempVideo.duration);
            setClips(generatedClips);
            if (generatedClips.length > 0) {
              toast({ title: "Video Processed", description: `${generatedClips.length} clips generated.` });
            } else {
              toast({ variant: "destructive", title: "Processing Error", description: "Could not generate clips. Video may be too short or invalid." });
            }
            setIsLoading(false);
        };
        tempVideo.onerror = () => {
            if (processingIdRef.current !== currentProcessingId) return;
            toast({ variant: "destructive", title: "Error", description: "Could not load video metadata." });
            setIsLoading(false);
            resetAppState();
        };
        tempVideo.src = currentMediaSrc;
        tempVideo.load();
      } else if (source.file?.type.startsWith("audio/")) {
        const tempAudio = document.createElement('audio');
        tempAudio.onloadedmetadata = () => {
            if (processingIdRef.current !== currentProcessingId) return;
            setMediaDuration(tempAudio.duration);
            setClips([{ id: 'audio-full-0', startTime: 0, endTime: tempAudio.duration }]);
            toast({ title: "Audio File Processed", description: `1 clip generated for the full audio duration (${Math.round(tempAudio.duration)}s).` });
            setIsLoading(false);
        };
        tempAudio.onerror = () => {
            if (processingIdRef.current !== currentProcessingId) return;
            toast({ variant: "destructive", title: "Error", description: "Could not load audio metadata." });
            setIsLoading(false);
            resetAppState();
        };
        tempAudio.src = currentMediaSrc;
        tempAudio.load();
      } else if (source.url) { // Direct video URL (non-YouTube)
        const tempVideo = document.createElement('video');
        tempVideo.onloadedmetadata = () => {
            if (processingIdRef.current !== currentProcessingId) return;
            setMediaDuration(tempVideo.duration);
            const generatedClips = generateClips(tempVideo.duration);
            setClips(generatedClips);
             if (generatedClips.length > 0) {
              toast({ title: "Video URL Processed", description: `${generatedClips.length} clips generated.` });
            } else {
              toast({ variant: "destructive", title: "Processing Error", description: "Could not generate clips for video URL." });
            }
            setIsLoading(false);
        };
        tempVideo.onerror = () => {
            if (processingIdRef.current !== currentProcessingId) return;
            toast({ variant: "destructive", title: "Error", description: "Could not load video URL metadata." });
            setIsLoading(false);
            resetAppState();
        };
        tempVideo.src = currentMediaSrc; // This is source.url
        tempVideo.load();
      }
    } else if (!currentMediaSrc && !isYouTubeVideo) { 
        if (processingIdRef.current !== currentProcessingId) return;
        setIsLoading(false);
        toast({ variant: "destructive", title: "Error", description: "Media source became unavailable." });
    }
  }, [toast, resetAppState, isYouTubeVideo]);


  useEffect(() => {
    let objectUrlToRevoke: string | undefined;
    if (sourceFile && mediaSrc?.startsWith('blob:')) {
      objectUrlToRevoke = mediaSrc;
    }
    return () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
        console.log("Revoked ObjectURL:", objectUrlToRevoke);
      }
    };
  }, [sourceFile, mediaSrc]);


  const handleNextClip = () => {
    if (currentClipIndex < clips.length - 1) {
      setCurrentClipIndex(currentClipIndex + 1);
      setComparisonResult(null);
    }
  };

  const handlePrevClip = () => {
    if (currentClipIndex > 0) {
      setCurrentClipIndex(currentClipIndex - 1);
      setComparisonResult(null);
    }
  };

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    setComparisonResult(null);
  };

  const handleTranscribeAudio = async (): Promise<string | null> => {
    const currentClipToTranscribe = clips[currentClipIndex];
    setComparisonResult(null);
    if (!mediaSrc || isYouTubeVideo || !currentClipToTranscribe) {
      toast({variant: "destructive", title: "Transcription Error", description: "Cannot transcribe. Ensure an uploaded video/audio and clip are active."});
      return null;
    }

    let audioDataUri: string | null = null;
    try {
        // mediaSrc here is the object URL for the full uploaded file, or the direct URL
        audioDataUri = await extractAudioFromVideoSegment(mediaSrc, currentClipToTranscribe.startTime, currentClipToTranscribe.endTime);
    } catch (error) {
        console.error("Audio extraction failed:", error);
        toast({variant: "destructive", title: "Audio Extraction Failed", description: (error as Error).message || "Could not extract audio for transcription."});
        return null;
    }

    if (!audioDataUri) {
        toast({variant: "destructive", title: "Transcription Error", description: "Failed to obtain audio data for transcription."});
        return null;
    }

    try {
      const result = await transcribeAudio({ audioDataUri, language });
      toast({ title: "Transcription Successful" });
      return result.transcription;
    } catch (error) {
      console.error("AI Transcription error:", error);
      toast({ variant: "destructive", title: "AI Error", description: "Failed to transcribe audio." });
      return "Error: Could not transcribe audio.";
    }
  };

  const handleGetFeedback = async (userTranscription: string, automatedTranscription: string): Promise<string | null> => {
     if (isYouTubeVideo) {
      toast({variant: "destructive", title: "Feedback Error", description: "Feedback is not available for YouTube videos."});
      return null;
    }
    try {
      const result = await transcriptionFeedback({
        userTranscription,
        automatedTranscription,
        language,
      });
      toast({ title: "Feedback Generated" });
      return result.feedback;
    } catch (error) {
      console.error("AI Feedback error:", error);
      toast({ variant: "destructive", title: "AI Error", description: "Failed to generate feedback." });
      return "Error: Could not generate feedback.";
    }
  };

  const handleGetCorrections = async (userTranscription: string, automatedTranscription: string): Promise<CompareTranscriptionsOutput['comparisonResult'] | null> => {
    if (isYouTubeVideo) {
      toast({variant: "destructive", title: "Comparison Error", description: "Comparison is not available for YouTube videos."});
      return null;
    }
    setComparisonResult(null);
    try {
      const result = await compareTranscriptions({
        userTranscription,
        automatedTranscription,
        language,
      });
      setComparisonResult(result.comparisonResult);
      toast({ title: "Comparison Complete" });
      return result.comparisonResult;
    } catch (error) {
      console.error("AI Comparison error:", error);
      toast({ variant: "destructive", title: "AI Error", description: "Failed to generate comparison." });
      setComparisonResult([{ token: "Error generating comparison.", status: "incorrect" }]);
      return null;
    }
  };

  const handleRemoveClip = (clipIdToRemove: string) => {
    processingIdRef.current += 1; 
    const removedClipOriginalIndex = clips.findIndex(clip => clip.id === clipIdToRemove);
    if (removedClipOriginalIndex === -1) return;

    const newClips = clips.filter(clip => clip.id !== clipIdToRemove);

    if (newClips.length === 0) {
      // If it was an audio file with only one clip, and it's removed, reset entirely
      if (sourceFile?.type.startsWith('audio/')) {
        resetAppState();
        toast({ title: "Audio Clip Removed", description: "The audio file has been cleared." });
        return;
      }
      setClips([]);
      setCurrentClipIndex(0);
      setComparisonResult(null);
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
      setComparisonResult(null);
    }
    toast({ title: "Clip Removed", description: "The selected clip has been removed from the list." });
  };

  const LoadedMediaIcon = currentSourceType === 'audio' ? FileAudio : FileVideo;

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
                <Button onClick={resetAppState} variant="outline" className="w-full">
                  Clear Loaded Media
                </Button>
                <LanguageSelector selectedLanguage={language} onLanguageChange={handleLanguageChange} disabled={isLoading || !mediaSrc} />
              </div>
            ) : (
              <>
                <VideoInputForm onSourceLoad={handleSourceLoad} isLoading={isLoading} />
                <LanguageSelector selectedLanguage={language} onLanguageChange={handleLanguageChange} disabled={isLoading || !mediaSrc} />
              </>
            )}
          </CardContent>
        </Card>

        {mediaSrc && clips.length > 0 && (
          <TranscriptionWorkspace
            mediaSrc={mediaSrc}
            clips={clips}
            currentClipIndex={currentClipIndex}
            onNextClip={handleNextClip}
            onPrevClip={handlePrevClip}
            onTranscribeAudio={handleTranscribeAudio}
            onGetFeedback={handleGetFeedback}
            onGetCorrections={handleGetCorrections}
            onRemoveClip={handleRemoveClip}
            comparisonResult={comparisonResult}
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
