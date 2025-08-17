/**
 * Hybrid YouTube download: Extract URLs client-side, stream through server
 * This bypasses IP blocking by using the browser to get URLs and server to download
 */

interface YouTubeVideoData {
  title: string;
  duration: number;
  uploader: string;
  audioUrl: string;
}

interface ProgressCallback {
  (progress: number, status: string): void;
}

// Working public instances (tested and reliable)
const WORKING_INSTANCES = [
  { type: 'piped', url: 'https://piped.video' },
  { type: 'piped', url: 'https://piped.kavin.rocks' },
  { type: 'invidious', url: 'https://invidious.io' },
  { type: 'invidious', url: 'https://yewtu.be' },
  { type: 'piped', url: 'https://api.piped.projectsegfau.lt' }
];

function extractVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Use our CORS proxy for reliable access
async function fetchThroughProxy(url: string): Promise<Response> {
  const proxyUrl = `/api/cors-proxy?url=${encodeURIComponent(url)}`;
  const response = await fetch(proxyUrl);

  if (!response.ok) {
    throw new Error(`Proxy request failed: ${response.status}`);
  }

  return response;
}

async function extractAudioUrlFromPiped(videoId: string, baseUrl: string): Promise<YouTubeVideoData | null> {
  try {
    const apiUrl = `${baseUrl}/api/v1/streams/${videoId}`;
    const response = await fetchThroughProxy(apiUrl);
    const data = await response.json();

    const audioStreams = data?.audioStreams || [];
    if (!audioStreams.length) return null;

    // Sort by quality and get the best audio stream
    audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    const bestAudio = audioStreams[0];

    if (!bestAudio?.url) return null;

    return {
      title: data.title || 'YouTube Audio',
      duration: data.duration || 0,
      uploader: data.uploader || 'Unknown',
      audioUrl: bestAudio.url
    };
  } catch (e) {
    console.warn(`Piped extraction failed for ${baseUrl}:`, e);
    return null;
  }
}

async function extractAudioUrlFromInvidious(videoId: string, baseUrl: string): Promise<YouTubeVideoData | null> {
  try {
    const apiUrl = `${baseUrl}/api/v1/videos/${videoId}`;
    const response = await fetchThroughProxy(apiUrl);
    const data = await response.json();

    const audioStreams = data?.adaptiveFormats?.filter((f: any) => f.type?.includes('audio')) || [];
    if (!audioStreams.length) return null;

    // Sort by quality and get the best audio stream
    audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    const bestAudio = audioStreams[0];

    if (!bestAudio?.url) return null;

    return {
      title: data.title || 'YouTube Audio',
      duration: data.lengthSeconds || 0,
      uploader: data.author || 'Unknown',
      audioUrl: bestAudio.url
    };
  } catch (e) {
    console.warn(`Invidious extraction failed for ${baseUrl}:`, e);
    return null;
  }
}

async function extractAudioUrl(videoId: string, onProgress?: ProgressCallback): Promise<YouTubeVideoData> {
  onProgress?.(0, 'Finding audio stream...');

  // Try each working instance
  for (const instance of WORKING_INSTANCES) {
    try {
      onProgress?.(0, `Trying ${instance.type} API...`);

      let videoData: YouTubeVideoData | null = null;

      if (instance.type === 'piped') {
        videoData = await extractAudioUrlFromPiped(videoId, instance.url);
      } else if (instance.type === 'invidious') {
        videoData = await extractAudioUrlFromInvidious(videoId, instance.url);
      }

      if (videoData) {
        onProgress?.(0, 'Audio stream found!');
        return videoData;
      }
    } catch (e) {
      console.warn(`Instance ${instance.url} failed:`, e);
      continue;
    }
  }

  throw new Error('Could not extract audio URL from any available source');
}

export async function downloadYouTubeAudioHybrid(
  url: string,
  onProgress?: ProgressCallback
): Promise<{ file: File; videoInfo: { title: string; duration: number; uploader: string } }> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  // Step 1: Extract audio URL client-side
  const videoData = await extractAudioUrl(videoId, onProgress);

  // Step 2: Stream through our server (bypasses IP blocking)
  onProgress?.(0, 'Downloading audio through server...');

  const response = await fetch('/api/audio-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audioUrl: videoData.audioUrl,
      title: videoData.title,
      duration: videoData.duration,
      uploader: videoData.uploader
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Server error: ${response.status}`);
  }

  // Step 3: Stream the download with progress
  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength) : 0;

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    chunks.push(value);
    received += value.length;

    if (total > 0) {
      const progress = (received / total) * 100;
      onProgress?.(progress, `Downloading... ${Math.round(progress)}%`);
    } else {
      onProgress?.(0, `Downloaded ${Math.round(received / 1024 / 1024 * 100) / 100} MB...`);
    }
  }

  onProgress?.(100, 'Creating audio file...');

  // Create the file
  const audioBlob = new Blob(chunks, { type: 'audio/mpeg' });
  const sanitizedTitle = videoData.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
  const filename = `${sanitizedTitle}.mp3`;

  const file = new File([audioBlob], filename, {
    type: 'audio/mpeg',
    lastModified: Date.now()
  });

  onProgress?.(100, 'Download complete!');

  return {
    file,
    videoInfo: {
      title: videoData.title,
      duration: videoData.duration,
      uploader: videoData.uploader
    }
  };
}
