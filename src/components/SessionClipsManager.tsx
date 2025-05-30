import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Film, Save, Trash2, Edit2, FileAudio, FileVideo, Play, X as XIcon } from "lucide-react";
import type { Clip } from '@/lib/videoUtils';
import { formatSecondsToMMSS } from '@/lib/timeUtils';
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { LucideIcon } from "lucide-react";

interface SessionClip extends Clip {
  displayName?: string;
  originalMediaSource?: string;
  originalMediaName?: string;
  mediaSourceId?: string;
}

interface SessionClipsManagerProps {
  sessionClips: SessionClip[];
  onLoadFromSession: (clip: SessionClip) => void;
  onRemoveFromSession: (clipId: string) => void;
  onRenameClip: (clipId: string, newName: string) => void;
  disabled?: boolean;
  mediaSources: { id: string; displayName: string; type: 'video' | 'audio' | 'url' | 'unknown' }[];
}

export default function SessionClipsManager({
  sessionClips,
  onLoadFromSession,
  onRemoveFromSession,
  onRenameClip,
  disabled = false,
  mediaSources
}: SessionClipsManagerProps) {
  const MAX_TOTAL_DURATION = 30 * 60; // 30 minutes in seconds
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");

  // Calculate total duration of saved clips
  const totalDuration = sessionClips.reduce((acc, clip) =>
    acc + (clip.endTime - clip.startTime), 0
  );

  // Calculate progress percentage
  const durationProgress = (totalDuration / MAX_TOTAL_DURATION) * 100;

  const handleStartEdit = (clip: SessionClip) => {
    setEditingClipId(clip.id);
    setEditingName(clip.displayName || "");
  };

  const handleSaveEdit = (clipId: string) => {
    onRenameClip(clipId, editingName);
    setEditingClipId(null);
    setEditingName("");
  };

  const handleCancelEdit = () => {
    setEditingClipId(null);
    setEditingName("");
  };

  if (sessionClips.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No clips saved in this session yet.</p>
        <p className="text-sm mt-2">Save clips to access them quickly without re-uploading media.</p>
      </div>
    );
  }

  return (
    <Card className="shadow-sm border-primary/20">
      <CardHeader className="pb-3 bg-primary/5">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Save className="h-4 w-4" />
            Saved Clips
          </div>
          <span className="text-xs text-muted-foreground">
            {formatSecondsToMMSS(totalDuration)} / {formatSecondsToMMSS(MAX_TOTAL_DURATION)}
          </span>
        </CardTitle>
        <Progress value={durationProgress} className="h-2" />
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {sessionClips.map((clip) => {
                const mediaSource = clip.mediaSourceId
                  ? mediaSources.find(s => s.id === clip.mediaSourceId)
                  : null;

                const SourceIcon: LucideIcon = mediaSource?.type === 'audio' ? FileAudio : FileVideo;
                const sourceName = mediaSource?.displayName || clip.originalMediaName || 'Unknown Source';

                return (
                  <div
                    key={clip.id}
                    className="flex flex-col gap-2 p-2 rounded-md border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-grow space-y-1">
                        {editingClipId === clip.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveEdit(clip.id);
                                } else if (e.key === 'Escape') {
                                  handleCancelEdit();
                                }
                              }}
                              placeholder="Enter clip name"
                              className="flex-grow"
                              autoFocus
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleSaveEdit(clip.id)}
                              disabled={!editingName.trim()}
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={handleCancelEdit}
                            >
                              <XIcon className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium truncate">
                              {clip.displayName || "Unnamed Clip"}
                            </h3>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleStartEdit(clip)}
                              disabled={disabled}
                              className="h-6 w-6"
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <SourceIcon className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate" title={sourceName}>
                            {sourceName}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatSecondsToMMSS(clip.startTime)} - {formatSecondsToMMSS(clip.endTime)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          size="icon"
                          variant="secondary"
                          onClick={() => onLoadFromSession(clip)}
                          disabled={disabled || !mediaSource}
                          title={!mediaSource ? "Media source not available" : "Load clip"}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onRemoveFromSession(clip.id)}
                          disabled={disabled}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {sessionClips.length === 0 && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  No clips saved in session
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
