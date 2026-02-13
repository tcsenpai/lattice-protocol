/**
 * Spam Detection Service
 *
 * Combines SimHash similarity, Shannon entropy, and account age
 * to detect and handle spam content. Target: <50ms processing time.
 */

import { computeSimHash, areSimilar, similarity } from './simhash.js';
import { calculateShannonEntropy, isLowEntropy } from './entropy.js';
import {
  getRecentSimHashes,
  createSpamReport,
  getSpamReportCount,
  isSpamConfirmed,
  hasReported
} from './repository.js';
import { EXP_AMOUNTS, type SpamCheckResult, type SpamReport, type SpamVerdict } from '../../types/index.js';

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

/**
 * Report a post as spam
 *
 * @param postId - The ID of the post to report
 * @param reporterDid - The DID of the reporter
 * @param reason - The reason for the report
 * @returns The created spam report
 * @throws Error if reporter has already reported this post
 */
export function reportSpam(
  postId: string,
  reporterDid: string,
  reason: string
): SpamReport {
  // Check for duplicate report (defense in depth - DB also has constraint)
  if (hasReported(postId, reporterDid)) {
    throw new Error('Already reported this post');
  }

  return createSpamReport(postId, reporterDid, reason);
}

/**
 * Get spam verdict for a post
 *
 * @param postId - The ID of the post
 * @returns SpamVerdict with report count, confirmation status, and penalty
 */
export function getSpamVerdict(postId: string): SpamVerdict {
  const reportCount = getSpamReportCount(postId);
  const confirmed = reportCount >= 3;

  return {
    postId,
    reportCount,
    confirmed,
    penalty: confirmed ? Math.abs(EXP_AMOUNTS.SPAM_CONFIRMED) : 0
  };
}

/**
 * Check if spam is confirmed and get penalty info
 *
 * @param postId - The ID of the post
 * @returns Object with confirmation status, report count, and penalty
 */
export function checkConfirmedSpam(postId: string): {
  confirmed: boolean;
  reportCount: number;
  penalty: number;
} {
  const reportCount = getSpamReportCount(postId);
  const confirmed = isSpamConfirmed(postId);

  return {
    confirmed,
    reportCount,
    penalty: confirmed ? Math.abs(EXP_AMOUNTS.SPAM_CONFIRMED) : 0
  };
}
