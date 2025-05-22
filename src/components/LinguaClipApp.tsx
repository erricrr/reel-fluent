"use client";

import type * as React from 'react';
import { useState, useRef, useCallback, useEffect } from "react";
import Header from "./Header";
import VideoInputForm from "./VideoInputForm";
import LanguageSelector from "./LanguageSelector";
import TranscriptionWorkspace from "./TranscriptionWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { generateClips, extractAudioFromVideoSegment, type Clip } from "@/lib/videoUtils";
import { transcribeAudio } from "@/ai/flows/transcribe-audio";
import { transcriptionFeedback } from "@/ai/flows/transcription-feedback";

export default function LinguaClipApp() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined); // For YT or direct URLs
  const [videoSrc, setVideoSrc] = useState<string | undefined>(undefined);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [clips, setClips] = useState<Clip[]>([]);
  const [currentClipIndex, setCurrentClipIndex] = useState<number>(0);
  const [language, setLanguage] = useState<string>("vietnamese"); // Default language

  const [isLoading, setIsLoading] = useState<boolean>(false); // General loading for video processing
  
  const videoElementRef = useRef<HTMLVideoElement>(null); // Ref for the <video> element if needed by utilities

  const { toast } = useToast();

  const isYouTubeVideo = videoUrl?.includes("youtube.com") || videoUrl?.includes("youtu.be") || false;


  const resetAppState = () => {
    setVideoFile(null);
    setVideoUrl(undefined);
    setVideoSrc(undefined);
    setVideoDuration(0);
    setClips([]);
    setCurrentClipIndex(0);
    setIsLoading(false);
  };

  const handleVideoLoad = useCallback(async (source: { file?: File; url?: string }) => {
    resetAppState(); // Reset previous state
    setIsLoading(true);

    if (source.file) {
      setVideoFile(source.file);
      const objectURL = URL.createObjectURL(source.file);
      setVideoSrc(objectURL);
      // Duration will be set by VideoPlayer's onLoadedMetadata
    } else if (source.url) {
      setVideoUrl(source.url);
      setVideoSrc(source.url);
      // For URLs (especially YouTube), getting duration client-side is tricky.
      // If it's a direct video URL, onLoadedMetadata will work.
      // For YouTube, we might not get duration easily for clip generation this way.
      // We'll simplify: if it's YouTube, clip generation might be disabled or rely on YouTube's own API if integrated.
      // For now, if it's a YT URL, clip generation will be skipped.
      if (source.url.includes("youtube.com") || source.url.includes("youtu.be")) {
        // For YouTube, we create a single "clip" representing the whole video
        // as we can't easily get duration for precise 1-min clips without an API
        setClips([{ id: 'yt-full', startTime: 0, endTime: Infinity }]); // Placeholder endTime
        setVideoDuration(Infinity); // Placeholder duration
        setIsLoading(false);
        toast({ title: "YouTube Video Loaded", description: "Viewing YouTube video. Transcription/clip features are limited." });
        return;
      }
    } else {
      toast({ variant: "destructive", title: "Error", description: "No video source provided." });
      setIsLoading(false);
      return;
    }
    // For file uploads or direct video URLs, duration is set via a temporary video element
    // or by VideoPlayer's onLoadedMetadata if we pass a handler.
    // Let's use a temporary video element to get duration for non-YouTube videos
    if (source.file || (source.url && !(source.url.includes("youtube.com") || source.url.includes("youtu.be")))) {
        const tempVideo = document.createElement('video');
        tempVideo.onloadedmetadata = () => {
            setVideoDuration(tempVideo.duration);
            const generatedClips = generateClips(tempVideo.duration);
            setClips(generatedClips);
            if (generatedClips.length > 0) {
              toast({ title: "Video Processed", description: `${generatedClips.length} clips generated.` });
            } else {
              toast({ variant: "destructive", title: "Processing Error", description: "Could not generate clips. Video may be too short or invalid." });
            }
            setIsLoading(false);
            // Revoke object URL if it was from a file to free memory, but we need it for videoSrc
            // URL.revokeObjectURL(objectURL); // Do this on component unmount or when new video loaded
        };
        tempVideo.onerror = () => {
            toast({ variant: "destructive", title: "Error", description: "Could not load video metadata." });
            setIsLoading(false);
            resetAppState();
        };
        tempVideo.src = videoSrc!; // This will be set from source.file or source.url
    }

  }, [toast, videoSrc]);


  // Cleanup ObjectURL
  useEffect(() => {
    let objectUrlToRevoke: string | undefined;
    if (videoFile && videoSrc?.startsWith('blob:')) {
      objectUrlToRevoke = videoSrc;
    }
    return () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [videoFile, videoSrc]);


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

  const handleTranscribeAudio = async (/* audioDataUri: string */): Promise<string | null> => {
    // The actual audioDataUri will be extracted and passed by TranscriptionWorkspace
    // For this handler, we just make the AI call if TranscriptionWorkspace successfully provides it.
    // This function is now more of a direct passthrough for the AI call.
    // The audio extraction logic is better placed closer to the video element (in TranscriptionWorkspace or videoUtils invoked from there).
    
    // Placeholder: In a real app, TranscriptionWorkspace would call extractAudioFromVideoSegment,
    // then pass the result to this function.
    // For now, TranscriptionWorkspace passes a placeholder. We use that.
    const currentClipToTranscribe = clips[currentClipIndex];
    if (!videoSrc || isYouTubeVideo || !currentClipToTranscribe) {
      toast({variant: "destructive", title: "Transcription Error", description: "Cannot transcribe. Ensure an uploaded video and clip are active."});
      return null;
    }

    let audioDataUri: string | null = null;
    if (videoElementRef.current) {
        try {
            audioDataUri = await extractAudioFromVideoSegment(videoElementRef.current, currentClipToTranscribe.startTime, currentClipToTranscribe.endTime);
        } catch (error) {
            console.error("Audio extraction failed:", error);
            toast({variant: "destructive", title: "Audio Extraction Failed", description: (error as Error).message || "Could not extract audio for transcription."});
            return null;
        }
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


  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 md:px-6 py-8 space-y-8">
        <Card className="shadow-lg">
          <CardContent className="p-6 space-y-6">
            <VideoInputForm onVideoLoad={handleVideoLoad} isLoading={isLoading} />
            <LanguageSelector selectedLanguage={language} onLanguageChange={handleLanguageChange} disabled={isLoading || !videoSrc} />
          </CardContent>
        </Card>
        
        {/* This is a hidden video element solely for the purpose of programmatically extracting audio.
            The actual displayed video is within VideoPlayer component inside TranscriptionWorkspace.
            This approach simplifies audio extraction for file uploads.
            For YouTube, this element won't be used for audio extraction. */}
        {videoSrc && !isYouTubeVideo && (
           <video ref={videoElementRef} src={videoSrc} style={{ display: 'none' }} crossOrigin="anonymous" />
        )}

        {videoSrc && clips.length > 0 && (
          <TranscriptionWorkspace
            videoSrc={videoSrc}
            clips={clips}
            currentClipIndex={currentClipIndex}
            onNextClip={handleNextClip}
            onPrevClip={handlePrevClip}
            onTranscribeAudio={handleTranscribeAudio}
            onGetFeedback={handleGetFeedback}
            videoElementRef={videoElementRef}
            isYouTubeVideo={isYouTubeVideo}
          />
        )}
        {isLoading && (
          <div className="text-center py-10">
            <p className="text-lg text-primary animate-pulse">Processing video...</p>
          </div>
        )}
      </main>
      <footer className="py-4 px-4 md:px-8 border-t text-center">
        <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} LinguaClip. Happy learning!</p>
      </footer>
    </div>
  );
}
