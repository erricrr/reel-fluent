import type { Clip } from './videoUtils';

/**
 * Hydrate a Clip with AI tools data from cache and session.
 * Priority: cache > session > clip
 */
export function hydrateClipWithAIData(
  clip: Clip,
  mediaSourceId: string | null | undefined,
  sessionClips: Clip[],
  aiToolsCache: Record<string, any>
): Clip {
  if (!mediaSourceId) return { ...clip };
  const cacheKey = `${mediaSourceId}-${clip.startTime}-${clip.endTime}`;
  const cached = aiToolsCache[cacheKey] || {};
  const session = sessionClips.find(
    c => c.startTime === clip.startTime && c.endTime === clip.endTime && (c as any).mediaSourceId === mediaSourceId
  ) || {};

  // Merge: cache > session > clip
  const hydrated: Clip = {
    ...clip,
    ...session,
    ...cached,
    id: clip.id,
    startTime: clip.startTime,
    endTime: clip.endTime,
  };
  // Only add mediaSourceId if it exists on the original clip or session
  if ((clip as any).mediaSourceId) {
    (hydrated as any).mediaSourceId = (clip as any).mediaSourceId;
  } else if ((session as any).mediaSourceId) {
    (hydrated as any).mediaSourceId = (session as any).mediaSourceId;
  }
  return hydrated;
}
