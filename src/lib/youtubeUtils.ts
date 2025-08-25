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
 * Get video metadata using YouTube oEmbed API
 */
async function getVideoMetadata(url: string): Promise<YouTubeVideoInfo> {
  try {
    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(oEmbedUrl);

    if (!response.ok) {
      throw new Error('Failed to fetch video metadata');
    }

    const data = await response.json();

    // Get additional info using YouTube Data API if available
    const videoId = extractVideoId(url);
    let duration = 0;
    let view_count = 0;

    if (videoId && process.env.NEXT_PUBLIC_YOUTUBE_API_KEY) {
      try {
        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=contentDetails,statistics&key=${process.env.NEXT_PUBLIC_YOUTUBE_API_KEY}`;
        const apiResponse = await fetch(apiUrl);

        if (apiResponse.ok) {
          const apiData = await apiResponse.json();
          if (apiData.items && apiData.items[0]) {
            const item = apiData.items[0];
            // Parse duration (ISO 8601 format)
            const durationStr = item.contentDetails?.duration;
            if (durationStr) {
              const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
              if (match) {
                const hours = parseInt(match[1] || '0');
                const minutes = parseInt(match[2] || '0');
                const seconds = parseInt(match[3] || '0');
                duration = hours * 3600 + minutes * 60 + seconds;
              }
            }
            view_count = parseInt(item.statistics?.viewCount || '0');
          }
        }
      } catch (apiError) {
        console.warn('YouTube Data API failed, using fallback duration:', apiError);
      }
    }

    return {
      title: data.title || 'Unknown Title',
      duration,
      uploader: data.author_name || 'Unknown',
      view_count
    };
  } catch (error) {
    console.error('Error fetching video metadata:', error);
    return {
      title: 'YouTube Audio',
      duration: 0,
      uploader: 'Unknown'
    };
  }
}

/**
 * Download audio from YouTube URL using Railway-compatible approach
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

      onProgress?.(0, attempt === 1 ? "Getting video information..." : `Retrying download (attempt ${attempt}/${maxRetries})...`);

      // Get video metadata first
      const videoInfo = await getVideoMetadata(url);

      onProgress?.(10, "Video information retrieved, preparing download...");

      // Add delay between attempts
      if (attempt > 1) {
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        onProgress?.(10, `Waiting ${backoffDelay / 1000} seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }

      onProgress?.(20, "Downloading audio...");

      // Use our Railway-compatible API
      const response = await fetch('/api/youtube/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(300000) // 5 minute timeout
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
          continue;
        }

        throw new Error(errorMessage);
      }

      onProgress?.(90, "Processing audio file...");

      // Get the audio blob
      const audioBlob = await response.blob();

      console.log('Response details:', {
        status: response.status,
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length'),
        blobSize: audioBlob.size,
        blobType: audioBlob.type
      });

      // Generate filename from title
      const sanitizedTitle = videoInfo.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
      const filename = `${sanitizedTitle}.mp3`;

      onProgress?.(100, "YouTube audio extraction complete!");

      console.log('YouTube audio downloaded successfully:', {
        title: videoInfo.title,
        duration: videoInfo.duration,
        size: Math.round(audioBlob.size / 1024 / 1024 * 100) / 100 + ' MB'
      });

      // Ensure we have a valid duration
      if (videoInfo.duration === 0) {
        console.warn('Duration is 0, attempting to get duration from response headers...');
        const durationHeader = response.headers.get('X-Video-Duration');
        if (durationHeader) {
          videoInfo.duration = parseInt(durationHeader) || 0;
          console.log('Updated duration from headers:', videoInfo.duration);
        }
      }

      // Also get title and uploader from headers if available
      const titleHeader = response.headers.get('X-Video-Title');
      const uploaderHeader = response.headers.get('X-Video-Uploader');

      if (titleHeader) {
        videoInfo.title = decodeURIComponent(titleHeader);
        console.log('Updated title from headers:', videoInfo.title);
      }

      if (uploaderHeader) {
        videoInfo.uploader = decodeURIComponent(uploaderHeader);
        console.log('Updated uploader from headers:', videoInfo.uploader);
      }

      console.log('Final videoInfo:', videoInfo);

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
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('temporary') ||
    message.includes('service unavailable') ||
    message.includes('500') ||
    errorName.includes('timeouterror') ||
    message.includes('signal timed out') ||
    message.includes('fetch')
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

  // Use Railway-compatible download approach
  const result = await downloadYouTubeAudio(url, onProgress);
  const file = createAudioFileFromBlob(result.audioBlob, result.filename);

  return {
    file,
    videoInfo: result.videoInfo
  };
}
