import { useState, useCallback } from 'react';
import { useToast } from './use-toast';
import { transcribeAudio } from "@/ai/flows/transcribe-audio-resilient";
import { translateTranscriptionFlow } from '@/ai/flows/translate-transcription-flow';
import { compareTranscriptions } from "@/ai/flows/compare-transcriptions-flow";
import { extractAudioFromVideoSegment } from "@/lib/videoUtils";
import type { Clip } from '@/lib/videoUtils';
import type { CorrectionToken } from '@/ai/flows/compare-transcriptions-flow';

export interface AIOperationState {
  transcribingClips: Set<string>;
  translatingClips: Set<string>;
  correctingClips: Set<string>;
}

export function useAIOperations() {
  const [transcribingClips, setTranscribingClips] = useState<Set<string>>(new Set());
  const [translatingClips, setTranslatingClips] = useState<Set<string>>(new Set());
  const [correctingClips, setCorrectingClips] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const isAnyOperationInProgress = useCallback(() => {
    return transcribingClips.size > 0 || translatingClips.size > 0 || correctingClips.size > 0;
  }, [transcribingClips.size, translatingClips.size, correctingClips.size]);

  const transcribeClip = useCallback(async (
    clip: Clip,
    mediaSrc: string,
    sourceType: 'video' | 'audio' | 'url' | 'unknown',
    language: string,
    onUpdate: (clipId: string, updates: Partial<Clip>) => void
  ) => {
    if (transcribingClips.has(clip.id)) {
      toast({
        variant: "destructive",
        title: "Already Transcribing",
        description: "This clip is already being transcribed.",
      });
      return;
    }

    try {
      // Add to transcribing set
      setTranscribingClips(prev => new Set(prev).add(clip.id));

      // Set loading state
      onUpdate(clip.id, { automatedTranscription: "Transcribing..." });

      // Extract audio - filter out 'url' and 'unknown' types for extractAudioFromVideoSegment
      const validSourceType = sourceType === 'url' || sourceType === 'unknown' ? 'video' : sourceType;
      const audioDataUri = await extractAudioFromVideoSegment(
        mediaSrc,
        clip.startTime,
        clip.endTime,
        validSourceType
      );

      if (!audioDataUri) {
        throw new Error("Failed to extract audio from the media segment");
      }

      // Transcribe - use the correct input format
      const result = await transcribeAudio({
        audioDataUri,
        language,
        preferredProvider: 'auto'
      });

      // Update clip with result - extract transcription from result object
      onUpdate(clip.id, {
        automatedTranscription: result.transcription,
        language: language
      });

      toast({
        title: "Transcription Complete",
        description: "Audio has been successfully transcribed.",
      });

    } catch (error) {
      console.error('Transcription error:', error);

      // Clear loading state
      onUpdate(clip.id, { automatedTranscription: null });

      toast({
        variant: "destructive",
        title: "Transcription Failed",
        description: error instanceof Error ? error.message : "Failed to transcribe audio",
      });
    } finally {
      // Remove from transcribing set
      setTranscribingClips(prev => {
        const newSet = new Set(prev);
        newSet.delete(clip.id);
        return newSet;
      });
    }
  }, [transcribingClips, toast]);

  const translateClip = useCallback(async (
    clip: Clip,
    targetLanguage: string,
    onUpdate: (clipId: string, updates: Partial<Clip>) => void
  ) => {
    if (!clip.userTranscription?.trim()) {
      toast({
        variant: "destructive",
        title: "No Text to Translate",
        description: "Please enter some text to translate.",
      });
      return;
    }

    if (translatingClips.has(clip.id)) {
      toast({
        variant: "destructive",
        title: "Already Translating",
        description: "This clip is already being translated.",
      });
      return;
    }

    try {
      // Add to translating set
      setTranslatingClips(prev => new Set(prev).add(clip.id));

      // Set loading state
      onUpdate(clip.id, {
        translation: "Translating...",
        translationTargetLanguage: targetLanguage
      });

      // Translate - use the correct input format
      const result = await translateTranscriptionFlow({
        originalTranscription: clip.userTranscription,
        sourceLanguage: clip.language || 'unknown',
        targetLanguage: targetLanguage
      });

      // Update clip with result - extract translatedText from result object
      onUpdate(clip.id, {
        translation: result.translatedText,
        translationTargetLanguage: targetLanguage
      });

      toast({
        title: "Translation Complete",
        description: `Text has been translated to ${targetLanguage}.`,
      });

    } catch (error) {
      console.error('Translation error:', error);

      // Clear loading state
      onUpdate(clip.id, {
        translation: null,
        translationTargetLanguage: null
      });

      toast({
        variant: "destructive",
        title: "Translation Failed",
        description: error instanceof Error ? error.message : "Failed to translate text",
      });
    } finally {
      // Remove from translating set
      setTranslatingClips(prev => {
        const newSet = new Set(prev);
        newSet.delete(clip.id);
        return newSet;
      });
    }
  }, [translatingClips, toast]);

  const getCorrections = useCallback(async (
    clip: Clip,
    onUpdate: (clipId: string, updates: Partial<Clip>) => void
  ) => {
    if (!clip.userTranscription?.trim() || !clip.automatedTranscription?.trim()) {
      toast({
        variant: "destructive",
        title: "Missing Text",
        description: "Both user input and automated transcription are required for corrections.",
      });
      return;
    }

    if (correctingClips.has(clip.id)) {
      toast({
        variant: "destructive",
        title: "Already Processing",
        description: "Corrections are already being generated for this clip.",
      });
      return;
    }

    try {
      // Add to correcting set
      setCorrectingClips(prev => new Set(prev).add(clip.id));

      // Set loading state (we'll show this in the UI)
      // Note: We don't update the clip state here as corrections are shown separately

      // Get corrections - use the correct input format
      const result = await compareTranscriptions({
        userTranscription: clip.userTranscription,
        automatedTranscription: clip.automatedTranscription,
        language: clip.language
      });

      // Update clip with result - extract comparisonResult from result object
      onUpdate(clip.id, { comparisonResult: result.comparisonResult });

      toast({
        title: "Corrections Generated",
        description: "AI corrections have been generated for your text.",
      });

    } catch (error) {
      console.error('Corrections error:', error);

      toast({
        variant: "destructive",
        title: "Corrections Failed",
        description: error instanceof Error ? error.message : "Failed to generate corrections",
      });
    } finally {
      // Remove from correcting set
      setCorrectingClips(prev => {
        const newSet = new Set(prev);
        newSet.delete(clip.id);
        return newSet;
      });
    }
  }, [correctingClips, toast]);

  const isClipTranscribing = useCallback((clipId: string) => {
    return transcribingClips.has(clipId);
  }, [transcribingClips]);

  const isClipTranslating = useCallback((clipId: string) => {
    return translatingClips.has(clipId);
  }, [translatingClips]);

  const isClipGettingCorrections = useCallback((clipId: string) => {
    return correctingClips.has(clipId);
  }, [correctingClips]);

  const cancelAllOperations = useCallback(() => {
    setTranscribingClips(new Set());
    setTranslatingClips(new Set());
    setCorrectingClips(new Set());
  }, []);

  return {
    // State
    transcribingClips,
    translatingClips,
    correctingClips,

    // Operations
    transcribeClip,
    translateClip,
    getCorrections,

    // Status checks
    isClipTranscribing,
    isClipTranslating,
    isClipGettingCorrections,
    isAnyOperationInProgress,

    // Control
    cancelAllOperations,
  };
}
