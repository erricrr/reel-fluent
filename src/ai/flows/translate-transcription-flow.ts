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
    const {output} = await prompt(input);
    return output!;
  }
);
