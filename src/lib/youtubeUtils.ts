// YouTube utility functions for audio extraction and processing

export interface YouTubeVideoInfo {
  title: string;
  duration: number;
  uploader: string;
  view_count?: number;
}

export interface YouTubeAudioResult {
  audioBlob: Blob;
  videoInfo: YouTubeVideoInfo;
  filename: string;
}

// Progress callback type
export type ProgressCallback = (progress: number, status: string) => void;

/**
 * Check if a URL is a valid YouTube URL
 */
export function isYouTubeUrl(url: string): boolean {
  const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)[\w-]+/;
  return youtubeRegex.test(url);
}

/**
 * Extract video ID from YouTube URL
 */
export function extractVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

/**
 * Download audio from YouTube URL with status updates
 */
export async function downloadYouTubeAudio(
  url: string,
  onProgress?: ProgressCallback
): Promise<YouTubeAudioResult> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Downloading YouTube audio for: ${url} (attempt ${attempt}/${maxRetries})`);

            const timeoutMinutes = (attempt * 120000) / 60000; // Convert to minutes
      onProgress?.(0, attempt === 1 ? "Connecting to YouTube..." : `Retrying download (attempt ${attempt}/${maxRetries}, ${timeoutMinutes}min timeout)...`);

      // Add exponential backoff for retries
      if (attempt > 1) {
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
        onProgress?.(0, `Waiting ${backoffDelay / 1000} seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      } else {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      onProgress?.(0, `Downloading and extracting audio (timeout: ${timeoutMinutes}min)...`);

      const response = await fetch('/api/youtube/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
        // Progressive timeout increase: 2 min, 4 min, 6 min
        signal: AbortSignal.timeout(attempt * 120000)
      });

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
          // If response is not JSON, try to get text content
          try {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          } catch (textError) {
            console.warn('Could not parse error response:', parseError);
          }
        }

        // If it's a temporary error, continue to retry
        if (response.status === 500 && attempt < maxRetries) {
          lastError = new Error(errorMessage);

          // For blocking errors, try immediately with shorter delay
          if (errorMessage.includes('blocking automated requests')) {
            console.log('YouTube blocking detected, retrying immediately with shorter delay...');
            await new Promise(resolve => setTimeout(resolve, 1000)); // Just 1 second delay for blocking errors
            continue;
          }

          continue;
        }

        throw new Error(errorMessage);
      }

    onProgress?.(0, "Processing audio file...");

    // Extract video info from headers
    const videoInfo: YouTubeVideoInfo = {
      title: decodeURIComponent(response.headers.get('X-Video-Title') || 'Unknown Title'),
      duration: parseInt(response.headers.get('X-Video-Duration') || '0'),
      uploader: decodeURIComponent(response.headers.get('X-Video-Uploader') || 'Unknown'),
    };

    // Get the audio blob
    const audioBlob = await response.blob();

    // Generate filename from title
    const sanitizedTitle = videoInfo.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const filename = `${sanitizedTitle}.mp3`;

    onProgress?.(0, "YouTube audio extraction complete!");

    console.log('YouTube audio downloaded successfully:', {
      title: videoInfo.title,
      duration: videoInfo.duration,
      size: Math.round(audioBlob.size / 1024 / 1024 * 100) / 100 + ' MB'
    });

    return {
      audioBlob,
      videoInfo,
      filename
    };

    } catch (error: any) {
      console.error(`YouTube download attempt ${attempt} failed:`, error);
      lastError = error instanceof Error ? error : new Error(error.message || 'Failed to download YouTube audio');

      // If this is the last attempt or it's not a retryable error, throw immediately
      if (attempt === maxRetries || !isRetryableError(lastError)) {
        throw lastError;
      }

      // Otherwise continue to next attempt
    }
  }

  // If we reach here, all retries failed
  throw lastError || new Error('YouTube download failed after multiple attempts');
}

// Helper function to determine if an error is retryable
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();
  return (
    message.includes('blocking automated requests') ||
    message.includes('500') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('temporary') ||
    errorName.includes('timeouterror') ||
    message.includes('signal timed out')
  );
}

/**
 * Convert YouTube audio blob to File object for processing
 */
export function createAudioFileFromBlob(audioBlob: Blob, filename: string): File {
  return new File([audioBlob], filename, {
    type: 'audio/mpeg',
    lastModified: Date.now()
  });
}

/**
 * Process YouTube URL and return File object ready for audio processing
 */
export async function processYouTubeUrl(
  url: string,
  onProgress?: ProgressCallback
): Promise<{ file: File; videoInfo: YouTubeVideoInfo }> {
  if (!isYouTubeUrl(url)) {
    throw new Error('Invalid YouTube URL');
  }

    // Use server-side download directly (client-side has CORS issues)
  const result = await downloadYouTubeAudio(url, onProgress);
  const file = createAudioFileFromBlob(result.audioBlob, result.filename);

  return {
    file,
    videoInfo: result.videoInfo
  };
}
