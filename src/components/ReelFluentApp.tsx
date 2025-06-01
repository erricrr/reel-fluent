"use client";

import type * as React from 'react';
import { useState, useCallback, useEffect, useRef } from "react";
import Header from "./Header";
import VideoInputForm from "./VideoInputForm";
import LanguageSelector from "./LanguageSelector";
import ClipDurationSelector from "./ClipDurationSelector";
import TranscriptionWorkspace from "./TranscriptionWorkspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileVideo, X as XIcon, FileAudio, Save, List } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateClips, createFocusedClip, type Clip, extractAudioFromVideoSegment } from "@/lib/videoUtils";
import { formatSecondsToMMSS } from '@/lib/timeUtils';
import { transcribeAudio } from "@/ai/flows/transcribe-audio";
import { translateTranscription } from "@/ai/flows/translate-transcription-flow"; // New import
import { compareTranscriptions, type CorrectionToken } from "@/ai/flows/compare-transcriptions-flow";
import { useAuth } from '@/contexts/AuthContext';
import { saveMediaItemAction } from '@/app/actions';
import { isYouTubeUrl, processYouTubeUrl, type YouTubeVideoInfo, type ProgressCallback } from '@/lib/youtubeUtils';
import { Progress } from "@/components/ui/progress";
import SessionClipsManager from './SessionClipsManager';
import { cn } from "@/lib/utils";

const MAX_MEDIA_DURATION_MINUTES = 30;

interface MediaSource {
  id: string;
  src: string;
  displayName: string;
  type: 'video' | 'audio' | 'url' | 'unknown';
  duration: number;
}

interface SessionClip extends Clip {
  displayName?: string;
  mediaSourceId?: string;  // Make optional for backward compatibility
  // Legacy fields for backward compatibility
  originalMediaName?: string;
  mediaSrc?: string;
  sourceType?: 'video' | 'audio' | 'url' | 'unknown';
}

