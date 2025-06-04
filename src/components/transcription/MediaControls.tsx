import React from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayIcon, PauseIcon, SkipBack, SkipForward } from "lucide-react";
import type { Clip } from '@/lib/videoUtils';
import type { VideoPlayerRef } from "../VideoPlayer";

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

interface MediaControlsProps {
  effectiveClip: Clip;
  currentPlaybackTime: number;
  isCurrentClipPlaying: boolean;
  isLooping: boolean;
  setIsLooping: (value: boolean) => void;
  playbackRate: number;
  setPlaybackRate: (value: number) => void;
  mediaSrc?: string;
  clipDisplayName: string;
  disableTextarea: boolean;
  videoPlayerRef: React.RefObject<VideoPlayerRef>;
}

export default function MediaControls({
  effectiveClip,
  currentPlaybackTime,
  isCurrentClipPlaying,
  isLooping,
  setIsLooping,
  playbackRate,
  setPlaybackRate,
  mediaSrc,
  clipDisplayName,
  disableTextarea,
  videoPlayerRef,
}: MediaControlsProps) {

  const handleSeek = (value: number[]) => {
    if (!videoPlayerRef.current || value.length === 0) return;
    const seekTime = value[0];
    videoPlayerRef.current.seek(seekTime);
  };

  const skipBackward = () => {
    if (!videoPlayerRef.current) return;
    const currentTime = videoPlayerRef.current.getCurrentTime();
    const newTime = Math.max(effectiveClip.startTime, currentTime - 5);
    videoPlayerRef.current.seek(newTime);
  };

  const skipForward = () => {
    if (!videoPlayerRef.current) return;
    const currentTime = videoPlayerRef.current.getCurrentTime();
    const newTime = Math.min(effectiveClip.endTime, currentTime + 5);
    videoPlayerRef.current.seek(newTime);
  };

  const togglePlayPause = () => {
    if (!videoPlayerRef.current) return;
    if (videoPlayerRef.current.getIsPlaying()) {
      videoPlayerRef.current.pause();
    } else {
      videoPlayerRef.current.play();
    }
  };

  const handlePlaybackRateChange = (value: string) => {
    const rate = parseFloat(value);
    setPlaybackRate(rate);
    if (videoPlayerRef.current) {
      videoPlayerRef.current.setPlaybackRate(rate);
    }
  };

  return (
    <div className="space-y-2 sm:space-y-3 p-2 sm:p-3 bg-muted/30 rounded-lg border">
      {/* Timeline Controls Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-2">
        <span className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-[60%]">
          {isCurrentClipPlaying ? "Playing" : "Paused"} &ndash; {clipDisplayName}
        </span>
        <span className="text-sm font-mono text-muted-foreground whitespace-nowrap">
          {formatSecondsToMMSS(Math.max(effectiveClip.startTime, currentPlaybackTime))} / {formatSecondsToMMSS(effectiveClip.endTime)}
        </span>
      </div>

      {/* Timeline Slider */}
      <div>
        <Slider
          value={[Math.max(effectiveClip.startTime, currentPlaybackTime)]}
          onValueChange={handleSeek}
          min={effectiveClip.startTime}
          max={effectiveClip.endTime}
          step={0.1}
          className="w-full"
          disabled={disableTextarea || !mediaSrc}
        />
      </div>

      {/* Transport Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 min-h-[2rem]">
        {/* Loop Control */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <Checkbox
            id={`loop-toggle-${effectiveClip.id}`}
            checked={isLooping}
            onCheckedChange={(checked) => setIsLooping(Boolean(checked))}
            disabled={disableTextarea || !mediaSrc}
            className="h-4 w-4"
          />
          <Label htmlFor={`loop-toggle-${effectiveClip.id}`} className="text-sm font-normal text-muted-foreground whitespace-nowrap">
            Loop
          </Label>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-center gap-2 flex-grow min-w-0">
          <Button
            variant="default2"
            size="icon"
            className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0"
            onClick={skipBackward}
            disabled={disableTextarea || !mediaSrc}
          >
            <SkipBack className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
          <Button
            variant="default2"
            size="icon"
            className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0"
            onClick={togglePlayPause}
            disabled={disableTextarea || !mediaSrc}
          >
            {isCurrentClipPlaying ? (
              <PauseIcon className="h-3 w-3 sm:h-4 sm:w-4" />
            ) : (
              <PlayIcon className="h-3 w-3 sm:h-4 sm:w-4" />
            )}
          </Button>
          <Button
            variant="default2"
            size="icon"
            className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0"
            onClick={skipForward}
            disabled={disableTextarea || !mediaSrc}
          >
            <SkipForward className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>

        {/* Speed Control */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <Label htmlFor={`speed-select-${effectiveClip.id}`} className="text-sm font-normal text-muted-foreground whitespace-nowrap">
            Speed
          </Label>
          <Select
            value={playbackRate.toString()}
            onValueChange={handlePlaybackRateChange}
            disabled={disableTextarea || !mediaSrc}
          >
            <SelectTrigger id={`speed-select-${effectiveClip.id}`} className="h-7 sm:h-8 w-[3.5rem] sm:w-[4.5rem] text-xs flex-shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.25">0.25x</SelectItem>
              <SelectItem value="0.5">0.5x</SelectItem>
              <SelectItem value="0.75">0.75x</SelectItem>
              <SelectItem value="1">1x</SelectItem>
              <SelectItem value="1.25">1.25x</SelectItem>
              <SelectItem value="1.5">1.5x</SelectItem>
              <SelectItem value="1.75">1.75x</SelectItem>
              <SelectItem value="2">2x</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
