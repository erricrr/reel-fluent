
"use client";

import type * as React from 'react';
import { useState, useEffect } from "react";
import VideoPlayer from "./VideoPlayer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, Mic, Sparkles, Loader2 } from "lucide-react";
import type { Clip } from '@/lib/videoUtils'; // Assuming Clip type definition

interface TranscriptionWorkspaceProps {
  videoSrc?: string;
  clips: Clip[];
  currentClipIndex: number;
  onNextClip: () => void;
  onPrevClip: () => void;
  onTranscribeAudio: (audioDataUri: string) => Promise<string | null>;
  onGetFeedback: (userTranscription: string, automatedTranscription: string) => Promise<string | null>;
  videoElementRef: React.RefObject<HTMLVideoElement>; // For audio extraction
  isYouTubeVideo: boolean;
}

export default function TranscriptionWorkspace({
  videoSrc,
  clips,
  currentClipIndex,
  onNextClip,
  onPrevClip,
  onTranscribeAudio,
  onGetFeedback,
  videoElementRef, // This ref should be connected to the <video> inside VideoPlayer if not YouTube
  isYouTubeVideo,
}: TranscriptionWorkspaceProps) {
  const [userTranscription, setUserTranscription] = useState("");
  const [automatedTranscription, setAutomatedTranscription] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoadingTranscription, setIsLoadingTranscription] = useState(false);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);

  const currentClip = clips[currentClipIndex];

  useEffect(() => {
    // Reset transcriptions and feedback when clip changes
    setUserTranscription("");
    setAutomatedTranscription(null);
    setFeedback(null);
  }, [currentClipIndex]);

  const handleTranscribe = async () => {
    if (!currentClip || isYouTubeVideo) { // Transcription from YouTube iframe is complex and not handled here
      alert("Transcription is only available for uploaded videos and active clips.");
      return;
    }
    
    setIsLoadingTranscription(true);
    setAutomatedTranscription(null); // Clear previous transcription
    
    // Simulate audio extraction for now. Actual extraction would be complex.
    // This would ideally call a utility to get audioDataUri from currentClip segment of videoSrc
    // For example, using MediaRecorder on videoElementRef.current if it's a direct file.
    // This is a placeholder for where audio extraction logic would go.
    // In a real scenario, you'd use videoElementRef.current with MediaRecorder.
    // const audioDataUri = await extractAudioFromVideoSegment(videoElementRef.current, currentClip.startTime, currentClip.endTime);
    
    // Placeholder for audio data URI. In a real app, this would be dynamically generated.
    const placeholderAudioDataUri = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="; // Empty WAV
    
    try {
      const transcription = await onTranscribeAudio(placeholderAudioDataUri); // Pass actual audio URI
      setAutomatedTranscription(transcription);
    } catch (error) {
      console.error("Transcription error:", error);
      setAutomatedTranscription("Error during transcription.");
    } finally {
      setIsLoadingTranscription(false);
    }
  };

  const handleFeedback = async () => {
    if (!userTranscription.trim() || !automatedTranscription) {
      alert("Please provide your transcription and ensure automated transcription is available.");
      return;
    }
    setIsLoadingFeedback(true);
    setFeedback(null); // Clear previous feedback
    try {
      const newFeedback = await onGetFeedback(userTranscription, automatedTranscription);
      setFeedback(newFeedback);
    } catch (error) {
      console.error("Feedback error:", error);
      setFeedback("Error generating feedback.");
    } finally {
      setIsLoadingFeedback(false);
    }
  };

  if (!videoSrc || clips.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p>Load a video to begin.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 md:p-6">
      {/* Video Player and Clip Navigation Section */}
      <div className="lg:w-2/3 w-full space-y-4">
        <VideoPlayer
          src={videoSrc}
          startTime={currentClip?.startTime}
          endTime={currentClip?.endTime}
          className="shadow-lg rounded-lg"
          // Pass down the ref if VideoPlayer can accept it and it's not a YouTube video
          // This part needs careful ref forwarding if VideoPlayer nests the actual video element
        />
        <div className="flex justify-between items-center p-2 bg-card rounded-lg shadow">
          <Button onClick={onPrevClip} disabled={currentClipIndex === 0} variant="outline" size="icon">
            <ChevronLeft className="h-5 w-5" />
            <span className="sr-only">Previous Clip</span>
          </Button>
          <div className="text-sm font-medium text-foreground">
            Clip {currentClipIndex + 1} of {clips.length}
            {currentClip && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({new Date(currentClip.startTime * 1000).toISOString().substr(14, 5)} - 
                 {isFinite(currentClip.endTime) ? new Date(currentClip.endTime * 1000).toISOString().substr(14, 5) : "--:--"})
              </span>
            )}
          </div>
          <Button onClick={onNextClip} disabled={currentClipIndex === clips.length - 1} variant="outline" size="icon">
            <ChevronRight className="h-5 w-5" />
            <span className="sr-only">Next Clip</span>
          </Button>
        </div>
         <Button 
            onClick={handleTranscribe} 
            disabled={isLoadingTranscription || isYouTubeVideo} 
            className="w-full"
            variant="outline"
          >
            {isLoadingTranscription ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mic className="mr-2 h-4 w-4" />
            )}
            Transcribe This Clip (AI)
            {isYouTubeVideo && <span className="text-xs ml-1">(File Uploads Only)</span>}
          </Button>
      </div>

      {/* Transcription and Feedback Section */}
      <div className="lg:w-1/3 w-full">
        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Your Transcription</TabsTrigger>
            <TabsTrigger value="ai">AI & Feedback</TabsTrigger>
          </TabsList>
          
          <TabsContent value="manual" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Type What You Hear</CardTitle>
                <CardDescription>Listen to the clip and type the dialogue below.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Start typing..."
                  value={userTranscription}
                  onChange={(e) => setUserTranscription(e.target.value)}
                  rows={8}
                  className="min-h-[150px] resize-none"
                />
                <Button onClick={handleFeedback} disabled={isLoadingFeedback || !userTranscription.trim() || !automatedTranscription || isYouTubeVideo} className="w-full">
                  {isLoadingFeedback ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Get Feedback (AI)
                  {isYouTubeVideo && <span className="text-xs ml-1">(File Uploads Only)</span>}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Automated Transcription & Feedback</CardTitle>
                 <CardDescription>View the AI-generated transcription and feedback on your input.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">Automated Transcription:</h3>
                  <ScrollArea className="h-[120px] w-full rounded-md border p-3 bg-muted/50">
                    {isLoadingTranscription && <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto my-4" />}
                    {automatedTranscription ? <p className="text-sm">{automatedTranscription}</p> : <p className="text-sm text-muted-foreground">Click "Transcribe This Clip (AI)" to generate.</p>}
                  </ScrollArea>
                </div>
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">AI Feedback:</h3>
                  <ScrollArea className="h-[120px] w-full rounded-md border p-3 bg-muted/50">
                     {isLoadingFeedback && <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto my-4" />}
                    {feedback ? <p className="text-sm whitespace-pre-wrap">{feedback}</p> : <p className="text-sm text-muted-foreground">Submit your transcription to get feedback.</p>}
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
