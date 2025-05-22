
"use client"; // Mark as client component because it might use browser APIs

export interface Clip {
  id: string;
  startTime: number;
  endTime: number;
}

const CLIP_DURATION_SECONDS = 60; // 1 minute

/**
 * Generates an array of clip start and end times from a total video duration.
 * @param duration Total duration of the video in seconds.
 * @param clipLength Desired length of each clip in seconds (default 60).
 * @returns Array of Clip objects.
 */
export function generateClips(duration: number, clipLength: number = CLIP_DURATION_SECONDS): Clip[] {
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
      console.error("Video error during audio extraction setup:", event);
      const eventType = typeof event === 'string' ? event : (event.type || 'Unknown video error');
      cleanup();
      reject(new Error(`Video error during audio extraction: ${eventType}`));
    };

    const onLoadedMetadata = () => {
      console.log("Temporary video metadata loaded for audio extraction.");
      videoElement.currentTime = startTime;

      if (!videoElement.captureStream) {
        cleanup();
        return reject(new Error("Browser does not support video.captureStream() for audio extraction."));
      }

      const segmentDuration = (endTime - startTime) * 1000;
      if (segmentDuration <= 0) {
        cleanup();
        return reject(new Error("Invalid segment duration for audio extraction. Clip length must be positive."));
      }

      try {
        const stream = videoElement.captureStream();
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          cleanup();
          return reject(new Error("No audio tracks found in the video for extraction."));
        }
        
        const audioStream = new MediaStream(audioTracks);
        
        const mimeType = 'audio/webm'; // Or 'audio/ogg; codecs=opus' etc.
        if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported(mimeType)) {
            cleanup();
            return reject(new Error(`MediaRecorder API not supported or ${mimeType} MIME type not supported by your browser.`));
        }

        const recorder = new MediaRecorder(audioStream, { mimeType });
        const chunks: Blob[] = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onstop = () => {
          cleanup();
          const blob = new Blob(chunks, { type: recorder.mimeType });
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(reader.result as string);
          };
          reader.onerror = (err) => {
            console.error("FileReader error after recording audio segment:", err);
            reject(new Error("FileReader error after recording audio segment."));
          };
          reader.readAsDataURL(blob);
        };
        
        recorder.onerror = (event) => {
          cleanup();
          console.error("MediaRecorder error:", event);
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
          }, segmentDuration);
        }).catch(playError => {
          cleanup();
          console.error("Error playing temporary video for recording:", playError);
          if (recorder.state === "recording") {
            recorder.stop();
          }
          reject(new Error(`Failed to play video for audio extraction: ${(playError as Error).message}. This can happen if the video format is not fully supported.`));
        });

      } catch (error) {
        cleanup();
        console.error("Error setting up MediaRecorder for audio extraction:", error);
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
