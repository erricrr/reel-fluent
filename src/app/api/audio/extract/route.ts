import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

interface AudioExtractionRequest {
  url: string;
  startTime: number;
  endTime: number;
  sourceType: 'audio' | 'video';
}

const TEMP_DIR = process.env.TEMP_DIR || path.join(process.env.NODE_ENV === 'production' ? '/tmp' : process.cwd(), 'temp-downloads');

// Ensure temp directory exists
async function ensureTempDir() {
  if (!existsSync(TEMP_DIR)) {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  }
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
          console.log(`Cleaned up old audio file: ${file}`);
        }
      } catch (error) {
        console.error(`Error checking audio file ${file}:`, error);
      }
    }
  } catch (error) {
    console.error('Error during audio cleanup:', error);
  }
}

// Extract audio segment using ffmpeg
async function extractAudioSegment(
  inputUrl: string,
  startTime: number,
  endTime: number,
  outputPath: string
): Promise<string> {
  const duration = endTime - startTime;

  // Build ffmpeg command for audio extraction
  const command = [
    'ffmpeg',
    '-y', // Overwrite output file
    '-i', `"${inputUrl}"`, // Input file/URL
    '-ss', startTime.toString(), // Start time
    '-t', duration.toString(), // Duration
    '-vn', // No video
    '-acodec', 'libmp3lame', // Audio codec
    '-ar', '44100', // Sample rate
    '-ab', '128k', // Audio bitrate
    '-ac', '1', // Mono audio (smaller file size)
    '-f', 'mp3', // Output format
    `"${outputPath}"` // Output file
  ].join(' ');

  console.log('Executing ffmpeg command:', command);

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: 2 * 60 * 1000, // 2 minute timeout
      maxBuffer: 1024 * 1024 * 5 // 5MB buffer
    });

    console.log('ffmpeg stdout:', stdout);
    if (stderr) {
      console.log('ffmpeg stderr:', stderr);
    }

    return outputPath;
  } catch (error: any) {
    console.error('ffmpeg error:', error);
    throw new Error(`Failed to extract audio segment: ${error.message}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: AudioExtractionRequest = await request.json();
    const { url, startTime, endTime, sourceType } = body;

    // Validate input
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'Valid media URL is required' },
        { status: 400 }
      );
    }

    if (typeof startTime !== 'number' || typeof endTime !== 'number' || startTime >= endTime) {
      return NextResponse.json(
        { error: 'Valid start and end times are required' },
        { status: 400 }
      );
    }

    const duration = endTime - startTime;
    if (duration > 300) { // 5 minutes max
      return NextResponse.json(
        { error: 'Audio segment too long (max 5 minutes)' },
        { status: 400 }
      );
    }

    // Ensure temp directory exists
    await ensureTempDir();

    // Clean up old files
    await cleanupOldFiles();

    // Generate unique filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const outputPath = path.join(TEMP_DIR, `audio_extract_${timestamp}_${randomId}.mp3`);

    console.log('Extracting audio segment:', {
      url: url.substring(0, 100) + '...',
      startTime,
      endTime,
      duration,
      sourceType,
      outputPath
    });

    // Extract audio segment
    await extractAudioSegment(url, startTime, endTime, outputPath);

    // Verify file exists
    if (!existsSync(outputPath)) {
      throw new Error('Audio file was not created successfully');
    }

    // Get file stats
    const stats = await fs.stat(outputPath);
    console.log('Audio extraction successful:', {
      outputPath,
      size: Math.round(stats.size / 1024) + ' KB'
    });

    // Read file and return as blob
    const audioBuffer = await fs.readFile(outputPath);

    // Clean up the file after reading
    try {
      await fs.unlink(outputPath);
      console.log('Temporary audio file cleaned up:', outputPath);
    } catch (cleanupError) {
      console.error('Error cleaning up temporary audio file:', cleanupError);
    }

    // Return the audio file
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': stats.size.toString(),
        'Content-Disposition': `attachment; filename="audio_segment.mp3"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error: any) {
    console.error('Audio extraction error:', error);

    // Return appropriate error response
    return NextResponse.json(
      {
        error: error.message || 'Failed to extract audio segment',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'Audio Extraction API',
    version: '1.0.0',
    description: 'Server-side audio extraction for mobile browsers',
    maxDuration: '5 minutes',
    supportedFormats: ['mp3'],
    usage: 'POST with { "url": "media_url", "startTime": 0, "endTime": 10, "sourceType": "video" }'
  });
}
