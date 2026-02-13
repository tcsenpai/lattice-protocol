/**
 * SimHash Algorithm Implementation
 *
 * Locality-sensitive hashing for near-duplicate detection.
 * Uses 64-bit fingerprints and Hamming distance for similarity.
 */

import { SIMHASH_CONFIG } from '../../types/index.js';

const SHINGLE_SIZE = 3;

/**
 * Simple 64-bit hash function using FNV-1a style
 * @param str - Input string to hash
 * @returns 64-bit hash as bigint
 */
function hash64(str: string): bigint {
  let hash = 0xcbf29ce484222325n; // FNV offset basis
  const prime = 0x100000001b3n; // FNV prime

  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return hash;
}

/**
 * Generate shingles (n-grams) from text
 * @param text - Input text
 * @returns Array of shingles (3-character substrings)
 */
function getShingles(text: string): string[] {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.length < SHINGLE_SIZE) {
    return [normalized];
  }

  const shingles: string[] = [];
  for (let i = 0; i <= normalized.length - SHINGLE_SIZE; i++) {
    shingles.push(normalized.slice(i, i + SHINGLE_SIZE));
  }

  return shingles;
}

/**
 * Compute SimHash fingerprint for text
 *
 * Algorithm:
 * 1. Break text into shingles (3-grams)
 * 2. Hash each shingle to a 64-bit value
 * 3. For each bit position: sum +1 if bit is 1, -1 if bit is 0
 * 4. Final hash: for each position, if sum > 0, bit is 1, else 0
 *
 * @param text - Input text to fingerprint
 * @returns 64-bit SimHash as 16-character hex string
 */
export function computeSimHash(text: string): string {
  const shingles = getShingles(text);
  if (shingles.length === 0) {
    return '0'.repeat(16); // Return zero hash for empty text
  }

  // Initialize bit counters
  const bitCounts: number[] = new Array(64).fill(0);

  // Process each shingle
  for (const shingle of shingles) {
    const hash = hash64(shingle);

    // Update bit counters
    for (let i = 0; i < 64; i++) {
      if ((hash >> BigInt(i)) & 1n) {
        bitCounts[i]++;
      } else {
        bitCounts[i]--;
      }
    }
  }

  // Build final hash
  let result = 0n;
  for (let i = 0; i < 64; i++) {
    if (bitCounts[i] > 0) {
      result |= (1n << BigInt(i));
    }
  }

  // Return as hex string (16 chars for 64 bits)
  return result.toString(16).padStart(16, '0');
}

/**
 * Calculate Hamming distance between two SimHash values
 * Hamming distance = number of bit positions that differ
 *
 * @param hash1 - First SimHash (16-char hex string)
 * @param hash2 - Second SimHash (16-char hex string)
 * @returns Number of differing bits (0-64)
 */
export function hammingDistance(hash1: string, hash2: string): number {
  const h1 = BigInt('0x' + hash1);
  const h2 = BigInt('0x' + hash2);

  let xor = h1 ^ h2;
  let distance = 0;

  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }

  return distance;
}

/**
 * Calculate similarity between two SimHash values
 * Similarity = 1 - (hamming_distance / 64)
 *
 * @param hash1 - First SimHash
 * @param hash2 - Second SimHash
 * @returns Similarity score (0.0 to 1.0)
 */
export function similarity(hash1: string, hash2: string): number {
  const distance = hammingDistance(hash1, hash2);
  return 1 - (distance / SIMHASH_CONFIG.HASH_BITS);
}

/**
 * Check if two texts are similar based on their SimHash values
 * Uses the configured similarity threshold (default 95%)
 *
 * @param hash1 - First SimHash
 * @param hash2 - Second SimHash
 * @returns true if similarity >= SIMILARITY_THRESHOLD
 */
export function areSimilar(hash1: string, hash2: string): boolean {
  return similarity(hash1, hash2) >= SIMHASH_CONFIG.SIMILARITY_THRESHOLD;
}
