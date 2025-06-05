import type { Clip } from './videoUtils';
import type { CorrectionToken } from '@/ai/flows/compare-transcriptions-flow';

/**
 * Hydrate a Clip with AI tools data from cache and session.
 * Priority:
 * 1. Active loading/error states from the incoming 'clip' prop.
 * 2. Final, non-loading data from the incoming 'clip' prop.
 * 3. Non-loading data from cache.
 * 4. Non-loading data from session.
 */
export function hydrateClipWithAIData(
  clip: Clip,
  mediaSourceId: string | null | undefined,
  sessionClips: Clip[],
  aiToolsCache: Record<string, any>
): Clip {
  if (!mediaSourceId) return { ...clip };

  // Ensure we have the correct mediaSourceId for the clip
  const effectiveMediaSourceId = (clip as any).mediaSourceId || mediaSourceId;

  // Generate cache key using effectiveMediaSourceId
  const cacheKey = `${effectiveMediaSourceId}-${clip.startTime}-${clip.endTime}`;
  const cachedData = aiToolsCache[cacheKey] || {};

  // Find matching session clip with strict mediaSourceId matching
  const sessionAssociatedData = sessionClips.find(
    sc =>
      sc.startTime === clip.startTime &&
      sc.endTime === clip.endTime &&
      ((sc as any).mediaSourceId === effectiveMediaSourceId)
  ) || {};

  let hydratedClip: Clip = { ...clip }; // Start with the incoming clip's data as the base

  // Helper to check for active loading states or error states
  const isLoadingOrErrorState = (value: any): boolean => {
    if (typeof value === 'string') {
      return value.endsWith('...') || value.startsWith('Error:');
    }
    if (Array.isArray(value) && value.length > 0 && typeof (value[0] as CorrectionToken)?.token === 'string') {
        if (value.length === 1 && ((value[0] as CorrectionToken).token === "Comparing..." || (value[0] as CorrectionToken).token.startsWith("Error:"))) {
            return true;
        }
    }
    return false;
  };

  const fieldsToHydrate: (keyof Clip)[] = [
    'automatedTranscription',
    'language',
    'translation',
    'translationTargetLanguage',
    'englishTranslation',
    'comparisonResult',
    'userTranscription',
    'displayName'
  ];

  fieldsToHydrate.forEach(field => {
    const currentPropValue = clip[field];
    const cacheValue = cachedData[field];
    const sessionValue = (sessionAssociatedData as any)[field];

    if (isLoadingOrErrorState(currentPropValue)) {
      // 1. Prioritize active loading/error state from the incoming prop.
      (hydratedClip as any)[field] = currentPropValue;
    } else if (currentPropValue !== undefined && currentPropValue !== null) {
      // 2. If prop has final, non-loading data, use it.
      (hydratedClip as any)[field] = currentPropValue;
    } else if (cacheValue !== undefined && cacheValue !== null && !isLoadingOrErrorState(cacheValue)) {
      // 3. Else, try non-loading cache data.
      (hydratedClip as any)[field] = cacheValue;
    } else if (sessionValue !== undefined && sessionValue !== null && !isLoadingOrErrorState(sessionValue)) {
      // 4. Else, try non-loading session data.
      (hydratedClip as any)[field] = sessionValue;
    }
  });

  // Ensure essential ID properties from the original clip are preserved
  hydratedClip.id = clip.id;
  hydratedClip.startTime = clip.startTime;
  hydratedClip.endTime = clip.endTime;
  hydratedClip.isFocusedClip = clip.isFocusedClip;

  // Always set the effectiveMediaSourceId to ensure proper cache/session lookup in future operations
  (hydratedClip as any).mediaSourceId = effectiveMediaSourceId;

  return hydratedClip;
}
