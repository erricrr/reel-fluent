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
 * Extracts audio from a segment of a video element and returns it as a Base64 Data URI.
 * This is a complex operation and relies on MediaRecorder API.
 * @param videoElement The HTMLVideoElement to extract audio from.
 * @param startTime The start time of the segment in seconds.
 * @param endTime The end time of the segment in seconds.
 * @returns A promise that resolves with the audio data URI (e.g., "data:audio/webm;base64,...") or null if extraction fails.
 */
export async function extractAudioFromVideoSegment(
  videoElement: HTMLVideoElement,
  startTime: number,
  endTime: number
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (!videoElement.captureStream) {
      console.error("videoElement.captureStream() not supported.");
      // Potentially show a toast message to the user here.
      // import { toast } from "@/hooks/use-toast";
      // toast({ title: "Browser Not Supported", description: "Audio extraction feature is not supported by your browser."});
      return reject(new Error("captureStream not supported"));
    }

    const originalCurrentTime = videoElement.currentTime;
    const originalMuted = videoElement.muted;
    const segmentDuration = (endTime - startTime) * 1000; // in milliseconds

    if (segmentDuration <= 0) {
      console.error("Invalid segment duration.");
      return reject(new Error("Invalid segment duration"));
    }
    
    // Temporarily mute video to avoid playing sound during recording if not desired.
    // videoElement.muted = true;
    videoElement.currentTime = startTime;

    try {
      const stream = videoElement.captureStream();
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.error("No audio tracks found in the video stream.");
        // videoElement.currentTime = originalCurrentTime;
        // videoElement.muted = originalMuted;
        return reject(new Error("No audio tracks"));
      }
      
      const audioStream = new MediaStream(audioTracks);
      const recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' }); // or audio/ogg, check browser compatibility
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.onerror = (err) => {
          console.error("FileReader error:", err);
          reject(err)
        };
        reader.readAsDataURL(blob);

        // Restore video state
        // videoElement.currentTime = originalCurrentTime; // Or set to endTime
        // videoElement.muted = originalMuted;
      };
      
      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        // videoElement.currentTime = originalCurrentTime;
        // videoElement.muted = originalMuted;
        reject(event);
      };

      recorder.start();
      videoElement.play().then(() => {
         // Let it play for the duration of the segment
        setTimeout(() => {
          if (recorder.state === "recording") {
            recorder.stop();
          }
          videoElement.pause(); // Pause after recording the segment
        }, segmentDuration);
      }).catch(playError => {
        console.error("Error playing video for recording:", playError);
        if (recorder.state === "recording") {
            recorder.stop(); // Stop recorder if play fails
        }
        reject(playError);
      });

    } catch (error) {
      console.error("Error setting up MediaRecorder:", error);
      // videoElement.currentTime = originalCurrentTime;
      // videoElement.muted = originalMuted;
      reject(error);
    }
  });
}
