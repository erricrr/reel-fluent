import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  try {
    // Validate URL
    new URL(targetUrl);

    // Only allow specific domains for security
    const allowedDomains = [
      'pipedapi.kavin.rocks',
      'piped-api.hostux.net',
      'pipedapi.palveluntarjoaja.eu',
      'piped-api.orkiv.com',
      'piped.video',
      'yewtu.be',
      'invidious.kavin.rocks',
      'vid.puffyan.us',
      'invidious.namazso.eu',
      'invidious.lunar.icu',
      'invidious.projectsegfau.lt',
      'invidious.flokinet.to',
      'api.piped.projectsegfau.lt',
      'pipedapi.adminforge.de',
      'www.youtube.com',
      // Common media hosting domains
      'archive.org',
      'dn720302.ca.archive.org',
      'dn721800.ca.archive.org',
      'vimeo.com',
      'player.vimeo.com',
      'soundcloud.com',
      'bandcamp.com',
      'freesound.org',
      'pixabay.com',
      'pexels.com',
      'unsplash.com'
    ];

    const urlObj = new URL(targetUrl);
    const isAllowed = allowedDomains.some(domain =>
      urlObj.hostname === domain ||
      urlObj.hostname.endsWith('.' + domain) ||
      // Allow all archive.org subdomains
      (domain === 'archive.org' && urlObj.hostname.endsWith('.archive.org'))
    );

    if (!isAllowed) {
      console.log(`Domain not allowed: ${urlObj.hostname}`);
      return NextResponse.json({ error: `Domain not allowed: ${urlObj.hostname}` }, { status: 403 });
    }

    console.log(`Proxying request to: ${targetUrl}`);

    const controller = new AbortController();
    const timeoutMs = 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Origin': urlObj.origin,
          'Referer': urlObj.origin
        },
        redirect: 'follow',
        signal: controller.signal
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return NextResponse.json(
          { error: `Request to target timed out after ${timeoutMs}ms` },
          { status: 504 }
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.log(`Target server error: ${response.status} ${response.statusText}`);
      const errorText = await response.text().catch(() => 'No error details');
      return NextResponse.json(
        { error: `Target server responded with status ${response.status}: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.text();
    console.log(`Successfully proxied response, length: ${data.length}`);

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=300' // 5 minute cache
      }
    });

  } catch (error) {
    console.error('CORS proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from target URL' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
