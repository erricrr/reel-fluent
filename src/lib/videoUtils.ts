"use client";
import type { CorrectionToken } from '@/ai/flows/compare-transcriptions-flow';

// Extend HTMLMediaElement interface to include captureStream method
declare global {
  interface HTMLVideoElement {
    captureStream?(frameRate?: number): MediaStream;
    mozCaptureStream?(frameRate?: number): MediaStream;
  }

  interface HTMLAudioElement {
    captureStream?(frameRate?: number): MediaStream;
    mozCaptureStream?(frameRate?: number): MediaStream;
  }
}

export interface Clip {
  id: string;
  startTime: number;
  endTime: number;
  userTranscription?: string | null;
  automatedTranscription?: string | null;
  feedback?: string | null; // Kept for now, though UI repurposes this area
  englishTranslation?: string | null; // Legacy field - kept for backward compatibility
  translation?: string | null; // New flexible translation field
  translationTargetLanguage?: string | null; // Language the translation is in
  comparisonResult?: CorrectionToken[] | null;
  language?: string;
  isFocusedClip?: boolean; // Indicates if this is a user-created focused clip
  displayName?: string; // Optional display name for session clips
  mediaSourceId?: string; // ID of the media source this clip belongs to
}

export function generateClips(duration: number, clipLength: number, language: string, mediaSourceId?: string): Clip[] {
  if (isNaN(duration) || duration <= 0) {
    return [];
  }

  const clips: Clip[] = [];
  let currentTime = 0;
  let clipId = 0;
  const uniquePrefix = mediaSourceId ? `${mediaSourceId}-clip` : 'clip';

  while (currentTime < duration) {
    const endTime = Math.min(currentTime + clipLength, duration);
    clips.push({
      id: `${uniquePrefix}-${clipId++}`,
      startTime: currentTime,
      endTime: endTime,
      userTranscription: null,
      automatedTranscription: null,
      feedback: null,
      englishTranslation: null, // Legacy field
      translation: null, // New flexible translation field
      translationTargetLanguage: null,
      comparisonResult: null,
      language: language,
      isFocusedClip: false,
      mediaSourceId: mediaSourceId,
    });
    currentTime += clipLength;
  }
  return clips;
}

export function createFocusedClip(startTime: number, endTime: number, language: string, mediaSourceId?: string): Clip {
  const uniqueId = mediaSourceId ? `${mediaSourceId}-focused-clip-${Date.now()}` : `focused-clip-${Date.now()}`;
  return {
    id: uniqueId,
    startTime: startTime,
    endTime: endTime,
    userTranscription: null,
    automatedTranscription: null,
    feedback: null,
    englishTranslation: null,
    translation: null,
    translationTargetLanguage: null,
    comparisonResult: null,
    language: language,
    isFocusedClip: true,
    mediaSourceId: mediaSourceId,
  };
}

// Mobile browser detection
function isMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isTablet = /ipad|android(?!.*mobile)/i.test(userAgent);

  return isMobile || isTablet;
}

// Check if captureStream is supported
function isCaptureStreamSupported(): boolean {
  if (typeof window === 'undefined') return false;

  const video = document.createElement('video');
  const audio = document.createElement('audio');

  return (
    ('captureStream' in video && typeof video.captureStream === 'function') ||
    ('mozCaptureStream' in video && typeof (video as any).mozCaptureStream === 'function') ||
    ('captureStream' in audio && typeof audio.captureStream === 'function') ||
    ('mozCaptureStream' in audio && typeof (audio as any).mozCaptureStream === 'function')
  );
}

