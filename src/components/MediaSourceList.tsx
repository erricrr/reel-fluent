"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileVideo, X as XIcon, FileAudio, Edit3 } from "lucide-react";
import { formatSecondsToMMSS } from '@/lib/timeUtils';
import { LANGUAGE_OPTIONS, getLanguageLabel } from '@/lib/languageOptions';
import type { MediaSource } from '@/hooks/useMediaSources';

interface MediaSourceListProps {
  sources: MediaSource[];
  activeSourceId: string | null;
  onSelectSource: (sourceId: string) => void;
  onRemoveSource: (sourceId: string) => void;
  onUpdateLanguage?: (sourceId: string, language: string) => void;
  disabled: boolean;
}

export default function MediaSourceList({
  sources,
  activeSourceId,
  onSelectSource,
  onRemoveSource,
  onUpdateLanguage,
  disabled
}: MediaSourceListProps) {
  const [editingLanguage, setEditingLanguage] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground pt-3">
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
            <div className="flex items-center gap-3 min-w-0 flex-grow">
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
                    {source.duration > 0 && (
                      <span>{formatSecondsToMMSS(source.duration)}</span>
                    )}
                  </div>
                </div>
              </button>
              <div className="flex-shrink-0">
                {editingLanguage === source.id ? (
                  <Select
                    value={source.language || ''}
                    onValueChange={(value) => {
                      if (onUpdateLanguage) {
                        onUpdateLanguage(source.id, value);
                      }
                      setEditingLanguage(null);
                    }}
                  >
                    <SelectTrigger className="h-6 w-24 text-xs">
                      <SelectValue placeholder="Language" />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingLanguage(source.id);
                    }}
                    disabled={disabled}
                  >
                    <span className="capitalize">
                      {source.language ? getLanguageLabel(source.language) : 'Set Language'}
                    </span>
                    <Edit3 className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            </div>
            <Button
              variant="default2"
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
