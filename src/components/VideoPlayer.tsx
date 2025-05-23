
"use client";

import type * as React from 'react';
import { useEffect, useRef, useCallback } from "react";
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

  // Construct effective source URL
  const getEffectiveSrc = useCallback(() => {
    if (!src) return undefined;
    if (src.includes("youtube.com/") || src.includes("youtu.be/")) {
      return src; // YouTube URLs are handled by iframe params
    }

    const sTime = typeof startTime === 'number' && isFinite(startTime) ? Math.floor(startTime) : 0;
    // For #t fragment, endTime is optional. If provided, it's the end point.
    // If not, playback goes to the end of the media from sTime.
    // Our JS logic will still enforce the clip's specific endTime.
    const eTime = typeof endTime === 'number' && isFinite(endTime) ? Math.floor(endTime) : undefined;

    if (eTime !== undefined) {
      return `${src}#t=${sTime},${eTime}`;
    }
    // If eTime is not well-defined (e.g. Infinity for YT, or if not needed for this strategy)
    // Fallback to just start time, our JS logic will handle the end.
    // However, for best results with media fragments, providing both is better if `endTime` is finite.
    // Given our app logic, `endTime` should generally be finite for non-YT sources.
    return `${src}#t=${sTime}${eTime ? `,${eTime}` : ''}`;
  }, [src, startTime, endTime]);

  const effectiveSrc = getEffectiveSrc();

  // Key is critical: forces React to re-mount the media element if effectiveSrc changes.
  const mediaKey = effectiveSrc;


  const enforceClipBoundaryOnPlay = useCallback(() => {
    const media = mediaRef.current;
    if (!media || !effectiveSrc || (effectiveSrc.includes("youtube.com") || effectiveSrc.includes("youtu.be/"))) {
      return;
    }
    // Player's current time is always relative to the full media if #t doesn't change media.duration
    // So, we use the absolute startTime and endTime from props.
    if (typeof endTime === 'number' && isFinite(endTime) && media.currentTime >= endTime) {
      media.currentTime = endTime; // Clamp and pause
      if (!media.paused) {
        media.pause();
      }
    } else if (media.currentTime < startTime) {
      media.currentTime = startTime; // Jump to start if before
    }
  }, [effectiveSrc, startTime, endTime]);

  const handleTimeUpdate = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;

    if (onTimeUpdate) {
      onTimeUpdate(media.currentTime);
    }

    if (!(effectiveSrc?.includes("youtube.com") || effectiveSrc?.includes("youtu.be/"))) {
      if (typeof endTime === 'number' && isFinite(endTime)) {
        if (media.currentTime >= endTime) {
          media.currentTime = endTime; // Clamp time
          if (!media.paused) {
            media.pause(); // Pause
          }
          if (onEnded) { // Consider onEnded only if at the actual boundary
            onEnded();
          }
        }
      }
    }
  }, [effectiveSrc, endTime, onTimeUpdate, onEnded]);


  const handleMediaEnded = useCallback(() => {
    // This native 'ended' event might fire if the #t fragment reaches its end,
    // or if the whole media ends. Our onEnded prop is more for clip end.
    if (onEnded) onEnded();
  }, [onEnded]);


  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !effectiveSrc) { // Check effectiveSrc instead of src
      return;
    }

    const localHandleLoadedMetadata = () => {
      if (!media) return;
      if (onLoadedMetadata) {
        onLoadedMetadata(media.duration); // This duration might be of the fragment or full media
      }
      // Set currentTime based on the absolute startTime prop
      media.currentTime = startTime;
      enforceClipBoundaryOnPlay();
    };
    
    media.addEventListener("loadedmetadata", localHandleLoadedMetadata);
    media.addEventListener("timeupdate", handleTimeUpdate);
    media.addEventListener("ended", handleMediaEnded);
    media.addEventListener('play', enforceClipBoundaryOnPlay);
    media.addEventListener('playing', enforceClipBoundaryOnPlay);

    // If effectiveSrc prop changes (due to src, startTime, or endTime changing),
    // the `key={mediaKey}` should cause a re-mount.
    // This effect will then run on the new element.
    // We always set the src and load for the new/re-mounted element.
    if (media.currentSrc !== effectiveSrc && media.src !== effectiveSrc) {
        media.src = effectiveSrc;
        media.load(); // This will trigger 'loadedmetadata'
    } else if (media.readyState >= media.HAVE_METADATA) {
        // If src is somehow the same but element re-mounted (e.g. from HMR or odd React behavior)
        // or if just startTime/endTime props changed without changing effectiveSrc enough to re-key (less likely with current key)
        if(media.currentTime !== startTime) {
            media.currentTime = startTime;
        }
        enforceClipBoundaryOnPlay();
    }


    return () => {
      media.removeEventListener("loadedmetadata", localHandleLoadedMetadata);
      media.removeEventListener("timeupdate", handleTimeUpdate);
      media.removeEventListener("ended", handleMediaEnded);
      media.removeEventListener('play', enforceClipBoundaryOnPlay);
      media.removeEventListener('playing', enforceClipBoundaryOnPlay);
    };
  }, [effectiveSrc, startTime, endTime, onTimeUpdate, onLoadedMetadata, onEnded, handleTimeUpdate, handleMediaEnded, enforceClipBoundaryOnPlay]);


  if (!effectiveSrc) { // Check effectiveSrc
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

  if (effectiveSrc.includes("youtube.com/watch") || effectiveSrc.includes("youtu.be/")) {
    let videoId = '';
    if (effectiveSrc.includes("youtube.com/watch")) {
      const urlParams = new URLSearchParams(new URL(effectiveSrc).search);
      videoId = urlParams.get("v") || '';
    } else if (effectiveSrc.includes("youtu.be/")) {
      videoId = new URL(effectiveSrc).pathname.substring(1);
    }

    if (videoId) {
      const endParam = (typeof endTime === 'number' && isFinite(endTime)) ? `&end=${Math.floor(endTime)}` : '';
      const embedYTSrc = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(startTime)}${endParam}&autoplay=0&controls=1&rel=0`;
      return (
        <Card className={cn("overflow-hidden aspect-video", className)}>
          <CardContent className="p-0 h-full">
            <iframe
              key={embedYTSrc} 
              width="100%"
              height="100%"
              src={embedYTSrc}
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
