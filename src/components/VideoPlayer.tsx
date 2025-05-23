
"use client";

import type * as React from 'react';
import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils"; // For conditional class names

interface VideoPlayerProps {
  src?: string;
  startTime?: number;
  endTime?: number;
  onTimeUpdate?: (currentTime: number) => void;
  onLoadedMetadata?: (duration: number) => void;
  onEnded?: () => void;
  className?: string;
  isAudioSource?: boolean;
}

export default function VideoPlayer({
  src,
  startTime = 0,
  endTime,
  onTimeUpdate,
  onLoadedMetadata,
  onEnded,
  className,
  isAudioSource = false,
}: VideoPlayerProps) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);

  useEffect(() => {
    const media = mediaRef.current;
    if (media && src) {
      if (media.src !== src) {
        media.src = src;
        media.load();
      }

      const handleLoadedMetadata = () => {
        if (!media) return;
        if (onLoadedMetadata) {
          onLoadedMetadata(media.duration);
        }
        media.currentTime = startTime;
        // Initial check to prevent play if startTime is already at/past endTime
        enforceClipBoundaryOnPlay();
      };

      const handleTimeUpdate = () => {
        if (!media) return;
        if (onTimeUpdate) {
          onTimeUpdate(media.currentTime);
        }

        // Only apply custom end time logic for non-YouTube sources
        if (!(src?.includes("youtube.com") || src?.includes("youtu.be/"))) {
          if (typeof endTime === 'number' && isFinite(endTime)) {
            if (media.currentTime >= endTime) {
              // Clamp currentTime to endTime first.
              media.currentTime = endTime;
              // Then, ensure it's paused.
              if (!media.paused) {
                media.pause();
              }
              if (onEnded) {
                onEnded();
              }
            }
          }
        }
      };

      const handleMediaEnded = () => {
        // This is the native 'ended' event of the media element
        if (onEnded) onEnded();
      };
      
      const enforceClipBoundaryOnPlay = () => {
        if (!media) return;
        if (!(src?.includes("youtube.com") || src?.includes("youtu.be/"))) { // Only for non-YouTube
            if (typeof endTime === 'number' && isFinite(endTime) && media.currentTime >= endTime) {
                if (!media.paused) {
                    media.pause();
                }
                media.currentTime = endTime; // Ensure it's parked at endTime
            }
        }
      };

      media.addEventListener("loadedmetadata", handleLoadedMetadata);
      media.addEventListener("timeupdate", handleTimeUpdate);
      media.addEventListener("ended", handleMediaEnded);
      media.addEventListener('play', enforceClipBoundaryOnPlay);
      media.addEventListener('playing', enforceClipBoundaryOnPlay);


      if (media.readyState >= (media as HTMLMediaElement).HAVE_METADATA) {
         media.currentTime = startTime;
         enforceClipBoundaryOnPlay(); // Also check here if media was already loaded
      }

      return () => {
        media.removeEventListener("loadedmetadata", handleLoadedMetadata);
        media.removeEventListener("timeupdate", handleTimeUpdate);
        media.removeEventListener("ended", handleMediaEnded);
        media.removeEventListener('play', enforceClipBoundaryOnPlay);
        media.removeEventListener('playing', enforceClipBoundaryOnPlay);
      };
    }
  }, [src, startTime, endTime, onTimeUpdate, onLoadedMetadata, onEnded]);

  useEffect(() => {
    const media = mediaRef.current;
    // This effect ensures that if startTime or endTime props change for an already loaded media (non-YouTube),
    // and the currentTime is outside the new bounds, it jumps to the new startTime.
    if (media && src && !(src?.includes("youtube.com") || src?.includes("youtu.be/")) && media.readyState >= (media as HTMLMediaElement).HAVE_METADATA) {
        if (media.currentTime < startTime || (typeof endTime === 'number' && isFinite(endTime) && media.currentTime > endTime)) {
             media.currentTime = startTime;
             // If it was playing and now jumped, re-check boundary immediately
             if (!media.paused) {
                const currentMedia = media; // Capture for timeout
                setTimeout(() => { // Allow currentTime to settle after jump
                    if (typeof endTime === 'number' && isFinite(endTime) && currentMedia.currentTime >= endTime) {
                        currentMedia.currentTime = endTime;
                        if(!currentMedia.paused) currentMedia.pause();
                    }
                }, 0);
             }
        }
    }
  }, [src, startTime, endTime]); // Added src to dependencies as it's used in the condition


  if (!src) {
    return (
      <Card className={cn(
        "flex items-center justify-center bg-muted",
        isAudioSource ? "h-24" : "aspect-video",
        className
      )}>
        <CardContent className="p-0">
          <p className="text-muted-foreground">No {isAudioSource ? 'audio' : 'video'} loaded</p>
        </CardContent>
      </Card>
    );
  }

  if (src.includes("youtube.com/watch") || src.includes("youtu.be/")) {
    let videoId = '';
    if (src.includes("youtube.com/watch")) {
      const urlParams = new URLSearchParams(new URL(src).search);
      videoId = urlParams.get("v") || '';
    } else if (src.includes("youtu.be/")) {
      videoId = new URL(src).pathname.substring(1);
    }

    if (videoId) {
      const endParam = (typeof endTime === 'number' && isFinite(endTime)) ? `&end=${Math.floor(endTime)}` : '';
      const embedSrc = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(startTime)}${endParam}&autoplay=0&controls=1`;
      return (
        <Card className={cn("overflow-hidden aspect-video", className)}>
          <CardContent className="p-0 h-full">
            <iframe
              key={embedSrc} 
              width="100%"
              height="100%"
              src={embedSrc}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </CardContent>
        </Card>
      );
    } else {
       return (
        <Card className={cn("flex items-center justify-center bg-muted aspect-video", className)}>
          <CardContent className="p-0">
            <p className="text-muted-foreground">Invalid YouTube URL</p>
          </CardContent>
        </Card>
      );
    }
  }

  const mediaKey = `${src}-${startTime}-${endTime}`; // Key to force re-render of media element if segment changes

  if (isAudioSource) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardContent className="p-2 h-full flex items-center justify-center">
          <audio key={mediaKey} ref={mediaRef as React.RefObject<HTMLAudioElement>} controls className="w-full">
            Your browser does not support the audio tag.
          </audio>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("aspect-video overflow-hidden", className)}>
      <CardContent className="p-0 h-full">
        <video key={mediaKey} ref={mediaRef as React.RefObject<HTMLVideoElement>} controls className="w-full h-full bg-black" playsInline>
          Your browser does not support the video tag.
        </video>
      </CardContent>
    </Card>
  );
}

