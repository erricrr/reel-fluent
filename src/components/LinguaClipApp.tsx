
"use client";

import type * as React from 'react';
import { useState, useCallback, useEffect } from "react";
import Header from "./Header";
import VideoInputForm from "./VideoInputForm";
import LanguageSelector from "./LanguageSelector";
import TranscriptionWorkspace from "./TranscriptionWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileVideo, X as XIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateClips, extractAudioFromVideoSegment, type Clip } from "@/lib/videoUtils";
import { transcribeAudio } from "@/ai/flows/transcribe-audio";
import { transcriptionFeedback } from "@/ai/flows/transcription-feedback";
import { compareTranscriptions, type CompareTranscriptionsOutput } from "@/ai/flows/compare-transcriptions-flow";

export default function LinguaClipApp() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined); // For YT or direct URLs
  const [videoSrc, setVideoSrc] = useState<string | undefined>(undefined);
  const [videoDisplayName, setVideoDisplayName] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [clips, setClips] = useState<Clip[]>([]);
  const [currentClipIndex, setCurrentClipIndex] = useState<number>(0);
  const [language, setLanguage] = useState<string>("vietnamese"); // Default language
  const [comparisonResult, setComparisonResult] = useState<CompareTranscriptionsOutput['comparisonResult'] | null>(null);


  const [isLoading, setIsLoading] = useState<boolean>(false); // General loading for video processing
  
  const { toast } = useToast();

  const isYouTubeVideo = videoUrl?.includes("youtube.com") || videoUrl?.includes("youtu.be") || false;


  const resetAppState = () => {
    setVideoFile(null);
    setVideoUrl(undefined);
    setVideoSrc(undefined);
    setVideoDisplayName(null);
    setVideoDuration(0);
    setClips([]);
    setCurrentClipIndex(0);
    setIsLoading(false);
    setComparisonResult(null);
  };

  const handleVideoLoad = useCallback(async (source: { file?: File; url?: string }) => {
    resetAppState(); 
    setIsLoading(true);
    let currentVideoSrc: string | undefined = undefined;
    let displayName: string | null = null;

    if (source.file) {
      setVideoFile(source.file);
      displayName = source.file.name;
      const objectURL = URL.createObjectURL(source.file);
      setVideoSrc(objectURL);
      currentVideoSrc = objectURL;
    } else if (source.url) {
      setVideoUrl(source.url);
      displayName = source.url;
      setVideoSrc(source.url);
      currentVideoSrc = source.url;
      if (source.url.includes("youtube.com") || source.url.includes("youtu.be")) {
        setVideoDisplayName(displayName);
        setClips([{ id: 'yt-full', startTime: 0, endTime: Infinity }]); 
        setVideoDuration(Infinity); 
        setIsLoading(false);
        toast({ title: "YouTube Video Loaded", description: "Viewing YouTube video. Transcription/clip features are limited." });
        return;
      }
    } else {
      toast({ variant: "destructive", title: "Error", description: "No video source provided." });
      setIsLoading(false);
      return;
    }
   
    setVideoDisplayName(displayName);

    if (currentVideoSrc && !isYouTubeVideo) {
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
        };
        tempVideo.onerror = () => {
            toast({ variant: "destructive", title: "Error", description: "Could not load video metadata. The video file might be corrupted or in an unsupported format." });
            setIsLoading(false);
            resetAppState();
        };
        tempVideo.src = currentVideoSrc;
        tempVideo.load(); 
    }

  }, [toast, isYouTubeVideo]); 


  useEffect(() => {
    let objectUrlToRevoke: string | undefined;
    if (videoFile && videoSrc?.startsWith('blob:')) {
      objectUrlToRevoke = videoSrc;
    }
    return () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
        console.log("Revoked ObjectURL:", objectUrlToRevoke);
      }
    };
  }, [videoFile, videoSrc]);


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
    if (!videoSrc || isYouTubeVideo || !currentClipToTranscribe) {
      toast({variant: "destructive", title: "Transcription Error", description: "Cannot transcribe. Ensure an uploaded video and clip are active."});
      return null;
    }

    let audioDataUri: string | null = null;
    try {
        audioDataUri = await extractAudioFromVideoSegment(videoSrc, currentClipToTranscribe.startTime, currentClipToTranscribe.endTime);
    } catch (error) {
        console.error("Audio extraction failed:", error);
        toast({variant: "destructive", title: "Audio Extraction Failed", description: (error as Error).message || "Could not extract audio for transcription. The video format might not be fully compatible."});
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


  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 md:px-6 py-8 space-y-8">
        <Card className="shadow-lg">
          <CardContent className="p-6 space-y-6">
            {videoSrc && videoDisplayName ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0"> {/* Added min-w-0 for truncation */}
                    <FileVideo className="h-6 w-6 text-primary flex-shrink-0" />
                    <span className="text-sm font-medium truncate" title={videoDisplayName}>
                      {videoDisplayName}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={resetAppState} aria-label="Remove video">
                    <XIcon className="h-5 w-5" />
                  </Button>
                </div>
                <Button onClick={resetAppState} variant="outline" className="w-full">
                  Clear Loaded Video
                </Button>
                <LanguageSelector selectedLanguage={language} onLanguageChange={handleLanguageChange} disabled={isLoading || !videoSrc} />
              </div>
            ) : (
              <>
                <VideoInputForm onVideoLoad={handleVideoLoad} isLoading={isLoading} />
                <LanguageSelector selectedLanguage={language} onLanguageChange={handleLanguageChange} disabled={isLoading || !videoSrc} />
              </>
            )}
          </CardContent>
        </Card>
        
        {videoSrc && clips.length > 0 && (
          <TranscriptionWorkspace
            videoSrc={videoSrc}
            clips={clips}
            currentClipIndex={currentClipIndex}
            onNextClip={handleNextClip}
            onPrevClip={handlePrevClip}
            onTranscribeAudio={handleTranscribeAudio}
            onGetFeedback={handleGetFeedback}
            onGetCorrections={handleGetCorrections}
            comparisonResult={comparisonResult}
            isYouTubeVideo={isYouTubeVideo}
            language={language}
          />
        )}
        {isLoading && videoSrc === undefined && ( 
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

