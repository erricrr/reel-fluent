
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
  { value: "30", label: "30 Seconds" },
  { value: "60", label: "1 Minute" },
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
        className="flex flex-col sm:flex-row sm:gap-4"
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
