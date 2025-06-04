import type { Clip } from './videoUtils';
import type { CorrectionToken } from '@/ai/flows/compare-transcriptions-flow';

/**
 * Hydrate a Clip with AI tools data from cache and session.
 * Priority: cache > session > clip, but active loading states in clip win.
 */
export function hydrateClipWithAIData(
  clip: Clip,
  mediaSourceId: string | null | undefined,
  sessionClips: Clip[], // These are expected to be SessionClip type from useMediaSources
  aiToolsCache: Record<string, any>
): Clip {
  if (!mediaSourceId) return { ...clip }; // Return a copy to avoid mutation

  const cacheKey = `${mediaSourceId}-${clip.startTime}-${clip.endTime}`;
  const cachedData = aiToolsCache[cacheKey] || {};
  const sessionData = sessionClips.find(
    // Ensure to cast c to any or a more specific type if mediaSourceId is not on Clip
    c => c.startTime === clip.startTime && c.endTime === clip.endTime && (c as any).mediaSourceId === mediaSourceId
  ) || {};

  // Start with the current clip's data as base
  let hydratedClip: Clip = { ...clip };

  // Helper to check for active loading states
  const isLoadingState = (value: any): boolean => {
    if (typeof value === 'string') {
      return value.endsWith('...') || value.startsWith('Error:'); // e.g., "Transcribing...", "Error:..."
    }
    // Check for CorrectionToken[] specifically for comparisonResult
    if (Array.isArray(value) && value.length > 0 && typeof (value[0] as CorrectionToken)?.token === 'string') {
        // Check if it's the specific loading state for comparisonResult
        if (value.length === 1 && ((value[0] as CorrectionToken).token === "Comparing..." || (value[0] as CorrectionToken).token.startsWith("Error:"))) {
            return true;
        }
    }
    return false;
  };

  // Merge fields, prioritizing current clip's loading/error states
  const fieldsToHydrate: (keyof Clip)[] = [
    'automatedTranscription',
    'language',
    'translation',
    'translationTargetLanguage',
    'englishTranslation',
    'comparisonResult',
    'userTranscription', // also hydrate user transcription if available in session/cache and not in current clip
    'displayName' // from session data
  ];

  fieldsToHydrate.forEach(field => {
    const clipValue = hydratedClip[field];
    const sessionValue = (sessionData as any)[field];
    const cacheValue = cachedData[field];

    if (field === 'comparisonResult' && isLoadingState(clipValue as CorrectionToken[] | null | undefined)){
        (hydratedClip as any)[field] = clipValue;
    } else if (isLoadingState(clipValue as string | null | undefined)) {
      // If current clip has a loading/error state for this field, keep it
      (hydratedClip as any)[field] = clipValue;
    } else {
      // Otherwise, prioritize cache > session > clip's initial value
      if (cacheValue !== undefined && cacheValue !== null) {
        (hydratedClip as any)[field] = cacheValue;
      } else if (sessionValue !== undefined && sessionValue !== null) {
        (hydratedClip as any)[field] = sessionValue;
      } // If neither cache nor session has it, clipValue (already in hydratedClip) is used
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
  } else if ((sessionData as any).mediaSourceId) {
    (hydratedClip as any).mediaSourceId = (sessionData as any).mediaSourceId;
  }

  return hydratedClip;
}
