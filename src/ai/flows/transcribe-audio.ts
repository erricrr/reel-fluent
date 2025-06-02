"use server";
/**
 * @fileOverview This file defines a Genkit flow for automatically transcribing audio from a video clip.
 *
 * - transcribeAudio - A function that handles the audio transcription process.
 * - TranscribeAudioInput - The input type for the transcribeAudio function.
 * - TranscribeAudioOutput - The return type for the transcribeAudio function.
 */

import { ai } from "@/ai/genkit";
import { z } from "genkit";

const TranscribeAudioInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "The audio data as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'.",
    ),
  language: z.string().describe("The language of the audio.").optional(),
});

export type TranscribeAudioInput = z.infer<typeof TranscribeAudioInputSchema>;

const TranscribeAudioOutputSchema = z.object({
  transcription: z.string().describe("The transcription of the audio."),
});

export type TranscribeAudioOutput = z.infer<typeof TranscribeAudioOutputSchema>;

export async function transcribeAudio(
  input: TranscribeAudioInput,
): Promise<TranscribeAudioOutput> {
  return transcribeAudioFlow(input);
}

const transcribeAudioPrompt = ai.definePrompt({
  name: "transcribeAudioPrompt",
  input: { schema: TranscribeAudioInputSchema },
  output: { schema: TranscribeAudioOutputSchema },
  model: "googleai/gemini-2.0-flash",
  prompt: `Transcribe the following audio to text. {{#if language}}The language of the audio is {{language}}.{{/if}}

Instructions:
1. {{#if language}}Pay special attention to the specific accents and pronunciation patterns of {{language}}.{{else}}Identify the language automatically and pay attention to specific accents and pronunciation patterns.{{/if}}
2. For Vietnamese, ensure proper tone marks (dấu) are captured accurately.
3. For English, note any regional accents (American, British, etc.).
4. Maintain all language-specific punctuation and formatting.
5. Preserve any dialect-specific expressions or colloquialisms.
6. If the language is unclear or not specified, detect the language automatically and transcribe accordingly.

Audio: {{media url=audioDataUri}}`,
});

const transcribeAudioFlow = ai.defineFlow(
  {
    name: "transcribeAudioFlow",
    inputSchema: TranscribeAudioInputSchema,
    outputSchema: TranscribeAudioOutputSchema,
  },
  async (input) => {
    // Ensure we have a clean input - if language is provided and not empty, use it
    const processedInput = {
      ...input,
      language:
        input.language && input.language.trim()
          ? input.language.trim()
          : undefined,
    };

    // Implement aggressive retry logic for 503 and other temporary errors
    const maxRetries = 8; // Increased for 503 overload errors
    let lastError: any = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { output } = await transcribeAudioPrompt(processedInput);
        return output!;
      } catch (error: any) {
        lastError = error;

        // Check if this is a retryable error (503, 429, network errors, etc.)
        const isRetryable =
          error?.status === 503 || // Service Unavailable
          error?.status === 429 || // Too Many Requests
          error?.status === 502 || // Bad Gateway
          error?.status === 504 || // Gateway Timeout
          error?.message?.includes("overloaded") ||
          error?.message?.includes("timeout") ||
          error?.message?.includes("network");

        // If it's the last attempt or not retryable, throw the error
        if (attempt === maxRetries - 1 || !isRetryable) {
          // For user-facing errors, provide more helpful messages
          if (error?.status === 503 || error?.message?.includes("overloaded")) {
            throw new Error(
              "AI transcription service is overloaded. This is a temporary Google AI issue. Please wait a few minutes and try again.",
            );
          } else if (error?.status === 429) {
            throw new Error(
              "Too many transcription requests. Please wait a moment before trying again.",
            );
          } else if (error?.status === 502 || error?.status === 504) {
            throw new Error(
              "AI transcription service is temporarily unavailable. Please try again in a few minutes.",
            );
          } else if (error?.status === 400) {
            throw new Error(
              "Invalid audio format or data. Please try with a different audio clip.",
            );
          } else if (error?.status === 401 || error?.status === 403) {
            throw new Error(
              "API authentication error. Please check your Google AI API key configuration.",
            );
          }
          throw error;
        }

        // Wait before retrying with much more aggressive delays for 503 errors
        const is503Error =
          error?.status === 503 || error?.message?.includes("overloaded");
        let waitTime;
        if (is503Error) {
          // Much longer delays for 503 overload errors: 5s, 10s, 20s, 40s, 60s, 90s, 120s, 180s
          const delays503 = [
            5000, 10000, 20000, 40000, 60000, 90000, 120000, 180000,
          ];
          waitTime = delays503[attempt] || 180000; // Cap at 3 minutes
        } else {
          // Normal exponential backoff for other errors
          waitTime = Math.min(2000 * Math.pow(2, attempt), 15000); // Max 15 seconds
        }

        console.log(
          `Transcription attempt ${attempt + 1} failed (${error?.status}), retrying in ${waitTime / 1000}s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    // This should never be reached, but just in case
    throw lastError;
  },
);
