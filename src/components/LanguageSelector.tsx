"use client";

import type * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { LANGUAGE_OPTIONS } from "@/lib/languageOptions";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import * as SelectPrimitive from "@radix-ui/react-select";

interface LanguageSelectorProps {
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  disabled?: boolean;
}

export default function LanguageSelector({ selectedLanguage, onLanguageChange, disabled }: LanguageSelectorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="language-select" className="flex items-center gap-2">
          Source Language
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-help text-muted-foreground hover:text-primary">
                  <HelpCircle className="h-4 w-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[300px]">
                <p>Select the language being spoken in your audio/video. This is crucial for accurate AI transcription and translation.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
      </div>
      <Select
        value={selectedLanguage}
        onValueChange={onLanguageChange}
        disabled={disabled}
      >
        <SelectTrigger id="language-select" className="w-full md:w-[200px] [&>svg]:rotate-180">
          <SelectValue placeholder="Select language" />
        </SelectTrigger>
        <SelectContent
          position="popper"
          side="top"
          sideOffset={4}
          collisionPadding={20}
          className="min-w-[200px] max-h-[180px]"
          alignOffset={0}
          avoidCollisions={false}
        >
          {LANGUAGE_OPTIONS.map((lang) => (
            <SelectItem key={lang.value} value={lang.value}>
              {lang.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
