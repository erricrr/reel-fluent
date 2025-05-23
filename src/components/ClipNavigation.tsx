
"use client";

import type * as React from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Film, Trash2 as Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Clip } from '@/lib/videoUtils';

interface ClipNavigationProps {
  clips: Clip[];
  currentClipIndex: number;
  onSelectClip: (index: number) => void;
  onRemoveClip: (clipId: string) => void;
  isYouTubeVideo: boolean; 
  formatSecondsToMMSS: (seconds: number) => string;
}

export default function ClipNavigation({
  clips,
  currentClipIndex,
  onSelectClip,
  onRemoveClip,
  isYouTubeVideo,
  formatSecondsToMMSS,
}: ClipNavigationProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const activeClipRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (activeClipRef.current && scrollContainerRef.current?.parentElement) {
      // Using parentElement for scrollArea's viewport
      const scrollViewport = scrollContainerRef.current.parentElement;
      if (!scrollViewport) return;

      const activeElement = activeClipRef.current;
      
      const viewportRect = scrollViewport.getBoundingClientRect();
      const activeRect = activeElement.getBoundingClientRect();

      // Calculate scroll position relative to the viewport
      const scrollLeft = scrollViewport.scrollLeft;
      const activeElementOffsetLeft = activeElement.offsetLeft; // Position relative to the scrollable container
      const activeElementWidth = activeElement.offsetWidth;

      if (activeElementOffsetLeft < scrollLeft) {
        scrollViewport.scrollLeft = activeElementOffsetLeft - 10; // Scroll to bring left edge into view
      } else if (activeElementOffsetLeft + activeElementWidth > scrollLeft + viewportRect.width) {
        scrollViewport.scrollLeft = activeElementOffsetLeft + activeElementWidth - viewportRect.width + 10; // Scroll to bring right edge into view
      }
    }
  }, [currentClipIndex, clips]); // Rerun when clips array changes too, e.g. after removal

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
            variant="ghost"
            size="sm"
            className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 px-2 py-1 h-auto"
            onClick={() => onRemoveClip(currentClip.id)}
            aria-label="Remove this clip"
          >
            <Trash2Icon className="h-3 w-3 mr-1" /> Remove Current Clip
          </Button>
        )}
      </div>

      <ScrollArea className="w-full whitespace-nowrap rounded-md">
        <div ref={scrollContainerRef} className="flex space-x-3 pb-2.5">
          {clips.map((clip, index) => (
            <Button
              key={clip.id}
              ref={index === currentClipIndex ? activeClipRef : null}
              variant={index === currentClipIndex ? "default" : "outline"}
              className={cn(
                "h-auto py-2 px-3 flex-shrink-0 shadow-sm hover:shadow-md transition-all duration-150 ease-in-out",
                index === currentClipIndex ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border"
              )}
              onClick={() => onSelectClip(index)}
            >
              <div className="flex flex-col items-start text-left">
                <div className="flex items-center gap-1.5">
                  <Film className="h-4 w-4 text-inherit" /> {/* Ensure icon inherits color */}
                  <span className="font-semibold text-xs">
                    Clip {index + 1}
                  </span>
                </div>
                <span className={cn("text-xs", index === currentClipIndex ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {formatSecondsToMMSS(clip.startTime)} - {formatSecondsToMMSS(clip.endTime)}
                </span>
              </div>
            </Button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
    
