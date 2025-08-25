import { NextRequest, NextResponse } from 'next/server';

interface YouTubeDownloadRequest {
  url: string;
}

// Extract YouTube Video ID
function extractVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Get video metadata using YouTube oEmbed API
async function getVideoMetadata(url: string): Promise<{ title: string; duration: number; uploader?: string }> {
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

    if (videoId && process.env.YOUTUBE_API_KEY) {
      try {
        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=contentDetails,statistics&key=${process.env.YOUTUBE_API_KEY}`;
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
          }
        }
      } catch (apiError) {
        console.warn('YouTube Data API failed, using fallback duration:', apiError);
      }
    }

    return {
      title: data.title || 'Unknown Title',
      duration,
      uploader: data.author_name || 'Unknown'
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

// Get audio stream using Piped API (Railway-compatible)
async function getAudioStream(videoId: string): Promise<{ streamUrl: string; title: string; duration: number; uploader?: string } | null> {
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://piped-api.hostux.net',
    'https://piped.video',
    'https://pipedapi.palveluntarjoaja.eu',
    'https://piped-api.orkiv.com',
    'https://piped-api.r4fo.com',
    'https://piped.moomoo.me',
    'https://piped.garudalinux.org',
    'https://api.piped.projectsegfau.lt',
    'https://pipedapi.adminforge.de'
  ];

  for (const base of pipedInstances) {
    try {
      console.log(`Trying Piped instance: ${base}`);
      const cacheBuster = Date.now();
      const streamsUrl = `${base}/api/v1/streams/${videoId}?cb=${cacheBuster}`;
      const metaUrl = `${base}/api/v1/videos/${videoId}?cb=${cacheBuster}`;

      console.log(`Fetching streams from: ${streamsUrl}`);
      const streamsResp = await fetch(streamsUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      if (!streamsResp.ok) {
        console.warn(`Piped streams request failed for ${base}:`, streamsResp.status, streamsResp.statusText);
        continue;
      }

      const streams = await streamsResp.json();
      console.log(`Streams response from ${base}:`, {
        hasAudioStreams: !!streams?.audioStreams,
        audioStreamsCount: streams?.audioStreams?.length || 0,
        title: streams?.title
      });

      const audioStreams: Array<any> = streams?.audioStreams || [];
      if (!audioStreams.length) {
        console.warn(`No audio streams found for ${base}`);
        continue;
      }

      // Sort by quality, prefer higher bitrate
      audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const best = audioStreams[0];
      const streamUrl: string = best?.url;

      if (!streamUrl) {
        console.warn(`No stream URL found for ${base}`);
        continue;
      }

      console.log(`Found audio stream from ${base}:`, {
        bitrate: best.bitrate,
        url: streamUrl.substring(0, 50) + '...'
      });

      const title: string = streams?.title || 'YouTube Audio';
      const duration: number = Number(streams?.duration ?? 0);
      const uploader: string | undefined = streams?.uploader;

      console.log(`Successfully got audio info from ${base}:`, { title, duration, uploader });
      return { streamUrl, title, duration, uploader };
    } catch (e) {
      console.warn(`Piped instance ${base} failed:`, (e as any)?.message || e);
      continue;
    }
  }

  console.log('All Piped instances failed');
  return null;
}

// Get audio stream using Invidious API as fallback
async function getAudioStreamInvidious(videoId: string): Promise<{ streamUrl: string; title: string; duration: number; uploader?: string } | null> {
  const invidiousInstances = [
    'https://yewtu.be', // Most reliable
    'https://invidious.kavin.rocks',
    'https://vid.puffyan.us',
    'https://invidious.namazso.eu',
    'https://invidious.zapashcanon.fr',
    'https://invidious.lunar.icu',
    'https://invidious.projectsegfau.lt',
    'https://invidious.flokinet.to'
  ];

  for (const base of invidiousInstances) {
    try {
      console.log(`Trying Invidious instance: ${base}`);
      const cacheBuster = Date.now();
      const apiUrl = `${base}/api/v1/videos/${videoId}?cb=${cacheBuster}`;

      console.log(`Fetching from Invidious: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        console.warn(`Invidious API request failed for ${base}:`, response.status, response.statusText);
        continue;
      }

      const data = await response.json();
      console.log(`Invidious response from ${base}:`, {
        title: data?.title,
        hasAdaptiveFormats: !!data?.adaptiveFormats,
        adaptiveFormatsCount: data?.adaptiveFormats?.length || 0
      });

      const audioStreams = data?.adaptiveFormats?.filter((f: any) => f.type?.includes('audio')) || [];

      if (!audioStreams.length) {
        console.warn(`No audio formats found for ${base}`);
        continue;
      }

      // Sort by quality, prefer higher bitrate
      audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      const best = audioStreams[0];
      const streamUrl = best?.url;

      if (!streamUrl) {
        console.warn(`No stream URL found for ${base}`);
        continue;
      }

      console.log(`Found audio stream from Invidious ${base}:`, {
        bitrate: best.bitrate,
        url: streamUrl.substring(0, 50) + '...'
      });

      const title = data?.title || 'YouTube Audio';
      const duration = Number(data?.lengthSeconds || 0);
      const uploader = data?.author;

      console.log(`Successfully got audio info from Invidious ${base}:`, { title, duration, uploader });
      return { streamUrl, title, duration, uploader };
    } catch (e) {
      console.warn(`Invidious instance ${base} failed:`, (e as any)?.message || e);
      continue;
    }
  }

  console.log('All Invidious instances failed');
  return null;
}

