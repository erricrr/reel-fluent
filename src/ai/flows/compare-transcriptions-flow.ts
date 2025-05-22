
'use server';
/**
 * @fileOverview A Genkit flow to compare user and automated transcriptions and highlight differences.
 *
 * - compareTranscriptions - A function that handles the transcription comparison.
 * - CompareTranscriptionsInput - The input type for the compareTranscriptions function.
 * - CompareTranscriptionsOutput - The return type for the compareTranscriptions function.
 * - CorrectionToken - Represents a single token in the comparison with its status.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CorrectionTokenSchema = z.object({
  token: z.string().describe("A word or punctuation mark from the transcription."),
  status: z.enum(["correct", "incorrect", "extra", "missing"]).describe(
    "Status of the token compared to the automated transcription: " +
    "'correct' if it matches (including accents/diacritics), " +
    "'incorrect' if it's a mismatched word at the same position (e.g. spelling error, or incorrect/missing accents), " +
    "'extra' if it's an added word by the user not in the automated, " +
    "'missing' if a word from automated is not in user's."
  ),
  suggestion: z.string().optional().describe("The correct word (including accents) from the automated transcription if status is 'incorrect' or 'missing'.")
});
export type CorrectionToken = z.infer<typeof CorrectionTokenSchema>;

const CompareTranscriptionsInputSchema = z.object({
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
export type CompareTranscriptionsInput = z.infer<
  typeof CompareTranscriptionsInputSchema
>;

const CompareTranscriptionsOutputSchema = z.object({
  comparisonResult: z.array(CorrectionTokenSchema).describe("An array of tokens representing the comparison between user and automated transcriptions, including accent/diacritic accuracy."),
});
export type CompareTranscriptionsOutput = z.infer<
  typeof CompareTranscriptionsOutputSchema
>;

export async function compareTranscriptions(
  input: CompareTranscriptionsInput
): Promise<CompareTranscriptionsOutput> {
  return compareTranscriptionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'compareTranscriptionsPrompt',
  input: {schema: CompareTranscriptionsInputSchema},
  output: {schema: CompareTranscriptionsOutputSchema},
  prompt: `You are a language learning assistant. Your task is to compare a 'User Transcription' with an 'Automated Transcription'.
Tokenize both transcriptions (words and punctuation should generally be separate tokens).
Pay close attention to accents and diacritics. If a word in the user's transcription is spelled correctly but has missing or incorrect accents/diacritics compared to the automated transcription, that word token should be marked as 'incorrect', and the 'suggestion' should be the word with the correct accents/diacritics.
Produce a single list of tokens for the 'comparisonResult' field that represents a merged, sequential view of the comparison.

For each token from the user's transcription:
- If it matches the corresponding token in the automated transcription (including correct accents/diacritics), mark its status as 'correct'.
- If it is present in the user's transcription but not at a corresponding position in the automated transcription (e.g., user added a word, or automated transcription is shorter), mark it as 'extra'.
- If it is different from the corresponding token in the automated transcription (e.g., a spelling mistake, or a missing/incorrect accent/diacritic), mark its status as 'incorrect' and provide the 'suggestion' with the word from the automated transcription.

If the user's transcription is missing tokens that are present in the automated transcription, you MUST insert tokens into the 'comparisonResult' list with status 'missing' at the appropriate positions. For these 'missing' tokens, the 'token' field should contain the word/punctuation from the automated transcription, and the 'suggestion' field should also contain this same word/punctuation.

The goal is to have a single sequential list of tokens that allows the user to see their transcription aligned with the automated one, highlighting all differences including additions, omissions, direct mistakes, and accent/diacritic errors.

Example 1 (Punctuation and Spelling):
User Transcription: "Hello worl."
Automated Transcription: "Hello, world!"
Language: english

Expected 'comparisonResult' output: [
  { "token": "Hello", "status": "correct" },
  { "token": ",", "status": "missing", "suggestion": "," },
  { "token": "worl", "status": "incorrect", "suggestion": "world" },
  { "token": ".", "status": "incorrect", "suggestion": "!" }
]

Example 2 (Accent/Diacritic Correction):
User Transcription: "Xin chao ban. Toi la hoc sinh."
Automated Transcription: "Xin chào bạn. Tôi là học sinh."
Language: vietnamese

Expected 'comparisonResult' output: [
  { "token": "Xin", "status": "correct" },
  { "token": "chao", "status": "incorrect", "suggestion": "chào" },
  { "token": "ban", "status": "incorrect", "suggestion": "bạn" },
  { "token": ".", "status": "correct" },
  { "token": "Toi", "status": "incorrect", "suggestion": "Tôi" },
  { "token": "la", "status": "incorrect", "suggestion": "là" },
  { "token": "hoc", "status": "incorrect", "suggestion": "học" },
  { "token": "sinh", "status": "correct" },
  { "token": ".", "status": "correct" }
]

User Transcription: {{{userTranscription}}}
Automated Transcription: {{{automatedTranscription}}}
Language: {{{language}}}
`,
});

const compareTranscriptionsFlow = ai.defineFlow(
  {
    name: 'compareTranscriptionsFlow',
    inputSchema: CompareTranscriptionsInputSchema,
    outputSchema: CompareTranscriptionsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

