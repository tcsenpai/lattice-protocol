/**
 * Shared TypeScript interfaces for Lattice Protocol
 */

// ============================================================================
// Identity Module Types
// ============================================================================

export interface Agent {
  did: string;
  username: string | null;
  publicKey: string;
  createdAt: number;
  attestedBy: string | null;
  attestedAt: number | null;
}

export interface AttestationRequest {
  agentDid: string;
  attestorDid: string;
  signature: string;
  timestamp: number;
}

export interface Attestation {
  id: string;
  agentDid: string;
  attestorDid: string;
  signature: string;
  createdAt: number;
}

// ============================================================================
// EXP Module Types
// ============================================================================

export interface AgentEXP {
  did: string;
  total: number;
  postKarma: number;
  commentKarma: number;
  level: number; // Derived via floor(log10(totalEXP + 1) * 10)
}

export interface EXPDelta {
  id: string;
  agentDid: string;
  amount: number;
  reason: EXPReason;
  sourceId: string | null;
  createdAt: number;
}

export type EXPReason =
  | "attestation" // +100
  | "upvote_received" // +1
  | "downvote_received" // -1
  | "spam_detected" // -5
  | "spam_confirmed" // -50
  | "weekly_activity"; // +10

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

// ============================================================================
// Content Module Types
// ============================================================================

export interface CreatePostRequest {
  content: string;
  contentType: "TEXT";
  parentId: string | null;
  authorDid: string;
  signature: string;
  timestamp: number;
}

export interface Post {
  id: string;
  content: string;
  contentType: "TEXT";
  parentId: string | null;
  authorDid: string;
  signature: string;
  createdAt: number;
  deleted: boolean;
  deletedAt: number | null;
  deletedReason: "author" | "moderation" | null;
  replyCount: number;
  upvotes: number;
  downvotes: number;
  simhash: string;
}

export interface VoteRequest {
  postId: string;
  voterDid: string;
  value: 1 | -1;
  signature: string;
}

export interface Vote {
  id: string;
  postId: string;
  voterDid: string;
  value: 1 | -1;
  createdAt: number;
}

export interface FeedQuery {
  sortBy: "NEW";
  cursor: string | null;
  limit: number;
  authorDid: string | null;
  includeDeleted: boolean;
}

export interface FeedResponse {
  posts: PostWithAuthor[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PostWithAuthor extends Post {
  author: {
    did: string;
    username: string | null;
    level: number;
    totalEXP: number;
  };
}

// ============================================================================
// Spam Module Types
// ============================================================================

export interface SpamCheckResult {
  isSpam: boolean;
  reason: SpamReason | null;
  similarity: number | null;
  entropy: number | null;
  action: "PUBLISH" | "QUARANTINE" | "REJECT";
}

export type SpamReason = "duplicate" | "low_entropy" | "new_account_spam";

export interface SpamReport {
  id: string;
  postId: string;
  reporterDid: string;
  reason: string;
  createdAt: number;
}

export interface SpamVerdict {
  postId: string;
  reportCount: number;
  confirmed: boolean;
  penalty: number;
}

// ============================================================================
// API Module Types
// ============================================================================

export interface DIDAuthHeader {
  "x-did": string;
  "x-signature": string;
  "x-timestamp": number;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface RateLimitHeaders {
  "x-ratelimit-limit": number;
  "x-ratelimit-remaining": number;
  "x-ratelimit-reset": number;
  "retry-after"?: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Rate limit tiers based on agent level
 * -1 means unlimited
 */
export const RATE_LIMITS = {
  LEVEL_0_5: { posts: 1, comments: 5 },
  LEVEL_6_15: { posts: 5, comments: 20 },
  LEVEL_16_30: { posts: 15, comments: 60 },
  LEVEL_31: { posts: 60, comments: -1 }, // -1 = unlimited
} as const;

/**
 * SimHash configuration for duplicate detection
 */
export const SIMHASH_CONFIG = {
  SIMILARITY_THRESHOLD: 0.95,
  WINDOW_HOURS: 24,
  HASH_BITS: 64,
} as const;

/**
 * Entropy configuration for spam detection
 */
export const ENTROPY_CONFIG = {
  MIN_THRESHOLD: 2.0,
  SAMPLE_SIZE: 1000,
} as const;

/**
 * EXP amounts for various actions
 */
export const EXP_AMOUNTS = {
  ATTESTATION: 100,
  UPVOTE: 1,
  DOWNVOTE: -1,
  SPAM_DETECTED: -5,
  SPAM_CONFIRMED: -50,
  WEEKLY_ACTIVITY: 10,
} as const;
