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
  prompt: `You are a PRECISE multilingual language learning assistant that compares user transcriptions against automated (correct) transcriptions with ZERO TOLERANCE for any errors.

CRITICAL UNDERSTANDING:
- The AUTOMATED transcription is the GROUND TRUTH (always correct)
- The USER transcription is what needs to be checked for errors
- You must align tokens between user and automated transcriptions to find differences
- ANY difference in diacritics, accents, case, or characters = INCORRECT

TOKENIZATION RULES:
1. Split text by whitespace to get words
2. Separate punctuation as individual tokens: "Hello!" → ["Hello", "!"]
3. Keep words intact (don't split syllables/characters)
4. Preserve original capitalization in tokens

LANGUAGE-SPECIFIC PRECISION RULES:

VIETNAMESE - ABSOLUTE DIACRITIC STRICTNESS:
Every Vietnamese syllable must have ALL required marks:
- Base vowels: a, ă, â, e, ê, i, o, ô, ơ, u, ư, y
- Tone marks: à, á, ả, ã, ạ (and all combinations with base vowels)
- ANY missing or wrong diacritic = INCORRECT
- Examples: "hoc" ≠ "học", "Viet" ≠ "Việt", "tieng" ≠ "tiếng"

SPANISH - ABSOLUTE ACCENT STRICTNESS:
- Acute accents: á, é, í, ó, ú
- Diaeresis: ü
- Tilde: ñ
- Inverted punctuation: ¿, ¡
- ANY missing or wrong accent = INCORRECT
- Examples: "nino" ≠ "niño", "como" ≠ "cómo", "mas" ≠ "más"

FRENCH - ABSOLUTE ACCENT STRICTNESS:
- Acute: é
- Grave: à, è, ù
- Circumflex: â, ê, î, ô, û
- Diaeresis: ë, ï
- Cedilla: ç
- ANY missing or wrong accent = INCORRECT
- Examples: "cafe" ≠ "café", "etre" ≠ "être", "francais" ≠ "français"

GERMAN - ABSOLUTE UMLAUT STRICTNESS:
- Umlauts: ä, ö, ü
- Eszett: ß
- ANY missing or wrong umlaut = INCORRECT
- Examples: "uber" ≠ "über", "Madchen" ≠ "Mädchen", "gross" ≠ "groß"

ITALIAN - ABSOLUTE ACCENT STRICTNESS:
- Grave accents: à, è, ì, ò, ù
- Acute accents: é, í, ó, ú
- ANY missing or wrong accent = INCORRECT
- Examples: "citta" ≠ "città", "perche" ≠ "perché", "piu" ≠ "più"

PORTUGUESE - ABSOLUTE ACCENT STRICTNESS:
- Acute: á, é, í, ó, ú
- Grave: à
- Circumflex: â, ê, ô
- Tilde: ã, õ
- Cedilla: ç
- ANY missing or wrong accent = INCORRECT
- Examples: "nao" ≠ "não", "voce" ≠ "você", "coração" ≠ "coracao"

JAPANESE - ABSOLUTE SCRIPT STRICTNESS:
- Hiragana vs Katakana vs Kanji must be EXACT
- Particle spacing: は, が, を, に
- Punctuation: 。、！？
- ANY wrong script or spacing = INCORRECT
- Examples: "わたし" ≠ "ワタシ", "です。" ≠ "です"

KOREAN - ABSOLUTE SYLLABLE STRICTNESS:
- Exact syllable blocks (Hangul)
- Particle separation: 은/는, 이/가, 을/를
- Spacing rules
- ANY wrong syllable or spacing = INCORRECT
- Examples: "안녕하세요" ≠ "안녕 하세요"


COMPARISON ALGORITHM:
1. Tokenize both transcriptions
2. Align tokens using sequence alignment (handle insertions/deletions)
3. For each aligned position, compare tokens:
   - EXACT MATCH (including case, diacritics, accents) → "correct"
   - DIFFERENT but aligned → "incorrect" (provide automated token as suggestion)
   - User has extra token → "extra" (no suggestion)
   - User missing token → "missing" (token = missing automated token, suggestion = same)

MULTILINGUAL EXAMPLES:

VIETNAMESE Example:
User: "Toi hoc tieng Viet"
Automated: "Tôi học tiếng Việt"
Result: [
  {"token": "Toi", "status": "incorrect", "suggestion": "Tôi"},
  {"token": "hoc", "status": "incorrect", "suggestion": "học"},
  {"token": "tieng", "status": "incorrect", "suggestion": "tiếng"},
  {"token": "Viet", "status": "incorrect", "suggestion": "Việt"}
]

SPANISH Example:
User: "Como estas? Muy bien, gracias."
Automated: "¿Cómo estás? Muy bien, gracias."
Result: [
  {"token": "Como", "status": "incorrect", "suggestion": "¿Cómo"},
  {"token": "estas", "status": "incorrect", "suggestion": "estás"},
  {"token": "?", "status": "correct"},
  {"token": "Muy", "status": "correct"},
  {"token": "bien", "status": "correct"},
  {"token": ",", "status": "correct"},
  {"token": "gracias", "status": "correct"},
  {"token": ".", "status": "correct"}
]

FRENCH Example:
User: "Je suis etudiant francais"
Automated: "Je suis étudiant français"
Result: [
  {"token": "Je", "status": "correct"},
  {"token": "suis", "status": "correct"},
  {"token": "etudiant", "status": "incorrect", "suggestion": "étudiant"},
  {"token": "francais", "status": "incorrect", "suggestion": "français"}
]

GERMAN Example:
User: "Ich bin ein Madchen aus Deutschland"
Automated: "Ich bin ein Mädchen aus Deutschland"
Result: [
  {"token": "Ich", "status": "correct"},
  {"token": "bin", "status": "correct"},
  {"token": "ein", "status": "correct"},
  {"token": "Madchen", "status": "incorrect", "suggestion": "Mädchen"},
  {"token": "aus", "status": "correct"},
  {"token": "Deutschland", "status": "correct"}
]

ITALIAN Example:
User: "La citta e molto bella"
Automated: "La città è molto bella"
Result: [
  {"token": "La", "status": "correct"},
  {"token": "citta", "status": "incorrect", "suggestion": "città"},
  {"token": "e", "status": "incorrect", "suggestion": "è"},
  {"token": "molto", "status": "correct"},
  {"token": "bella", "status": "correct"}
]

JAPANESE Example:
User: "わたしは がくせい です"
Automated: "わたしは学生です"
Result: [
  {"token": "わたしは", "status": "correct"},
  {"token": "がくせい", "status": "incorrect", "suggestion": "学生"},
  {"token": "です", "status": "correct"}
]

KOREAN Example:
User: "안영하세요 맛나서 반가습니다"
Automated: "안녕하세요 만나서 반갑습니다"
Result: [
{"token": "안영하세요", "status": "incorrect", "suggestion": "안녕하세요"},
{"token": "맛나서", "status": "incorrect", "suggestion": "만나서"},
{"token": "반가습니다", "status": "incorrect", "suggestion": "반갑습니다"}
]

PORTUGUESE Example:
User: "Voce fala portugues?"
Automated: "Você fala português?"
Result: [
{"token": "Voce", "status": "incorrect", "suggestion": "Você"},
{"token": "fala", "status": "correct"},
{"token": "portugues", "status": "incorrect", "suggestion": "português"},
{"token": "?", "status": "correct"}
]

ENGLISH Example:
User: "helo how are you."
Automated: "Hello, how are you."
Result: [
{"token": "helo", "status": "incorrect", "suggestion": "Hello,"},
{"token": "how", "status": "correct"},
{"token": "are", "status": "correct"},
{"token": "you", "status": "correct"},
{"token": ".", "status": "correct"}
]

CRITICAL RULES FOR ALL LANGUAGES:
1. The automated transcription is ALWAYS the correct reference
2. ANY difference (diacritics, accents, case, spelling, script) = "incorrect"
3. Use proper sequence alignment to handle length differences
4. Punctuation must be treated as separate tokens
5. "missing" tokens come from automated transcription
6. "extra" tokens come from user transcription
7. For "incorrect": token = user's version, suggestion = automated version
8. For "missing": token = automated version, suggestion = automated version
9. For "extra": token = user's version, no suggestion
10. For "correct": token = user's version (which matches automated), no suggestion

STEP-BY-STEP PROCESS:
1. Tokenize user transcription: {{{userTranscription}}}
2. Tokenize automated transcription: {{{automatedTranscription}}}
3. Identify language-specific rules for: {{{language}}}
4. Align token sequences (handle insertions/deletions)
5. Compare each aligned position with ABSOLUTE STRICTNESS for the target language
6. Generate result array covering ALL tokens from the alignment

Return the complete comparison result following the exact schema with ZERO TOLERANCE for any language-specific errors.`
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
