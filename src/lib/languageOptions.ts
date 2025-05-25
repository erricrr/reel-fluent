export interface LanguageOption {
  value: string;
  label: string;
}

// Shared language options used across the app for consistency (DRY principle)
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "english", label: "English" },
  { value: "french", label: "French" },
  { value: "german", label: "German" },
  { value: "italian", label: "Italian" },
  { value: "japanese", label: "Japanese" },
  { value: "korean", label: "Korean" },
  { value: "spanish", label: "Spanish" },
  { value: "vietnamese", label: "Vietnamese" },
];

// Helper function to get language label by value
export function getLanguageLabel(value: string): string {
  const option = LANGUAGE_OPTIONS.find(lang => lang.value === value);
  return option ? option.label : value;
}
