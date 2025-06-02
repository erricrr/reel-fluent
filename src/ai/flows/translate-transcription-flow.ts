'use server';
/**
 * @fileOverview A Genkit flow to translate a transcription to any target language.
 *
 * - translateTranscription - A function that handles the translation.
 * - TranslateTranscriptionInput - The input type for the function.
 * - TranslateTranscriptionOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { PROVIDER_CONFIGS, circuitBreakers, retryWithBackoff, getProvidersInPriorityOrder } from '@/ai/providers/config';

const TranslateTranscriptionInputSchema = z.object({
  originalTranscription: z
    .string()
    .describe('The transcription text to be translated.'),
  sourceLanguage: z
    .string()
    .describe('The language of the original transcription (e.g., vietnamese).')
    .optional(),
  targetLanguage: z
    .string()
    .describe('The target language to translate to (e.g., english, spanish, etc.). Defaults to english.')
    .default('english'),
});
export type TranslateTranscriptionInput = z.infer<
  typeof TranslateTranscriptionInputSchema
>;

const TranslateTranscriptionOutputSchema = z.object({
  translatedText: z.string().describe('The translated text in the target language.'),
});
export type TranslateTranscriptionOutput = z.infer<
  typeof TranslateTranscriptionOutputSchema
>;

// Google AI translation prompt
const googleTranslationPrompt = ai.definePrompt({
  name: 'googleTranslationPrompt',
  input: {schema: TranslateTranscriptionInputSchema},
  output: {schema: TranslateTranscriptionOutputSchema},
  model: 'googleai/gemini-2.0-flash',
  prompt: `Translate the following text into {{targetLanguage}}.
If a source language is provided, use it as a hint.

Source Language: {{{sourceLanguage}}}
Target Language: {{targetLanguage}}
Original Text:
{{{originalTranscription}}}

Translation in {{targetLanguage}}:
`,
});

// Anthropic translation prompt
const anthropicTranslationPrompt = ai.definePrompt({
  name: 'anthropicTranslationPrompt',
  input: {schema: TranslateTranscriptionInputSchema},
  output: {schema: TranslateTranscriptionOutputSchema},
  model: 'claude-3-7-sonnet-latest',
  prompt: `Translate the following text into {{targetLanguage}}.
If a source language is provided, use it as a hint.

Source Language: {{{sourceLanguage}}}
Target Language: {{targetLanguage}}
Original Text:
{{{originalTranscription}}}

Translation in {{targetLanguage}}:
`,
});

async function translateWithProvider(
  provider: 'google' | 'anthropic',
  input: TranslateTranscriptionInput
): Promise<TranslateTranscriptionOutput> {
  const config = PROVIDER_CONFIGS[provider];
  const breaker = circuitBreakers[provider];

  if (!config.enabled) {
    throw new Error(`Provider ${provider} is not enabled or configured`);
  }

  if (!breaker.canExecute()) {
    throw new Error(`Provider ${provider} is temporarily disabled due to repeated failures`);
  }

  try {
    let result: TranslateTranscriptionOutput;

    switch (provider) {
      case 'google':
        const {output: googleOutput} = await googleTranslationPrompt(input);
        result = googleOutput!;
        break;
      case 'anthropic':
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error('Anthropic API key not configured');
        }
        const {output: anthropicOutput} = await anthropicTranslationPrompt(input);
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

const translateTranscriptionFlow = ai.defineFlow(
  {
    name: 'translateTranscriptionFlow',
    inputSchema: TranslateTranscriptionInputSchema,
    outputSchema: TranslateTranscriptionOutputSchema,
  },
  async input => {
    // Use providers in priority order
    const allProviders = getProvidersInPriorityOrder() as ('google' | 'anthropic')[];

    // Filter to only include Google and Anthropic (OpenAI is temporarily disabled)
    const availableProviders = ['google', 'anthropic'];
    const providers = allProviders.filter(p => availableProviders.includes(p));

    const enabledProviders = providers.filter(p => PROVIDER_CONFIGS[p]?.enabled);

    console.log('Available translation providers in priority order:', enabledProviders);

    if (enabledProviders.length === 0) {
      throw new Error("All translation services are currently unavailable. Please try again later.");
    }

    let lastError: any;
    const failedProviders: string[] = [];

    for (const provider of enabledProviders) {
      try {
        console.log(`Attempting translation with ${PROVIDER_CONFIGS[provider].name}...`);
        const result = await retryWithBackoff(
          () => translateWithProvider(provider, input),
          PROVIDER_CONFIGS[provider],
          provider
        );

        if (failedProviders.length > 0) {
          console.log(`Successfully translated with ${PROVIDER_CONFIGS[provider].name} after ${failedProviders.join(', ')} failed`);
        }

        return result;

      } catch (error: any) {
        lastError = error;
        failedProviders.push(provider);

        console.warn(`${PROVIDER_CONFIGS[provider].name} translation failed:`, error.message);

        if (provider === enabledProviders[enabledProviders.length - 1]) {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // All providers failed
    console.error(`All translation providers failed: ${failedProviders.join(', ')}`);

    // Provide user-friendly error messages
    if (failedProviders.includes('google') && lastError?.message?.includes('overloaded')) {
      throw new Error(
        'Translation services are currently experiencing issues. Please try again in a few minutes.'
      );
    } else if (lastError?.message?.includes('429') || lastError?.message?.includes('Too Many Requests')) {
      throw new Error(
        'Too many translation requests. Please wait a moment before trying again.'
      );
    } else if (lastError?.message?.includes('network') || lastError?.message?.includes('timeout')) {
      throw new Error(
        'Network connection issue. Please check your internet connection and try again.'
      );
    }

    throw new Error(
      `Translation failed with all available providers. Please try again later or contact support.`
    );
  }
);

export { translateTranscriptionFlow };
