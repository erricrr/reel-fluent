"use client";

import type * as React from 'react';
import { useEffect, useRef, useCallback, useState, useImperativeHandle, forwardRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface VideoPlayerRef {
  play: () => void;
  pause: () => void;
  getIsPlaying: () => boolean;
  getCurrentTime: () => number;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
}

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
  onPlayStateChange?: (isPlaying: boolean) => void; // Callback for play/pause state
  isLooping?: boolean; // External loop control
}

// Helper function to format seconds to MM:SS
const formatSecondsToMMSS = (totalSeconds: number): string => {
  if (!isFinite(totalSeconds) || totalSeconds < 0) {
    return "--:--";
  }
  try {
    const date = new Date(0);
    date.setSeconds(totalSeconds);
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } catch (e) {
    console.error("Error formatting seconds to MM:SS:", totalSeconds, e);
    return "!!:!!";
  }
};

const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(({
  src,
  startTime = 0,
  endTime,
  onTimeUpdate,
  onLoadedMetadata,
  onEnded,
  className,
  isAudioSource = false,
  currentClipIndex,
  onPlayStateChange,
  isLooping = false,
}, ref) => {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);

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
  const mediaKey = `${effectiveSrc}-${startTime}-${endTime}-${isAudioSource}`;

  const isYouTube = effectiveSrc?.includes("youtube.com/") || effectiveSrc?.includes("youtu.be/");

  useImperativeHandle(ref, () => ({
    play: () => {
      mediaRef.current?.play().catch(err => console.warn("Imperative play error:", err));
    },
    pause: () => {
      mediaRef.current?.pause();
    },
    getIsPlaying: () => {
      return mediaRef.current ? !mediaRef.current.paused : false;
    },
    getCurrentTime: () => {
      return mediaRef.current ? mediaRef.current.currentTime : 0;
    },
    seek: (time: number) => {
      if (mediaRef.current) {
        mediaRef.current.currentTime = time;
      }
    },
    setPlaybackRate: (rate: number) => {
      if (mediaRef.current) {
        mediaRef.current.playbackRate = rate;
      }
    }
  }));

  const enforceClipBoundaryOnPlay = useCallback(() => {
    const media = mediaRef.current;
    if (!media || isYouTube) {
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
  }, [isYouTube, startTime, endTime]);

  const handleTimeUpdate = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;

    if (onTimeUpdate) {
      onTimeUpdate(media.currentTime);
    }

    if (isYouTube) return;

    if (typeof endTime === 'number' && isFinite(endTime)) {
      const threshold = 0.2;
      if (media.currentTime >= endTime - threshold) {
        if (isLooping) {
          media.currentTime = startTime;
          media.play().catch(error => {
            console.warn("Error attempting to loop playback:", error);
            media.pause();
            media.currentTime = startTime;
          });
        } else {
          media.currentTime = endTime;
          if (!media.paused) {
            media.pause();
          }
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

    if (isLooping) {
      media.currentTime = startTime;
      media.play().catch(error => console.warn("Loop playback error on ended event:", error));
    } else {
      if(typeof endTime === 'number' && isFinite(endTime)){
        media.currentTime = endTime;
      }
      if (onEnded) onEnded();
    }
  }, [isYouTube, startTime, endTime, isLooping, onEnded]);

  const handlePlayEvent = useCallback(() => {
    onPlayStateChange?.(true);
  }, [onPlayStateChange]);

  const handlePauseEvent = useCallback(() => {
    onPlayStateChange?.(false);
  }, [onPlayStateChange]);


  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !effectiveSrc) {
      return;
    }

    const localHandleLoadedMetadata = () => {
      if (!media) return;
      if (onLoadedMetadata) {
        onLoadedMetadata(media.duration);
      }
      media.currentTime = startTime;
      enforceClipBoundaryOnPlay();
      onPlayStateChange?.(!media.paused); // Initial state after metadata load
    };

    media.addEventListener("loadedmetadata", localHandleLoadedMetadata);
    media.addEventListener("timeupdate", handleTimeUpdate);
    media.addEventListener("ended", handleMediaEnded);
    media.addEventListener('play', enforceClipBoundaryOnPlay);
    media.addEventListener('playing', enforceClipBoundaryOnPlay);
    media.addEventListener('play', handlePlayEvent);
    media.addEventListener('pause', handlePauseEvent);

    if (media.currentSrc !== effectiveSrc && media.src !== effectiveSrc) {
        media.src = effectiveSrc;
        media.load();
    } else if (media.readyState >= 1) {
        if(media.currentTime !== startTime) {
            media.currentTime = startTime;
        }
        enforceClipBoundaryOnPlay();
        onPlayStateChange?.(!media.paused); // Reflect current state
    }

    return () => {
      media.removeEventListener("loadedmetadata", localHandleLoadedMetadata);
      media.removeEventListener("timeupdate", handleTimeUpdate);
      media.removeEventListener("ended", handleMediaEnded);
      media.removeEventListener('play', enforceClipBoundaryOnPlay);
      media.removeEventListener('playing', enforceClipBoundaryOnPlay);
      media.removeEventListener('play', handlePlayEvent);
      media.removeEventListener('pause', handlePauseEvent);
    };
  }, [mediaKey, effectiveSrc, startTime, endTime, onTimeUpdate, onLoadedMetadata, onEnded, handleTimeUpdate, handleMediaEnded, enforceClipBoundaryOnPlay, handlePlayEvent, handlePauseEvent, onPlayStateChange]);


  if (!effectiveSrc) {
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
      const embedYTSrc = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(startTime)}${endParam}&autoplay=0&controls=1&rel=0&enablejsapi=1`;
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
    className
  );
  const contentClasses = cn(
    "h-full",
    isAudioSource ? "p-2 flex items-center justify-center" : "p-0 pb-0"
  );


  if (isAudioSource) {
    return (
      <Card className={rootCardClasses}>
        <CardContent className={cn(contentClasses, isAudioSource ? "" : "aspect-video")}>
          <audio key={mediaKey} ref={mediaRef as React.RefObject<HTMLAudioElement>} controls className="w-full">
            Your browser does not support the audio tag.
          </audio>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={rootCardClasses}>
      <CardContent className={cn(contentClasses, !isAudioSource ? "aspect-video" : "")}>
        <video key={mediaKey} ref={mediaRef as React.RefObject<HTMLVideoElement>} controls className="w-full h-full bg-black" playsInline>
          Your browser does not support the video tag.
        </video>
      </CardContent>
    </Card>
  );
});
VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
