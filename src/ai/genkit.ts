import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {anthropic} from 'genkitx-anthropic';

// Define and export model identifiers for consistent usage across flows
export const GEMINI_MODEL = 'googleai/gemini-2.0-flash';
export const CLAUDE_MODEL = 'claude-3-7-sonnet-20250219';

// Configure Genkit with both Google and Anthropic plugins
export const ai = genkit({
  plugins: [
    googleAI(),
    anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  ],
  // Default model used when a flow or prompt doesn't override
  model: GEMINI_MODEL,
});
