"use client";

import { Button } from "@/components/ui/button";
import { FileVideo, X as XIcon, FileAudio } from "lucide-react";
import { formatSecondsToMMSS } from '@/lib/timeUtils';
import type { MediaSource } from '@/hooks/useMediaSources';

interface MediaSourceListProps {
  sources: MediaSource[];
  activeSourceId: string | null;
  onSelectSource: (sourceId: string) => void;
  onRemoveSource: (sourceId: string) => void;
  disabled: boolean;
}

export default function MediaSourceList({
  sources,
  activeSourceId,
  onSelectSource,
  onRemoveSource,
  disabled
}: MediaSourceListProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">
        Media Sources ({sources.length}/3)
      </h3>
      <div className="space-y-2">
        {sources.map((source) => (
          <div
            key={source.id}
            className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
              source.id === activeSourceId
                ? 'border-primary bg-primary/10'
                : 'border-border bg-muted/50'
            }`}
          >
            <button
              className="flex items-center gap-3 min-w-0 flex-grow text-left"
              onClick={() => onSelectSource(source.id)}
              disabled={disabled}
            >
              {source.type === 'audio' ? (
                <FileAudio className="h-5 w-5 flex-shrink-0" />
              ) : (
                <FileVideo className="h-5 w-5 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-grow">
                <div className="truncate text-sm" title={source.displayName}>
                  {source.displayName}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {source.language && (
                    <span className="capitalize">{source.language}</span>
                  )}
                  {source.language && source.duration > 0 && (
                    <span>•</span>
                  )}
                  {source.duration > 0 && (
                    <span>{formatSecondsToMMSS(source.duration)}</span>
                  )}
                </div>
              </div>
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveSource(source.id);
              }}
              disabled={disabled}
              className="flex-shrink-0"
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
