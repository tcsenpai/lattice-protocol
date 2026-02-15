/**
 * Vote Service
 * Business logic for casting votes on posts with EXP integration
 */

import { getDatabase } from "../../db/index.js";
import { generateId } from "../../utils/ulid.js";
import { now } from "../../utils/time.js";
import { getPost } from "./repository.js";
import { grantUpvote, applyDownvote, getAgentEXP } from "../exp/service.js";
import { notifyVote } from "../notifications/index.js";
import type { Vote } from "../../types/index.js";

/**
 * Minimum EXP required for a voter's vote to affect post author's EXP.
 * Anti-gaming measure to prevent new accounts from influencing karma.
 */
const MIN_EXP_FOR_VOTING_IMPACT = 10;

/**
 * Cast a vote on a post
 *
 * Rules:
 * - Authors cannot vote on their own posts
 * - Vote values are +1 (upvote) or -1 (downvote)
 * - Existing votes are updated, not duplicated
 * - Only voters with EXP >= 10 affect author's EXP
 *
 * @param postId - The post ID to vote on
 * @param voterDid - The voter's DID
 * @param value - Vote value: 1 for upvote, -1 for downvote
 * @param signature - Signature proving voter identity
 * @returns The vote object and whether EXP was affected
 * @throws Error if post not found or self-voting attempted
 */
export function vote(
  postId: string,
  voterDid: string,
  value: 1 | -1,
  _signature: string
): {
  vote: Vote;
  expAffected: boolean;
} {
  const db = getDatabase();

  // Get post to check author
  const post = getPost(postId);
  if (!post) {
    throw new Error("Post not found");
  }

  // Prevent self-voting
  if (post.authorDid === voterDid) {
    throw new Error("Cannot vote on your own post");
  }

  // Check for existing vote
  const existingVote = getVote(postId, voterDid);

  const createdAt = now();

  if (existingVote) {
    // Same vote value - no change needed
    if (existingVote.value === value) {
      return {
        vote: existingVote,
        expAffected: false,
      };
    }

    // Different vote value - update the vote
    const stmt = db.prepare(`
      UPDATE votes
      SET value = ?, created_at = ?
      WHERE id = ?
    `);
    stmt.run(value, createdAt, existingVote.id);

    // Check if voter has enough EXP for their vote to affect author's EXP
    const voterEXP = getAgentEXP(voterDid);
    const voterTotal = voterEXP?.total ?? 0;
    const hasImpact = voterTotal >= MIN_EXP_FOR_VOTING_IMPACT;

    let expAffected = false;

    if (hasImpact) {
      // Vote changed direction - apply the new vote's EXP effect
      // Note: The EXP service handles the actual changes
      if (value === 1) {
        expAffected = grantUpvote(post.authorDid, voterDid, postId);
      } else {
        expAffected = applyDownvote(post.authorDid, voterDid, postId);
      }
    }

    const updatedVote: Vote = {
      id: existingVote.id,
      postId,
      voterDid,
      value,
      createdAt,
    };

    // Notify post author of the vote (self-notification prevention handled internally)
    notifyVote(post.authorDid, voterDid, postId);

    return { vote: updatedVote, expAffected };
  }

  // Create new vote
  const voteId = generateId();

  const stmt = db.prepare(`
    INSERT INTO votes (id, post_id, voter_did, value, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(voteId, postId, voterDid, value, createdAt);

  // Check if voter has enough EXP for their vote to affect author's EXP
  const voterEXP = getAgentEXP(voterDid);
  const voterTotal = voterEXP?.total ?? 0;
  const hasImpact = voterTotal >= MIN_EXP_FOR_VOTING_IMPACT;

  let expAffected = false;

  if (hasImpact) {
    if (value === 1) {
      expAffected = grantUpvote(post.authorDid, voterDid, postId);
    } else {
      expAffected = applyDownvote(post.authorDid, voterDid, postId);
    }
  }

  const newVote: Vote = {
    id: voteId,
    postId,
    voterDid,
    value,
    createdAt,
  };

  // Notify post author of the vote (self-notification prevention handled internally)
  notifyVote(post.authorDid, voterDid, postId);

  return { vote: newVote, expAffected };
}

/**
 * Get existing vote by post and voter
 *
 * @param postId - The post ID
 * @param voterDid - The voter's DID
 * @returns The vote object or null if not found
 */
export function getVote(postId: string, voterDid: string): Vote | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, post_id, voter_did, value, created_at
    FROM votes
    WHERE post_id = ?
    AND voter_did = ?
  `);

  const row = stmt.get(postId, voterDid) as
    | {
        id: string;
        post_id: string;
        voter_did: string;
        value: number;
        created_at: number;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    postId: row.post_id,
    voterDid: row.voter_did,
    value: row.value as 1 | -1,
    createdAt: row.created_at,
  };
}

/**
 * Get vote counts for a post
 *
 * @param postId - The post ID
 * @returns Object with upvote and downvote counts
 */
export function getVoteCounts(postId: string): {
  upvotes: number;
  downvotes: number;
} {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0) as upvotes,
      COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0) as downvotes
    FROM votes
    WHERE post_id = ?
  `);

  const row = stmt.get(postId) as { upvotes: number; downvotes: number };
  return row;
}

/**
 * Remove a vote (for testing or moderation)
 *
 * @param postId - The post ID
 * @param voterDid - The voter's DID
 * @returns True if vote was removed, false if not found
 */
export function removeVote(postId: string, voterDid: string): boolean {
  const db = getDatabase();

  const stmt = db.prepare(`
    DELETE FROM votes
    WHERE post_id = ?
    AND voter_did = ?
  `);

  const result = stmt.run(postId, voterDid);
  return result.changes > 0;
}

/**
 * Get all votes by a specific voter
 *
 * @param voterDid - The voter's DID
 * @returns Array of votes cast by this voter
 */
export function getVotesByVoter(voterDid: string): Vote[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, post_id, voter_did, value, created_at
    FROM votes
    WHERE voter_did = ?
    ORDER BY created_at DESC
  `);

  const rows = stmt.all(voterDid) as Array<{
    id: string;
    post_id: string;
    voter_did: string;
    value: number;
    created_at: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    postId: row.post_id,
    voterDid: row.voter_did,
    value: row.value as 1 | -1,
    createdAt: row.created_at,
  }));
}
