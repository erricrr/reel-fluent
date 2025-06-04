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
  clip: Clip, // This is initialCurrentClip from TranscriptionWorkspace
  mediaSourceId: string | null | undefined,
  sessionClips: Clip[],
  aiToolsCache: Record<string, any>
): Clip {
  if (!mediaSourceId) return { ...clip };

  const cacheKey = `${mediaSourceId}-${clip.startTime}-${clip.endTime}`;
  const cachedData = aiToolsCache[cacheKey] || {};
  const sessionAssociatedData = sessionClips.find(
    sc => sc.startTime === clip.startTime && sc.endTime === clip.endTime && (sc as any).mediaSourceId === mediaSourceId
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
    } else {
      // If all else fails (e.g., prop is null/undefined, cache/session are also null/undefined or have stale loading states),
      // the value in hydratedClip (from the initial { ...clip }) will persist, which is typically null/undefined for these fields initially.
      // No explicit assignment needed here as it's already set from the initial spread.
    }
  });

  // Ensure essential ID properties from the original clip are preserved
  hydratedClip.id = clip.id;
  hydratedClip.startTime = clip.startTime;
  hydratedClip.endTime = clip.endTime;
  hydratedClip.isFocusedClip = clip.isFocusedClip;

  // Preserve mediaSourceId if present on the original clip or session data
  if ((clip as any).mediaSourceId) {
    (hydratedClip as any).mediaSourceId = (clip as any).mediaSourceId;
  } else if ((sessionAssociatedData as any).mediaSourceId) {
    (hydratedClip as any).mediaSourceId = (sessionAssociatedData as any).mediaSourceId;
  }

  return hydratedClip;
}
