
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
  isAudioSource?: boolean; // New prop
}

export default function VideoPlayer({
  src,
  startTime = 0,
  endTime,
  onTimeUpdate,
  onLoadedMetadata,
  onEnded,
  className,
  isAudioSource = false, // Default to false
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
        if (endTime !== undefined && media.currentTime >= endTime) {
          media.pause();
          if (onEnded) onEnded(); 
        }
      };
      
      const handleMediaEnded = () => {
        if (onEnded) onEnded();
      };

      media.addEventListener("loadedmetadata", handleLoadedMetadata);
      media.addEventListener("timeupdate", handleTimeUpdate);
      media.addEventListener("ended", handleMediaEnded);
      
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
    if (media && media.src && media.readyState >= (media as HTMLVideoElement).HAVE_METADATA) {
        if (media.currentTime < startTime || (endTime && media.currentTime > endTime)) {
             media.currentTime = startTime;
        }
    }
  }, [startTime, endTime]);


  if (!src) {
    return (
      <Card className={cn(
        "flex items-center justify-center bg-muted",
        isAudioSource ? "h-24" : "aspect-video", // Different height for audio
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
      const embedSrc = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(startTime)}${endTime && isFinite(endTime) ? `&end=${Math.floor(endTime)}` : ''}&autoplay=0&controls=1`;
      return (
        <Card className={cn("overflow-hidden aspect-video", className)}>
          <CardContent className="p-0 h-full">
            <iframe
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
      <Card className={cn("overflow-hidden", className)}> {/* No aspect-video for audio */}
        <CardContent className="p-2 h-full flex items-center justify-center"> {/* Adjust padding/layout as needed */}
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

