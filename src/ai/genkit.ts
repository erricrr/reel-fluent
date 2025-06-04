import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {anthropic} from 'genkitx-anthropic';

// Define and export model identifiers for consistent usage across flows
export const GEMINI_MODEL = 'googleai/gemini-2.0-flash'; // Ensuring this is a valid and available Gemini model

// Determine Claude model based on API key presence
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
let resolvedClaudeModel: string;

if (ANTHROPIC_API_KEY) {
  // Try the other Sonnet model the user has access to
  resolvedClaudeModel = 'claude-3-7-sonnet-20250219';
  console.log(`✅ Genkit: ANTHROPIC_API_KEY found. Configuring Claude model as: ${resolvedClaudeModel}`);
} else {
  // Fallback to Gemini if Anthropic API key is not found
  resolvedClaudeModel = GEMINI_MODEL;
  console.warn(`⚠️  Genkit: ANTHROPIC_API_KEY not found. CLAUDE_MODEL will use GEMINI_MODEL (${GEMINI_MODEL}).`);
}
export const CLAUDE_MODEL = resolvedClaudeModel;

// Build plugins array based on available API keys
const plugins = [googleAI()];

// Only add Anthropic plugin if API key is available
if (ANTHROPIC_API_KEY) {
  plugins.push(anthropic({ apiKey: ANTHROPIC_API_KEY }));
  console.log('✅ Genkit: Anthropic plugin loaded.');
} else {
  console.warn('⚠️  Genkit: Anthropic plugin NOT loaded (ANTHROPIC_API_KEY not found). AI flows will rely on Google models.');
}

// Configure Genkit with available plugins
export const ai = genkit({
  plugins,
  // Default model used when a flow or prompt doesn't override
  model: GEMINI_MODEL, // Default to Gemini
});
