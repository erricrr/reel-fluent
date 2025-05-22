'use server';

/**
 * @fileOverview Provides feedback on a user's transcription compared to the automated transcription.
 *
 * - transcriptionFeedback - A function that provides feedback on a user's transcription.
 * - TranscriptionFeedbackInput - The input type for the transcriptionFeedback function.
 * - TranscriptionFeedbackOutput - The return type for the transcriptionFeedback function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const TranscriptionFeedbackInputSchema = z.object({
  userTranscription: z
    .string()
    .describe('The transcription provided by the user.'),
  automatedTranscription: z
    .string()
    .describe('The automated transcription from the video clip.'),
  language: z
    .string()
    .describe('The language of the transcriptions (e.g., vietnamese).')
    .optional(),
});
export type TranscriptionFeedbackInput = z.infer<
  typeof TranscriptionFeedbackInputSchema
>;

const TranscriptionFeedbackOutputSchema = z.object({
  feedback: z.string().describe('Feedback on the user transcription.'),
});
export type TranscriptionFeedbackOutput = z.infer<
  typeof TranscriptionFeedbackOutputSchema
>;

export async function transcriptionFeedback(
  input: TranscriptionFeedbackInput
): Promise<TranscriptionFeedbackOutput> {
  return transcriptionFeedbackFlow(input);
}

const prompt = ai.definePrompt({
  name: 'transcriptionFeedbackPrompt',
  input: {schema: TranscriptionFeedbackInputSchema},
  output: {schema: TranscriptionFeedbackOutputSchema},
  prompt: `You are a language learning assistant providing feedback on a user\'s transcription compared to an automated transcription.

  Provide feedback to the user, highlighting differences in spelling and grammar. Generate helpful tips to the user to improve their language skills. Focus on areas where the user's transcription deviates from the automated transcription.

  User Transcription: {{{userTranscription}}}
  Automated Transcription: {{{automatedTranscription}}}
  Language: {{{language}}}
  `,
});

const transcriptionFeedbackFlow = ai.defineFlow(
  {
    name: 'transcriptionFeedbackFlow',
    inputSchema: TranscriptionFeedbackInputSchema,
    outputSchema: TranscriptionFeedbackOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
