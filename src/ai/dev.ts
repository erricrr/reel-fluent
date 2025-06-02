
import { config } from 'dotenv';
config();

import '@/ai/flows/transcription-feedback.ts';
import '@/ai/flows/transcribe-audio-resilient.ts';
import '@/ai/flows/compare-transcriptions-flow.ts';
import '@/ai/flows/translate-transcription-flow.ts'; // Added new flow
