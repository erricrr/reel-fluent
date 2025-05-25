"use client";

import type * as React from 'react';
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface ClipDurationSelectorProps {
  selectedDuration: number;
  onDurationChange: (duration: string) => void; // RadioGroup value is string
  disabled?: boolean;
}

const durationOptions = [
  { value: "15", label: "15 seconds" },
  { value: "30", label: "30 seconds" },
  { value: "60", label: "1 minute" },
];

export default function ClipDurationSelector({ selectedDuration, onDurationChange, disabled }: ClipDurationSelectorProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="clip-duration-select">Clip Segmentation Duration</Label>
      <RadioGroup
        id="clip-duration-select"
        value={String(selectedDuration)}
        onValueChange={onDurationChange}
        disabled={disabled}
        className="flex flex-row gap-2 xs:gap-4 flex-wrap"
      >
        {durationOptions.map((option) => (
          <div key={option.value} className="flex items-center space-x-2">
            <RadioGroupItem value={option.value} id={`duration-${option.value}`} />
            <Label htmlFor={`duration-${option.value}`} className="font-normal">
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
