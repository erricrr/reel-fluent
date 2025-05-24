"use client";

import type * as React from 'react';
import { useState, useEffect, useRef } from "react";
import VideoPlayer, { type VideoPlayerRef } from "./VideoPlayer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, Loader2, FileDiff, Languages, PlayIcon, PauseIcon, Mic, Lock, Unlock } from "lucide-react";
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
  onTranslateToEnglish: (clipId: string) => Promise<void>;
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

// Character threshold constants
const MIN_CHAR_THRESHOLD = 15;

// Helper function to determine if AI tools should be enabled
const shouldEnableAITools = (userInput: string, automatedTranscription?: string | null): boolean => {
  const hasMinimumUserInput = userInput.trim().length >= MIN_CHAR_THRESHOLD;
  const hasAutomatedTranscription = automatedTranscription && automatedTranscription !== "Transcribing..." && !automatedTranscription.startsWith("Error:");
  return hasMinimumUserInput || !!hasAutomatedTranscription;
};

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
  onTranslateToEnglish,
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
  const videoPlayerRef = useRef<VideoPlayerRef>(null);
  const [isCurrentClipPlaying, setIsCurrentClipPlaying] = useState(false);


  useEffect(() => {
    setUserTranscriptionInput(currentClip.userTranscription || "");
    if (activeTab === "ai" && (!currentClip.userTranscription?.trim() && !currentClip.automatedTranscription)) {
      setActiveTab("manual");
    }
  }, [currentClip, activeTab]);

  const handleUserInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setUserTranscriptionInput(newValue);
    onUserTranscriptionChange(currentClip.id, newValue);
  };

  const handleTranscribe = async () => {
    if (!currentClip || (isAudioSource && !mediaSrc)) {
      toast({variant: "destructive", title: "Cannot Transcribe", description: "Please ensure media is loaded and a clip is selected."});
      return;
    }
    try {
      await onTranscribeAudio(currentClip.id);
    } catch (error) {
      console.warn("Transcription error in workspace:", error);
    }
  };

  const handleTranslate = async () => {
    if (!currentClip.automatedTranscription || currentClip.automatedTranscription.startsWith("Error:") || currentClip.automatedTranscription === "Transcribing...") {
      toast({variant: "destructive", title: "Cannot Translate", description: "Please ensure automated transcription is successful first."});
      return;
    }
    try {
      await onTranslateToEnglish(currentClip.id);
    } catch (error) {
      console.warn("Translation error in workspace:", error);
    }
  };

  const handleCorrections = async () => {
    if (!userTranscriptionInput.trim() || !currentClip.automatedTranscription || currentClip.automatedTranscription.startsWith("Error:")) {
      toast({variant: "destructive", title: "Cannot Show Corrections", description: "Please ensure automated transcription is successful and you've entered your transcription."});
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

  const togglePlayPause = () => {
    if (!videoPlayerRef.current) return;
    if (videoPlayerRef.current.getIsPlaying()) {
      videoPlayerRef.current.pause();
    } else {
      videoPlayerRef.current.play();
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
  const isTranslationLoading = currentClip.englishTranslation === "Translating...";
  const isCorrectionsLoading = Array.isArray(currentClip.comparisonResult) && currentClip.comparisonResult.length === 1 && currentClip.comparisonResult[0].token === "Comparing...";

  // Character threshold logic
  const currentCharCount = userTranscriptionInput.trim().length;
  const aiToolsEnabled = shouldEnableAITools(userTranscriptionInput, currentClip.automatedTranscription);
  const remainingChars = Math.max(0, MIN_CHAR_THRESHOLD - currentCharCount);

  const canGetCorrections = userTranscriptionInput.trim() && currentClip.automatedTranscription && !isAutomatedTranscriptionError;
  const canTranslate = currentClip.automatedTranscription && !isAutomatedTranscriptionError && !isAutomatedTranscriptionLoading;

  const disableTextarea = isLoadingMedia || isSavingMedia;
  const disableCurrentClipAIActions = isAutomatedTranscriptionLoading || isLoadingMedia || isSavingMedia;


  const renderCorrectionToken = (token: CorrectionToken, index: number) => {
    let userTokenStyle = "";
    let suggestionSpan: React.ReactNode = null;

    switch (token.status) {
      case 'correct':
        userTokenStyle = "text-green-600 dark:text-green-400";
        break;
      case 'incorrect':
        userTokenStyle = "text-red-600 dark:text-red-400 line-through";
        if (token.suggestion) {
          suggestionSpan = <span className="text-green-600 dark:text-green-400"> {token.suggestion}</span>;
        }
        break;
      case 'extra':
        userTokenStyle = "text-blue-600 dark:text-blue-400 opacity-80 italic";
        break;
      case 'missing':
         userTokenStyle = "text-gray-500 dark:text-gray-400 opacity-70";
        break;
      default:
        break;
    }

    let displayToken = token.token;
    if (token.status === 'extra') displayToken = `+${token.token}`;
    if (token.status === 'missing') displayToken = `[${token.token}]`;

    return (
      <span key={index}>
        <span className={userTokenStyle}>{displayToken}</span>
        {suggestionSpan}
        {' '}
      </span>
    );
  };


  return (
    <TooltipProvider>
      <div className="flex flex-col lg:flex-row gap-6 p-4 md:p-6">
        <div className="lg:w-1/2 w-full space-y-4">
          <VideoPlayer
            ref={videoPlayerRef}
            src={mediaSrc}
            startTime={currentClip?.startTime}
            endTime={currentClip?.endTime}
            className="shadow-lg rounded-lg"
            isAudioSource={isAudioSource}
            currentClipIndex={currentClipIndex}
            onPlayStateChange={setIsCurrentClipPlaying}
          />
          <div className="space-y-3 p-3 bg-card rounded-lg shadow">
              <ClipDurationSelector
                  selectedDuration={clipSegmentationDuration}
                  onDurationChange={onClipDurationChange}
                  disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
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
            className="w-full"
            disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {isAutomatedTranscriptionLoading ? "Transcribing..." : "Transcribe Audio"}
          </Button>
        </div>

        <div className="lg:w-1/2 w-full">
          <Tabs defaultValue="manual" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual" disabled={disableTextarea}>Your Transcription</TabsTrigger>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center w-full">
                    <TabsTrigger
                      value="ai"
                      disabled={disableTextarea || !aiToolsEnabled}
                      className="w-full flex items-center gap-2"
                    >
                      {aiToolsEnabled ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                      AI Tools
                    </TabsTrigger>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {aiToolsEnabled
                      ? "AI tools are now available!"
                      : `Complete your listening attempt first (${remainingChars} more characters needed)`
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            </TabsList>

            <TabsContent value="manual" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Type What You Hear</CardTitle>
                  <CardDescription>
                    Listen to Clip {currentClipIndex + 1} ({formatSecondsToMMSS(currentClip.startTime)} - {formatSecondsToMMSS(currentClip.endTime)})
                    and type the dialogue. The "AI Tools" tab unlocks after you type or if automated transcription is available.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                   <div className="flex items-center gap-2 mb-2">
                      <Button
                          variant="outline"
                          size="icon"
                          onClick={togglePlayPause}
                          disabled={disableTextarea || !mediaSrc}
                          aria-label={isCurrentClipPlaying ? "Pause clip" : "Play clip"}
                      >
                          {isCurrentClipPlaying ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
                      </Button>
                      <span className="text-sm text-muted-foreground">
                          {isCurrentClipPlaying ? "Playing..." : "Paused"} (Clip {currentClipIndex + 1})
                      </span>
                  </div>

                  <Textarea
                    className="min-h-24 resize-y"
                    disabled={disableTextarea || !mediaSrc}
                    placeholder={`Type what you hear in the clip to practice ${language}...`}
                    value={userTranscriptionInput}
                    onChange={handleUserInputChange}
                  />
                </CardContent>
                 <CardFooter className="flex-col items-stretch gap-2">
                   <Tooltip>
                     <TooltipTrigger asChild>
                       <div>
                         <Button
                            onClick={() => setActiveTab("ai")}
                            disabled={disableTextarea || !aiToolsEnabled}
                            variant="outline"
                            className="w-full flex items-center gap-2"
                          >
                           {aiToolsEnabled ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                           Go to AI Tools
                          </Button>
                       </div>
                     </TooltipTrigger>
                     <TooltipContent>
                       <p>
                         {aiToolsEnabled
                           ? "Access AI transcription, translation, and correction tools"
                           : `Complete your listening attempt first (${remainingChars} more characters needed)`
                         }
                       </p>
                     </TooltipContent>
                   </Tooltip>
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

                  <div>
                    <h3 className="font-semibold mb-1 text-foreground">Your Input:</h3>
                    <ScrollArea className="h-[70px] w-full rounded-md border p-3 bg-muted/30">
                       {userTranscriptionInput ?
                          <p className="text-sm whitespace-pre-wrap">{userTranscriptionInput}</p> :
                          <p className="text-sm text-muted-foreground">You haven't typed anything for this clip yet.</p>
                       }
                    </ScrollArea>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Transcription Comparison:</h3>
                     <Button
                      onClick={handleCorrections}
                      disabled={!canGetCorrections || isCorrectionsLoading || isAnyClipTranscribing}
                      className="w-full"
                    >
                      <FileDiff className="mr-2 h-4 w-4" />
                      {isCorrectionsLoading ? "Comparing..." : "Get Corrections"}
                    </Button>
                    <ScrollArea className="h-[120px] w-full rounded-md border p-3 bg-muted/50">
                       {isCorrectionsLoading ? (
                         <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto my-4" />
                       ) : currentClip.comparisonResult === null || currentClip.comparisonResult === undefined ? (
                         <p className="text-sm text-muted-foreground">Click "Get Corrections" above after entering your transcription and generating the AI transcription.</p>
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
                      onClick={handleTranslate}
                      disabled={!canTranslate || isTranslationLoading || isAnyClipTranscribing}
                      className="w-full"
                    >
                      <Languages className="mr-2 h-4 w-4" />
                      {isTranslationLoading ? "Translating..." : "Translate to English"}
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
    </TooltipProvider>
  );
}
