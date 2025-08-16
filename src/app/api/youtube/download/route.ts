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

// Extract YouTube Video ID
function extractVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Attempt download via public Piped instances (no cookies, server-friendly)
async function downloadViaPiped(url: string, outputPath: string): Promise<{ filePath: string; title: string; duration: number; uploader?: string } | null> {
  const videoId = extractVideoId(url);
  if (!videoId) return null;

  const fromEnv = (process.env.PIPED_INSTANCE_URLS || process.env.PIPED_INSTANCE_URL || '').trim();
  const envInstances = fromEnv
    ? fromEnv.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const defaultInstances = [
    'https://pipedapi.kavin.rocks', // Most reliable
    'https://piped-api.hostux.net',
    'https://piped.video',
    'https://pipedapi.palveluntarjoaja.eu',
    'https://piped-api.orkiv.com',
    'https://piped-api.r4fo.com',
    'https://piped.moomoo.me',
    'https://piped.garudalinux.org',
    'https://api.piped.projectsegfau.lt',
    'https://pipedapi.adminforge.de'
  ];
  const instances = [...envInstances, ...defaultInstances];

  for (const base of instances) {
    try {
      // Add cache busting to avoid cached errors
      const cacheBuster = Date.now();
      const streamsUrl = `${base}/api/v1/streams/${videoId}?cb=${cacheBuster}`;
      const metaUrl = `${base}/api/v1/videos/${videoId}?cb=${cacheBuster}`;

      const [streamsResp, metaResp] = await Promise.all([
        fetch(streamsUrl, { redirect: 'follow' }),
        fetch(metaUrl, { redirect: 'follow' }).catch(() => null)
      ]);

      if (!streamsResp.ok) {
        console.warn('Piped streams request failed:', base, streamsResp.status);
        continue;
      }

      const streams = await streamsResp.json();
      const meta = metaResp && metaResp.ok ? await metaResp.json() : {} as any;

      const audioStreams: Array<any> = streams?.audioStreams || [];
      if (!audioStreams.length) continue;

      audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const best = audioStreams[0];
      const streamUrl: string = best?.url;
      if (!streamUrl) continue;

      const ffmpegCmd = [
        'ffmpeg',
        '-y',
        '-i', `"${streamUrl}"`,
        '-vn',
        '-acodec', 'libmp3lame',
        '-ar', '44100',
        '-ab', '192k',
        '-ac', '2',
        '-f', 'mp3',
        `"${outputPath}.mp3"`
      ].join(' ');

      const { stdout, stderr } = await execAsync(ffmpegCmd, {
        timeout: 15 * 60 * 1000, // 15 minute timeout for ffmpeg
        maxBuffer: 1024 * 1024 * 50 // 50MB buffer
      });
      console.log('ffmpeg (piped) stdout:', stdout);
      if (stderr) console.log('ffmpeg (piped) stderr:', stderr);

      const mp3Path = `${outputPath}.mp3`;
      if (!existsSync(mp3Path)) continue;

      const title: string = streams?.title || meta?.title || 'YouTube Audio';
      const duration: number = Number(streams?.duration ?? meta?.duration ?? 0);
      const uploader: string | undefined = streams?.uploader || meta?.uploaderName;

      return { filePath: mp3Path, title, duration, uploader };
    } catch (e) {
      console.warn('downloadViaPiped instance failed:', base, (e as any)?.message || e);
      continue;
    }
  }

  return null;
}

// Attempt download via Invidious instances as additional fallback
async function downloadViaInvidious(url: string, outputPath: string): Promise<{ filePath: string; title: string; duration: number; uploader?: string } | null> {
  const videoId = extractVideoId(url);
  if (!videoId) return null;

  const invidiousInstances = [
    'https://yewtu.be', // Most reliable
    'https://invidious.kavin.rocks',
    'https://vid.puffyan.us',
    'https://invidious.namazso.eu',
    'https://invidious.zapashcanon.fr',
    'https://invidious.lunar.icu',
    'https://invidious.projectsegfau.lt',
    'https://invidious.flokinet.to'
  ];

  for (const base of invidiousInstances) {
    try {
      // Add cache busting to avoid cached errors
      const cacheBuster = Date.now();
      const apiUrl = `${base}/api/v1/videos/${videoId}?cb=${cacheBuster}`;

      const response = await fetch(apiUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        console.warn('Invidious API request failed:', base, response.status);
        continue;
      }

      const data = await response.json();
      const audioStreams = data?.adaptiveFormats?.filter((f: any) => f.type?.includes('audio')) || [];

      if (!audioStreams.length) continue;

      // Sort by quality, prefer higher bitrate
      audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      const best = audioStreams[0];
      const streamUrl = best?.url;

      if (!streamUrl) continue;

      const ffmpegCmd = [
        'ffmpeg',
        '-y',
        '-i', `"${streamUrl}"`,
        '-vn',
        '-acodec', 'libmp3lame',
        '-ar', '44100',
        '-ab', '192k',
        '-ac', '2',
        '-f', 'mp3',
        `"${outputPath}.mp3"`
      ].join(' ');

      const { stdout, stderr } = await execAsync(ffmpegCmd, {
        timeout: 15 * 60 * 1000, // 15 minute timeout for ffmpeg
        maxBuffer: 1024 * 1024 * 50 // 50MB buffer
      });

      console.log('ffmpeg (invidious) stdout:', stdout);
      if (stderr) console.log('ffmpeg (invidious) stderr:', stderr);

      const mp3Path = `${outputPath}.mp3`;
      if (!existsSync(mp3Path)) continue;

      const title = data?.title || 'YouTube Audio';
      const duration = Number(data?.lengthSeconds || 0);
      const uploader = data?.author;

      return { filePath: mp3Path, title, duration, uploader };
    } catch (e) {
      console.warn('downloadViaInvidious instance failed:', base, (e as any)?.message || e);
      continue;
    }
  }

  return null;
}

