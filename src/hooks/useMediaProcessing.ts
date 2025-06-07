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
  const currentProcessingUrlRef = useRef<string | undefined>(undefined);
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

      // Clean up any previous processing URL (not existing media source URLs)
      if (currentProcessingUrlRef.current) {
        URL.revokeObjectURL(currentProcessingUrlRef.current);
        currentProcessingUrlRef.current = undefined;
      }

      const objectUrl = URL.createObjectURL(file);
      currentProcessingUrlRef.current = objectUrl;

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

      if (currentProcessingId !== processingIdRef.current) return;

      const MAX_DURATION_MINUTES = 30;
      if (duration > MAX_DURATION_MINUTES * 60) {
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
      if (currentProcessingUrlRef.current) {
        URL.revokeObjectURL(currentProcessingUrlRef.current);
        currentProcessingUrlRef.current = undefined;
      }
      const objectUrl = URL.createObjectURL(result.file);
      currentProcessingUrlRef.current = objectUrl;

      setYoutubeVideoInfo(result.videoInfo);
      onSuccess(objectUrl, result.videoInfo.title, duration, result.videoInfo);

      // Clear the reference since we're handing off the URL to the media source
      currentProcessingUrlRef.current = undefined;

      toast({
        title: "YouTube Video Processed",
        description: `Successfully processed: ${result.videoInfo.title}`,
      });

    } catch (error) {
      console.error('YouTube processing error:', error);
      toast({
        variant: "destructive",
        title: "YouTube Processing Error",
        description: error instanceof Error ? error.message : "Failed to process YouTube video",
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

      // Try server-side probing first
      const tryServerSideProbing = async () => {
        const response = await fetch('/api/media/probe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Server probe failed with status ${response.status}`);
        }

        const result = await response.json();
        if (!result.success || !result.mediaInfo) {
          throw new Error('Invalid server probe response');
        }

        const { mediaInfo } = result;
        if (!mediaInfo.duration || mediaInfo.duration <= 0) {
          throw new Error('Invalid duration from server probe');
        }

        // Update media type based on server probe results
        if (mediaInfo.hasVideo) {
          resolvedMediaType = 'video';
        } else if (mediaInfo.hasAudio && !mediaInfo.hasVideo) {
          resolvedMediaType = 'audio';
        }

        return mediaInfo.duration;
      };

      // Try client-side loading as fallback
      const tryClientSideLoading = () => {
        return new Promise<number>((clientResolve, clientReject) => {
          const media = resolvedMediaType === 'video' ? document.createElement('video') : document.createElement('audio');
          media.crossOrigin = 'anonymous';
          media.preload = 'metadata';

          const timeout = setTimeout(() => {
            cleanup();
            clientReject(new Error('Client-side metadata loading timed out (20s)'));
          }, 20000);

          const cleanup = () => {
            clearTimeout(timeout);
            media.removeEventListener('loadedmetadata', onMetadata);
            media.removeEventListener('durationchange', onMetadata);
            media.removeEventListener('error', onError);
            media.src = '';
          };

          const onMetadata = (event: Event) => {
            if (media.duration && isFinite(media.duration) && media.duration > 0) {
              cleanup();
              clientResolve(media.duration);
            }
          };

          const onError = () => {
            cleanup();
            const error = (media as any).error;
            let errorMessage = 'Failed to load media from URL.';
            if (error) {
              switch (error.code) {
                case 1: errorMessage = 'Media loading was aborted.'; break;
                case 2: errorMessage = 'A network error occurred. The URL may be invalid or the server may have CORS issues.'; break;
                case 3: errorMessage = 'The media is corrupt or in a format not supported by your browser.'; break;
                case 4: errorMessage = 'Media not supported. The server or network failed, or the format is not supported.'; break;
                default: errorMessage = `An unknown media error occurred (code: ${error.code}).`;
              }
            }
            clientReject(new Error(errorMessage));
          };

          media.addEventListener('loadedmetadata', onMetadata);
          media.addEventListener('durationchange', onMetadata);
          media.addEventListener('error', onError);

          try {
            media.src = url;
          } catch (srcError) {
            cleanup();
            clientReject(new Error('The provided URL is invalid.'));
          }
        });
      };

      let resolvedDuration: number;
      let errorMessages: string[] = [];

      // Try server-side first
      try {
        resolvedDuration = await tryServerSideProbing();
      } catch (serverError) {
        console.warn('Server-side probing failed:', serverError);
        errorMessages.push(`Server-side: ${(serverError as Error).message}`);

        // Try client-side as fallback
        try {
          resolvedDuration = await tryClientSideLoading();
        } catch (clientError) {
          console.warn('Client-side metadata loading failed:', clientError);
          errorMessages.push(`Client-side: ${(clientError as Error).message}`);
          throw new Error(`Failed to load media metadata:\n${errorMessages.join('\n')}`);
        }
      }

      if (currentProcessingId !== processingIdRef.current) return;

      const MAX_DURATION_MINUTES = 30;
      if (resolvedDuration > MAX_DURATION_MINUTES * 60) {
        throw new Error(`Media duration (${Math.round(resolvedDuration / 60)} minutes) exceeds the ${MAX_DURATION_MINUTES}-minute limit.`);
      }

      onSuccess(url, decodedDisplayName, resolvedDuration, resolvedMediaType);

      toast({
        title: "Direct Media URL Added",
        description: `Added "${decodedDisplayName}" from direct URL.`
      });

    } catch (error) {
      console.error('Direct URL processing error:', error);

      let errorTitle = "Media Loading Failed";
      let errorDescription = "Please enter a valid direct media file URL.";

      if (error instanceof Error) {
        const errorMessage = error.message;

        if (errorMessage.includes('CORS') || errorMessage.includes('cross-origin')) {
          errorTitle = "CORS Error";
          errorDescription = "The media server doesn't allow cross-origin requests. Try a different URL or contact the media provider.";
        } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
          errorTitle = "Loading Timeout";
          errorDescription = "The media file is taking too long to load. The server might be slow or the file might be very large.";
        } else if (errorMessage.includes('network error') || errorMessage.includes('HTTP error')) {
          errorTitle = "Network Error";
          errorDescription = "Unable to access the media URL. Check your internet connection and verify the URL is correct.";
        } else if (errorMessage.includes('Invalid data') || errorMessage.includes('corrupt')) {
          errorTitle = "Invalid Media Format";
          errorDescription = "The file format is not supported or the media file is corrupted.";
        } else if (errorMessage.includes('not accessible') || errorMessage.includes('authentication')) {
          errorTitle = "Access Denied";
          errorDescription = "The media file requires authentication or is not publicly accessible.";
        } else if (errorMessage.includes('ffprobe not found')) {
          errorTitle = "Server Configuration Error";
          errorDescription = "The server is not properly configured to handle media files. Please try again later.";
        } else {
          errorDescription = errorMessage;
        }
      }

      toast({
        variant: "destructive",
        title: errorTitle,
        description: errorDescription
      });
    } finally {
      if (currentProcessingId === processingIdRef.current) {
        setIsLoading(false);
        setProcessingStatus("");
      }
    }
  }, [toast]);

  const cleanupObjectUrl = useCallback(() => {
    if (currentProcessingUrlRef.current) {
      URL.revokeObjectURL(currentProcessingUrlRef.current);
      currentProcessingUrlRef.current = undefined;
    }
  }, []);

  const cleanupBlobUrl = useCallback((url: string) => {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }, []);

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
    cleanupObjectUrl,
    cleanupBlobUrl,

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