// Alternative audio stream approach using different method
async function getAlternativeAudioStream(videoId: string): Promise<{ streamUrl: string; title: string; duration: number; uploader?: string } | null> {
  try {
    console.log('Trying alternative audio stream approach...');

    // Try using a different Piped instance with different parameters
    const alternativeInstances = [
      'https://pipedapi.kavin.rocks',
      'https://piped.video'
    ];

    for (const base of alternativeInstances) {
      try {
        const streamsUrl = `${base}/api/v1/streams/${videoId}`;
        console.log(`Trying alternative approach with: ${streamsUrl}`);

        const response = await fetch(streamsUrl, {
          redirect: 'follow',
          signal: AbortSignal.timeout(15000) // Shorter timeout
        });

        if (response.ok) {
          const data = await response.json();
          const audioStreams = data?.audioStreams || [];

          if (audioStreams.length > 0) {
            const best = audioStreams[0];
            return {
              streamUrl: best.url,
              title: data.title || 'YouTube Audio',
              duration: Number(data.duration || 0),
              uploader: data.uploader
            };
          }
        }
      } catch (e) {
        console.warn(`Alternative approach failed for ${base}:`, e);
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error('Alternative audio stream approach failed:', error);
    return null;
  }
}

// yt-dlp fallback for local development only
async function tryYtDlpFallback(url: string): Promise<{ streamUrl: string; title: string; duration: number; uploader?: string } | null> {
  try {
    console.log('Attempting yt-dlp fallback...');

    // Dynamically import child_process to avoid issues in production
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Check if yt-dlp is available
    try {
      await execAsync('which yt-dlp', { timeout: 5000 });
    } catch (error) {
      console.log('yt-dlp not available for fallback');
      return null;
    }

        // Try to get video info with yt-dlp
    const command = [
      'yt-dlp',
      '--dump-json',
      '--no-download',
      '--geo-bypass',
      '--extractor-args', 'youtube:player_client=web',
      '--user-agent', '"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"',
      '--referer', '"https://www.youtube.com/"',
      '--no-warnings',
      '--ignore-errors',
      `"${url}"`
    ].join(' ');

    const { stdout } = await execAsync(command, { timeout: 60000 });
    const info = JSON.parse(stdout);

    console.log('yt-dlp fallback successful:', {
      title: info.title,
      duration: info.duration,
      uploader: info.uploader,
      duration_formatted: info.duration_string,
      full_info_keys: Object.keys(info)
    });

    // For yt-dlp fallback, we'll return a mock stream URL that indicates success
    // The actual download will be handled differently
    return {
      streamUrl: `yt-dlp-fallback://${url}`, // Special marker for yt-dlp fallback
      title: info.title || 'YouTube Audio',
      duration: info.duration || 0,
      uploader: info.uploader || 'Unknown'
    };

  } catch (error) {
    console.error('yt-dlp fallback failed:', error);
    return null;
  }
}

// Download audio using yt-dlp for fallback
async function downloadWithYtDlp(url: string): Promise<Buffer> {
  try {
    console.log('Downloading audio with yt-dlp...');

    // Dynamically import required modules
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const fs = await import('fs/promises');
    const path = await import('path');
    const execAsync = promisify(exec);

    // Create temporary directory
    const tempDir = process.env.TEMP_DIR || '/tmp';
    const timestamp = Date.now();
    const outputPath = path.join(tempDir, `yt_dlp_${timestamp}`);

    // Download audio with yt-dlp
    const command = [
      'yt-dlp',
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '192K',
      '--no-playlist',
      '--output', `"${outputPath}.%(ext)s"`,
      '--geo-bypass',
      '--user-agent', '"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"',
      '--referer', '"https://www.youtube.com/"',
      '--no-warnings',
      '--ignore-errors',
      `"${url}"`
    ].join(' ');

    await execAsync(command, { timeout: 300000 }); // 5 minute timeout

    // Read the downloaded file
    const mp3Path = `${outputPath}.mp3`;
    const buffer = await fs.readFile(mp3Path);

    // Clean up
    try {
      await fs.unlink(mp3Path);
    } catch (cleanupError) {
      console.warn('Failed to clean up temporary file:', cleanupError);
    }

    return buffer;

  } catch (error) {
    console.error('yt-dlp download failed:', error);
    throw new Error('Failed to download audio with yt-dlp');
  }
}

const MAX_DURATION = 1800; // 30 minutes max duration

// Validate YouTube URL
function isValidYouTubeUrl(url: string): boolean {
  const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)[\w-]+/;
  return youtubeRegex.test(url);
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: YouTubeDownloadRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { url } = body;

    // Validate URL
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'Valid YouTube URL is required' },
        { status: 400 }
      );
    }

    if (!isValidYouTubeUrl(url)) {
      return NextResponse.json(
        { error: 'Invalid YouTube URL format' },
        { status: 400 }
      );
    }

    console.log('Processing YouTube URL:', url);

    // Get video metadata first
    const videoInfo = await getVideoMetadata(url);

    // Check duration limit
    if (videoInfo.duration > MAX_DURATION) {
      return NextResponse.json(
        { error: `Video duration (${Math.round(videoInfo.duration / 60)} minutes) exceeds maximum allowed duration (${MAX_DURATION / 60} minutes)` },
        { status: 400 }
      );
    }

    // Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json(
        { error: 'Could not extract video ID from URL' },
        { status: 400 }
      );
    }

        // Try to get audio stream with detailed logging
    console.log('Attempting to get audio stream for video ID:', videoId);

    let audioInfo = await getAudioStream(videoId);

    // If Piped fails, try Invidious
    if (!audioInfo) {
      console.log('Piped failed, trying Invidious...');
      audioInfo = await getAudioStreamInvidious(videoId);
    }

    // If both fail, try a simple test with a known working video
    if (!audioInfo) {
      console.log('Both Piped and Invidious failed, trying test video...');
      const testVideoId = 'dQw4w9WgXcQ'; // Rick Roll - should always work
      audioInfo = await getAudioStream(testVideoId);

      if (audioInfo) {
        console.log('Test video works, but target video failed. This suggests the target video might be restricted.');
        return NextResponse.json(
          { error: 'This video appears to be restricted or unavailable. Please try a different YouTube video.' },
          { status: 404 }
        );
      } else {
        console.log('Even test video failed. API services might be down.');

        // Try one more fallback - use a different approach
        try {
          console.log('Trying alternative approach with direct YouTube API...');
          const alternativeAudioInfo = await getAlternativeAudioStream(videoId);
          if (alternativeAudioInfo) {
            audioInfo = alternativeAudioInfo;
          } else {
            // Final fallback: try yt-dlp if available (for local development)
            if (process.env.NODE_ENV === 'development') {
              console.log('Trying yt-dlp fallback for local development...');
              const ytDlpAudioInfo = await tryYtDlpFallback(url);
              if (ytDlpAudioInfo) {
                audioInfo = ytDlpAudioInfo;
              } else {
                return NextResponse.json(
                  { error: 'YouTube audio extraction services are temporarily unavailable. Please try again later or use a different video.' },
                  { status: 503 }
                );
              }
            } else {
              return NextResponse.json(
                { error: 'YouTube audio extraction services are temporarily unavailable. Please try again later or use a different video.' },
                { status: 503 }
              );
            }
          }
        } catch (fallbackError) {
          console.error('Alternative approach also failed:', fallbackError);
          return NextResponse.json(
            { error: 'YouTube audio extraction services are temporarily unavailable. Please try again later or use a different video.' },
            { status: 503 }
          );
        }
      }
    }

        // Ensure we have audio info
    if (!audioInfo) {
      return NextResponse.json(
        { error: 'Failed to retrieve audio information' },
        { status: 500 }
      );
    }

    // Handle yt-dlp fallback case
    if (audioInfo.streamUrl.startsWith('yt-dlp-fallback://')) {
      console.log('Using yt-dlp fallback for actual download...');
      const actualUrl = audioInfo.streamUrl.replace('yt-dlp-fallback://', '');
      const buffer = await downloadWithYtDlp(actualUrl);

      // Generate filename
      const sanitizedTitle = audioInfo.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
      const filename = `${sanitizedTitle}.mp3`;

      console.log('Audio downloaded successfully with yt-dlp:', {
        title: audioInfo.title,
        duration: audioInfo.duration,
        size: Math.round(buffer.length / 1024 / 1024 * 100) / 100 + ' MB'
      });

      // Return the audio file
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': buffer.length.toString(),
          'Content-Disposition': `attachment; filename="${filename}"`,
          'X-Video-Title': encodeURIComponent(audioInfo.title),
          'X-Video-Duration': audioInfo.duration.toString(),
          'X-Video-Uploader': encodeURIComponent(audioInfo.uploader || ''),
          'Access-Control-Expose-Headers': 'X-Video-Title, X-Video-Duration, X-Video-Uploader',
        },
      });
    }

    // Download the audio stream
    console.log('Downloading audio stream from:', audioInfo.streamUrl);

    const audioResponse = await fetch(audioInfo.streamUrl, {
      signal: AbortSignal.timeout(300000) // 5 minute timeout
    });

    if (!audioResponse.ok) {
      return NextResponse.json(
        { error: `Failed to download audio stream: ${audioResponse.status}` },
        { status: 500 }
      );
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const buffer = Buffer.from(audioBuffer);

    // Generate filename
    const sanitizedTitle = audioInfo.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const filename = `${sanitizedTitle}.mp3`;

    console.log('Audio downloaded successfully:', {
      title: audioInfo.title,
      duration: audioInfo.duration,
      size: Math.round(buffer.length / 1024 / 1024 * 100) / 100 + ' MB'
    });

    // Return the audio file
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Video-Title': encodeURIComponent(audioInfo.title),
        'X-Video-Duration': audioInfo.duration.toString(),
        'X-Video-Uploader': encodeURIComponent(audioInfo.uploader || ''),
        'Access-Control-Expose-Headers': 'X-Video-Title, X-Video-Duration, X-Video-Uploader',
      },
    });

  } catch (error: any) {
    console.error('YouTube download error:', error);

    // Return appropriate error response
    const statusCode = error.message.includes('duration') ? 400 : 500;
    return NextResponse.json(
      {
        error: error.message || 'Failed to download YouTube audio',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: statusCode }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'YouTube Audio Download API (Railway-Compatible)',
    version: '2.0.0',
    maxDuration: `${MAX_DURATION / 60} minutes`,
    supportedFormats: ['mp3'],
    usage: 'POST with { "url": "https://youtube.com/watch?v=..." }',
    features: [
      'Railway-compatible (no yt-dlp or ffmpeg)',
      'Uses Piped and Invidious APIs',
      'Client-side audio extraction',
      'YouTube oEmbed metadata'
    ]
  });
}