// Emergency fallback using youtube-dl-exec as a last resort
async function downloadViaYoutubeDL(url: string, outputPath: string): Promise<{ filePath: string; title: string; duration: number; uploader?: string } | null> {
  try {
    // Check if youtube-dl is available as emergency fallback
    await execAsync('which youtube-dl', { timeout: 5000 });

    const command = [
      'youtube-dl',
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '192K',
      '--no-playlist',
      '--ignore-errors',
      '--no-warnings',
      '--output', `"${outputPath}.%(ext)s"`,
      `"${url}"`
    ].join(' ');

    console.log('Trying emergency youtube-dl fallback...');

    const { stdout, stderr } = await execAsync(command, {
      timeout: 15 * 60 * 1000, // 15 minutes
      maxBuffer: 1024 * 1024 * 50
    });

    const mp3Path = `${outputPath}.mp3`;
    if (existsSync(mp3Path)) {
      return {
        filePath: mp3Path,
        title: 'YouTube Audio (Emergency Download)',
        duration: 0,
        uploader: 'Unknown'
      };
    }
  } catch (e) {
    console.warn('Emergency youtube-dl fallback failed:', (e as any)?.message || e);
  }

  return null;
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
        name: 'Android client with geo-bypass + IPv4',
        command: [
          'yt-dlp',
          '--force-ipv4',
          '--geo-bypass',
          '--extractor-args', '"youtube:player_client=android,playability_errors=rethrow"',
          '--user-agent', '"Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"',
          '--referer', '"https://www.youtube.com/"',
          '--extractor-retries', '6',
          '--socket-timeout', '30',
          '--no-check-certificates',
          '--sleep-interval', '4',
          '--max-sleep-interval', '10',
          '--add-header', '"Accept-Language:en-US,en;q=0.9"',
          '--dump-json',
          `"${url}"`
        ]
      },
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
          '--force-ipv4',
          '--geo-bypass',
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
          '--force-ipv4',
          '--geo-bypass',
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
          '--force-ipv4',
          '--geo-bypass',
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
      name: 'iOS client download (bypass bot detection)',
      command: [
        'yt-dlp',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K',
        '--no-playlist',
        '--force-ipv4',
        '--geo-bypass',
        '--extractor-args', '"youtube:player_client=ios,playability_errors=rethrow"',
        '--user-agent', '"Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"',
        '--referer', '"https://www.youtube.com/"',
        '--extractor-retries', '8',
        '--socket-timeout', '45',
        '--no-check-certificates',
        '--sleep-interval', '6',
        '--max-sleep-interval', '15',
        '--fragment-retries', '10',
        '--retry-sleep', 'linear=1::10',
        '--match-filters', `"duration < ${MAX_DURATION}"`,
        '--output', `"${outputPath}.%(ext)s"`,
        `"${url}"`
      ]
    },
    {
      name: 'Android client download (geo-bypass + IPv4)',
      command: [
        'yt-dlp',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K',
        '--no-playlist',
        '--force-ipv4',
        '--geo-bypass',
        '--extractor-args', '"youtube:player_client=android,playability_errors=rethrow"',
        '--user-agent', '"Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"',
        '--referer', '"https://www.youtube.com/"',
        '--extractor-retries', '6',
        '--socket-timeout', '30',
        '--no-check-certificates',
        '--sleep-interval', '4',
        '--max-sleep-interval', '10',
        '--fragment-retries', '8',
        '--match-filters', `"duration < ${MAX_DURATION}"`,
        '--output', `"${outputPath}.%(ext)s"`,
        `"${url}"`
      ]
    },
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
        '--force-ipv4',
        '--geo-bypass',
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
        '--force-ipv4',
        '--geo-bypass',
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
        '--force-ipv4',
        '--geo-bypass',
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
        timeout: 20 * 60 * 1000, // 20 minute timeout for yt-dlp downloads
        maxBuffer: 1024 * 1024 * 50 // 50MB buffer for larger files
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

    // Optional proxy mode for environments where direct downloads are blocked (e.g., Railway)
    if (process.env.YT_AUDIO_PROXY_URL) {
      // Lightweight metadata via YouTube oEmbed
      async function getBasicMetadata(lookupUrl: string): Promise<{ title: string; uploader?: string }> {
        try {
          const oEmbed = `https://www.youtube.com/oembed?url=${encodeURIComponent(lookupUrl)}&format=json`;
          const r = await fetch(oEmbed, { redirect: 'follow' });
          if (!r.ok) throw new Error('oEmbed failed');
          const data = await r.json();
          return { title: data.title || 'YouTube Audio', uploader: data.author_name };
        } catch (_e) {
          return { title: 'YouTube Audio' };
        }
      }

      async function downloadViaProxy(targetUrl: string, baseName: string) {
        const proxyUrl = process.env.YT_AUDIO_PROXY_URL as string;
        const method = (process.env.YT_AUDIO_PROXY_METHOD || 'GET').toUpperCase();
        const urlParam = process.env.YT_AUDIO_PROXY_URL_PARAM || 'url';
        const headersRaw = process.env.YT_AUDIO_PROXY_HEADERS || '';
        const headers: Record<string, string> = {};
        if (headersRaw) {
          headersRaw.split('\n').forEach((line) => {
            const idx = line.indexOf(':');
            if (idx > 0) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
          });
        }

        let proxyRequestUrl = proxyUrl;
        let body: string | undefined;
        if (method === 'GET') {
          const u = new URL(proxyUrl);
          u.searchParams.set(urlParam, targetUrl);
          proxyRequestUrl = u.toString();
        } else {
          headers['Content-Type'] = headers['Content-Type'] || 'application/json';
          body = JSON.stringify({ [urlParam]: targetUrl });
        }

        const resp = await fetch(proxyRequestUrl, { method, headers, body });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          return NextResponse.json(
            { error: `Proxy download failed: ${resp.status} ${text?.slice(0, 256)}` },
            { status: 502 }
          );
        }

        const contentType = resp.headers.get('content-type') || 'audio/mpeg';
        if (!contentType.includes('audio')) {
          return NextResponse.json(
            { error: 'Proxy returned non-audio response' },
            { status: 502 }
          );
        }

        const arrayBuffer = await resp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const filename = `${baseName}.mp3`;

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${filename}"`,
            // Minimal metadata when yt-dlp is not used
            'X-Proxy-Mode': 'true'
          }
        });
      }

      const basic = await getBasicMetadata(url);
      const timestamp = Date.now();
      const baseName = (basic.title || 'YouTube_Audio').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50) + `_${timestamp}`;
      const proxyResponse = await downloadViaProxy(url, baseName);
      if (proxyResponse instanceof NextResponse) {
        return proxyResponse;
      }
    }

    // Ensure temp directory exists
    await ensureTempDir();

    // Clean up old files
    await cleanupOldFiles();

    // Try yt-dlp metadata first; on failure, fall back to Piped metadata
    console.log('Getting video info for:', url);
    let videoInfo: { title: string; duration: number; uploader?: string } | null = null;
    let ytInfoError: any = null;
    try {
      videoInfo = await getVideoInfo(url);
    } catch (e: any) {
      ytInfoError = e;
      console.warn('yt-dlp getVideoInfo failed, will try Piped fallback for metadata');
      const tempBase = path.join(TEMP_DIR, `piped_meta_${Date.now()}`);
      const piped = await downloadViaPiped(url, tempBase);
      if (piped) {
        // Clean up the temp file used only to probe metadata
        try { await fs.unlink(piped.filePath); } catch {}
        videoInfo = { title: piped.title, duration: piped.duration, uploader: piped.uploader };
      }
    }

    // Check duration limit
    if (videoInfo && videoInfo.duration > MAX_DURATION) {
      return NextResponse.json(
        { error: `Video duration (${Math.round(videoInfo.duration / 60)} minutes) exceeds maximum allowed duration (${MAX_DURATION / 60} minutes)` },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fallbackTitle = videoInfo?.title || 'YouTube_Audio';
    const sanitizedTitle = fallbackTitle.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const outputPath = path.join(TEMP_DIR, `youtube_${sanitizedTitle}_${timestamp}`);

    console.log('Downloading audio to:', outputPath);

        // Smart download strategy: prioritize methods based on current YouTube blocking status
    let audioFilePath: string | null = null;
    let lastDownloadError: any = null;

    // Check if we should prioritize fallback methods (if yt-dlp failed recently due to blocking)
    const shouldPrioritizeFallbacks = ytInfoError && (
      ytInfoError.message?.includes('blocking automated requests') ||
      ytInfoError.message?.includes('bot') ||
      ytInfoError.message?.includes('403')
    );

    if (shouldPrioritizeFallbacks) {
      console.log('YouTube appears to be blocking yt-dlp aggressively, trying alternative methods first...');

      // Try Piped first when YouTube is blocking
      console.log('Trying Piped API as primary method...');
      const piped = await downloadViaPiped(url, outputPath);
      if (piped) {
        audioFilePath = piped.filePath;
        if (!videoInfo) {
          videoInfo = { title: piped.title, duration: piped.duration, uploader: piped.uploader };
        }
      } else {
        console.log('Piped failed, trying Invidious API...');
        // Try Invidious as secondary
        const invidious = await downloadViaInvidious(url, outputPath);
        if (invidious) {
          audioFilePath = invidious.filePath;
          if (!videoInfo) {
            videoInfo = { title: invidious.title, duration: invidious.duration, uploader: invidious.uploader };
          }
        } else {
          console.log('Alternative APIs failed, trying yt-dlp as last resort...');
          // Try yt-dlp as last resort
          try {
            audioFilePath = await downloadAudio(url, outputPath);
          } catch (dlErr: any) {
            console.log('yt-dlp also failed, trying emergency youtube-dl fallback...');
            // Final emergency fallback
            const emergency = await downloadViaYoutubeDL(url, outputPath);
            if (emergency) {
              audioFilePath = emergency.filePath;
              if (!videoInfo) {
                videoInfo = { title: emergency.title, duration: emergency.duration, uploader: emergency.uploader };
              }
            } else {
              lastDownloadError = dlErr;
              console.error('All download methods failed including emergency fallback');
              throw new Error('All download methods failed. YouTube is heavily blocking requests right now. Please try again later or try a different video.');
            }
          }
        }
      }
    } else {
      // Normal flow: try yt-dlp first, then fallbacks
      try {
        audioFilePath = await downloadAudio(url, outputPath);
      } catch (dlErr: any) {
        lastDownloadError = dlErr;
        console.warn('yt-dlp download failed, trying Piped fallback...', dlErr?.message || dlErr);

        // Try Piped fallback
        const piped = await downloadViaPiped(url, outputPath);
        if (piped) {
          audioFilePath = piped.filePath;
          // If we did not have metadata earlier, fill it now
          if (!videoInfo) {
            videoInfo = { title: piped.title, duration: piped.duration, uploader: piped.uploader };
          }
        } else {
          console.warn('Piped download also failed, trying Invidious fallback...');

          // Try Invidious fallback
          const invidious = await downloadViaInvidious(url, outputPath);
          if (invidious) {
            audioFilePath = invidious.filePath;
            // If we did not have metadata earlier, fill it now
            if (!videoInfo) {
              videoInfo = { title: invidious.title, duration: invidious.duration, uploader: invidious.uploader };
            }
          } else {
            // Try emergency fallback before giving up
            console.log('All primary methods failed, trying emergency youtube-dl fallback...');
            const emergency = await downloadViaYoutubeDL(url, outputPath);
            if (emergency) {
              audioFilePath = emergency.filePath;
              if (!videoInfo) {
                videoInfo = { title: emergency.title, duration: emergency.duration, uploader: emergency.uploader };
              }
            } else {
              // All methods failed
              console.error('All download methods failed (yt-dlp, Piped, Invidious, youtube-dl)');

              // If we have a yt-dlp error with a known message, surface it
              if (ytInfoError) throw ytInfoError;
              if (lastDownloadError) throw lastDownloadError;

              throw new Error('All download methods failed. YouTube may be temporarily blocking requests. Please try again in a few minutes or try a different video.');
            }
          }
        }
      }
    }

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
        'X-Video-Title': encodeURIComponent(videoInfo?.title || 'YouTube Audio'),
        'X-Video-Duration': (videoInfo?.duration ?? 0).toString(),
        'X-Video-Uploader': encodeURIComponent(videoInfo?.uploader || ''),
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
  const proxyMode = !!process.env.YT_AUDIO_PROXY_URL;

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
      nodeEnv: process.env.NODE_ENV || 'not set',
      proxyMode
    }
  });
}
