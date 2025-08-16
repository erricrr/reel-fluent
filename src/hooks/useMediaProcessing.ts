import { useState, useCallback, useRef } from 'react';
import { useToast } from './use-toast';
import { isYouTubeUrl, processYouTubeUrl as processYTUrl, type YouTubeVideoInfo, type ProgressCallback } from '@/lib/youtubeUtils';

export interface MediaProcessingState {
  isLoading: boolean;
  isSaving: boolean;
  isYouTubeProcessing: boolean;
  processingStatus: string;
  youtubeVideoInfo: YouTubeVideoInfo | null;
}

export function useMediaProcessing() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isYouTubeProcessing, setIsYouTubeProcessing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [youtubeVideoInfo, setYoutubeVideoInfo] = useState<YouTubeVideoInfo | null>(null);

  const processingIdRef = useRef<number>(0);
  const { toast } = useToast();

  const resetProcessingState = useCallback(() => {
    setIsLoading(false);
    setIsSaving(false);
    setIsYouTubeProcessing(false);
    setProcessingStatus("");
    setYoutubeVideoInfo(null);
  }, []);

  const createProgressCallback = useCallback((processingId: number): ProgressCallback => {
    return (_progress: number, status: string) => {
      // Only update if this is still the current processing operation
      if (processingId === processingIdRef.current) {
        setProcessingStatus(status);
      }
    };
  }, []);

  const processFile = useCallback(async (
    file: File,
    onSuccess: (src: string, displayName: string, duration: number, type: 'video' | 'audio') => void
  ) => {
    const currentProcessingId = ++processingIdRef.current;

    try {
      setIsLoading(true);
      setProcessingStatus("Loading file...");

      // Create object URL for this file
      const objectUrl = URL.createObjectURL(file);

      // Get media duration
      const getDuration = (): Promise<number> => {
        return new Promise((resolve, reject) => {
          const media = file.type.startsWith('video/')
            ? document.createElement('video')
            : document.createElement('audio');

          media.preload = 'metadata';
          media.onloadedmetadata = () => {
            const duration = media.duration;
            if (isNaN(duration) || duration <= 0) {
              reject(new Error('Invalid media duration'));
            } else {
              resolve(duration);
            }
          };
          media.onerror = () => reject(new Error('Failed to load media metadata'));
          media.src = objectUrl;
        });
      };

      const duration = await getDuration();

      if (currentProcessingId !== processingIdRef.current) {
        // If processing was cancelled, clean up this URL
        URL.revokeObjectURL(objectUrl);
        return;
      }

      const MAX_DURATION_MINUTES = 30;
      if (duration > MAX_DURATION_MINUTES * 60) {
        URL.revokeObjectURL(objectUrl);
        throw new Error(`Media duration (${Math.round(duration / 60)} minutes) exceeds the ${MAX_DURATION_MINUTES}-minute limit.`);
      }

      setProcessingStatus("Media loaded successfully");

      const mediaType = file.type.startsWith('video/') ? 'video' : 'audio';
      onSuccess(objectUrl, file.name, duration, mediaType);

    } catch (error) {
      console.error('File processing error:', error);
      toast({
        variant: "destructive",
        title: "File Processing Error",
        description: error instanceof Error ? error.message : "Failed to process the file",
      });
    } finally {
      if (currentProcessingId === processingIdRef.current) {
        setIsLoading(false);
        setProcessingStatus("");
      }
    }
  }, [toast]);

  const processYouTubeUrl = useCallback(async (
    url: string,
    onSuccess: (src: string, displayName: string, duration: number, videoInfo: YouTubeVideoInfo) => void
  ) => {
    if (!isYouTubeUrl(url)) {
      toast({
        variant: "destructive",
        title: "Invalid URL",
        description: "Please enter a valid YouTube URL",
      });
      return;
    }

    // Prevent multiple simultaneous processing of the same URL
    if (isYouTubeProcessing) {
      console.warn('YouTube processing already in progress, skipping duplicate request');
      return;
    }

    const currentProcessingId = ++processingIdRef.current;

    try {
      setIsYouTubeProcessing(true);
      setProcessingStatus("Initializing YouTube download...");

      const progressCallback = createProgressCallback(currentProcessingId);
      const result = await processYTUrl(url, progressCallback);

      if (currentProcessingId !== processingIdRef.current) return;

      // Use the duration from videoInfo
      const duration = result.videoInfo.duration;
      const MAX_DURATION_MINUTES = 30;
      if (duration > MAX_DURATION_MINUTES * 60) {
        throw new Error(`Video duration (${Math.round(duration / 60)} minutes) exceeds the ${MAX_DURATION_MINUTES}-minute limit.`);
      }

      // Create object URL from the file
      const objectUrl = URL.createObjectURL(result.file);

      setYoutubeVideoInfo(result.videoInfo);
      onSuccess(objectUrl, result.videoInfo.title, duration, result.videoInfo);

      toast({
        title: "YouTube Video Processed",
        description: `Successfully processed: ${result.videoInfo.title}`,
      });

    } catch (error) {
      console.error('YouTube processing error:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to process YouTube video";

      // Provide more helpful error messages based on the error type
      let userFriendlyMessage = errorMessage;
      let title = "YouTube Processing Error";

      if (errorMessage.includes('blocking automated requests')) {
        title = "YouTube Temporarily Unavailable";
        userFriendlyMessage = "YouTube is temporarily blocking automated requests. This usually resolves in a few minutes. Please try again shortly or try a different video.";
      } else if (errorMessage.includes('Video unavailable')) {
        title = "Video Unavailable";
        userFriendlyMessage = "This video is unavailable, private, or has been removed.";
      } else if (errorMessage.includes('duration') && errorMessage.includes('exceeds')) {
        title = "Video Too Long";
        userFriendlyMessage = errorMessage;
      } else if (errorMessage.includes('Invalid YouTube URL')) {
        title = "Invalid URL";
        userFriendlyMessage = "Please enter a valid YouTube URL.";
      } else if (errorMessage.includes('timeout')) {
        title = "Download Timeout";
        userFriendlyMessage = "The download took too long. Please try again or try a shorter video.";
      }

      toast({
        variant: "destructive",
        title,
        description: userFriendlyMessage,
      });
    } finally {
      if (currentProcessingId === processingIdRef.current) {
        setIsYouTubeProcessing(false);
      }
    }
  }, [toast, createProgressCallback, isYouTubeProcessing]);

  const processDirectUrl = useCallback(async (
    url: string,
    onSuccess: (src: string, displayName: string, duration: number, type: 'video' | 'audio') => void
  ) => {
    const currentProcessingId = ++processingIdRef.current;

    try {
      setIsLoading(true);
      setProcessingStatus("Loading media...");

      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop() || 'Media File';
      const decodedDisplayName = decodeURIComponent(filename);

      const extension = pathname.toLowerCase().split('.').pop() || '';
      const isVideoExtension = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(extension);
      const isAudioExtension = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(extension);

      // Default to video if we can't determine from extension
      let resolvedMediaType: 'video' | 'audio' = 'video';
      if (isAudioExtension) {
        resolvedMediaType = 'audio';
      } else if (isVideoExtension) {
        resolvedMediaType = 'video';
      }

      // Simple client-side loading
      const getDuration = (): Promise<number> => {
        return new Promise((resolve, reject) => {
          const media = resolvedMediaType === 'video' ? document.createElement('video') : document.createElement('audio');
          media.preload = 'metadata';

          const cleanup = () => {
            media.removeEventListener('loadedmetadata', onMetadata);
            media.removeEventListener('error', onError);
            media.src = '';
          };

          const onMetadata = () => {
            const duration = media.duration;
            cleanup();
            if (isNaN(duration) || duration <= 0) {
              reject(new Error('Invalid media duration'));
            } else {
              resolve(duration);
            }
          };

          const onError = () => {
            cleanup();
            reject(new Error('Failed to load media metadata'));
          };

          media.addEventListener('loadedmetadata', onMetadata);
          media.addEventListener('error', onError);
          media.src = url;
        });
      };

      const duration = await getDuration();

      if (currentProcessingId !== processingIdRef.current) return;

      const MAX_DURATION_MINUTES = 30;
      if (duration > MAX_DURATION_MINUTES * 60) {
        throw new Error(`Media duration (${Math.round(duration / 60)} minutes) exceeds the ${MAX_DURATION_MINUTES}-minute limit.`);
      }

      onSuccess(url, decodedDisplayName, duration, resolvedMediaType);

      toast({
        title: "Direct Media URL Added",
        description: `Added "${decodedDisplayName}" from direct URL.`
      });

    } catch (error) {
      console.error('Direct URL processing error:', error);
      toast({
        variant: "destructive",
        title: "Media Loading Failed",
        description: "Please enter a valid direct media file URL."
      });
    } finally {
      if (currentProcessingId === processingIdRef.current) {
        setIsLoading(false);
        setProcessingStatus("");
      }
    }
  }, [toast]);

  return {
    // State
    isLoading,
    isSaving,
    isYouTubeProcessing,
    processingStatus,
    youtubeVideoInfo,
    processingIdRef,

    // Actions
    processFile,
    processYouTubeUrl,
    processDirectUrl,
    resetProcessingState,

    // Setters
    setIsLoading,
    setIsSaving,
    setIsYouTubeProcessing,
    setProcessingStatus,
    setYoutubeVideoInfo,

    // Computed
    globalAppBusyState: isLoading || isSaving || isYouTubeProcessing,
  };
}
