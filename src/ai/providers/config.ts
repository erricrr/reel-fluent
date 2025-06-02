/**
 * @fileOverview Shared provider configurations for AI services
 */

// Base provider configuration type
export interface ProviderConfig {
  name: string;
  enabled: boolean;
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  priority: number;
}

// Circuit breaker for provider health tracking
export class CircuitBreaker {
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

// Shared provider configurations
export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  google: {
    name: "Google AI",
    enabled: true,
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 15000,
    priority: 1, // Highest priority - always try first
  },
  anthropic: {
    name: "Anthropic",
    enabled: !!process.env.ANTHROPIC_API_KEY,
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 15000,
    priority: 2, // Second priority since you have credit
  },
  /* Temporarily disabled - may use later
  openai: {
    name: "OpenAI",
    enabled: !!process.env.OPENAI_API_KEY,
    maxRetries: 2, // Reduced retries since no credit
    baseDelay: 1000,
    maxDelay: 15000,
    priority: 3, // Lowest priority
  }
  */
};

// Shared circuit breakers
export const circuitBreakers = {
  google: new CircuitBreaker(5, 60000), // 1 minute timeout, more failures allowed
  // openai: new CircuitBreaker(), // Temporarily disabled
  anthropic: new CircuitBreaker(),
};

// Helper function for retrying with exponential backoff
export async function retryWithBackoff<T>(
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

      const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
      const isRetryable =
        error?.status === 503 ||
        error?.status === 429 ||
        error?.status === 502 ||
        error?.status === 504 ||
        message.includes("overloaded") ||
        message.includes("timeout") ||
        message.includes("network") ||
        message.includes("service unavailable") ||
        message.includes("503");

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

// Helper function to get providers in priority order
export function getProvidersInPriorityOrder(): string[] {
  return Object.entries(PROVIDER_CONFIGS)
    .sort(([, a], [, b]) => a.priority - b.priority)
    .map(([key]) => key);
}
