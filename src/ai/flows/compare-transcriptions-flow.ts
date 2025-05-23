
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
  token: z.string().describe(
    "A word or punctuation mark. " +
    "For 'correct' and 'incorrect': it's the user's token. " +
    "For 'extra': it's the user's extra token. " +
    "For 'missing': it's the token from the automated transcription that the user missed."
  ),
  status: z.enum(["correct", "incorrect", "extra", "missing"]).describe(
    "Status of the token: " +
    "'correct' if user's token matches automated token perfectly (case, accents, etc.). " +
    "'incorrect' if user's token is at the same position as an automated token but differs (spelling, case, accent). 'suggestion' MUST be provided. " +
    "'extra' if user's token has no corresponding token in the automated transcription. " +
    "'missing' if an automated token has no corresponding token in the user's transcription. 'suggestion' MUST be provided and be the same as 'token'."
  ),
  suggestion: z.string().optional().describe(
    "The correct token from the automated transcription. " +
    "MUST be provided if status is 'incorrect'. " +
    "MUST be provided and be identical to 'token' if status is 'missing'."
  )
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
  comparisonResult: z.array(CorrectionTokenSchema).describe("An array of tokens representing the one-to-one alignment and comparison between user and automated transcriptions. Punctuation marks MUST be treated as separate tokens."),
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
  prompt: `You are a highly meticulous language learning assistant. Your SOLE task is to compare a 'User Transcription' with an 'Automated Transcription' text. You MUST produce a single, sequential array of 'CorrectionToken' objects in the 'comparisonResult' field. This array represents a token-by-token alignment.

IMPORTANT RULES:
1.  **Tokenization**: Treat every word AND every punctuation mark (e.g., '.', ',', '!', '?') as a separate token.
2.  **Strictness**: Be EXTREMELY strict. Case, spelling, accents, and diacritics MUST match EXACTLY for a token to be 'correct'.
3.  **Sequential Output**: The 'comparisonResult' array must follow the sequence of the aligned transcriptions.

Token Status Definitions and Handling:
-   **'correct'**:
    *   User's token exactly matches the automated token at the same position (including case, accents, and diacritics).
    *   'token' field: The user's matching token.
    *   'suggestion' field: Not applicable, should be absent.
-   **'incorrect'**:
    *   User's token is present at the same position as an automated token, but differs (e.g., spelling error, case mismatch, incorrect/missing accent or diacritic).
    *   'token' field: The user's incorrect token.
    *   'suggestion' field: MUST contain the corresponding, correct token from the automated transcription.
-   **'extra'**:
    *   User's token is present, but there is no corresponding token at that aligned position in the automated transcription (user added a word/punctuation).
    *   'token' field: The user's extra token.
    *   'suggestion' field: Not applicable, should be absent.
-   **'missing'**:
    *   An automated token is present, but no corresponding token exists in the user's transcription at that aligned position (user missed a word/punctuation).
    *   'token' field: MUST be the missing token from the automated transcription.
    *   'suggestion' field: MUST be the missing token from the automated transcription (same as 'token').

Example 1 (Punctuation, Spelling, Case):
User Transcription: "Hello worl. How are You"
Automated Transcription: "Hello, world! How are you?"
Language: english
Expected 'comparisonResult' output: [
  { "token": "Hello", "status": "correct" },
  { "token": ",", "status": "missing", "suggestion": "," },
  { "token": "worl", "status": "incorrect", "suggestion": "world" },
  { "token": ".", "status": "incorrect", "suggestion": "!" },
  { "token": "How", "status": "correct" }, // Assuming case doesn't make it incorrect, if case matters, this would be incorrect. Let's assume for this example, case mismatch makes it incorrect
  // { "token": "How", "status": "incorrect", "suggestion": "how" }, // If case matters
  { "token": "are", "status": "correct" },
  { "token": "You", "status": "incorrect", "suggestion": "you" },
  { "token": "?", "status": "missing", "suggestion": "?" }
]
(Clarification for above example: Let's enforce strict case matching. So 'You' vs 'you' is 'incorrect')
Revised Example 1 Output (Strict Case):
[
  { "token": "Hello", "status": "correct" },
  { "token": ",", "status": "missing", "suggestion": "," },
  { "token": "worl", "status": "incorrect", "suggestion": "world" },
  { "token": ".", "status": "incorrect", "suggestion": "!" },
  { "token": "How", "status": "incorrect", "suggestion": "how" },
  { "token": "are", "status": "correct" },
  { "token": "You", "status": "incorrect", "suggestion": "you" },
  { "token": "?", "status": "missing", "suggestion": "?" }
]


Example 2 (Accent/Diacritic Correction - STRICT):
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

