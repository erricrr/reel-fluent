"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Square, Mic } from "lucide-react";
import type { Clip } from "@/lib/videoUtils";
import { cn } from "@/lib/utils";

interface ListenRepeatPracticeProps {
  mediaSrc?: string;
  clip: Clip;
  clipDisplayName: string;
  disabled?: boolean;
}

export default function ListenRepeatPractice({ mediaSrc, clip, clipDisplayName, disabled }: ListenRepeatPracticeProps) {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const recordingPlayerRef = useRef<HTMLAudioElement | null>(null);

  const cleanupRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cleanupRecording();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [cleanupRecording, recordedUrl]);

  const getPreferredMimeType = (): string | undefined => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/aac",
    ];
    for (const type of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return undefined;
  };

  const startRecording = async () => {
    setRecordingError(null);
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone recording not supported in this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const mimeType = getPreferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const url = URL.createObjectURL(finalBlob);
        setRecordedUrl(url);
        setIsRecording(false);
      };
      recorder.onerror = () => {
        setRecordingError("Recording error occurred.");
        setIsRecording(false);
      };
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setRecordingError((err as Error).message);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    cleanupRecording();
  };

  const controlsDisabled = disabled || !mediaSrc;

  return (
    <Card className="border bg-muted/20 overflow-hidden">
      <CardContent className="space-y-4 p-4 relative">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label className="text-sm font-semibold">Listen & Repeat</Label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Practice speaking by recording your voice, then compare with {clipDisplayName}.
            </p>
          </div>
        </div>

                {/* Recording Controls */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-full flex justify-center">
            {!isRecording ? (
              <Button
                variant="default"
                size="sm"
                onClick={startRecording}
                disabled={controlsDisabled}
                className="relative overflow-hidden transition-all hover:shadow-md min-w-[140px]"
              >
                <Mic className={cn(
                  "h-4 w-4 mr-2 transition-transform",
                  !controlsDisabled && "group-hover:scale-110"
                )} />
                Start Recording
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={stopRecording}
                className="relative group animate-pulse min-w-[140px]"
              >
                <Square className="h-4 w-4 mr-2 transition-transform group-hover:scale-110" />
                Stop
              </Button>
            )}
          </div>
        </div>

        {/* Error Message */}
        {recordingError && (
          <div className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20 p-2 rounded-md">
            {recordingError}
          </div>
        )}

        {/* Audio Player */}
        {recordedUrl && (
          <div className="space-y-2 bg-background/50 rounded-lg p-3 border shadow-sm">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Your Recording</Label>
            </div>
            <audio
              ref={recordingPlayerRef}
              src={recordedUrl}
              controls
              className="w-full h-8"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
