import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

interface YouTubeDownloadRequest {
  url: string;
}

const TEMP_DIR = process.env.TEMP_DIR || path.join(process.env.NODE_ENV === 'production' ? '/tmp' : process.cwd(), 'temp-downloads');
const MAX_DURATION = 1800; // 30 minutes max duration

// Ensure temp directory exists
async function ensureTempDir() {
  if (!existsSync(TEMP_DIR)) {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  }
}

// Validate YouTube URL
function isValidYouTubeUrl(url: string): boolean {
  const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)[\w-]+/;
  return youtubeRegex.test(url);
}

// Clean up old temp files (older than 1 hour)
async function cleanupOldFiles() {
  try {
    const files = await fs.readdir(TEMP_DIR);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        if (stats.mtime.getTime() < oneHourAgo) {
          await fs.unlink(filePath);
          console.log(`Cleaned up old file: ${file}`);
        }
      } catch (error) {
        console.error(`Error checking file ${file}:`, error);
      }
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Get video info without downloading
async function getVideoInfo(url: string) {
  try {
    // First check if yt-dlp is available
    try {
      await execAsync('which yt-dlp', { timeout: 5000 });
    } catch (error) {
      console.error('yt-dlp not found in PATH');
      throw new Error('yt-dlp is not installed or not available in PATH. Please contact support.');
    }

    // Try to get version to ensure it's working
    try {
      const { stdout: versionOutput } = await execAsync('yt-dlp --version', { timeout: 10000 });
      console.log('yt-dlp version:', versionOutput.trim());
    } catch (error) {
      console.error('yt-dlp version check failed:', error);
      throw new Error('yt-dlp is installed but not functioning properly. Please contact support.');
    }

    // Server-friendly approach without browser cookies
    const approaches = [
      {
        name: 'Enhanced headers with delays',
        command: [
          'yt-dlp',
          '--user-agent', '"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"',
          '--referer', '"https://www.youtube.com/"',
          '--extractor-retries', '5',
          '--socket-timeout', '30',
          '--no-check-certificates',
          '--sleep-interval', '3',
          '--max-sleep-interval', '8',
          '--add-header', '"Accept-Language:en-US,en;q=0.9"',
          '--add-header', '"Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"',
          '--add-header', '"Accept-Encoding:gzip, deflate, br"',
          '--add-header', '"DNT:1"',
          '--add-header', '"Upgrade-Insecure-Requests:1"',
          '--add-header', '"Sec-Fetch-Dest:document"',
          '--add-header', '"Sec-Fetch-Mode:navigate"',
          '--add-header', '"Sec-Fetch-Site:none"',
          '--add-header', '"Sec-Fetch-User:?1"',
          '--dump-json',
          `"${url}"`
        ]
      },
      {
        name: 'Fallback with different user agent',
        command: [
          'yt-dlp',
          '--user-agent', '"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"',
          '--referer', '"https://www.youtube.com/"',
          '--extractor-retries', '3',
          '--socket-timeout', '45',
          '--no-check-certificates',
          '--sleep-interval', '5',
          '--max-sleep-interval', '10',
          '--add-header', '"Accept:*/*"',
          '--add-header', '"Accept-Language:en-US,en;q=0.5"',
          '--dump-json',
          `"${url}"`
        ]
      },
      {
        name: 'Basic approach',
        command: [
          'yt-dlp',
          '--user-agent', '"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"',
          '--extractor-retries', '2',
          '--socket-timeout', '60',
          '--sleep-interval', '8',
          '--max-sleep-interval', '15',
          '--dump-json',
          `"${url}"`
        ]
      }
    ];

    let lastError: any = null;

    for (const approach of approaches) {
      try {
        const command = approach.command.join(' ');
        console.log(`Trying approach: ${approach.name}`);
        console.log('Command:', command);

        const { stdout } = await execAsync(command, { timeout: 60000 }); // 60 second timeout
        const info = JSON.parse(stdout);

        console.log(`Success with approach: ${approach.name}`);
        return {
          title: info.title || 'Unknown Title',
          duration: info.duration || 0,
          uploader: info.uploader || 'Unknown',
          view_count: info.view_count || 0
        };
      } catch (error: any) {
        console.log(`Failed with approach: ${approach.name}`, error.message);
        lastError = error;

        // Add delay between attempts to avoid rate limiting
        if (approach !== approaches[approaches.length - 1]) {
          console.log('Waiting 5 seconds before trying next approach...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }

    // If we get here, all approaches failed
    console.error('All approaches failed. Last error:', lastError);

    // Check for specific yt-dlp availability errors first
    if (lastError?.message?.includes('yt-dlp is not installed') || lastError?.message?.includes('not functioning properly')) {
      throw lastError;
    }

    if (lastError?.code === 'ENOENT') {
      throw new Error('yt-dlp is not installed or not available in PATH. Please contact support.');
    }

    // Handle bot detection specifically
    if (lastError?.stderr && (
      lastError.stderr.includes('Sign in to confirm you\'re not a bot') ||
      lastError.stderr.includes('bot') ||
      lastError.stderr.includes('automated') ||
      lastError.stderr.includes('unusual traffic') ||
      lastError.stderr.includes('403') ||
      lastError.stderr.includes('HTTP Error 403')
    )) {
      throw new Error('YouTube is currently blocking automated requests. This is a temporary issue from YouTube\'s side. Please try again in a few minutes or try a different video.');
    }

    if (lastError?.stderr && lastError.stderr.includes('Video unavailable')) {
      throw new Error('Video is unavailable or private');
    }
    if (lastError?.stderr && lastError.stderr.includes('Sign in to confirm your age')) {
      throw new Error('Video requires age verification');
    }
    if (lastError?.stderr && lastError.stderr.includes('This video is not available')) {
      throw new Error('Video is not available in your region');
    }
    if (lastError?.signal === 'SIGTERM') {
      throw new Error('Request timed out while getting video information');
    }
    throw new Error('Failed to get video information. Please check the URL and try again.');
  } catch (error: any) {
    console.error('Error getting video info:', error);
    throw error;
  }
}

// Download audio using yt-dlp
async function downloadAudio(url: string, outputPath: string) {
  // Ensure yt-dlp is available before attempting download
  try {
    await execAsync('which yt-dlp', { timeout: 5000 });
  } catch (error) {
    console.error('yt-dlp not found in PATH during download');
    throw new Error('yt-dlp is not installed or not available in PATH. Please contact support.');
  }

  // Server-friendly approaches without browser cookies
  const approaches = [
    {
      name: 'Enhanced download with delays',
      command: [
        'yt-dlp',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K',
        '--no-playlist',
        '--user-agent', '"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"',
        '--referer', '"https://www.youtube.com/"',
        '--extractor-retries', '5',
        '--socket-timeout', '30',
        '--no-check-certificates',
        '--sleep-interval', '3',
        '--max-sleep-interval', '8',
        '--add-header', '"Accept-Language:en-US,en;q=0.9"',
        '--add-header', '"Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"',
        '--add-header', '"Accept-Encoding:gzip, deflate, br"',
        '--add-header', '"DNT:1"',
        '--add-header', '"Upgrade-Insecure-Requests:1"',
        '--add-header', '"Sec-Fetch-Dest:document"',
        '--add-header', '"Sec-Fetch-Mode:navigate"',
        '--add-header', '"Sec-Fetch-Site:none"',
        '--add-header', '"Sec-Fetch-User:?1"',
        '--match-filters', `"duration < ${MAX_DURATION}"`,
        '--output', `"${outputPath}.%(ext)s"`,
        `"${url}"`
      ]
    },
    {
      name: 'Fallback download approach',
      command: [
        'yt-dlp',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K',
        '--no-playlist',
        '--user-agent', '"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"',
        '--referer', '"https://www.youtube.com/"',
        '--extractor-retries', '3',
        '--socket-timeout', '45',
        '--no-check-certificates',
        '--sleep-interval', '5',
        '--max-sleep-interval', '10',
        '--add-header', '"Accept:*/*"',
        '--add-header', '"Accept-Language:en-US,en;q=0.5"',
        '--match-filters', `"duration < ${MAX_DURATION}"`,
        '--output', `"${outputPath}.%(ext)s"`,
        `"${url}"`
      ]
    },
    {
      name: 'Basic download approach',
      command: [
        'yt-dlp',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K',
        '--no-playlist',
        '--user-agent', '"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"',
        '--extractor-retries', '2',
        '--socket-timeout', '60',
        '--sleep-interval', '8',
        '--max-sleep-interval', '15',
        '--match-filters', `"duration < ${MAX_DURATION}"`,
        '--output', `"${outputPath}.%(ext)s"`,
        `"${url}"`
      ]
    }
  ];

  let lastError: any = null;

  for (const approach of approaches) {
    try {
      const command = approach.command.join(' ');
      console.log(`Trying download approach: ${approach.name}`);
      console.log('Command:', command);

      const { stdout, stderr } = await execAsync(command, {
        timeout: 12 * 60 * 1000, // 12 minute timeout (increased for downloads)
        maxBuffer: 1024 * 1024 * 30 // 30MB buffer (increased)
      });

      console.log('yt-dlp stdout:', stdout);
      if (stderr) {
        console.log('yt-dlp stderr:', stderr);
      }

      console.log(`Success with download approach: ${approach.name}`);
      return `${outputPath}.mp3`;

    } catch (error: any) {
      console.log(`Failed with download approach: ${approach.name}`, error.message);
      lastError = error;

      // Add delay between attempts to avoid rate limiting
      if (approach !== approaches[approaches.length - 1]) {
        console.log('Waiting 10 seconds before trying next download approach...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  }

  // If we get here, all approaches failed
  console.error('All download approaches failed. Last error:', lastError);

  if (lastError?.code === 'ENOENT') {
    throw new Error('yt-dlp not found. Please ensure yt-dlp is installed.');
  }
  if (lastError?.signal === 'SIGTERM') {
    throw new Error('Download timed out. The video might be too long or unavailable.');
  }

  // Handle bot detection specifically
  if (lastError?.stderr && (
    lastError.stderr.includes('Sign in to confirm you\'re not a bot') ||
    lastError.stderr.includes('bot') ||
    lastError.stderr.includes('automated') ||
    lastError.stderr.includes('unusual traffic') ||
    lastError.stderr.includes('403') ||
    lastError.stderr.includes('HTTP Error 403')
  )) {
    throw new Error('YouTube is currently blocking automated requests. This is a temporary issue from YouTube\'s side. Please try again in a few minutes or try a different video.');
  }

  if (lastError?.stderr && lastError.stderr.includes('Video unavailable')) {
    throw new Error('Video is unavailable or private');
  }
  if (lastError?.stderr && lastError.stderr.includes('Sign in to confirm your age')) {
    throw new Error('Video requires age verification');
  }
  if (lastError?.stderr && lastError.stderr.includes('This video is not available')) {
    throw new Error('Video is not available in your region');
  }

  // Log the full error for debugging
  console.error('Full yt-dlp error details:', {
    code: lastError?.code,
    signal: lastError?.signal,
    stdout: lastError?.stdout,
    stderr: lastError?.stderr,
    message: lastError?.message
  });

  throw new Error(`Failed to download audio: ${lastError?.message || 'Unknown error'}`);
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

    // Ensure temp directory exists
    await ensureTempDir();

    // Clean up old files
    await cleanupOldFiles();

    // Get video info first
    console.log('Getting video info for:', url);
    const videoInfo = await getVideoInfo(url);

    // Check duration limit
    if (videoInfo.duration > MAX_DURATION) {
      return NextResponse.json(
        { error: `Video duration (${Math.round(videoInfo.duration / 60)} minutes) exceeds maximum allowed duration (${MAX_DURATION / 60} minutes)` },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedTitle = videoInfo.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const outputPath = path.join(TEMP_DIR, `youtube_${sanitizedTitle}_${timestamp}`);

    console.log('Downloading audio to:', outputPath);

    // Download audio
    const audioFilePath = await downloadAudio(url, outputPath);

    // Verify file exists
    if (!existsSync(audioFilePath)) {
      throw new Error('Audio file was not created successfully');
    }

    // Get file stats
    const stats = await fs.stat(audioFilePath);

    console.log('Audio file created successfully:', audioFilePath);
    console.log('File size:', Math.round(stats.size / 1024 / 1024 * 100) / 100, 'MB');

    // Read file and return as blob
    const audioBuffer = await fs.readFile(audioFilePath);

    // Clean up the file after reading
    try {
      await fs.unlink(audioFilePath);
      console.log('Temporary file cleaned up:', audioFilePath);
    } catch (cleanupError) {
      console.error('Error cleaning up temporary file:', cleanupError);
    }

    // Return the audio file
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': stats.size.toString(),
        'Content-Disposition': `attachment; filename="${sanitizedTitle}.mp3"`,
        'X-Video-Title': encodeURIComponent(videoInfo.title),
        'X-Video-Duration': videoInfo.duration.toString(),
        'X-Video-Uploader': encodeURIComponent(videoInfo.uploader || ''),
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
  // Check yt-dlp availability
  let ytDlpStatus = 'unknown';
  let ytDlpVersion = 'unknown';
  let ytDlpPath = 'unknown';
  let pathEnv = process.env.PATH || 'not set';

  try {
    const { stdout: pathOutput } = await execAsync('which yt-dlp', { timeout: 5000 });
    ytDlpPath = pathOutput.trim();
    ytDlpStatus = 'found';
  } catch (error) {
    ytDlpStatus = 'not found';
  }

  if (ytDlpStatus === 'found') {
    try {
      const { stdout: versionOutput } = await execAsync('yt-dlp --version', { timeout: 10000 });
      ytDlpVersion = versionOutput.trim();
      ytDlpStatus = 'working';
    } catch (error) {
      ytDlpStatus = 'found but not working';
    }
  }

  return NextResponse.json({
    status: 'YouTube Audio Download API',
    version: '1.0.0',
    maxDuration: `${MAX_DURATION / 60} minutes`,
    supportedFormats: ['mp3'],
    usage: 'POST with { "url": "https://youtube.com/watch?v=..." }',
    diagnostics: {
      ytDlpStatus,
      ytDlpVersion,
      ytDlpPath,
      pathEnv,
      tempDir: TEMP_DIR,
      nodeEnv: process.env.NODE_ENV || 'not set'
    }
  });
}
