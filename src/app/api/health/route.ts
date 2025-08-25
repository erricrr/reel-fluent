import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Railway-compatible YouTube audio extraction
    const ytDlpStatus = 'not required (using Piped/Invidious APIs)';

    // Check if ffmpeg is available (still needed for other audio processing)
    let ffmpegStatus = 'unknown';
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
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
        'youtube-processing': 'available (Railway-compatible)',
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
