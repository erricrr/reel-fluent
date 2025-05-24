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

const TEMP_DIR = path.join(process.cwd(), 'temp-downloads');
const MAX_DURATION = 600; // 10 minutes max duration

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
    const { stdout } = await execAsync(`yt-dlp --dump-json "${url}"`);
    const info = JSON.parse(stdout);
    return {
      title: info.title || 'Unknown Title',
      duration: info.duration || 0,
      uploader: info.uploader || 'Unknown',
      view_count: info.view_count || 0
    };
  } catch (error) {
    throw new Error('Failed to get video information');
  }
}

// Download audio using yt-dlp
async function downloadAudio(url: string, outputPath: string) {
  const command = [
    'yt-dlp',
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '192K',
    '--no-playlist',
    '--match-filters', `"duration < ${MAX_DURATION}"`,
    '--output', `"${outputPath}.%(ext)s"`,
    `"${url}"`
  ].join(' ');

  console.log('Executing command:', command);

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: 5 * 60 * 1000, // 5 minute timeout
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    console.log('yt-dlp stdout:', stdout);
    if (stderr) {
      console.log('yt-dlp stderr:', stderr);
    }

    return `${outputPath}.mp3`;
  } catch (error: any) {
    console.error('yt-dlp error:', error);
    throw new Error(`Failed to download audio: ${error.message}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: YouTubeDownloadRequest = await request.json();
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
  return NextResponse.json({
    status: 'YouTube Audio Download API',
    version: '1.0.0',
    maxDuration: `${MAX_DURATION / 60} minutes`,
    supportedFormats: ['mp3'],
    usage: 'POST with { "url": "https://youtube.com/watch?v=..." }'
  });
}
