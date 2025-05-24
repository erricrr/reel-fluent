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
  try {
    console.log('Downloading YouTube audio for:', url);

    onProgress?.(0, "Connecting to YouTube...");
    await new Promise(resolve => setTimeout(resolve, 500));

    onProgress?.(0, "Downloading and extracting audio... (this may take 10-30 seconds)");

    const response = await fetch('/api/youtube/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
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
    console.error('Error downloading YouTube audio:', error);
    throw new Error(error.message || 'Failed to download YouTube audio');
  }
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

  const result = await downloadYouTubeAudio(url, onProgress);
  const file = createAudioFileFromBlob(result.audioBlob, result.filename);

  return {
    file,
    videoInfo: result.videoInfo
  };
}
