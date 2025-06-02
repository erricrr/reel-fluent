'use server';
/**
 * @fileOverview A Genkit flow to compare user and automated transcriptions and highlight differences.
 *
 * - compareTranscriptions - A function that handles the transcription comparison.
 * - CompareTranscriptionsInput - The input type for the compareTranscriptions function.
 * - CompareTranscriptionsOutput - The return type for the compareTranscriptions function.
 * - CorrectionToken - Represents a single token in the comparison with its status.
 */

import {ai, GEMINI_MODEL, CLAUDE_MODEL} from '@/ai/genkit';
import {z} from 'genkit';
import { PROVIDER_CONFIGS, circuitBreakers, retryWithBackoff, getProvidersInPriorityOrder } from '@/ai/providers/config';

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
      .replace(/["""]/g, '"') // Include smart quotes
      .replace(/['']/g, "'") // Include smart quotes
      // Normalize dashes
      .replace(/[–—]/g, '-')
      // Normalize ellipsis
      .replace(/…/g, '...')
      // Normalize other common variants
      .replace(/\u00A0/g, ' ') // non-breaking space to regular space
      // Add NFC normalization for better handling of diacritics, especially for Vietnamese
      .normalize('NFC');
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

// Google AI comparison prompt
const googleComparisonPrompt = ai.definePrompt({
  name: 'googleComparisonPrompt',
  input: {schema: CompareTranscriptionsInputSchema},
  output: {schema: CompareTranscriptionsOutputSchema},
  model: GEMINI_MODEL,
  prompt: `Compare user input to automated transcription word by word. The automated transcription is ALWAYS 100% correct. The user input has errors.

User transcription: {{{userTranscription}}}
Automated transcription: {{{automatedTranscription}}}
Language: {{{language}}}

RULES:
1. If user word EXACTLY matches automated word → "correct"
2. If user word differs in ANY way (spelling, accents, diacritics, punctuation, case) → "incorrect" with suggestion
3. If user missed an automated word → "missing"
4. If user added extra word → "extra"

PAY ATTENTION TO:
- Vietnamese: diacritics and tone marks (ă vs a, ê vs e, ữ vs u, etc.)
- Spanish/French: accents (café vs cafe, niño vs nino)
- All languages: punctuation and capitalization

Examples:
- User "Hom" vs Auto "Hôm" → incorrect, suggest "Hôm"
- User "nay" vs Auto "nay," → incorrect, suggest "nay,"
- User "cafe" vs Auto "café" → incorrect, suggest "café"

Return complete token-by-token comparison as JSON array.`,
});

// Anthropic comparison prompt
const anthropicComparisonPrompt = ai.definePrompt({
  name: 'anthropicComparisonPrompt',
  input: {schema: CompareTranscriptionsInputSchema},
  output: {schema: CompareTranscriptionsOutputSchema},
  model: CLAUDE_MODEL,
  prompt: `Compare user input to automated transcription word by word. The automated transcription is ALWAYS 100% correct. The user input has errors.

User transcription: {{{userTranscription}}}
Automated transcription: {{{automatedTranscription}}}
Language: {{{language}}}

RULES:
1. If user word EXACTLY matches automated word → "correct"
2. If user word differs in ANY way (spelling, accents, diacritics, punctuation, case) → "incorrect" with suggestion
3. If user missed an automated word → "missing"
4. If user added extra word → "extra"

PAY ATTENTION TO:
- Vietnamese: diacritics and tone marks (ă vs a, ê vs e, ữ vs u, etc.)
- Spanish/French: accents (café vs cafe, niño vs nino)
- All languages: punctuation and capitalization

Examples:
- User "Hom" vs Auto "Hôm" → incorrect, suggest "Hôm"
- User "nay" vs Auto "nay," → incorrect, suggest "nay,"
- User "cafe" vs Auto "café" → incorrect, suggest "café"

Return complete token-by-token comparison as JSON array.`,
});

// Function to compare using a specific provider
async function compareWithProvider(
  provider: 'google' | 'anthropic',
  input: CompareTranscriptionsInput
): Promise<CompareTranscriptionsOutput> {
  const config = PROVIDER_CONFIGS[provider];
  const breaker = circuitBreakers[provider];

  if (!config.enabled) {
    throw new Error(`Provider ${provider} is not enabled or configured`);
  }

  if (!breaker.canExecute()) {
    throw new Error(`Provider ${provider} is temporarily disabled due to repeated failures`);
  }

  try {
    let result: CompareTranscriptionsOutput;

    switch (provider) {
      case 'google':
        const {output: googleOutput} = await googleComparisonPrompt(input);
        result = googleOutput!;
        break;
      case 'anthropic':
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error('Anthropic API key not configured');
        }
        const {output: anthropicOutput} = await anthropicComparisonPrompt(input);
        result = anthropicOutput!;
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    breaker.onSuccess();
    return result;

  } catch (error) {
    breaker.onFailure();
    throw error;
  }
}

const compareTranscriptionsFlow = ai.defineFlow(
  {
    name: 'compareTranscriptionsFlow',
    inputSchema: CompareTranscriptionsInputSchema,
    outputSchema: CompareTranscriptionsOutputSchema,
  },
  async input => {
    // Validate inputs first
    if (!input.userTranscription?.trim()) {
      return {
        comparisonResult: [{
          token: "Error: User transcription is empty",
          status: "correct" as const
        }]
      };
    }

    if (!input.automatedTranscription?.trim()) {
      return {
        comparisonResult: [{
          token: "Error: Automated transcription is empty",
          status: "correct" as const
        }]
      };
    }

    // Preprocess inputs
    const { user, automated } = preprocessTranscriptions(
      input.userTranscription,
      input.automatedTranscription
    );

    const processedInput = {
      ...input,
      userTranscription: user,
      automatedTranscription: automated
    };

    // Use providers in priority order - EXACT SAME as translation
    const allProviders = getProvidersInPriorityOrder() as ('google' | 'anthropic')[];

    // Filter to only include Google and Anthropic (OpenAI is temporarily disabled)
    const availableProviders = ['google', 'anthropic'];
    const providers = allProviders.filter(p => availableProviders.includes(p));

    const enabledProviders = providers.filter(p => PROVIDER_CONFIGS[p]?.enabled);

    console.log('Available comparison providers in priority order:', enabledProviders);

    if (enabledProviders.length === 0) {
      throw new Error("All comparison services are currently unavailable. Please try again later.");
    }

    let lastError: any;
    const failedProviders: string[] = [];

    for (const provider of enabledProviders) {
      try {
        console.log(`Attempting comparison with ${PROVIDER_CONFIGS[provider].name}...`);
        const result = await retryWithBackoff(
          () => compareWithProvider(provider, processedInput),
          PROVIDER_CONFIGS[provider],
          provider
        );

        if (failedProviders.length > 0) {
          console.log(`Successfully compared with ${PROVIDER_CONFIGS[provider].name} after ${failedProviders.join(', ')} failed`);
        }

        // Post-process to fix any issues
        const postProcessedResult = postProcessComparisonResult(result.comparisonResult);

        return {
          comparisonResult: postProcessedResult
        };

      } catch (error: any) {
        lastError = error;
        failedProviders.push(provider);

        console.warn(`${PROVIDER_CONFIGS[provider].name} comparison failed:`, error.message);

        if (provider === enabledProviders[enabledProviders.length - 1]) {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // All providers failed
    console.error(`All comparison providers failed: ${failedProviders.join(', ')}`);

    // Provide user-friendly error messages - EXACT SAME as translation
    if (failedProviders.includes('google') && lastError?.message?.includes('overloaded')) {
      throw new Error(
        'Comparison services are currently experiencing issues. Please try again in a few minutes.'
      );
    } else if (lastError?.message?.includes('429') || lastError?.message?.includes('Too Many Requests')) {
      throw new Error(
        'Too many comparison requests. Please wait a moment before trying again.'
      );
    } else if (lastError?.message?.includes('network') || lastError?.message?.includes('timeout')) {
      throw new Error(
        'Network connection issue. Please check your internet connection and try again.'
      );
    }

    throw new Error(
      `Comparison failed with all available providers. Please try again later or contact support.`
    );
  }
);

export async function compareTranscriptions(
  input: CompareTranscriptionsInput
): Promise<CompareTranscriptionsOutput> {
  try {
    return await compareTranscriptionsFlow(input);
  } catch (error: any) {
    console.error("compareTranscriptions: Error in flow:", error.message);

    // Provide a valid fallback response
    return {
      comparisonResult: [{
        token: `Error: ${error.message || "Could not complete comparison. Please try again later."}`,
        status: "correct" as const
      }]
    };
  }
}
