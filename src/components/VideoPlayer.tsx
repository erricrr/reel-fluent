
"use client";

import type * as React from 'react';
import { useEffect, useRef, useCallback } from "react"; // Added useCallback
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

  // Memoize handlers to ensure stable references for add/removeEventListener
  // unless their dependencies (startTime, endTime, onEnded, onTimeUpdate) change.
  const enforceClipBoundaryOnPlay = useCallback(() => {
    const media = mediaRef.current;
    if (!media || !src || (src.includes("youtube.com") || src.includes("youtu.be/"))) {
      return;
    }
    if (typeof endTime === 'number' && isFinite(endTime) && media.currentTime >= endTime) {
      media.currentTime = endTime;
      if (!media.paused) {
        media.pause();
      }
    } else if (media.currentTime < startTime) {
      media.currentTime = startTime;
    }
  }, [src, startTime, endTime]);

  const handleTimeUpdate = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;

    if (onTimeUpdate) {
      onTimeUpdate(media.currentTime);
    }

    if (!(src?.includes("youtube.com") || src?.includes("youtu.be/"))) {
      if (typeof endTime === 'number' && isFinite(endTime)) {
        if (media.currentTime >= endTime) {
          media.currentTime = endTime;
          if (!media.paused) {
            media.pause();
          }
          if (onEnded) {
            onEnded();
          }
        }
      }
    }
  }, [src, endTime, onTimeUpdate, onEnded]);


  const handleMediaEnded = useCallback(() => {
    if (onEnded) onEnded();
  }, [onEnded]);


  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !src) {
      return;
    }

    const localHandleLoadedMetadata = () => {
      if (!media) return;
      if (onLoadedMetadata) {
        onLoadedMetadata(media.duration);
      }
      // Always set currentTime to startTime once metadata is loaded
      // This is crucial for new elements created by key change
      media.currentTime = startTime;
      enforceClipBoundaryOnPlay(); // Check boundaries immediately
    };
    
    media.addEventListener("loadedmetadata", localHandleLoadedMetadata);
    media.addEventListener("timeupdate", handleTimeUpdate);
    media.addEventListener("ended", handleMediaEnded);
    media.addEventListener('play', enforceClipBoundaryOnPlay);
    media.addEventListener('playing', enforceClipBoundaryOnPlay);

    // If src prop changes, update element src and load
    // currentSrc reflects what the browser is actually using/loaded
    if (media.currentSrc !== src && media.src !== src) { // Check both to be safe
      media.src = src;
      media.load(); // This will trigger 'loadedmetadata' where currentTime is set
    } else {
      // Src is the same, but element might be new (due to key) or startTime/endTime changed
      // If already loaded, set currentTime directly
      if (media.readyState >= media.HAVE_METADATA) {
        if (media.currentTime !== startTime) { // Avoid unnecessary seeks
          media.currentTime = startTime;
        }
        enforceClipBoundaryOnPlay();
      }
      // If not yet loaded (e.g. new keyed element not yet through metadata), 
      // 'loadedmetadata' listener above will handle setting currentTime.
    }

    return () => {
      media.removeEventListener("loadedmetadata", localHandleLoadedMetadata);
      media.removeEventListener("timeupdate", handleTimeUpdate);
      media.removeEventListener("ended", handleMediaEnded);
      media.removeEventListener('play', enforceClipBoundaryOnPlay);
      media.removeEventListener('playing', enforceClipBoundaryOnPlay);
    };
  }, [src, startTime, endTime, onTimeUpdate, onLoadedMetadata, onEnded, handleTimeUpdate, handleMediaEnded, enforceClipBoundaryOnPlay]); // Added memoized handlers to deps


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
      // Ensure endTime is a whole number for YouTube URL
      const endParam = (typeof endTime === 'number' && isFinite(endTime)) ? `&end=${Math.floor(endTime)}` : '';
      const embedSrc = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(startTime)}${endParam}&autoplay=0&controls=1&rel=0`;
      return (
        <Card className={cn("overflow-hidden aspect-video", className)}>
          <CardContent className="p-0 h-full">
            <iframe
              key={embedSrc} // Keyed by full embedSrc to force reload on any param change
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

  // Key is critical: forces React to re-mount the media element if src, startTime, or endTime change.
  // This ensures a "fresh" element state for each clip segment.
  const mediaKey = `${src}-${startTime}-${endTime}`;

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
