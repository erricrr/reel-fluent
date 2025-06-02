"use server";
/**
 * @fileOverview Enhanced transcription service with multi-provider fallback and resilient error handling.
 * Supports Google AI (Gemini), OpenAI Whisper, and Azure Speech Services as fallbacks.
 */

import { ai } from "@/ai/genkit";
import { z } from "genkit";

const TranscribeAudioInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "The audio data as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'.",
    ),
  language: z.string().describe("The language of the audio.").optional(),
  preferredProvider: z.enum(["google", "openai", "azure", "auto"]).optional().default("auto"),
});

export type TranscribeAudioInput = z.infer<typeof TranscribeAudioInputSchema>;

const TranscribeAudioOutputSchema = z.object({
  transcription: z.string().describe("The transcription of the audio."),
  provider: z.string().describe("The provider that successfully transcribed the audio."),
  confidence: z.number().optional().describe("Confidence score if available."),
});

export type TranscribeAudioOutput = z.infer<typeof TranscribeAudioOutputSchema>;

// Provider configuration
interface ProviderConfig {
  name: string;
  enabled: boolean;
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  google: {
    name: "Google AI",
    enabled: true,
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 30000,
  },
  openai: {
    name: "OpenAI Whisper",
    enabled: !!process.env.OPENAI_API_KEY,
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 15000,
  },
  azure: {
    name: "Azure Speech",
    enabled: !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION),
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 15000,
  },
};

// Circuit breaker pattern for provider health tracking
class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private failureThreshold: number = 5,
    private timeout: number = 60000 // 1 minute
  ) {}

  canExecute(): boolean {
    if (this.state === 'CLOSED') return true;
    
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    
    return true; // HALF_OPEN
  }

  onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}

const circuitBreakers = {
  google: new CircuitBreaker(3, 120000), // 2 minute timeout for Google due to overload issues
  openai: new CircuitBreaker(),
  azure: new CircuitBreaker(),
};

// Google AI transcription (original implementation)
const transcribeAudioPrompt = ai.definePrompt({
  name: "transcribeAudioPrompt",
  input: { schema: TranscribeAudioInputSchema },
  output: { schema: TranscribeAudioOutputSchema },
  model: "googleai/gemini-2.0-flash",
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

  const { output } = await transcribeAudioPrompt(processedInput);
  return {
    ...output!,
    provider: "google",
  };
}

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

async function transcribeWithAzure(input: TranscribeAudioInput): Promise<TranscribeAudioOutput> {
  if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) {
    throw new Error("Azure Speech Service not configured");
  }

  // Convert data URI to buffer
  const [header, base64Data] = input.audioDataUri.split(',');
  const audioBuffer = Buffer.from(base64Data, 'base64');

  const language = input.language || 'en-US';
  const endpoint = `https://${process.env.AZURE_SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`;

  const response = await fetch(`${endpoint}?language=${language}`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY,
      'Content-Type': 'audio/wav',
      'Accept': 'application/json',
    },
    body: audioBuffer,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Azure Speech API error (${response.status}): ${error}`);
  }

  const result = await response.json();
  
  if (result.RecognitionStatus !== 'Success') {
    throw new Error(`Azure transcription failed: ${result.RecognitionStatus}`);
  }

  return {
    transcription: result.DisplayText,
    provider: "azure",
    confidence: result.Confidence,
  };
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: ProviderConfig,
  providerName: string
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if error is retryable
      const isRetryable = 
        error?.status === 503 ||
        error?.status === 429 ||
        error?.status === 502 ||
        error?.status === 504 ||
        error?.message?.includes("overloaded") ||
        error?.message?.includes("timeout") ||
        error?.message?.includes("network");

      if (attempt === config.maxRetries - 1 || !isRetryable) {
        throw error;
      }

      const delay = Math.min(
        config.baseDelay * Math.pow(2, attempt),
        config.maxDelay
      );
      
      console.log(`${config.name} attempt ${attempt + 1} failed, retrying in ${delay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

async function transcribeWithProvider(
  provider: string,
  input: TranscribeAudioInput
): Promise<TranscribeAudioOutput> {
  const config = PROVIDER_CONFIGS[provider];
  const breaker = circuitBreakers[provider as keyof typeof circuitBreakers];
  
  if (!config.enabled) {
    throw new Error(`Provider ${provider} is not enabled or configured`);
  }
  
  if (breaker && !breaker.canExecute()) {
    throw new Error(`Provider ${provider} is temporarily disabled due to repeated failures`);
  }

  try {
    let result: TranscribeAudioOutput;
    
    switch (provider) {
      case 'google':
        result = await retryWithBackoff(() => transcribeWithGoogle(input), config, provider);
        break;
      case 'openai':
        result = await retryWithBackoff(() => transcribeWithOpenAI(input), config, provider);
        break;
      case 'azure':
        result = await retryWithBackoff(() => transcribeWithAzure(input), config, provider);
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
    
    if (breaker) breaker.onSuccess();
    return result;
    
  } catch (error) {
    if (breaker) breaker.onFailure();
    throw error;
  }
}

export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioOutput> {
  const providers = input.preferredProvider === 'auto' 
    ? ['google', 'openai', 'azure']
    : [input.preferredProvider!, 'google', 'openai', 'azure'].filter((p, i, arr) => arr.indexOf(p) === i);

  const enabledProviders = providers.filter(p => PROVIDER_CONFIGS[p]?.enabled);
  
  if (enabledProviders.length === 0) {
    throw new Error("No transcription providers are available or configured");
  }

  let lastError: any;
  const failedProviders: string[] = [];

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
      
      console.warn(`${PROVIDER_CONFIGS[provider].name} transcription failed:`, error.message);
      
      // If this is the last provider, don't continue
      if (provider === enabledProviders[enabledProviders.length - 1]) {
        break;
      }
      
      // Add a brief delay before trying the next provider
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // All providers failed
  console.error(`All transcription providers failed: ${failedProviders.join(', ')}`);
  
  // Throw a user-friendly error based on the types of failures
  if (failedProviders.includes('google') && lastError?.message?.includes('overloaded')) {
    throw new Error(
      `All transcription services are currently experiencing issues. Google AI is overloaded and backup services also failed. Please try again in a few minutes.`
    );
  }
  
  throw new Error(
    `Transcription failed with all available providers (${failedProviders.join(', ')}). Please try again later or contact support.`
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