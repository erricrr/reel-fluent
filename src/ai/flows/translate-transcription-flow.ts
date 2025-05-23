
'use server';
/**
 * @fileOverview A Genkit flow to translate a transcription to English.
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
});
export type TranslateTranscriptionInput = z.infer<
  typeof TranslateTranscriptionInputSchema
>;

const TranslateTranscriptionOutputSchema = z.object({
  translatedText: z.string().describe('The English translation of the input text.'),
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
  prompt: `Translate the following text into English.
If a source language is provided, use it as a hint.

Source Language: {{{sourceLanguage}}}
Original Text:
{{{originalTranscription}}}

English Translation:
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
