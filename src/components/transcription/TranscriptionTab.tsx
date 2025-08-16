import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Save, Sparkles } from "lucide-react";
import type { Clip } from '@/lib/videoUtils';
import MediaControls from './MediaControls';
import type { VideoPlayerRef } from "../VideoPlayer";
import { useEffect, useRef } from "react";
import { useMobileViewportReset } from "@/hooks/use-mobile-viewport";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import ListenRepeatPractice from "./ListenRepeatPractice";

// Inline utility function
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

interface TranscriptionTabProps {
  currentClip: Clip;
  userTranscriptionInput: string;
  onUserInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSaveAndUnlockAI: () => void;
  isTranscriptionSaved: boolean;
  videoPlayerRef: React.RefObject<VideoPlayerRef>;
  effectiveClip: Clip;
  currentPlaybackTime: number;
  isCurrentClipPlaying: boolean;
  isLooping: boolean;
  setIsLooping: (value: boolean) => void;
  playbackRate: number;
  setPlaybackRate: (value: number) => void;
  mediaSrc?: string;
  language: string;
  clipDisplayName: string;
  disableTextarea: boolean;
  onTabChange: (tab: string) => void;
}

export default function TranscriptionTab({
  currentClip,
  userTranscriptionInput,
  onUserInputChange,
  onSaveAndUnlockAI,
  isTranscriptionSaved,
  videoPlayerRef,
  effectiveClip,
  currentPlaybackTime,
  isCurrentClipPlaying,
  isLooping,
  setIsLooping,
  playbackRate,
  setPlaybackRate,
  mediaSrc,
  language,
  clipDisplayName,
  disableTextarea,
  onTabChange,
}: TranscriptionTabProps) {

    // Use the mobile viewport reset hook
  const resetMobileViewport = useMobileViewportReset();

  // Track previous value of isTranscriptionSaved
  const prevIsTranscriptionSavedRef = useRef<boolean>();

  useEffect(() => {
    // Check if isTranscriptionSaved just changed from false to true
    if (prevIsTranscriptionSavedRef.current === false && isTranscriptionSaved === true) {
      resetMobileViewport();
    }
    // Update the ref for the next render
    prevIsTranscriptionSavedRef.current = isTranscriptionSaved;
  }, [isTranscriptionSaved]);

  const handleSaveOrAccessAI = () => {
    if (!isTranscriptionSaved) {
      onSaveAndUnlockAI();
    } else {
      onTabChange("ai");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 md:pb-6">
        <CardTitle className="text-xl md:text-2xl">Type What You Hear</CardTitle>
        <CardDescription className="text-sm">
          Listen to {clipDisplayName} ({formatSecondsToMMSS(currentClip.startTime)} - {formatSecondsToMMSS(currentClip.endTime)}) and type the dialogue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-4">
        <MediaControls
          effectiveClip={effectiveClip}
          currentPlaybackTime={currentPlaybackTime}
          isCurrentClipPlaying={isCurrentClipPlaying}
          isLooping={isLooping}
          setIsLooping={setIsLooping}
          playbackRate={playbackRate}
          setPlaybackRate={setPlaybackRate}
          mediaSrc={mediaSrc}
          clipDisplayName={clipDisplayName}
          disableTextarea={disableTextarea}
          videoPlayerRef={videoPlayerRef}
        />

        <Textarea
          className="min-h-24 resize-y md:text-base sm:text-sm"
          disabled={disableTextarea || !mediaSrc}
          placeholder={`Type what you hear in the clip to practice ${language.charAt(0).toUpperCase() + language.slice(1)}...`}
          value={userTranscriptionInput}
          onChange={onUserInputChange}
          onBlur={resetMobileViewport}
        />

        {/* Optional Listen & Repeat practice */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="listen-repeat">
            <AccordionTrigger className="text-sm">Speaking Practice (optional)</AccordionTrigger>
            <AccordionContent>
              <ListenRepeatPractice
                mediaSrc={mediaSrc}
                clip={effectiveClip}
                clipDisplayName={clipDisplayName}
                disabled={disableTextarea || !mediaSrc}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2">
        <Button
          onClick={handleSaveOrAccessAI}
          disabled={disableTextarea}
          variant={isTranscriptionSaved ? "outline" : "default"}
          className="text-sm"
        >
          {isTranscriptionSaved ? <Sparkles className="mr-1 md:mr-2 h-3 md:h-4 w-3 md:w-4" /> : <Save className="mr-1 md:mr-2 h-3 md:h-4 w-3 md:w-4" />}
          <span className="hidden md:inline">{isTranscriptionSaved ? "Go to AI Tools" : "Save Transcription"}</span>
          <span className="md:hidden">{isTranscriptionSaved ? "AI Tools" : "Save"}</span>
        </Button>
      </CardFooter>
    </Card>
  );
}
