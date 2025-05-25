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

    // Check if token exists and is an object
    if (!token || typeof token !== 'object') {
      errors.push(`Token ${i}: Invalid token object`);
      continue;
    }

    // Check required fields
    if (!token.token || typeof token.token !== 'string' || token.token.trim() === '') {
      errors.push(`Token ${i}: Missing or invalid token field (got: ${typeof token.token}, value: "${token.token}")`);
    }

    if (!['correct', 'incorrect', 'extra', 'missing'].includes(token.status)) {
      errors.push(`Token ${i}: Invalid status "${token.status}" (must be: correct, incorrect, extra, or missing)`);
    }

    // Validate suggestion field requirements
    if (token.status === 'incorrect' && (!token.suggestion || typeof token.suggestion !== 'string')) {
      errors.push(`Token ${i}: "incorrect" status requires suggestion field (got: ${typeof token.suggestion})`);
    }

    if (token.status === 'missing' && (!token.suggestion || typeof token.suggestion !== 'string')) {
      errors.push(`Token ${i}: "missing" status requires suggestion field (got: ${typeof token.suggestion})`);
    }

    if (token.status === 'missing' && token.suggestion && token.token !== token.suggestion) {
      errors.push(`Token ${i}: "missing" status requires suggestion to match token (token: "${token.token}", suggestion: "${token.suggestion}")`);
    }

    if ((token.status === 'correct' || token.status === 'extra') && token.suggestion !== undefined) {
      errors.push(`Token ${i}: "${token.status}" status should not have suggestion field (got: "${token.suggestion}")`);
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
  if (!result || !Array.isArray(result)) {
    console.warn('CompareTranscriptionsFlow: Invalid result array, returning empty array');
    return [];
  }

  return result.map((token, index) => {
    // Ensure we have a valid token object
    if (!token || typeof token !== 'object') {
      console.warn(`CompareTranscriptionsFlow: Invalid token at index ${index}, skipping`);
      return null;
    }

    const fixed = { ...token };

    // Ensure token field is a string and not empty
    if (!fixed.token || typeof fixed.token !== 'string' || fixed.token.trim() === '') {
      console.warn(`CompareTranscriptionsFlow: Invalid token field at index ${index}, skipping token`);
      return null; // Skip this token entirely
    }

    // Ensure status is valid
    if (!['correct', 'incorrect', 'extra', 'missing'].includes(fixed.status)) {
      console.warn(`CompareTranscriptionsFlow: Invalid status "${fixed.status}" at index ${index}, defaulting to "incorrect"`);
      fixed.status = 'incorrect';
    }

    // Fix suggestion field requirements based on status
    switch (fixed.status) {
      case 'correct':
      case 'extra':
        // These statuses should NOT have suggestion fields
        if (fixed.suggestion !== undefined) {
          console.log(`CompareTranscriptionsFlow: Fixing token ${index}: Removing suggestion from "${fixed.status}" status`);
          delete fixed.suggestion;
        }
        break;

      case 'incorrect':
        // This status MUST have a suggestion field
        if (!fixed.suggestion || typeof fixed.suggestion !== 'string') {
          console.log(`CompareTranscriptionsFlow: Fixing token ${index}: Adding missing suggestion for "incorrect" status`);
          fixed.suggestion = fixed.token; // Fallback to original token if no suggestion provided
        }
        break;

      case 'missing':
        // This status MUST have a suggestion field that matches the token
        if (!fixed.suggestion || typeof fixed.suggestion !== 'string') {
          console.log(`CompareTranscriptionsFlow: Fixing token ${index}: Adding missing suggestion for "missing" status`);
          fixed.suggestion = fixed.token;
        } else if (fixed.suggestion !== fixed.token) {
          console.log(`CompareTranscriptionsFlow: Fixing token ${index}: Correcting suggestion to match token for "missing" status`);
          fixed.suggestion = fixed.token;
        }
        break;
    }

    return fixed;
  }).filter((token): token is CorrectionToken => token !== null); // Remove any null tokens
}

export async function compareTranscriptions(
  input: CompareTranscriptionsInput
): Promise<CompareTranscriptionsOutput> {
  return compareTranscriptionsFlow(input);
}

// [Previous code remains unchanged until the prompt definition]

