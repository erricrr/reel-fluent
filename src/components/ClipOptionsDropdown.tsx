"use client";

import * as React from 'react';
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2 as Trash2Icon } from "lucide-react";

interface ClipOptionsDropdownProps {
  currentClipIndex: number;
  onRemoveClip: (clipId: string) => void;
  clipId: string;
  disabled?: boolean;
}

export default function ClipOptionsDropdown({
  currentClipIndex,
  onRemoveClip,
  clipId,
  disabled = false,
}: ClipOptionsDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="default2"
          size="sm"
          className="h-8 w-8 p-0 cursor-pointer"
          disabled={disabled}
          aria-label="Clip options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="left" align="center" className="w-48">
        <DropdownMenuItem
          onClick={() => onRemoveClip(clipId)}
          className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
        >
          <Trash2Icon className="h-4 w-4 mr-2" />
          Remove Clip {currentClipIndex + 1}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
