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
import { FileVideo, X as XIcon, FileAudio, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateClips, type Clip, extractAudioFromVideoSegment } from "@/lib/videoUtils";
import { transcribeAudio } from "@/ai/flows/transcribe-audio";
import { translateTranscription } from "@/ai/flows/translate-transcription-flow"; // New import
import { compareTranscriptions, type CorrectionToken } from "@/ai/flows/compare-transcriptions-flow";
import { useAuth } from '@/contexts/AuthContext';
import { saveMediaItemAction } from '@/app/actions';
import { isYouTubeUrl, processYouTubeUrl, type YouTubeVideoInfo, type ProgressCallback } from '@/lib/youtubeUtils';
import { Progress } from "@/components/ui/progress";

const MAX_MEDIA_DURATION_MINUTES = 30;

export default function LinguaClipApp() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined);
  const [mediaSrc, setMediaSrc] = useState<string | undefined>(undefined);
  const objectUrlRef = useRef<string | undefined>(undefined);
  const [mediaDisplayName, setMediaDisplayName] = useState<string | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number>(0);

  const [clips, setClips] = useState<Clip[]>([]);
  const [currentClipIndex, setCurrentClipIndex] = useState<number>(0);

  const [language, setLanguage] = useState<string>("vietnamese");
  const [clipSegmentationDuration, setClipSegmentationDuration] = useState<number>(60);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isAnyClipTranscribing, setIsAnyClipTranscribing] = useState<boolean>(false);

  // Processing progress state
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [isYouTubeProcessing, setIsYouTubeProcessing] = useState<boolean>(false);

  const [currentSourceType, setCurrentSourceType] = useState<'video' | 'audio' | 'url' | 'unknown' | null>(null);
  const [youtubeVideoInfo, setYoutubeVideoInfo] = useState<YouTubeVideoInfo | null>(null);

  const processingIdRef = useRef<number>(0);
  const { user } = useAuth();
  const { toast } = useToast();

  const isYouTubeVideo = sourceUrl ? isYouTubeUrl(sourceUrl) : false;

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
    setClipSegmentationDuration(60);
    setProcessingProgress(0);
    setProcessingStatus("");
    setIsYouTubeProcessing(false);
  }, [isAnyClipTranscribing]);

  const handleSourceLoad = useCallback(async (source: { file?: File; url?: string }) => {
    const localProcessingId = processingIdRef.current + 1;
    processingIdRef.current = localProcessingId;

    if (objectUrlRef.current) {
      console.log("LinguaClipApp: handleSourceLoad revoking PREVIOUS object URL:", objectUrlRef.current);
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = undefined;
    }

    resetAppState();

    const currentProcessingId = processingIdRef.current;

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
        if (processingIdRef.current !== currentProcessingId) return;
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
        if (processingIdRef.current !== currentProcessingId) {
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
        setProcessingStatus("Extracting audio from YouTube video...");

        try {
          toast({ title: "Processing YouTube Video", description: "Extracting audio from YouTube video..." });

          // Create status callback for YouTube processing
          const youtubeStatusCallback = (progress: number, status: string) => {
            if (processingIdRef.current === currentProcessingId) {
              setProcessingStatus(status);
            }
          };

          const { file: audioFile, videoInfo } = await processYouTubeUrl(source.url, youtubeStatusCallback);

          if (processingIdRef.current !== currentProcessingId) {
            setIsLoading(false);
            setIsYouTubeProcessing(false);
            return;
          }

          setIsYouTubeProcessing(false);
          setProcessingProgress(50);
          setProcessingStatus("Processing YouTube audio file...");

          setYoutubeVideoInfo(videoInfo);

          setSourceFile(audioFile);
          displayName = videoInfo.title;
          try {
            newMediaSrc = URL.createObjectURL(audioFile);
            objectUrlRef.current = newMediaSrc;
            console.log("LinguaClipApp: handleSourceLoad CREATED object URL for YouTube audio:", newMediaSrc);
          } catch (error) {
            if (processingIdRef.current !== currentProcessingId) return;
            toast({ variant: "destructive", title: "Error", description: "Could not process YouTube audio." });
            setIsLoading(false);
            resetAppState();
            return;
          }

          determinedSourceType = 'audio';
          mediaElementTypeForLoad = 'audio';

          toast({
            title: "YouTube Audio Extracted",
            description: `Successfully extracted audio from "${videoInfo.title}"`
          });

        } catch (error: any) {
          if (processingIdRef.current !== currentProcessingId) return;
          console.error("YouTube processing error:", error);
          setIsYouTubeProcessing(false);
          toast({
            variant: "destructive",
            title: "YouTube Processing Failed",
            description: error.message || "Could not extract audio from YouTube video."
          });
          setIsLoading(false);
          resetAppState();
          return;
        }
      } else {
        displayName = source.url;
        newMediaSrc = source.url;

        // Detect if URL points to an audio file based on extension
        // Note: Only includes formats with good cross-browser support
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
          if (processingIdRef.current !== currentProcessingId) return;
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
      if (processingIdRef.current !== currentProcessingId) return;
      toast({ variant: "destructive", title: "Error", description: "No media source provided." });
      setIsLoading(false);
      return;
    }

    if (processingIdRef.current !== currentProcessingId) {
      if (source.file && newMediaSrc && objectUrlRef.current === newMediaSrc) {
        console.log("LinguaClipApp: handleSourceLoad (processingId mismatch post-file-load) revoking object URL:", newMediaSrc);
        URL.revokeObjectURL(newMediaSrc);
        objectUrlRef.current = undefined;
      }
      return;
    }
    setMediaSrc(newMediaSrc);
    setMediaDisplayName(displayName);
    setCurrentSourceType(determinedSourceType);

    if (newMediaSrc) {
      const tempMediaElement = document.createElement(mediaElementTypeForLoad);
      tempMediaElement.onloadedmetadata = () => {
          if (processingIdRef.current !== currentProcessingId) {
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
          if (processingIdRef.current !== currentProcessingId) {
            if (source.file && newMediaSrc?.startsWith('blob:') && objectUrlRef.current === newMediaSrc) {
              console.log("LinguaClipApp: onerror (processingId mismatch) revoking object URL:", newMediaSrc);
              URL.revokeObjectURL(newMediaSrc);
              objectUrlRef.current = undefined;
            }
            return;
          }
          console.warn(`Error loading ${mediaElementTypeForLoad} metadata for ${displayName}:`, e, tempMediaElement.error);

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
        if (processingIdRef.current !== currentProcessingId) return;
        setIsLoading(false);
        toast({ variant: "destructive", title: "Error", description: "Media source became unavailable." });
    }
  }, [resetAppState, toast]);


  useEffect(() => {
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

      setClips(newGeneratedClips.map(clip => ({
        ...clip,
        language: language,
        comparisonResult: null,
        feedback: null,
        englishTranslation: null,
        automatedTranscription: null,
        userTranscription: null
      })));
      setCurrentClipIndex(0);

      if (newGeneratedClips.length > 0) {
        setProcessingProgress(100);
        setProcessingStatus("Processing complete!");
        const mediaTypeForToast = currentSourceType || "media";
        toast({ title: "Media Processed", description: `${newGeneratedClips.length} clip(s) generated for ${mediaTypeForToast}.` });

        // Show completion for a brief moment before hiding
        setTimeout(() => {
          setIsLoading(false);
        }, 1000);
      } else if (mediaDuration > 0) {
        toast({ variant: "destructive", title: "Processing Error", description: "Could not generate clips for the media." });
        setIsLoading(false);
      } else {
        setIsLoading(false);
      }
    } else if (!mediaSrc && clips.length > 0) {
      setClips([]);
      setCurrentClipIndex(0);
    }
  }, [mediaSrc, mediaDuration, clipSegmentationDuration, language, toast, currentSourceType]);


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
    if (!isNaN(newDuration) && (newDuration === 30 || newDuration === 60)) {
      setClipSegmentationDuration(newDuration);
    }
  };

  const handleUserTranscriptionChange = (clipId: string, newUserTranscription: string) => {
    updateClipData(clipId, { userTranscription: newUserTranscription });
  };

  const handleTranscribeAudio = async (clipId: string): Promise<void> => {
    const currentClipToTranscribe = clips.find(c => c.id === clipId);
    const actualMediaSrcForExtraction = sourceFile ? objectUrlRef.current : mediaSrc;

    if (!actualMediaSrcForExtraction || !currentClipToTranscribe || !currentSourceType || currentSourceType === 'unknown') {
      toast({variant: "destructive", title: "Transcription Error", description: "Cannot transcribe. Ensure a media file is loaded and a clip is active."});
      return;
    }

    updateClipData(clipId, { automatedTranscription: "Transcribing...", feedback: null, englishTranslation: null, comparisonResult: null });

    let audioDataUri: string | null = null;
    try {
        console.log(`LinguaClipApp: Calling extractAudioFromVideoSegment with src: ${actualMediaSrcForExtraction?.substring(0,100)}, type: ${currentSourceType}`);
        audioDataUri = await extractAudioFromVideoSegment(
          actualMediaSrcForExtraction,
          currentClipToTranscribe.startTime,
          currentClipToTranscribe.endTime,
          currentSourceType === 'audio' ? 'audio' : 'video'
        );
    } catch (error) {
        console.warn("LinguaClipApp: Audio extraction failed in LinguaClipApp:", error);
        toast({variant: "destructive", title: "Audio Extraction Failed", description: (error as Error).message || "Could not extract audio for transcription."});
        updateClipData(clipId, { automatedTranscription: "Error: Audio extraction failed." });
        return;
    }

    if (!audioDataUri) {
        toast({variant: "destructive", title: "Transcription Error", description: "Failed to obtain audio data for transcription."});
        updateClipData(clipId, { automatedTranscription: "Error: No audio data." });
        return;
    }

    console.log("LinguaClipApp: Audio Data URI prefix for AI:", audioDataUri.substring(0, 100));
    const clipLanguage = (currentClipToTranscribe.language || language).trim();
    console.log("LinguaClipApp: Language for AI transcription:", clipLanguage);


    try {
      const result = await transcribeAudio({ audioDataUri, language: clipLanguage });
      updateClipData(clipId, { automatedTranscription: result.transcription });
      toast({ title: "Transcription Successful" });
    } catch (error) {
      console.warn("LinguaClipApp: AI Transcription error in LinguaClipApp:", error);
      toast({ variant: "destructive", title: "AI Error", description: "Failed to transcribe audio. Check console for details." });
      updateClipData(clipId, { automatedTranscription: "Error: Could not transcribe audio." });
    }
  };

  const handleTranslate = async (clipId: string, targetLanguage: string): Promise<void> => {
    const currentClipForTranslation = clips.find(c => c.id === clipId);
    if (!currentClipForTranslation || !currentClipForTranslation.automatedTranscription || currentClipForTranslation.automatedTranscription.startsWith("Error:") || currentClipForTranslation.automatedTranscription === "Transcribing...") {
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
        originalTranscription: currentClipForTranslation.automatedTranscription,
        sourceLanguage: (currentClipForTranslation.language || language).trim(),
        targetLanguage: targetLanguage,
      });

      // Update the appropriate field based on target language
      if (targetLanguage === 'english') {
        updateClipData(clipId, { englishTranslation: result.translatedText });
      } else {
        updateClipData(clipId, { translation: result.translatedText, translationTargetLanguage: targetLanguage });
      }

      toast({ title: "Translation Successful" });
    } catch (error) {
      console.warn("LinguaClipApp: AI Translation error:", error);
      toast({ variant: "destructive", title: "AI Error", description: "Failed to translate transcription." });

      // Set error state based on target language
      if (targetLanguage === 'english') {
        updateClipData(clipId, { englishTranslation: "Error: Could not translate." });
      } else {
        updateClipData(clipId, { translation: "Error: Could not translate.", translationTargetLanguage: targetLanguage });
      }
    }
  };

  const handleGetCorrections = async (clipId: string): Promise<void> => {
    const currentClipForCorrections = clips.find(c => c.id === clipId);
     if (!currentClipForCorrections || !currentClipForCorrections.userTranscription || !currentClipForCorrections.automatedTranscription || currentClipForCorrections.automatedTranscription.startsWith("Error:") || currentClipForCorrections.automatedTranscription === "Transcribing...") {
      toast({variant: "destructive", title: "Comparison Error", description: "Ensure automated transcription is successful and you've typed something."});
      return;
    }

    // Validate input quality before starting
    const userText = currentClipForCorrections.userTranscription.trim();
    const automatedText = currentClipForCorrections.automatedTranscription.trim();

    if (userText.length < 2) {
      toast({variant: "destructive", title: "Input Too Short", description: "Please enter at least a few characters for meaningful comparison."});
      return;
    }

    // Log detailed comparison context for debugging
    console.log('LinguaClipApp: Starting comparison with detailed context:', {
      clipId,
      userTranscription: {
        length: userText.length,
        preview: userText.substring(0, 50) + (userText.length > 50 ? '...' : ''),
        wordCount: userText.split(/\s+/).length
      },
      automatedTranscription: {
        length: automatedText.length,
        preview: automatedText.substring(0, 50) + (automatedText.length > 50 ? '...' : ''),
        wordCount: automatedText.split(/\s+/).length
      },
      language: (currentClipForCorrections.language || language).trim(),
      timestamp: new Date().toISOString()
    });

    updateClipData(clipId, { comparisonResult: [{token: "Comparing...", status: "correct"}] });

    try {
      const startTime = Date.now();

      const result = await compareTranscriptions({
        userTranscription: userText,
        automatedTranscription: automatedText,
        language: (currentClipForCorrections.language || language).trim(),
      });

      const duration = Date.now() - startTime;

      console.log('LinguaClipApp: Comparison completed successfully:', {
        clipId,
        duration: `${duration}ms`,
        resultLength: result.comparisonResult.length,
        tokenSummary: {
          correct: result.comparisonResult.filter(t => t.status === 'correct').length,
          incorrect: result.comparisonResult.filter(t => t.status === 'incorrect').length,
          missing: result.comparisonResult.filter(t => t.status === 'missing').length,
          extra: result.comparisonResult.filter(t => t.status === 'extra').length
        },
        firstFewTokens: result.comparisonResult.slice(0, 5).map(t => ({
          token: t.token,
          status: t.status,
          suggestion: t.suggestion
        }))
      });

      updateClipData(clipId, { comparisonResult: result.comparisonResult });

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
  };

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
      toast({ title: "Clip Removed", description: "The selected clip has been removed from the list." });
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

  const handleResetAppWithCheck = () => {
    if (isAnyClipTranscribing) {
      toast({variant: "destructive", title: "Action Disabled", description: "Cannot clear media while transcription is in progress."});
      return;
    }
    console.log("LinguaClipApp: handleResetAppWithCheck calling resetAppState.");
    resetAppState();
  }

  const LoadedMediaIcon = currentSourceType === 'audio' ? FileAudio : FileVideo;
  const currentClip = clips[currentClipIndex];
  const globalAppBusyState = isLoading || isSaving;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-grow container mx-auto px-4 md:px-6 py-8 space-y-8">
        <Card className="shadow-lg border-border">
          <CardContent className="p-6 space-y-6">
            {mediaSrc && mediaDisplayName ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/50 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <LoadedMediaIcon className="h-6 w-6 text-primary flex-shrink-0" />
                    <span className="text-sm font-medium truncate text-foreground" title={mediaDisplayName}>
                      {mediaDisplayName}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={handleResetAppWithCheck} aria-label="Remove media" disabled={globalAppBusyState || isAnyClipTranscribing}>
                    <XIcon className="h-5 w-5 text-muted-foreground hover:text-foreground" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <LanguageSelector
                        selectedLanguage={language}
                        onLanguageChange={handleLanguageChange}
                        disabled={globalAppBusyState || isAnyClipTranscribing || !mediaSrc}
                    />
                </div>
                 {user && mediaSrc && clips.length > 0 && (
                    <Button onClick={handleSaveMedia} disabled={globalAppBusyState || isAnyClipTranscribing} className="w-full sm:w-auto">
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? "Saving..." : "Save Media"}
                    </Button>
                  )}
              </div>
            ) : (
              <>
                <VideoInputForm onSourceLoad={handleSourceLoad} isLoading={isLoading} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <LanguageSelector
                        selectedLanguage={language}
                        onLanguageChange={handleLanguageChange}
                        disabled={isLoading}
                    />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {mediaSrc && clips.length > 0 && currentClip && (
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
          />
        )}
        {isLoading && !mediaDisplayName && (
          <Card className="shadow-lg border-border">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <h3 className="text-lg font-semibold text-primary">
                    {isYouTubeProcessing ? "Extracting YouTube Audio" : "Processing Media"}
                  </h3>
                </div>

                {isYouTubeProcessing ? (
                  <div className="space-y-4">
                    <div className="flex justify-center space-x-1">
                      <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <div className="flex items-center justify-center">
                      <span className="text-sm text-muted-foreground text-center">
                        {processingStatus || "Processing YouTube video..."}
                      </span>
                    </div>
                  </div>
                ) : (
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
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
      <footer className="py-4 px-4 md:px-8 border-t border-border text-center">
        <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} LinguaClip. Happy learning!</p>
      </footer>
    </div>
  );
}
