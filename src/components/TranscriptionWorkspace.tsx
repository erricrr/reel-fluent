
"use client";

import type * as React from 'react';
import { useState, useEffect } from "react";
import VideoPlayer from "./VideoPlayer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, Mic, Sparkles, Loader2, FileDiff, Trash2 as Trash2Icon } from "lucide-react";
import type { Clip } from '@/lib/videoUtils';
import type { CorrectionToken, CompareTranscriptionsOutput } from '@/ai/flows/compare-transcriptions-flow';

interface TranscriptionWorkspaceProps {
  videoSrc?: string;
  clips: Clip[];
  currentClipIndex: number;
  onNextClip: () => void;
  onPrevClip: () => void;
  onTranscribeAudio: () => Promise<string | null>;
  onGetFeedback: (userTranscription: string, automatedTranscription: string) => Promise<string | null>;
  onGetCorrections: (userTranscription: string, automatedTranscription: string) => Promise<CompareTranscriptionsOutput['comparisonResult'] | null>;
  onRemoveClip: (clipId: string) => void;
  comparisonResult: CompareTranscriptionsOutput['comparisonResult'] | null;
  isYouTubeVideo: boolean;
  language: string;
}

const formatSecondsToMMSS = (totalSeconds: number): string => {
  if (!isFinite(totalSeconds) || totalSeconds < 0) {
    return "--:--"; 
  }
  try {
    const date = new Date(0); // Use a base date
    date.setSeconds(totalSeconds); // Set seconds, handles overflow to minutes/hours
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } catch (e) {
    console.error("Error formatting seconds to MM:SS:", totalSeconds, e);
    return "!!:!!"; 
  }
};


