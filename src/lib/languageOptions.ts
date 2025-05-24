export interface LanguageOption {
  value: string;
  label: string;
}

// Shared language options used across the app for consistency (DRY principle)
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "vietnamese", label: "Vietnamese" },
  { value: "english", label: "English" },
  { value: "spanish", label: "Spanish" },
  { value: "french", label: "French" },
  { value: "german", label: "German" },
  { value: "japanese", label: "Japanese" },
  { value: "korean", label: "Korean" },
];

// Helper function to get language label by value
export function getLanguageLabel(value: string): string {
  const option = LANGUAGE_OPTIONS.find(lang => lang.value === value);
  return option ? option.label : value;
}
