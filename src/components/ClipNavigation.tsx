"use client";

import * as React from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Film, Trash2 as Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Clip } from '@/lib/videoUtils';
import ClipDurationSelector from '@/components/ClipDurationSelector';

interface ClipNavigationProps {
  clips: Clip[];
  currentClipIndex: number;
  onSelectClip: (index: number) => void;
  onRemoveClip: (clipId: string) => void;
  isYouTubeVideo: boolean;
  formatSecondsToMMSS: (seconds: number) => string;
  disableRemove?: boolean; // To disable the remove button from parent
  clipSegmentationDuration: number;
  onClipDurationChange: (value: string) => void;
  isLoadingMedia: boolean;
  isSavingMedia: boolean;
  isAnyClipTranscribing: boolean;
}

export default function ClipNavigation({
  clips,
  currentClipIndex,
  onSelectClip,
  onRemoveClip,
  isYouTubeVideo,
  formatSecondsToMMSS,
  disableRemove = false,
  clipSegmentationDuration,
  onClipDurationChange,
  isLoadingMedia,
  isSavingMedia,
  isAnyClipTranscribing,
}: ClipNavigationProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const activeClipRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (activeClipRef.current && scrollContainerRef.current?.parentElement) {
      const scrollViewport = scrollContainerRef.current.parentElement;
      if (!scrollViewport) return;

      const activeElement = activeClipRef.current;

      const viewportRect = scrollViewport.getBoundingClientRect();
      const scrollLeft = scrollViewport.scrollLeft;
      const activeElementOffsetLeft = activeElement.offsetLeft;
      const activeElementWidth = activeElement.offsetWidth;
      const scrollMargin = 16;

      if (activeElementOffsetLeft < scrollLeft + scrollMargin) {
        scrollViewport.scrollLeft = activeElementOffsetLeft - scrollMargin;
      } else if (activeElementOffsetLeft + activeElementWidth > scrollLeft + viewportRect.width - scrollMargin) {
        scrollViewport.scrollLeft = activeElementOffsetLeft + activeElementWidth - viewportRect.width + scrollMargin;
      }
    }
  }, [currentClipIndex, clips]);

  if (!clips || clips.length === 0) {
    return null;
  }

  const currentClip = clips[currentClipIndex];

  return (
    <div className="space-y-3 p-3 bg-card rounded-lg shadow">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium text-foreground">
          Clip Navigation ({clips.length > 0 ? currentClipIndex + 1 : 0} of {clips.length})
        </h3>
        {currentClip && !isYouTubeVideo && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground px-2 py-1 h-auto"
            onClick={() => onRemoveClip(currentClip.id)}
            aria-label="Remove this clip"
            disabled={disableRemove} // Use the passed disableRemove prop
          >
            <Trash2Icon className="h-3 w-3 mr-1" /> Remove Current Clip
          </Button>
        )}
      </div>

      <ScrollArea className="w-full whitespace-nowrap rounded-md">
        <div ref={scrollContainerRef} className="flex space-x-3 px-1 pt-1 pb-3.5">
          {clips.map((clip, index) => (
            <Button
              key={clip.id}
              ref={index === currentClipIndex ? activeClipRef : null}
              variant={index === currentClipIndex ? "default" : "outline"}
              className={cn(
                "h-auto py-2 px-3 flex-shrink-0 shadow-sm hover:shadow-md transition-all duration-150 ease-in-out group",
                index === currentClipIndex ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border"
              )}
              onClick={() => onSelectClip(index)}
            >
              <div className="flex flex-col items-start text-left">
                <div className="flex items-center gap-1.5">
                  <Film className="h-4 w-4 text-inherit" />
                  <span className="font-semibold text-xs">
                    Clip {index + 1}
                  </span>
                </div>
                <span className={cn(
                  "text-xs",
                  index === currentClipIndex
                    ? "text-primary-foreground/80"
                    : "text-muted-foreground group-hover:text-accent-foreground"
                )}>
                  {formatSecondsToMMSS(clip.startTime)} - {formatSecondsToMMSS(clip.endTime)}
                </span>
              </div>
            </Button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {currentClip && (
        <div className="flex flex-col gap-4">
          <ClipDurationSelector
            selectedDuration={clipSegmentationDuration}
            onDurationChange={onClipDurationChange}
            disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
          />
        </div>
      )}
    </div>
  );
}