export default function TranscriptionWorkspace({
  videoSrc,
  clips,
  currentClipIndex,
  onNextClip,
  onPrevClip,
  onTranscribeAudio,
  onGetFeedback,
  onGetCorrections,
  onRemoveClip,
  comparisonResult,
  isYouTubeVideo,
  language,
}: TranscriptionWorkspaceProps) {
  const [userTranscription, setUserTranscription] = useState("");
  const [automatedTranscription, setAutomatedTranscription] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoadingTranscription, setIsLoadingTranscription] = useState(false);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);
  const [isLoadingCorrections, setIsLoadingCorrections] = useState(false);
  const [activeTab, setActiveTab] = useState("ai");


  const currentClip = clips[currentClipIndex];

  useEffect(() => {
    setUserTranscription("");
    setAutomatedTranscription(null);
    setFeedback(null);
    setIsLoadingTranscription(false);
    setIsLoadingFeedback(false);
    setIsLoadingCorrections(false);
  }, [currentClipIndex, videoSrc, language, clips]); // Added clips dependency

  const handleTranscribe = async () => {
    if (!currentClip || isYouTubeVideo) {
      alert("Transcription is only available for uploaded videos and active clips.");
      return;
    }
    
    setIsLoadingTranscription(true);
    setAutomatedTranscription(null); 
    setFeedback(null);
    
    try {
      const transcription = await onTranscribeAudio();
      setAutomatedTranscription(transcription);
    } catch (error) {
      console.error("Transcription error in workspace:", error);
      setAutomatedTranscription("Error during transcription. Check console or notifications.");
    } finally {
      setIsLoadingTranscription(false);
    }
  };

  const handleFeedback = async () => {
    if (!userTranscription.trim() || !automatedTranscription || isAutomatedTranscriptionError) {
      alert("Please provide your transcription and ensure automated transcription is available and does not contain errors.");
      return;
    }
    if (isYouTubeVideo) {
       alert("Feedback is not available for YouTube videos.");
       return;
    }
    setIsLoadingFeedback(true);
    setFeedback(null);
    try {
      let newFeedback = await onGetFeedback(userTranscription, automatedTranscription);
      if (newFeedback === "") {
        newFeedback = "AI analysis complete. No specific suggestions found.";
      }
      setFeedback(newFeedback);
    } catch (error) {
      console.error("Feedback error in workspace:", error);
      setFeedback("Error generating feedback. Check console or notifications.");
    } finally {
      setIsLoadingFeedback(false);
    }
  };

  const handleCorrections = async () => {
    if (!userTranscription.trim() || !automatedTranscription || isAutomatedTranscriptionError) {
      alert("Please provide your transcription and ensure automated transcription is available and does not contain errors.");
      return;
    }
    if (isYouTubeVideo) {
       alert("Corrections are not available for YouTube videos.");
       return;
    }
    setIsLoadingCorrections(true);
    try {
      await onGetCorrections(userTranscription, automatedTranscription);
    } catch (error) {
      console.error("Corrections error in workspace:", error);
    } finally {
      setIsLoadingCorrections(false);
    }
  };


  if (!videoSrc || clips.length === 0 || !currentClip) { // Added !currentClip check
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p>Load a video and ensure clips are generated to begin.</p>
      </div>
    );
  }

  const isAutomatedTranscriptionError = automatedTranscription && automatedTranscription.startsWith("Error:");
  const canGetFeedbackOrCorrections = userTranscription.trim() && automatedTranscription && !isAutomatedTranscriptionError && !isYouTubeVideo;

  const renderCorrectionToken = (token: CorrectionToken, index: number) => {
    switch (token.status) {
      case 'correct':
        return <span key={index} className="text-green-600 dark:text-green-400">{token.token} </span>;
      case 'incorrect':
        return (
          <span key={index}>
            <span className="text-red-600 dark:text-red-400 line-through">{token.token}</span>
            {token.suggestion && <span className="text-green-600 dark:text-green-400"> ({token.suggestion})</span>}
            {' '}
          </span>
        );
      case 'extra':
        return <span key={index} className="text-blue-600 dark:text-blue-400 opacity-80"><em>{token.token}</em> </span>;
      case 'missing':
        return <span key={index} className="text-gray-500 dark:text-gray-400 opacity-70">[{token.suggestion || token.token}] </span>;
      default:
        return <span key={index}>{token.token} </span>;
    }
  };


  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 md:p-6">
      <div className="lg:w-1/2 w-full space-y-4">
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
        <VideoPlayer
          src={videoSrc}
          startTime={currentClip?.startTime}
          endTime={currentClip?.endTime}
          className="shadow-lg rounded-lg"
        />
        <div className="flex justify-between items-center p-2 bg-card rounded-lg shadow">
          <Button onClick={onPrevClip} disabled={currentClipIndex === 0} variant="outline" size="icon">
            <ChevronLeft className="h-5 w-5" />
            <span className="sr-only">Previous Clip</span>
          </Button>
          
          <div className="text-center space-y-1">
            <div className="text-sm font-medium text-foreground">
              Clip {currentClipIndex + 1} of {clips.length}
              {currentClip && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({formatSecondsToMMSS(currentClip.startTime)} - {formatSecondsToMMSS(currentClip.endTime)})
                </span>
              )}
            </div>
            {currentClip && onRemoveClip && !isYouTubeVideo && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 px-2 py-1 h-auto"
                onClick={() => onRemoveClip(currentClip.id)}
                aria-label="Remove this clip"
              >
                <Trash2Icon className="h-3 w-3 mr-1" /> Remove This Clip
              </Button>
            )}
          </div>

          <Button onClick={onNextClip} disabled={currentClipIndex === clips.length - 1 || clips.length === 0} variant="outline" size="icon">
            <ChevronRight className="h-5 w-5" />
            <span className="sr-only">Next Clip</span>
          </Button>
        </div>
      </div>

      <div className="lg:w-1/2 w-full">
        <Tabs defaultValue="ai" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ai">AI Tools</TabsTrigger>
            <TabsTrigger value="manual">Your Transcription</TabsTrigger>
          </TabsList>
          
          <TabsContent value="manual" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Type What You Hear</CardTitle>
                <CardDescription>Listen to the clip and type the dialogue below. Then, check the "AI Tools" tab.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Start typing..."
                  value={userTranscription}
                  onChange={(e) => setUserTranscription(e.target.value)}
                  rows={8}
                  className="min-h-[150px] resize-none"
                />
              </CardContent>
               <CardFooter className="flex-col items-stretch gap-2">
                 <Button 
                    onClick={() => setActiveTab("ai")} 
                    disabled={!userTranscription.trim()}
                    variant="outline"
                  >
                   Go to AI Tools
                  </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="ai" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Automated Transcription & Analysis</CardTitle>
                 <CardDescription>View the AI-generated transcription and get feedback or corrections on your input.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">Automated Transcription:</h3>
                  <ScrollArea className="h-[100px] w-full rounded-md border p-3 bg-muted/50">
                    {isLoadingTranscription && <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto my-4" />}
                    {!isLoadingTranscription && automatedTranscription ? <p className="text-sm">{automatedTranscription}</p> : !isLoadingTranscription && <p className="text-sm text-muted-foreground">Click "Transcribe This Clip (AI)" above the video to generate.</p>}
                  </ScrollArea>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground">Transcription Comparison:</h3>
                   <Button 
                    onClick={handleCorrections} 
                    disabled={isLoadingCorrections || !canGetFeedbackOrCorrections} 
                    className="w-full"
                    variant="outline"
                  >
                    {isLoadingCorrections ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileDiff className="mr-2 h-4 w-4" />
                    )}
                    Show Corrections
                    {isYouTubeVideo && <span className="text-xs ml-1">(File Uploads Only)</span>}
                    {isAutomatedTranscriptionError && <span className="text-xs ml-1">(Fix Transcription First)</span>}
                    {!userTranscription.trim() && automatedTranscription && <span className="text-xs ml-1">(Enter Your Transcription)</span>}
                  </Button>
                  <ScrollArea className="h-[120px] w-full rounded-md border p-3 bg-muted/50">
                     {isLoadingCorrections ? (
                       <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto my-4" />
                     ) : comparisonResult === null ? (
                       <p className="text-sm text-muted-foreground">Click "Show Corrections" above after entering your transcription and generating the AI transcription.</p>
                     ) : (
                       <p className="text-sm whitespace-pre-wrap leading-relaxed">
                         {comparisonResult.map(renderCorrectionToken)}
                        </p>
                     )}
                  </ScrollArea>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">AI Feedback:</h3>
                   <Button 
                    onClick={handleFeedback} 
                    disabled={isLoadingFeedback || !canGetFeedbackOrCorrections} 
                    className="w-full mb-2"
                    variant="outline"
                  >
                    {isLoadingFeedback ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    Get General Feedback
                    {isYouTubeVideo && <span className="text-xs ml-1">(File Uploads Only)</span>}
                    {isAutomatedTranscriptionError && <span className="text-xs ml-1">(Fix Transcription First)</span>}
                     {!userTranscription.trim() && automatedTranscription && <span className="text-xs ml-1">(Enter Your Transcription)</span>}
                  </Button>
                  <ScrollArea className="h-[100px] w-full rounded-md border p-3 bg-muted/50">
                     {isLoadingFeedback ? (
                       <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto my-4" />
                     ) : feedback === null ? (
                       <p className="text-sm text-muted-foreground">Click "Get General Feedback" above after entering your transcription.</p>
                     ) : (
                       <p className="text-sm whitespace-pre-wrap">{feedback}</p>
                     )}
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
