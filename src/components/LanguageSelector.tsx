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

interface LanguageSelectorProps {
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  disabled?: boolean;
}

export default function LanguageSelector({ selectedLanguage, onLanguageChange, disabled }: LanguageSelectorProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="language-select">Language of Video Audio</Label>
      <Select
        value={selectedLanguage}
        onValueChange={onLanguageChange}
        disabled={disabled}

      >
        <SelectTrigger id="language-select" className="w-full md:w-[200px]">
          <SelectValue placeholder="Select language" />
        </SelectTrigger>
        <SelectContent>
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
