"use client";

import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Scissors, Play, Pause, RotateCcw } from "lucide-react";
import type { VideoPlayerRef } from "./VideoPlayer";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

// Create a RangeSlider component with two thumbs
const RangeSlider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    {/* First thumb (start) */}
    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
    {/* Second thumb (end) */}
    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
));
RangeSlider.displayName = "RangeSlider";

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
  const [endTime, setEndTime] = useState(Math.min(30, mediaDuration));
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const timeCheckInterval = useRef<NodeJS.Timeout | null>(null);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeCheckInterval.current) {
        clearInterval(timeCheckInterval.current);
      }
    };
  }, []);

  const handleRangeChange = useCallback((value: number[]) => {
    if (value.length === 2) {
      setStartTime(value[0]);
      setEndTime(value[1]);

      // When manually adjusting the range, seek to the new start position
      if (!isPreviewPlaying && videoPlayerRef.current) {
        videoPlayerRef.current.seekWithoutBoundaryCheck(value[0]);
      }
    }
  }, [isPreviewPlaying, videoPlayerRef]);

  const handlePreviewClip = useCallback(() => {
    if (!videoPlayerRef.current) return;

    console.log('Preview clip clicked. Current state:', { isPreviewPlaying, startTime, endTime });

    if (isPreviewPlaying) {
      // Stop preview
      console.log('Stopping preview');
      videoPlayerRef.current.pause();
      setIsPreviewPlaying(false);

      // Clear any existing interval
      if (timeCheckInterval.current) {
        clearInterval(timeCheckInterval.current);
        timeCheckInterval.current = null;
      }
    } else {
      // Start preview - use the new method that bypasses boundary enforcement
      console.log('Starting preview - seeking to:', startTime);

      // Use the new seekWithoutBoundaryCheck method
      videoPlayerRef.current.seekWithoutBoundaryCheck(startTime);

      // Wait a moment for seek to complete, then start playback
      setTimeout(async () => {
        if (!videoPlayerRef.current) return;

        console.log('Starting playback after seek');
        try {
          // Use the new playWithoutBoundaryCheck method
          await videoPlayerRef.current.playWithoutBoundaryCheck();
          setIsPreviewPlaying(true);

          // Set up monitoring to stop at end time
          if (timeCheckInterval.current) {
            clearInterval(timeCheckInterval.current);
          }

          timeCheckInterval.current = setInterval(() => {
            if (!videoPlayerRef.current) {
              if (timeCheckInterval.current) {
                clearInterval(timeCheckInterval.current);
                timeCheckInterval.current = null;
              }
              return;
            }

            const currentTime = videoPlayerRef.current.getCurrentTime();

            // Stop when we reach the end time
            if (currentTime >= endTime) {
              console.log('Reached end time, stopping preview at:', currentTime, 'target was:', endTime);
              videoPlayerRef.current.pause();
              setIsPreviewPlaying(false);

              if (timeCheckInterval.current) {
                clearInterval(timeCheckInterval.current);
                timeCheckInterval.current = null;
              }
            }
          }, 50); // Check every 50ms for more responsive stopping
        } catch (err) {
          console.error('Failed to start playback:', err);
          setIsPreviewPlaying(false);
        }
      }, 300); // Longer delay to ensure seek completes
    }
  }, [startTime, endTime, isPreviewPlaying, videoPlayerRef]);

  const handleCreateTrimmedClip = useCallback(() => {
    onTrimmedClipCreate(startTime, endTime);
  }, [startTime, endTime, onTrimmedClipCreate]);

  const handleReset = useCallback(() => {
    setStartTime(0);
    setEndTime(Math.min(30, mediaDuration));

    if (isPreviewPlaying && videoPlayerRef.current) {
      videoPlayerRef.current.pause();
      setIsPreviewPlaying(false);

      if (timeCheckInterval.current) {
        clearInterval(timeCheckInterval.current);
        timeCheckInterval.current = null;
      }
    }

    // Reset to beginning of media
    if (videoPlayerRef.current) {
      videoPlayerRef.current.seekWithoutBoundaryCheck(0);
    }
  }, [mediaDuration, videoPlayerRef, isPreviewPlaying]);

  const clipDuration = endTime - startTime;
  const isValidClip = clipDuration >= 1 && clipDuration <= 300;

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
        {/* Range Slider for both start and end times */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="range-slider" className="text-sm font-medium">
              Clip Range
            </Label>
            <div className="flex items-center gap-2 text-sm font-mono">
              <span className="text-primary">{formatSecondsToMMSS(startTime)}</span>
              <span className="text-muted-foreground">to</span>
              <span className="text-primary">{formatSecondsToMMSS(endTime)}</span>
            </div>
          </div>
          <RangeSlider
            id="range-slider"
            value={[startTime, endTime]}
            onValueChange={handleRangeChange}
            min={0}
            max={mediaDuration}
            step={0.1}
            minStepsBetweenThumbs={10} // Ensures minimum 1 second gap (with step=0.1)
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
