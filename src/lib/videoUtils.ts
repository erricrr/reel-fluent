
"use client"; // Mark as client component because it might use browser APIs

export interface Clip {
  id: string;
  startTime: number;
  endTime: number;
  userTranscription?: string | null;
  automatedTranscription?: string | null;
  feedback?: string | null;
  comparisonResult?: CorrectionToken[] | null; // From compare-transcriptions-flow
  language?: string;
}

// Define CorrectionToken type locally if it's not imported from the flow directly
// to avoid circular dependencies or if videoUtils is a very low-level utility.
// However, for simplicity and if it's closely tied, direct import is fine.
// For now, assuming CorrectionToken is available or can be defined.
interface CorrectionToken {
  token: string;
  status: "correct" | "incorrect" | "extra" | "missing";
  suggestion?: string;
}


/**
 * Generates an array of clip objects from a total media duration.
 * @param duration Total duration of the media in seconds.
 * @param clipLength Desired length of each clip in seconds.
 * @param language The language of the media.
 * @returns Array of Clip objects.
 */
export function generateClips(duration: number, clipLength: number, language: string): Clip[] {
  if (isNaN(duration) || duration <= 0) {
    return [];
  }

  const clips: Clip[] = [];
  let currentTime = 0;
  let clipId = 0;

  while (currentTime < duration) {
    const endTime = Math.min(currentTime + clipLength, duration);
    clips.push({
      id: `clip-${clipId++}`,
      startTime: currentTime,
      endTime: endTime,
      userTranscription: null,
      automatedTranscription: null,
      feedback: null,
      comparisonResult: null,
      language: language,
    });
    currentTime += clipLength;
  }
  return clips;
}

/**
 * Extracts audio from a segment of a video source URL and returns it as a Base64 Data URI.
 * This function creates a temporary video element to perform the extraction.
 * @param videoSrcUrl The URL of the video source (e.g., from URL.createObjectURL).
 * @param startTime The start time of the segment in seconds.
 * @param endTime The end time of the segment in seconds.
 * @returns A promise that resolves with the audio data URI (e.g., "data:audio/webm;base64,...") or null if extraction fails.
 */
export async function extractAudioFromVideoSegment(
  videoSrcUrl: string,
  startTime: number,
  endTime: number
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const videoElement = document.createElement('video');
    videoElement.crossOrigin = "anonymous";
    videoElement.preload = "auto"; // Hint to browser to load metadata

    const cleanup = () => {
      // Remove event listeners to prevent memory leaks
      videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
      videoElement.removeEventListener('error', onErrorHandler);
      videoElement.removeEventListener('stalled', onErrorHandler);
      // If video element was added to DOM (it's not here), remove it
      // Revoke object URL if created by this function (it's not here, src is passed in)
    };

    const onErrorHandler = (event: Event | string) => {
      let eventType = 'Unknown video error';
      let errorCode = 'N/A';
      let errorMessage = 'No specific error message.';

      if (typeof event === 'string') {
        eventType = event;
      } else if (event && (event as Event).type) {
        eventType = (event as Event).type;
      }

      if (videoElement.error) {
        errorCode = String(videoElement.error.code);
        errorMessage = videoElement.error.message || 'No specific error message from video element.';
        eventType += ` (Code: ${errorCode})`;
      }
      
      console.warn(`Video error during audio extraction setup. Event Type: ${eventType}, Original Event:`, event, `Video Element Error: {code: ${errorCode}, message: "${errorMessage}"}`);
      
      cleanup();
      reject(new Error(`Video error during audio extraction: ${eventType}. Message: ${errorMessage}`));
    };

    const onLoadedMetadata = () => {
      console.log("Temporary video metadata loaded for audio extraction.");
      videoElement.currentTime = startTime;

      if (!videoElement.captureStream && !(videoElement as any).mozCaptureStream) { // Added mozCaptureStream for Firefox
        cleanup();
        return reject(new Error("Browser does not support video.captureStream() for audio extraction."));
      }

      const segmentDuration = (endTime - startTime) * 1000;
      if (segmentDuration <= 0) {
        cleanup();
        return reject(new Error("Invalid segment duration for audio extraction. Clip length must be positive."));
      }

      try {
        const stream = videoElement.captureStream ? videoElement.captureStream() : (videoElement as any).mozCaptureStream(); // Added mozCaptureStream for Firefox
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          cleanup();
          return reject(new Error("No audio tracks found in the video for extraction."));
        }
        
        const audioStream = new MediaStream(audioTracks);
        
        // Prefer 'audio/webm;codecs=opus' if available, fallback to 'audio/webm'
        const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
        let selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

        if (typeof MediaRecorder === "undefined" || !selectedMimeType) {
            cleanup();
            return reject(new Error(`MediaRecorder API not supported or none of the tested MIME types (${mimeTypes.join(', ')}) are supported by your browser.`));
        }

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
            console.warn("Audio extraction: No data recorded. This might happen if the media segment is too short or silent.");
            // Depending on desired behavior, you might reject or resolve with null/empty.
            // For now, let's treat it as a failure to get meaningful audio.
            reject(new Error("No audio data recorded from the segment."));
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
        videoElement.muted = true; // Mute playback of the temporary element
        videoElement.play().then(() => {
          setTimeout(() => {
            if (recorder.state === "recording") {
              recorder.stop();
            }
            videoElement.pause();
          }, segmentDuration + 200); // Add a small buffer
        }).catch(playError => {
          cleanup();
          console.warn("Error playing temporary video for recording:", playError);
          if (recorder.state === "recording") {
            recorder.stop(); // Attempt to stop recorder even if play fails
          }
          reject(new Error(`Failed to play video for audio extraction: ${(playError as Error).message}. This can happen if the video format is not fully supported.`));
        });

      } catch (error) {
        cleanup();
        console.warn("Error setting up MediaRecorder for audio extraction:", error);
        reject(new Error(`Setup error for audio extraction: ${(error as Error).message}`));
      }
    };

    videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
    videoElement.addEventListener('error', onErrorHandler);
    videoElement.addEventListener('stalled', onErrorHandler); // Handle cases where loading might stall

    videoElement.src = videoSrcUrl;
    videoElement.load(); // Explicitly call load to trigger metadata loading
  });
}
