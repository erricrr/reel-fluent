import { NextRequest, NextResponse } from 'next/server';

interface AudioProxyRequest {
  audioUrl: string;
  title: string;
  duration: number;
  uploader: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: AudioProxyRequest = await request.json();
    const { audioUrl, title, duration, uploader } = body;

    if (!audioUrl) {
      return NextResponse.json({ error: 'audioUrl is required' }, { status: 400 });
    }

    console.log('Proxying audio stream from:', audioUrl);

    // Fetch the audio stream with server credentials
    const response = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'audio/*,*/*;q=0.9',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      console.error('Failed to fetch audio stream:', response.status, response.statusText);
      return NextResponse.json(
        { error: `Failed to fetch audio stream: ${response.status}` },
        { status: response.status }
      );
    }

    // Get content info
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const contentLength = response.headers.get('content-length');

    console.log('Audio stream info:', {
      contentType,
      contentLength: contentLength ? `${Math.round(parseInt(contentLength) / 1024 / 1024 * 100) / 100} MB` : 'unknown',
      title: title || 'YouTube Audio'
    });

    // Create response headers
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Content-Disposition', `attachment; filename="${(title || 'YouTube_Audio').replace(/[^a-zA-Z0-9]/g, '_')}.mp3"`);
    responseHeaders.set('X-Video-Title', encodeURIComponent(title || 'YouTube Audio'));
    responseHeaders.set('X-Video-Duration', (duration || 0).toString());
    responseHeaders.set('X-Video-Uploader', encodeURIComponent(uploader || 'Unknown'));
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Expose-Headers', 'X-Video-Title, X-Video-Duration, X-Video-Uploader');

    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }

    // Stream the response directly
    return new NextResponse(response.body, {
      status: 200,
      headers: responseHeaders
    });

  } catch (error) {
    console.error('Audio proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy audio stream' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
