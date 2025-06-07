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
  const [isLoading, setIsLoading] = useState(true);
  const playRequestRef = useRef<Promise<void> | null>(null);
  const isReadyRef = useRef(false);
  const startTimeRef = useRef(startTime);
  const endTimeRef = useRef(endTime);
  const currentSrcRef = useRef<string>('');
  const listenersAttachedRef = useRef(false);

  const getEffectiveSrc = useCallback(() => src, [src]);
  const effectiveSrc = getEffectiveSrc();

  // Update refs when props change
  useEffect(() => {
    startTimeRef.current = startTime;
    endTimeRef.current = endTime;
    isLoopingRef.current = isLooping;
  }, [startTime, endTime, isLooping]);

  // Debug logging function
  const debugLog = useCallback((message: string, ...args: any[]) => {
    console.log(`[VideoPlayer] ${message}`, ...args);
  }, []);

  const ensureMediaReady = useCallback(async () => {
    const media = mediaRef.current;
    if (!media) return false;

    // If media is already ready, return true
    if (isReadyRef.current && media.readyState >= 2) return true;

    debugLog("Waiting for media to be ready...");
    // Wait for media to be ready
    return new Promise<boolean>((resolve) => {
      const handleCanPlay = () => {
        isReadyRef.current = true;
        media.removeEventListener('canplay', handleCanPlay);
        debugLog("Media is now ready (canplay event)");
        resolve(true);
      };

      if (media.readyState >= 2) {
        isReadyRef.current = true;
        debugLog("Media is already ready (readyState >= 2)");
        resolve(true);
      } else {
        media.addEventListener('canplay', handleCanPlay);
      }
    });
  }, [debugLog]);

  // Sync media element playbackRate to prop on mount and when it changes
  useEffect(() => {
    const media = mediaRef.current;
    if (media && typeof playbackRate === 'number') {
      media.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const isYouTube = effectiveSrc?.includes("youtube.com/") || effectiveSrc?.includes("youtu.be/");

  useImperativeHandle(ref, () => ({
    play: async () => {
      const media = mediaRef.current;
      if (!media) {
        debugLog("Cannot play - media ref is null");
        return;
      }

      try {
        const currentStartTime = startTimeRef.current;
        debugLog("Attempting to play media", { startTime: currentStartTime, endTime: endTimeRef.current });

        // Ensure media is ready before attempting to play
        const isReady = await ensureMediaReady();
        if (!isReady) {
          debugLog("Media not ready for playback");
          return;
        }

        // Cancel any existing play request
        if (playRequestRef.current) {
          await playRequestRef.current.catch(() => {});
        }

        // Set the current time before playing - use ref for latest value
        const currentTime = media.currentTime;
        const beforeStart = currentTime < currentStartTime;
        const atOrAfterEnd = typeof endTimeRef.current === 'number' &&
                             isFinite(endTimeRef.current) &&
                             currentTime >= endTimeRef.current;

        // Only reset position if outside boundaries
        if (beforeStart || atOrAfterEnd) {
          media.currentTime = currentStartTime;
          debugLog("Reset currentTime to startTime:", currentStartTime);
        } else {
          debugLog("Continuing from current time:", currentTime);
        }

        // Start new play request
        playRequestRef.current = media.play();
        await playRequestRef.current;
        debugLog("Media playback started successfully");
      } catch (err) {
        debugLog("Play error:", err);
        if (err instanceof Error && err.name === 'AbortError') {
          // If we get an abort error, try playing one more time after a short delay
          await new Promise(resolve => setTimeout(resolve, 100));
          if (media) {
            try {
              // Don't change time on retry unless needed
              const currentTime = media.currentTime;
              const currentStartTime = startTimeRef.current;
              const beforeStart = currentTime < currentStartTime;
              const atOrAfterEnd = typeof endTimeRef.current === 'number' &&
                                   isFinite(endTimeRef.current) &&
                                   currentTime >= endTimeRef.current;

              if (beforeStart || atOrAfterEnd) {
                media.currentTime = currentStartTime;
                debugLog("Retry: Reset currentTime to startTime:", currentStartTime);
              }

              await media.play();
              debugLog("Retry: Media playback started successfully");
            } catch (retryErr) {
              debugLog("Retry play error:", retryErr);
            }
          }
        } else {
          debugLog("Other play error:", err);
        }
      }
    },
    pause: () => {
      const media = mediaRef.current;
      if (!media) {
        debugLog("Cannot pause - media ref is null");
        return;
      }

      debugLog("Pausing media playback");
      // Don't change the currentTime when pausing
      media.pause();

      // Force the UI update
      if (onPlayStateChange) {
        onPlayStateChange(false);
      }
    },
    getIsPlaying: () => {
      const isPlaying = mediaRef.current ? !mediaRef.current.paused : false;
      debugLog("getIsPlaying called, returning:", isPlaying);
      return isPlaying;
    },
    getCurrentTime: () => {
      return mediaRef.current ? mediaRef.current.currentTime : 0;
    },
    seek: (time: number) => {
      if (mediaRef.current) {
        debugLog("Seeking to:", time);
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
        debugLog("Seeking without boundary check to:", time);
        mediaRef.current.currentTime = time;
      }
    },
    playWithoutBoundaryCheck: async () => {
      const media = mediaRef.current;
      if (media) {
        try {
          debugLog("Playing without boundary check");
          await media.play();
        } catch (err) {
          debugLog("Error in playWithoutBoundaryCheck:", err);
        }
      }
    },
    disableBoundaryEnforcement: () => {
      debugLog("Boundary enforcement disabled");
      setBoundaryEnforcementEnabled(false);
    },
    enableBoundaryEnforcement: () => {
      debugLog("Boundary enforcement enabled");
      setBoundaryEnforcementEnabled(true);
    }
  }), [ensureMediaReady, debugLog, onPlayStateChange]);

  const enforceClipBoundaryOnPlay = useCallback(() => {
    const media = mediaRef.current;
    if (!media || isYouTube || !boundaryEnforcementEnabled) {
      return;
    }

    const currentStartTime = startTimeRef.current;
    const currentEndTime = endTimeRef.current;

    // Reset to clip start if before start or after end, on any play
    const beforeStart = media.currentTime < currentStartTime;
    const atOrAfterEnd = typeof currentEndTime === 'number' && isFinite(currentEndTime) && media.currentTime >= currentEndTime;

    debugLog("Enforcing clip boundary on play", {
      currentTime: media.currentTime,
      startTime: currentStartTime,
      endTime: currentEndTime,
      beforeStart,
      atOrAfterEnd
    });

    if (beforeStart || atOrAfterEnd) {
      media.currentTime = currentStartTime;
      if (onTimeUpdate) onTimeUpdate(currentStartTime);
      debugLog("Reset to startTime:", currentStartTime);
    }
  }, [isYouTube, onTimeUpdate, boundaryEnforcementEnabled, debugLog]);

  const handleTimeUpdate = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;

    if (onTimeUpdate) {
      onTimeUpdate(media.currentTime);
    }

    if (isYouTube || !boundaryEnforcementEnabled) return;

    const currentEndTime = endTimeRef.current;
    if (typeof currentEndTime === 'number' && isFinite(currentEndTime)) {
      if (!media.paused && media.currentTime >= currentEndTime) {
        debugLog("Media reached endTime:", { currentTime: media.currentTime, endTime: currentEndTime });

        if (isLoopingRef.current) {
          const currentStartTime = startTimeRef.current;
          debugLog("Looping back to startTime:", currentStartTime);
          media.currentTime = currentStartTime;
          if (onTimeUpdate) onTimeUpdate(currentStartTime);
          media.play().catch(error => {
            debugLog("Error attempting to loop playback:", error);
            media.pause();
            media.currentTime = currentStartTime;
            if (onPlayStateChange) {
              onPlayStateChange(false);
            }
          });
        } else {
          debugLog("Stopping at endTime:", currentEndTime);
          media.pause();
          // Do not reset currentTime here - keep it at the actual time
          if (onPlayStateChange) {
            onPlayStateChange(false);
          }
          if (onEnded) {
            debugLog("Calling onEnded callback");
            onEnded();
          }
        }
      }
    }
  }, [isYouTube, onTimeUpdate, onEnded, boundaryEnforcementEnabled, onPlayStateChange, debugLog]);

  const handleMediaEnded = useCallback(() => {
    const media = mediaRef.current;
    if (!media || isYouTube) return;

    debugLog("Media ended event triggered");

    if (isLoopingRef.current) {
      const currentStartTime = startTimeRef.current;
      debugLog("Looping back to startTime on ended event:", currentStartTime);
      media.currentTime = currentStartTime;
      if (onTimeUpdate) onTimeUpdate(currentStartTime);
      media.play().catch(error => {
        debugLog("Loop playback error on ended event:", error);
        if (onPlayStateChange) {
          onPlayStateChange(false);
        }
      });
    } else {
      const currentEndTime = endTimeRef.current;
      if(typeof currentEndTime === 'number' && isFinite(currentEndTime)){
        debugLog("Setting to endTime on ended event:", currentEndTime);
        // Don't change the time - let it end naturally
      }
      media.pause();
      if (onPlayStateChange) {
        onPlayStateChange(false);
      }
      if (onEnded) {
        debugLog("Calling onEnded callback from ended event");
        onEnded();
      }
    }
  }, [isYouTube, onEnded, onTimeUpdate, onPlayStateChange, debugLog]);

  const handlePlayEvent = useCallback(() => {
    debugLog("Play event triggered");
    onPlayStateChange?.(true);
  }, [onPlayStateChange, debugLog]);

  const handlePauseEvent = useCallback(() => {
    debugLog("Pause event triggered");
    onPlayStateChange?.(false);
  }, [onPlayStateChange, debugLog]);

  // Notify parent when playback rate is changed (e.g., via context menu)
  const handleRateChange = useCallback(() => {
    const media = mediaRef.current;
    if (media && onPlaybackRateChange) {
      onPlaybackRateChange(media.playbackRate);
    }
  }, [onPlaybackRateChange]);

  // Attach event listeners once and keep them
  useEffect(() => {
    const media = mediaRef.current;
    if (!media || listenersAttachedRef.current) {
      return;
    }

    debugLog("Attaching event listeners");

    const localHandleLoadedMetadata = () => {
      if (!media) return;
      debugLog("Metadata loaded, duration:", media.duration);

      // Use the ref values to ensure we have the latest values
      media.currentTime = startTimeRef.current;
      debugLog("Set initial currentTime to startTime:", startTimeRef.current);

      if (onLoadedMetadata) {
        onLoadedMetadata(media.duration);
      }
      enforceClipBoundaryOnPlay();
      onPlayStateChange?.(!media.paused);

      setIsLoading(false);
      isReadyRef.current = true;
    };

    const handleCanPlay = () => {
      debugLog("Can play event triggered");
      setIsLoading(false);
      isReadyRef.current = true;
      setHasLoadError(false);
    };

    const handleError = (event: Event) => {
      const mediaError = (media as HTMLMediaElement).error;
      debugLog('Media loading error:', {
        event,
        mediaError: mediaError ? {
          code: mediaError.code,
          message: mediaError.message
        } : 'No media error details',
        src: effectiveSrc
      });

      // Only show error UI for actual critical errors
      if (mediaError && (mediaError.code === 3 || mediaError.code === 4)) {
        setHasLoadError(true);
      }
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

    listenersAttachedRef.current = true;

    return () => {
      debugLog("Cleaning up event listeners");
      playRequestRef.current = null;
      listenersAttachedRef.current = false;
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
  }, [handleRateChange, handleTimeUpdate, handleMediaEnded, enforceClipBoundaryOnPlay, handlePlayEvent, handlePauseEvent, onLoadedMetadata, onPlayStateChange, debugLog]);

  // Handle source changes separately
  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !effectiveSrc) {
      return;
    }

    // Only reload the source if it actually changed
    const srcChanged = currentSrcRef.current !== effectiveSrc;

    if (srcChanged) {
      debugLog("Source changed, loading new source:", effectiveSrc);

      setIsLoading(true);
      isReadyRef.current = false;
      setHasLoadError(false);
      currentSrcRef.current = effectiveSrc;

      // Don't set crossOrigin for direct media URLs
      if (effectiveSrc.includes('youtube.com') || effectiveSrc.includes('youtu.be')) {
        media.crossOrigin = 'anonymous';
      } else {
        media.removeAttribute('crossOrigin');
      }

      // Force reload when switching sources
      media.src = effectiveSrc;
      media.load();
    }
  }, [effectiveSrc, debugLog]);

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
                    <audio
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
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            controls
            className="w-full"
            playsInline
          >
            Your browser does not support the audio tag.
          </audio>
        ) : (
          <video
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
