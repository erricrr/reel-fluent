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
import { HelpCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

interface LanguageSelectorProps {
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  disabled?: boolean;
}

// Extracted header component for reusability
const LanguageSelectorHeader = () => (
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
);

// Extracted language option rendering logic
const renderLanguageOptions = () =>
  LANGUAGE_OPTIONS.map((lang) => (
    <SelectItem key={lang.value} value={lang.value}>
      {lang.label}
    </SelectItem>
  ));

// Mobile dropdown component
const MobileLanguageSelector = ({ selectedLanguage, onLanguageChange, disabled }: LanguageSelectorProps) => (
  <div className="sm:hidden">
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
        {renderLanguageOptions()}
      </SelectContent>
    </Select>
  </div>
);

// Desktop language list component
const DesktopLanguageSelector = ({ selectedLanguage, onLanguageChange, disabled, selectedRef }: LanguageSelectorProps & { selectedRef: React.RefObject<HTMLDivElement> }) => (
  <div className="hidden sm:block">
    <ScrollArea className="h-[240px] w-full rounded-xl border bg-gradient-to-b from-background to-background/50">
      <div className="relative">
        <RadioGroup
          value={selectedLanguage}
          onValueChange={onLanguageChange}
          className="px-1 py-1 space-y-1"
          disabled={disabled}
        >
          <div className="py-1">
            {LANGUAGE_OPTIONS.map((lang, index) => (
              <LanguageOption
                key={lang.value}
                lang={lang}
                index={index}
                selectedLanguage={selectedLanguage}
                onLanguageChange={onLanguageChange}
                disabled={disabled}
                selectedRef={selectedLanguage === lang.value ? selectedRef : null}
              />
            ))}
          </div>
        </RadioGroup>

        {/* Fade effects */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-b from-background/80 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
      </div>
    </ScrollArea>
  </div>
);

// Individual language option component
const LanguageOption = ({
  lang,
  index,
  selectedLanguage,
  onLanguageChange,
  disabled,
  selectedRef
}: {
  lang: { value: string; label: string };
  index: number;
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  disabled?: boolean;
  selectedRef: React.RefObject<HTMLDivElement> | null;
}) => {
  const isSelected = selectedLanguage === lang.value;

  return (
    <div
      ref={selectedRef}
      className={cn(
        "group relative flex items-center space-x-3 p-1.5",
        "cursor-pointer rounded-lg transition-all duration-300 ease-out",
        "hover:bg-muted/50 hover:shadow-sm",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      onClick={() => !disabled && onLanguageChange(lang.value)}
      style={{
        animationDelay: `${index * 50}ms`
      }}
    >
      <RadioGroupItem value={lang.value} id={`lang-${lang.value}`} className="sr-only" />

      {/* Custom radio indicator */}
      <div className={cn(
        "relative w-4 h-4 rounded-full border-2 transition-all duration-200",
        "flex items-center justify-center",
        isSelected
          ? "border-primary bg-primary"
          : "border-muted-foreground/30 group-hover:border-primary/50"
      )}>
        {isSelected && (
          <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground animate-in fade-in-0 zoom-in-75 duration-200" />
        )}
      </div>

      {/* Language label */}
      <Label
        htmlFor={`lang-${lang.value}`}
        className={cn(
          "cursor-pointer text-sm select-none",
          "transition-all duration-200 tracking-wide",
          "text-foreground/80 group-hover:text-foreground",
          isSelected && "font-bold"
        )}
      >
        {lang.label}
      </Label>
    </div>
  );
};

export default function LanguageSelector({ selectedLanguage, onLanguageChange, disabled }: LanguageSelectorProps) {
  const selectedRef = useRef<HTMLDivElement>(null);

  // Scroll selected language into view when it changes
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [selectedLanguage]);

  return (
    <div className="space-y-2">
      <LanguageSelectorHeader />
      <MobileLanguageSelector
        selectedLanguage={selectedLanguage}
        onLanguageChange={onLanguageChange}
        disabled={disabled}
      />
      <DesktopLanguageSelector
        selectedLanguage={selectedLanguage}
        onLanguageChange={onLanguageChange}
        disabled={disabled}
        selectedRef={selectedRef}
      />
    </div>
  );
}
