/**
 * Spam Detection Service
 *
 * Combines SimHash similarity, Shannon entropy, and account age
 * to detect and handle spam content. Target: <50ms processing time.
 */

import { computeSimHash, areSimilar, similarity } from './simhash.js';
import { calculateShannonEntropy, isLowEntropy } from './entropy.js';
import { getRecentSimHashes } from './repository.js';
import type { SpamCheckResult } from '../../types/index.js';

/**
 * Account age threshold in hours for stricter spam handling
 * Accounts younger than 24 hours get stricter treatment
 */
const NEW_ACCOUNT_HOURS = 24;

/**
 * Check content for spam using multiple detection methods
 *
 * Detection flow:
 * 1. Check entropy - reject extremely low entropy content immediately
 * 2. Compute SimHash fingerprint
 * 3. Compare against author's recent posts (24h window)
 * 4. Apply stricter rules for new accounts
 *
 * @param content - The text content to check
 * @param authorDid - The DID of the content author
 * @param accountAgeSeconds - Account age in seconds
 * @returns SpamCheckResult with detection details
 */
export function checkContent(
  content: string,
  authorDid: string,
  accountAgeSeconds: number
): SpamCheckResult {
  // Calculate content fingerprints
  const simhash = computeSimHash(content);
  const entropy = calculateShannonEntropy(content);

  // Check for low entropy (repetitive/garbage content)
  if (isLowEntropy(content)) {
    return {
      isSpam: true,
      reason: 'low_entropy',
      similarity: null,
      entropy,
      action: 'REJECT'
    };
  }

  // Check for duplicates in 24h window
  const recentHashes = getRecentSimHashes(authorDid);
  let maxSimilarity = 0;

  for (const { simhash: existingHash } of recentHashes) {
    const sim = similarity(simhash, existingHash);
    maxSimilarity = Math.max(maxSimilarity, sim);

    if (areSimilar(simhash, existingHash)) {
      // Check if new account (stricter for new accounts)
      const isNewAccount = accountAgeSeconds < (NEW_ACCOUNT_HOURS * 3600);

      return {
        isSpam: true,
        reason: isNewAccount ? 'new_account_spam' : 'duplicate',
        similarity: sim,
        entropy,
        action: isNewAccount ? 'REJECT' : 'QUARANTINE'
      };
    }
  }

  // Content passed all checks
  return {
    isSpam: false,
    reason: null,
    similarity: maxSimilarity > 0 ? maxSimilarity : null,
    entropy,
    action: 'PUBLISH'
  };
}

/**
 * Get the SimHash fingerprint for content
 * Used for storage alongside the post for future duplicate detection
 *
 * @param content - The text content to fingerprint
 * @returns 64-bit SimHash as hex string
 */
export function getContentSimHash(content: string): string {
  return computeSimHash(content);
}

/**
 * Quick check if content has low entropy
 * Can be used as a fast pre-filter before full spam check
 *
 * @param content - The text content to check
 * @returns true if content has low entropy
 */
export function hasLowEntropy(content: string): boolean {
  return isLowEntropy(content);
}

/**
 * Get entropy score for content
 *
 * @param content - The text content to analyze
 * @returns Shannon entropy in bits per character
 */
export function getEntropyScore(content: string): number {
  return calculateShannonEntropy(content);
}
