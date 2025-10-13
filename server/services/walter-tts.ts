/**
 * Walter Text-to-Speech Service - Phase 6.3
 * 
 * Provides audio output for Walter's responses using OpenAI TTS API
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ""
});

export interface TTSOptions {
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  speed?: number; // 0.25 to 4.0
  model?: 'tts-1' | 'tts-1-hd';
}

/**
 * Convert text to speech using OpenAI TTS
 */
export async function textToSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<Buffer> {
  const {
    voice = 'nova', // Natural, neutral voice
    speed = 1.0,
    model = 'tts-1' // Standard quality for faster response
  } = options;

  try {
    console.log(`[TTS] Generating audio for ${text.length} characters (voice: ${voice})`);
    
    const response = await openai.audio.speech.create({
      model,
      voice,
      input: text,
      speed,
    });

    // Convert response to buffer
    const buffer = Buffer.from(await response.arrayBuffer());
    
    console.log(`[TTS] Generated ${buffer.length} bytes of audio`);
    
    return buffer;
  } catch (error) {
    console.error('[TTS] Error generating speech:', error);
    throw new Error('Failed to generate speech');
  }
}

/**
 * Estimate TTS cost
 * OpenAI TTS pricing: $0.015 per 1K characters (tts-1)
 */
export function estimateTTSCost(text: string, model: 'tts-1' | 'tts-1-hd' = 'tts-1'): number {
  const charCount = text.length;
  const pricePerChar = model === 'tts-1' ? 0.000015 : 0.00003; // $0.015 or $0.030 per 1K chars
  return charCount * pricePerChar;
}

/**
 * Chunk long text for TTS (OpenAI has 4096 char limit)
 */
export function chunkTextForTTS(text: string, maxChars: number = 4000): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/); // Split on sentence boundaries
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChars) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        // Single sentence exceeds limit, force split
        chunks.push(sentence.slice(0, maxChars));
        currentChunk = sentence.slice(maxChars);
      }
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
