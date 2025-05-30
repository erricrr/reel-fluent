"use client";

import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Scissors, Play, Pause } from "lucide-react";
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
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
      <SliderPrimitive.Range className="absolute h-full bg-gray-500 dark:bg-gray-400" />
    </SliderPrimitive.Track>
    {/* First thumb (start) */}
    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-gray-500 dark:border-gray-400 bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 dark:focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 shadow-md" />
    {/* Second thumb (end) */}
    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-gray-500 dark:border-gray-400 bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 dark:focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 shadow-md" />
  </SliderPrimitive.Root>
));
RangeSlider.displayName = "RangeSlider";

interface ClipTrimmerProps {
  mediaDuration: number;
  videoPlayerRef: React.RefObject<VideoPlayerRef>;
  onTrimmedClipCreate: (startTime: number, endTime: number) => void;
  disabled?: boolean;
  currentTrimmedClip?: { startTime: number; endTime: number } | null;
  onPreviewClip?: (startTime: number, endTime: number) => void;
  onStopPreview?: () => void;
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
  currentTrimmedClip,
  onPreviewClip,
  onStopPreview
}: ClipTrimmerProps) {
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(Math.min(30, mediaDuration));
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewTimeRemaining, setPreviewTimeRemaining] = useState(0);
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
        clearTimeout(timeCheckInterval.current);
      }
      setPreviewTimeRemaining(0);
    };
  }, []);

  const handleRangeChange = useCallback((value: number[]) => {
    if (value.length === 2) {
      setStartTime(value[0]);
      setEndTime(value[1]);

      // When manually adjusting the range, seek to the new start position
      // Only if not currently previewing
      if (!isPreviewPlaying && videoPlayerRef.current) {
        videoPlayerRef.current.seek(value[0]);
      }
    }
  }, [isPreviewPlaying, videoPlayerRef]);

  const handlePreviewClip = useCallback(() => {
    if (isPreviewPlaying) {
      // Stop preview
      setIsPreviewPlaying(false);
      setPreviewTimeRemaining(0);

      // Clear any existing interval
      if (timeCheckInterval.current) {
        clearTimeout(timeCheckInterval.current);
        timeCheckInterval.current = null;
      }

      // Tell parent to stop preview
      if (onStopPreview) {
        onStopPreview();
      }
    } else {
      // Start preview
      setIsPreviewPlaying(true);
      const clipDuration = endTime - startTime;
      setPreviewTimeRemaining(clipDuration);

      // Tell parent to start preview with our custom times
      if (onPreviewClip) {
        onPreviewClip(startTime, endTime);
      }
    }
  }, [startTime, endTime, isPreviewPlaying, onPreviewClip, onStopPreview]);

  // Separate useEffect to handle countdown timer
  useEffect(() => {
    if (!isPreviewPlaying || previewTimeRemaining <= 0) {
      return;
    }

    const updateCountdown = () => {
      setPreviewTimeRemaining(prev => {
        const newTime = prev - 0.1;
        if (newTime <= 0) {
          return 0; // Just return 0, don't call callbacks here
        }
        return newTime;
      });
    };

    timeCheckInterval.current = setTimeout(updateCountdown, 100);

    return () => {
      if (timeCheckInterval.current) {
        clearTimeout(timeCheckInterval.current);
      }
    };
  }, [isPreviewPlaying, previewTimeRemaining]);

  // Separate useEffect to handle when countdown reaches zero
  useEffect(() => {
    if (isPreviewPlaying && previewTimeRemaining <= 0) {
      setIsPreviewPlaying(false);
      if (onStopPreview) {
        onStopPreview();
      }
    }
  }, [isPreviewPlaying, previewTimeRemaining, onStopPreview]);

  const handleCreateTrimmedClip = useCallback(() => {
    onTrimmedClipCreate(startTime, endTime);
  }, [startTime, endTime, onTrimmedClipCreate]);

  const clipDuration = endTime - startTime;
  const isValidClip = clipDuration >= 1 && clipDuration <= 300;

  return (
    <Card className="shadow-xl border-primary/40 bg-gradient-to-br from-background via-primary/5 to-primary/10 duration-500 relative">
      <div className="absolute inset-0 bg-primary/5 blur-xl rounded-xl transition-opacity duration-500"></div>
      <div className="relative">
        <CardHeader className="pb-3 border-b border-primary/20">
          <CardTitle className="text-lg flex items-center gap-2 text-primary">
            <Scissors className="h-5 w-5" />
            Clip Trimmer
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Select custom start and stop points to create your focused clip for AI processing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {/* Range Slider for both start and end times */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="range-slider" className="text-sm font-medium text-foreground">
                Clip Range
              </Label>
              <div className="flex items-center gap-2 text-sm font-mono">
                <span className="text-foreground font-semibold">{formatSecondsToMMSS(startTime)}</span>
                <span className="text-muted-foreground">to</span>
                <span className="text-foreground font-semibold">{formatSecondsToMMSS(endTime)}</span>
              </div>
            </div>
            <RangeSlider
              id="range-slider"
              value={[startTime, endTime]}
              onValueChange={handleRangeChange}
              min={0}
              max={mediaDuration}
              step={0.1}
              minStepsBetweenThumbs={10}
              className="w-full"
              disabled={disabled}
            />
          </div>

          {/* Clip Duration Display */}
          <div className="flex items-center justify-between p-3 bg-primary/10 backdrop-blur-sm rounded-lg border border-primary/30 shadow-sm transition-[background-color,border-color,shadow] duration-500">
            <span className="text-sm font-medium text-foreground">Clip Duration:</span>
            <span className="text-sm font-mono text-primary font-semibold">
              {formatSecondsToMMSS(clipDuration)}
            </span>
          </div>

          {/* Preview Button Only */}
          <Button
            variant="outline"
            onClick={handlePreviewClip}
            disabled={disabled || !isValidClip}
            className="w-full border-primary/30 text-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/40 shadow-sm hover:shadow-md transition-all duration-300"
          >
            {isPreviewPlaying ? (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Stop Preview ({formatSecondsToMMSS(previewTimeRemaining)} remaining)
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Preview Clip
              </>
            )}
          </Button>

          <Button
            onClick={handleCreateTrimmedClip}
            disabled={disabled || !isValidClip}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl ring-2 ring-primary/30 hover:ring-primary/50 transition-all duration-300"
          >
            <Scissors className="mr-2 h-4 w-4" />
            {disabled
              ? "Create Custom Clip"
              : `Create Focused Clip (${formatSecondsToMMSS(clipDuration)})`
            }
          </Button>

          {!isValidClip && !disabled && (
            <p className="text-sm text-muted-foreground text-center">
              {clipDuration < 1
                ? "Clip must be at least 1 second long"
                : "Clip must be no longer than 5 minutes"
              }
            </p>
          )}
          {disabled && (
            <p className="text-sm text-muted-foreground text-center">
              Please wait for any ongoing AI operations to complete before creating a new clip.
            </p>
          )}
        </CardContent>
      </div>
    </Card>
  );
}
