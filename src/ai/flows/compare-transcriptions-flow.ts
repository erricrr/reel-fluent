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
    "A single word or a single punctuation mark. " +
    "For 'correct' and 'incorrect' status: this is the user's token. " +
    "For 'extra' status: this is the user's extra token. " +
    "For 'missing' status: this is the token from the automated transcription that the user missed."
  ),
  status: z.enum(["correct", "incorrect", "extra", "missing"]).describe(
    "Status of the token: " +
    "'correct' if the user's token exactly matches the automated token at the aligned position (case, accents, spelling, etc. must be identical). " +
    "'incorrect' if the user's token is at the same position as an automated token but differs in any way (e.g., spelling, case, accent, diacritic). The 'suggestion' field MUST be provided with the correct token from the automated transcription. " +
    "'extra' if the user's token exists but there is no corresponding token at that aligned position in the automated transcription. The 'suggestion' field MUST be absent. " +
    "'missing' if an automated token exists but no corresponding token is found in the user's transcription at that aligned position. The 'token' field MUST contain the missing token from the automated transcription, and the 'suggestion' field MUST also be provided and be identical to this 'token' field."
  ),
  suggestion: z.string().optional().describe(
    "The correct token from the automated transcription. " +
    "MUST be provided if status is 'incorrect'. " +
    "MUST be provided and be identical to the 'token' field if status is 'missing'. " +
    "MUST be absent if status is 'correct' or 'extra'."
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
  comparisonResult: z.array(CorrectionTokenSchema).describe("An array of CorrectionToken objects representing the detailed, token-by-token alignment and comparison. This array must sequentially cover all tokens from both transcriptions when aligned."),
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
  prompt: `You are an EXTREMELY METICULOUS and ACCURATE language learning assistant. Your SOLE and CRITICAL task is to compare a 'User Transcription' with an 'Automated Transcription' text. You MUST produce a single, sequential array of 'CorrectionToken' objects in the 'comparisonResult' field. This array represents a token-by-token alignment. Absolute precision is paramount.

IMPORTANT AND STRICT RULES:
1.  **TOKENIZATION IS KEY**: EVERY word AND EVERY punctuation mark (e.g., '.', ',', '!', '?', ';', ':') MUST be treated as a separate token. There are no exceptions. For example, "Hello, world!" consists of FOUR tokens: "Hello", ",", "world", "!".
2.  **ULTRA-STRICT MATCHING**: For a token to be 'correct', it must be an EXACT match to the corresponding token in the automated transcription. This includes case, spelling, all accents, and all diacritics. Any deviation makes it 'incorrect'.
3.  **SEQUENTIAL OUTPUT**: The 'comparisonResult' array must strictly follow the sequence of the aligned transcriptions. Do not reorder tokens.
4.  **FIELD REQUIREMENTS**: Pay close attention to when the 'suggestion' field is required, optional, or must be absent for each status.

Token Status Definitions and Handling (MANDATORY):
-   **'correct'**:
    *   User's token EXACTLY matches the automated token at the same position.
    *   'token' field: The user's matching token.
    *   'suggestion' field: MUST be ABSENT.
-   **'incorrect'**:
    *   User's token is present at the same position as an automated token, but differs IN ANY WAY (spelling, case, accent, diacritic, etc.).
    *   'token' field: The user's incorrect token.
    *   'suggestion' field: MUST contain the corresponding, correct token from the automated transcription.
-   **'extra'**:
    *   User's token is present, but there is no corresponding token at that aligned position in the automated transcription (user added a word/punctuation).
    *   'token' field: The user's extra token.
    *   'suggestion' field: MUST be ABSENT.
-   **'missing'**:
    *   An automated token is present, but no corresponding token exists in the user's transcription at that aligned position (user missed a word/punctuation).
    *   'token' field: MUST be the missing token from the automated transcription.
    *   'suggestion' field: MUST be the missing token from the automated transcription (i.e., identical to the 'token' field for this status).

Example 1 (Punctuation, Spelling, Strict Case):
User Transcription: "Hello worl. How are You"
Automated Transcription: "Hello, world! How are you?"
Language: english
Expected 'comparisonResult' (Strict Adherence Required): [
  { "token": "Hello", "status": "correct" },
  { "token": ",", "status": "missing", "suggestion": "," },
  { "token": "worl", "status": "incorrect", "suggestion": "world" },
  { "token": ".", "status": "incorrect", "suggestion": "!" },
  { "token": "How", "status": "incorrect", "suggestion": "how" },
  { "token": "are", "status": "correct" },
  { "token": "You", "status": "incorrect", "suggestion": "you" },
  { "token": "?", "status": "missing", "suggestion": "?" }
]

Example 2 (Strict Accent/Diacritic Correction):
User Transcription: "Xin chao ban. Toi la hoc sinh."
Automated Transcription: "Xin chào bạn. Tôi là học sinh."
Language: vietnamese
Expected 'comparisonResult' (Strict Adherence Required): [
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
Expected 'comparisonResult' (Strict Adherence Required): [
  { "token": "I", "status": "correct" },
  { "token": "like", "status": "correct" },
  { "token": "to", "status": "missing", "suggestion": "to"},
  { "token": "eat", "status": "correct" },
  { "token": "apple", "status": "incorrect", "suggestion": "apples" },
  { "token": "and", "status": "correct" },
  { "token": "banana", "status": "incorrect", "suggestion": "bananas" },
  { "token": ".", "status": "extra" }
]

Your task is to perform this comparison for the following inputs. Be precise.

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
    // It's possible the AI might occasionally return an empty output or an output that doesn't perfectly match the schema.
    // For stability, ensure output and output.comparisonResult are at least defined.
    if (!output || !output.comparisonResult) {
      console.warn('CompareTranscriptionsFlow: AI output was null or comparisonResult was missing. Input:', input);
      // Return a properly typed error structure
      return {
        comparisonResult: [{
          token: "Error: AI response was empty or malformed.",
          status: "incorrect" as const,
          suggestion: "Please try again"
        }]
      } satisfies CompareTranscriptionsOutput;
    }
    return output;
  }
);
