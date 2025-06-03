import { useState, useCallback, useRef } from 'react';
import { useToast } from './use-toast';
import { isYouTubeUrl, processYouTubeUrl as processYTUrl, type YouTubeVideoInfo, type ProgressCallback } from '@/lib/youtubeUtils';

export interface MediaProcessingState {
  isLoading: boolean;
  isSaving: boolean;
  isYouTubeProcessing: boolean;
  processingProgress: number;
  processingStatus: string;
  youtubeVideoInfo: YouTubeVideoInfo | null;
}

export function useMediaProcessing() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isYouTubeProcessing, setIsYouTubeProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [youtubeVideoInfo, setYoutubeVideoInfo] = useState<YouTubeVideoInfo | null>(null);

  const processingIdRef = useRef<number>(0);
  const currentProcessingUrlRef = useRef<string | undefined>(undefined);
  const { toast } = useToast();

  const resetProcessingState = useCallback(() => {
    setIsLoading(false);
    setIsSaving(false);
    setIsYouTubeProcessing(false);
    setProcessingProgress(0);
    setProcessingStatus("");
    setYoutubeVideoInfo(null);
  }, []);

  const createProgressCallback = useCallback((processingId: number): ProgressCallback => {
    return (progress: number, status: string) => {
      // Only update if this is still the current processing operation
      if (processingId === processingIdRef.current) {
        setProcessingProgress(progress);
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
      setProcessingProgress(0);
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
      setProcessingProgress(100);

      const mediaType = file.type.startsWith('video/') ? 'video' : 'audio';
      onSuccess(objectUrl, file.name, duration, mediaType);

      // Clear the reference since we're handing off the URL to the media source
      currentProcessingUrlRef.current = undefined;

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
      setProcessingProgress(0);
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
    processingProgress,
    processingStatus,
    youtubeVideoInfo,
    processingIdRef,

    // Actions
    processFile,
    processYouTubeUrl,
    resetProcessingState,
    cleanupObjectUrl,
    cleanupBlobUrl,

    // Setters
    setIsLoading,
    setIsSaving,
    setIsYouTubeProcessing,
    setProcessingProgress,
    setProcessingStatus,
    setYoutubeVideoInfo,

    // Computed
    globalAppBusyState: isLoading || isSaving || isYouTubeProcessing,
  };
}