// Server-side audio extraction for mobile browsers
async function extractAudioServerSide(
  mediaSrcUrl: string,
  startTime: number,
  endTime: number,
  sourceType: 'audio' | 'video'
): Promise<string> {
  console.log('Using server-side audio extraction for mobile browser', {
    url: mediaSrcUrl.substring(0, 50) + '...',
    startTime,
    endTime,
    sourceType,
    isBlobUrl: mediaSrcUrl.startsWith('blob:')
  });

  try {
    let response: Response;

    if (mediaSrcUrl.startsWith('blob:')) {
      // Handle blob URLs by fetching the blob and uploading it
      console.log('Blob URL detected, fetching blob and uploading to server');

      const blobResponse = await fetch(mediaSrcUrl);
      const blob = await blobResponse.blob();

      // Create form data for file upload
      const formData = new FormData();
      formData.append('file', blob, 'media_file');
      formData.append('startTime', startTime.toString());
      formData.append('endTime', endTime.toString());
      formData.append('sourceType', sourceType);

      response = await fetch('/api/audio/extract', {
        method: 'POST',
        body: formData,
      });
    } else {
      // Handle regular URLs
      response = await fetch('/api/audio/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: mediaSrcUrl,
          startTime,
          endTime,
          sourceType
        }),
      });
    }

    if (!response.ok) {
      let errorMessage = `Server returned ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (parseError) {
        console.warn('Could not parse error response:', parseError);
      }
      throw new Error(errorMessage);
    }

    // Get the audio blob and convert to data URI
    const audioBlob = await response.blob();

    if (audioBlob.size === 0) {
      throw new Error('Server returned empty audio file');
    }

    console.log('Server-side audio extraction successful, blob size:', Math.round(audioBlob.size / 1024) + ' KB');

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to convert audio blob to data URI'));
      reader.readAsDataURL(audioBlob);
    });
  } catch (error) {
    console.error('Server-side audio extraction error:', error);
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Could not connect to audio extraction service');
    }
    throw error;
  }
}

export async function extractAudioFromVideoSegment(
  mediaSrcUrl: string | undefined,
  startTime: number,
  endTime: number,
  sourceType: 'audio' | 'video' = 'video'
): Promise<string | null> {
  if (!mediaSrcUrl) {
    throw new Error("No media source URL provided for audio extraction");
  }

  // Validate time parameters
  if (typeof startTime !== 'number' || typeof endTime !== 'number' || startTime >= endTime) {
    throw new Error(`Invalid time parameters: start=${startTime}, end=${endTime}`);
  }

  // Check if we should use server-side extraction
  const shouldUseServerSide = isMobileBrowser() || !isCaptureStreamSupported();

  if (shouldUseServerSide) {
    try {
      console.log('Using server-side audio extraction', {
        startTime,
        endTime,
        sourceType,
        isBlobUrl: mediaSrcUrl.startsWith('blob:')
      });
      return await extractAudioServerSide(mediaSrcUrl, startTime, endTime, sourceType);
    } catch (error) {
      console.error('Server-side audio extraction failed:', error);
      // For mobile browsers, don't fall back to client-side as it won't work
      if (isMobileBrowser()) {
        throw new Error(`Mobile browser audio extraction failed: ${(error as Error).message}. Please try again or use a different media source.`);
      }
      console.warn('Server-side failed, attempting client-side fallback');
      // Fall through to client-side extraction as fallback for desktop
    }
  }

  // Original client-side extraction
  return new Promise((resolve, reject) => {
    const mediaElement = document.createElement(sourceType);
    mediaElement.crossOrigin = "anonymous";
    mediaElement.preload = "auto";

    const cleanup = () => {
      mediaElement.removeEventListener('loadedmetadata', onLoadedMetadata);
      mediaElement.removeEventListener('error', onErrorHandler);
      mediaElement.removeEventListener('stalled', onErrorHandler);
      if (!mediaElement.paused) {
        mediaElement.pause();
      }
    };

    const onErrorHandler = (event: Event | string) => {
      let eventType = 'Unknown media error';
      let errorCode = 'N/A';
      let errorMessage = 'No specific error message.';

      if (typeof event === 'string') {
        eventType = event;
      } else if (event && (event as Event).type) {
        eventType = (event as Event).type;
      }

      const htmlMediaElement = mediaElement as HTMLVideoElement | HTMLAudioElement;
      if (htmlMediaElement.error) {
        errorCode = String(htmlMediaElement.error.code);
        errorMessage = htmlMediaElement.error.message || 'No specific error message from media element.';
        eventType += ` (Code: ${errorCode})`;
      }

      console.warn(`Media error during audio extraction setup. Source Type: ${sourceType}, Event Type: ${eventType}, Original Event:`, event, `Media Element Error: {code: ${errorCode}, message: "${errorMessage}"}`);

      cleanup();
      reject(new Error(`Media error during audio extraction: ${eventType}. Message: ${errorMessage}`));
    };

    const onLoadedMetadata = () => {
      console.log(`Temporary ${sourceType} metadata loaded for audio extraction. Duration: ${mediaElement.duration}s. Seeking to: ${startTime}s.`);
      mediaElement.currentTime = startTime;

      const mediaElementForCapture = mediaElement as HTMLVideoElement | HTMLAudioElement;

      // Check for captureStream support with proper type handling
      const hasCaptureStream = 'captureStream' in mediaElementForCapture && typeof mediaElementForCapture.captureStream === 'function';
      const hasMozCaptureStream = 'mozCaptureStream' in mediaElementForCapture && typeof (mediaElementForCapture as any).mozCaptureStream === 'function';

      if (!hasCaptureStream && !hasMozCaptureStream) {
        cleanup();
        return reject(new Error(`Browser does not support ${sourceType}.captureStream() for audio extraction. Try using a different browser or device.`));
      }

      const segmentDuration = (endTime - startTime) * 1000;
      if (segmentDuration <= 0) {
        cleanup();
        return reject(new Error("Invalid segment duration for audio extraction. Clip length must be positive."));
      }

      try {
        // Use the appropriate capture method with proper type handling
        const stream = hasCaptureStream
          ? mediaElementForCapture.captureStream!()
          : (mediaElementForCapture as any).mozCaptureStream();
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          cleanup();
          return reject(new Error(`No audio tracks found in the ${sourceType} for extraction.`));
        }

        const audioStream = new MediaStream(audioTracks);

        const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/aac'];
        let selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

        if (typeof MediaRecorder === "undefined" || !selectedMimeType) {
            cleanup();
            return reject(new Error(`MediaRecorder API not supported or none of the tested MIME types (${mimeTypes.join(', ')}) are supported by your browser for ${sourceType}.`));
        }

        console.log(`Using MIME type for MediaRecorder: ${selectedMimeType}`);
        const recorder = new MediaRecorder(audioStream, { mimeType: selectedMimeType });
        const chunks: Blob[] = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onstop = () => {
          cleanup();
          if (chunks.length === 0) {
            console.warn("Audio extraction: No data recorded. This might happen if the media segment is too short, silent, or playback didn't occur correctly.");
            reject(new Error("No audio data recorded from the segment. Please ensure the media is playing correctly and contains audio."));
            return;
          }
          const blob = new Blob(chunks, { type: recorder.mimeType });
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(reader.result as string);
          };
          reader.onerror = (err) => {
            console.warn("FileReader error after recording audio segment:", err);
            reject(new Error("FileReader error after recording audio segment."));
          };
          reader.readAsDataURL(blob);
        };

        recorder.onerror = (event) => {
          cleanup();
          console.warn("MediaRecorder error:", event);
          reject(new Error("MediaRecorder error during audio segment recording."));
        };

        recorder.start();
        mediaElement.muted = true;

        // Add a small delay before playing to ensure the recorder is ready
        setTimeout(() => {
          mediaElement.play().then(() => {
            console.log(`Temporary ${sourceType} playback started for recording clip: ${startTime}s - ${endTime}s.`);
            setTimeout(() => {
              if (recorder.state === "recording") {
                console.log(`Stopping MediaRecorder for clip: ${startTime}s - ${endTime}s.`);
                recorder.stop();
              }
              if (!mediaElement.paused) {
                mediaElement.pause();
              }
            }, segmentDuration + 500);
          }).catch(playError => {
            cleanup();
            console.warn(`Error playing temporary ${sourceType} for recording:`, playError);
            if (recorder.state === "recording") {
              recorder.stop();
            }
            reject(new Error(`Failed to play ${sourceType} for audio extraction: ${(playError as Error).message}. This can happen if the media format is not fully supported or due to browser restrictions.`));
          });
        }, 100);

      } catch (error) {
        cleanup();
        console.warn(`Error setting up MediaRecorder for ${sourceType} audio extraction:`, error);
        reject(new Error(`Setup error for audio extraction: ${(error as Error).message}`));
      }
    };

    mediaElement.addEventListener('loadedmetadata', onLoadedMetadata);
    mediaElement.addEventListener('error', onErrorHandler);
    mediaElement.addEventListener('stalled', onErrorHandler);

    mediaElement.src = mediaSrcUrl;
    mediaElement.load();
  });
}
