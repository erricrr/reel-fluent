import { useState, useEffect, useRef, useCallback } from "react";
import type { Clip } from '@/lib/videoUtils';
import type { CorrectionToken } from '@/ai/flows/compare-transcriptions-flow';

// Updated to remove explicit unlock; access depends on saved transcription and active use.
const shouldEnableAITools = (
  isTranscriptionSaved: boolean,
  userActivelyUsingAITools: boolean = false
): boolean => {
  // Allow access if transcription is saved OR user is actively interacting with AI tools (e.g., clicked a button)
  return isTranscriptionSaved || userActivelyUsingAITools;
};

interface SessionClip extends Clip {
  displayName?: string;
  mediaSourceId?: string;
  originalClipNumber?: number;
  originalMediaName?: string;
  mediaSrc?: string;
  sourceType?: 'video' | 'audio' | 'url' | 'unknown';
}

interface AIToolsStateConfig {
  currentClip: Clip;
  sessionClips: SessionClip[];
  activeMediaSourceId?: string | null;
  onUpdateClipData?: (clipId: string, aiContent: any) => void;
  onSaveToSession: (userTranscriptionInput: string) => void; // Keep for knowing when save happens
  // canSaveToSession: boolean; // This prop seems unused within this hook now
  userTranscriptionInput: string;
  language: string;
}

const AI_TOOLS_CACHE_KEY = "reel-fluent-ai-tools-cache";
// const AI_TOOLS_UNLOCK_KEY = "reel-fluent-ai-tools-unlock-state"; // REMOVED

