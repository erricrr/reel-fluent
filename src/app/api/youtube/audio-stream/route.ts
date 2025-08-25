import { NextRequest, NextResponse } from 'next/server';

interface AudioStreamRequest {
  videoId: string;
}

// Extract YouTube Video ID
function extractVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Get audio stream using Piped API (Railway-compatible)
async function getAudioStream(videoId: string): Promise<{ streamUrl: string; title: string; duration: number } | null> {
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
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

  for (const base of pipedInstances) {
    try {
      const cacheBuster = Date.now();
      const streamsUrl = `${base}/api/v1/streams/${videoId}?cb=${cacheBuster}`;
      const metaUrl = `${base}/api/v1/videos/${videoId}?cb=${cacheBuster}`;

      const [streamsResp, metaResp] = await Promise.all([
        fetch(streamsUrl, {
          redirect: 'follow',
          signal: AbortSignal.timeout(30000) // 30 second timeout
        }),
        fetch(metaUrl, {
          redirect: 'follow',
          signal: AbortSignal.timeout(30000)
        }).catch(() => null)
      ]);

      if (!streamsResp.ok) {
        console.warn('Piped streams request failed:', base, streamsResp.status);
        continue;
      }

      const streams = await streamsResp.json();
      const meta = metaResp && metaResp.ok ? await metaResp.json() : {} as any;

      const audioStreams: Array<any> = streams?.audioStreams || [];
      if (!audioStreams.length) continue;

      // Sort by quality, prefer higher bitrate
      audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const best = audioStreams[0];
      const streamUrl: string = best?.url;

      if (!streamUrl) continue;

      const title: string = streams?.title || meta?.title || 'YouTube Audio';
      const duration: number = Number(streams?.duration ?? meta?.duration ?? 0);

      return { streamUrl, title, duration };
    } catch (e) {
      console.warn('Piped instance failed:', base, (e as any)?.message || e);
      continue;
    }
  }

  return null;
}

// Get audio stream using Invidious API as fallback
async function getAudioStreamInvidious(videoId: string): Promise<{ streamUrl: string; title: string; duration: number } | null> {
  const invidiousInstances = [
    'https://yewtu.be',
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
      const cacheBuster = Date.now();
      const apiUrl = `${base}/api/v1/videos/${videoId}?cb=${cacheBuster}`;

      const response = await fetch(apiUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(30000)
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

      const title = data?.title || 'YouTube Audio';
      const duration = Number(data?.lengthSeconds || 0);

      return { streamUrl, title, duration };
    } catch (e) {
      console.warn('Invidious instance failed:', base, (e as any)?.message || e);
      continue;
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');

    if (!videoId) {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      );
    }

    // Validate video ID format
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return NextResponse.json(
        { error: 'Invalid video ID format' },
        { status: 400 }
      );
    }

    console.log('Getting audio stream for video ID:', videoId);

    // Try Piped first
    let audioInfo = await getAudioStream(videoId);

    // If Piped fails, try Invidious
    if (!audioInfo) {
      console.log('Piped failed, trying Invidious...');
      audioInfo = await getAudioStreamInvidious(videoId);
    }

    if (!audioInfo) {
      return NextResponse.json(
        { error: 'Could not retrieve audio stream for this video' },
        { status: 404 }
      );
    }

    // Check duration limit (30 minutes)
    const MAX_DURATION = 1800;
    if (audioInfo.duration > MAX_DURATION) {
      return NextResponse.json(
        { error: `Video duration (${Math.round(audioInfo.duration / 60)} minutes) exceeds maximum allowed duration (${MAX_DURATION / 60} minutes)` },
        { status: 400 }
      );
    }

    // Return the audio stream URL and metadata
    return NextResponse.json({
      streamUrl: audioInfo.streamUrl,
      title: audioInfo.title,
      duration: audioInfo.duration,
      format: 'audio/mp4' // Most YouTube audio streams are MP4
    });

  } catch (error: any) {
    console.error('Audio stream error:', error);

    return NextResponse.json(
      {
        error: error.message || 'Failed to get audio stream',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: AudioStreamRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { videoId } = body;

    if (!videoId) {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      );
    }

    // Validate video ID format
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return NextResponse.json(
        { error: 'Invalid video ID format' },
        { status: 400 }
      );
    }

    console.log('Getting audio stream for video ID:', videoId);

    // Try Piped first
    let audioInfo = await getAudioStream(videoId);

    // If Piped fails, try Invidious
    if (!audioInfo) {
      console.log('Piped failed, trying Invidious...');
      audioInfo = await getAudioStreamInvidious(videoId);
    }

    if (!audioInfo) {
      return NextResponse.json(
        { error: 'Could not retrieve audio stream for this video' },
        { status: 404 }
      );
    }

    // Check duration limit (30 minutes)
    const MAX_DURATION = 1800;
    if (audioInfo.duration > MAX_DURATION) {
      return NextResponse.json(
        { error: `Video duration (${Math.round(audioInfo.duration / 60)} minutes) exceeds maximum allowed duration (${MAX_DURATION / 60} minutes)` },
        { status: 400 }
      );
    }

    // Return the audio stream URL and metadata
    return NextResponse.json({
      streamUrl: audioInfo.streamUrl,
      title: audioInfo.title,
      duration: audioInfo.duration,
      format: 'audio/mp4'
    });

  } catch (error: any) {
    console.error('Audio stream error:', error);

    return NextResponse.json(
      {
        error: error.message || 'Failed to get audio stream',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
