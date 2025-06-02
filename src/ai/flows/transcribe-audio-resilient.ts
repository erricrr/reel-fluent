"use server";
/**
 * @fileOverview Enhanced transcription service with multi-provider fallback and resilient error handling.
 * Supports Google AI (Gemini), OpenAI Whisper, and Anthropic as fallbacks.
 */

import { ai, GEMINI_MODEL, CLAUDE_MODEL } from "@/ai/genkit";
import { z } from "genkit";
import { PROVIDER_CONFIGS, circuitBreakers, retryWithBackoff, type ProviderConfig, getProvidersInPriorityOrder } from "@/ai/providers/config";

const TranscribeAudioInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "The audio data as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'.",
    ),
  language: z.string().describe("The language of the audio.").optional(),
  preferredProvider: z.enum(["google", "anthropic", "auto"]).optional().default("auto"),
});

export type TranscribeAudioInput = z.infer<typeof TranscribeAudioInputSchema>;

const TranscribeAudioOutputSchema = z.object({
  transcription: z.string().describe("The transcription of the audio."),
  provider: z.string().describe("The provider that successfully transcribed the audio."),
  confidence: z.number().optional().describe("Confidence score if available."),
});

export type TranscribeAudioOutput = z.infer<typeof TranscribeAudioOutputSchema>;

// Google AI transcription prompt
const transcribeWithGooglePrompt = ai.definePrompt({
  name: "transcribeWithGooglePrompt",
  input: { schema: TranscribeAudioInputSchema },
  output: { schema: TranscribeAudioOutputSchema },
  model: GEMINI_MODEL,
  prompt: `Transcribe the following audio to text. {{#if language}}The language of the audio is {{language}}.{{/if}}

Instructions:
1. {{#if language}}Pay special attention to the specific accents and pronunciation patterns of {{language}}.{{else}}Identify the language automatically and pay attention to specific accents and pronunciation patterns.{{/if}}
2. For Vietnamese, ensure proper tone marks (dấu) are captured accurately.
3. For English, note any regional accents (American, British, etc.).
4. Maintain all language-specific punctuation and formatting.
5. Preserve any dialect-specific expressions or colloquialisms.
6. If the language is unclear or not specified, detect the language automatically and transcribe accordingly.

Audio: {{media url=audioDataUri}}`,
});

// Anthropic transcription prompt
const transcribeWithAnthropicPrompt = ai.definePrompt({
  name: "transcribeWithAnthropicPrompt",
  input: { schema: TranscribeAudioInputSchema },
  output: { schema: TranscribeAudioOutputSchema },
  model: CLAUDE_MODEL,
  prompt: `Transcribe the following audio to text. {{#if language}}The language of the audio is {{language}}.{{/if}}

Instructions:
1. {{#if language}}Pay special attention to the specific accents and pronunciation patterns of {{language}}.{{else}}Identify the language automatically and pay attention to specific accents and pronunciation patterns.{{/if}}
2. For Vietnamese, ensure proper tone marks (dấu) are captured accurately.
3. For English, note any regional accents (American, British, etc.).
4. Maintain all language-specific punctuation and formatting.
5. Preserve any dialect-specific expressions or colloquialisms.
6. If the language is unclear or not specified, detect the language automatically and transcribe accordingly.

Audio: {{media url=audioDataUri}}`,
});

async function transcribeWithGoogle(input: TranscribeAudioInput): Promise<TranscribeAudioOutput> {
  const processedInput = {
    ...input,
    language: input.language && input.language.trim() ? input.language.trim() : undefined,
  };

  const { output } = await transcribeWithGooglePrompt(processedInput);
  return {
    ...output!,
    provider: "google",
  };
}

/* Temporarily disabled - may use later
async function transcribeWithOpenAI(input: TranscribeAudioInput): Promise<TranscribeAudioOutput> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  // Convert data URI to buffer
  const [header, base64Data] = input.audioDataUri.split(',');
  const audioBuffer = Buffer.from(base64Data, 'base64');

  // Create FormData for OpenAI API
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm');
  formData.append('model', 'whisper-1');

  if (input.language) {
    formData.append('language', input.language.slice(0, 2)); // OpenAI uses 2-letter codes
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${error}`);
  }

  const result = await response.json();
  return {
    transcription: result.text,
    provider: "openai",
  };
}
*/

async function transcribeWithAnthropic(input: TranscribeAudioInput): Promise<TranscribeAudioOutput> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Anthropic API key not configured");
  }

  const { output } = await transcribeWithAnthropicPrompt(input);
  return {
    ...output!,
    provider: "anthropic",
  };
}