const prompt = ai.definePrompt({
  name: 'compareTranscriptionsPrompt',
  input: {schema: CompareTranscriptionsInputSchema},
  output: {schema: CompareTranscriptionsOutputSchema},
  prompt: `SIMPLE RULE: Compare USER input to AUTOMATED transcription. AUTOMATED is always correct. USER has errors.

🔴 AUTOMATED TRANSCRIPTION = 100% CORRECT (NEVER WRONG)
🔴 USER INPUT = HAS ERRORS TO FIND
🔴 IF THEY DON'T MATCH EXACTLY = USER IS WRONG

LANGUAGE-SPECIFIC ERRORS TO CATCH:

VIETNAMESE - Missing diacritics/tone marks:
USER: "Hom" vs AUTOMATED: "Hôm" → STATUS: "incorrect", SUGGESTION: "Hôm"
USER: "co" vs AUTOMATED: "có" → STATUS: "incorrect", SUGGESTION: "có"
USER: "cac" vs AUTOMATED: "các" → STATUS: "incorrect", SUGGESTION: "các"
USER: "tieng" vs AUTOMATED: "tiếng" → STATUS: "incorrect", SUGGESTION: "tiếng"
USER: "Viet" vs AUTOMATED: "Việt" → STATUS: "incorrect", SUGGESTION: "Việt"

SPANISH - Missing accents:
USER: "nino" vs AUTOMATED: "niño" → STATUS: "incorrect", SUGGESTION: "niño"
USER: "como" vs AUTOMATED: "cómo" → STATUS: "incorrect", SUGGESTION: "cómo"
USER: "mas" vs AUTOMATED: "más" → STATUS: "incorrect", SUGGESTION: "más"

FRENCH - Missing accents:
USER: "cafe" vs AUTOMATED: "café" → STATUS: "incorrect", SUGGESTION: "café"
USER: "etre" vs AUTOMATED: "être" → STATUS: "incorrect", SUGGESTION: "être"
USER: "francais" vs AUTOMATED: "français" → STATUS: "incorrect", SUGGESTION: "français"

GERMAN - Missing umlauts:
USER: "uber" vs AUTOMATED: "über" → STATUS: "incorrect", SUGGESTION: "über"
USER: "Madchen" vs AUTOMATED: "Mädchen" → STATUS: "incorrect", SUGGESTION: "Mädchen"

ITALIAN - Missing accents:
USER: "citta" vs AUTOMATED: "città" → STATUS: "incorrect", SUGGESTION: "città"
USER: "perche" vs AUTOMATED: "perché" → STATUS: "incorrect", SUGGESTION: "perché"

PORTUGUESE - Missing accents:
USER: "nao" vs AUTOMATED: "não" → STATUS: "incorrect", SUGGESTION: "não"
USER: "voce" vs AUTOMATED: "você" → STATUS: "incorrect", SUGGESTION: "você"

JAPANESE - Wrong script/spacing:
USER: "がくせい" vs AUTOMATED: "学生" → STATUS: "incorrect", SUGGESTION: "学生"

KOREAN - Wrong syllables/spacing:
USER: "안영하세요" vs AUTOMATED: "안녕하세요" → STATUS: "incorrect", SUGGESTION: "안녕하세요"

SIMPLE COMPARISON RULES:
1. Split both texts into words
2. Compare each AUTOMATED word to the USER word
3. If the AUTOMATED word and the USER word are EXACTLY the same → "correct"
4. If the USER word is different from the AUTOMATED word in ANY way → "incorrect"
5. If USER is missing a word that appears in the AUTOMATED transcription → "missing"
6. If USER has an extra word that DOES NOT APPEAR in the AUTOMATED transcription → "extra" (no suggestion)

EXAMPLE - EXACTLY WHAT TO DO:
AUTOMATED: "Hôm nay, có và các em sẽ cùng tìm hiểu về bảng chữ cái tiếng Việt. Trước tiền..."
USER: "Hom nay co va cac em se cung tim hieu ve bang chu cai tieng Viet"

CORRECT OUTPUT:
[
  {"token": "Hom", "status": "incorrect", "suggestion": "Hôm"},
  {"token": "nay", "status": "incorrect", "suggestion": "nay,"},
  {"token": "co", "status": "incorrect", "suggestion": "có"},
  {"token": "va", "status": "incorrect", "suggestion": "và"},
  {"token": "cac", "status": "incorrect", "suggestion": "các"},
  {"token": "em", "status": "correct"},
  {"token": "se", "status": "incorrect", "suggestion": "sẽ"},
  {"token": "cung", "status": "incorrect", "suggestion": "cùng"},
  {"token": "tim", "status": "incorrect", "suggestion": "tìm"},
  {"token": "hieu", "status": "incorrect", "suggestion": "hiểu"},
  {"token": "ve", "status": "incorrect", "suggestion": "về"},
  {"token": "bang", "status": "incorrect", "suggestion": "bảng"},
  {"token": "chu", "status": "incorrect", "suggestion": "chữ"},
  {"token": "cai", "status": "incorrect", "suggestion": "cái"},
  {"token": "tieng", "status": "incorrect", "suggestion": "tiếng"},
  {"token": "Viet", "status": "incorrect", "suggestion": "Việt."},
  {"token": "Trước", "status": "missing", "suggestion": "Trước"},
  {"token": "tiền...", "status": "missing", "suggestion": "tiền..."}
]

NOW COMPARE THESE INPUTS:
USER: {{{userTranscription}}}
AUTOMATED: {{{automatedTranscription}}}
LANGUAGE: {{{language}}}

USE THE EXAMPLE ABOVE AS A GUIDE. KNOW THAT AUTOMATED IS ALWAYS RIGHT.

RETURN THE COMPLETE COMPARISON RESULT FOLLOWING THE EXACT SCHEMA WITH ZERO TOLERANCE FOR ANY LANGUAGE-SPECIFIC ERRORS.`
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

        if (!output) {
          throw new Error('AI returned null or undefined response');
        }

        if (!output.comparisonResult) {
          throw new Error('AI response missing comparisonResult field');
        }

        if (!Array.isArray(output.comparisonResult)) {
          throw new Error(`AI response comparisonResult is not an array (got: ${typeof output.comparisonResult})`);
        }

        if (output.comparisonResult.length === 0) {
          throw new Error('AI returned empty comparisonResult array');
        }

        // Post-process the result FIRST to fix common schema violations
        const postProcessedResult = postProcessComparisonResult(output.comparisonResult);

        if (postProcessedResult.length === 0) {
          throw new Error('Post-processing resulted in empty array');
        }

        // Then validate the post-processed result
        const validation = validateComparisonResult(
          postProcessedResult,
          processedUser,
          processedAutomated
        );

        if (!validation.isValid) {
          console.warn(`CompareTranscriptionsFlow: Validation failed on attempt ${attempt}:`, validation.errors);
          if (attempt === maxRetries) {
            // On final attempt, return the result even if validation fails, but log the issues
            console.error('CompareTranscriptionsFlow: Final attempt validation failed, returning result anyway:', validation.errors);
            // Return the post-processed result even if validation fails
            return {
              comparisonResult: postProcessedResult
            } satisfies CompareTranscriptionsOutput;
          } else {
            // Retry if not the final attempt
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
          }
        }

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