const MediaSourceList = ({
  sources,
  activeSourceId,
  onSelectSource,
  onRemoveSource,
  disabled
}: {
  sources: MediaSource[];
  activeSourceId: string | null;
  onSelectSource: (sourceId: string) => void;
  onRemoveSource: (sourceId: string) => void;
  disabled: boolean;
}) => {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">Media Sources ({sources.length}/3)</h3>
      <div className="space-y-2">
        {sources.map((source) => (
          <div
            key={source.id}
            className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
              source.id === activeSourceId
                ? 'border-primary bg-primary/10'
                : 'border-border bg-muted/50'
            }`}
          >
            <button
              className="flex items-center gap-3 min-w-0 flex-grow text-left"
              onClick={() => onSelectSource(source.id)}
              disabled={disabled}
            >
              {source.type === 'audio' ? (
                <FileAudio className="h-5 w-5 flex-shrink-0" />
              ) : (
                <FileVideo className="h-5 w-5 flex-shrink-0" />
              )}
              <span className="truncate text-sm" title={source.displayName}>
                {source.displayName}
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveSource(source.id);
              }}
              disabled={disabled}
              className="flex-shrink-0"
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

const YouTubeProcessingLoader = ({ status }: { status: string }) => (
  <div className="mt-4 transition-all duration-300 ease-in-out">
    <div className="p-4 border border-primary/20 rounded-lg bg-primary/5">
      <div className="flex flex-col items-center space-y-3">
        <div className="flex justify-center space-x-1">
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
        <p className="text-sm text-muted-foreground text-center">{status}</p>
      </div>
    </div>
  </div>
);

export default function ReelFluentApp() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined);
  const [mediaSrc, setMediaSrc] = useState<string | undefined>(undefined);
  const objectUrlRef = useRef<string | undefined>(undefined);
  const [mediaDisplayName, setMediaDisplayName] = useState<string | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number>(0);

  const [clips, setClips] = useState<Clip[]>([]);
  const [currentClipIndex, setCurrentClipIndex] = useState<number>(0);

  const [language, setLanguage] = useState<string>("vietnamese");
  const [clipSegmentationDuration, setClipSegmentationDuration] = useState<number>(15);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isAnyClipTranscribing, setIsAnyClipTranscribing] = useState<boolean>(false);

  // Processing progress state
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [isYouTubeProcessing, setIsYouTubeProcessing] = useState<boolean>(false);

  const [currentSourceType, setCurrentSourceType] = useState<'video' | 'audio' | 'url' | 'unknown' | null>(null);
  const [youtubeVideoInfo, setYoutubeVideoInfo] = useState<YouTubeVideoInfo | null>(null);

  // Focused clip state
  const [focusedClip, setFocusedClip] = useState<Clip | null>(null);
  const [showClipTrimmer, setShowClipTrimmer] = useState<boolean>(false);

  const processingIdRef = useRef<number>(0);
  const { user } = useAuth();
  const { toast } = useToast();

  const isYouTubeVideo = sourceUrl ? isYouTubeUrl(sourceUrl) : false;

  const [sessionClips, setSessionClips] = useState<SessionClip[]>([]);
  const [isSessionDrawerOpen, setSessionDrawerOpen] = useState<boolean>(false);

  // Add state for media sources
  const [mediaSources, setMediaSources] = useState<MediaSource[]>([]);
  const [activeMediaSourceId, setActiveMediaSourceId] = useState<string | null>(null);

  const [workInProgressClips, setWorkInProgressClips] = useState<Record<string, Clip>>({});

  const clipsRef = useRef(clips);
  const languageRef = useRef(language);
  const activeMediaSourceIdRef = useRef(activeMediaSourceId);

  // Keep refs in sync with state
  useEffect(() => {
    clipsRef.current = clips;
    languageRef.current = language;
    activeMediaSourceIdRef.current = activeMediaSourceId;
  }, [clips, language, activeMediaSourceId]);

  useEffect(() => {
    const currentlyTranscribing = clips.some(clip => clip.automatedTranscription === "Transcribing...");
    setIsAnyClipTranscribing(currentlyTranscribing);
  }, [clips]);

  const updateClipData = useCallback((clipId: string, data: Partial<Omit<Clip, 'id' | 'startTime' | 'endTime'>>) => {
    setClips(prevClips =>
      prevClips.map(clip =>
        clip.id === clipId ? { ...clip, ...data, language: clip.language || language } : clip
      )
    );

    // Also update focusedClip state if the updated clip is the focused clip
    setFocusedClip(prevFocusedClip => {
      if (prevFocusedClip && prevFocusedClip.id === clipId) {
        return { ...prevFocusedClip, ...data, language: prevFocusedClip.language || language };
      }
      return prevFocusedClip;
    });

    // Update sessionClips for saved clips (match by mediaSourceId and time)
    const oldClip = clipsRef.current.find(c => c.id === clipId);
    if (oldClip) {
      setSessionClips(prevClips =>
        prevClips.map(sessionClip =>
          sessionClip.mediaSourceId === activeMediaSourceIdRef.current &&
          sessionClip.startTime === oldClip.startTime &&
          sessionClip.endTime === oldClip.endTime
            ? { ...sessionClip, ...data }
            : sessionClip
        )
      );
    }
  }, [language]);

  const resetAppState = useCallback(() => {
    processingIdRef.current += 1;
    console.log("LinguaClipApp: resetAppState called. Current isAnyClipTranscribing:", isAnyClipTranscribing);

    if (objectUrlRef.current) {
      if (!isAnyClipTranscribing) {
        console.log("LinguaClipApp: resetAppState revoking object URL:", objectUrlRef.current);
        URL.revokeObjectURL(objectUrlRef.current);
      } else {
        console.warn("LinguaClipApp: resetAppState SKIPPED revoking object URL due to ongoing transcription:", objectUrlRef.current);
      }
      objectUrlRef.current = undefined;
    }

    setSourceFile(null);
    setSourceUrl(undefined);
    setMediaSrc(undefined);
    setMediaDisplayName(null);
    setMediaDuration(0);
    setClips([]);
    setCurrentClipIndex(0);
    setIsLoading(false);
    setIsSaving(false);
    setCurrentSourceType(null);
    setYoutubeVideoInfo(null);
    setClipSegmentationDuration(15);
    setProcessingProgress(0);
    setProcessingStatus("");
    setIsYouTubeProcessing(false);
    setFocusedClip(null);
    setShowClipTrimmer(false);
  }, [isAnyClipTranscribing]);

  const handleSourceLoad = useCallback(async (source: { file?: File; url?: string }) => {
    if (mediaSources.length >= 3) {
      toast({
        variant: "destructive",
        title: "Media Limit Reached",
        description: "You can only have up to 3 media sources. Please remove one before adding another.",
      });
      return;
    }

    const localProcessingId = processingIdRef.current + 1;
    processingIdRef.current = localProcessingId;

    setIsLoading(true);
    setProcessingProgress(10);
    setProcessingStatus("Initializing media processing...");

    let newMediaSrc: string | undefined = undefined;
    let displayName: string | null = null;
    let determinedSourceType: 'video' | 'audio' | 'url' | 'unknown' = 'unknown';
    let mediaElementTypeForLoad: 'video' | 'audio' = 'video';

    if (source.file) {
      setSourceFile(source.file);
      displayName = source.file.name;
      setProcessingProgress(30);
      setProcessingStatus("Loading media file...");

      try {
        newMediaSrc = URL.createObjectURL(source.file);
        objectUrlRef.current = newMediaSrc;
        console.log("LinguaClipApp: handleSourceLoad CREATED new object URL:", newMediaSrc);
        setProcessingProgress(40);
        setProcessingStatus("Analyzing media file...");
      } catch (error) {
        if (processingIdRef.current !== localProcessingId) return;
        toast({ variant: "destructive", title: "File Error", description: "Could not create a URL for the file." });
        setIsLoading(false);
        resetAppState();
        return;
      }

      if (source.file.type.startsWith('video/')) {
        determinedSourceType = 'video';
        mediaElementTypeForLoad = 'video';
      } else if (source.file.type.startsWith('audio/')) {
        determinedSourceType = 'audio';
        mediaElementTypeForLoad = 'audio';
      } else {
        if (processingIdRef.current !== localProcessingId) {
          if (newMediaSrc) {
            console.log("LinguaClipApp: handleSourceLoad (unsupported file type) revoking new object URL due to processingId mismatch:", newMediaSrc);
            URL.revokeObjectURL(newMediaSrc);
            objectUrlRef.current = undefined;
          }
          return;
        }
        toast({ variant: "destructive", title: "Unsupported File", description: "Please upload a valid video or audio file." });
        setIsLoading(false);
        resetAppState();
        return;
      }
    } else if (source.url) {
      setSourceUrl(source.url);

      if (isYouTubeUrl(source.url)) {
        console.log("LinguaClipApp: Processing YouTube URL:", source.url);
        setIsYouTubeProcessing(true);
        setProcessingStatus("Preparing to extract audio from YouTube video...");

        try {
          const youtubeStatusCallback = (progress: number, status: string) => {
            if (processingIdRef.current === localProcessingId) {
              setProcessingStatus(status || "Extracting audio...");
            }
          };

          const { file: audioFile, videoInfo } = await processYouTubeUrl(source.url, youtubeStatusCallback);

          if (processingIdRef.current !== localProcessingId) {
            setIsLoading(false);
            setIsYouTubeProcessing(false);
            return;
          }

          setProcessingStatus("Processing YouTube audio file...");
          setYoutubeVideoInfo(videoInfo);
          setSourceFile(audioFile);
          displayName = videoInfo.title;

          try {
            newMediaSrc = URL.createObjectURL(audioFile);
            objectUrlRef.current = newMediaSrc;
          } catch (error) {
            setIsYouTubeProcessing(false);
            if (processingIdRef.current !== localProcessingId) return;
            toast({
              variant: "destructive",
              title: "Error",
              description: "Could not process YouTube audio.",
              duration: 5000
            });
            setIsLoading(false);
            resetAppState();
            return;
          }

          determinedSourceType = 'audio';
          mediaElementTypeForLoad = 'audio';

          // Successfully processed YouTube video
          setIsYouTubeProcessing(false);

        } catch (error: any) {
          setIsYouTubeProcessing(false);
          if (processingIdRef.current !== localProcessingId) return;
          console.error("YouTube processing error:", error);
          toast({
            variant: "destructive",
            title: "YouTube Processing Failed",
            description: error.message || "Could not extract audio from YouTube video.",
            duration: 5000
          });
          setIsLoading(false);
          resetAppState();
          return;
        }
      } else {
        displayName = source.url;
        newMediaSrc = source.url;

        // Detect if URL points to an audio file based on extension
        const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a'];
        const urlPath = source.url.toLowerCase();
        const isAudioUrl = audioExtensions.some(ext => urlPath.includes(ext));

        // Check for potentially problematic formats and warn user
        const problematicFormats = ['.aac', '.flac', '.wma', '.opus'];
        const isProblematicFormat = problematicFormats.some(ext => urlPath.includes(ext));

        if (isProblematicFormat) {
          toast({
            title: "Format Compatibility Warning",
            description: "This audio format may not work in all browsers. MP3 or WAV are recommended for best compatibility.",
          });
        }

        if (isAudioUrl || isProblematicFormat) {
          determinedSourceType = 'audio';
          mediaElementTypeForLoad = 'audio';
        } else {
          determinedSourceType = 'url';
          mediaElementTypeForLoad = 'video';
        }

        // Check if this looks like an unsupported video platform
        const unsupportedPlatforms = [
          { name: 'Vimeo', regex: /vimeo\.com/i },
          { name: 'TikTok', regex: /tiktok\.com/i },
          { name: 'Instagram', regex: /instagram\.com/i },
          { name: 'Facebook', regex: /facebook\.com|fb\.watch/i },
          { name: 'Twitter/X', regex: /twitter\.com|x\.com/i },
          { name: 'Dailymotion', regex: /dailymotion\.com/i },
          { name: 'Twitch', regex: /twitch\.tv/i }
        ];

        const unsupportedPlatform = unsupportedPlatforms.find(platform =>
          source.url && platform.regex.test(source.url)
        );

        if (unsupportedPlatform) {
          if (processingIdRef.current !== localProcessingId) return;
          toast({
            variant: "destructive",
            title: `${unsupportedPlatform.name} Not Supported`,
            description: `Currently only YouTube URLs and direct video file links are supported. Please try a YouTube URL or upload the file directly.`
          });
          setIsLoading(false);
          resetAppState();
          return;
        }
      }
    } else {
      if (processingIdRef.current !== localProcessingId) return;
      toast({ variant: "destructive", title: "Error", description: "No media source provided." });
      setIsLoading(false);
      return;
    }

    if (processingIdRef.current !== localProcessingId) {
      if (source.file && newMediaSrc && objectUrlRef.current === newMediaSrc) {
        console.log("LinguaClipApp: handleSourceLoad (processingId mismatch post-file-load) revoking object URL:", newMediaSrc);
        URL.revokeObjectURL(newMediaSrc);
        objectUrlRef.current = undefined;
      }
      return;
    }

    // When media is successfully loaded, add it to mediaSources
    const newMediaSource: MediaSource = {
      id: generateUniqueId(),
      src: newMediaSrc!,
      displayName: displayName || 'Unknown Media',
      type: determinedSourceType,
      duration: mediaDuration
    };

    // Exit focused clip mode when loading new media
    setFocusedClip(null);
    setShowClipTrimmer(false);

    setMediaSources(prev => [...prev, newMediaSource]);
    setActiveMediaSourceId(newMediaSource.id);

    // Update other state as needed
    setMediaSrc(newMediaSrc);
    setMediaDisplayName(displayName);
    setCurrentSourceType(determinedSourceType);

    // Clear source URL after successful loading
    setSourceUrl(undefined);

    // Load media metadata
    if (newMediaSrc) {
      const tempMediaElement = document.createElement(mediaElementTypeForLoad);
      tempMediaElement.onloadedmetadata = () => {
        if (processingIdRef.current !== localProcessingId) {
          if (source.file && newMediaSrc?.startsWith('blob:') && objectUrlRef.current === newMediaSrc) {
            console.log("LinguaClipApp: onloadedmetadata (processingId mismatch) revoking object URL:", newMediaSrc);
            URL.revokeObjectURL(newMediaSrc);
            objectUrlRef.current = undefined;
          }
          return;
        }
        setProcessingProgress(60);
        setProcessingStatus("Loading media metadata...");
        setMediaDuration(tempMediaElement.duration);
      };
      tempMediaElement.onerror = (e) => {
        if (processingIdRef.current !== localProcessingId) {
          if (source.file && newMediaSrc?.startsWith('blob:') && objectUrlRef.current === newMediaSrc) {
            console.log("LinguaClipApp: onerror (processingId mismatch) revoking object URL:", newMediaSrc);
            URL.revokeObjectURL(newMediaSrc);
            objectUrlRef.current = undefined;
          }
          return;
        }
        console.warn(`Error loading ${determinedSourceType === 'audio' ? 'audio' : 'video'} metadata for ${displayName}:`, e, tempMediaElement.error);

        // Provide helpful error messages based on context
        let errorDescription = `Could not load ${determinedSourceType === 'audio' ? 'audio' : 'video'} metadata. The file might be corrupt or in an unsupported format.`;

        if (source.url && determinedSourceType === 'audio') {
          // Check if it might be an unsupported audio format
          const lessCompatibleFormats = ['.aac', '.flac', '.wma', '.opus'];
          const isLessCompatible = lessCompatibleFormats.some(ext => source.url!.toLowerCase().includes(ext));

          if (isLessCompatible) {
            errorDescription = `This audio format may not be supported by your browser. Try converting to MP3 or WAV for best compatibility.`;
          }
        }

        toast({ variant: "destructive", title: "Media Load Error", description: errorDescription });
        setIsLoading(false);
        resetAppState();
      };
      tempMediaElement.src = newMediaSrc;
      tempMediaElement.load();
    } else {
      if (processingIdRef.current !== localProcessingId) return;
      setIsLoading(false);
      toast({ variant: "destructive", title: "Error", description: "Media source became unavailable." });
    }
  }, [resetAppState, toast, mediaSources, isYouTubeUrl]);


  useEffect(() => {
    if (focusedClip) {
      // Skip auto-generation when working with a focused clip
      return;
    }
    if (mediaSrc && mediaDuration > 0) {
      const currentProcessingId = processingIdRef.current;
      setIsLoading(true);
      setProcessingProgress(70);
      setProcessingStatus("Generating clips...");

      const newGeneratedClips = generateClips(mediaDuration, clipSegmentationDuration, language);

      if (processingIdRef.current !== currentProcessingId) {
        setIsLoading(false);
        return;
      }

      setProcessingProgress(90);
      setProcessingStatus("Finalizing clip setup...");
      setClips(newGeneratedClips);
      setCurrentClipIndex(0);
      setIsLoading(false);
    } else if (!mediaSrc && clips.length > 0) {
      setClips([]);
      setCurrentClipIndex(0);
    }
  }, [mediaSrc, mediaDuration, clipSegmentationDuration, language, toast, currentSourceType, focusedClip]);


  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        console.log("LinguaClipApp: Component unmounting, revoking object URL:", objectUrlRef.current);
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = undefined;
      }
    };
  }, []);

  const handleSelectClip = (index: number) => {
    if (index >= 0 && index < clips.length) {
      setCurrentClipIndex(index);
    }
  };

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
  };

  const handleClipDurationChange = (newDurationValue: string) => {
    const newDuration = parseInt(newDurationValue, 10);
    if (!isNaN(newDuration) && (newDuration === 15 || newDuration === 30 || newDuration === 60)) {
      setClipSegmentationDuration(newDuration);
    }
  };

  const handleUserTranscriptionChange = (clipId: string, newUserTranscription: string) => {
    // Update the user transcription and clear any existing comparison results to allow re-comparison
    updateClipData(clipId, { userTranscription: newUserTranscription, comparisonResult: null });
  };

  const handleTranscribeAudio = useCallback(async (clipId: string) => {
    // Find the clip to transcribe - either from the clips array or the focused clip
    const clipToTranscribe = focusedClip?.id === clipId ? focusedClip : clipsRef.current.find(c => c.id === clipId);
    if (!clipToTranscribe || !mediaSrc) {
      toast({variant: "destructive", title: "Cannot Transcribe", description: "Please ensure media is loaded and a clip is selected."});
      return;
    }

    setIsAnyClipTranscribing(true);

    // Helper to update clip data (clips, focusedClip, sessionClips) and workInProgress
    const updateClipState = (newState: Partial<Clip>) => {
      // Update main and focused clip arrays and session storage
      updateClipData(clipId, newState);
      // Update work in progress state
      setWorkInProgressClips(prev => ({
        ...prev,
        [clipId]: { ...(prev[clipId] || clipToTranscribe), ...newState } as Clip
      }));
    };

    // Set transcribing state
    updateClipState({ automatedTranscription: "Transcribing..." });

    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`Retrying audio extraction (attempt ${attempt} of ${maxRetries})`);
          // Add a small delay between retries
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const audioDataUri = await extractAudioFromVideoSegment(
          mediaSrc,
          clipToTranscribe.startTime,
          clipToTranscribe.endTime,
          currentSourceType === 'audio' ? 'audio' : 'video'
        );

        if (!audioDataUri) {
          throw new Error("Failed to extract audio from the clip");
        }

        const result = await transcribeAudio({
          audioDataUri,
          language: clipToTranscribe.language || language,
        });

        // Update with transcription result
        updateClipState({ automatedTranscription: result.transcription });
        toast({ title: "Transcription Complete" });
        return; // Success, exit the retry loop
      } catch (error) {
        console.error(`Error transcribing audio (attempt ${attempt + 1}):`, error);
        lastError = error;

        // If this is not the last attempt, continue to the next retry
        if (attempt < maxRetries) {
          continue;
        }

        // On final attempt, handle the error
        console.error("All transcription attempts failed:", error);
        const errorMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
        const errorState = { automatedTranscription: errorMessage };

        // Update all states with error
        updateClipState(errorState);

        toast({
          variant: "destructive",
          title: "Transcription Failed",
          description: "Failed to transcribe the clip. Please try again."
        });
      }
    }

    setIsAnyClipTranscribing(false);
  }, [
    focusedClip,
    mediaSrc,
    language,
    currentSourceType,
    updateClipData,
    toast
  ]);

  const handleTranslate = useCallback(async (clipId: string, targetLanguage: string): Promise<void> => {
    // First check if clip exists in either the clips array or as a focused clip
    const currentClipForTranslation = focusedClip?.id === clipId ? focusedClip : clipsRef.current.find(c => c.id === clipId);
    if (!currentClipForTranslation) {
      toast({variant: "destructive", title: "Translation Error", description: "Clip not found."});
      return;
    }

    // Bail if translation already exists (to avoid redundant API calls)
    if (targetLanguage === 'english') {
      const existing = currentClipForTranslation.englishTranslation;
      if (existing && !existing.startsWith("Error:") && existing !== "Translating...") {
        toast({ title: "Already Translated", description: "This clip has already been translated to English." });
        return;
      }
    } else {
      const existing = currentClipForTranslation.translation;
      const existingLang = currentClipForTranslation.translationTargetLanguage;
      if (existingLang === targetLanguage && existing && !existing.startsWith("Error:") && existing !== "Translating...") {
        toast({ title: "Already Translated", description: `This clip has already been translated to ${targetLanguage}.` });
        return;
      }
    }

    // Then check transcription validity
    const transcription = currentClipForTranslation.automatedTranscription;
    if (transcription === null ||
        transcription === undefined ||
        transcription === "" ||
        transcription.startsWith("Error:") ||
        transcription === "Transcribing...") {
      toast({variant: "destructive", title: "Translation Error", description: "Ensure automated transcription is successful."});
      return;
    }

    // Set loading state based on target language
    if (targetLanguage === 'english') {
      updateClipData(clipId, { englishTranslation: "Translating..." });
    } else {
      updateClipData(clipId, { translation: "Translating...", translationTargetLanguage: targetLanguage });
    }

    try {
      const result = await translateTranscription({
        originalTranscription: transcription,
        sourceLanguage: (currentClipForTranslation.language || languageRef.current).trim(),
        targetLanguage: targetLanguage,
      });

      // Update the appropriate field based on target language
      const updateData = targetLanguage === 'english'
        ? { englishTranslation: result.translatedText }
        : { translation: result.translatedText, translationTargetLanguage: targetLanguage };

      // Update clip data
      updateClipData(clipId, updateData);

      // Also update session clips if this clip exists there
      setSessionClips(prevClips => {
        const clipIndex = prevClips.findIndex(c =>
          c.startTime === currentClipForTranslation.startTime &&
          c.endTime === currentClipForTranslation.endTime &&
          c.mediaSourceId === activeMediaSourceIdRef.current
        );
        if (clipIndex >= 0) {
          const newClips = [...prevClips];
          newClips[clipIndex] = { ...newClips[clipIndex], ...updateData };
          return newClips;
        }
        return prevClips;
      });

      // Also update work in progress state
      setWorkInProgressClips(prev => ({
        ...prev,
        [clipId]: { ...(prev[clipId] || currentClipForTranslation), ...updateData }
      }));

      toast({ title: "Translation Successful" });
    } catch (error) {
      console.warn("LinguaClipApp: AI Translation error:", error);
      toast({ variant: "destructive", title: "AI Error", description: "Failed to translate transcription." });

      // Set error state based on target language
      const errorState = targetLanguage === 'english'
        ? { englishTranslation: "Error: Could not translate." }
        : { translation: "Error: Could not translate.", translationTargetLanguage: targetLanguage };

      updateClipData(clipId, errorState);
    }
  }, [focusedClip, updateClipData, toast]);

  const handleGetCorrections = useCallback(async (clipId: string): Promise<void> => {
    const currentClipForCorrections = clipsRef.current.find(c => c.id === clipId);
    if (!currentClipForCorrections || !currentClipForCorrections.userTranscription || !currentClipForCorrections.automatedTranscription || currentClipForCorrections.automatedTranscription.startsWith("Error:") || currentClipForCorrections.automatedTranscription === "Transcribing...") {
      toast({variant: "destructive", title: "Comparison Error", description: "Ensure automated transcription is successful and you've typed something."});
      return;
    }

    // Bail if corrections already exist (to avoid redundant API calls)
    const existingCorrections = currentClipForCorrections.comparisonResult;
    if (Array.isArray(existingCorrections) && existingCorrections.length > 0 && existingCorrections[0].token !== "Comparing...") {
      toast({ title: "Already Compared", description: "Comparison already complete." });
      return;
    }

    // Validate input quality before starting
    const userText = currentClipForCorrections.userTranscription.trim();
    const automatedText = currentClipForCorrections.automatedTranscription.trim();

    if (userText.length < 2) {
      toast({variant: "destructive", title: "Input Too Short", description: "Please enter at least a few characters for meaningful comparison."});
      return;
    }

    updateClipData(clipId, { comparisonResult: [{token: "Comparing...", status: "correct"}] });

    try {
      const result = await compareTranscriptions({
        userTranscription: userText,
        automatedTranscription: automatedText,
        language: (currentClipForCorrections.language || languageRef.current).trim(),
      });

      // Update clip data with comparison results
      updateClipData(clipId, { comparisonResult: result.comparisonResult });

      // Also update session clips if this clip exists there
      setSessionClips(prevClips => {
        const clipIndex = prevClips.findIndex(c =>
          c.startTime === currentClipForCorrections.startTime &&
          c.endTime === currentClipForCorrections.endTime &&
          c.mediaSourceId === activeMediaSourceIdRef.current
        );
        if (clipIndex >= 0) {
          const newClips = [...prevClips];
          newClips[clipIndex] = { ...newClips[clipIndex], comparisonResult: result.comparisonResult };
          return newClips;
        }
        return prevClips;
      });

      // Provide more specific success feedback
      const summary = result.comparisonResult;
      const correctCount = summary.filter(t => t.status === 'correct').length;
      const totalCount = summary.length;
      const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

      toast({
        title: "Comparison Complete",
        description: `${accuracy}% accuracy (${correctCount}/${totalCount} tokens correct)`
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error("LinguaClipApp: Comparison failed with detailed error:", {
        clipId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        inputLengths: {
          user: userText.length,
          automated: automatedText.length
        },
        timestamp: new Date().toISOString()
      });

      toast({
        variant: "destructive",
        title: "Comparison Failed",
        description: `Could not analyze transcription: ${errorMessage.substring(0, 100)}${errorMessage.length > 100 ? '...' : ''}`
      });

      updateClipData(clipId, {
        comparisonResult: [{
          token: "Error: Comparison analysis failed.",
          status: "incorrect",
          suggestion: "Please try again or contact support if this persists"
        }]
      });
    }
  }, [toast, updateClipData]);

  const handleRemoveClip = (clipIdToRemove: string) => {
    if (isAnyClipTranscribing) {
      toast({variant: "destructive", title: "Action Disabled", description: "Cannot remove clips while transcription is in progress."});
      return;
    }
    processingIdRef.current += 1;
    const removedClipOriginalIndex = clips.findIndex(clip => clip.id === clipIdToRemove);
    if (removedClipOriginalIndex === -1) return;

    const newClips = clips.filter(clip => clip.id !== clipIdToRemove);

    if (newClips.length === 0) {
      if (currentSourceType === 'video' || currentSourceType === 'audio' || isYouTubeVideo) {
        console.log("LinguaClipApp: handleRemoveClip - all clips removed, resetting app state.");
        resetAppState();
        toast({ title: "Media Cleared", description: "All clips have been removed and the media file has been cleared." });
        return;
      }
      setClips([]);
      setCurrentClipIndex(0);
      toast({ title: "All Clips Removed" });
    } else {
      let newCurrentIdx = currentClipIndex;
      if (removedClipOriginalIndex < currentClipIndex) {
        newCurrentIdx = Math.max(0, currentClipIndex - 1);
      } else if (removedClipOriginalIndex === currentClipIndex) {
        newCurrentIdx = Math.min(currentClipIndex, newClips.length - 1);
      }
      newCurrentIdx = Math.max(0, Math.min(newCurrentIdx, newClips.length - 1));

      setClips(newClips);
      setCurrentClipIndex(newCurrentIdx);
      toast({ title: "Clip Removed", description: "The selected clip has been removed. Remaining clips have been renumbered." });
    }
  };

  const handleSaveMedia = async () => {
    if (!user || !mediaSrc || !mediaDisplayName || clips.length === 0) {
      toast({ variant: "destructive", title: "Cannot Save", description: "Ensure you are logged in and media is loaded with clips." });
      return;
    }
    if (currentSourceType !== 'url' && mediaDuration > MAX_MEDIA_DURATION_MINUTES * 60 ) {
      toast({ variant: "destructive", title: "Cannot Save", description: `Media duration exceeds the ${MAX_MEDIA_DURATION_MINUTES}-minute limit for uploaded files.` });
      return;
    }
    setIsSaving(true);
    try {
      const result = await saveMediaItemAction({
        userId: user.uid,
        mediaUrl: sourceUrl || (sourceFile ? `uploaded/${sourceFile.name}` : 'unknown_source'),
        mediaDisplayName: mediaDisplayName,
        mediaDuration: mediaDuration,
        mediaType: currentSourceType || 'unknown',
        language: language,
        clipSegmentationDuration: clipSegmentationDuration,
        clips: clips.map(c => ({
            id: c.id,
            startTime: c.startTime,
            endTime: c.endTime,
            userTranscription: c.userTranscription || null,
            automatedTranscription: c.automatedTranscription || null,
            feedback: c.feedback || null, // Old feedback field
            englishTranslation: c.englishTranslation || null, // Legacy translation field
            translation: c.translation || null, // New flexible translation field
            translationTargetLanguage: c.translationTargetLanguage || null, // Target language
            comparisonResult: (c.comparisonResult as CorrectionToken[] | null) || null,
        })),
      });
      if (result.success) {
        toast({ title: "Media Saved", description: result.message });
      } else {
        toast({ variant: "destructive", title: "Save Failed", description: result.message });
      }
    } catch (error) {
      console.warn("LinguaClipApp: Error saving media:", error);
      toast({ variant: "destructive", title: "Save Error", description: "An unexpected error occurred while saving." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateFocusedClip = useCallback((startTime: number, endTime: number) => {
    // Ensure we have a valid language
    const clipLanguage = language || 'english';
    const newFocusedClip = createFocusedClip(startTime, endTime, clipLanguage);
    setFocusedClip(newFocusedClip);
    setShowClipTrimmer(false);

    // Replace the clips array with just the focused clip and update work in progress
    setClips([newFocusedClip]);
    setCurrentClipIndex(0);

    // Initialize work in progress for the new focused clip
    setWorkInProgressClips(prev => ({
      ...prev,
      [newFocusedClip.id]: newFocusedClip
    }));

    toast({
      title: "Focused Clip Mode",
      description: `Now working with a custom clip from ${formatSecondsToMMSS(startTime)} to ${formatSecondsToMMSS(endTime)}`
    });
  }, [language, toast]);

  const handleToggleClipTrimmer = useCallback(() => {
    setShowClipTrimmer(prev => !prev);
  }, []);

  const handleBackToAutoClips = useCallback(() => {
    // Find the current media source
    const currentSource = mediaSources.find(source => source.id === activeMediaSourceId);
    if (!currentSource) {
      toast({variant: "destructive", title: "Cannot Return to Auto Clips", description: "Current media source not found."});
      return;
    }

    // Restore media source state
    setMediaSrc(currentSource.src);
    setMediaDisplayName(currentSource.displayName);
    setCurrentSourceType(currentSource.type);

    // Generate new clips based on current media duration
    const newGeneratedClips = generateClips(mediaDuration, clipSegmentationDuration, language);

    // Reset all clip-related states
    setClips(newGeneratedClips.map(clip => ({
      ...clip,
      language: language,
      comparisonResult: null,
      feedback: null,
      englishTranslation: null,
      automatedTranscription: null,
      userTranscription: null,
      translation: null,
      translationTargetLanguage: null,
      isFocusedClip: false
    })));

    // Update clips ref immediately
    clipsRef.current = newGeneratedClips;

    // Reset focused clip mode states
    setFocusedClip(null);
    setShowClipTrimmer(false);
    setWorkInProgressClips({});

    // Reset to first clip
    setCurrentClipIndex(0);

    toast({
      title: "Returned to Auto Clips",
      description: `Generated ${newGeneratedClips.length} automatic clips.`
    });
  }, [mediaSources, activeMediaSourceId, mediaDuration, clipSegmentationDuration, language, toast]);

  const handleResetAppWithCheck = () => {
    if (isAnyClipTranscribing) {
      toast({variant: "destructive", title: "Action Disabled", description: "Cannot clear media while transcription is in progress."});
      return;
    }
    console.log("LinguaClipApp: handleResetAppWithCheck calling resetAppState.");
    resetAppState();
  }

  const LoadedMediaIcon = currentSourceType === 'audio' ? FileAudio : FileVideo;
  const currentClip = focusedClip || clips[currentClipIndex];
  const globalAppBusyState = isLoading || isSaving;

  // Add this helper function at the top level, before the component
  const generateUniqueId = () => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const handleSaveToSession = useCallback((overrideUserTranscription?: string) => {
    if (!currentClip || !activeMediaSourceId) return;

    // Calculate total duration including the new clip
    const totalDuration = sessionClips.reduce((acc, clip) =>
      acc + (clip.endTime - clip.startTime), 0
    );
    const newClipDuration = currentClip.endTime - currentClip.startTime;

    // Check if adding this clip would exceed 30 minutes
    if (totalDuration + newClipDuration > 30 * 60) {
      toast({
        variant: "destructive",
        title: "Session Full",
        description: "Cannot add more clips. Total duration would exceed 30 minutes.",
      });
      return;
    }

    // Check if we're updating an existing session clip
    const existingClipIndex = sessionClips.findIndex(clip =>
      clip.startTime === currentClip.startTime &&
      clip.endTime === currentClip.endTime &&
      clip.mediaSourceId === activeMediaSourceId
    );

    // Determine user transcription to save
    const userTrans = overrideUserTranscription !== undefined
      ? overrideUserTranscription
      : (currentClip.userTranscription || "");
    const sessionClip: SessionClip = {
      id: existingClipIndex >= 0 ? sessionClips[existingClipIndex].id : generateUniqueId(),
      startTime: currentClip.startTime,
      endTime: currentClip.endTime,
      language: currentClip.language || language,
      displayName: existingClipIndex >= 0
        ? sessionClips[existingClipIndex].displayName
        : `Clip ${sessionClips.length + 1}`,
      mediaSourceId: activeMediaSourceId,
      // Ensure all transcription data is properly formatted
      userTranscription: userTrans,
      automatedTranscription: currentClip.automatedTranscription || null,
      translation: currentClip.translation || null,
      translationTargetLanguage: currentClip.translationTargetLanguage || null,
      englishTranslation: currentClip.englishTranslation || null,
      comparisonResult: currentClip.comparisonResult || null,
    };

    // Update or add the clip
    setSessionClips(prevClips => {
      if (existingClipIndex >= 0) {
        // Update existing clip
        const newClips = [...prevClips];
        newClips[existingClipIndex] = sessionClip;
        return newClips;
      } else {
        // Add new clip at the start
        return [sessionClip, ...prevClips];
      }
    });

    // Also update work in progress state
    setWorkInProgressClips(prev => ({
      ...prev,
      [sessionClip.id]: sessionClip
    }));

    // Only show toast for new clips or AI output updates
    const isAIOutputUpdate = existingClipIndex >= 0 && (
      currentClip.automatedTranscription !== sessionClips[existingClipIndex].automatedTranscription ||
      currentClip.translation !== sessionClips[existingClipIndex].translation ||
      currentClip.englishTranslation !== sessionClips[existingClipIndex].englishTranslation ||
      currentClip.comparisonResult !== sessionClips[existingClipIndex].comparisonResult
    );

    if (existingClipIndex === -1 || isAIOutputUpdate) {
      toast({
        title: existingClipIndex >= 0 ? "Clip Updated" : "Clip Saved",
        description: existingClipIndex >= 0
          ? "Clip has been updated with the latest AI output."
          : "Clip has been saved to your session.",
      });
    }
  }, [currentClip, activeMediaSourceId, sessionClips, language, toast]);

  const handleRenameClip = useCallback((clipId: string, newName: string) => {
    setSessionClips(prevClips =>
      prevClips.map(clip =>
        clip.id === clipId
          ? { ...clip, displayName: newName }
          : clip
      )
    );
  }, []);

  const handleLoadFromSession = useCallback((clipToLoad: SessionClip) => {
    if (isAnyClipTranscribing) {
      toast({
        variant: "destructive",
        title: "Cannot Load Clip",
        description: "Please wait for any ongoing transcriptions to complete.",
      });
      return;
    }

    // Find the media source for this clip
    const mediaSource = mediaSources.find(source => source.id === clipToLoad.mediaSourceId);
    if (!mediaSource) {
      toast({
        variant: "destructive",
        title: "Media Not Found",
        description: "The media source for this clip is no longer available.",
      });
      return;
    }

    // Switch to the correct media source if needed
    if (mediaSource.id !== activeMediaSourceId) {
      setActiveMediaSourceId(mediaSource.id);
      setMediaSrc(mediaSource.src);
      setMediaDisplayName(mediaSource.displayName);
      setCurrentSourceType(mediaSource.type);
    }

    // Create a new focused clip with all necessary data
    const loadedClip: Clip = {
      ...clipToLoad,
      id: clipToLoad.id || generateUniqueId(), // Ensure we have a valid ID
      startTime: clipToLoad.startTime,
      endTime: clipToLoad.endTime,
      language: clipToLoad.language || language,
      // Ensure all transcription data is properly initialized
      userTranscription: clipToLoad.userTranscription || "",
      automatedTranscription: clipToLoad.automatedTranscription || null,
      translation: clipToLoad.translation || null,
      translationTargetLanguage: clipToLoad.translationTargetLanguage || null,
      englishTranslation: clipToLoad.englishTranslation || null,
      comparisonResult: clipToLoad.comparisonResult || null,
      isFocusedClip: true, // Mark this as a focused clip
    };

    // Set this as the only clip and focus on it
    setClips([loadedClip]);
    setCurrentClipIndex(0);
    setFocusedClip(loadedClip);
    clipsRef.current = [loadedClip]; // Update the ref immediately

    // Also update work in progress state
    setWorkInProgressClips(prev => ({
      ...prev,
      [loadedClip.id]: loadedClip
    }));

    toast({
      title: "Clip Loaded",
      description: `Loaded "${clipToLoad.displayName || 'Unnamed Clip'}" (${formatSecondsToMMSS(clipToLoad.startTime)} - ${formatSecondsToMMSS(clipToLoad.endTime)})`,
    });
  }, [isAnyClipTranscribing, mediaSources, activeMediaSourceId, language, toast]);

  const handleRemoveFromSession = useCallback((clipId: string) => {
    setSessionClips(prevClips => prevClips.filter(clip => clip.id !== clipId));
  }, [toast]);

  const handleRemoveMediaSource = useCallback((sourceId: string) => {
    if (isAnyClipTranscribing) {
      toast({
        variant: "destructive",
        title: "Action Disabled",
        description: "Cannot remove media while transcription is in progress.",
      });
      return;
    }

    // Check if any session clips use this media source
    const hasClipsUsingSource = sessionClips.some(clip => clip.mediaSourceId === sourceId);
    if (hasClipsUsingSource) {
      toast({
        variant: "destructive",
        title: "Cannot Remove Media",
        description: "This media source has saved clips. Please remove those clips first.",
      });
      return;
    }

    setMediaSources(prev => prev.filter(source => source.id !== sourceId));

    // If we removed the active source, clear current state
    if (sourceId === activeMediaSourceId) {
      setActiveMediaSourceId(null);
      setMediaSrc(undefined);
      setMediaDisplayName(null);
      setCurrentSourceType(null);
      setClips([]);
      setCurrentClipIndex(0);
    }
  }, [isAnyClipTranscribing, sessionClips, activeMediaSourceId]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-grow container mx-auto px-4 md:px-6 py-8 space-y-8">
        <Card className="shadow-lg border-border">
          <CardHeader className="pb-0">
            <CardTitle>Upload Your Media</CardTitle>
            <CardDescription>Select language and upload media</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="lg:flex lg:gap-6">
              {mediaSources.length < 3 && (
                <div className={cn(
                  "w-full grid gap-6",
                  mediaSources.length > 0
                    ? "md:grid-cols-2 lg:w-1/2"
                    : "md:grid-cols-2"
                )}>
                  <div>
                    <LanguageSelector
                      selectedLanguage={language}
                      onLanguageChange={handleLanguageChange}
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <VideoInputForm onSourceLoad={handleSourceLoad} isLoading={isLoading && !isYouTubeProcessing} />
                    {isYouTubeProcessing && (
                      <YouTubeProcessingLoader status={processingStatus} />
                    )}
                  </div>
                </div>
              )}
              {mediaSources.length > 0 && (
                <div className={cn(
                  "w-full",
                  mediaSources.length < 3 && "mt-6 lg:mt-0 lg:w-1/2"
                )}>
                  <MediaSourceList
                    sources={mediaSources}
                    activeSourceId={activeMediaSourceId}
                    onSelectSource={(sourceId) => {
                      const source = mediaSources.find(s => s.id === sourceId);
                      if (source) {
                        // Exit focused clip mode when switching sources
                        setFocusedClip(null);
                        setShowClipTrimmer(false);

                        // Then update the source
                        setActiveMediaSourceId(sourceId);
                        setMediaSrc(source.src);
                        setMediaDisplayName(source.displayName);
                        setCurrentSourceType(source.type);

                        // Generate new auto clips for the selected source
                        const generatedClips = generateClips(source.duration, clipSegmentationDuration, language);
                        setClips(generatedClips);
                        setCurrentClipIndex(0);
                      }
                    }}
                    onRemoveSource={handleRemoveMediaSource}
                    disabled={globalAppBusyState || isAnyClipTranscribing}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {mediaSrc && clips.length > 0 && currentClip && (
          <div className="space-y-4">
            <TranscriptionWorkspace
              currentClip={currentClip}
              clips={clips}
              mediaSrc={mediaSrc}
              currentClipIndex={currentClipIndex}
              onSelectClip={handleSelectClip}
              onTranscribeAudio={handleTranscribeAudio}
              onGetCorrections={handleGetCorrections}
              onTranslate={handleTranslate}
              onRemoveClip={handleRemoveClip}
              onUserTranscriptionChange={handleUserTranscriptionChange}
              isYouTubeVideo={isYouTubeVideo}
              language={currentClip.language || language}
              isAudioSource={currentSourceType === 'audio'}
              clipSegmentationDuration={clipSegmentationDuration}
              onClipDurationChange={handleClipDurationChange}
              isLoadingMedia={isLoading}
              isSavingMedia={isSaving}
              isAnyClipTranscribing={isAnyClipTranscribing}
              mediaDuration={mediaDuration}
              focusedClip={focusedClip}
              showClipTrimmer={showClipTrimmer}
              onCreateFocusedClip={handleCreateFocusedClip}
              onToggleClipTrimmer={handleToggleClipTrimmer}
              onBackToAutoClips={handleBackToAutoClips}
              onSaveToSession={handleSaveToSession}
              onOpenSessionDrawer={() => setSessionDrawerOpen(true)}
              canSaveToSession={
                currentClip &&
                !sessionClips.some(sessionClip =>
                  sessionClip.mediaSourceId === activeMediaSourceId &&
                  sessionClip.startTime === currentClip.startTime &&
                  sessionClip.endTime === currentClip.endTime
                ) &&
                (sessionClips.reduce((acc, clip) => acc + (clip.endTime - clip.startTime), 0) +
                 (currentClip.endTime - currentClip.startTime)) <= 30 * 60
              }
            />
          </div>
        )}
        {isLoading && !mediaDisplayName && !isYouTubeProcessing && (
          <Card className="shadow-lg border-border">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <h3 className="text-lg font-semibold text-primary">
                    Processing Media
                  </h3>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      {processingStatus || "Initializing..."}
                    </span>
                    <span className="text-sm font-medium text-primary">
                      {processingProgress}%
                    </span>
                  </div>
                  <Progress value={processingProgress} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
      <footer className="py-4 px-4 md:px-8 border-t border-border text-center bg-background relative z-40">
        <div className="mb-2">
          <span className="text-xs text-muted-foreground">
            By using this service you accept the{' '}
            <a href="/terms" className="underline hover:text-primary transition-colors">Terms of Service</a> and{' '}
            <a href="/privacy" className="underline hover:text-primary transition-colors">Privacy Policy</a>
          </span>
        </div>
      </footer>

      {/* Session Drawer Overlay */}
      <div
        className={`fixed inset-0 bg-black/80 transition-opacity duration-300 ease-in-out ${isSessionDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ zIndex: 100 }}
        onClick={() => setSessionDrawerOpen(false)}
      />
      {/* Session Drawer */}
      <div
        className={`fixed inset-x-0 bottom-0 bg-background transform transition-transform duration-300 ease-in-out ${isSessionDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{
          height: 'calc(100vh - 120px)',
          maxHeight: 'calc(100vh - 120px)',
          willChange: 'transform',
          zIndex: 101
        }}
      >
        <div className="h-full flex flex-col border-t border-border rounded-t-xl shadow-lg">
          <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <List className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Saved Attempts</h3>
              <span className="text-sm text-muted-foreground">({sessionClips.length})</span>
            </div>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setSessionDrawerOpen(false)}>
              <XIcon className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain p-4">
            <SessionClipsManager
              sessionClips={sessionClips}
              onLoadFromSession={handleLoadFromSession}
              onRemoveFromSession={handleRemoveFromSession}
              onRenameClip={handleRenameClip}
              disabled={isLoading || isSaving || isAnyClipTranscribing}
              mediaSources={mediaSources}
              focusedClipId={focusedClip?.id || null}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
