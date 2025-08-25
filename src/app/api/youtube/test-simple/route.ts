import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const testVideoId = 'dQw4w9WgXcQ'; // Rick Roll - should always work
    console.log('Testing YouTube audio extraction with video ID:', testVideoId);

    // Test Piped API
    const pipedUrl = `https://pipedapi.kavin.rocks/api/v1/streams/${testVideoId}`;
    console.log('Testing Piped API:', pipedUrl);

    const pipedResponse = await fetch(pipedUrl, {
      signal: AbortSignal.timeout(10000)
    });

    let pipedResult = null;
    if (pipedResponse.ok) {
      const pipedData = await pipedResponse.json();
      pipedResult = {
        success: true,
        title: pipedData.title,
        hasAudioStreams: !!pipedData.audioStreams,
        audioStreamsCount: pipedData.audioStreams?.length || 0
      };
    } else {
      pipedResult = {
        success: false,
        status: pipedResponse.status,
        statusText: pipedResponse.statusText
      };
    }

    // Test Invidious API
    const invidiousUrl = `https://yewtu.be/api/v1/videos/${testVideoId}`;
    console.log('Testing Invidious API:', invidiousUrl);

    const invidiousResponse = await fetch(invidiousUrl, {
      signal: AbortSignal.timeout(10000)
    });

    let invidiousResult = null;
    if (invidiousResponse.ok) {
      const invidiousData = await invidiousResponse.json();
      invidiousResult = {
        success: true,
        title: invidiousData.title,
        hasAdaptiveFormats: !!invidiousData.adaptiveFormats,
        adaptiveFormatsCount: invidiousData.adaptiveFormats?.length || 0
      };
    } else {
      invidiousResult = {
        success: false,
        status: invidiousResponse.status,
        statusText: invidiousResponse.statusText
      };
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      testVideoId,
      piped: pipedResult,
      invidious: invidiousResult,
      summary: {
        pipedWorking: pipedResult?.success || false,
        invidiousWorking: invidiousResult?.success || false,
        anyWorking: (pipedResult?.success || false) || (invidiousResult?.success || false)
      }
    });

  } catch (error: any) {
    console.error('Test failed:', error);
    return NextResponse.json({
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
