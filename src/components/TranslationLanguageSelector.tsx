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
import { LANGUAGE_OPTIONS, getLanguageLabel } from "@/lib/languageOptions";

interface TranslationLanguageSelectorProps {
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export default function TranslationLanguageSelector({
  selectedLanguage,
  onLanguageChange,
  disabled,
  label = "Translate to",
  className = "w-full md:w-[200px]"
}: TranslationLanguageSelectorProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="translation-language-select">{label}</Label>
      <Select
        value={selectedLanguage}
        onValueChange={onLanguageChange}
        disabled={disabled}
      >
        <SelectTrigger id="translation-language-select" className={`${className} [&>svg]:rotate-180`}>
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
