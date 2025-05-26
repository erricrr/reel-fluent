import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    // Check if yt-dlp is available
    let ytDlpStatus = 'unknown';
    try {
      await execAsync('yt-dlp --version', { timeout: 5000 });
      ytDlpStatus = 'available';
    } catch (error) {
      ytDlpStatus = 'unavailable';
    }

    // Check if ffmpeg is available
    let ffmpegStatus = 'unknown';
    try {
      await execAsync('ffmpeg -version', { timeout: 5000 });
      ffmpegStatus = 'available';
    } catch (error) {
      ffmpegStatus = 'unavailable';
    }

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      dependencies: {
        'yt-dlp': ytDlpStatus,
        'ffmpeg': ffmpegStatus
      },
      features: {
        'youtube-processing': ytDlpStatus === 'available' && ffmpegStatus === 'available',
        'mobile-audio-extraction': ffmpegStatus === 'available',
        'ai-transcription': process.env.GOOGLE_GENAI_API_KEY ? 'configured' : 'missing-api-key'
      },
      version: '1.0.0'
    };

    return NextResponse.json(health, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      },
      { status: 500 }
    );
  }
}
