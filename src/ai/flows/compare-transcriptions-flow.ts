
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
  token: z.string().describe("A word or punctuation mark from the transcription. For 'missing' status, this is the token from the automated transcription. For 'extra', it's the user's token. For 'correct'/'incorrect', it's the user's token being evaluated."),
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
  prompt: `You are a language learning assistant. Your primary task is to meticulously compare a 'User Transcription' with an 'Automated Transcription' and produce a single, sequential list of 'CorrectionToken' objects in the 'comparisonResult' field. This list must accurately represent a token-by-token alignment of the user's input against the automated version, highlighting all differences.

Key requirements for the 'comparisonResult':
- It must be a single, ordered array of tokens.
- Each token must reflect its status relative to the automated transcription at that specific point in the sequence.
- Pay strict attention to spelling, accents, diacritics, and punctuation. Treat punctuation marks as separate tokens.

Token Status Definitions and Handling:
- 'correct': The user's token matches the automated token at the same position (including case, accents, and diacritics). The 'token' field is the user's token.
- 'incorrect': The user's token is present but differs from the automated token at the same position (e.g., spelling error, incorrect/missing accent). The 'token' field is the user's token. The 'suggestion' field MUST contain the token from the automated transcription.
- 'extra': The user's token is present, but there is no corresponding token at that position in the automated transcription (e.g., user added a word). The 'token' field should be the user's extra word.
- 'missing': A token is present in the automated transcription, but no corresponding token exists in the user's transcription at that position. The 'token' field MUST be the missing token from the automated transcription, and the 'suggestion' field MUST also contain this same token.

Methodology:
Conceptually, you should tokenize both transcriptions. Then, align these sequences to identify matches, mismatches, insertions (user 'extra' tokens), and deletions (user 'missing' tokens relative to automated). The final 'comparisonResult' should be this aligned sequence.

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

Example 3 (Missing, Incorrect, and Extra Tokens):
User Transcription: "I like eat apple and banana."
Automated Transcription: "I like to eat apples and bananas"
Language: english
Expected 'comparisonResult' output: [
  { "token": "I", "status": "correct" },
  { "token": "like", "status": "correct" },
  { "token": "to", "status": "missing", "suggestion": "to"},
  { "token": "eat", "status": "correct" },
  { "token": "apple", "status": "incorrect", "suggestion": "apples" },
  { "token": "and", "status": "correct" },
  { "token": "banana", "status": "incorrect", "suggestion": "bananas" },
  { "token": ".", "status": "extra" }
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

