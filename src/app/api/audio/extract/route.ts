import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

interface AudioExtractionRequest {
  url?: string;
  startTime: number;
  endTime: number;
  sourceType: 'audio' | 'video';
  fileData?: string; // Base64 encoded file data
  fileName?: string;
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

    // Provide more specific error messages
    if (error.code === 'ENOENT') {
      throw new Error('ffmpeg not found. Please ensure ffmpeg is installed on the server.');
    }
    if (error.signal === 'SIGTERM') {
      throw new Error('Audio extraction timed out. The media file might be too large or inaccessible.');
    }
    if (error.stderr && error.stderr.includes('Invalid data found')) {
      throw new Error('Invalid media format. The URL might not point to a valid audio/video file.');
    }
    if (error.stderr && error.stderr.includes('No such file or directory')) {
      throw new Error('Media file not accessible. The URL might be invalid or require authentication.');
    }

    throw new Error(`Failed to extract audio segment: ${error.message}`);
  }
}

export async function POST(request: NextRequest) {
  try {
        // Check if this is a multipart form (file upload) or JSON (URL)
    const contentType = request.headers.get('content-type') || '';

    let inputPath: string;
    let isTemporaryInput = false;
    let extractionParams: { startTime: number; endTime: number; sourceType: 'audio' | 'video' };

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('file') as File;
      const startTime = parseFloat(formData.get('startTime') as string);
      const endTime = parseFloat(formData.get('endTime') as string);
      const sourceType = formData.get('sourceType') as 'audio' | 'video';

      extractionParams = { startTime, endTime, sourceType };

      if (!file) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }

      // Validate input
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

      // Save uploaded file temporarily
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      const fileExtension = path.extname(file.name) || '.tmp';
      inputPath = path.join(TEMP_DIR, `upload_${timestamp}_${randomId}${fileExtension}`);

      const arrayBuffer = await file.arrayBuffer();
      await fs.writeFile(inputPath, Buffer.from(arrayBuffer));
      isTemporaryInput = true;

      console.log('File uploaded for processing:', {
        fileName: file.name,
        size: Math.round(file.size / 1024) + ' KB',
        startTime,
        endTime,
        duration,
        sourceType,
        inputPath
      });

    } else {
      // Handle JSON request (URL)
      const body = await request.json();
      const { url, startTime, endTime, sourceType } = body;

      extractionParams = { startTime, endTime, sourceType };

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
          { error: 'Blob URLs are not supported for server-side processing. Please use file upload for local files.' },
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

      inputPath = url;
      console.log('URL provided for processing:', {
        url: url.substring(0, 100) + '...',
        startTime,
        endTime,
        duration,
        sourceType
      });
    }

    // Ensure temp directory exists
    await ensureTempDir();

    // Clean up old files
    await cleanupOldFiles();

    // Generate unique filename for output
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const outputPath = path.join(TEMP_DIR, `audio_extract_${timestamp}_${randomId}.mp3`);

    // Extract audio segment
    await extractAudioSegment(inputPath, extractionParams.startTime, extractionParams.endTime, outputPath);

    // Clean up temporary input file if it was uploaded
    if (isTemporaryInput) {
      try {
        await fs.unlink(inputPath);
        console.log('Temporary input file cleaned up:', inputPath);
      } catch (cleanupError) {
        console.error('Error cleaning up temporary input file:', cleanupError);
      }
    }

    // Verify output file exists
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

    // Clean up the output file after reading
    try {
      await fs.unlink(outputPath);
      console.log('Temporary output file cleaned up:', outputPath);
    } catch (cleanupError) {
      console.error('Error cleaning up temporary output file:', cleanupError);
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