// Helper functions for localStorage cache
const getAIToolsCache = (): Record<string, any> => {
  if (typeof window === 'undefined') return {};
  try {
    const cached = localStorage.getItem(AI_TOOLS_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (e) {
    console.error("Error reading AI tools cache:", e);
    return {};
  }
};

const updateAIToolsCache = (key: string, data: any): void => {
  if (typeof window === 'undefined') return;
  try {
    const cache = getAIToolsCache();
    cache[key] = data;
    localStorage.setItem(AI_TOOLS_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error("Error updating AI tools cache:", e);
  }
};

const clearAIToolsCacheForClip = (key: string, fieldsToRemove: string[]): void => {
  if (typeof window === 'undefined') return;
  try {
    const cache = getAIToolsCache();
    if (cache[key]) {
      fieldsToRemove.forEach(field => {
        delete cache[key][field];
      });
      localStorage.setItem(AI_TOOLS_CACHE_KEY, JSON.stringify(cache));
    }
  } catch (e) {
    console.error("Error clearing AI tools cache:", e);
  }
};

// Generate consistent cache key for clips (DRY solution for session/navigation consistency)
const getClipCacheKey = (mediaSourceId?: string | null, currentClip?: Clip): string | null => {
  if (!mediaSourceId || !currentClip) return null;
  return `${mediaSourceId}-${currentClip.startTime}-${currentClip.endTime}`;
};

export function useAIToolsState(config: AIToolsStateConfig) {
  const {
    currentClip,
    sessionClips,
    activeMediaSourceId,
    onUpdateClipData,
    // onSaveToSession, // Not directly used for unlock anymore, but comprehensiveData needs sessionClips
    // canSaveToSession, // REMOVED as per interface comment
    userTranscriptionInput,
    language
  } = config;

  const [userActivelyUsingAITools, setUserActivelyUsingAITools] = useState(false);
  const [aiToolsButtonClicked, setAiToolsButtonClicked] = useState(false);
  const [lastUserTranscriptionForComparison, setLastUserTranscriptionForComparison] = useState("");
  // const [isCurrentClipUnlocked, setIsCurrentClipUnlocked] = useState(false); // REMOVED

  const localAIToolsCache = useRef<Record<string, any>>(getAIToolsCache());
  // REMOVED: processedClipsMapRef, clipUnlockKey, and useEffect for isCurrentClipUnlocked

  // Special handling for focused clips - ensure immediate cache population
  useEffect(() => {
    if (currentClip?.isFocusedClip && activeMediaSourceId) {
      const clipCacheKey = getClipCacheKey(activeMediaSourceId, currentClip);
      // const unlockKey = getClipUnlockKey(activeMediaSourceId, currentClip); // REMOVED

      const hasAIData = currentClip.automatedTranscription ||
                       currentClip.translation ||
                       currentClip.englishTranslation ||
                       currentClip.comparisonResult;

      if (hasAIData && clipCacheKey) {
        const cacheData: any = {};
        if (currentClip.automatedTranscription) {
          cacheData.automatedTranscription = currentClip.automatedTranscription;
          cacheData.language = currentClip.language;
        }
        if (currentClip.translation) {
          cacheData.translation = currentClip.translation;
          cacheData.translationTargetLanguage = currentClip.translationTargetLanguage;
        }
        if (currentClip.englishTranslation) {
          cacheData.englishTranslation = currentClip.englishTranslation;
          cacheData.translationTargetLanguage = "english";
        }
        if (currentClip.comparisonResult) {
          cacheData.comparisonResult = currentClip.comparisonResult;
        }
        localAIToolsCache.current[clipCacheKey] = cacheData;
        updateAIToolsCache(clipCacheKey, cacheData);

        // REMOVED: unlock state setting
      }
    }
  }, [currentClip?.isFocusedClip, currentClip?.id, activeMediaSourceId, currentClip?.automatedTranscription, currentClip?.translation, currentClip?.englishTranslation, currentClip?.comparisonResult]);

  // Reset userActivelyUsingAITools when clip changes (logic remains similar but without unlock considerations)
  useEffect(() => {
    const isFocusedClipWithData = currentClip?.isFocusedClip && (
      currentClip.automatedTranscription ||
      currentClip.translation ||
      currentClip.englishTranslation ||
      currentClip.comparisonResult
    );
    if (!isFocusedClipWithData) {
      setUserActivelyUsingAITools(false);
      setAiToolsButtonClicked(false);
    }
  }, [currentClip?.id, currentClip?.isFocusedClip, currentClip?.automatedTranscription, currentClip?.translation, currentClip?.englishTranslation, currentClip?.comparisonResult]);

  // REMOVED: unlockCurrentClip function

  const getComprehensiveTranscriptionData = useCallback(() => {
    if (!currentClip || !activeMediaSourceId) {
      return {
        userTranscription: userTranscriptionInput.trim(),
        automatedTranscription: currentClip?.automatedTranscription || null,
        hasValidUserTranscription: userTranscriptionInput.trim().length > 0,
        hasValidAutomatedTranscription: false,
        isTranscriptionSaved: false // Default to false if no clip/source
      };
    }
    const savedClip = sessionClips?.find(sessionClip =>
      sessionClip.mediaSourceId === activeMediaSourceId &&
      sessionClip.startTime === currentClip.startTime &&
      sessionClip.endTime === currentClip.endTime
    );
    const clipCacheKey = getClipCacheKey(activeMediaSourceId, currentClip);
    const cachedData = clipCacheKey ? localAIToolsCache.current[clipCacheKey] : null;
    const localUserTranscription = userTranscriptionInput.trim();
    const sessionUserTranscription = savedClip?.userTranscription?.trim() || "";
    const clipUserTranscription = currentClip.userTranscription?.trim() || "";
    const finalUserTranscription = localUserTranscription || sessionUserTranscription || clipUserTranscription;
    const clipAutomatedTranscription = currentClip.automatedTranscription;
    const sessionAutomatedTranscription = savedClip?.automatedTranscription;
    const cachedAutomatedTranscription = cachedData?.automatedTranscription;
    const finalAutomatedTranscription = clipAutomatedTranscription || sessionAutomatedTranscription || cachedAutomatedTranscription || null;
    const hasValidUserTranscription = finalUserTranscription.length > 0;
    const hasValidAutomatedTranscription = Boolean(
      finalAutomatedTranscription &&
      finalAutomatedTranscription !== "Transcribing..." &&
      !finalAutomatedTranscription.startsWith("Error:")
    );
    // Key change: isTranscriptionSaved is true if there is a savedClip (from session) that matches,
    // AND it has some userTranscription content. Or, if current userTranscriptionInput exists and a save has been triggered.
    // For simplicity now, a savedClip implies a save action occurred.
    const isTranscriptionSaved = Boolean(savedClip && savedClip.userTranscription && savedClip.userTranscription.trim().length > 0);

    return {
      userTranscription: finalUserTranscription,
      automatedTranscription: finalAutomatedTranscription,
      hasValidUserTranscription,
      hasValidAutomatedTranscription,
      isTranscriptionSaved
    };
  }, [currentClip, userTranscriptionInput, sessionClips, activeMediaSourceId]);

  // handleUserTranscriptionChange remains the same
  const handleUserTranscriptionChange = useCallback((newValue: string) => {
    const previousValue = lastUserTranscriptionForComparison;
    if (activeMediaSourceId && currentClip && previousValue.trim() !== newValue.trim()) {
      const clipCacheKey = getClipCacheKey(activeMediaSourceId, currentClip);
      if (clipCacheKey) {
        clearAIToolsCacheForClip(clipCacheKey, ['comparisonResult']);
      }
      if (onUpdateClipData) {
        onUpdateClipData(currentClip.id, { comparisonResult: null });
      }
      currentClip.comparisonResult = null;
      setLastUserTranscriptionForComparison(newValue.trim());
      console.log(`Cleared comparison results for clip ${currentClip.id} due to transcription change`);
    }
  }, [activeMediaSourceId, currentClip, onUpdateClipData, lastUserTranscriptionForComparison]);

  // handleAutoSave remains the same
  const handleAutoSave = useCallback((clipId: string, aiContent: any, isManualSave = false) => {
    if (!activeMediaSourceId) return;
    const clipCacheKey = getClipCacheKey(activeMediaSourceId, currentClip);
    if (!clipCacheKey) return;
    const currentCache = localAIToolsCache.current[clipCacheKey] || {};
    const updatedCache = { ...currentCache, ...aiContent };
    localAIToolsCache.current[clipCacheKey] = updatedCache;
    updateAIToolsCache(clipCacheKey, updatedCache);
    if (onUpdateClipData) {
      onUpdateClipData(clipId, updatedCache);
    }
  }, [activeMediaSourceId, onUpdateClipData, currentClip]);

  // withAIToolsProtection remains the same
  const withAIToolsProtection = useCallback(async (action: () => Promise<void>) => {
    setUserActivelyUsingAITools(true);
    try {
      await action();
    } finally {
      setTimeout(() => setUserActivelyUsingAITools(false), 1000); // Keep a small delay
    }
  }, []);

  // Derived state
  const comprehensiveData = getComprehensiveTranscriptionData();
  const canAccessAITools = shouldEnableAITools(
    comprehensiveData.isTranscriptionSaved, // Main condition is now whether transcription is saved
    userActivelyUsingAITools
  );

  const hasValidAIContent = Boolean(
    currentClip.automatedTranscription &&
    currentClip.automatedTranscription !== "Transcribing..." &&
    !currentClip.automatedTranscription.startsWith("Error:")
  );

  const isProcessing = Boolean(
    currentClip.automatedTranscription === "Transcribing..." ||
    currentClip.translation === "Translating..." ||
    currentClip.englishTranslation === "Translating..." ||
    (Array.isArray(currentClip.comparisonResult) &&
     currentClip.comparisonResult.length === 1 &&
     currentClip.comparisonResult[0].token === "Comparing...")
  );

  // Cache AI tool results when they're available (remains same)
  useEffect(() => {
    if (!currentClip || !activeMediaSourceId) return;
    const clipCacheKey = getClipCacheKey(activeMediaSourceId, currentClip);
    if (!clipCacheKey) return;
    const cacheData: any = {};
    let shouldUpdateCache = false;

    if (currentClip.automatedTranscription &&
        currentClip.automatedTranscription !== "Transcribing..." &&
        !String(currentClip.automatedTranscription).startsWith("Error:")) {
      cacheData.automatedTranscription = currentClip.automatedTranscription;
      cacheData.language = currentClip.language || language;
      shouldUpdateCache = true;
    }
    if (currentClip.translation &&
        currentClip.translation !== "Translating..." &&
        !String(currentClip.translation).startsWith("Error:")) {
      cacheData.translation = currentClip.translation;
      cacheData.translationTargetLanguage = currentClip.translationTargetLanguage;
      shouldUpdateCache = true;
    }
    if (currentClip.englishTranslation &&
              currentClip.englishTranslation !== "Translating..." &&
              !String(currentClip.englishTranslation).startsWith("Error:")) {
      cacheData.englishTranslation = currentClip.englishTranslation;
      // Ensure english translation target language is set correctly
      cacheData.translationTargetLanguage = "english";
      shouldUpdateCache = true;
    }
    if (currentClip.comparisonResult &&
        Array.isArray(currentClip.comparisonResult) &&
        currentClip.comparisonResult.length > 0 &&
        !(currentClip.comparisonResult.length === 1 &&
          (currentClip.comparisonResult[0].token === "Comparing..." ||
           String(currentClip.comparisonResult[0].token).startsWith("Error:")))) {
      cacheData.comparisonResult = currentClip.comparisonResult;
      shouldUpdateCache = true;
    }
    if (shouldUpdateCache) {
      updateAIToolsCache(clipCacheKey, { ...localAIToolsCache.current[clipCacheKey], ...cacheData });
      localAIToolsCache.current[clipCacheKey] = { ...localAIToolsCache.current[clipCacheKey], ...cacheData };
    }
  }, [
    activeMediaSourceId,
    currentClip,
    language,
    localAIToolsCache
    // currentClip.automatedTranscription, currentClip.translation,
    // currentClip.englishTranslation, currentClip.comparisonResult,
    // currentClip.language, currentClip.translationTargetLanguage
  ]);

  return {
    userActivelyUsingAITools,
    setUserActivelyUsingAITools,
    aiToolsButtonClicked, // keep for UI feedback if needed
    setAiToolsButtonClicked, // keep for UI feedback if needed
    getComprehensiveTranscriptionData,
    handleUserTranscriptionChange,
    handleAutoSave,
    withAIToolsProtection,
    canAccessAITools,
    hasValidAIContent,
    isProcessing,
    // unlockCurrentClip // REMOVED
  };
}
