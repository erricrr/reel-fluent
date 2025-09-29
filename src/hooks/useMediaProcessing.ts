import { useState, useCallback, useRef } from 'react';
import { useToast } from './use-toast';

export interface MediaProcessingState {
  isLoading: boolean;
  isSaving: boolean;
  processingStatus: string;
}

export function useMediaProcessing() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");

  const processingIdRef = useRef<number>(0);
  const { toast } = useToast();

  const resetProcessingState = useCallback(() => {
    setIsLoading(false);
    setIsSaving(false);
    setProcessingStatus("");
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

      // Use CORS proxy for external URLs to avoid CORS issues
      const getDuration = (): Promise<number> => {
        return new Promise((resolve, reject) => {
          const media = resolvedMediaType === 'video' ? document.createElement('video') : document.createElement('audio');
          media.preload = 'metadata';
          media.crossOrigin = 'anonymous';

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

          const onError = (error: Event) => {
            cleanup();
            reject(new Error('Failed to load media metadata - this may be due to CORS restrictions'));
          };

          media.addEventListener('loadedmetadata', onMetadata);
          media.addEventListener('error', onError);

          // Try direct URL first, then fall back to CORS proxy if needed
          media.src = url;
        });
      };

      let duration: number;
      let finalUrl = url;

      try {
        duration = await getDuration();
      } catch (error) {
        // Try with CORS proxy as fallback
        const proxyUrl = `/api/cors-proxy?url=${encodeURIComponent(url)}`;
        const proxyDuration = await new Promise<number>((resolve, reject) => {
          const media = resolvedMediaType === 'video' ? document.createElement('video') : document.createElement('audio');
          media.preload = 'metadata';
          media.crossOrigin = 'anonymous';

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

          const onError = (error: Event) => {
            cleanup();
            reject(new Error('Failed to load media even through CORS proxy'));
          };

          media.addEventListener('loadedmetadata', onMetadata);
          media.addEventListener('error', onError);
          media.src = proxyUrl;
        });

        duration = proxyDuration;
        finalUrl = proxyUrl;
      }

      if (currentProcessingId !== processingIdRef.current) return;

      const MAX_DURATION_MINUTES = 30;
      if (duration > MAX_DURATION_MINUTES * 60) {
        throw new Error(`Media duration (${Math.round(duration / 60)} minutes) exceeds the ${MAX_DURATION_MINUTES}-minute limit.`);
      }

      onSuccess(finalUrl, decodedDisplayName, duration, resolvedMediaType);

      toast({
        title: "Direct Media URL Added",
        description: `Added "${decodedDisplayName}" from direct URL.`
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

      // Provide more specific error messages based on the error type
      let userFriendlyMessage = "Please enter a valid direct media file URL.";
      let title = "Media Loading Failed";

      if (errorMessage.includes('CORS proxy')) {
        title = "Media Access Restricted";
        userFriendlyMessage = "This media file cannot be accessed due to server restrictions. Try a different URL or upload the file directly.";
      } else if (errorMessage.includes('Invalid media duration')) {
        title = "Invalid Media File";
        userFriendlyMessage = "The media file appears to be corrupted or invalid. Please try a different file.";
      } else if (errorMessage.includes('Failed to load media metadata')) {
        title = "Media Loading Error";
        userFriendlyMessage = "Unable to load the media file. Please check the URL and try again.";
      }

      toast({
        variant: "destructive",
        title,
        description: userFriendlyMessage
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
    processingStatus,
    processingIdRef,

    // Actions
    processFile,
    processDirectUrl,
    resetProcessingState,

    // Setters
    setIsLoading,
    setIsSaving,
    setProcessingStatus,

    // Computed
    globalAppBusyState: isLoading || isSaving,
  };
}
