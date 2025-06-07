import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface MediaInfo {
  duration: number;
  format: string;
  hasVideo: boolean;
  hasAudio: boolean;
}

// Probe media file using ffprobe
async function probeMedia(url: string): Promise<MediaInfo> {
  const command = [
    'ffprobe',
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    url // Remove quotes as they can cause issues with URLs
  ].join(' ');

  console.log('Executing ffprobe command:', command);

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: 30 * 1000, // 30 second timeout
      maxBuffer: 1024 * 1024, // 1MB buffer
      env: {
        ...process.env,
        PATH: process.env.PATH // Ensure ffprobe is in PATH
      }
    });

    if (stderr) {
      console.log('ffprobe stderr:', stderr);
    }

    const probeResult = JSON.parse(stdout);

    if (!probeResult.format) {
      throw new Error('No format information found');
    }

    const duration = parseFloat(probeResult.format.duration || '0');
    const format = probeResult.format.format_name || 'unknown';

    let hasVideo = false;
    let hasAudio = false;

    if (probeResult.streams && Array.isArray(probeResult.streams)) {
      for (const stream of probeResult.streams) {
        if (stream.codec_type === 'video') {
          hasVideo = true;
        } else if (stream.codec_type === 'audio') {
          hasAudio = true;
        }
      }
    }

    return {
      duration,
      format,
      hasVideo,
      hasAudio
    };
  } catch (error: any) {
    console.error('ffprobe error:', error);

    // Provide more specific error messages
    if (error.code === 'ENOENT') {
      throw new Error('ffprobe not found. Please ensure ffmpeg is installed on the server.');
    }
    if (error.signal === 'SIGTERM') {
      throw new Error('Media probing timed out. The URL might be slow or inaccessible.');
    }
    if (error.stderr && error.stderr.includes('Invalid data found')) {
      throw new Error('Invalid media format. The URL might not point to a valid media file.');
    }
    if (error.stderr && error.stderr.includes('No such file or directory')) {
      throw new Error('Media file not accessible. The URL might be invalid or require authentication.');
    }
    if (error.stderr && error.stderr.includes('HTTP error')) {
      throw new Error('HTTP error accessing the media URL. The server might be blocking requests or the URL might be invalid.');
    }
    if (error.stderr && error.stderr.includes('Protocol not found')) {
      throw new Error('Protocol not supported. Please ensure the URL uses http:// or https://');
    }

    throw new Error(`Failed to probe media: ${error.message}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    // Validate input
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'Valid media URL is required' },
        { status: 400 }
      );
    }

    // Check if URL is a blob URL (not supported server-side)
    if (url.startsWith('blob:')) {
      return NextResponse.json(
        { error: 'Blob URLs are not supported for server-side probing.' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (urlError) {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    console.log('Probing media URL:', url.substring(0, 100) + '...');

    const mediaInfo = await probeMedia(url);

    console.log('Media probe successful:', {
      url: url.substring(0, 100) + '...',
      duration: mediaInfo.duration,
      format: mediaInfo.format,
      hasVideo: mediaInfo.hasVideo,
      hasAudio: mediaInfo.hasAudio
    });

    const response = NextResponse.json({
      success: true,
      mediaInfo
    });

    // Add CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return response;

    } catch (error: any) {
    console.error('Media probe error:', error);

    const errorResponse = NextResponse.json(
      {
        error: error.message || 'Failed to probe media',
        success: false
      },
      { status: 500 }
    );

    // Add CORS headers to error response too
    errorResponse.headers.set('Access-Control-Allow-Origin', '*');
    errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return errorResponse;
  }
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
