"use client";

import type * as React from 'react';
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Scissors, Play, Pause, RotateCcw } from "lucide-react";
import type { VideoPlayerRef } from "./VideoPlayer";

interface ClipTrimmerProps {
  mediaDuration: number;
  videoPlayerRef: React.RefObject<VideoPlayerRef>;
  onTrimmedClipCreate: (startTime: number, endTime: number) => void;
  disabled?: boolean;
  currentTrimmedClip?: { startTime: number; endTime: number } | null;
}

// Helper function to format seconds to MM:SS
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

export default function ClipTrimmer({
  mediaDuration,
  videoPlayerRef,
  onTrimmedClipCreate,
  disabled = false,
  currentTrimmedClip
}: ClipTrimmerProps) {
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(Math.min(30, mediaDuration)); // Default to 30 seconds or media duration
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  // Update end time when media duration changes
  useEffect(() => {
    if (mediaDuration > 0) {
      setEndTime(Math.min(30, mediaDuration));
    }
  }, [mediaDuration]);

  // Update state when currentTrimmedClip changes
  useEffect(() => {
    if (currentTrimmedClip) {
      setStartTime(currentTrimmedClip.startTime);
      setEndTime(currentTrimmedClip.endTime);
    }
  }, [currentTrimmedClip]);

  const handleStartTimeChange = useCallback((value: number[]) => {
    const newStartTime = value[0];
    setStartTime(newStartTime);

    // Ensure end time is always after start time (minimum 1 second gap)
    if (newStartTime >= endTime) {
      setEndTime(Math.min(newStartTime + 1, mediaDuration));
    }
  }, [endTime, mediaDuration]);

  const handleEndTimeChange = useCallback((value: number[]) => {
    const newEndTime = value[0];
    setEndTime(newEndTime);

    // Ensure start time is always before end time (minimum 1 second gap)
    if (newEndTime <= startTime) {
      setStartTime(Math.max(newEndTime - 1, 0));
    }
  }, [startTime]);

  const handlePreviewClip = useCallback(() => {
    if (!videoPlayerRef.current) return;

    if (isPreviewPlaying) {
      videoPlayerRef.current.pause();
      setIsPreviewPlaying(false);
    } else {
      videoPlayerRef.current.seek(startTime);
      videoPlayerRef.current.play();
      setIsPreviewPlaying(true);

      // Auto-pause when reaching end time
      const checkEndTime = () => {
        if (videoPlayerRef.current) {
          const currentTime = videoPlayerRef.current.getCurrentTime();
          if (currentTime >= endTime) {
            videoPlayerRef.current.pause();
            setIsPreviewPlaying(false);
            return;
          }
        }
        if (isPreviewPlaying) {
          requestAnimationFrame(checkEndTime);
        }
      };
      requestAnimationFrame(checkEndTime);
    }
  }, [startTime, endTime, isPreviewPlaying, videoPlayerRef]);

  const handleCreateTrimmedClip = useCallback(() => {
    onTrimmedClipCreate(startTime, endTime);
  }, [startTime, endTime, onTrimmedClipCreate]);

  const handleReset = useCallback(() => {
    setStartTime(0);
    setEndTime(Math.min(30, mediaDuration));
    if (videoPlayerRef.current) {
      videoPlayerRef.current.pause();
      setIsPreviewPlaying(false);
    }
  }, [mediaDuration, videoPlayerRef]);

  const clipDuration = endTime - startTime;
  const isValidClip = clipDuration >= 1 && clipDuration <= 300; // Between 1 second and 5 minutes

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Scissors className="h-5 w-5 text-primary" />
          Clip Trimmer
        </CardTitle>
        <CardDescription>
          Select custom start and stop points to create your focused clip for AI processing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Start Time Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="start-time-slider" className="text-sm font-medium">
              Start Time
            </Label>
            <span className="text-sm font-mono text-primary">
              {formatSecondsToMMSS(startTime)}
            </span>
          </div>
          <Slider
            id="start-time-slider"
            value={[startTime]}
            onValueChange={handleStartTimeChange}
            min={0}
            max={Math.max(0, endTime - 1)}
            step={0.1}
            className="w-full"
            disabled={disabled}
          />
        </div>

        {/* End Time Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="end-time-slider" className="text-sm font-medium">
              End Time
            </Label>
            <span className="text-sm font-mono text-primary">
              {formatSecondsToMMSS(endTime)}
            </span>
          </div>
          <Slider
            id="end-time-slider"
            value={[endTime]}
            onValueChange={handleEndTimeChange}
            min={Math.min(startTime + 1, mediaDuration)}
            max={mediaDuration}
            step={0.1}
            className="w-full"
            disabled={disabled}
          />
        </div>

        {/* Clip Duration Display */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <span className="text-sm font-medium">Clip Duration:</span>
          <span className="text-sm font-mono text-primary">
            {formatSecondsToMMSS(clipDuration)}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handlePreviewClip}
            disabled={disabled || !isValidClip}
            className="flex-1"
          >
            {isPreviewPlaying ? (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Stop Preview
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Preview Clip
              </>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={handleReset}
            disabled={disabled}
            size="icon"
            className="sm:w-auto sm:px-3"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        <Button
          onClick={handleCreateTrimmedClip}
          disabled={disabled || !isValidClip}
          className="w-full"
        >
          <Scissors className="mr-2 h-4 w-4" />
          Create Focused Clip ({formatSecondsToMMSS(clipDuration)})
        </Button>

        {!isValidClip && (
          <p className="text-sm text-muted-foreground text-center">
            {clipDuration < 1
              ? "Clip must be at least 1 second long"
              : "Clip must be no longer than 5 minutes"
            }
          </p>
        )}
      </CardContent>
    </Card>
  );
}
