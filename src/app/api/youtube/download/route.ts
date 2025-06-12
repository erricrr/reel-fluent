import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, statSync, unlinkSync } from 'fs';

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

    // Multiple extraction strategies - try each one until one works
    const strategies = [
      // Strategy 1: Basic extraction with minimal flags
      {
        name: 'basic',
        command: [
          'yt-dlp',
          '--dump-json',
          '--no-playlist',
          '--quiet',
          `"${url}"`
        ].join(' ')
      },
      // Strategy 2: Use iframe/embed endpoint to bypass some restrictions
      {
        name: 'embed',
        command: [
          'yt-dlp',
          '--dump-json',
          '--no-playlist',
          '--quiet',
          '--extractor-args', '"youtube:player_client=web,web_creator"',
          `"${url}"`
        ].join(' ')
      },
      // Strategy 3: Use TV client (most resistant to blocking)
      {
        name: 'tv',
        command: [
          'yt-dlp',
          '--dump-json',
          '--no-playlist',
          '--quiet',
          '--extractor-args', '"youtube:player_client=tv_embedded"',
          `"${url}"`
        ].join(' ')
      },
      // Strategy 4: Try with old iOS client
      {
        name: 'ios-old',
        command: [
          'yt-dlp',
          '--dump-json',
          '--no-playlist',
          '--quiet',
          '--extractor-args', '"youtube:player_client=ios,web_creator;formats=missing_pot"',
          `"${url}"`
        ].join(' ')
      },
      // Strategy 5: Legacy approach with old web client
      {
        name: 'legacy-web',
        command: [
          'yt-dlp',
          '--dump-json',
          '--no-playlist',
          '--quiet',
          '--user-agent', '"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"',
          '--referer', '"https://www.youtube.com/"',
          '--extractor-args', '"youtube:formats=missing_pot"',
          `"${url}"`
        ].join(' ')
      }
    ];

    let lastError: Error | null = null;

    for (const strategy of strategies) {
      try {
        console.log(`Trying strategy "${strategy.name}" for video info extraction`);

        const { stdout } = await execAsync(strategy.command, {
          timeout: 30000,
          env: {
            ...process.env,
            // Add some environment variables that might help
            'PYTHONPATH': '/usr/local/lib/python3.11/site-packages:/usr/lib/python3.11/site-packages',
            'PATH': '/root/.local/bin:/usr/local/bin:' + process.env.PATH
          }
        });

        if (!stdout.trim()) {
          throw new Error('Empty response from yt-dlp');
        }

        const videoInfo = JSON.parse(stdout.trim());

        if (!videoInfo.title || !videoInfo.duration) {
          throw new Error('Invalid video information received');
        }

        console.log(`Strategy "${strategy.name}" succeeded for video info`);
        console.log('Video info extracted:', {
          title: videoInfo.title,
          duration: videoInfo.duration,
          uploader: videoInfo.uploader
        });

        return videoInfo;

      } catch (error) {
        console.log(`Strategy "${strategy.name}" failed:`, error instanceof Error ? error.message : String(error));
        lastError = error instanceof Error ? error : new Error(String(error));

        // If this strategy failed due to bot detection, wait a bit before trying the next one
        if (error instanceof Error && error.message.includes('bot')) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        continue;
      }
    }

    // If all strategies failed, throw the most informative error
    console.error('All video info extraction strategies failed');

    if (lastError?.message.includes('Sign in to confirm')) {
      throw new Error('YouTube is currently blocking automated requests. This is a temporary issue from YouTube\'s side. Please try again in a few minutes or try a different video.');
    } else if (lastError?.message.includes('Private video') || lastError?.message.includes('unavailable')) {
      throw new Error('This video is private, unavailable, or restricted. Please try a different video.');
    } else {
      throw new Error('Failed to get video information. YouTube may be experiencing issues or blocking requests. Please try again later.');
    }

  } catch (error) {
    console.error('getVideoInfo error:', error);
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

  // Multiple download strategies - try each one until one works
  const strategies = [
    // Strategy 1: Basic download with minimal flags
    {
      name: 'basic',
      command: [
        'yt-dlp',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K',
        '--no-playlist',
        '--match-filters', `"duration < ${MAX_DURATION}"`,
        '--output', `"${outputPath}.%(ext)s"`,
        `"${url}"`
      ].join(' ')
    },
    // Strategy 2: Use iframe/embed endpoint to bypass some restrictions
    {
      name: 'embed',
      command: [
        'yt-dlp',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K',
        '--no-playlist',
        '--extractor-args', '"youtube:player_client=web,web_creator"',
        '--match-filters', `"duration < ${MAX_DURATION}"`,
        '--output', `"${outputPath}.%(ext)s"`,
        `"${url}"`
      ].join(' ')
    },
    // Strategy 3: Use TV client (most resistant to blocking)
    {
      name: 'tv',
      command: [
        'yt-dlp',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K',
        '--no-playlist',
        '--extractor-args', '"youtube:player_client=tv_embedded"',
        '--match-filters', `"duration < ${MAX_DURATION}"`,
        '--output', `"${outputPath}.%(ext)s"`,
        `"${url}"`
      ].join(' ')
    },
    // Strategy 4: Try with cookie and old iOS client
    {
      name: 'ios-old',
      command: [
        'yt-dlp',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K',
        '--no-playlist',
        '--extractor-args', '"youtube:player_client=ios,web_creator;formats=missing_pot"',
        '--match-filters', `"duration < ${MAX_DURATION}"`,
        '--output', `"${outputPath}.%(ext)s"`,
        `"${url}"`
      ].join(' ')
    },
    // Strategy 5: Legacy approach with old web client
    {
      name: 'legacy-web',
      command: [
        'yt-dlp',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K',
        '--no-playlist',
        '--user-agent', '"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"',
        '--referer', '"https://www.youtube.com/"',
        '--extractor-args', '"youtube:formats=missing_pot"',
        '--match-filters', `"duration < ${MAX_DURATION}"`,
        '--output', `"${outputPath}.%(ext)s"`,
        `"${url}"`
      ].join(' ')
    }
  ];

  let lastError: Error | null = null;

  for (const strategy of strategies) {
    try {
      console.log(`Trying strategy "${strategy.name}" for audio download`);

      const { stdout, stderr } = await execAsync(strategy.command, {
        timeout: 120000, // 2 minutes timeout for download
        env: {
          ...process.env,
          'PYTHONPATH': '/usr/local/lib/python3.11/site-packages:/usr/lib/python3.11/site-packages',
          'PATH': '/root/.local/bin:/usr/local/bin:' + process.env.PATH
        }
      });

      console.log(`yt-dlp stdout:`, stdout);
      if (stderr) {
        console.log(`yt-dlp stderr:`, stderr);
      }

      // Check if audio file was created
      const expectedAudioPath = `${outputPath}.mp3`;
      if (existsSync(expectedAudioPath)) {
        const stats = statSync(expectedAudioPath);
        console.log(`Strategy "${strategy.name}" succeeded - Audio file created:`, expectedAudioPath);
        console.log(`File size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
        return expectedAudioPath;
      } else {
        throw new Error('Audio file was not created');
      }

    } catch (error) {
      console.log(`Strategy "${strategy.name}" failed:`, error instanceof Error ? error.message : String(error));
      lastError = error instanceof Error ? error : new Error(String(error));

      // Clean up any partial files
      const possibleFiles = [
        `${outputPath}.mp3`,
        `${outputPath}.webm`,
        `${outputPath}.m4a`,
        `${outputPath}.mp4`
      ];

      possibleFiles.forEach(filePath => {
        if (existsSync(filePath)) {
          try {
            unlinkSync(filePath);
            console.log(`Cleaned up partial file: ${filePath}`);
          } catch (cleanupError) {
            console.warn(`Failed to clean up file ${filePath}:`, cleanupError);
          }
        }
      });

      // If this strategy failed due to bot detection, wait a bit before trying the next one
      if (error instanceof Error && (error.message.includes('bot') || error.message.includes('Sign in'))) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      continue;
    }
  }

  // If all strategies failed, throw the most informative error
  console.error('All audio download strategies failed');

  if (lastError?.message.includes('Sign in to confirm') || lastError?.message.includes('bot')) {
    throw new Error('YouTube is currently blocking automated requests. This is a temporary issue from YouTube\'s side. Please try again in a few minutes or try a different video.');
  } else if (lastError?.message.includes('Private video') || lastError?.message.includes('unavailable')) {
    throw new Error('This video is private, unavailable, or restricted. Please try a different video.');
  } else if (lastError?.message.includes('duration')) {
    throw new Error('Video is too long. Please try a video shorter than 30 minutes.');
  } else {
    throw new Error('Failed to download audio. YouTube may be experiencing issues or blocking requests. Please try again later.');
  }
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
