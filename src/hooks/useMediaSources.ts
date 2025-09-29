import { useState, useCallback } from 'react';
import { useToast } from './use-toast';

export interface MediaSource {
  id: string;
  src: string;
  displayName: string;
  type: 'video' | 'audio' | 'url' | 'unknown';
  duration: number;
  language?: string;
  segmentationDuration?: number;
}

export interface SessionClip {
  id: string;
  startTime: number;
  endTime: number;
  language?: string;
  displayName?: string;
  mediaSourceId?: string;
  originalClipNumber?: number;
  userTranscription?: string | null;
  automatedTranscription?: string | null;
  translation?: string | null;
  translationTargetLanguage?: string | null;
  englishTranslation?: string | null;
  comparisonResult?: any;
  // Legacy fields for backward compatibility
  originalMediaName?: string;
  mediaSrc?: string;
  sourceType?: 'video' | 'audio' | 'url' | 'unknown';
}

export function useMediaSources() {
  const [mediaSources, setMediaSources] = useState<MediaSource[]>([]);
  const [activeMediaSourceId, setActiveMediaSourceId] = useState<string | null>(null);
  const [sessionClips, setSessionClips] = useState<SessionClip[]>([]);
  const { toast } = useToast();

  const addMediaSource = useCallback((source: MediaSource) => {
    if (mediaSources.length >= 3) {
      toast({
        variant: "destructive",
        title: "Maximum Sources Reached",
        description: "You can only have up to 3 media sources at a time.",
      });
      return false;
    }

    setMediaSources(prev => [...prev, source]);
    return true;
  }, [mediaSources.length, toast]);

  const removeMediaSource = useCallback((sourceId: string, hasClipsCallback?: (sourceId: string) => boolean) => {
    const hasClips = hasClipsCallback?.(sourceId) || false;

    if (hasClips) {
      return { requiresConfirmation: true };
    }

    setMediaSources(prev => prev.filter(source => source.id !== sourceId));

    // If we removed the active source, clear it
    if (sourceId === activeMediaSourceId) {
      setActiveMediaSourceId(null);
    }

    return { requiresConfirmation: false };
  }, [activeMediaSourceId]);

  const selectMediaSource = useCallback((sourceId: string) => {
    setActiveMediaSourceId(sourceId);
  }, []);

  const getActiveMediaSource = useCallback(() => {
    return mediaSources.find(source => source.id === activeMediaSourceId) || null;
  }, [mediaSources, activeMediaSourceId]);

  const updateSessionClips = useCallback((updater: (clips: SessionClip[]) => SessionClip[]) => {
    setSessionClips(updater);
  }, []);

  const addSessionClip = useCallback((clip: SessionClip) => {
    // Check total duration limit (30 minutes)
    const totalDuration = sessionClips.reduce((acc, c) => acc + (c.endTime - c.startTime), 0);
    const newClipDuration = clip.endTime - clip.startTime;

    if (totalDuration + newClipDuration > 30 * 60) {
      toast({
        variant: "destructive",
        title: "Session Full",
        description: "Cannot add more clips. Total duration would exceed 30 minutes.",
      });
      return false;
    }

    setSessionClips(prev => [clip, ...prev]);
    return true;
  }, [sessionClips, toast]);

  const removeSessionClip = useCallback((clipId: string) => {
    setSessionClips(prev => prev.filter(clip => clip.id !== clipId));
  }, []);

  const updateSessionClip = useCallback((clipId: string, updates: Partial<SessionClip>) => {
    setSessionClips(prev => prev.map(clip =>
      clip.id === clipId ? { ...clip, ...updates } : clip
    ));
  }, []);

  const getSessionClipsForSource = useCallback((sourceId: string) => {
    return sessionClips.filter(clip => clip.mediaSourceId === sourceId);
  }, [sessionClips]);

  const updateMediaSource = useCallback((sourceId: string, updates: Partial<MediaSource>) => {
    setMediaSources(prev => prev.map(source =>
      source.id === sourceId ? { ...source, ...updates } : source
    ));
  }, []);

  return {
    // State
    mediaSources,
    activeMediaSourceId,
    sessionClips,

    // Actions
    addMediaSource,
    removeMediaSource,
    selectMediaSource,
    updateMediaSource,
    getActiveMediaSource,

    // Session clips management
    updateSessionClips,
    addSessionClip,
    removeSessionClip,
    updateSessionClip,
    getSessionClipsForSource,

    // Computed values
    canAddMoreSources: mediaSources.length < 3,
    activeMediaSource: getActiveMediaSource(),
  };
}