async function transcribeWithProvider(
  provider: string,
  input: TranscribeAudioInput
): Promise<TranscribeAudioOutput> {
  const config = PROVIDER_CONFIGS[provider];
  const breaker = circuitBreakers[provider as keyof typeof circuitBreakers];

  if (!config.enabled) {
    console.warn(`Provider ${provider} is not enabled. Config:`, config);
    throw new Error(`Provider ${provider} is not enabled or configured`);
  }

  if (breaker && !breaker.canExecute()) {
    console.warn(`Provider ${provider} circuit breaker is open. State:`, breaker);
    throw new Error(`Provider ${provider} is temporarily disabled due to repeated failures`);
  }

  try {
    let result: TranscribeAudioOutput;

    console.log(`Attempting transcription with ${provider}. Input language: ${input.language || 'auto'}`);

    switch (provider) {
      case 'google':
        result = await retryWithBackoff(() => transcribeWithGoogle(input), config, provider);
        break;
      case 'anthropic':
        result = await retryWithBackoff(() => transcribeWithAnthropic(input), config, provider);
        break;
      /* Temporarily disabled - may use later
      case 'openai':
        result = await retryWithBackoff(() => transcribeWithOpenAI(input), config, provider);
        break;
      */
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    if (breaker) breaker.onSuccess();
    console.log(`Successfully transcribed with ${provider}`);
    return result;

  } catch (error: any) {
    console.error(`Transcription failed with ${provider}:`, {
      error: error.message,
      stack: error.stack,
      status: error.status,
      provider,
      language: input.language
    });

    if (breaker) breaker.onFailure();
    throw error;
  }
}

export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioOutput> {
  console.log('Starting transcription with input:', {
    language: input.language,
    preferredProvider: input.preferredProvider,
    audioLength: input.audioDataUri.length
  });

  // Get providers in priority order, respecting user preference if specified
  const providers = input.preferredProvider === 'auto'
    ? getProvidersInPriorityOrder()
    : [input.preferredProvider!, ...getProvidersInPriorityOrder().filter(p => p !== input.preferredProvider)];

  // Filter to only include Google and Anthropic (OpenAI is temporarily disabled)
  const availableProviders = ['google', 'anthropic'];
  const filteredProviders = providers.filter(p => availableProviders.includes(p));

  const enabledProviders = filteredProviders.filter(p => PROVIDER_CONFIGS[p]?.enabled);
  console.log('Available providers in priority order:', enabledProviders);

  if (enabledProviders.length === 0) {
    console.error('No providers available. Provider configs:', PROVIDER_CONFIGS);
    throw new Error("No transcription providers are available or configured. Please check your API keys.");
  }

  let lastError: any;
  const failedProviders: string[] = [];
  const errors: Record<string, any> = {};

  for (const provider of enabledProviders) {
    try {
      console.log(`Attempting transcription with ${PROVIDER_CONFIGS[provider].name}...`);
      const result = await transcribeWithProvider(provider, input);

      if (failedProviders.length > 0) {
        console.log(`Successfully transcribed with ${PROVIDER_CONFIGS[provider].name} after ${failedProviders.join(', ')} failed`);
      }

      return result;

    } catch (error: any) {
      lastError = error;
      failedProviders.push(provider);
      errors[provider] = {
        message: error.message,
        status: error.status,
        type: error.constructor.name
      };

      console.warn(`${PROVIDER_CONFIGS[provider].name} transcription failed:`, {
        provider,
        error: error.message,
        status: error.status,
        type: error.constructor.name
      });

      // If this is the last provider, don't continue
      if (provider === enabledProviders[enabledProviders.length - 1]) {
        break;
      }

      // Add a brief delay before trying the next provider
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // All providers failed
  console.error('All transcription providers failed:', {
    failedProviders,
    errors,
    input: {
      language: input.language,
      preferredProvider: input.preferredProvider,
      audioLength: input.audioDataUri.length
    }
  });

  // Throw a user-friendly error based on the types of failures
  if (failedProviders.includes('google') && lastError?.message?.includes('overloaded')) {
    throw new Error(
      `All transcription services are currently experiencing issues. Google AI is overloaded and backup services also failed. Please try again in a few minutes.`
    );
  }

  // Check for common error patterns
  const hasAuthErrors = Object.values(errors).some(e =>
    e.status === 401 ||
    e.status === 403 ||
    e.message?.toLowerCase().includes('api key') ||
    e.message?.toLowerCase().includes('unauthorized')
  );

  if (hasAuthErrors) {
    throw new Error(
      `Authentication failed with some providers. Please check your API keys and try again.`
    );
  }

  const hasRateLimitErrors = Object.values(errors).some(e =>
    e.status === 429 ||
    e.message?.toLowerCase().includes('rate limit') ||
    e.message?.toLowerCase().includes('too many requests')
  );

  if (hasRateLimitErrors) {
    throw new Error(
      `Rate limits exceeded. Please wait a few minutes and try again.`
    );
  }

  const hasNetworkErrors = Object.values(errors).some(e =>
    e.message?.toLowerCase().includes('network') ||
    e.message?.toLowerCase().includes('timeout') ||
    e.status === 504
  );

  if (hasNetworkErrors) {
    throw new Error(
      `Network connectivity issues detected. Please check your internet connection and try again.`
    );
  }

  throw new Error(
    `Transcription failed with all available providers (${failedProviders.join(', ')}). ` +
    `Please try again later or contact support. ` +
    `Last error: ${lastError?.message || 'Unknown error'}`
  );
}

// Export for backwards compatibility
export const transcribeAudioFlow = ai.defineFlow(
  {
    name: "transcribeAudioFlow",
    inputSchema: TranscribeAudioInputSchema,
    outputSchema: TranscribeAudioOutputSchema,
  },
  transcribeAudio
);
