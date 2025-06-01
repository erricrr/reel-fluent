'use server';
/**
 * @fileOverview A Genkit flow to translate a transcription to any target language.
 *
 * - translateTranscription - A function that handles the translation.
 * - TranslateTranscriptionInput - The input type for the function.
 * - TranslateTranscriptionOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const TranslateTranscriptionInputSchema = z.object({
  originalTranscription: z
    .string()
    .describe('The transcription text to be translated.'),
  sourceLanguage: z
    .string()
    .describe('The language of the original transcription (e.g., vietnamese).')
    .optional(),
  targetLanguage: z
    .string()
    .describe('The target language to translate to (e.g., english, spanish, etc.). Defaults to english.')
    .default('english'),
});
export type TranslateTranscriptionInput = z.infer<
  typeof TranslateTranscriptionInputSchema
>;

const TranslateTranscriptionOutputSchema = z.object({
  translatedText: z.string().describe('The translated text in the target language.'),
});
export type TranslateTranscriptionOutput = z.infer<
  typeof TranslateTranscriptionOutputSchema
>;

export async function translateTranscription(
  input: TranslateTranscriptionInput
): Promise<TranslateTranscriptionOutput> {
  return translateTranscriptionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'translateTranscriptionPrompt',
  input: {schema: TranslateTranscriptionInputSchema},
  output: {schema: TranslateTranscriptionOutputSchema},
  model: 'googleai/gemini-2.0-flash',
  prompt: `Translate the following text into {{targetLanguage}}.
If a source language is provided, use it as a hint.

Source Language: {{{sourceLanguage}}}
Target Language: {{targetLanguage}}
Original Text:
{{{originalTranscription}}}

Translation in {{targetLanguage}}:
`,
});

const translateTranscriptionFlow = ai.defineFlow(
  {
    name: 'translateTranscriptionFlow',
    inputSchema: TranslateTranscriptionInputSchema,
    outputSchema: TranslateTranscriptionOutputSchema,
  },
  async input => {
    // Implement retry logic for 503 and other temporary errors
    const maxRetries = 3;
    let lastError: any = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const {output} = await prompt(input);
        return output!;
      } catch (error) {
        lastError = error;

        // Check if this is a retryable error
        const isRetryable = error instanceof Error && (
          error.message.includes('503') ||
          error.message.includes('Service Unavailable') ||
          error.message.includes('overloaded') ||
          error.message.includes('429') ||
          error.message.includes('Too Many Requests') ||
          error.message.includes('temporarily unavailable') ||
          error.message.includes('rate limit')
        );

        if (!isRetryable || attempt === maxRetries - 1) {
          // Don't retry for non-retryable errors or on final attempt
          break;
        }

        // Wait before retrying (exponential backoff)
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.log(`Translation attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // If we reach here, all attempts failed
    if (lastError instanceof Error) {
      // Provide user-friendly error messages for common issues
      if (lastError.message.includes('503') || lastError.message.includes('overloaded')) {
        throw new Error('AI translation service is temporarily busy. Please wait a moment and try again.');
      } else if (lastError.message.includes('429') || lastError.message.includes('Too Many Requests')) {
        throw new Error('Too many translation requests. Please wait a moment and try again.');
      } else if (lastError.message.includes('400') || lastError.message.includes('Bad Request')) {
        throw new Error('Translation request format error. Please try again or contact support.');
      } else if (lastError.message.includes('401') || lastError.message.includes('403')) {
        throw new Error('Authentication error with AI service. Please contact support.');
      } else {
        throw new Error(`Translation failed: ${lastError.message}`);
      }
    } else {
      throw new Error('Translation failed due to an unknown error. Please try again.');
    }
  }
);
