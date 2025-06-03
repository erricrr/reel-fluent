"use client";

import * as React from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Film, CircleCheckBig } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Clip } from '@/lib/videoUtils';
import ClipOptionsDropdown from './ClipOptionsDropdown';

interface ClipInfo {
  displayName: string;
  fullName: string;
  isTruncated: boolean;
}

interface ClipNavigationProps {
  clips: Clip[];
  currentClipIndex: number;
  onSelectClip: (index: number) => void;
  onRemoveClip: (clipId: string) => void;
  isYouTubeVideo: boolean;
  formatSecondsToMMSS: (seconds: number) => string;
  disableRemove?: boolean; // To disable the remove button from parent
  // Optional session-related props
  getClipInfo?: (clip: Clip, index: number) => ClipInfo;
  isClipSaved?: (clip: Clip) => boolean;
  title?: string;
  showHeader?: boolean; // Whether to show the header with title and dropdown
  className?: string; // Allow custom styling
}

export default function ClipNavigation({
  clips,
  currentClipIndex,
  onSelectClip,
  onRemoveClip,
  isYouTubeVideo,
  formatSecondsToMMSS,
  disableRemove = false,
  getClipInfo,
  isClipSaved,
  title = "Clip Navigation",
  showHeader = true,
  className,
}: ClipNavigationProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const activeClipRef = React.useRef<HTMLButtonElement>(null);

  // Helper function to check if clip is fully visible and scroll if needed
  const ensureClipVisible = React.useCallback(() => {
    if (activeClipRef.current && scrollContainerRef.current) {
      const scrollAreaViewport = scrollContainerRef.current.closest('[data-radix-scroll-area-viewport]') as HTMLElement;

      if (scrollAreaViewport) {
        const clipButton = activeClipRef.current;
        const clipLeftRelative = clipButton.offsetLeft;
        const clipWidth = clipButton.offsetWidth;
        const scrollLeft = scrollAreaViewport.scrollLeft;
        const viewportWidth = scrollAreaViewport.clientWidth;

        const margin = 16;

        // Check if clip is actually not fully visible
        const isClippedLeft = clipLeftRelative < scrollLeft + margin;
        const isClippedRight = clipLeftRelative + clipWidth > scrollLeft + viewportWidth - margin;

        // Only scroll if the clip is actually cut off
        if (isClippedLeft || isClippedRight) {
          let newScrollLeft = scrollLeft;

          if (isClippedLeft) {
            newScrollLeft = clipLeftRelative - margin;
          } else if (isClippedRight) {
            newScrollLeft = clipLeftRelative + clipWidth - viewportWidth + margin;
          }

          scrollAreaViewport.scrollTo({
            left: Math.max(0, newScrollLeft),
            behavior: 'smooth'
          });
        }
      }
    }
  }, []);

  // Function to handle clip selection
  const handleClipClick = React.useCallback((index: number) => {
    // First call the original onSelectClip
    onSelectClip(index);

    // Only scroll after a small delay to ensure the active state is applied
    // But only if the clip is not fully visible
    setTimeout(() => {
      ensureClipVisible();
    }, 10);
  }, [onSelectClip, ensureClipVisible]);

  if (!clips || clips.length === 0) {
    return null;
  }

  const currentClip = clips[currentClipIndex];

  // Default clip info function if none provided
  const defaultGetClipInfo = React.useCallback((clip: Clip, index: number): ClipInfo => {
    const displayName = `Clip ${index + 1}`;
    return { displayName, fullName: displayName, isTruncated: false };
  }, []);

  const effectiveGetClipInfo = getClipInfo || defaultGetClipInfo;

  return (
    <div className={cn("space-y-3 p-3 bg-card rounded-lg shadow", className)}>
      {showHeader && (
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-medium text-foreground">
            {title} ({clips.length > 0 ? currentClipIndex + 1 : 0} of {clips.length})
          </h3>
          {currentClip && clips.length > 1 && (
            <ClipOptionsDropdown
              currentClipIndex={currentClipIndex}
              onRemoveClip={onRemoveClip}
              clipId={currentClip.id}
              disabled={disableRemove}
            />
          )}
        </div>
      )}

      <ScrollArea className="w-full whitespace-nowrap rounded-md">
        <div ref={scrollContainerRef} className="flex space-x-3 px-1 pt-1 pb-3.5">
          {clips.map((clip, index) => {
            const clipInfo = effectiveGetClipInfo(clip, index);
            const clipButton = (
              <Button
                key={clip.id}
                ref={index === currentClipIndex ? activeClipRef : null}
                variant={index === currentClipIndex ? "default" : "outline"}
                className={cn(
                  "h-auto py-2 px-3 flex-shrink-0 shadow-sm hover:shadow-md transition-all duration-150 ease-in-out group relative",
                  index === currentClipIndex
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "border-border hover:bg-muted hover:text-foreground"
                )}
                onClick={() => handleClipClick(index)}
              >
                {/* Saved indicator */}
                {isClipSaved && isClipSaved(clip) && (
                  <div className="absolute -top-1 -right-1 bg-accent text-accent-foreground rounded-full p-0.5 shadow-sm">
                    <CircleCheckBig className="h-3 w-3" />
                  </div>
                )}
                <div className="flex flex-col items-start text-left">
                  <div className="flex items-center gap-1.5">
                    <Film className="h-4 w-4 text-inherit" />
                    <span className="font-semibold text-xs">
                      {clipInfo.displayName}
                    </span>
                  </div>
                  <span className={cn(
                    "text-xs",
                    index === currentClipIndex
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}>
                    {formatSecondsToMMSS(clip.startTime)} - {formatSecondsToMMSS(clip.endTime)}
                  </span>
                </div>
              </Button>
            );

            // Return with tooltip if name is truncated
            return clipInfo.isTruncated ? (
              <TooltipProvider key={clip.id}>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    {clipButton}
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{clipInfo.fullName}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : clipButton;
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
