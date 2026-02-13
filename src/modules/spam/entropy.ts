/**
 * Shannon Entropy Analyzer
 * Detects low-entropy text that may indicate spam or garbage content
 */

import { ENTROPY_CONFIG } from '../../types/index.js';

/**
 * Calculate Shannon entropy in bits per character
 *
 * Shannon entropy formula: H = -Σ p(x) * log2(p(x))
 * where p(x) is the probability of character x
 *
 * Typical values:
 * - "aaaa..." (single char): ~0 bits
 * - "abababab" (two chars): ~1 bit
 * - "Hello world" (natural text): ~3-4 bits
 * - Random bytes: ~8 bits (max for single-byte charset)
 */
export function calculateShannonEntropy(text: string): number {
  // Limit sample size for performance
  const sample = text.slice(0, ENTROPY_CONFIG.SAMPLE_SIZE);

  if (sample.length === 0) {
    return 0;
  }

  // Count character frequencies
  const frequencies = new Map<string, number>();
  for (const char of sample) {
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }

  // Calculate entropy
  let entropy = 0;
  const length = sample.length;

  for (const count of frequencies.values()) {
    const probability = count / length;
    if (probability > 0) {
      entropy -= probability * Math.log2(probability);
    }
  }

  return entropy;
}

/**
 * Check if text has low entropy (likely spam/garbage)
 * Returns true if entropy is below MIN_THRESHOLD (2.0 bits)
 */
export function isLowEntropy(text: string): boolean {
  return calculateShannonEntropy(text) < ENTROPY_CONFIG.MIN_THRESHOLD;
}

/**
 * Get entropy analysis result with metadata
 */
export function analyzeEntropy(text: string): {
  entropy: number;
  isLow: boolean;
  sampleSize: number;
} {
  const entropy = calculateShannonEntropy(text);
  return {
    entropy,
    isLow: entropy < ENTROPY_CONFIG.MIN_THRESHOLD,
    sampleSize: Math.min(text.length, ENTROPY_CONFIG.SAMPLE_SIZE)
  };
}
