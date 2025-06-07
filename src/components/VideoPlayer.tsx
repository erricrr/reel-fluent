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
  seekWithoutBoundaryCheck: (time: number) => void;
  playWithoutBoundaryCheck: () => Promise<void>;
  disableBoundaryEnforcement: () => void;
  enableBoundaryEnforcement: () => void;
}

interface VideoPlayerProps {
  src?: string;
  startTime?: number;
  endTime?: number;
  onTimeUpdate?: (currentTime: number) => void;
  /** Called when playbackRate changes on the media element */
  onPlaybackRateChange?: (rate: number) => void;
  /** The desired playback rate; syncs from parent to media element */
  playbackRate?: number;
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
  onPlaybackRateChange,
  playbackRate = 1,
  onLoadedMetadata,
  onEnded,
  className,
  isAudioSource = false,
  currentClipIndex,
  onPlayStateChange,
  isLooping = false,
}, ref) => {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const isLoopingRef = useRef(isLooping);
  const [boundaryEnforcementEnabled, setBoundaryEnforcementEnabled] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);

  // Sync media element playbackRate to prop on mount and when it changes
  useEffect(() => {
    const media = mediaRef.current;
    if (media && typeof playbackRate === 'number') {
      media.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Update the ref when isLooping changes
  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);

  const getEffectiveSrc = useCallback(() => src, [src]);

  const effectiveSrc = getEffectiveSrc();
  // Key the element on source URL AND timing to ensure proper reset for custom clips
  const mediaKey = `${effectiveSrc}-${startTime}-${endTime}`;

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
    },
    seekWithoutBoundaryCheck: (time: number) => {
      if (mediaRef.current) {
        mediaRef.current.currentTime = time;
      }
    },
    playWithoutBoundaryCheck: async () => {
      if (mediaRef.current) {
        await mediaRef.current.play();
      }
    },
    disableBoundaryEnforcement: () => {
      setBoundaryEnforcementEnabled(false);
    },
    enableBoundaryEnforcement: () => {
      setBoundaryEnforcementEnabled(true);
    }
  }));

  const enforceClipBoundaryOnPlay = useCallback(() => {
    const media = mediaRef.current;
    if (!media || isYouTube || !boundaryEnforcementEnabled) {
      return;
    }
    // Reset to clip start if before start or after end, on any play
    const beforeStart = media.currentTime < startTime;
    const atOrAfterEnd = typeof endTime === 'number' && isFinite(endTime) && media.currentTime >= endTime;
    if (beforeStart || atOrAfterEnd) {
      media.currentTime = startTime;
      if (onTimeUpdate) onTimeUpdate(startTime);
    }
  }, [isYouTube, startTime, endTime, onTimeUpdate, boundaryEnforcementEnabled]);

  const handleTimeUpdate = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;

    if (onTimeUpdate) {
      onTimeUpdate(media.currentTime);
    }

    if (isYouTube || !boundaryEnforcementEnabled) return;

    if (typeof endTime === 'number' && isFinite(endTime)) {
      if (!media.paused && media.currentTime >= endTime) {
        if (isLoopingRef.current) {
          media.currentTime = startTime;
          if (onTimeUpdate) onTimeUpdate(startTime);
          media.play().catch(error => {
            console.warn("Error attempting to loop playback:", error);
            media.pause();
            media.currentTime = startTime;
          });
        } else {
          media.currentTime = endTime;
          media.pause();
          if (onEnded && !isLoopingRef.current) {
            onEnded();
          }
        }
      }
    }
  }, [isYouTube, startTime, endTime, onTimeUpdate, onEnded, boundaryEnforcementEnabled]);

  const handleMediaEnded = useCallback(() => {
    const media = mediaRef.current;
    if (!media || isYouTube) return;

    if (isLoopingRef.current) {
      media.currentTime = startTime;
      if (onTimeUpdate) onTimeUpdate(startTime);
      media.play().catch(error => console.warn("Loop playback error on ended event:", error));
    } else {
      if(typeof endTime === 'number' && isFinite(endTime)){
        media.currentTime = endTime;
      }
      if (onEnded) onEnded();
    }
  }, [isYouTube, startTime, endTime, onEnded]);

  const handlePlayEvent = useCallback(() => {
    onPlayStateChange?.(true);
  }, [onPlayStateChange]);

  const handlePauseEvent = useCallback(() => {
    onPlayStateChange?.(false);
  }, [onPlayStateChange]);

  // Notify parent when playback rate is changed (e.g., via context menu)
  const handleRateChange = useCallback(() => {
    const media = mediaRef.current;
    if (media && onPlaybackRateChange) {
      onPlaybackRateChange(media.playbackRate);
    }
  }, [onPlaybackRateChange]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !effectiveSrc) {
      return;
    }

    // Always reset error state when source changes
    setHasLoadError(false);

    const localHandleLoadedMetadata = () => {
      if (!media) return;
      // Clear any error state when metadata loads successfully
      setHasLoadError(false);
      if (onLoadedMetadata) {
        onLoadedMetadata(media.duration);
      }
      media.currentTime = startTime;
      enforceClipBoundaryOnPlay();
      onPlayStateChange?.(!media.paused); // Initial state after metadata load
    };

    const handleError = (event: Event) => {
      const mediaError = (media as HTMLMediaElement).error;
      console.warn('Media loading error:', {
        event,
        mediaError: mediaError ? {
          code: mediaError.code,
          message: mediaError.message
        } : 'No media error details',
        src: effectiveSrc
      });

      // Only show error UI for actual critical errors
      // Don't show errors for CORS issues or network errors that might resolve
      if (mediaError && mediaError.code === 3) {
        // Code 3 = MEDIA_ERR_DECODE - actual format/corruption issues
        setHasLoadError(true);
      } else if (mediaError && mediaError.code === 4) {
        // Code 4 = MEDIA_ERR_SRC_NOT_SUPPORTED - format not supported
        setHasLoadError(true);
      }
      // Don't show errors for codes 1 (aborted) or 2 (network) as these often resolve
    };

    const handleCanPlay = () => {
      // Clear error state when media can play
      setHasLoadError(false);
    };

    media.addEventListener('ratechange', handleRateChange);
    media.addEventListener("loadedmetadata", localHandleLoadedMetadata);
    media.addEventListener("timeupdate", handleTimeUpdate);
    media.addEventListener("ended", handleMediaEnded);
    media.addEventListener('play', enforceClipBoundaryOnPlay);
    media.addEventListener('playing', enforceClipBoundaryOnPlay);
    media.addEventListener('play', handlePlayEvent);
    media.addEventListener('pause', handlePauseEvent);
    media.addEventListener('error', handleError);
    media.addEventListener('canplay', handleCanPlay);

    // Don't set crossOrigin for direct media URLs
    if (effectiveSrc.includes('youtube.com') || effectiveSrc.includes('youtu.be')) {
      media.crossOrigin = 'anonymous';
    } else {
      media.removeAttribute('crossOrigin');
    }

    // Force reload when switching sources
    media.src = effectiveSrc;
    media.load();

    return () => {
      media.removeEventListener('ratechange', handleRateChange);
      media.removeEventListener("loadedmetadata", localHandleLoadedMetadata);
      media.removeEventListener("timeupdate", handleTimeUpdate);
      media.removeEventListener("ended", handleMediaEnded);
      media.removeEventListener('play', enforceClipBoundaryOnPlay);
      media.removeEventListener('playing', enforceClipBoundaryOnPlay);
      media.removeEventListener('play', handlePlayEvent);
      media.removeEventListener('pause', handlePauseEvent);
      media.removeEventListener('error', handleError);
      media.removeEventListener('canplay', handleCanPlay);
    };
  }, [mediaKey, effectiveSrc, startTime, endTime, onTimeUpdate, onPlaybackRateChange, onLoadedMetadata, onEnded, handleTimeUpdate, handleMediaEnded, enforceClipBoundaryOnPlay, handlePlayEvent, handlePauseEvent, onPlayStateChange, handleRateChange]);


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
                    <audio key={mediaKey}
           ref={mediaRef as React.RefObject<HTMLAudioElement>}
           controls
           className="w-full"
         >
            Your browser does not support the audio tag.
          </audio>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={rootCardClasses}>
      <CardContent className={cn(contentClasses, !isAudioSource ? "aspect-video" : "", "relative")}>
        {isAudioSource ? (
          <audio
            key={mediaKey}
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            controls
            className="w-full"
            playsInline
          >
            Your browser does not support the audio tag.
          </audio>
        ) : (
          <video
            key={mediaKey}
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            controls
            className="w-full h-full bg-black"
            playsInline
          >
            Your browser does not support the video tag.
          </video>
        )}
        {hasLoadError && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4">
            <div className="text-center text-white">
              <p className="text-sm mb-2">⚠️ Media playback error</p>
              <p className="text-xs text-gray-300">
                {(mediaRef.current as HTMLMediaElement)?.error?.code === 2
                  ? "This media source doesn't allow direct playback. Try downloading the file first."
                  : "Unable to play this media file. The format might not be supported or the file might be corrupted."}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
