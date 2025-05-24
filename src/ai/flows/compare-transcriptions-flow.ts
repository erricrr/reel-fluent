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

/**
 * Preprocesses and normalizes input transcriptions for more consistent comparison
 */
function preprocessTranscriptions(userText: string, automatedText: string): { user: string; automated: string } {
  // Normalize whitespace - convert multiple spaces/tabs/newlines to single spaces
  const normalizeWhitespace = (text: string): string => {
    return text.replace(/\s+/g, ' ').trim();
  };

  // Normalize common Unicode variants (e.g., different types of quotes, dashes)
  const normalizeUnicode = (text: string): string => {
    return text
      // Normalize quotes
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Normalize dashes
      .replace(/[–—]/g, '-')
      // Normalize ellipsis
      .replace(/…/g, '...')
      // Normalize other common variants
      .replace(/\u00A0/g, ' '); // non-breaking space to regular space
  };

  const processedUser = normalizeUnicode(normalizeWhitespace(userText));
  const processedAutomated = normalizeUnicode(normalizeWhitespace(automatedText));

  console.log('CompareTranscriptionsFlow: Input preprocessing:', {
    originalUser: userText.substring(0, 100) + (userText.length > 100 ? '...' : ''),
    processedUser: processedUser.substring(0, 100) + (processedUser.length > 100 ? '...' : ''),
    originalAutomated: automatedText.substring(0, 100) + (automatedText.length > 100 ? '...' : ''),
    processedAutomated: processedAutomated.substring(0, 100) + (processedAutomated.length > 100 ? '...' : '')
  });

  return { user: processedUser, automated: processedAutomated };
}

/**
 * Validates the AI response for consistency and correctness
 */
