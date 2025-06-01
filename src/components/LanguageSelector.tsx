"use client";

import type * as React from 'react';
import { useEffect, useRef } from 'react';
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
import { HelpCircle, Check } from "lucide-react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

interface LanguageSelectorProps {
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  disabled?: boolean;
}

export default function LanguageSelector({ selectedLanguage, onLanguageChange, disabled }: LanguageSelectorProps) {
  const selectedRef = useRef<HTMLDivElement>(null);

  // Scroll selected language into view when it changes
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [selectedLanguage]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="language-select" className="flex items-center gap-2">
          Media Source Language
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

      {/* Dropdown for small screens only */}
      <div className="md:hidden">
        <Select
          value={selectedLanguage}
          onValueChange={onLanguageChange}
          disabled={disabled}
        >
          <SelectTrigger id="language-select" className="w-full">
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent
            position="popper"
            side="bottom"
            sideOffset={4}
            collisionPadding={20}
            className="min-w-[200px] max-h-[180px]"
            alignOffset={0}
            avoidCollisions={true}
          >
            {LANGUAGE_OPTIONS.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Vertical list for medium and large screens */}
      <div className="hidden md:block">
        <ScrollArea className="h-[200px] w-full rounded-md border">
          <RadioGroup
            value={selectedLanguage}
            onValueChange={onLanguageChange}
            className="p-1"
            disabled={disabled}
          >
            {LANGUAGE_OPTIONS.map((lang) => (
              <div
                key={lang.value}
                ref={selectedLanguage === lang.value ? selectedRef : null}
                className={cn(
                  "flex items-center space-x-2 p-1.5",
                  "cursor-pointer rounded-md transition-colors",
                  selectedLanguage === lang.value
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
                onClick={() => !disabled && onLanguageChange(lang.value)}
              >
                <RadioGroupItem value={lang.value} id={`lang-${lang.value}`} className="sr-only" />
                <div className="w-4 h-4 flex items-center justify-center">
                  {selectedLanguage === lang.value && <Check className="h-4 w-4" />}
                </div>
                <Label
                  htmlFor={`lang-${lang.value}`}
                  className={cn(
                    "cursor-pointer text-sm font-medium select-none",
                    selectedLanguage === lang.value ? "text-primary" : "text-foreground"
                  )}
                >
                  {lang.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </ScrollArea>
      </div>
    </div>
  );
}
