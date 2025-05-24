"use client";

import * as React from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Film, MoreHorizontal, Trash2 as Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Clip } from '@/lib/videoUtils';

interface ClipNavigationProps {
  clips: Clip[];
  currentClipIndex: number;
  onSelectClip: (index: number) => void;
  onRemoveClip: (clipId: string) => void;
  isYouTubeVideo: boolean;
  formatSecondsToMMSS: (seconds: number) => string;
  disableRemove?: boolean; // To disable the remove button from parent
}

export default function ClipNavigation({
  clips,
  currentClipIndex,
  onSelectClip,
  onRemoveClip,
  isYouTubeVideo,
  formatSecondsToMMSS,
  disableRemove = false,
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

  return (
    <div className="space-y-3 p-3 bg-card rounded-lg shadow">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium text-foreground">
          Clip Navigation ({clips.length > 0 ? currentClipIndex + 1 : 0} of {clips.length})
        </h3>
        {currentClip && clips.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                disabled={disableRemove}
                aria-label="Clip options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="left" align="center" className="w-48">
              <DropdownMenuItem
                onClick={() => onRemoveClip(currentClip.id)}
                className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
              >
                <Trash2Icon className="h-4 w-4 mr-2" />
                Remove Clip {currentClipIndex + 1}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
              onClick={() => handleClipClick(index)}
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
    </div>
  );
}