function validateComparisonResult(result: CorrectionToken[], userText: string, automatedText: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check if result is empty
  if (!result || result.length === 0) {
    errors.push("Comparison result is empty");
    return { isValid: false, errors };
  }

  // Validate each token
  for (let i = 0; i < result.length; i++) {
    const token = result[i];

    // Check required fields
    if (!token.token || typeof token.token !== 'string') {
      errors.push(`Token ${i}: Missing or invalid token field`);
    }

    if (!['correct', 'incorrect', 'extra', 'missing'].includes(token.status)) {
      errors.push(`Token ${i}: Invalid status "${token.status}"`);
    }

    // Validate suggestion field requirements
    if (token.status === 'incorrect' && !token.suggestion) {
      errors.push(`Token ${i}: "incorrect" status requires suggestion field`);
    }

    if (token.status === 'missing' && !token.suggestion) {
      errors.push(`Token ${i}: "missing" status requires suggestion field`);
    }

    if (token.status === 'missing' && token.suggestion && token.token !== token.suggestion) {
      errors.push(`Token ${i}: "missing" status requires suggestion to match token`);
    }

    if ((token.status === 'correct' || token.status === 'extra') && token.suggestion) {
      errors.push(`Token ${i}: "${token.status}" status should not have suggestion field`);
    }
  }

  // Check for basic length reasonableness (result shouldn't be dramatically longer than inputs)
  const userWords = userText.split(/\s+/).length;
  const automatedWords = automatedText.split(/\s+/).length;
  const maxExpectedTokens = (userWords + automatedWords) * 2; // Allow for punctuation

  if (result.length > maxExpectedTokens) {
    errors.push(`Result suspiciously long: ${result.length} tokens vs expected max ~${maxExpectedTokens}`);
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Post-processes AI results to fix common schema violations and ensure compliance
 */
function postProcessComparisonResult(result: CorrectionToken[]): CorrectionToken[] {
  return result.map((token, index) => {
    const fixed = { ...token };

    // Fix suggestion field requirements based on status
    switch (token.status) {
      case 'correct':
      case 'extra':
        // These statuses should NOT have suggestion fields
        if (fixed.suggestion !== undefined) {
          console.log(`CompareTranscriptionsFlow: Fixing token ${index}: Removing suggestion from "${token.status}" status`);
          delete fixed.suggestion;
        }
        break;

      case 'incorrect':
        // This status MUST have a suggestion field
        if (!fixed.suggestion) {
          console.log(`CompareTranscriptionsFlow: Fixing token ${index}: Adding missing suggestion for "incorrect" status`);
          fixed.suggestion = token.token; // Fallback to original token if no suggestion provided
        }
        break;

      case 'missing':
        // This status MUST have a suggestion field that matches the token
        if (!fixed.suggestion) {
          console.log(`CompareTranscriptionsFlow: Fixing token ${index}: Adding missing suggestion for "missing" status`);
          fixed.suggestion = token.token;
        } else if (fixed.suggestion !== token.token) {
          console.log(`CompareTranscriptionsFlow: Fixing token ${index}: Correcting suggestion to match token for "missing" status`);
          fixed.suggestion = token.token;
        }
        break;
    }

    return fixed;
  });
}

export async function compareTranscriptions(
  input: CompareTranscriptionsInput
): Promise<CompareTranscriptionsOutput> {
  return compareTranscriptionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'compareTranscriptionsPrompt',
  input: {schema: CompareTranscriptionsInputSchema},
  output: {schema: CompareTranscriptionsOutputSchema},
  prompt: `You are a PRECISE and CONSISTENT language learning assistant. Your task is to compare transcriptions with ABSOLUTE CONSISTENCY.

CRITICAL JSON SCHEMA COMPLIANCE:
You MUST return a JSON object with a "comparisonResult" array. Each token MUST follow these EXACT field rules:

1. "correct" status: { "token": "word", "status": "correct" } - NO suggestion field
2. "incorrect" status: { "token": "userword", "status": "incorrect", "suggestion": "correctword" } - suggestion REQUIRED
3. "extra" status: { "token": "extraword", "status": "extra" } - NO suggestion field
4. "missing" status: { "token": "missingword", "status": "missing", "suggestion": "missingword" } - suggestion REQUIRED and IDENTICAL to token

TOKENIZATION RULES:
- "Hello, world!" = ["Hello", ",", "world", "!"] (4 separate tokens)
- "It's good." = ["It's", "good", "."] (3 separate tokens)
- "São Paulo" = ["São", "Paulo"] (2 separate tokens)

MATCHING RULES:
- Exact character match including case, accents, diacritics
- "hello" ≠ "Hello" → incorrect
- "café" ≠ "cafe" → incorrect
- "word" = "word" → correct

ALIGNMENT LOGIC:
1. Split both texts into tokens (words and punctuation)
2. Align tokens left-to-right sequentially
3. Compare each aligned position
4. Mark differences as correct/incorrect/extra/missing

EXAMPLES:

User: "Hello worl. How are You"
Automated: "Hello, world! How are you?"
Result: [
  {"token": "Hello", "status": "correct"},
  {"token": ",", "status": "missing", "suggestion": ","},
  {"token": "worl", "status": "incorrect", "suggestion": "world"},
  {"token": ".", "status": "incorrect", "suggestion": "!"},
  {"token": "How", "status": "incorrect", "suggestion": "how"},
  {"token": "are", "status": "correct"},
  {"token": "You", "status": "incorrect", "suggestion": "you"},
  {"token": "?", "status": "missing", "suggestion": "?"}
]

User: "Xin chao ban"
Automated: "Xin chào bạn"
Result: [
  {"token": "Xin", "status": "correct"},
  {"token": "chao", "status": "incorrect", "suggestion": "chào"},
  {"token": "ban", "status": "incorrect", "suggestion": "bạn"}
]

FOLLOW THE SCHEMA EXACTLY. Double-check suggestion field requirements.

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
    console.log('CompareTranscriptionsFlow: Starting comparison with input:', {
      userLength: input.userTranscription.length,
      automatedLength: input.automatedTranscription.length,
      language: input.language || 'unknown'
    });

    // Validate inputs
    if (!input.userTranscription?.trim()) {
      console.error('CompareTranscriptionsFlow: Empty user transcription');
      return {
        comparisonResult: [{
          token: "Error: User transcription is empty.",
          status: "incorrect" as const,
          suggestion: "Please enter your transcription"
        }]
      } satisfies CompareTranscriptionsOutput;
    }

    if (!input.automatedTranscription?.trim()) {
      console.error('CompareTranscriptionsFlow: Empty automated transcription');
      return {
        comparisonResult: [{
          token: "Error: Automated transcription is empty.",
          status: "incorrect" as const,
          suggestion: "Please generate automated transcription first"
        }]
      } satisfies CompareTranscriptionsOutput;
    }

    // Preprocess inputs for consistency
    const { user: processedUser, automated: processedAutomated } = preprocessTranscriptions(
      input.userTranscription,
      input.automatedTranscription
    );

    const processedInput = {
      ...input,
      userTranscription: processedUser,
      automatedTranscription: processedAutomated
    };

    // Attempt the comparison with retry logic
    const maxRetries = 2;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`CompareTranscriptionsFlow: Attempt ${attempt}/${maxRetries}`);

        const {output} = await prompt(processedInput);

        if (!output || !output.comparisonResult) {
          throw new Error('AI returned empty or malformed response');
        }

        // Validate the result
        const validation = validateComparisonResult(
          output.comparisonResult,
          processedUser,
          processedAutomated
        );

        if (!validation.isValid) {
          console.warn(`CompareTranscriptionsFlow: Validation failed on attempt ${attempt}:`, validation.errors);
          if (attempt === maxRetries) {
            // On final attempt, return the result even if validation fails, but log the issues
            console.error('CompareTranscriptionsFlow: Final attempt validation failed, returning result anyway:', validation.errors);
          } else {
            // Retry if not the final attempt
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
          }
        }

        // Post-process the result
        const postProcessedResult = postProcessComparisonResult(output.comparisonResult);

        console.log(`CompareTranscriptionsFlow: Success on attempt ${attempt}, returning ${postProcessedResult.length} tokens`);
        return {
          comparisonResult: postProcessedResult
        } satisfies CompareTranscriptionsOutput;

      } catch (error) {
        lastError = error;
        console.warn(`CompareTranscriptionsFlow: Attempt ${attempt} failed:`, error);

        if (attempt === maxRetries) {
          console.error('CompareTranscriptionsFlow: All attempts failed, returning error result');
          break;
        }

        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    // If all attempts failed, return a helpful error
    return {
      comparisonResult: [{
        token: "Error: Comparison failed after multiple attempts.",
        status: "incorrect" as const,
        suggestion: `Please try again. Last error: ${lastError?.message || 'Unknown error'}`
      }]
    } satisfies CompareTranscriptionsOutput;
  }
);
