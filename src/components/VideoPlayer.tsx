"use client";

import type * as React from 'react';
import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface VideoPlayerProps {
  src?: string;
  startTime?: number;
  endTime?: number;
  onTimeUpdate?: (currentTime: number) => void;
  onLoadedMetadata?: (duration: number) => void;
  onEnded?: () => void;
  className?: string;
}

export default function VideoPlayer({
  src,
  startTime = 0,
  endTime,
  onTimeUpdate,
  onLoadedMetadata,
  onEnded,
  className,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video && src) {
      if (video.src !== src) {
        video.src = src;
        video.load(); // Ensure the new source is loaded
      }

      const handleLoadedMetadata = () => {
        if (onLoadedMetadata) {
          onLoadedMetadata(video.duration);
        }
        // Always seek to startTime when metadata is loaded or src changes
        video.currentTime = startTime; 
      };

      const handleTimeUpdate = () => {
        if (onTimeUpdate) {
          onTimeUpdate(video.currentTime);
        }
        if (endTime !== undefined && video.currentTime >= endTime) {
          video.pause();
          if (onEnded) onEnded(); // Call onEnded when clip segment finishes
        }
      };
      
      const handleVideoEnded = () => {
        // This handles the natural end of the video, or can be used for clip end too
        if (onEnded) onEnded();
      };

      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("timeupdate", handleTimeUpdate);
      video.addEventListener("ended", handleVideoEnded);
      
      // Initial seek if src is already set and metadata might be available
      // Or if startTime changes for an existing src
      if (video.readyState >= video.HAVE_METADATA) { // HAVE_METADATA or higher
         video.currentTime = startTime;
      }


      return () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("timeupdate", handleTimeUpdate);
        video.removeEventListener("ended", handleVideoEnded);
      };
    }
  }, [src, startTime, endTime, onTimeUpdate, onLoadedMetadata, onEnded]);
  
  // Effect to handle only startTime changes for an already loaded video
  useEffect(() => {
    const video = videoRef.current;
    if (video && video.src && video.readyState >= video.HAVE_METADATA) {
        if (video.currentTime < startTime || (endTime && video.currentTime > endTime)) {
             video.currentTime = startTime;
        }
    }
  }, [startTime, endTime]);


  if (!src) {
    return (
      <Card className={`aspect-video flex items-center justify-center bg-muted ${className}`}>
        <CardContent className="p-0">
          <p className="text-muted-foreground">No video loaded</p>
        </CardContent>
      </Card>
    );
  }
  
  // If src is a YouTube URL, render an iframe
  // This is a basic check, more robust parsing might be needed
  if (src.includes("youtube.com/watch") || src.includes("youtu.be/")) {
    let videoId = '';
    if (src.includes("youtube.com/watch")) {
      const urlParams = new URLSearchParams(new URL(src).search);
      videoId = urlParams.get("v") || '';
    } else if (src.includes("youtu.be/")) {
      videoId = new URL(src).pathname.substring(1);
    }

    if (videoId) {
       // For YouTube, startTime and endTime for clips can be passed via URL parameters
      const embedSrc = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(startTime)}${endTime ? `&end=${Math.floor(endTime)}` : ''}&autoplay=0&controls=1`;
      return (
        <Card className={`aspect-video overflow-hidden ${className}`}>
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
        <Card className={`aspect-video flex items-center justify-center bg-muted ${className}`}>
          <CardContent className="p-0">
            <p className="text-muted-foreground">Invalid YouTube URL</p>
          </CardContent>
        </Card>
      );
    }
  }


  return (
    <Card className={`aspect-video overflow-hidden ${className}`}>
      <CardContent className="p-0 h-full">
        <video ref={videoRef} controls className="w-full h-full bg-black" playsInline>
          Your browser does not support the video tag.
        </video>
      </CardContent>
    </Card>
  );
}
