
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
import type { CorrectionToken } from '@/ai/flows/compare-transcriptions-flow';

interface TranscriptionWorkspaceProps {
  currentClip: Clip;
  clips: Clip[]; // To get total number of clips
  currentClipIndex: number;
  onNextClip: () => void;
  onPrevClip: () => void;
  onTranscribeAudio: (clipId: string) => Promise<void>;
  onGetFeedback: (clipId: string) => Promise<void>;
  onGetCorrections: (clipId: string) => Promise<void>;
  onRemoveClip: (clipId: string) => void;
  onUserTranscriptionChange: (clipId: string, newUserTranscription: string) => void;
  isYouTubeVideo: boolean;
  language: string;
  isAudioSource?: boolean;
}

const formatSecondsToMMSS = (totalSeconds: number): string => {
  if (!isFinite(totalSeconds) || totalSeconds < 0) {
    return "--:--"; 
  }
  try {
    const date = new Date(0); 
    date.setSeconds(totalSeconds); 
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } catch (e) {
    console.error("Error formatting seconds to MM:SS:", totalSeconds, e);
    return "!!:!!"; 
  }
};


export default function TranscriptionWorkspace({
  currentClip,
  clips,
  currentClipIndex,
  onNextClip,
  onPrevClip,
  onTranscribeAudio,
  onGetFeedback,
  onGetCorrections,
  onRemoveClip,
  onUserTranscriptionChange,
  isYouTubeVideo,
  language, // Keep language for context, even if clip has its own
  isAudioSource = false,
}: TranscriptionWorkspaceProps) {
  const [userTranscriptionInput, setUserTranscriptionInput] = useState(currentClip.userTranscription || "");
  const [isLoadingTranscription, setIsLoadingTranscription] = useState(false);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);
  const [isLoadingCorrections, setIsLoadingCorrections] = useState(false);
  const [activeTab, setActiveTab] = useState("manual");

  // Sync local input with currentClip.userTranscription from props
  useEffect(() => {
    setUserTranscriptionInput(currentClip.userTranscription || "");
    // Reset loading states when clip changes. AI results are now part of currentClip.
    setIsLoadingTranscription(false);
    setIsLoadingFeedback(false);
    setIsLoadingCorrections(false);
    if (!currentClip.userTranscription) {
        setActiveTab("manual"); // If new clip has no user input, go to manual tab
    }
  }, [currentClip]);


  const handleUserInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setUserTranscriptionInput(newValue);
    onUserTranscriptionChange(currentClip.id, newValue);
  };

  const handleTranscribe = async () => {
    if (!currentClip || isYouTubeVideo) {
      alert(`Transcription is only available for uploaded ${isAudioSource ? 'audio' : 'video'} files and active clips.`);
      return;
    }
    setIsLoadingTranscription(true);
    try {
      await onTranscribeAudio(currentClip.id);
    } catch (error) {
      console.error("Transcription error in workspace:", error);
      // Error handling is now done in LinguaClipApp which updates the clip's automatedTranscription
    } finally {
      setIsLoadingTranscription(false);
    }
  };

  const handleFeedback = async () => {
    if (!userTranscriptionInput.trim() || !currentClip.automatedTranscription || currentClip.automatedTranscription.startsWith("Error:")) {
      alert("Please provide your transcription and ensure automated transcription is available and does not contain errors.");
      return;
    }
    if (isYouTubeVideo) {
       alert("Feedback is not available for YouTube videos.");
       return;
    }
    setIsLoadingFeedback(true);
    try {
      await onGetFeedback(currentClip.id);
      let newFeedback = currentClip.feedback;
      if (newFeedback === "") { // Check updated currentClip.feedback from parent
        // This case might need to be handled in parent if feedback becomes ""
      }
    } catch (error) {
      console.error("Feedback error in workspace:", error);
    } finally {
      setIsLoadingFeedback(false);
    }
  };

  const handleCorrections = async () => {
    if (!userTranscriptionInput.trim() || !currentClip.automatedTranscription || currentClip.automatedTranscription.startsWith("Error:")) {
      alert("Please provide your transcription and ensure automated transcription is available and does not contain errors.");
      return;
    }
    if (isYouTubeVideo) {
       alert("Corrections are not available for YouTube videos.");
       return;
    }
    setIsLoadingCorrections(true);
    try {
      await onGetCorrections(currentClip.id);
    } catch (error) {
      console.error("Corrections error in workspace:", error);
    } finally {
      setIsLoadingCorrections(false);
    }
  };


  if (!currentClip) { 
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p>Load a video or audio file and ensure clips are generated to begin.</p>
      </div>
    );
  }

  const isAutomatedTranscriptionError = currentClip.automatedTranscription && currentClip.automatedTranscription.startsWith("Error:");
  const canGetFeedbackOrCorrections = userTranscriptionInput.trim() && currentClip.automatedTranscription && !isAutomatedTranscriptionError && !isYouTubeVideo;

  const renderCorrectionToken = (token: CorrectionToken, index: number) => {
    let style = "";
    let content = token.token;
    let suggestionContent = "";

    switch (token.status) {
      case 'correct':
        style = "text-green-600 dark:text-green-400";
        break;
      case 'incorrect':
        style = "text-red-600 dark:text-red-400 line-through";
        if (token.suggestion) {
          suggestionContent = ` (${token.suggestion})`;
        }
        break;
      case 'extra':
        style = "text-blue-600 dark:text-blue-400 opacity-80 italic";
        break;
      case 'missing':
         style = "text-gray-500 dark:text-gray-400 opacity-70";
         content = `[${token.suggestion || token.token}]`; // Show the missing token itself
        break;
      default:
        break;
    }
    return (
      <span key={index}>
        <span className={style}>{content}</span>
        {token.status === 'incorrect' && token.suggestion && 
          <span className="text-green-600 dark:text-green-400">{suggestionContent}</span>
        }
        {' '}
      </span>
    );
  };


  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 md:p-6">
      <div className="lg:w-1/2 w-full space-y-4">
        <Button 
          onClick={handleTranscribe} 
          disabled={isLoadingTranscription || isYouTubeVideo} 
          className="w-full"
          variant="default" // More prominent
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
          src={currentClip.mediaSrc} // Assuming mediaSrc is passed to clip or available globally
          startTime={currentClip?.startTime}
          endTime={currentClip?.endTime}
          className="shadow-lg rounded-lg"
          isAudioSource={isAudioSource}
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
        <Tabs defaultValue="manual" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Your Transcription</TabsTrigger>
            <TabsTrigger value="ai" disabled={!userTranscriptionInput.trim()}>AI Tools</TabsTrigger>
          </TabsList>
          
          <TabsContent value="manual" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Type What You Hear</CardTitle>
                <CardDescription>Listen to the clip and type the dialogue below. Then, the "AI Tools" tab will unlock.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Start typing..."
                  value={userTranscriptionInput}
                  onChange={handleUserInputChange}
                  rows={8}
                  className="min-h-[150px] resize-none"
                />
              </CardContent>
               <CardFooter className="flex-col items-stretch gap-2">
                 <Button 
                    onClick={() => setActiveTab("ai")} 
                    disabled={!userTranscriptionInput.trim()}
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
                    {!isLoadingTranscription && currentClip.automatedTranscription ? <p className="text-sm">{currentClip.automatedTranscription}</p> : !isLoadingTranscription && <p className="text-sm text-muted-foreground">Click "Transcribe This Clip (AI)" above the player to generate.</p>}
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
                    {!userTranscriptionInput.trim() && currentClip.automatedTranscription && <span className="text-xs ml-1">(Enter Your Transcription)</span>}
                  </Button>
                  <ScrollArea className="h-[120px] w-full rounded-md border p-3 bg-muted/50">
                     {isLoadingCorrections ? (
                       <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto my-4" />
                     ) : currentClip.comparisonResult === null || currentClip.comparisonResult === undefined ? ( // Check for undefined too
                       <p className="text-sm text-muted-foreground">Click "Show Corrections" above after entering your transcription and generating the AI transcription.</p>
                     ) : (
                       <p className="text-sm whitespace-pre-wrap leading-relaxed">
                         {currentClip.comparisonResult.map(renderCorrectionToken)}
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
                     {!userTranscriptionInput.trim() && currentClip.automatedTranscription && <span className="text-xs ml-1">(Enter Your Transcription)</span>}
                  </Button>
                  <ScrollArea className="h-[100px] w-full rounded-md border p-3 bg-muted/50">
                     {isLoadingFeedback ? (
                       <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto my-4" />
                     ) : currentClip.feedback === null || currentClip.feedback === undefined ? ( // Check for undefined
                       <p className="text-sm text-muted-foreground">Click "Get General Feedback" above after entering your transcription.</p>
                     ) : currentClip.feedback === "" ? (
                        <p className="text-sm">AI analysis complete. No specific suggestions found.</p>
                     ) : (
                       <p className="text-sm whitespace-pre-wrap">{currentClip.feedback}</p>
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
