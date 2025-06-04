import { useState, useEffect, useRef, useCallback } from "react";
import type { Clip } from '@/lib/videoUtils';

// Inline utility function - Updated to require explicit unlock per clip
const shouldEnableAITools = (
  userInput: string,
  automatedTranscription?: string | null,
  userActivelyUsingAITools: boolean = false,
  isClipUnlocked: boolean = false
): boolean => {
  // Only unlock if the specific clip has been explicitly unlocked via save button
  if (isClipUnlocked) return true;

  // Allow temporary access when user is actively using AI tools
  if (userActivelyUsingAITools) return true;

  // Do NOT unlock just from having text - require explicit save action
  return false;
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
  onSaveToSession: (userTranscriptionInput: string) => void;
  canSaveToSession: boolean;
  userTranscriptionInput: string;
  language: string;
}

const AI_TOOLS_CACHE_KEY = "reel-fluent-ai-tools-cache";
const AI_TOOLS_UNLOCK_KEY = "reel-fluent-ai-tools-unlock-state";

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

// Helper functions for per-clip unlock state
const getUnlockState = (): Record<string, boolean> => {
  if (typeof window === 'undefined') return {};
  try {
    const cached = localStorage.getItem(AI_TOOLS_UNLOCK_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (e) {
    console.error("Error reading unlock state:", e);
    return {};
  }
};

const setUnlockState = (clipKey: string, unlocked: boolean): void => {
  if (typeof window === 'undefined' || !clipKey) return;
  try {
    const unlockState = getUnlockState();
    unlockState[clipKey] = unlocked;
    localStorage.setItem(AI_TOOLS_UNLOCK_KEY, JSON.stringify(unlockState));
  } catch (e) {
    console.error("Error updating unlock state:", e);
  }
};

const isClipUnlocked = (clipKey?: string): boolean => {
  if (!clipKey) return false;
  const unlockState = getUnlockState();
  return unlockState[clipKey] === true;
};

// Generate unique key for each clip using multiple properties for absolute uniqueness
const getClipUnlockKey = (mediaSourceId?: string | null, currentClip?: Clip): string | null => {
  if (!mediaSourceId || !currentClip) return null;
  // Use startTime and endTime for consistency across focused and regular clips
  return `${mediaSourceId}-${currentClip.startTime}-${currentClip.endTime}`;
};

// Generate consistent cache key for clips (DRY solution for session/navigation consistency)
const getClipCacheKey = (mediaSourceId?: string | null, currentClip?: Clip): string | null => {
  if (!mediaSourceId || !currentClip) return null;
  // Use startTime and endTime instead of clip.id for consistency
  // This ensures the same clip accessed via navigation or saved attempts uses the same cache
  return `${mediaSourceId}-${currentClip.startTime}-${currentClip.endTime}`;
};

export function useAIToolsState(config: AIToolsStateConfig) {
  const {
    currentClip,
    sessionClips,
    activeMediaSourceId,
    onUpdateClipData,
    onSaveToSession,
    canSaveToSession,
    userTranscriptionInput,
    language
  } = config;

  const [userActivelyUsingAITools, setUserActivelyUsingAITools] = useState(false);
  const [aiToolsButtonClicked, setAiToolsButtonClicked] = useState(false);
  const [lastUserTranscriptionForComparison, setLastUserTranscriptionForComparison] = useState("");
  const [isCurrentClipUnlocked, setIsCurrentClipUnlocked] = useState(false);

  const localAIToolsCache = useRef<Record<string, any>>(getAIToolsCache());
  const processedClipsMapRef = useRef<Record<string, {
    savedClipId: string | null,
    notified: boolean
  }>>({});

  // Generate clip unlock key
  const clipUnlockKey = getClipUnlockKey(activeMediaSourceId, currentClip);

  // Initialize unlock state when clip changes
  useEffect(() => {
    if (clipUnlockKey) {
      const unlocked = isClipUnlocked(clipUnlockKey);
      setIsCurrentClipUnlocked(unlocked);
    } else {
      setIsCurrentClipUnlocked(false);
    }
  }, [clipUnlockKey]);

  // Special handling for focused clips - ensure immediate cache and unlock state population
  useEffect(() => {
    if (currentClip?.isFocusedClip && activeMediaSourceId) {
      const clipCacheKey = getClipCacheKey(activeMediaSourceId, currentClip);
      const unlockKey = getClipUnlockKey(activeMediaSourceId, currentClip);

      // Check if this focused clip has AI data that needs to be cached
      const hasAIData = currentClip.automatedTranscription ||
                       currentClip.translation ||
                       currentClip.englishTranslation ||
                       currentClip.comparisonResult;

      if (hasAIData && clipCacheKey) {
        // Populate cache immediately
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

        // Update local cache
        localAIToolsCache.current[clipCacheKey] = cacheData;
        updateAIToolsCache(clipCacheKey, cacheData);

        // Ensure unlock state is set for focused clips with AI data
        if (unlockKey) {
          setUnlockState(unlockKey, true);
          setIsCurrentClipUnlocked(true);
        }
      }
    }
  }, [currentClip?.isFocusedClip, currentClip?.id, activeMediaSourceId, currentClip?.automatedTranscription, currentClip?.translation, currentClip?.englishTranslation, currentClip?.comparisonResult]);

  // Reset userActivelyUsingAITools when clip changes to prevent access bleeding across clips
  // BUT preserve state for focused clips that have existing AI data
  useEffect(() => {
    // Check if this is a focused clip with existing AI data
    const isFocusedClipWithData = currentClip?.isFocusedClip && (
      currentClip.automatedTranscription ||
      currentClip.translation ||
      currentClip.englishTranslation ||
      currentClip.comparisonResult
    );

    // Only reset if this is NOT a focused clip with existing AI data
    if (!isFocusedClipWithData) {
      setUserActivelyUsingAITools(false);
      setAiToolsButtonClicked(false);
    }
  }, [currentClip?.id, currentClip?.isFocusedClip, currentClip?.automatedTranscription, currentClip?.translation, currentClip?.englishTranslation, currentClip?.comparisonResult]);

  // Helper to unlock AI tools for current clip only
  const unlockCurrentClip = useCallback(() => {
    if (clipUnlockKey) {
      setUnlockState(clipUnlockKey, true);
      setIsCurrentClipUnlocked(true);
    }
  }, [clipUnlockKey]);

  // Helper to get comprehensive transcription data
  const getComprehensiveTranscriptionData = useCallback(() => {
    if (!currentClip || !activeMediaSourceId) {
      return {
        userTranscription: userTranscriptionInput.trim(),
        automatedTranscription: currentClip?.automatedTranscription || null,
        hasValidUserTranscription: userTranscriptionInput.trim().length > 0,
        hasValidAutomatedTranscription: false,
        isTranscriptionSaved: false
      };
    }

    // Check session data
    const savedClip = sessionClips?.find(sessionClip =>
      sessionClip.mediaSourceId === activeMediaSourceId &&
      sessionClip.startTime === currentClip.startTime &&
      sessionClip.endTime === currentClip.endTime
    );

    // Check local cache
    const clipCacheKey = getClipCacheKey(activeMediaSourceId, currentClip);
    const cachedData = clipCacheKey ? localAIToolsCache.current[clipCacheKey] : null;

    // Get user transcription from multiple sources
    const localUserTranscription = userTranscriptionInput.trim();
    const sessionUserTranscription = savedClip?.userTranscription?.trim() || "";
    const clipUserTranscription = currentClip.userTranscription?.trim() || "";

    // Priority: local input > session data > clip data
    const finalUserTranscription = localUserTranscription || sessionUserTranscription || clipUserTranscription;

    // Get automated transcription from multiple sources
    const clipAutomatedTranscription = currentClip.automatedTranscription;
    const sessionAutomatedTranscription = savedClip?.automatedTranscription;
    const cachedAutomatedTranscription = cachedData?.automatedTranscription;

    // Priority: current clip > session data > cache
    const finalAutomatedTranscription = clipAutomatedTranscription || sessionAutomatedTranscription || cachedAutomatedTranscription || null;

    const hasValidUserTranscription = finalUserTranscription.length > 0;
    const hasValidAutomatedTranscription = Boolean(
      finalAutomatedTranscription &&
      finalAutomatedTranscription !== "Transcribing..." &&
      !finalAutomatedTranscription.startsWith("Error:")
    );

    const isTranscriptionSaved = Boolean(savedClip) || Boolean(sessionUserTranscription);

    return {
      userTranscription: finalUserTranscription,
      automatedTranscription: finalAutomatedTranscription,
      hasValidUserTranscription,
      hasValidAutomatedTranscription,
      isTranscriptionSaved
    };
  }, [currentClip, userTranscriptionInput, sessionClips, activeMediaSourceId]);

  // Handle user transcription changes
  const handleUserTranscriptionChange = useCallback((newValue: string) => {
    const previousValue = lastUserTranscriptionForComparison;

    // Clear comparison results when user transcription changes significantly
    if (activeMediaSourceId && currentClip && previousValue.trim() !== newValue.trim()) {
      const clipCacheKey = getClipCacheKey(activeMediaSourceId, currentClip);

      // Clear comparison results from cache
      if (clipCacheKey) {
        clearAIToolsCacheForClip(clipCacheKey, ['comparisonResult']);
      }

      // Clear comparison results from parent component
      if (onUpdateClipData) {
        onUpdateClipData(currentClip.id, { comparisonResult: null });
      }

      // Also clear from current clip state (forces re-fetch)
      currentClip.comparisonResult = null;

      setLastUserTranscriptionForComparison(newValue.trim());

      // Log for debugging
      console.log(`Cleared comparison results for clip ${currentClip.id} due to transcription change`);
    }
  }, [activeMediaSourceId, currentClip, onUpdateClipData, lastUserTranscriptionForComparison]);

  // Enhanced auto-save that integrates with session system
  const handleAutoSave = useCallback((clipId: string, aiContent: any, isManualSave = false) => {
    if (!activeMediaSourceId) return;

    const clipCacheKey = getClipCacheKey(activeMediaSourceId, currentClip);
    if (!clipCacheKey) return;

    const currentCache = localAIToolsCache.current[clipCacheKey] || {};

    // Merge new content with existing cache
    const updatedCache = {
      ...currentCache,
      ...aiContent
    };

    // Update both local ref and localStorage for immediate persistence
    localAIToolsCache.current[clipCacheKey] = updatedCache;
    updateAIToolsCache(clipCacheKey, updatedCache);

    // Also update parent component state
    if (onUpdateClipData) {
      onUpdateClipData(clipId, updatedCache);
    }

    // NOTE: Removed automatic session save to prevent clearing AI tools data
    // Session saves should only be triggered explicitly by user actions or manual save operations
  }, [activeMediaSourceId, onUpdateClipData, currentClip]);

  // Protection wrapper for AI operations
  const withAIToolsProtection = useCallback(async (action: () => Promise<void>) => {
    setUserActivelyUsingAITools(true);
    try {
      await action();
    } finally {
      setTimeout(() => setUserActivelyUsingAITools(false), 1000);
    }
  }, []);

  // Derived state
  const comprehensiveData = getComprehensiveTranscriptionData();
  const canAccessAITools = shouldEnableAITools(
    userTranscriptionInput,
    currentClip.automatedTranscription,
    userActivelyUsingAITools,
    isCurrentClipUnlocked
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

  // Cache AI tool results when they're available
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
    } else if (currentClip.englishTranslation &&
              currentClip.englishTranslation !== "Translating..." &&
              !String(currentClip.englishTranslation).startsWith("Error:")) {
      cacheData.englishTranslation = currentClip.englishTranslation;
      cacheData.translationTargetLanguage = "english";
      shouldUpdateCache = true;
    }

    if (currentClip.comparisonResult &&
        Array.isArray(currentClip.comparisonResult) &&
        currentClip.comparisonResult.length > 0 &&
        currentClip.comparisonResult[0].token !== "Comparing..." &&
        !String(currentClip.comparisonResult[0].token).startsWith("Error:")) {
      cacheData.comparisonResult = currentClip.comparisonResult;
      shouldUpdateCache = true;
    }

    if (shouldUpdateCache) {
      localAIToolsCache.current[clipCacheKey] = cacheData;
      updateAIToolsCache(clipCacheKey, cacheData);
    }
  }, [
    currentClip?.automatedTranscription,
    currentClip?.translation,
    currentClip?.englishTranslation,
    currentClip?.comparisonResult,
    currentClip?.id,
    activeMediaSourceId,
    language
  ]);

  // Reset state when media source changes
  useEffect(() => {
    if (!activeMediaSourceId) return;

    localAIToolsCache.current = getAIToolsCache();
    setUserActivelyUsingAITools(false);
    setAiToolsButtonClicked(false);

    // Clip unlock state is handled by the clipUnlockKey effect above
  }, [activeMediaSourceId]);

  return {
    // State
    userActivelyUsingAITools,
    setUserActivelyUsingAITools,
    aiToolsButtonClicked,
    setAiToolsButtonClicked,
    isCurrentClipUnlocked,

    // Derived state
    canAccessAITools,
    hasValidAIContent,
    isProcessing,
    comprehensiveData,

    // Functions
    handleUserTranscriptionChange,
    handleAutoSave,
    withAIToolsProtection,
    getComprehensiveTranscriptionData,
    unlockCurrentClip
  };
}
