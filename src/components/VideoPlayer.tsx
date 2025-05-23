
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
        if (onLoadedMetadata) {
          onLoadedMetadata(media.duration);
        }
        media.currentTime = startTime;
      };

      const handleTimeUpdate = () => {
        if (onTimeUpdate) {
          onTimeUpdate(media.currentTime);
        }

        // Check if endTime is defined and is a finite number
        if (typeof endTime === 'number' && isFinite(endTime)) {
          // If current time has reached or exceeded the clip's end time
          if (media.currentTime >= endTime) {
            if (!media.paused) {
              media.pause();
            }
            // After pausing, if currentTime has overshot endTime, clamp it back to endTime.
            // This ensures the player's UI doesn't show a time greater than the clip's boundary.
            if (media.currentTime > endTime) {
              media.currentTime = endTime;
            }

            if (onEnded) { // This prop is not currently used by parent, but good to have
              onEnded();
            }
          }
        }
      };

      const handleMediaEnded = () => {
        if (onEnded) onEnded();
      };

      media.addEventListener("loadedmetadata", handleLoadedMetadata);
      media.addEventListener("timeupdate", handleTimeUpdate);
      media.addEventListener("ended", handleMediaEnded);

      // If media is already loaded (e.g. src didn't change but startTime/endTime did)
      if (media.readyState >= (media as HTMLVideoElement).HAVE_METADATA) {
         media.currentTime = startTime;
      }

      return () => {
        media.removeEventListener("loadedmetadata", handleLoadedMetadata);
        media.removeEventListener("timeupdate", handleTimeUpdate);
        media.removeEventListener("ended", handleMediaEnded);
      };
    }
  }, [src, startTime, endTime, onTimeUpdate, onLoadedMetadata, onEnded]);

  useEffect(() => {
    const media = mediaRef.current;
    // This effect ensures that if startTime or endTime props change for an already loaded media,
    // and the currentTime is outside the new bounds, it jumps to the new startTime.
    if (media && media.src && media.readyState >= (media as HTMLVideoElement).HAVE_METADATA) {
        if (media.currentTime < startTime || (typeof endTime === 'number' && isFinite(endTime) && media.currentTime > endTime)) {
             media.currentTime = startTime;
        }
    }
  }, [startTime, endTime]);


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
      // For YouTube, startTime and endTime are handled by URL parameters.
      // Ensure endTime is finite before adding to URL.
      const endParam = (typeof endTime === 'number' && isFinite(endTime)) ? `&end=${Math.floor(endTime)}` : '';
      const embedSrc = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(startTime)}${endParam}&autoplay=0&controls=1`;
      return (
        <Card className={cn("overflow-hidden aspect-video", className)}>
          <CardContent className="p-0 h-full">
            <iframe
              key={embedSrc} // Add key to force re-render if src changes significantly
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

  if (isAudioSource) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardContent className="p-2 h-full flex items-center justify-center">
          <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} controls className="w-full">
            Your browser does not support the audio tag.
          </audio>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("aspect-video overflow-hidden", className)}>
      <CardContent className="p-0 h-full">
        <video ref={mediaRef as React.RefObject<HTMLVideoElement>} controls className="w-full h-full bg-black" playsInline>
          Your browser does not support the video tag.
        </video>
      </CardContent>
    </Card>
  );
}
