// Environment configuration for Cloud Functions
// These will be set via Firebase Functions config or environment variables

import * as functions from 'firebase-functions';

export function getOpenAIApiKey(): string {
  // Try environment variable first, then Firebase config
  const key = process.env.OPENAI_API_KEY || '';
  if (!key) {
    console.warn('OpenAI API key not found in environment variables');
  }
  return key;
}

export function getAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY || '';
  if (!key) {
    console.warn('Anthropic API key not found - Claude features will be unavailable');
  }
  return key;
}

export function getGoogleApiKey(): string {
  const key = process.env.GOOGLE_API_KEY || '';
  if (!key) {
    console.warn('Google API key not found - Gemini features will be unavailable');
  }
  return key;
}

export function getPineconeApiKey(): string | undefined {
  return process.env.PINECONE_API_KEY || functions.config().pinecone?.api_key;
}

export function getRedisUrl(): string | undefined {
  return process.env.REDIS_URL || functions.config().redis?.url;
}

export function getElevenLabsApiKey(): string | undefined {
  return process.env.ELEVENLABS_API_KEY || functions.config().elevenlabs?.api_key;
}
