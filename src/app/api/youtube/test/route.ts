import { NextResponse } from 'next/server';

export async function GET() {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
  };

  // Railway-compatible YouTube audio extraction
  diagnostics.youtube_extraction = {
    status: 'Railway-compatible',
    method: 'Piped/Invidious APIs',
    features: [
      'No yt-dlp required',
      'No Python required',
      'Uses external APIs for audio streams',
      'Works on Railway without DMCA concerns'
    ]
  };

  // Test ffmpeg installation (still needed for other audio processing)
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const { stdout: ffmpegVersion } = await execAsync('ffmpeg -version', { timeout: 10000 });
    diagnostics.ffmpeg = {
      status: 'installed',
      version: ffmpegVersion.split('\n')[0],
      path: await execAsync('which ffmpeg', { timeout: 5000 }).then(r => r.stdout.trim()).catch(() => 'not found')
    };
  } catch (error: any) {
    diagnostics.ffmpeg = {
      status: 'error',
      error: error.message
    };
  }

  // Test environment
  diagnostics.environment = {
    path: process.env.PATH || 'not set',
    tempDir: process.env.TEMP_DIR || '/tmp',
    nodeVersion: process.version
  };

  // Test YouTube metadata extraction using oEmbed
  try {
    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(testUrl)}&format=json`;

    const response = await fetch(oEmbedUrl);
    if (response.ok) {
      const data = await response.json();
      diagnostics.youtube_test = {
        status: 'success',
        method: 'YouTube oEmbed API',
        title: data.title || 'Unknown',
        uploader: data.author_name || 'Unknown'
      };
    } else {
      throw new Error(`oEmbed API returned ${response.status}`);
    }
  } catch (error: any) {
    diagnostics.youtube_test = {
      status: 'failed',
      error: error.message,
      method: 'YouTube oEmbed API'
    };
  }

  // Test Piped API availability
  try {
    const testVideoId = 'dQw4w9WgXcQ';
    const pipedUrl = `https://pipedapi.kavin.rocks/api/v1/streams/${testVideoId}`;

    const response = await fetch(pipedUrl, {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (response.ok) {
      const data = await response.json();
      diagnostics.piped_api = {
        status: 'available',
        title: data.title || 'Unknown',
        has_audio_streams: data.audioStreams && data.audioStreams.length > 0
      };
    } else {
      throw new Error(`Piped API returned ${response.status}`);
    }
  } catch (error: any) {
    diagnostics.piped_api = {
      status: 'unavailable',
      error: error.message
    };
  }

  // Test Invidious API availability
  try {
    const testVideoId = 'dQw4w9WgXcQ';
    const invidiousUrl = `https://yewtu.be/api/v1/videos/${testVideoId}`;

    const response = await fetch(invidiousUrl, {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (response.ok) {
      const data = await response.json();
      diagnostics.invidious_api = {
        status: 'available',
        title: data.title || 'Unknown',
        has_audio_formats: data.adaptiveFormats && data.adaptiveFormats.some((f: any) => f.type?.includes('audio'))
      };
    } else {
      throw new Error(`Invidious API returned ${response.status}`);
    }
  } catch (error: any) {
    diagnostics.invidious_api = {
      status: 'unavailable',
      error: error.message
    };
  }

  return NextResponse.json(diagnostics, {
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}
