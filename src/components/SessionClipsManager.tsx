import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Film, Save, Trash2, Edit2, FileAudio, FileVideo, Play, X as XIcon, Eye, Clock, Info } from "lucide-react";
import type { Clip } from '@/lib/videoUtils';
import { formatSecondsToMMSS } from '@/lib/timeUtils';
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SessionClip extends Clip {
  displayName?: string;
  originalMediaSource?: string;
  originalMediaName?: string;
  mediaSourceId?: string;
  originalClipNumber?: number;
}

interface SessionClipsManagerProps {
  sessionClips: SessionClip[];
  onLoadFromSession: (clip: SessionClip) => void;
  onRemoveFromSession: (clipId: string) => void;
  onRenameClip: (clipId: string, newName: string) => void;
  disabled?: boolean;
  mediaSources: { id: string; displayName: string; type: 'video' | 'audio' | 'url' | 'unknown' }[];
  focusedClipId?: string | null;
}

export default function SessionClipsManager({
  sessionClips,
  onLoadFromSession,
  onRemoveFromSession,
  onRenameClip,
  disabled = false,
  mediaSources,
  focusedClipId = null
}: SessionClipsManagerProps) {
  // DRY: extracted empty session clips message
  const EmptySessionClipsMessage = (
    <div className="text-center py-8 text-muted-foreground">
      <p>No transcription attempts yet.</p>
      <p className="text-sm mt-2">Your clips with transcription attempts will appear here.</p>
    </div>
  );

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
    return EmptySessionClipsMessage;
  }

  return (
    <Card className="shadow-sm border-primary/20 w-full">
      <CardHeader className="pb-3 bg-primary/5">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Clock className="h-4 w-4" />
            Total Clip Time
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-primary cursor-help transition-colors" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[300px] text-xs">
                  <p>Total duration of all your saved transcription attempts. Maximum of 30 minutes total allowed.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatSecondsToMMSS(totalDuration)} / {formatSecondsToMMSS(MAX_TOTAL_DURATION)}
          </span>
        </CardTitle>
        <Progress value={durationProgress} className="h-2" />
      </CardHeader>
      <CardContent className="overflow-y-auto">
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
                className="flex flex-col gap-2 p-2 w-full rounded-md border border-primary/20 bg-card"
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
                        <h3 className="font-medium break-words">
                          {clip.displayName || (clip.originalClipNumber ? `Clip ${clip.originalClipNumber}` : "Unnamed Clip")}
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
                      <span className="break-words" title={sourceName}>
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
                      variant="ghost"
                      onClick={() => onLoadFromSession(clip)}
                      disabled={disabled || !mediaSource}
                      title={!mediaSource ? "Media source not available" : "Focus on this clip"}
                      className={cn(
                        "transition-all duration-200",
                        focusedClipId === clip.id
                          ? "bg-primary hover:bg-primary/90 text-primary-foreground hover:text-primary-foreground"
                          : "hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Eye className="h-4 w-4" />
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
        </div>
      </CardContent>
    </Card>
  );
}
