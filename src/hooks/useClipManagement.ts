import { useState, useCallback, useRef, useMemo } from 'react';
import { useToast } from './use-toast';
import { generateClips, createFocusedClip, type Clip } from '@/lib/videoUtils';

export interface ClipManagementState {
  clips: Clip[];
  currentClipIndex: number;
  focusedClip: Clip | null;
  showClipTrimmer: boolean;
  isAnyClipTranscribing: boolean;
  workInProgressClips: Record<string, Clip>;
}

export function useClipManagement(language: string) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [currentClipIndex, setCurrentClipIndex] = useState<number>(0);
  const [focusedClip, setFocusedClip] = useState<Clip | null>(null);
  const [showClipTrimmer, setShowClipTrimmer] = useState<boolean>(false);
  const [isAnyClipTranscribing, setIsAnyClipTranscribing] = useState<boolean>(false);
  const [workInProgressClips, setWorkInProgressClips] = useState<Record<string, Clip>>({});

  const clipsRef = useRef<Clip[]>([]);
  const { toast } = useToast();

  // Update ref when clips change
  const updateClipsRef = useCallback((newClips: Clip[]) => {
    clipsRef.current = newClips;
    setClips(newClips);
  }, []);

  const generateClipsFromDuration = useCallback((duration: number, clipLength: number) => {
    const newClips = generateClips(duration, clipLength, language);
    updateClipsRef(newClips);
    setCurrentClipIndex(0);
    setFocusedClip(null);
  }, [language, updateClipsRef]);

  const selectClip = useCallback((index: number) => {
    if (index >= 0 && index < clips.length) {
      setCurrentClipIndex(index);
    }
  }, [clips.length]);

  const createCustomClip = useCallback((startTime: number, endTime: number, displayName?: string) => {
    const customClip = createFocusedClip(startTime, endTime, language);
    if (displayName) {
      customClip.displayName = displayName;
    }

    setFocusedClip(customClip);
    updateClipsRef([customClip]);
    setCurrentClipIndex(0);
    setShowClipTrimmer(false);

    toast({
      title: "Custom Clip Created",
      description: `Created custom clip: ${displayName || 'Unnamed Clip'}`,
    });
  }, [language, updateClipsRef, toast]);

  const backToAutoClips = useCallback((duration: number, clipSegmentationDuration: number) => {
    const autoClips = generateClips(duration, clipSegmentationDuration, language);
    updateClipsRef(autoClips);
    setCurrentClipIndex(0);
    setFocusedClip(null);
    setShowClipTrimmer(false);
  }, [language, updateClipsRef]);

  const updateClip = useCallback((clipId: string, updates: Partial<Clip>) => {
    const updateClipInArray = (clipsArray: Clip[]) =>
      clipsArray.map(clip => clip.id === clipId ? { ...clip, ...updates } : clip);

    setClips(prevClips => {
      const updatedClips = updateClipInArray(prevClips);
      clipsRef.current = updatedClips;
      return updatedClips;
    });

    // Update focused clip if it matches
    setFocusedClip(prevFocused =>
      prevFocused?.id === clipId ? { ...prevFocused, ...updates } : prevFocused
    );

    // Update work in progress
    setWorkInProgressClips(prev => ({
      ...prev,
      [clipId]: { ...prev[clipId], ...updates }
    }));
  }, []);

  const removeClip = useCallback((clipIdToRemove: string) => {
    setClips(prevClips => {
      const filteredClips = prevClips.filter(clip => clip.id !== clipIdToRemove);
      clipsRef.current = filteredClips;

      if (filteredClips.length === 0) {
        setCurrentClipIndex(0);
        return filteredClips;
      }

      // Adjust current clip index if necessary
      setCurrentClipIndex(prevIndex => {
        const removedIndex = prevClips.findIndex(clip => clip.id === clipIdToRemove);
        if (removedIndex === -1) return prevIndex;

        if (prevIndex >= filteredClips.length) {
          return filteredClips.length - 1;
        }
        if (prevIndex > removedIndex) {
          return prevIndex - 1;
        }
        return prevIndex;
      });

      return filteredClips;
    });
  }, []);

  const updateUserTranscription = useCallback((clipId: string, newUserTranscription: string) => {
    updateClip(clipId, { userTranscription: newUserTranscription });
  }, [updateClip]);

  const setTranscribingState = useCallback((clipId: string, isTranscribing: boolean) => {
    if (isTranscribing) {
      updateClip(clipId, {
        automatedTranscription: "Transcribing..."
      });
    }
  }, [updateClip]);

  const setTranslatingState = useCallback((clipId: string, isTranslating: boolean, targetLanguage?: string) => {
    if (isTranslating) {
      updateClip(clipId, {
        translation: "Translating...",
        translationTargetLanguage: targetLanguage
      });
    }
  }, [updateClip]);

  const getCurrentClip = useCallback((): Clip | null => {
    return clips[currentClipIndex] || null;
  }, [clips, currentClipIndex]);

  const enhanceClipWithSessionData = useCallback((clipIndex: number, sessionClips: any[], activeMediaSourceId: string | null): Clip => {
    const baseClip = clips[clipIndex];
    if (!baseClip || !activeMediaSourceId) return baseClip;

    // Find matching saved session clip
    const savedClip = sessionClips.find(sessionClip =>
      sessionClip.mediaSourceId === activeMediaSourceId &&
      sessionClip.startTime === baseClip.startTime &&
      sessionClip.endTime === baseClip.endTime
    );

    if (savedClip) {
      // Merge field only if base value is empty/null but preserve active states
      const mergeField = (baseValue: any, savedValue: any) => {
        // Always preserve active AI processing states
        if (baseValue === "Transcribing..." || baseValue === "Translating..." || baseValue === "Comparing...") {
          return baseValue;
        }
        // For AI content, prefer saved value if it exists and is valid
        if (savedValue && savedValue !== "Transcribing..." && savedValue !== "Translating..." && savedValue !== "Comparing..." && !savedValue.toString().startsWith("Error:")) {
          return savedValue;
        }
        // Otherwise use base value
        return baseValue;
      };

      return {
        ...baseClip,
        userTranscription: mergeField(baseClip.userTranscription, savedClip.userTranscription),
        automatedTranscription: mergeField(baseClip.automatedTranscription, savedClip.automatedTranscription),
        translation: mergeField(baseClip.translation, savedClip.translation),
        translationTargetLanguage: mergeField(baseClip.translationTargetLanguage, savedClip.translationTargetLanguage),
        englishTranslation: mergeField(baseClip.englishTranslation, savedClip.englishTranslation),
        comparisonResult: mergeField(baseClip.comparisonResult, savedClip.comparisonResult),
        displayName: savedClip.displayName || baseClip.displayName,
        language: savedClip.language || baseClip.language,
      };
    }

    return baseClip;
  }, [clips]);

  // Memoized enhanced clips
  const createEnhancedClips = useCallback((sessionClips: any[], activeMediaSourceId: string | null) => {
    return clips.map((_, index) => enhanceClipWithSessionData(index, sessionClips, activeMediaSourceId));
  }, [clips, enhanceClipWithSessionData]);

  return {
    // State
    clips,
    currentClipIndex,
    focusedClip,
    showClipTrimmer,
    isAnyClipTranscribing,
    workInProgressClips,
    clipsRef,

    // Actions
    generateClipsFromDuration,
    selectClip,
    createCustomClip,
    backToAutoClips,
    updateClip,
    removeClip,
    updateUserTranscription,
    setTranscribingState,
    setTranslatingState,
    getCurrentClip,
    createEnhancedClips,
    enhanceClipWithSessionData,

    // Setters for direct state updates
    setClips: updateClipsRef,
    setCurrentClipIndex,
    setFocusedClip,
    setShowClipTrimmer,
    setIsAnyClipTranscribing,
    setWorkInProgressClips,
  };
}
