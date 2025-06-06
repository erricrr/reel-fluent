import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Save, Sparkles } from "lucide-react";
import type { Clip } from '@/lib/videoUtils';
import MediaControls from './MediaControls';
import type { VideoPlayerRef } from "../VideoPlayer";
import { useEffect, useRef } from "react";

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

  // Helper function to reset viewport on mobile after save
  const resetMobileViewport = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) { // Check for mobile screen width
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement && typeof activeElement.blur === 'function') {
        activeElement.blur(); // Attempt to dismiss keyboard
      }

      // Delay to allow UI to settle and keyboard to retract
      setTimeout(() => {
        window.scrollTo(0, 0); // Fallback scroll to top

        const viewport = document.querySelector("meta[name=viewport]");
        if (viewport) {
          const content = viewport.getAttribute("content");
          // Force a re-evaluation by temporarily changing and then restoring the content
          viewport.setAttribute("content", content + ",width=device-width"); // Adding extra attribute to ensure change
          setTimeout(() => {
            viewport.setAttribute("content", content || "width=device-width, initial-scale=1");
          }, 50); // Short delay for the change to register and revert
        }
      }, 150); // Main delay for keyboard dismissal and UI updates
    }
  };

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
          className="min-h-24 resize-y text-sm md:text-base"
          disabled={disableTextarea || !mediaSrc}
          placeholder={`Type what you hear in the clip to practice ${language.charAt(0).toUpperCase() + language.slice(1)}...`}
          value={userTranscriptionInput}
          onChange={onUserInputChange}
        />
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
