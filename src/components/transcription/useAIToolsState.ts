import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Clip } from '@/lib/videoUtils';
import type { CorrectionToken } from '@/ai/flows/compare-transcriptions-flow';

// Updated to remove explicit unlock; access depends on saved transcription, AI data availability, and active use.
const shouldEnableAITools = (
  isTranscriptionSaved: boolean,
  userActivelyUsingAITools: boolean = false,
  hasExistingAIData: boolean = false
): boolean => {
  // Allow access if:
  // 1. Transcription is saved in session, OR
  // 2. User is actively interacting with AI tools, OR
  // 3. The clip already has valid AI data (automated transcription, translation, etc.)
  return isTranscriptionSaved || userActivelyUsingAITools || hasExistingAIData;
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

  // Change localAIToolsCache to use useMemo, re-fetching when activeMediaSourceId or currentClip identity changes.
  // This ensures that lookups within this hook instance use a cache snapshot relevant to the current context.
  const localAIToolsCache = useMemo(() => {
    return getAIToolsCache();
  }, [activeMediaSourceId, currentClip?.id]); // Re-fetch when source or specific clip changes

  // Special handling for focused clips - ensure immediate cache population in localStorage
  useEffect(() => {
    if (currentClip?.isFocusedClip && currentClip.mediaSourceId) { // Ensure mediaSourceId exists on clip
      const clipCacheKey = getClipCacheKey(currentClip.mediaSourceId, currentClip);

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
          // Ensure translationTargetLanguage is set if englishTranslation exists and target is not specified
          cacheData.translationTargetLanguage = currentClip.translationTargetLanguage || "english";
        }
        if (currentClip.comparisonResult) {
          cacheData.comparisonResult = currentClip.comparisonResult;
        }
        // Update localStorage directly. localAIToolsCache (memoized) will pick it up on next re-evaluation if needed.
        updateAIToolsCache(clipCacheKey, { ...(localAIToolsCache[clipCacheKey] || {}), ...cacheData });
      }
    }
  }, [
    currentClip?.isFocusedClip,
    currentClip?.id,
    currentClip?.mediaSourceId, // Added mediaSourceId from clip
    currentClip?.automatedTranscription,
    currentClip?.translation,
    currentClip?.englishTranslation,
    currentClip?.comparisonResult,
    currentClip?.language, // Added language
    currentClip?.translationTargetLanguage, // Added translationTargetLanguage
    localAIToolsCache // Add localAIToolsCache as a dependency because we read it before update
  ]);

  // Reset userActivelyUsingAITools when clip changes (logic remains similar)
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
    const sourceIdForLookup = currentClip?.mediaSourceId || activeMediaSourceId;
    if (!currentClip || !sourceIdForLookup) {
      // ... (return default empty structure) ...
      return {
        userTranscription: userTranscriptionInput.trim(),
        automatedTranscription: null,
        hasValidUserTranscription: userTranscriptionInput.trim().length > 0,
        hasValidAutomatedTranscription: false,
        isTranscriptionSaved: false,
        hasExistingAIData: false
      };
    }
    const clipCacheKey = getClipCacheKey(sourceIdForLookup, currentClip);
    // Use the memoized localAIToolsCache for reading
    const cachedData = clipCacheKey ? localAIToolsCache[clipCacheKey] : null;
    const localUserTranscription = userTranscriptionInput.trim();
    const sessionAssociatedData = sessionClips?.find(sc => sc.mediaSourceId === sourceIdForLookup && sc.startTime === currentClip.startTime && sc.endTime === currentClip.endTime);
    const sessionUserTranscription = sessionAssociatedData?.userTranscription?.trim() || "";
    const clipUserTranscription = currentClip.userTranscription?.trim() || "";
    const finalUserTranscription = localUserTranscription || sessionUserTranscription || clipUserTranscription;

    const clipAutomatedTranscription = currentClip.automatedTranscription;
    const sessionAutomatedTranscription = sessionAssociatedData?.automatedTranscription;
    const cachedAutomatedTranscription = cachedData?.automatedTranscription;
    const finalAutomatedTranscription = clipAutomatedTranscription || sessionAutomatedTranscription || cachedAutomatedTranscription || null;

    const hasValidUserTranscription = finalUserTranscription.length > 0;
    const hasValidAutomatedTranscription = Boolean(
      finalAutomatedTranscription &&
      finalAutomatedTranscription !== "Transcribing..." &&
      !finalAutomatedTranscription.startsWith("Error:")
    );
    const isTranscriptionSaved = Boolean(sessionAssociatedData && sessionAssociatedData.userTranscription && sessionAssociatedData.userTranscription.trim().length > 0);

    // Check if the clip has any existing valid AI data (including from cache, session, or current clip)
    const clipTranslation = currentClip.translation;
    const sessionTranslation = sessionAssociatedData?.translation;
    const cachedTranslation = cachedData?.translation;
    const finalTranslation = clipTranslation || sessionTranslation || cachedTranslation;

    const clipEnglishTranslation = currentClip.englishTranslation;
    const sessionEnglishTranslation = sessionAssociatedData?.englishTranslation;
    const cachedEnglishTranslation = cachedData?.englishTranslation;
    const finalEnglishTranslation = clipEnglishTranslation || sessionEnglishTranslation || cachedEnglishTranslation;

    const clipComparisonResult = currentClip.comparisonResult;
    const sessionComparisonResult = sessionAssociatedData?.comparisonResult;
    const cachedComparisonResult = cachedData?.comparisonResult;
    const finalComparisonResult = clipComparisonResult || sessionComparisonResult || cachedComparisonResult;

    const hasValidTranslation = Boolean(
      finalTranslation &&
      finalTranslation !== "Translating..." &&
      !finalTranslation.startsWith("Error:")
    );

    const hasValidEnglishTranslation = Boolean(
      finalEnglishTranslation &&
      finalEnglishTranslation !== "Translating..." &&
      !finalEnglishTranslation.startsWith("Error:")
    );

    const hasValidComparisonResult = Boolean(
      finalComparisonResult &&
      Array.isArray(finalComparisonResult) &&
      finalComparisonResult.length > 0 &&
      !(finalComparisonResult.length === 1 &&
        (finalComparisonResult[0].token === "Comparing..." ||
         finalComparisonResult[0].token.startsWith("Error:")))
    );

    const hasExistingAIData = hasValidAutomatedTranscription || hasValidTranslation || hasValidEnglishTranslation || hasValidComparisonResult;

    return {
      userTranscription: finalUserTranscription,
      automatedTranscription: finalAutomatedTranscription,
      hasValidUserTranscription,
      hasValidAutomatedTranscription,
      isTranscriptionSaved,
      hasExistingAIData
    };
  }, [currentClip, userTranscriptionInput, sessionClips, activeMediaSourceId, localAIToolsCache]); // localAIToolsCache is a dependency

  // handleUserTranscriptionChange remains the same
  const handleUserTranscriptionChange = useCallback((newValue: string) => {
    const previousValue = lastUserTranscriptionForComparison;
    const sourceIdForCache = currentClip?.mediaSourceId || activeMediaSourceId;
    if (sourceIdForCache && currentClip && previousValue.trim() !== newValue.trim()) {
      const clipCacheKey = getClipCacheKey(sourceIdForCache, currentClip);
      if (clipCacheKey) {
        clearAIToolsCacheForClip(clipCacheKey, ['comparisonResult']); // This updates localStorage
      }
      if (onUpdateClipData) {
        onUpdateClipData(currentClip.id, { comparisonResult: null });
      }
      setLastUserTranscriptionForComparison(newValue.trim());
      console.log(`Cleared comparison results for clip ${currentClip.id} due to transcription change`);
    }
  }, [activeMediaSourceId, currentClip, onUpdateClipData, lastUserTranscriptionForComparison]);

  // handleAutoSave remains the same
  const handleAutoSave = useCallback((clipId: string, aiContent: any, isManualSave = false) => {
    const sourceIdForCache = currentClip?.mediaSourceId || activeMediaSourceId;
    if (!sourceIdForCache || !currentClip) return;

    const clipCacheKey = getClipCacheKey(sourceIdForCache, currentClip);
    if (!clipCacheKey) return;

    const currentCacheDataFromStorage = getAIToolsCache()[clipCacheKey] || {}; // Read latest from storage for merging
    const updatedDataForStorage = { ...currentCacheDataFromStorage, ...aiContent };
    updateAIToolsCache(clipCacheKey, updatedDataForStorage); // Update localStorage

    if (onUpdateClipData) {
      onUpdateClipData(clipId, updatedDataForStorage); // Pass the merged data
    }
  }, [activeMediaSourceId, currentClip, onUpdateClipData]); // Removed localAIToolsCache from deps, interacts directly with storage

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
    comprehensiveData.isTranscriptionSaved, // Transcription saved in session
    userActivelyUsingAITools, // User actively using AI tools
    comprehensiveData.hasExistingAIData // Clip has existing AI data
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
    const sourceIdForCache = currentClip?.mediaSourceId || activeMediaSourceId;
    if (!currentClip || !sourceIdForCache) return;
    const clipCacheKey = getClipCacheKey(sourceIdForCache, currentClip);
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
      updateAIToolsCache(clipCacheKey, { ...localAIToolsCache[clipCacheKey], ...cacheData });
      localAIToolsCache[clipCacheKey] = { ...localAIToolsCache[clipCacheKey], ...cacheData };
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
