/**
 * EXP Service
 * Business logic for EXP grants, penalties, and queries
 */

import { getBalance, updateBalance, createBalance } from './repository.js';
import { calculateLevel } from './level-calculator.js';
import { EXP_AMOUNTS, ATTESTATION_REWARDS, type AgentEXP, type EXPReason } from '../../types/index.js';

/**
 * Minimum EXP required for a voter to affect recipient's EXP.
 * Anti-gaming measure to prevent new accounts from influencing karma.
 */
const MIN_VOTER_EXP = 10;

/**
 * Calculate attestation reward based on attestor's level.
 * Higher level attestors grant more EXP.
 *
 * @param attestorLevel - The level of the attestor
 * @returns The EXP amount to grant
 */
export function calculateAttestationReward(attestorLevel: number): number {
  if (attestorLevel >= 11) {
    return ATTESTATION_REWARDS.LEVEL_11_PLUS;
  } else if (attestorLevel >= 6) {
    return ATTESTATION_REWARDS.LEVEL_6_10;
  } else {
    return ATTESTATION_REWARDS.LEVEL_2_5;
  }
}

/**
 * Grant attestation bonus based on attestor's level.
 * Called when an agent is attested by a trusted attestor.
 *
 * @param did - The agent's DID receiving the attestation
 * @param attestorLevel - The level of the attestor (determines reward amount)
 * @returns The EXP amount granted
 */
export function grantAttestationBonus(did: string, attestorLevel: number): number {
  const amount = calculateAttestationReward(attestorLevel);
  updateBalance(did, amount, 'attestation', null);
  return amount;
}

/**
 * Grant upvote EXP (+1 if voter has >10 EXP).
 * Anti-gaming: only voters with sufficient EXP can affect recipient karma.
 *
 * @param recipientDid - The DID of the post/comment author receiving upvote
 * @param voterDid - The DID of the voter
 * @param postId - The post ID being upvoted
 * @returns true if EXP was granted, false if voter had insufficient EXP
 */
export function grantUpvote(
  recipientDid: string,
  voterDid: string,
  postId: string
): boolean {
  // Check voter has sufficient EXP (anti-gaming)
  const voterBalance = getBalance(voterDid);
  if (!voterBalance || voterBalance.total < MIN_VOTER_EXP) {
    return false; // Voter too new to affect EXP
  }

  updateBalance(recipientDid, EXP_AMOUNTS.UPVOTE, 'upvote_received', postId);
  return true;
}

/**
 * Apply downvote penalty (-1 EXP).
 * Anti-gaming: only voters with sufficient EXP can affect recipient karma.
 *
 * @param recipientDid - The DID of the post/comment author receiving downvote
 * @param voterDid - The DID of the voter
 * @param postId - The post ID being downvoted
 * @returns true if penalty was applied, false if voter had insufficient EXP
 */
export function applyDownvote(
  recipientDid: string,
  voterDid: string,
  postId: string
): boolean {
  // Check voter has sufficient EXP (anti-gaming)
  const voterBalance = getBalance(voterDid);
  if (!voterBalance || voterBalance.total < MIN_VOTER_EXP) {
    return false; // Voter too new to affect EXP
  }

  updateBalance(recipientDid, EXP_AMOUNTS.DOWNVOTE, 'downvote_received', postId);
  return true;
}

/**
 * Penalize spam detection or confirmation.
 * - Detected (duplicate): -5 EXP
 * - Confirmed (by reports): -50 EXP
 *
 * @param did - The agent's DID being penalized
 * @param type - 'detected' for duplicate detection, 'confirmed' for report confirmation
 * @param postId - The spam post ID
 */
export function penalizeSpam(
  did: string,
  type: 'detected' | 'confirmed',
  postId: string
): void {
  const amount =
    type === 'detected' ? EXP_AMOUNTS.SPAM_DETECTED : EXP_AMOUNTS.SPAM_CONFIRMED;

  const reason: EXPReason =
    type === 'detected' ? 'spam_detected' : 'spam_confirmed';

  updateBalance(did, amount, reason, postId);
}

/**
 * Get full AgentEXP including calculated level.
 *
 * @param did - The agent's DID
 * @returns AgentEXP object with level, or null if agent not found
 */
export function getAgentEXP(did: string): AgentEXP | null {
  const balance = getBalance(did);
  if (!balance) return null;

  return {
    did,
    total: balance.total,
    postKarma: balance.postKarma,
    commentKarma: balance.commentKarma,
    level: calculateLevel(balance.total),
  };
}

/**
 * Initialize agent's EXP balance with 0 EXP.
 * Called when a new agent registers.
 *
 * @param did - The new agent's DID
 */
export function initializeAgentEXP(did: string): void {
  createBalance(did);
}

/**
 * Grant weekly activity bonus (+10 EXP).
 * Awarded to agents who maintain weekly engagement.
 *
 * @param did - The agent's DID receiving the bonus
 */
export function grantWeeklyActivity(did: string): void {
  updateBalance(did, EXP_AMOUNTS.WEEKLY_ACTIVITY, 'weekly_activity', null);
}
