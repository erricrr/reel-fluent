
"use client";

import type * as React from 'react';
import { useEffect, useRef, useCallback, useState } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  currentClipIndex?: number; 
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
  currentClipIndex, 
}: VideoPlayerProps) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const [isLooping, setIsLooping] = useState(false);

  const getEffectiveSrc = useCallback(() => {
    if (!src) return undefined;
    if (src.includes("youtube.com/") || src.includes("youtu.be/")) {
      return src; 
    }
    const sTime = typeof startTime === 'number' && isFinite(startTime) ? Math.floor(startTime) : 0;
    const eTime = typeof endTime === 'number' && isFinite(endTime) ? Math.floor(endTime) : undefined;

    if (eTime !== undefined) {
      return `${src}#t=${sTime},${eTime}`;
    }
    return `${src}#t=${sTime}${eTime ? `,${eTime}` : ''}`;
  }, [src, startTime, endTime]);

  const effectiveSrc = getEffectiveSrc();
  const mediaKey = `${effectiveSrc}-${startTime}-${endTime}`; 

  const isYouTube = effectiveSrc?.includes("youtube.com/") || effectiveSrc?.includes("youtu.be/");


  const enforceClipBoundaryOnPlay = useCallback(() => {
    const media = mediaRef.current;
    if (!media || isYouTube) {
      return;
    }
    // If current time is already past end, reset to end and pause.
    if (typeof endTime === 'number' && isFinite(endTime) && media.currentTime >= endTime) {
      media.currentTime = endTime; 
      if (!media.paused) {
        media.pause();
      }
    } else if (media.currentTime < startTime) { // If before start, set to start
      media.currentTime = startTime;
    }
  }, [isYouTube, startTime, endTime]);

  const handleTimeUpdate = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;

    if (onTimeUpdate) {
      onTimeUpdate(media.currentTime);
    }

    if (isYouTube) {
      return; 
    }

    if (typeof endTime === 'number' && isFinite(endTime)) {
      const threshold = 0.2; // Small buffer to catch the end event more reliably
      if (media.currentTime >= endTime - threshold) {
        if (isLooping) {
          media.currentTime = startTime;
          media.play().catch(error => {
            // This can happen if the user interacts quickly or if the browser has autoplay restrictions
            console.warn("Error attempting to loop playback:", error);
            media.pause(); // Ensure it's paused if play fails
            media.currentTime = startTime; // Reset to start time
          });
        } else {
          media.currentTime = endTime; // Clamp to exact end time
          if (!media.paused) {
            media.pause(); // Ensure it's paused
          }
          // Trigger onEnded only if not looping and we are at the exact end time
          if (onEnded && !isLooping && Math.abs(media.currentTime - endTime) < 0.1) {
            onEnded();
          }
        }
      }
    }
  }, [isYouTube, startTime, endTime, onTimeUpdate, onEnded, isLooping]);


  const handleMediaEnded = useCallback(() => {
    const media = mediaRef.current;
    if (!media || isYouTube) return;

    // This event fires when the media naturally reaches its true end
    // If we are looping a segment, our timeupdate handler should catch it first.
    // This is more of a fallback.
    if (isLooping) {
      media.currentTime = startTime;
      media.play().catch(error => console.warn("Loop playback error on ended event:", error));
    } else {
      // If not looping, make sure it's at the clip's end time if defined
      if(typeof endTime === 'number' && isFinite(endTime)){
        media.currentTime = endTime;
      }
      if (onEnded) onEnded();
    }
  }, [isYouTube, startTime, endTime, isLooping, onEnded]);


  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !effectiveSrc) { 
      return;
    }
    
    // This function is called when the media's metadata (like duration) is loaded.
    const localHandleLoadedMetadata = () => {
      if (!media) return;
      if (onLoadedMetadata) {
        onLoadedMetadata(media.duration); // Report actual media duration
      }
      // Always set currentTime to startTime when metadata is loaded for the segment
      media.currentTime = startTime;
      enforceClipBoundaryOnPlay(); // Check boundaries immediately
    };
    
    media.addEventListener("loadedmetadata", localHandleLoadedMetadata);
    media.addEventListener("timeupdate", handleTimeUpdate);
    media.addEventListener("ended", handleMediaEnded); // Native ended event
    media.addEventListener('play', enforceClipBoundaryOnPlay);
    media.addEventListener('playing', enforceClipBoundaryOnPlay);

    // If the src attribute of the media element is different from effectiveSrc, update it.
    // This happens for new files or when media fragments change the src.
    if (media.currentSrc !== effectiveSrc && media.src !== effectiveSrc) {
        media.src = effectiveSrc; // This will trigger a load
        media.load(); // Explicitly tell the browser to load the new source
    } else if (media.readyState >= 1) { // HAVE_METADATA or more
        // If src is the same but startTime might have changed (e.g. navigating clips)
        if(media.currentTime !== startTime) {
            media.currentTime = startTime;
        }
        enforceClipBoundaryOnPlay(); // Check boundaries immediately
    }


    return () => {
      // Cleanup: remove event listeners when the component unmounts or dependencies change
      media.removeEventListener("loadedmetadata", localHandleLoadedMetadata);
      media.removeEventListener("timeupdate", handleTimeUpdate);
      media.removeEventListener("ended", handleMediaEnded);
      media.removeEventListener('play', enforceClipBoundaryOnPlay);
      media.removeEventListener('playing', enforceClipBoundaryOnPlay);
    };
  // mediaKey ensures this effect re-runs if src, startTime, or endTime change.
  // Other dependencies are callbacks that should be stable if memoized, or their change implies a logical re-setup.
  }, [mediaKey, effectiveSrc, startTime, endTime, onTimeUpdate, onLoadedMetadata, onEnded, handleTimeUpdate, handleMediaEnded, enforceClipBoundaryOnPlay]);


  if (!effectiveSrc) {
    return (
      <Card className={cn(
        "flex items-center justify-center bg-muted",
        isAudioSource ? "h-24" : "aspect-video", // Different base height for audio
        className
      )}>
        <CardContent className="p-0">
          <p className="text-muted-foreground">No {isAudioSource ? 'audio' : 'video'} loaded</p>
        </CardContent>
      </Card>
    );
  }

  if (isYouTube) {
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
              key={embedYTSrc} // Use the full src as key for YouTube
              width="100%"
              height="100%"
              src={embedYTSrc}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
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

  const rootCardClasses = cn(
    "overflow-hidden",
    // isAudioSource ? "h-auto" : "aspect-video", // Let audio card size naturally for now
    className
  );
  const contentClasses = cn(
    "h-full",
    isAudioSource ? "p-2 flex items-center justify-center" : "aspect-video p-0 pb-0" 
  );


  if (isAudioSource) {
    return (
      <Card className={rootCardClasses}>
        <CardContent className={contentClasses}>
          <audio key={mediaKey} ref={mediaRef as React.RefObject<HTMLAudioElement>} controls className="w-full">
            Your browser does not support the audio tag.
          </audio>
        </CardContent>
        {!isYouTube && ( // This condition will always be true here since isAudioSource implies !isYouTube
          <CardFooter className="py-2 px-2 border-t">
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`loop-toggle-${mediaKey}`} // Unique ID based on mediaKey
                checked={isLooping}
                onCheckedChange={(checked) => setIsLooping(Boolean(checked))}
              />
              <Label htmlFor={`loop-toggle-${mediaKey}`} className="text-sm font-normal text-muted-foreground">
                Loop Clip {currentClipIndex !== undefined ? currentClipIndex + 1 : ''}
              </Label>
            </div>
          </CardFooter>
        )}
      </Card>
    );
  }

  // Non-YouTube Video
  return (
    <Card className={rootCardClasses}>
      <CardContent className={contentClasses}>
        <video key={mediaKey} ref={mediaRef as React.RefObject<HTMLVideoElement>} controls className="w-full h-full bg-black" playsInline>
          Your browser does not support the video tag.
        </video>
      </CardContent>
       {!isYouTube && ( // This condition will also be true here
        <CardFooter className="py-2 px-2 border-t">
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`loop-toggle-${mediaKey}`} // Unique ID based on mediaKey
              checked={isLooping}
              onCheckedChange={(checked) => setIsLooping(Boolean(checked))}
            />
            <Label htmlFor={`loop-toggle-${mediaKey}`} className="text-sm font-normal text-muted-foreground">
                Loop Clip {currentClipIndex !== undefined ? currentClipIndex + 1 : ''}
            </Label>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

