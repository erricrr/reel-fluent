
"use client";

import type * as React from 'react';
import { useState, useEffect } from "react";
import VideoPlayer from "./VideoPlayer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Loader2, FileDiff, Languages } from "lucide-react"; // Changed Mic to Sparkles, Added Languages
import ClipNavigation from "./ClipNavigation"; 
import ClipDurationSelector from "./ClipDurationSelector";
import type { Clip } from '@/lib/videoUtils';
import type { CorrectionToken } from '@/ai/flows/compare-transcriptions-flow';
import { useToast } from "@/hooks/use-toast"; 

interface TranscriptionWorkspaceProps {
  currentClip: Clip;
  clips: Clip[];
  mediaSrc?: string;
  currentClipIndex: number;
  onSelectClip: (index: number) => void; 
  onTranscribeAudio: (clipId: string) => Promise<void>;
  onGetCorrections: (clipId: string) => Promise<void>;
  onTranslateToEnglish: (clipId: string) => Promise<void>; // Changed from onGetFeedback
  onRemoveClip: (clipId: string) => void;
  onUserTranscriptionChange: (clipId: string, newUserTranscription: string) => void;
  isYouTubeVideo: boolean;
  language: string;
  isAudioSource?: boolean;
  clipSegmentationDuration: number;
  onClipDurationChange: (duration: string) => void;
  isLoadingMedia: boolean; 
  isSavingMedia: boolean;  
  isAnyClipTranscribing: boolean; 
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
  mediaSrc,
  currentClipIndex,
  onSelectClip, 
  onTranscribeAudio,
  onGetCorrections,
  onTranslateToEnglish, // Changed from onGetFeedback
  onRemoveClip,
  onUserTranscriptionChange,
  isYouTubeVideo,
  language,
  isAudioSource = false,
  clipSegmentationDuration,
  onClipDurationChange,
  isLoadingMedia,
  isSavingMedia,
  isAnyClipTranscribing,
}: TranscriptionWorkspaceProps) {
  const [userTranscriptionInput, setUserTranscriptionInput] = useState(currentClip.userTranscription || "");
  const [activeTab, setActiveTab] = useState("manual");
  const { toast } = useToast();


  useEffect(() => {
    setUserTranscriptionInput(currentClip.userTranscription || "");
    if (!currentClip.userTranscription || currentClip.userTranscription.trim() === "") {
      setActiveTab("manual");
    }
  }, [currentClip]);


  const handleUserInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setUserTranscriptionInput(newValue);
    onUserTranscriptionChange(currentClip.id, newValue);
  };

  const handleTranscribe = async () => {
    if (!currentClip || isYouTubeVideo || (isAudioSource && !mediaSrc)) {
      toast({variant: "destructive", title: "Transcription Unavailable", description: `Transcription is only available for uploaded ${isAudioSource ? 'audio' : 'video'} files.`});
      return;
    }
    if (isAnyClipTranscribing) { 
      toast({variant: "destructive", title: "Processing...", description: "Another transcription is already in progress."});
      return;
    }
    try {
      await onTranscribeAudio(currentClip.id);
    } catch (error) {
      console.warn("Transcription error in workspace:", error);
    }
  };

  const handleTranslate = async () => { // Changed from handleFeedback
    if (!currentClip.automatedTranscription || currentClip.automatedTranscription.startsWith("Error:") || currentClip.automatedTranscription === "Transcribing...") {
      toast({variant: "destructive", title: "Cannot Translate", description: "Please ensure automated transcription is successful first."});
      return;
    }
    if (isYouTubeVideo) {
       toast({variant: "destructive", title: "Translation Unavailable", description: "Translation is not available for YouTube videos."});
       return;
    }
    try {
      await onTranslateToEnglish(currentClip.id); // Changed from onGetFeedback
    } catch (error) {
      console.warn("Translation error in workspace:", error);
    }
  };

  const handleCorrections = async () => {
    if (!userTranscriptionInput.trim() || !currentClip.automatedTranscription || currentClip.automatedTranscription.startsWith("Error:")) {
      toast({variant: "destructive", title: "Cannot Show Corrections", description: "Please ensure automated transcription is successful and you've entered your transcription."});
      return;
    }
    if (isYouTubeVideo) {
       toast({variant: "destructive", title: "Corrections Unavailable", description: "Corrections are not available for YouTube videos."});
       return;
    }
     if (currentClip.automatedTranscription === "Transcribing...") {
      toast({variant: "destructive", title: "Processing...", description: "Transcription for this clip is in progress. Please wait."});
      return;
    }
    try {
      await onGetCorrections(currentClip.id);
    } catch (error) {
      console.warn("Corrections error in workspace:", error);
    }
  };


  if (!currentClip) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p>Load a video or audio file and ensure clips are generated to begin.</p>
      </div>
    );
  }
  
  const isAutomatedTranscriptionError = currentClip.automatedTranscription && (currentClip.automatedTranscription.startsWith("Error:"));
  const isAutomatedTranscriptionLoading = currentClip.automatedTranscription === "Transcribing..."; 
  const isTranslationLoading = currentClip.englishTranslation === "Translating..."; // Changed
  const isCorrectionsLoading = Array.isArray(currentClip.comparisonResult) && currentClip.comparisonResult.length === 1 && currentClip.comparisonResult[0].token === "Comparing...";
  
  const canGetCorrections = userTranscriptionInput.trim() && currentClip.automatedTranscription && !isAutomatedTranscriptionError && !isYouTubeVideo;
  const canTranslate = currentClip.automatedTranscription && !isAutomatedTranscriptionError && !isYouTubeVideo && !isAutomatedTranscriptionLoading;

  const disableTextarea = isLoadingMedia || isSavingMedia; 
  const disableCurrentClipAIActions = isAutomatedTranscriptionLoading || isLoadingMedia || isSavingMedia;


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
         content = `[${token.suggestion || token.token}]`; 
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
        <VideoPlayer
          src={mediaSrc}
          startTime={currentClip?.startTime}
          endTime={currentClip?.endTime}
          className="shadow-lg rounded-lg"
          isAudioSource={isAudioSource} 
          currentClipIndex={currentClipIndex}
        />
        <div className="space-y-3 p-3 bg-card rounded-lg shadow">
            <ClipDurationSelector 
                selectedDuration={clipSegmentationDuration} 
                onDurationChange={onClipDurationChange} 
                disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing || isYouTubeVideo} 
            />
        </div>
        <ClipNavigation
          clips={clips}
          currentClipIndex={currentClipIndex}
          onSelectClip={onSelectClip}
          onRemoveClip={onRemoveClip}
          isYouTubeVideo={isYouTubeVideo}
          formatSecondsToMMSS={formatSecondsToMMSS}
          disableRemove={isLoadingMedia || isSavingMedia || isAnyClipTranscribing} 
        />
        <Button
          onClick={handleTranscribe}
          disabled={isAutomatedTranscriptionLoading || isAnyClipTranscribing || isYouTubeVideo || (isAudioSource && !mediaSrc) || isLoadingMedia || isSavingMedia}
          className="w-full"
          variant="default"
        >
          {isAutomatedTranscriptionLoading ? ( 
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" /> 
          )}
          {isAutomatedTranscriptionLoading ? "Transcribing..." : `Transcribe Clip ${currentClipIndex + 1} (AI)`}
          {isYouTubeVideo && <span className="text-xs ml-1">(File Uploads Only)</span>}
          {isAnyClipTranscribing && !isAutomatedTranscriptionLoading && <span className="text-xs ml-1">(Processing another clip)</span>}
        </Button>
      </div>

      <div className="lg:w-1/2 w-full">
        <Tabs defaultValue="manual" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual" disabled={disableTextarea}>Your Transcription</TabsTrigger>
            <TabsTrigger value="ai" disabled={!userTranscriptionInput.trim() && !currentClip.automatedTranscription && disableTextarea}>AI Tools</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Type What You Hear</CardTitle>
                <CardDescription>
                  Listen to Clip {currentClipIndex + 1} ({formatSecondsToMMSS(currentClip.startTime)} - {formatSecondsToMMSS(currentClip.endTime)})
                  and type the dialogue. The "AI Tools" tab unlocks after you type and automated transcription is available.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Start typing..."
                  value={userTranscriptionInput}
                  onChange={handleUserInputChange}
                  rows={8}
                  className="min-h-[150px] resize-none"
                  disabled={disableTextarea}
                />
              </CardContent>
               <CardFooter className="flex-col items-stretch gap-2">
                 <Button
                    onClick={() => setActiveTab("ai")}
                    disabled={!userTranscriptionInput.trim() && !currentClip.automatedTranscription && disableTextarea}
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
                 <CardDescription>View the AI-generated transcription, compare with your input, and get an English translation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">Automated Transcription:</h3>
                  <ScrollArea className="h-[100px] w-full rounded-md border p-3 bg-muted/50">
                    {isAutomatedTranscriptionLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto my-4" /> : null}
                    {!isAutomatedTranscriptionLoading && currentClip.automatedTranscription ? <p className="text-sm">{currentClip.automatedTranscription}</p> : null}
                    {!isAutomatedTranscriptionLoading && !currentClip.automatedTranscription && <p className="text-sm text-muted-foreground">Select "Transcribe Clip {currentClipIndex + 1} (AI)" to generate.</p>}
                  </ScrollArea>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground">Transcription Comparison:</h3>
                   <Button
                    onClick={handleCorrections}
                    disabled={isCorrectionsLoading || !canGetCorrections || disableCurrentClipAIActions}
                    className="w-full"
                    variant="outline"
                  >
                    {isCorrectionsLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileDiff className="mr-2 h-4 w-4" />
                    )}
                    {isCorrectionsLoading ? "Comparing..." : "Show Corrections"}
                    {isYouTubeVideo && <span className="text-xs ml-1">(File Uploads Only)</span>}
                    {!isYouTubeVideo && isAutomatedTranscriptionError && <span className="text-xs ml-1">(Fix Transcription First)</span>}
                    {!userTranscriptionInput.trim() && currentClip.automatedTranscription && !isAutomatedTranscriptionError && <span className="text-xs ml-1">(Enter Your Transcription)</span>}
                    {isAutomatedTranscriptionLoading && <span className="text-xs ml-1">(Wait for transcription)</span>}
                  </Button>
                  <ScrollArea className="h-[120px] w-full rounded-md border p-3 bg-muted/50">
                     {isCorrectionsLoading ? (
                       <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto my-4" />
                     ) : currentClip.comparisonResult === null || currentClip.comparisonResult === undefined ? (
                       <p className="text-sm text-muted-foreground">Click "Show Corrections" above after entering your transcription and generating the AI transcription.</p>
                     ) : currentClip.comparisonResult.length === 1 && currentClip.comparisonResult[0].token === "Error generating comparison." ? (
                        <p className="text-sm text-destructive">{currentClip.comparisonResult[0].token}</p>
                     ) : (
                       <p className="text-sm whitespace-pre-wrap leading-relaxed">
                         {currentClip.comparisonResult.map(renderCorrectionToken)}
                        </p>
                     )}
                  </ScrollArea>
                </div>

                <div>
                  <h3 className="font-semibold mb-2 text-foreground">English Translation:</h3>
                   <Button
                    onClick={handleTranslate} // Changed from handleFeedback
                    disabled={isTranslationLoading || !canTranslate || disableCurrentClipAIActions}
                    className="w-full mb-2"
                    variant="outline"
                  >
                    {isTranslationLoading ? ( // Changed
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Languages className="mr-2 h-4 w-4" /> // Changed Icon
                    )}
                    {isTranslationLoading ? "Translating..." : "Translate to English"} 
                    {isYouTubeVideo && <span className="text-xs ml-1">(File Uploads Only)</span>}
                    {!isYouTubeVideo && isAutomatedTranscriptionError && <span className="text-xs ml-1">(Fix Transcription First)</span>}
                    {isAutomatedTranscriptionLoading && <span className="text-xs ml-1">(Wait for transcription)</span>}
                  </Button>
                  <ScrollArea className="h-[100px] w-full rounded-md border p-3 bg-muted/50">
                     {isTranslationLoading ? ( 
                       <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto my-4" />
                     ) : currentClip.englishTranslation === null || currentClip.englishTranslation === undefined ? ( 
                       <p className="text-sm text-muted-foreground">Click "Translate to English" above after AI transcription is complete.</p>
                     ) : currentClip.englishTranslation === "" ? ( 
                        <p className="text-sm">Translation complete. No specific output or translation was empty.</p>
                     ) : currentClip.englishTranslation.startsWith("Error:") ? ( 
                        <p className="text-sm text-destructive">{currentClip.englishTranslation}</p>
                     ) : (
                       <p className="text-sm whitespace-pre-wrap">{currentClip.englishTranslation}</p>
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
