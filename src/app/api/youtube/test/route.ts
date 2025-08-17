import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
  };

  // Test yt-dlp installation
  try {
    const { stdout: versionOutput } = await execAsync('yt-dlp --version', { timeout: 10000 });
    diagnostics.ytdlp = {
      status: 'installed',
      version: versionOutput.trim(),
      path: await execAsync('which yt-dlp', { timeout: 5000 }).then(r => r.stdout.trim()).catch(() => 'not found')
    };
  } catch (error: any) {
    diagnostics.ytdlp = {
      status: 'error',
      error: error.message,
      stderr: error.stderr
    };
  }

  // Test ffmpeg installation
  try {
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

  // Test Python installation
  try {
    const { stdout: pythonVersion } = await execAsync('python3 --version', { timeout: 5000 });
    diagnostics.python = {
      status: 'installed',
      version: pythonVersion.trim(),
      path: await execAsync('which python3', { timeout: 5000 }).then(r => r.stdout.trim()).catch(() => 'not found')
    };
  } catch (error: any) {
    diagnostics.python = {
      status: 'error',
      error: error.message
    };
  }

  // Test PATH
  diagnostics.environment = {
    path: process.env.PATH || 'not set',
    tempDir: process.env.TEMP_DIR || '/tmp',
    nodeVersion: process.version
  };

  // Test quick YouTube URL parsing (no download)
  try {
    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const { stdout: infoOutput } = await execAsync(`yt-dlp --dump-json --no-download "${testUrl}"`, { timeout: 30000 });
    const info = JSON.parse(infoOutput);
    diagnostics.youtube_test = {
      status: 'success',
      title: info.title || 'Unknown',
      duration: info.duration || 0,
      uploader: info.uploader || 'Unknown'
    };
  } catch (error: any) {
    diagnostics.youtube_test = {
      status: 'failed',
      error: error.message,
      stderr: error.stderr
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
