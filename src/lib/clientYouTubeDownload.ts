/**
 * Client-side YouTube audio download using public APIs
 * This bypasses server-side blocking by downloading directly in the browser
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

// CORS proxy services (free, no registration required)
const CORS_PROXIES = [
  '/api/cors-proxy?url=', // Our own CORS proxy (most reliable)
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://thingproxy.freeboard.io/fetch/'
];

// Public Piped instances
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.hostux.net',
  'https://pipedapi.palveluntarjoaja.eu',
  'https://piped-api.orkiv.com'
];

// Public Invidious instances
const INVIDIOUS_INSTANCES = [
  'https://yewtu.be',
  'https://invidious.kavin.rocks',
  'https://vid.puffyan.us',
  'https://invidious.namazso.eu'
];

function extractVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

async function fetchWithCORS(url: string): Promise<Response> {
  // Try direct fetch first (might work if CORS is properly configured)
  try {
    const response = await fetch(url, {
      mode: 'cors',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (response.ok) return response;
  } catch (e) {
    // CORS blocked, try proxies
  }

  // Try CORS proxies
  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (response.ok) {
        return response;
      }
    } catch (e) {
      console.warn(`CORS proxy ${proxy} failed:`, e);
      continue;
    }
  }

  throw new Error('All CORS proxies failed');
}

async function getVideoDataFromPiped(videoId: string): Promise<YouTubeVideoData | null> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const url = `${instance}/api/v1/streams/${videoId}`;
      const response = await fetchWithCORS(url);

      if (!response.ok) continue;

      const data = await response.json();
      const audioStreams = data?.audioStreams || [];

      if (!audioStreams.length) continue;

      // Sort by quality and get the best audio stream
      audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      const bestAudio = audioStreams[0];

      if (!bestAudio?.url) continue;

      return {
        title: data.title || 'YouTube Audio',
        duration: data.duration || 0,
        uploader: data.uploader || 'Unknown',
        audioUrl: bestAudio.url
      };
    } catch (e) {
      console.warn(`Piped instance ${instance} failed:`, e);
      continue;
    }
  }
  return null;
}

async function getVideoDataFromInvidious(videoId: string): Promise<YouTubeVideoData | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/videos/${videoId}`;
      const response = await fetchWithCORS(url);

      if (!response.ok) continue;

      const data = await response.json();
      const audioStreams = data?.adaptiveFormats?.filter((f: any) => f.type?.includes('audio')) || [];

      if (!audioStreams.length) continue;

      // Sort by quality and get the best audio stream
      audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      const bestAudio = audioStreams[0];

      if (!bestAudio?.url) continue;

      return {
        title: data.title || 'YouTube Audio',
        duration: data.lengthSeconds || 0,
        uploader: data.author || 'Unknown',
        audioUrl: bestAudio.url
      };
    } catch (e) {
      console.warn(`Invidious instance ${instance} failed:`, e);
      continue;
    }
  }
  return null;
}

async function downloadAudioFromUrl(audioUrl: string, filename: string, onProgress?: ProgressCallback): Promise<File> {
  onProgress?.(0, 'Downloading audio stream...');

  try {
    // Try direct download first
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status}`);
    }

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
      }
    }

    onProgress?.(100, 'Creating audio file...');

    // Combine all chunks into a single blob
    // Detect content type from response or URL
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const audioBlob = new Blob(chunks, { type: contentType });

    return new File([audioBlob], filename, {
      type: 'audio/mpeg', // Always return as MP3 for consistency
      lastModified: Date.now()
    });
  } catch (error) {
    // If direct download fails, try with CORS proxy
    onProgress?.(0, 'Retrying with proxy...');

    for (const proxy of CORS_PROXIES) {
      try {
        const proxyUrl = `${proxy}${encodeURIComponent(audioUrl)}`;
        const response = await fetch(proxyUrl);

        if (!response.ok) continue;

        const audioBlob = await response.blob();

        return new File([audioBlob], filename, {
          type: 'audio/mpeg',
          lastModified: Date.now()
        });
      } catch (e) {
        console.warn(`Proxy download failed with ${proxy}:`, e);
        continue;
      }
    }

    throw new Error('Failed to download audio from all sources');
  }
}

export async function downloadYouTubeAudioClient(
  url: string,
  onProgress?: ProgressCallback
): Promise<{ file: File; videoInfo: { title: string; duration: number; uploader: string } }> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  onProgress?.(0, 'Finding audio stream...');

  // Try Piped first
  let videoData = await getVideoDataFromPiped(videoId);

  if (!videoData) {
    onProgress?.(0, 'Trying alternative API...');
    // Try Invidious as fallback
    videoData = await getVideoDataFromInvidious(videoId);
  }

  if (!videoData) {
    throw new Error('Could not find audio stream. The video might be unavailable or region-locked.');
  }

  // Generate filename
  const sanitizedTitle = videoData.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
  const filename = `${sanitizedTitle}.mp3`;

  // Download the audio
  const file = await downloadAudioFromUrl(videoData.audioUrl, filename, onProgress);

  onProgress?.(100, 'Audio download complete!');

  return {
    file,
    videoInfo: {
      title: videoData.title,
      duration: videoData.duration,
      uploader: videoData.uploader
    }
  };
}

// Fallback: Use YouTube's oEmbed API for basic metadata when streams aren't available
export async function getYouTubeMetadata(url: string): Promise<{ title: string; uploader: string }> {
  try {
    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetchWithCORS(oEmbedUrl);

    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title || 'YouTube Video',
        uploader: data.author_name || 'Unknown'
      };
    }
  } catch (e) {
    console.warn('Failed to get YouTube metadata:', e);
  }

  return {
    title: 'YouTube Video',
    uploader: 'Unknown'
  };
}
